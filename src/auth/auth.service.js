import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from './password.util.js';
import { logger } from '../lib/logger.js';

// ── Secrets ───────────────────────────────────────────────────────────────────

let _jwtSecret;
let _jwtRefreshSecret;

function resolveSecret(envKey) {
  const val = process.env[envKey];
  if (val) return val;

  // Auto-generate, persist to .env, and inject into process.env so the
  // generated value survives for the lifetime of this process and is reused
  // on next startup (loaded by config.js → loadDotEnv).
  const generated = crypto.randomBytes(32).toString('hex');
  process.env[envKey] = generated;

  try {
    const envPath = resolve('.env');
    // Only append if the key isn't already present (handles race conditions).
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
    if (!existing.split('\n').some(l => l.startsWith(`${envKey}=`))) {
      appendFileSync(envPath, `${envKey}=${generated}\n`);
    }
  } catch {
    // Filesystem not writable — value is still good for this session.
  }

  logger.info(`${envKey} was not set — generated and saved to .env automatically.`);
  return generated;
}

// Lazy-init so the warning fires at first use (after startup logs).
const jwtSecret        = () => (_jwtSecret        ??= resolveSecret('JWT_SECRET'));
const jwtRefreshSecret = () => (_jwtRefreshSecret ??= resolveSecret('JWT_REFRESH_SECRET'));

// ── Token helpers ─────────────────────────────────────────────────────────────

// Thresholds enforced by both the server and the settings UI.
export const ACCESS_TTL_MIN_MINUTES  = 5;
export const REFRESH_TTL_MIN_MINUTES = 120; // 2 h
export const REFRESH_TTL_MULTIPLIER  = 2;   // refresh must be >= 2× access

function getAccessTTL() {
  const minutes = Number(process.env.ROTIFEX_ACCESS_TOKEN_TTL) || 60;
  return `${Math.max(minutes, ACCESS_TTL_MIN_MINUTES)}m`;
}

function getRefreshTTL() {
  const accessMinutes  = Number(process.env.ROTIFEX_ACCESS_TOKEN_TTL)  || 60;
  const refreshMinutes = Number(process.env.ROTIFEX_REFRESH_TOKEN_TTL) || 43200;
  const minRefresh = Math.max(REFRESH_TTL_MIN_MINUTES, accessMinutes * REFRESH_TTL_MULTIPLIER);
  return `${Math.max(refreshMinutes, minRefresh)}m`;
}

export function signAccessToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: getAccessTTL() });
}

export function signRefreshToken(payload) {
  // jti (JWT ID) uniquely identifies this token so it can be individually revoked.
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, jwtRefreshSecret(), { expiresIn: getRefreshTTL() });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret());
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, jwtRefreshSecret());
}

// ── Schema bootstrap ──────────────────────────────────────────────────────────

/**
 * Ensure the `password_hash` column exists on the users table.
 * Managed outside the schema engine so it never appears in the model builder.
 */
export function ensureAuthSchema(db) {
  try {
    db.run('ALTER TABLE users ADD COLUMN password_hash TEXT');
  } catch {
    // Column already exists — safe to ignore.
  }
}

/**
 * Ensure the `_revoked_tokens` table exists for refresh token revocation.
 */
export function ensureTokenBlacklist(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _revoked_tokens (
      jti        TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    );
  `);
}

function revokeToken(db, jti, expiresAt) {
  try {
    db.run('INSERT OR IGNORE INTO _revoked_tokens (jti, expires_at) VALUES (?, ?)', [jti, expiresAt]);
  } catch {
    // ignore
  }
}

function isTokenRevoked(db, jti) {
  if (!jti) return false;
  const row = db.get('SELECT jti FROM _revoked_tokens WHERE jti = ?', [jti]);
  return !!row;
}

// ── Input validation ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrationInput({ email, password }) {
  const errors = [];

  if (!email || !EMAIL_RE.test(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  } else {
    if (!/[a-zA-Z]/.test(password)) errors.push('Password must contain at least one letter.');
    if (!/[0-9]/.test(password))    errors.push('Password must contain at least one number.');
  }

  return errors; // empty array = valid
}

// ── Business logic ────────────────────────────────────────────────────────────

export async function registerUser(db, { email, password, display_name, role = 'user' }) {
  const existing = db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    const err = new Error('Email already in use');
    err.statusCode = 409;
    throw err;
  }

  const password_hash = await hashPassword(password);
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO users (id, email, display_name, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, email, display_name || null, role, password_hash, now, now],
  );

  return { id, email, display_name: display_name || null, role, created_at: now };
}

export async function loginUser(db, { email, password }) {
  const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  if (!user.password_hash) {
    const err = new Error('No password set for this account. Use the admin panel to set one.');
    err.statusCode = 401;
    throw err;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const tokenPayload = { userId: user.id, role: user.role };
  const accessToken  = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role },
  };
}

export function getCurrentUser(db, userId) {
  return db.get(
    'SELECT id, email, display_name, role, created_at FROM users WHERE id = ?',
    [userId],
  );
}

export async function refreshTokens(db, refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  // Reject if this specific token has been revoked (logout / rotation).
  if (payload.jti && isTokenRevoked(db, payload.jti)) {
    const err = new Error('Refresh token has been revoked');
    err.statusCode = 401;
    throw err;
  }

  // Re-fetch user so role changes are reflected in the new access token.
  const user = db.get('SELECT id, role FROM users WHERE id = ?', [payload.userId]);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    throw err;
  }

  // Revoke the consumed refresh token (token rotation — each token is one-use).
  if (payload.jti) {
    revokeToken(db, payload.jti, new Date(payload.exp * 1000).toISOString());
  }

  const newAccessToken  = signAccessToken({ userId: user.id, role: user.role });
  const newRefreshToken = signRefreshToken({ userId: user.id, role: user.role });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(db, refreshToken) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    if (payload.jti) {
      revokeToken(db, payload.jti, new Date(payload.exp * 1000).toISOString());
    }
  } catch {
    // Token already invalid/expired — nothing to revoke, treat as success.
  }
}

export async function changePassword(db, userId, { currentPassword, newPassword }) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (!user.password_hash) {
    const err = new Error('No password set for this account');
    err.statusCode = 400;
    throw err;
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    throw err;
  }

  if (!newPassword || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters');
    err.statusCode = 400;
    throw err;
  }
  if (!/[a-zA-Z]/.test(newPassword)) {
    const err = new Error('New password must contain at least one letter');
    err.statusCode = 400;
    throw err;
  }
  if (!/[0-9]/.test(newPassword)) {
    const err = new Error('New password must contain at least one number');
    err.statusCode = 400;
    throw err;
  }

  const password_hash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [password_hash, now, userId]);
}
