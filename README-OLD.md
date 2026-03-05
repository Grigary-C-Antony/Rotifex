# Rotifex

> A modern CLI toolkit for project scaffolding, development, and migrations.

## Installation

```bash
npm install -g rotifex
```

Or run directly with `npx`:

```bash
npx rotifex <command>
```

## Commands

| Command   | Description                                        |
| --------- | -------------------------------------------------- |
| `init`    | Initialize a new Rotifex project                   |
| `start`   | Start the Rotifex development server               |
| `migrate` | Run pending migrations                             |

### `rotifex init`

```bash
npx rotifex init [--name <name>] [--force]
```

### `rotifex start`

```bash
npx rotifex start [--port <port>] [--verbose]
```

### `rotifex migrate`

```bash
npx rotifex migrate [--dry-run] [--rollback]
```

## Development

```bash
git clone <repo-url>
cd rotifex
npm install
node bin/rotifex.js --help
```

## License

MIT
