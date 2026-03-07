import { registerUser, validateRegistrationInput, ensureAuthSchema } from '../../auth/auth.service.js';

/**
 * First-run setup routes — registered under the root prefix.
 *
 * Endpoints:
 *   GET  /setup/status  — returns { needsSetup: boolean }
 *   POST /setup         — creates the one-and-only admin account
 *
 * POST /setup rejects with 409 once any admin exists, so it can only
 * ever be used once. No auth required (chicken-and-egg on first run).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('../../db/adapters/base.js').DatabaseAdapter }} opts
 */
export async function setupRoutes(app, { db }) {

  async function adminExists() {
    try {
      const row = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      return !!row;
    } catch {
      return false;
    }
  }

  // ── GET /setup/status ─────────────────────────────────────────────
  app.get('/setup/status', async () => {
    return { needsSetup: !(await adminExists()) };
  });

  // ── POST /setup ───────────────────────────────────────────────────
  app.post('/setup', async (request, reply) => {
    // Ensure the users table has the password_hash column before we write.
    await ensureAuthSchema(db);

    if (await adminExists()) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Setup has already been completed. Sign in with your admin account.',
        statusCode: 409,
      });
    }

    const { email, password, display_name } = request.body ?? {};

    const errors = validateRegistrationInput({ email: email ?? '', password: password ?? '' });
    if (errors.length) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: errors,
        statusCode: 400,
      });
    }

    try {
      const user = await registerUser(db, { email, password, display_name, role: 'admin' });
      return reply.status(201).send({
        data: user,
        message: 'Admin account created. You can now sign in.',
        warning: 'There is no password recovery. Store your credentials in a safe place.',
      });
    } catch (e) {
      return reply.status(e.statusCode ?? 500).send({
        error: 'Setup failed',
        message: e.message,
        statusCode: e.statusCode ?? 500,
      });
    }
  });
}
