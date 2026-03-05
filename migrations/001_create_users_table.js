import { createTable, dropTable } from '../src/db/index.js';

/**
 * Example migration — creates the `users` table.
 *
 * Each migration must export `up(db)` and `down(db)`.
 * The `db` argument is the active DatabaseAdapter instance.
 */

/** Apply the migration. */
export function up(db) {
  createTable(db, 'users', [
    { name: 'email',        type: 'TEXT', constraints: 'NOT NULL UNIQUE' },
    { name: 'display_name', type: 'TEXT' },
  ]);
}

/** Reverse the migration. */
export function down(db) {
  dropTable(db, 'users');
}
