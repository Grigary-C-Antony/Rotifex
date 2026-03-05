import { createTable } from '../db/index.js';

/**
 * Synchronise DB tables with the loaded schema.
 *
 * Uses `CREATE TABLE IF NOT EXISTS`, so it's safe to call on every startup.
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
  }
}
