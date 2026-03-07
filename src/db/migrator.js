import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * File-based migration runner.
 *
 * Migration files live in `migrations/` and are named `NNN_description.js`.
 * Each file must export `up(db)` and `down(db)` functions (both async-safe).
 *
 * Applied migrations are tracked in the `_migrations` table, which records
 * the filename and batch number so rollbacks can undo an entire batch.
 *
 * The `_migrations` table uses `name` as the primary key (the migration
 * filename is unique by design) to avoid dialect-specific auto-increment SQL.
 */
export class Migrator {
  /**
   * @param {import('./adapters/base.js').DatabaseAdapter} db
   * @param {string} [migrationsDir]  Absolute or relative path to the
   *                                   migrations folder (default: `./migrations`).
   */
  constructor(db, migrationsDir = 'migrations') {
    this.db = db;
    this.migrationsDir = resolve(migrationsDir);
  }

  /* ------------------------------------------------------------------ */
  /*  Initialisation                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Ensure the `_migrations` tracking table exists.
   * Must be called once before using `pending()`, `up()`, or `down()`.
   * @returns {Promise<void>}
   */
  async init() {
    await this.#ensureMigrationsTable();
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Return the list of migration filenames that have not yet been applied.
   * @returns {Promise<string[]>}
   */
  async pending() {
    const all = await this.#readMigrationFiles();
    const applied = await this.#appliedNames();
    return all.filter(f => !applied.has(f));
  }

  /**
   * Apply all pending migrations.
   * @returns {Promise<string[]>}  List of filenames that were applied.
   */
  async up() {
    const pendingFiles = await this.pending();
    if (pendingFiles.length === 0) return [];

    const batch = await this.#nextBatch();

    for (const file of pendingFiles) {
      const mod = await this.#loadMigration(file);
      await this.db.transaction(async (db) => {
        await mod.up(db);
        await db.run(
          'INSERT INTO _migrations (name, batch, applied_at) VALUES (?, ?, ?)',
          [file, batch, new Date().toISOString()],
        );
      });
    }

    return pendingFiles;
  }

  /**
   * Roll back the latest batch of migrations.
   * @returns {Promise<string[]>}  List of filenames that were rolled back.
   */
  async down() {
    const lastBatch = await this.db.get(
      'SELECT MAX(batch) AS batch FROM _migrations',
    );
    if (!lastBatch?.batch) return [];

    const rows = await this.db.all(
      'SELECT name FROM _migrations WHERE batch = ? ORDER BY name DESC',
      [lastBatch.batch],
    );

    for (const row of rows) {
      const mod = await this.#loadMigration(row.name);
      await this.db.transaction(async (db) => {
        await mod.down(db);
        await db.run('DELETE FROM _migrations WHERE name = ?', [row.name]);
      });
    }

    return rows.map(r => r.name);
  }

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                   */
  /* ------------------------------------------------------------------ */

  async #ensureMigrationsTable() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       VARCHAR(255) PRIMARY KEY NOT NULL,
        batch      INTEGER NOT NULL,
        applied_at VARCHAR(255) NOT NULL
      );
    `);
  }

  /** @returns {Promise<Set<string>>} */
  async #appliedNames() {
    const rows = await this.db.all('SELECT name FROM _migrations');
    return new Set(rows.map(r => r.name));
  }

  /** @returns {Promise<number>} */
  async #nextBatch() {
    const row = await this.db.get('SELECT MAX(batch) AS batch FROM _migrations');
    return (Number(row?.batch) || 0) + 1;
  }

  /**
   * Read and sort migration filenames from the migrations directory.
   * @returns {Promise<string[]>}
   */
  async #readMigrationFiles() {
    try {
      const entries = await readdir(this.migrationsDir);
      return entries
        .filter(f => /^\d+_.+\.js$/.test(f))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Dynamically import a migration module.
   * @param {string} filename
   * @returns {Promise<{ up: Function, down: Function }>}
   */
  async #loadMigration(filename) {
    const fullPath = join(this.migrationsDir, filename);
    const fileUrl = pathToFileURL(fullPath).href;
    return import(fileUrl);
  }
}
