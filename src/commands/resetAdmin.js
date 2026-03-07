import { logger } from '../lib/logger.js';
import { getDatabase, closeDatabase } from '../db/index.js';

/**
 * Register the `rotifex reset-admin` command.
 *
 * Deletes all admin accounts from the database so the first-run setup
 * screen reappears on the next dashboard visit.
 *
 * Requires --yes to prevent accidental execution.
 *
 * @param {import('commander').Command} program
 */
export function registerResetAdminCommand(program) {
  program
    .command('reset-admin')
    .description('Delete all admin accounts so the setup screen reappears')
    .option('--yes', 'Confirm the destructive operation')
    .action(async (options) => {
      if (!options.yes) {
        logger.error(
          'This will delete all admin accounts. Re-run with --yes to confirm:\n' +
          '  rotifex reset-admin --yes',
        );
        process.exitCode = 1;
        return;
      }

      try {
        const db = getDatabase();

        const row = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
        const count = row?.count ?? 0;

        if (count === 0) {
          logger.info('No admin accounts found — nothing to remove.');
          closeDatabase();
          return;
        }

        db.run("DELETE FROM users WHERE role = 'admin'");
        closeDatabase();

        logger.success(
          `Removed ${count} admin account${count !== 1 ? 's' : ''}. ` +
          'Open the dashboard to run first-time setup again.',
        );
      } catch (err) {
        logger.error(`reset-admin failed: ${err.message}`);
        closeDatabase();
        process.exitCode = 1;
      }
    });
}
