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

const ACCESS_TTL  = '1h';
const REFRESH_TTL = '30d';

export function signAccessToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, jwtRefreshSecret(), { expiresIn: REFRESH_TTL });
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

  // Re-fetch user so role changes are reflected in the new access token.
  const user = db.get('SELECT id, role FROM users WHERE id = ?', [payload.userId]);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    throw err;
  }

  const newAccessToken  = signAccessToken({ userId: user.id, role: user.role });
  const newRefreshToken = signRefreshToken({ userId: user.id, role: user.role });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
