/**
 * Abstract database adapter interface.
 *
 * Every concrete adapter (SQLite, PostgreSQL, …) must extend this class
 * and implement every method.  This is the single swap-point that makes
 * Rotifex backend-agnostic.
 */
export class DatabaseAdapter {
  /**
   * Open (or initialise) the database connection.
   * @returns {void}
   */
  open() {
    throw new Error('DatabaseAdapter.open() must be implemented by subclass');
  }

  /**
   * Close the database connection and release resources.
   * @returns {void}
   */
  close() {
    throw new Error('DatabaseAdapter.close() must be implemented by subclass');
  }

  /**
   * Execute a write statement (INSERT / UPDATE / DELETE).
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number|bigint }}
   */
  run(sql, params = []) {
    throw new Error('DatabaseAdapter.run() must be implemented by subclass');
  }

  /**
   * Fetch a single row.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {object|undefined}
   */
  get(sql, params = []) {
    throw new Error('DatabaseAdapter.get() must be implemented by subclass');
  }

  /**
   * Fetch all matching rows.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {object[]}
   */
  all(sql, params = []) {
    throw new Error('DatabaseAdapter.all() must be implemented by subclass');
  }

  /**
   * Execute raw SQL — may contain multiple statements (e.g. migrations).
   * @param {string} sql
   * @returns {void}
   */
  exec(sql) {
    throw new Error('DatabaseAdapter.exec() must be implemented by subclass');
  }

  /**
   * Wrap `fn` in a database transaction.
   * If `fn` throws, the transaction is rolled back.
   * @param {(db: this) => *} fn
   * @returns {*} The return value of `fn`.
   */
  transaction(fn) {
    throw new Error('DatabaseAdapter.transaction() must be implemented by subclass');
  }
}
