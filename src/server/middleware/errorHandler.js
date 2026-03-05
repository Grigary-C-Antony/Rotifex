/**
 * Centralized error handler.
 *
 * Normalises all errors into a consistent JSON envelope:
 *   { error: string, message: string, statusCode: number }
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Log the full error at the appropriate level
    if (statusCode >= 500) {
      request.log.error(error);
    } else {
      request.log.warn(error.message);
    }

    reply.status(statusCode).send({
      error:      error.name || 'Error',
      message:    error.message || 'An unexpected error occurred',
      statusCode,
    });
  });
}
