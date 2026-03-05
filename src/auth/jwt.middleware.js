import { verifyAccessToken } from './auth.service.js';

/**
 * JWT middleware — registered as a global `onRequest` hook.
 *
 * Behaviour:
 *  - `/auth/*` routes are always skipped (they are public by design).
 *  - If no `Authorization: Bearer <token>` header is present the request
 *    passes through unchanged (backwards-compatible with direct header auth).
 *  - If a token IS present it is verified; on success the decoded `userId`
 *    and `role` are injected as `x-user-id` / `x-user-role` so Rotifex's
 *    existing authorization logic works without modification.
 *  - An invalid / expired token returns 401 immediately.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerJwtMiddleware(app) {
  app.addHook('onRequest', async (request, reply) => {
    // Public auth endpoints — never require a token.
    if (request.url.startsWith('/auth/')) return;

    const header = request.headers['authorization'] ?? '';
    if (!header.startsWith('Bearer ')) return; // no token → pass through

    const token = header.slice(7);
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401,
      });
    }

    // Inject trusted identity headers that Rotifex routes rely on.
    request.headers['x-user-id']   = payload.userId;
    request.headers['x-user-role'] = payload.role;
  });
}
