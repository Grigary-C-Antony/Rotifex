/**
 * Public API for the Rotifex database layer.
 *
 * Usage:
 *   import { getDatabase, closeDatabase, createTable, dropTable, Migrator } from '../db/index.js';
 */

export { getDatabase, closeDatabase } from './connection.js';
export { createTable, dropTable } from './schema.js';
export { Migrator } from './migrator.js';
export { DatabaseAdapter } from './adapters/base.js';
export { SqliteAdapter } from './adapters/sqlite.js';
