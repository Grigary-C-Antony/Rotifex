![banner](https://raw.githubusercontent.com/Grigary-C-Antony/Rotifex/master/banner-1.png)

<div align="center">

[![npm version](https://img.shields.io/npm/v/rotifex?color=4f6ef7&label=npm)](https://www.npmjs.com/package/rotifex)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Self-hosted backend platform. Define a schema, get a full REST API instantly.**

[Documentation](https://rotifex-docs.vercel.app/) · [Full Reference](README-final.md) · [npm](https://www.npmjs.com/package/rotifex)

</div>

---

## What is Rotifex?

Rotifex is a self-hosted backend-as-a-service that turns a JSON schema into a production-ready REST API in seconds — no code generation, no restart. It ships with JWT authentication, file storage, AI/LLM integration, and a full admin dashboard.

Think Supabase or Firebase, but running entirely on your own machine.

---

## Key Features

| Feature               | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| **Schema-driven API** | Define models in JSON or the visual editor — get 5 CRUD endpoints instantly    |
| **Live updates**      | Add or remove models at runtime without restarting the server                  |
| **JWT Auth**          | Register, login, refresh tokens, role-based access, secure first-run setup     |
| **File Storage**      | Public and private uploads with HMAC-signed URLs                               |
| **AI / LLM**          | Connect OpenAI, Anthropic, Gemini, or Ollama from one unified API              |
| **AI Agents**         | ReAct-loop agents with tools: calculator, web search, HTTP, DB query, datetime |
| **Admin Dashboard**   | React SPA for managing everything — schemas, users, files, AI, logs, settings  |
| **Production-ready**  | Rate limiting, CORS, structured logging, SQLite, auto-rotating JWT secrets     |

---

## Quick Start

**Install and run:**

```bash
npm install rotifex
npm start
```

**Or without installing:**

```bash
npx rotifex start
```

Open `http://localhost:4994` in your browser. On first run you will see a setup screen — create your admin account and you are ready to go.

> **Save your password.** There is no password recovery. If you ever lose access, run `rotifex reset-admin --yes` from the terminal.

---

## How It Works

**1. Define your schema** (`schema.json` or the visual editor in the dashboard):

```json
{
  "Product": {
    "fields": {
      "name": { "type": "string", "required": true },
      "price": "number",
      "in_stock": "boolean"
    }
  }
}
```

**2. Instant REST API** — no restart needed:

```bash
# Create
curl -X POST http://localhost:4994/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":9.99,"in_stock":true}'

# List with filter + sort
curl "http://localhost:4994/api/products?sort=price&order=ASC&in_stock=1"
```

**3. Add AI** — configure a provider in the dashboard and call it:

```bash
curl -X POST http://localhost:4994/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","model":"gpt-4o","prompt":"Summarize this product catalog."}'
```

---

## CLI Commands

| Command                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `rotifex start`             | Start the server (default port `4994`)            |
| `rotifex start --port 4000` | Start on a custom port                            |
| `rotifex start --verbose`   | Enable debug logging                              |
| `rotifex migrate`           | Run pending database migrations                   |
| `rotifex reset-admin --yes` | Delete admin accounts and re-run first-time setup |

---

## Architecture

```
┌─────────────────────────────────────────┐
│             Rotifex Server              │
│                                         │
│  Fastify HTTP  ·  Schema Engine (live)  │
│  JWT Auth      ·  SQLite (better-sqlite3│
│  File Storage  ·  AI / Agent System     │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   Admin SPA  (React 19 + Vite)   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

- **Runtime:** Node.js ≥ 18, Fastify v5
- **Database:** SQLite via `better-sqlite3`
- **Frontend:** React 19 + Vite, served as a static SPA at `/`
- **AI providers:** OpenAI, Anthropic, Google Gemini, Ollama (local)

---

## Admin Dashboard

The built-in SPA at `http://localhost:4994` gives you:

- **Dashboard** — live stats: schemas, records, users, files, storage, uptime
- **Database Schemas** — visual model builder, create and delete models on the fly
- **User Management** — list users, create accounts, reset passwords
- **File Browser** — browse, preview, download, and delete uploads
- **AI Integration** — configure providers, playground (generate + chat), agent builder
- **Server Logs** — real-time structured log viewer with level filtering
- **Settings** — edit all environment variables without touching files

---

## Full Documentation

For the complete API reference, all endpoint details, deployment guides, example workflows, and configuration options see:

**[README-final.md](README-final.md)**

Or visit the hosted docs at [rotifex-docs.vercel.app](https://rotifex-docs.vercel.app/)

---

## License

MIT
