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
 * @returns {Promise<void>}
 */
export async function syncTables(db, models) {
  for (const [, model] of models) {
    const columns = model.fields.map(f => {
      const constraints = [];
      if (f.required) constraints.push('NOT NULL');
      if (f.unique)   constraints.push('UNIQUE');
      if (f.default !== undefined) {
        const val = typeof f.default === 'string' ? `'${f.default}'` : f.default;
        constraints.push(`DEFAULT ${val}`);
      }
      return { name: f.name, type: f.sqlType, constraints: constraints.join(' ') || undefined };
    });

    await createTable(db, model.tableName, columns);
    await addMissingColumns(db, model.tableName, model.fields);
  }
}

/**
 * For an already-existing table, ALTER TABLE to add any columns that are in
 * the schema definition but not yet in the DB.
 *
 * NOT NULL is omitted for added columns because existing rows would violate
 * the constraint.  The application layer handles required-field validation.
 *
 * @param {import('../db/adapters/base.js').DatabaseAdapter} db
 * @param {string} tableName
 * @param {object[]} fields
 * @returns {Promise<void>}
 */
async function addMissingColumns(db, tableName, fields) {
  let existing;
  try {
    existing = new Set(await db.getColumns(tableName));
  } catch {
    // Table may not exist yet — createTable above will handle it.
    return;
  }

  for (const f of fields) {
    if (existing.has(f.name)) continue;

    let colDef = `${f.name} ${f.sqlType}`;
    if (f.default !== undefined) {
      const val = typeof f.default === 'string' ? `'${f.default}'` : f.default;
      colDef += ` DEFAULT ${val}`;
    }

    try {
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
    } catch {
      // Column added by a concurrent call — safe to ignore.
    }
  }
}
