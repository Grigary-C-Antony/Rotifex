/**
 * Lightweight schema helpers for table creation.
 *
 * Every table automatically receives:
 *   - `id`         TEXT PRIMARY KEY  (UUID v4)
 *   - `created_at` TEXT NOT NULL     (ISO-8601, always set by application code)
 *   - `updated_at` TEXT NOT NULL     (ISO-8601, always set by application code)
 *
 * CURRENT_TIMESTAMP is used as the database-level default because it is ANSI
 * SQL and works identically in SQLite, PostgreSQL, MySQL, and MariaDB.
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
 * @returns {Promise<void>}
 */
export async function createTable(db, tableName, columns = []) {
  const allColumns = [
    // VARCHAR(36) = exact UUID length; TEXT PRIMARY KEY is rejected by MySQL without a key length.
    'id VARCHAR(36) PRIMARY KEY NOT NULL',
    ...columns.map(col => {
      const parts = [col.name, col.type];
      if (col.constraints) parts.push(col.constraints);
      return parts.join(' ');
    }),
    // Application code always supplies these values explicitly, so no DEFAULT
    // is needed — and MySQL only allows DEFAULT CURRENT_TIMESTAMP on DATETIME/
    // TIMESTAMP columns, not VARCHAR.
    'created_at VARCHAR(255) NOT NULL',
    'updated_at VARCHAR(255) NOT NULL',
  ];

  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${allColumns.join(',\n  ')}\n);`;
  await db.exec(sql);
}

/**
 * Drop a table if it exists.
 *
 * @param {import('./adapters/base.js').DatabaseAdapter} db
 * @param {string} tableName
 * @returns {Promise<void>}
 */
export async function dropTable(db, tableName) {
  await db.exec(`DROP TABLE IF EXISTS ${tableName};`);
}
