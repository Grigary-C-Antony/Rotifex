import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSchema, parseModelDef } from '../../engine/schemaLoader.js';
import { getProviders } from '../../ai/ai.config.js';
import { listAgents } from '../../ai/agents.config.js';
import { getUsageSummary } from '../../ai/ai.usage.js';
import { upsertModel, removeModel } from '../../engine/schemaStore.js';
import { syncTables } from '../../engine/tableSync.js';
import { getLogs } from '../../lib/logBuffer.js';
import { registerUser, validateRegistrationInput } from '../../auth/auth.service.js';
import { hashPassword } from '../../auth/password.util.js';

// ── .env file helpers ─────────────────────────────────────────────────────────

function readEnvFile() {
  const abs = resolve('.env');
  if (!existsSync(abs)) return {};
  const vars = {};
  for (const line of readFileSync(abs, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
  }
  return vars;
}

function writeEnvFile(vars) {
  const lines = Object.entries(vars)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${String(v).includes(' ') ? `"${v}"` : v}`);
  writeFileSync(resolve('.env'), lines.join('\n') + '\n');
}

/**
 * Admin-only API routes, registered under `/admin/api`.
 *
 * All routes are guarded by an `onRequest` hook that checks
 * `x-user-role: admin`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('../../db/adapters/base.js').DatabaseAdapter }} opts
 */
export async function adminRoutes(app, { db }) {

  // ── Admin guard ─────────────────────────────────────────────────────
  app.addHook('onRequest', async (request, reply) => {
    const role = request.headers['x-user-role'];
    if (role !== 'admin') {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
        statusCode: 403,
      });
    }
  });

  // ── GET /admin/api/schema ─────────────────────────────────────────
  app.get('/admin/api/schema', () => {
    const models = loadSchema();
    const result = {};
    for (const [name, model] of models) {
      result[name] = model;
    }
    return { data: result };
  });

  // ── GET /admin/api/stats ──────────────────────────────────────────
  app.get('/admin/api/stats', async () => {
    const models = loadSchema();
    const modelStats = [];

    for (const [name, model] of models) {
      const row = await db.get(`SELECT COUNT(*) AS count FROM ${model.tableName}`);
      modelStats.push({
        model: name,
        table: model.tableName,
        count: Number(row?.count ?? 0),
      });
    }

    // User stats
    let userCount = 0;
    try {
      const userRow = await db.get('SELECT COUNT(*) AS count FROM users');
      userCount = Number(userRow?.count ?? 0);
    } catch {}

    // File stats
    let fileCount = 0;
    let storageBytes = 0;
    try {
      const fileRow = await db.get('SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total FROM _files');
      fileCount    = Number(fileRow?.count ?? 0);
      storageBytes = Number(fileRow?.total ?? 0);
    } catch {
      // _files table may not exist yet
    }

    // AI stats
    const providers    = getProviders();
    const connectedLLMs = Object.values(providers).filter(p => p.enabled && p.apiKey).length;
    const enabledLLMs   = Object.values(providers).filter(p => p.enabled).length;
    const providerList  = Object.entries(providers)
      .filter(([, p]) => p.enabled)
      .map(([id, p]) => ({ id, label: p.label, hasKey: !!p.apiKey }));

    const agentList  = listAgents();
    const usageSummary = getUsageSummary();

    return {
      data: {
        models: modelStats,
        users: { count: userCount },
        files: { count: fileCount, storageMB: +(storageBytes / 1024 / 1024).toFixed(2) },
        uptime: process.uptime(),
        ai: {
          connectedLLMs,
          enabledLLMs,
          providers: providerList,
          agentsCount: agentList.length,
          agents: agentList.map(a => ({ id: a.id, name: a.name, provider: a.provider, model: a.model, tools: a.tools })),
          usage: usageSummary,
        },
      },
    };
  });

  // ── GET /admin/api/logs ───────────────────────────────────────────
  app.get('/admin/api/logs', (request) => {
    const { after, level } = request.query;
    return getLogs({
      after: after ? Number(after) : undefined,
      level: level || undefined,
    });
  });

  const RESERVED = new Set(['user', 'users', '_files', 'files']);
  const SYSTEM_MODELS = new Set(['User']);

  // ── POST /admin/api/schema — create or replace a model ───────────
  app.post('/admin/api/schema', async (request, reply) => {
    const { name, fields } = request.body || {};
    if (!name || !fields || typeof fields !== 'object') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'name (string) and fields (object) are required',
        statusCode: 400,
      });
    }

    if (RESERVED.has(name.toLowerCase())) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `"${name}" is a reserved name and cannot be used as a model.`,
        statusCode: 400,
      });
    }

    // 1. Persist to schema.json
    const schemaPath = resolve('schema.json');
    let schema = {};
    if (existsSync(schemaPath)) {
      try { schema = JSON.parse(readFileSync(schemaPath, 'utf-8')); } catch {}
    }

    if (schema[name]) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `Model "${name}" already exists. Delete it first if you want to redefine it.`,
        statusCode: 409,
      });
    }

    schema[name] = { fields };
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    // 2. Parse into normalised model definition
    const modelDef = parseModelDef(name, { fields });

    // 3. Create DB table if it doesn't exist yet (idempotent)
    await syncTables(db, new Map([[name, modelDef]]));

    // 4. Add to live store — routes are active immediately
    upsertModel(name, modelDef);

    return reply.status(201).send({
      data: { name, tableName: modelDef.tableName, fields: modelDef.fields },
      message: `Model "${name}" is live. Routes /${modelDef.tableName} are active now.`,
    });
  });

  // ── DELETE /admin/api/schema/:name — remove a model ──────────────
  app.delete('/admin/api/schema/:name', (request, reply) => {
    const { name } = request.params;
    const schemaPath = resolve('schema.json');
    let schema = {};
    if (existsSync(schemaPath)) {
      try { schema = JSON.parse(readFileSync(schemaPath, 'utf-8')); } catch {}
    }

    if (SYSTEM_MODELS.has(name)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `"${name}" is a system model and cannot be deleted.`,
        statusCode: 400,
      });
    }

    if (!schema[name]) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Model "${name}" not found`,
        statusCode: 404,
      });
    }

    // 1. Remove from schema.json
    delete schema[name];
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    // 2. Remove from live store — routes stop resolving immediately
    removeModel(name);

    return reply.status(204).send();
  });

  // ── POST /admin/api/users — create user with hashed password ──────
  app.post('/admin/api/users', async (request, reply) => {
    const { email, password, display_name, role } = request.body || {};

    const errors = validateRegistrationInput({ email: email ?? '', password: password ?? '' });
    if (errors.length) {
      return reply.status(400).send({ error: 'Validation Error', message: errors, statusCode: 400 });
    }

    try {
      const user = await registerUser(db, { email, password, display_name, role: role || 'user' });
      return reply.status(201).send({ data: user, message: 'User created successfully' });
    } catch (e) {
      return reply.status(e.statusCode ?? 500).send({
        error: 'User creation failed',
        message: e.message,
        statusCode: e.statusCode ?? 500,
      });
    }
  });

  // ── PUT /admin/api/users/:id/password — admin reset a user's password ─
  app.put('/admin/api/users/:id/password', async (request, reply) => {
    const { id } = request.params;
    const { password } = request.body || {};

    if (!password || password.length < 8) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters',
        statusCode: 400,
      });
    }

    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    }

    const password_hash = await hashPassword(password);
    const now = new Date().toISOString();
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [password_hash, now, id]);

    return reply.status(204).send();
  });

  // ── GET /admin/api/env — read current .env values ─────────────────
  app.get('/admin/api/env', () => {
    const fileVars = readEnvFile();
    // Merge: file values take precedence over process.env for display,
    // but fall back to process.env so already-set vars are visible too.
    const merged = {};
    for (const key of ENV_KEYS) {
      merged[key] = fileVars[key] ?? process.env[key] ?? '';
    }
    return { data: merged };
  });

  // ── POST /admin/api/env — write .env file ─────────────────────────
  app.post('/admin/api/env', (request, reply) => {
    const incoming = request.body?.vars;
    if (!incoming || typeof incoming !== 'object') {
      return reply.status(400).send({ error: 'Bad Request', message: 'vars (object) is required', statusCode: 400 });
    }

    // Only allow known keys — never let arbitrary keys be written
    const existing = readEnvFile();
    for (const key of ENV_KEYS) {
      if (incoming[key] !== undefined) {
        if (incoming[key] === '') {
          delete existing[key]; // empty = remove the key
        } else {
          existing[key] = incoming[key];
        }
      }
    }

    writeEnvFile(existing);
    return { message: 'Environment saved. Restart the server for changes to take effect.' };
  });
}

// Keys the settings UI is allowed to read/write.
const ENV_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ROTIFEX_ACCESS_TOKEN_TTL',
  'ROTIFEX_REFRESH_TOKEN_TTL',
  'ROTIFEX_PORT',
  'ROTIFEX_HOST',
  'ROTIFEX_CORS_ORIGIN',
  'ROTIFEX_RATE_LIMIT_MAX',
  'ROTIFEX_LOG_LEVEL',
  'ROTIFEX_STORAGE_MAX_FILE_SIZE_MB',
  'ROTIFEX_STORAGE_SIGNED_URL_SECRET',
  'ROTIFEX_DATABASE_URL',
];
