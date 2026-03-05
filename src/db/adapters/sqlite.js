import Database from 'better-sqlite3';
import { DatabaseAdapter } from './base.js';

/**
 * SQLite adapter backed by better-sqlite3.
 *
 * All operations are synchronous (better-sqlite3's design) which keeps
 * the API simple and avoids callback/promise complexity for a local CLI tool.
 */
export class SqliteAdapter extends DatabaseAdapter {
  /** @type {import('better-sqlite3').Database|null} */
  #db = null;

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

  /** @inheritdoc */
  open() {
    if (this.#db) return;
    this.#db = new Database(this.filepath);
    // Enable WAL mode for better concurrent-read performance.
    this.#db.pragma('journal_mode = WAL');
  }

  /** @inheritdoc */
  close() {
    if (!this.#db) return;
    this.#db.close();
    this.#db = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Query helpers                                                      */
  /* ------------------------------------------------------------------ */

  /** @inheritdoc */
  run(sql, params = []) {
    this.#ensureOpen();
    return this.#db.prepare(sql).run(...params);
  }

  /** @inheritdoc */
  get(sql, params = []) {
    this.#ensureOpen();
    return this.#db.prepare(sql).get(...params);
  }

  /** @inheritdoc */
  all(sql, params = []) {
    this.#ensureOpen();
    return this.#db.prepare(sql).all(...params);
  }

  /** @inheritdoc */
  exec(sql) {
    this.#ensureOpen();
    this.#db.exec(sql);
  }

  /** @inheritdoc */
  transaction(fn) {
    this.#ensureOpen();
    const wrapped = this.#db.transaction(() => fn(this));
    return wrapped();
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
