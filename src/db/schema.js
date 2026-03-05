/**
 * Lightweight schema helpers for table creation.
 *
 * Every table automatically receives:
 *   - `id`         TEXT PRIMARY KEY  (UUID v4)
 *   - `created_at` TEXT NOT NULL     (ISO-8601, defaults to now)
 *   - `updated_at` TEXT NOT NULL     (ISO-8601, defaults to now)
 */

/**
 * @typedef {object} ColumnDef
 * @property {string}  name         Column name.
 * @property {string}  type         SQL type (TEXT, INTEGER, REAL, BLOB, …).
 * @property {string}  [constraints]  Extra constraints, e.g. 'NOT NULL UNIQUE'.
 */

/**
 * Create a table with automatic `id`, `created_at`, and `updated_at` columns.
 *
 * @param {import('./adapters/base.js').DatabaseAdapter} db
 * @param {string} tableName
 * @param {ColumnDef[]} columns   User-defined columns (id & timestamps are added automatically).
 */
export function createTable(db, tableName, columns = []) {
  const allColumns = [
    "id TEXT PRIMARY KEY NOT NULL",
    ...columns.map(col => {
      const parts = [col.name, col.type];
      if (col.constraints) parts.push(col.constraints);
      return parts.join(' ');
    }),
    "created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
  ];

  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${allColumns.join(',\n  ')}\n);`;
  db.exec(sql);
}

/**
 * Drop a table if it exists.
 *
 * @param {import('./adapters/base.js').DatabaseAdapter} db
 * @param {string} tableName
 */
export function dropTable(db, tableName) {
  db.exec(`DROP TABLE IF EXISTS ${tableName};`);
}
