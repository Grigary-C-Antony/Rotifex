import { createTable } from '../db/index.js';

/**
 * Synchronise DB tables with the loaded schema.
 *
 * Uses `CREATE TABLE IF NOT EXISTS` for initial creation, then adds any
 * columns that are present in the schema but missing from the existing table
 * (safe schema evolution without data loss).
 *
 * @param {import('../db/adapters/base.js').DatabaseAdapter} db
 * @param {Map<string, { tableName: string, fields: object[] }>} models
 */
export function syncTables(db, models) {
  for (const [, model] of models) {
    const columns = model.fields.map(f => {
      const parts = [f.name, f.sqlType];
      const constraints = [];
      if (f.required) constraints.push('NOT NULL');
      if (f.unique)   constraints.push('UNIQUE');
      if (f.default !== undefined) {
        const val = typeof f.default === 'string' ? `'${f.default}'` : f.default;
        constraints.push(`DEFAULT ${val}`);
      }
      if (constraints.length) parts.push(constraints.join(' '));
      return { name: parts[0], type: parts[1], constraints: constraints.join(' ') || undefined };
    });

    createTable(db, model.tableName, columns);
    addMissingColumns(db, model.tableName, model.fields);
  }
}

/**
 * For an already-existing table, ALTER TABLE to add any columns that are in
 * the schema definition but not yet in the DB.
 *
 * SQLite does not allow adding NOT NULL columns without a DEFAULT to existing
 * tables (existing rows would violate the constraint), so we omit NOT NULL
 * for added columns. The application layer handles required-field validation.
 */
function addMissingColumns(db, tableName, fields) {
  const existing = new Set(
    db.all(`PRAGMA table_info(${tableName})`).map(r => r.name),
  );

  for (const f of fields) {
    if (existing.has(f.name)) continue;

    let colDef = `${f.name} ${f.sqlType}`;
    if (f.default !== undefined) {
      const val = typeof f.default === 'string' ? `'${f.default}'` : f.default;
      colDef += ` DEFAULT ${val}`;
    }

    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
    } catch {
      // Column added by a concurrent call — safe to ignore.
    }
  }
}
