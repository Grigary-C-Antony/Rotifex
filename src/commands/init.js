import { logger } from '../lib/logger.js';

/**
 * Register the `rotifex init` command.
 *
 * Scaffolds a new Rotifex project in the current directory.
 *
 * @param {import('commander').Command} program
 */
export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize a new Rotifex project in the current directory')
    .option('-n, --name <name>', 'Project name')
    .option('--force', 'Overwrite existing configuration')
    .action((options) => {
      logger.info('Initializing Rotifex project…');

      if (options.name) {
        logger.info(`Project name: ${options.name}`);
      }

      if (options.force) {
        logger.warn('Force mode enabled — existing config will be overwritten.');
      }

      // TODO: Implement project scaffolding logic
      logger.success('Project initialized successfully. (scaffold placeholder)');
    });
}
