import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import { registerPlugins } from './plugins.js';
import { registerRequestLogger } from './middleware/requestLogger.js';
import { registerErrorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { fileRoutes } from './routes/files.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from '../auth/auth.routes.js';
import { aiRoutes } from '../ai/ai.routes.js';
import { agentRoutes } from '../ai/agent.routes.js';
import { registerJwtMiddleware } from '../auth/jwt.middleware.js';
import { getDatabase } from '../db/index.js';
import { bootstrapEngine } from '../engine/index.js';
import { StorageManager } from '../storage/index.js';
import { logBufferStream } from '../lib/logBuffer.js';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/**
 * Create and configure a Fastify server instance.
 *
 * @param {object} config  Merged Rotifex config (from `loadConfig()`).
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function createServer(config) {
  // ── Ensure storage directories exist BEFORE plugin registration ────
  for (const dir of [config.storage?.publicDir, config.storage?.privateDir]) {
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const app = Fastify({
    logger: {
      level: config.logging.level,
      stream: {
        write(msg) {
          // Only feed the in-memory buffer (admin Logs page).
          // Nothing goes to the terminal — startup messages use the chalk
          // logger directly and are already printed there.
          logBufferStream.write(msg);
        },
      },
    },
    disableRequestLogging: true,
  });

  // ── Plugins ─────────────────────────────────────────────────────────
  await registerPlugins(app, config);

  // ── Middleware ───────────────────────────────────────────────────────
  registerRequestLogger(app);
  registerErrorHandler(app);
  registerJwtMiddleware(app);   // verifies Bearer tokens, injects x-user-id / x-user-role

  // ── Routes ──────────────────────────────────────────────────────────
  await app.register(healthRoutes);

  // ── Database + Auth (auth routes registered before engine so /auth/* ─
  // ── is a concrete path and always wins over parametric /api/:table)  ─
  const db = getDatabase();
  await app.register(authRoutes, { db });

  // ── Dynamic REST Engine ─────────────────────────────────────────────
  bootstrapEngine(app, db);

  // ── File Storage ────────────────────────────────────────────────────
  const storage = new StorageManager(db, config.storage);
  storage.init();
  await app.register(fileRoutes, { storage, config });

  // ── AI Routes ───────────────────────────────────────────────────────
  await app.register(aiRoutes);
  await app.register(agentRoutes, { db });

  // ── Admin API ───────────────────────────────────────────────────────
  await app.register(adminRoutes, { db });

  // ── SPA (served at /) ────────────────────────────────────────────────
  const adminDist = resolve('admin/dist');
  if (existsSync(adminDist)) {
    const fastifyStatic = (await import('@fastify/static')).default;
    await app.register(fastifyStatic, {
      root:    adminDist,
      prefix:  '/',
      wildcard: false,
    });
    logger.success('Dashboard is live at / — go click things!');
  } else {
    logger.warn('Admin dashboard not built yet. Run "npm run build:admin" first.');
  }

  // ── 404 handler ──────────────────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Rotifex</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f6f8; color: #1a1d23;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .box {
      text-align: center; padding: 48px 40px; background: #fff;
      border: 1px solid #e2e5ea; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06); max-width: 420px; width: 100%;
    }
    .code { font-size: 72px; font-weight: 800; color: #4f6ef7; letter-spacing: -2px; line-height: 1; }
    .title { font-size: 20px; font-weight: 600; margin: 12px 0 8px; }
    .path {
      font-family: 'SF Mono', monospace; font-size: 13px;
      background: #f3f4f6; color: #6b7280; padding: 4px 10px;
      border-radius: 4px; display: inline-block; margin-bottom: 28px;
    }
    a {
      display: inline-block; padding: 10px 24px; background: #4f6ef7;
      color: #fff; text-decoration: none; border-radius: 8px;
      font-size: 14px; font-weight: 500; transition: background 0.15s;
    }
    a:hover { background: #3b5de7; }
  </style>
</head>
<body>
  <div class="box">
    <div class="code">404</div>
    <div class="title">Nothing here</div>
    <div class="path">${request.url}</div>
    <a href="/">← Back to Dashboard</a>
  </div>
</body>
</html>`);
  });

  logger.success('File storage is up — ready to hoard your files.');

  return app;
}
