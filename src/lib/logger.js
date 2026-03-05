import chalk from 'chalk';

/**
 * Shared logger utility with coloured, prefixed output.
 */
export const logger = {
  /** Informational message (cyan) */
  info(message) {
    console.log(`${chalk.cyan('ℹ')}  ${message}`);
  },

  /** Success message (green) */
  success(message) {
    console.log(`${chalk.green('✔')}  ${message}`);
  },

  /** Warning message (yellow) */
  warn(message) {
    console.log(`${chalk.yellow('⚠')}  ${message}`);
  },

  /** Error message (red) — prints to stderr */
  error(message) {
    console.error(`${chalk.red('✖')}  ${message}`);
  },
};
