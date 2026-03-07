import { makeAuthController } from './auth.controller.js';

/**
 * Auth route group — registered under the root prefix.
 *
 * Endpoints:
 *   POST /auth/register  — create a new user with a hashed password
 *   POST /auth/login     — authenticate and receive access + refresh tokens
 *   POST /auth/refresh   — exchange a refresh token for new token pair
 *
 * No JWT guard is applied here; these routes are intentionally public.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('../db/adapters/base.js').DatabaseAdapter }} opts
 */
export async function authRoutes(app, { db }) {
  const ctrl = makeAuthController(db);

  app.post('/auth/register',         (req, reply) => ctrl.register(req, reply));
  app.post('/auth/login',            (req, reply) => ctrl.login(req, reply));
  app.post('/auth/refresh',          (req, reply) => ctrl.refresh(req, reply));
  app.post('/auth/logout',           (req, reply) => ctrl.logout(req, reply));
  app.post('/auth/change-password',  (req, reply) => ctrl.changePassword(req, reply));
  app.get('/auth/me',                (req, reply) => ctrl.me(req, reply));
}
