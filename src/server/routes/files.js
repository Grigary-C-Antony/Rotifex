import { createReadStream } from 'node:fs';

/**
 * File upload / download routes.
 *
 * Registered under `/files`.  Uses header-based identity for the MVP
 * (`x-user-id` and `x-user-role`) since Rotifex does not yet have an
 * auth layer.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ storage: import('../../storage/storageManager.js').StorageManager, config: object }} opts
 */
export async function fileRoutes(app, { storage, config }) {

  // ── Helper: extract identity from headers ─────────────────────────
  function getIdentity(request) {
    return {
      userId: request.headers['x-user-id'] || 'anonymous',
      role:   request.headers['x-user-role'] || 'user',
    };
  }

  // ── Helper: ownership / role gate ─────────────────────────────────
  function assertAccess(meta, identity, reply) {
    if (identity.role === 'admin') return true;
    if (meta.uploader_id === identity.userId) return true;
    reply.status(403).send({
      error: 'Forbidden',
      message: 'You do not have access to this file',
      statusCode: 403,
    });
    return false;
  }

  // ── UPLOAD ────────────────────────────────────────────────────────
  app.post('/files/upload', async (request, reply) => {
    const identity = getIdentity(request);

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file provided. Send a multipart form with a "file" field.',
        statusCode: 400,
      });
    }

    // Consume the file stream into a buffer
    const chunks = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Check max file size
    const maxBytes = (config.storage.maxFileSizeMB || 10) * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: `File exceeds the ${config.storage.maxFileSizeMB} MB limit`,
        statusCode: 413,
      });
    }

    const visibility = data.fields?.visibility?.value || 'public';
    if (!['public', 'private'].includes(visibility)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'visibility must be "public" or "private"',
        statusCode: 400,
      });
    }

    const fileMeta = await storage.save(
      { filename: data.filename, mimetype: data.mimetype, data: buffer },
      { visibility, uploaderId: identity.userId },
    );

    return reply.status(201).send({ data: fileMeta });
  });

  // ── LIST FILES ────────────────────────────────────────────────────
  app.get('/files', async (request, reply) => {
    const identity = getIdentity(request);
    const filters = identity.role === 'admin'
      ? {}
      : { uploaderId: identity.userId };

    const files = await storage.listFiles(filters);
    return { data: files, meta: { total: files.length } };
  });

  // ── GET FILE METADATA ─────────────────────────────────────────────
  app.get('/files/:id', async (request, reply) => {
    const identity = getIdentity(request);
    const meta = await storage.getFileMeta(request.params.id);
    if (!meta) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'File not found',
        statusCode: 404,
      });
    }

    if (!assertAccess(meta, identity, reply)) return;
    return { data: meta };
  });

  // ── DOWNLOAD ──────────────────────────────────────────────────────
  app.get('/files/:id/download', async (request, reply) => {
    const meta = await storage.getFileMeta(request.params.id);
    if (!meta) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'File not found',
        statusCode: 404,
      });
    }

    // Private files require a valid signed URL
    if (meta.visibility === 'private') {
      const { token, expires } = request.query;
      if (!token || !expires) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Private files require a signed URL. Use GET /files/:id/signed-url to obtain one.',
          statusCode: 403,
        });
      }
      if (!storage.verifySignedUrl(meta.id, token, expires)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid or expired signed URL',
          statusCode: 403,
        });
      }
    }

    const filepath = storage.getFilePath(meta);
    reply.header('Content-Type', meta.mime_type);
    reply.header('Content-Disposition', `inline; filename="${meta.original_name}"`);
    return reply.send(createReadStream(filepath));
  });

  // ── GENERATE SIGNED URL ───────────────────────────────────────────
  app.get('/files/:id/signed-url', async (request, reply) => {
    const identity = getIdentity(request);
    const meta = await storage.getFileMeta(request.params.id);
    if (!meta) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'File not found',
        statusCode: 404,
      });
    }

    if (!assertAccess(meta, identity, reply)) return;

    if (meta.visibility !== 'private') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Signed URLs are only for private files',
        statusCode: 400,
      });
    }

    const signed = storage.generateSignedUrl(meta.id, request);
    return { data: signed };
  });

  // ── DELETE ────────────────────────────────────────────────────────
  app.delete('/files/:id', async (request, reply) => {
    const identity = getIdentity(request);
    const meta = await storage.getFileMeta(request.params.id);
    if (!meta) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'File not found',
        statusCode: 404,
      });
    }

    if (!assertAccess(meta, identity, reply)) return;

    await storage.deleteFile(meta.id);
    return reply.status(204).send();
  });
}
