#!/usr/bin/env node

import { program } from 'commander';
import { registerInitCommand } from '../src/commands/init.js';
import { registerStartCommand } from '../src/commands/start.js';
import { registerMigrateCommand } from '../src/commands/migrate.js';
import { registerResetAdminCommand } from '../src/commands/resetAdmin.js';

program
  .name('rotifex')
  .description('Rotifex — a modern CLI toolkit for project scaffolding, development, and migrations.')
  .version('0.1.0');

// Register subcommands
registerInitCommand(program);
registerStartCommand(program);
registerMigrateCommand(program);
registerResetAdminCommand(program);

program.parse(process.argv);
