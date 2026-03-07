import Database from 'better-sqlite3';
import { DatabaseAdapter } from './base.js';

/**
 * SQLite adapter backed by better-sqlite3.
 *
 * better-sqlite3 is synchronous internally; every adapter method wraps the
 * result in a resolved Promise so callers can `await` uniformly across all
 * adapter implementations (SQLite, PostgreSQL, MySQL, …).
 *
 * Transactions use explicit BEGIN / COMMIT / ROLLBACK so that async callbacks
 * (e.g. user migration files that await other db calls) are handled correctly.
 */
export class SqliteAdapter extends DatabaseAdapter {
  /** @type {import('better-sqlite3').Database|null} */
  #db = null;

  get dialect() { return 'sqlite'; }

  /**
   * @param {string} filepath  Path to the SQLite database file.
   *                           Defaults to `database.sqlite` in the cwd.
   */
  constructor(filepath = 'database.sqlite') {
    super();
    this.filepath = filepath;
  }

  /* ------------------------------------------------------------------ */
  /*  Connection lifecycle                                               */
  /* ------------------------------------------------------------------ */

  async open() {
    if (this.#db) return;
    this.#db = new Database(this.filepath);
    // Enable WAL mode for better concurrent-read performance.
    this.#db.pragma('journal_mode = WAL');
  }

  async close() {
    if (!this.#db) return;
    this.#db.close();
    this.#db = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Query helpers                                                      */
  /* ------------------------------------------------------------------ */

  async run(sql, params = []) {
    this.#ensureOpen();
    const info = this.#db.prepare(sql).run(...params);
    return { changes: info.changes };
  }

  async get(sql, params = []) {
    this.#ensureOpen();
    return this.#db.prepare(sql).get(...params);
  }

  async all(sql, params = []) {
    this.#ensureOpen();
    return this.#db.prepare(sql).all(...params);
  }

  async exec(sql) {
    this.#ensureOpen();
    this.#db.exec(sql);
  }

  /**
   * Run `fn` inside a transaction.
   *
   * Uses explicit BEGIN / COMMIT / ROLLBACK rather than better-sqlite3's
   * synchronous transaction() wrapper so that async callbacks are handled
   * correctly (e.g. user migration files that await db calls).
   */
  async transaction(fn) {
    this.#ensureOpen();
    this.#db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.#db.exec('COMMIT');
      return result;
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
  }

  async getColumns(tableName) {
    this.#ensureOpen();
    const rows = this.#db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.map(r => r.name);
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                           */
  /* ------------------------------------------------------------------ */

  #ensureOpen() {
    if (!this.#db) {
      throw new Error('Database is not open. Call adapter.open() first.');
    }
  }
}
