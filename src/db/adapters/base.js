/**
 * Abstract database adapter interface.
 *
 * Every concrete adapter (SQLite, PostgreSQL, MySQL, …) must extend this class
 * and implement every method.  This is the single swap-point that makes
 * Rotifex backend-agnostic.
 *
 * All methods are async so that adapters backed by network databases
 * (PostgreSQL, MySQL, cloud RDS, …) can await their I/O naturally.
 * SQLite simply wraps its synchronous results in resolved Promises.
 */
export class DatabaseAdapter {
  /**
   * The SQL dialect name: 'sqlite', 'postgres', 'mysql', 'mariadb', 'mssql'.
   * @type {string}
   */
  get dialect() {
    return 'unknown';
  }

  /**
   * Open (or initialise) the database connection.
   * @returns {Promise<void>}
   */
  async open() {
    throw new Error('DatabaseAdapter.open() must be implemented by subclass');
  }

  /**
   * Close the database connection and release resources.
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('DatabaseAdapter.close() must be implemented by subclass');
  }

  /**
   * Execute a write statement (INSERT / UPDATE / DELETE).
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<{ changes: number }>}
   */
  async run(sql, params = []) {
    throw new Error('DatabaseAdapter.run() must be implemented by subclass');
  }

  /**
   * Fetch a single row.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<object|undefined>}
   */
  async get(sql, params = []) {
    throw new Error('DatabaseAdapter.get() must be implemented by subclass');
  }

  /**
   * Fetch all matching rows.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<object[]>}
   */
  async all(sql, params = []) {
    throw new Error('DatabaseAdapter.all() must be implemented by subclass');
  }

  /**
   * Execute raw SQL — may contain multiple statements (e.g. migrations).
   * @param {string} sql
   * @returns {Promise<void>}
   */
  async exec(sql) {
    throw new Error('DatabaseAdapter.exec() must be implemented by subclass');
  }

  /**
   * Wrap `fn` in a database transaction.
   * `fn` receives the adapter (or a transaction-scoped proxy) as its argument.
   * If `fn` throws or rejects, the transaction is rolled back.
   * @param {(db: this) => Promise<*>} fn
   * @returns {Promise<*>} The resolved value of `fn`.
   */
  async transaction(fn) {
    throw new Error('DatabaseAdapter.transaction() must be implemented by subclass');
  }

  /**
   * Return the list of column names for an existing table.
   * Used by the schema-sync engine to detect columns that need to be added.
   * @param {string} tableName
   * @returns {Promise<string[]>}
   */
  async getColumns(tableName) {
    throw new Error('DatabaseAdapter.getColumns() must be implemented by subclass');
  }
}
