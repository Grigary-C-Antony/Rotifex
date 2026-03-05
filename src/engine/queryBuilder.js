/**
 * Build parameterised SQL for list queries with filtering, sorting,
 * and pagination.
 *
 * @param {string}   tableName
 * @param {object[]} fields        Normalised field definitions.
 * @param {object}   query         Raw query-string object from the request.
 * @returns {{ sql: string, countSql: string, params: any[], page: number, limit: number }}
 */
export function buildListQuery(tableName, fields, query = {}) {
  const fieldNames = new Set(fields.map(f => f.name));
  // Also allow filtering on the auto-generated columns
  fieldNames.add('id');
  fieldNames.add('created_at');
  fieldNames.add('updated_at');

  // ── Filtering ─────────────────────────────────────────────────────
  const whereClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(query)) {
    if (['sort', 'order', 'page', 'limit'].includes(key)) continue;
    if (!fieldNames.has(key)) continue;       // ignore unknown fields
    whereClauses.push(`${key} = ?`);
    params.push(value);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';

  // ── Sorting ───────────────────────────────────────────────────────
  const sortField = fieldNames.has(query.sort) ? query.sort : 'created_at';
  const sortOrder = query.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const orderSQL  = `ORDER BY ${sortField} ${sortOrder}`;

  // ── Pagination ────────────────────────────────────────────────────
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const sql      = `SELECT * FROM ${tableName} ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) AS total FROM ${tableName} ${whereSQL}`;

  return {
    sql,
    countSql,
    params,          // shared between data + count queries
    page,
    limit,
  };
}
