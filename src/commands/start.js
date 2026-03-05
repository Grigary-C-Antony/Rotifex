import { execSync, spawnSync } from 'node:child_process';
import { logger } from '../lib/logger.js';
import { loadConfig } from '../lib/config.js';
import { createServer } from '../server/index.js';

/**
 * Try to load better-sqlite3. If the native addon is stale or compiled for
 * a different platform/Node version, rebuild it and re-exec this process.
 */
async function ensureSqlite() {
  try {
    await import('better-sqlite3');
  } catch (err) {
    const isNativeError =
      err.code === 'ERR_DLOPEN_FAILED' ||
      (err.message && (
        err.message.includes('not a valid Win32') ||
        err.message.includes('NODE_MODULE_VERSION') ||
        err.message.includes('was compiled against a different')
      ));

    if (!isNativeError) throw err;

    logger.warn('SQLite native addon is stale — rebuilding for this platform...');
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
    logger.success('Rebuilt! Restarting...');

    // Re-exec the exact same command in a fresh process
    const result = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
    process.exit(result.status ?? 0);
  }
}

/**
 * Register the `rotifex start` command.
 *
 * Starts the Rotifex development server.
 *
 * @param {import('commander').Command} program
 */
export function registerStartCommand(program) {
  program
    .command('start')
    .description('Start the Rotifex development server')
    .option('-p, --port <port>', 'Port to bind to')
    .option('--host <host>', 'Host to bind to')
    .option('--verbose', 'Enable verbose logging')
    .action(async (options) => {
      await ensureSqlite();

      console.log(`
  ██████╗  ██████╗ ████████╗██╗███████╗███████╗██╗  ██╗
  ██╔══██╗██╔═══██╗╚══██╔══╝██║██╔════╝██╔════╝╚██╗██╔╝
  ██████╔╝██║   ██║   ██║   ██║█████╗  █████╗   ╚███╔╝
  ██╔══██╗██║   ██║   ██║   ██║██╔══╝  ██╔══╝   ██╔██╗
  ██║  ██║╚██████╔╝   ██║   ██║██║     ███████╗██╔╝ ██╗
  ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
`);

      try {
        // ── Build config ──────────────────────────────────────────────
        const cliOverrides = { server: {} };
        if (options.port) cliOverrides.server.port = Number(options.port);
        if (options.host) cliOverrides.server.host = options.host;
        if (options.verbose) cliOverrides.logging = { level: 'debug' };

        const config = loadConfig({ cliOverrides });

        // ── Create & start server ─────────────────────────────────────
        const app = await createServer(config);

        await app.listen({
          port: config.server.port,
          host: config.server.host,
          listenTextResolver: () => '',
        });

        const host = config.server.host === '0.0.0.0' ? 'localhost' : config.server.host;
        logger.success(`Rotifex is alive! Listening at http://${host}:${config.server.port}`);

        // ── Graceful shutdown ─────────────────────────────────────────
        const shutdown = async (signal) => {
          logger.warn(`\n${signal} received — wrapping up, bye!`);
          await app.close();
          logger.success('Server stopped. See you next time.');
          process.exit(0);
        };

        process.on('SIGINT',  () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
      } catch (err) {
        logger.error(`Failed to start server: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
