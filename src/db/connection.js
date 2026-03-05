import { SqliteAdapter } from './adapters/sqlite.js';

/**
 * Singleton database connection manager.
 *
 * Call `getDatabase()` to obtain the shared adapter instance.
 * The adapter type is selected by `config.adapter` (currently only 'sqlite').
 * Adding PostgreSQL later requires only a new adapter class and a case here.
 */

/** @type {import('./adapters/base.js').DatabaseAdapter|null} */
let instance = null;

/**
 * Return (and lazily create) the singleton database adapter.
 *
 * @param {{ adapter?: 'sqlite', filepath?: string }} [config]
 * @returns {import('./adapters/base.js').DatabaseAdapter}
 */
export function getDatabase(config = {}) {
  if (instance) return instance;

  const { adapter = 'sqlite', filepath } = config;

  switch (adapter) {
    case 'sqlite':
      instance = new SqliteAdapter(filepath);
      break;
    // Future: case 'postgres': …
    default:
      throw new Error(`Unknown database adapter: "${adapter}"`);
  }

  instance.open();
  return instance;
}

/**
 * Close the active database connection and discard the singleton.
 */
export function closeDatabase() {
  if (!instance) return;
  instance.close();
  instance = null;
}
