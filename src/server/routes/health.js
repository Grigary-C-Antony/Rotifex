/**
 * Health-check route.
 *
 * GET /health → { status, uptime, timestamp }
 *
 * @param {import('fastify').FastifyInstance} app
 */
export async function healthRoutes(app) {
  app.get('/health', async () => ({
    status:    'ok',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
  }));
}
