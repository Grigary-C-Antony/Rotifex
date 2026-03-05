import { resolve } from 'node:path';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';

/**
 * Auto-register all Fastify plugins.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} config  Merged Rotifex config.
 */
export async function registerPlugins(app, config) {
  // ── CORS ──────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.cors.origin,
  });

  // ── Rate Limiting ─────────────────────────────────────────────────
  await app.register(rateLimit, {
    max:        config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // ── Multipart (file uploads) ──────────────────────────────────────
  const maxFileSize = (config.storage?.maxFileSizeMB || 10) * 1024 * 1024;
  await app.register(multipart, {
    limits: { fileSize: maxFileSize },
  });

  // ── Static file serving (public uploads) ──────────────────────────
  const publicDir = resolve(config.storage?.publicDir || 'storage/public');
  await app.register(staticPlugin, {
    root:       publicDir,
    prefix:     '/storage/public/',
    decorateReply: false,
  });
}
