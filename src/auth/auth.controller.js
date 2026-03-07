import { registerUser, loginUser, refreshTokens, logout, changePassword, getCurrentUser, validateRegistrationInput, verifyAccessToken } from './auth.service.js';

/**
 * Returns request handlers bound to the given `db` instance.
 *
 * @param {import('../db/adapters/base.js').DatabaseAdapter} db
 */
export function makeAuthController(db) {
  return {

    async register(request, reply) {
      const { email, password, display_name } = request.body ?? {};

      // Input validation
      const errors = validateRegistrationInput({ email: email ?? '', password: password ?? '' });
      if (errors.length) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: errors,
          statusCode: 400,
        });
      }

      try {
        // role is always 'user' — admins are created only through /setup or the admin panel
        const user = await registerUser(db, { email, password, display_name, role: 'user' });
        return reply.status(201).send({ data: user, message: 'User registered successfully' });
      } catch (e) {
        return reply.status(e.statusCode ?? 500).send({
          error: 'Registration failed',
          message: e.message,
          statusCode: e.statusCode ?? 500,
        });
      }
    },

    async login(request, reply) {
      const { email, password } = request.body ?? {};

      if (!email || !password) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'email and password are required',
          statusCode: 400,
        });
      }

      try {
        const result = await loginUser(db, { email, password });
        return reply.send({ data: result });
      } catch (e) {
        return reply.status(e.statusCode ?? 500).send({
          error: 'Authentication failed',
          message: e.message,
          statusCode: e.statusCode ?? 500,
        });
      }
    },

    async refresh(request, reply) {
      const { refreshToken } = request.body ?? {};

      if (!refreshToken) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'refreshToken is required',
          statusCode: 400,
        });
      }

      try {
        const tokens = await refreshTokens(db, refreshToken);
        return reply.send({ data: tokens });
      } catch (e) {
        return reply.status(e.statusCode ?? 401).send({
          error: 'Token refresh failed',
          message: e.message,
          statusCode: e.statusCode ?? 401,
        });
      }
    },

    async logout(request, reply) {
      const { refreshToken } = request.body ?? {};
      await logout(db, refreshToken);
      return reply.status(204).send();
    },

    async changePassword(request, reply) {
      // /auth/* is skipped by the JWT middleware — verify the token manually.
      const header = request.headers['authorization'] ?? '';
      if (!header.startsWith('Bearer ')) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authorization: Bearer <token> header is required',
          statusCode: 401,
        });
      }

      let payload;
      try {
        payload = verifyAccessToken(header.slice(7));
      } catch {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          statusCode: 401,
        });
      }

      const { currentPassword, newPassword } = request.body ?? {};
      if (!currentPassword || !newPassword) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'currentPassword and newPassword are required',
          statusCode: 400,
        });
      }

      try {
        await changePassword(db, payload.userId, { currentPassword, newPassword });
        return reply.status(204).send();
      } catch (e) {
        return reply.status(e.statusCode ?? 500).send({
          error: 'Password change failed',
          message: e.message,
          statusCode: e.statusCode ?? 500,
        });
      }
    },

    async me(request, reply) {
      // /auth/me is inside the /auth/* skip zone of the JWT middleware,
      // so we verify the token manually here.
      const header = request.headers['authorization'] ?? '';
      if (!header.startsWith('Bearer ')) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authorization: Bearer <token> header is required',
          statusCode: 401,
        });
      }

      let payload;
      try {
        payload = verifyAccessToken(header.slice(7));
      } catch {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          statusCode: 401,
        });
      }

      const user = await getCurrentUser(db, payload.userId);
      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found',
          statusCode: 404,
        });
      }

      return reply.send({ data: user });
    },

  };
}
