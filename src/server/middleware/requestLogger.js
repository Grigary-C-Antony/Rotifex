/**
 * Request-logging hook.
 *
 * Logs every incoming request (method + URL) and the response time on completion.
 *
 * @param {import('fastify').FastifyInstance} app
 */
// Routes too noisy to log on every hit (polling endpoints, static assets)
const SKIP_LOG = ['/admin/api/logs', '/admin/api/stats', '/health', '/'];

export function registerRequestLogger(app) {
  app.addHook('onResponse', (request, reply, done) => {
    const path = request.url.split('?')[0];
    const isStatic = path.startsWith('/assets/') || /\.(js|css|ico|png|svg|woff2?)$/.test(path);
    if (!SKIP_LOG.includes(path) && !isStatic) {
      const ms = reply.elapsedTime.toFixed(1);
      request.log.info(
        `${request.method} ${request.url} → ${reply.statusCode} (${ms} ms)`,
      );
    }
    done();
  });
}
