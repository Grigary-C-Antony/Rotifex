import { DatabaseAdapter } from './base.js';

/**
 * Detect the Sequelize dialect from a connection URL.
 * @param {string} url
 * @returns {'postgres'|'mysql'|'mariadb'|'mssql'}
 */
function detectDialect(url) {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  if (url.startsWith('mysql://'))   return 'mysql';
  if (url.startsWith('mariadb://')) return 'mariadb';
  if (url.startsWith('mssql://') || url.startsWith('sqlserver://')) return 'mssql';
  throw new Error(
    `Cannot detect database dialect from connection string. ` +
    `Supported prefixes: postgres://, mysql://, mariadb://, mssql://`,
  );
}

/**
 * Build a transaction-scoped query proxy that passes Sequelize's transaction
 * object to every query, ensuring all operations run on the same connection.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').Transaction} t
 * @param {string} dialect
 * @param {Function} getColumnsImpl  Bound getColumns from the parent adapter.
 * @returns {object}
 */
function makeTransactionProxy(sequelize, t, dialect, getColumnsImpl) {
  const { QueryTypes } = sequelize.constructor;

  return {
    dialect,

    async run(sql, params = []) {
      const [, meta] = await sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.RAW,
        transaction: t,
      });
      return { changes: meta?.rowCount ?? meta?.affectedRows ?? 0 };
    },

    async get(sql, params = []) {
      const rows = await sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.SELECT,
        transaction: t,
      });
      return rows[0] ?? undefined;
    },

    async all(sql, params = []) {
      return sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.SELECT,
        transaction: t,
      });
    },

    async exec(sql) {
      const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        await sequelize.query(stmt, { type: QueryTypes.RAW, transaction: t });
      }
    },

    async transaction(fn2) {
      // Nested transaction — reuse the same transaction object.
      return fn2(this);
    },

    async getColumns(tableName) {
      return getColumnsImpl(tableName);
    },
  };
}

/**
 * Sequelize-backed database adapter.
 *
 * Supports PostgreSQL, MySQL, MariaDB, and MSSQL via a standard connection
 * string (e.g. `postgresql://user:pass@host:5432/db`).
 *
 * All queries use `?` placeholder syntax with `replacements: []` — Sequelize
 * converts them to the correct syntax per dialect automatically.
 *
 * Required peer dependencies (install the one(s) you need):
 *   PostgreSQL  → npm install pg pg-hstore
 *   MySQL       → npm install mysql2
 *   MariaDB     → npm install mariadb
 *   MSSQL       → npm install tedious
 */
export class SequelizeAdapter extends DatabaseAdapter {
  /** @type {import('sequelize').Sequelize|null} */
  #sequelize = null;
  #dialect;

  /**
   * @param {string} connectionString  Full database URL.
   */
  constructor(connectionString) {
    super();
    this.connectionString = connectionString;
    this.#dialect = detectDialect(connectionString);
  }

  get dialect() { return this.#dialect; }

  /* ------------------------------------------------------------------ */
  /*  Connection lifecycle                                               */
  /* ------------------------------------------------------------------ */

  async open() {
    if (this.#sequelize) return;

    let Sequelize;
    try {
      ({ Sequelize } = await import('sequelize'));
    } catch {
      throw new Error(
        'The "sequelize" package is required for external database support. ' +
        'Install it with: npm install sequelize',
      );
    }

    this.#sequelize = new Sequelize(this.connectionString, {
      logging: false,
      dialectOptions: {},
    });

    await this.#sequelize.authenticate();
  }

  async close() {
    if (!this.#sequelize) return;
    await this.#sequelize.close();
    this.#sequelize = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Query helpers                                                      */
  /* ------------------------------------------------------------------ */

  async run(sql, params = []) {
    this.#ensureOpen();
    const { QueryTypes } = this.#sequelize.constructor;
    const [, meta] = await this.#sequelize.query(sql, {
      replacements: params,
      type: QueryTypes.RAW,
    });
    return { changes: meta?.rowCount ?? meta?.affectedRows ?? 0 };
  }

  async get(sql, params = []) {
    this.#ensureOpen();
    const { QueryTypes } = this.#sequelize.constructor;
    const rows = await this.#sequelize.query(sql, {
      replacements: params,
      type: QueryTypes.SELECT,
    });
    return rows[0] ?? undefined;
  }

  async all(sql, params = []) {
    this.#ensureOpen();
    const { QueryTypes } = this.#sequelize.constructor;
    return this.#sequelize.query(sql, {
      replacements: params,
      type: QueryTypes.SELECT,
    });
  }

  async exec(sql) {
    this.#ensureOpen();
    const { QueryTypes } = this.#sequelize.constructor;
    // Split multi-statement SQL and execute each statement individually.
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await this.#sequelize.query(stmt, { type: QueryTypes.RAW });
    }
  }

  /**
   * Run `fn` inside a Sequelize managed transaction.
   *
   * A transaction-scoped proxy adapter is passed to `fn` so that every db
   * call inside the callback is bound to the same connection/transaction.
   */
  async transaction(fn) {
    this.#ensureOpen();
    return this.#sequelize.transaction(async (t) => {
      const proxy = makeTransactionProxy(
        this.#sequelize,
        t,
        this.#dialect,
        this.getColumns.bind(this),
      );
      return fn(proxy);
    });
  }

  async getColumns(tableName) {
    this.#ensureOpen();
    const { QueryTypes } = this.#sequelize.constructor;

    if (this.#dialect === 'postgres') {
      const rows = await this.#sequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = ? AND table_schema = current_schema()`,
        { replacements: [tableName], type: QueryTypes.SELECT },
      );
      return rows.map(r => r.column_name);
    }

    if (this.#dialect === 'mssql') {
      const rows = await this.#sequelize.query(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_NAME = ?`,
        { replacements: [tableName], type: QueryTypes.SELECT },
      );
      return rows.map(r => r.COLUMN_NAME);
    }

    // MySQL / MariaDB
    const rows = await this.#sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.columns
       WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()`,
      { replacements: [tableName], type: QueryTypes.SELECT },
    );
    return rows.map(r => r.COLUMN_NAME || r.column_name);
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                           */
  /* ------------------------------------------------------------------ */

  #ensureOpen() {
    if (!this.#sequelize) {
      throw new Error('Database is not open. Call adapter.open() first.');
    }
  }
}
