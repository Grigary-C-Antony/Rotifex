import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSchema, parseModelDef } from './schemaLoader.js';
import { syncTables } from './tableSync.js';
import { registerGenericRoutes } from './routeFactory.js';
import { initStore, upsertModel } from './schemaStore.js';
import { logger } from '../lib/logger.js';

/**
 * Built-in system models that are always guaranteed to exist.
 * These are written to schema.json on first boot if absent.
 */
const SYSTEM_MODELS = {
  User: {
    fields: {
      email:        { type: 'string', required: true, unique: true },
      display_name: { type: 'string' },
      role:         { type: 'string', default: 'user' },
    },
  },
};

/**
 * Ensure system models exist in schema.json and the in-memory store.
 * Idempotent — only adds what's missing, never overwrites existing.
 */
function ensureSystemModels(schemaPath) {
  const abs = resolve(schemaPath);
  let schema = {};
  if (existsSync(abs)) {
    try { schema = JSON.parse(readFileSync(abs, 'utf-8')); } catch {}
  }

  let changed = false;
  for (const [name, def] of Object.entries(SYSTEM_MODELS)) {
    if (!schema[name]) {
      schema[name] = def;
      changed = true;
    }
  }

  if (changed) writeFileSync(abs, JSON.stringify(schema, null, 2));
}

/**
 * Bootstrap the dynamic REST engine.
 *
 * 1. Ensure system models (User) exist in schema.json
 * 2. Load all model definitions into the in-memory store
 * 3. Auto-create DB tables (idempotent)
 * 4. Register five generic /api/:table routes
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../db/adapters/base.js').DatabaseAdapter} db
 * @param {string} [schemaPath]
 */
export function bootstrapEngine(app, db, schemaPath = 'schema.json') {
  ensureSystemModels(schemaPath);

  const models = loadSchema(schemaPath);

  initStore(models);
  syncTables(db, models);
  registerGenericRoutes(app, db);

  logger.success(
    `Woke up ${models.size} model(s) and they're ready to party: ${[...models.keys()].join(', ')}`,
  );
}

export { loadSchema, parseModelDef } from './schemaLoader.js';
export { syncTables } from './tableSync.js';
export { registerGenericRoutes } from './routeFactory.js';
export { buildValidators } from './zodFactory.js';
export { buildListQuery } from './queryBuilder.js';
export { initStore, getStore, getModelByTable, upsertModel, removeModel } from './schemaStore.js';
