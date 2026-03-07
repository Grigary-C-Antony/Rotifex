import { SqliteAdapter } from './adapters/sqlite.js';

/**
 * Singleton database connection manager.
 *
 * Adapter selection priority:
 *   1. ROTIFEX_DATABASE_URL environment variable  → SequelizeAdapter
 *   2. config.databaseUrl                         → SequelizeAdapter
 *   3. config.filepath (default)                  → SqliteAdapter  (default)
 *
 * Adding a new dialect requires only a new adapter class; connection.js
 * stays unchanged as long as the connection string prefix is recognisable.
 */

/** @type {import('./adapters/base.js').DatabaseAdapter|null} */
let instance = null;

/**
 * Return (and lazily create) the singleton database adapter.
 * Async because opening a network database (PostgreSQL, MySQL, …) is async.
 *
 * @param {{ databaseUrl?: string, filepath?: string }} [config]
 * @returns {Promise<import('./adapters/base.js').DatabaseAdapter>}
 */
export async function getDatabase(config = {}) {
  if (instance) return instance;

  // Connection string takes priority over SQLite file path.
  const dbUrl = process.env.ROTIFEX_DATABASE_URL || config.databaseUrl;

  if (dbUrl) {
    // Lazy-import so that `sequelize` is only required when actually needed.
    const { SequelizeAdapter } = await import('./adapters/sequelize.js');
    instance = new SequelizeAdapter(dbUrl);
  } else {
    instance = new SqliteAdapter(config.filepath);
  }

  await instance.open();
  return instance;
}

/**
 * Close the active database connection and discard the singleton.
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
  if (!instance) return;
  await instance.close();
  instance = null;
}
