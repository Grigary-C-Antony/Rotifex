import crypto from 'node:crypto';
import { buildValidators } from './zodFactory.js';
import { buildListQuery } from './queryBuilder.js';
import { getModelByTable } from './schemaStore.js';

const NOT_FOUND_TABLE = (table) => ({
  error: 'Not Found',
  message: `Unknown resource "${table}"`,
  statusCode: 404,
});

/**
 * Register five generic CRUD routes that resolve the model from the
 * in-memory schema store at request time.
 *
 * Because the store is updated live (no restart needed), any model added
 * via the admin API is immediately reachable through these routes.
 *
 *   GET    /:table          List (filter + sort + paginate)
 *   GET    /:table/:id      Get by ID
 *   POST   /:table          Create
 *   PUT    /:table/:id      Update (partial)
 *   DELETE /:table/:id      Delete
 *
 * Static routes registered elsewhere (/health, /files/*, /admin/*)
 * always take priority over these parametric routes in Fastify's router.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../db/adapters/base.js').DatabaseAdapter} db
 */
export function registerGenericRoutes(app, db) {

  // ── LIST ─────────────────────────────────────────────────────────────
  app.get('/api/:table', (request, reply) => {
    const model = getModelByTable(request.params.table);
    if (!model) return reply.status(404).send(NOT_FOUND_TABLE(request.params.table));

    const { tableName, fields } = model;
    const { sql, countSql, params, page, limit } = buildListQuery(tableName, fields, request.query);

    const rows          = db.all(sql, [...params, limit, (page - 1) * limit]);
    const { total }     = db.get(countSql, params);

    return { data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // ── GET BY ID ─────────────────────────────────────────────────────────
  app.get('/api/:table/:id', (request, reply) => {
    const model = getModelByTable(request.params.table);
    if (!model) return reply.status(404).send(NOT_FOUND_TABLE(request.params.table));

    const row = db.get(`SELECT * FROM ${model.tableName} WHERE id = ?`, [request.params.id]);
    if (!row) return reply.status(404).send({ error: 'Not Found', message: `${model.tableName} not found`, statusCode: 404 });
    return { data: row };
  });

  // ── CREATE ────────────────────────────────────────────────────────────
  app.post('/api/:table', (request, reply) => {
    const model = getModelByTable(request.params.table);
    if (!model) return reply.status(404).send(NOT_FOUND_TABLE(request.params.table));

    const { tableName, fields } = model;
    const { createSchema } = buildValidators(fields);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: parsed.error.issues, statusCode: 400 });
    }

    const data      = parsed.data;
    const id        = crypto.randomUUID();
    const now       = new Date().toISOString();
    const cols      = ['id', ...Object.keys(data), 'created_at', 'updated_at'];
    const sqlParams = [id, ...Object.values(data), now, now]
      .map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v));

    db.run(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, sqlParams);
    return reply.status(201).send({ data: db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]) });
  });

  // ── UPDATE ────────────────────────────────────────────────────────────
  app.put('/api/:table/:id', (request, reply) => {
    const model = getModelByTable(request.params.table);
    if (!model) return reply.status(404).send(NOT_FOUND_TABLE(request.params.table));

    const { tableName, fields } = model;
    const existing = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [request.params.id]);
    if (!existing) return reply.status(404).send({ error: 'Not Found', message: `${tableName} not found`, statusCode: 404 });

    const { updateSchema } = buildValidators(fields);
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: parsed.error.issues, statusCode: 400 });
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Validation Error', message: 'No fields to update', statusCode: 400 });
    }

    const now        = new Date().toISOString();
    const setClauses = [...Object.keys(data).map(k => `${k} = ?`), 'updated_at = ?'];
    const params     = [...Object.values(data).map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v)), now, request.params.id];

    db.run(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`, params);
    return { data: db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [request.params.id]) };
  });

  // ── DELETE ────────────────────────────────────────────────────────────
  app.delete('/api/:table/:id', (request, reply) => {
    const model = getModelByTable(request.params.table);
    if (!model) return reply.status(404).send(NOT_FOUND_TABLE(request.params.table));

    const existing = db.get(`SELECT * FROM ${model.tableName} WHERE id = ?`, [request.params.id]);
    if (!existing) return reply.status(404).send({ error: 'Not Found', message: `${model.tableName} not found`, statusCode: 404 });

    db.run(`DELETE FROM ${model.tableName} WHERE id = ?`, [request.params.id]);
    return reply.status(204).send();
  });
}
