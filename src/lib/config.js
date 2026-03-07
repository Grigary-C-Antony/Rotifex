import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package root — used to locate files shipped inside the package (config.default.json)
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a .env file and inject any missing keys into process.env.
 * Existing process.env values are never overwritten (env vars take priority).
 */
function loadDotEnv() {
  const abs = resolve('.env');
  if (!existsSync(abs)) return;
  for (const line of readFileSync(abs, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

/**
 * Three-tier config loader:
 *   1. config.default.json  (shipped defaults — always present)
 *   2. config.json          (optional user overrides — gitignored)
 *   3. Environment variables (highest priority)
 *
 * Usage:
 *   import { loadConfig } from '../lib/config.js';
 *   const cfg = loadConfig();
 */

/**
 * Deep-merge `source` into `target` (mutates `target`).
 * Arrays are replaced, not concatenated.
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Read and parse a JSON file. Returns `{}` if the file does not exist.
 * @param {string} filepath
 */
function readJSON(filepath) {
  const abs = resolve(filepath);
  if (!existsSync(abs)) return {};
  return JSON.parse(readFileSync(abs, 'utf-8'));
}

/**
 * Apply environment-variable overrides to the config object.
 */
function applyEnvOverrides(config) {
  const env = process.env;

  if (env.ROTIFEX_HOST)           config.server.host          = env.ROTIFEX_HOST;
  if (env.ROTIFEX_PORT)           config.server.port          = Number(env.ROTIFEX_PORT);
  if (env.ROTIFEX_CORS_ORIGIN)    config.cors.origin          = env.ROTIFEX_CORS_ORIGIN;
  if (env.ROTIFEX_RATE_LIMIT_MAX) config.rateLimit.max        = Number(env.ROTIFEX_RATE_LIMIT_MAX);
  if (env.ROTIFEX_LOG_LEVEL)      config.logging.level        = env.ROTIFEX_LOG_LEVEL;

  // Storage overrides
  if (env.ROTIFEX_STORAGE_MAX_FILE_SIZE_MB) {
    config.storage = config.storage || {};
    config.storage.maxFileSizeMB = Number(env.ROTIFEX_STORAGE_MAX_FILE_SIZE_MB);
  }
  if (env.ROTIFEX_STORAGE_SIGNED_URL_SECRET) {
    config.storage = config.storage || {};
    config.storage.signedUrlSecret = env.ROTIFEX_STORAGE_SIGNED_URL_SECRET;
  }

  // JWT auth secrets and token TTLs — read directly by auth.service.js via
  // process.env, exposed here only so config introspection tools can see them.
  if (env.JWT_SECRET)                  { config.auth = config.auth || {}; config.auth.jwtSecret         = env.JWT_SECRET; }
  if (env.JWT_REFRESH_SECRET)          { config.auth = config.auth || {}; config.auth.jwtRefreshSecret  = env.JWT_REFRESH_SECRET; }
  if (env.ROTIFEX_ACCESS_TOKEN_TTL)    { config.auth = config.auth || {}; config.auth.accessTokenTTL    = Number(env.ROTIFEX_ACCESS_TOKEN_TTL); }
  if (env.ROTIFEX_REFRESH_TOKEN_TTL)   { config.auth = config.auth || {}; config.auth.refreshTokenTTL   = Number(env.ROTIFEX_REFRESH_TOKEN_TTL); }

  // Database — external connection string overrides the default SQLite file.
  if (env.ROTIFEX_DATABASE_URL) config.databaseUrl = env.ROTIFEX_DATABASE_URL;

  return config;
}

/**
 * Load the merged configuration.
 *
 * @param {{ cliOverrides?: Record<string, unknown> }} [opts]
 * @returns {object}
 */
export function loadConfig(opts = {}) {
  // config.default.json lives inside the package — resolve from package dir
  const defaults  = readJSON(join(__dirname, '../../config.default.json'));
  // config.json is the user's override — resolve from their working directory
  const userConf  = readJSON('config.json');
  const merged    = deepMerge(deepMerge({}, defaults), userConf);

  // CLI flags (e.g. --port) take priority over file config but below env vars
  if (opts.cliOverrides) {
    deepMerge(merged, opts.cliOverrides);
  }

  return applyEnvOverrides(merged);
}
