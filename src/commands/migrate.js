import { logger } from '../lib/logger.js';
import { getDatabase, closeDatabase, Migrator } from '../db/index.js';

/**
 * Register the `rotifex migrate` command.
 *
 * Runs database migrations using the file-based Migrator.
 *
 * @param {import('commander').Command} program
 */
export function registerMigrateCommand(program) {
  program
    .command('migrate')
    .description('Run pending migrations')
    .option('--dry-run', 'Preview migrations without applying them')
    .option('--rollback', 'Roll back the last batch of migrations')
    .action(async (options) => {
      try {
        const db = getDatabase();
        const migrator = new Migrator(db);

        if (options.rollback) {
          logger.warn('Rolling back last migration batch…');
          const rolled = await migrator.down();
          if (rolled.length === 0) {
            logger.info('Nothing to roll back.');
          } else {
            rolled.forEach(f => logger.info(`  ↩ ${f}`));
            logger.success(`Rolled back ${rolled.length} migration(s).`);
          }
          closeDatabase();
          return;
        }

        const pending = await migrator.pending();

        if (pending.length === 0) {
          logger.success('No pending migrations.');
          closeDatabase();
          return;
        }

        if (options.dryRun) {
          logger.info('Dry-run mode — the following migrations would be applied:');
          pending.forEach(f => logger.info(`  ▸ ${f}`));
          closeDatabase();
          return;
        }

        logger.info('Running migrations…');
        const applied = await migrator.up();
        applied.forEach(f => logger.info(`  ✔ ${f}`));
        logger.success(`Applied ${applied.length} migration(s).`);

        closeDatabase();
      } catch (err) {
        logger.error(`Migration failed: ${err.message}`);
        closeDatabase();
        process.exitCode = 1;
      }
    });
}
