![banner](https://raw.githubusercontent.com/Grigary-C-Antony/Rotifex/master/banner-1.png)

# Rotifex — Full Documentation

> Rotifex is a self-hosted backend platform that instantly generates APIs, authentication, storage, and AI features from a simple schema. For the hosted documentation site visit [Docs](https://rotifex-docs.vercel.app/)

---

## Installation

```bash
npm i rotifex
```

Then start the server:

```bash
npm start
```

Or run directly without installing:

```bash
npx rotifex start
```

## Commands

| Command       | Description                                                           |
| ------------- | --------------------------------------------------------------------- |
| `start`       | Start the Rotifex development server                                  |
| `migrate`     | Run pending database migrations                                       |
| `reset-admin` | Delete all admin accounts so the first-run setup screen reappears     |

### `start` flags

| Flag             | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `-p, --port <n>` | TCP port to listen on (overrides `ROTIFEX_PORT` and auto-fallback) |
| `--host <host>`  | Bind address (overrides `ROTIFEX_HOST`)                            |
| `--verbose`      | Enable debug-level logging                                         |

**Port auto-fallback:** If no port is explicitly set, Rotifex tries port `4994`, then `4995`, then `4996`. If all three are occupied it exits with a clear error. Pass `--port` or set `ROTIFEX_PORT` to pin a specific port and skip the fallback.

### `reset-admin` flags

| Flag    | Description                              |
| ------- | ---------------------------------------- |
| `--yes` | Required confirmation for the operation  |

**Usage:** Deletes all admin accounts from the database. The first-run setup screen will reappear in the dashboard on the next visit. Requires `--yes` to prevent accidental execution.

```bash
rotifex reset-admin --yes
```

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Feature Documentation](#2-feature-documentation)
3. [API Documentation](#3-api-documentation)
4. [Authentication](#4-authentication)
5. [Models / Data Structures](#5-models--data-structures)
6. [AI / LLM Integration](#6-ai--llm-integration)
7. [File Storage / Media Handling](#7-file-storage--media-handling)
8. [Admin Panel Features](#8-admin-panel-features)
9. [Error Handling](#9-error-handling)
10. [Environment Configuration](#10-environment-configuration)
11. [Deployment](#11-deployment)
12. [Example Workflows](#12-example-workflows)
13. [Notes for Documentation Generators](#13-notes-for-documentation-generators)

---

## 1. Application Overview

### Description

**Rotifex** is a self-hosted backend-as-a-service platform. It lets developers define data models through a JSON schema file or a visual admin panel, and instantly get a full REST API — no code generation required. It ships with JWT authentication, file storage, AI/LLM integration, agent execution, and a built-in admin dashboard.

### Core Purpose

Rotifex eliminates boilerplate for backend development. Instead of writing CRUD endpoints, migrations, and auth logic manually, developers define a schema and Rotifex handles everything: table creation, route registration, validation, pagination, filtering, and sorting — live, without restarts.

### Key Capabilities

- **Schema-driven REST API** — define a model, get five CRUD endpoints instantly
- **Live schema updates** — add or remove models at runtime without restarting the server
- **JWT Authentication** — register, login, refresh tokens, role-based access control
- **Secure first-run setup** — admin account created through a dedicated setup screen; public registration always creates regular users
- **File storage** — upload, download, manage public and private files with signed URLs
- **AI/LLM integration** — connect OpenAI, Anthropic, Gemini, and Ollama; generate and chat
- **AI Agents** — ReAct-loop agents with tools: calculator, web search, HTTP GET, DB query, datetime
- **Token usage tracking** — persistent per-provider token consumption logged to disk
- **Admin dashboard** — full SPA for managing schemas, users, files, AI providers, agents, logs, and settings
- **Rate limiting, CORS, structured logging** — production-ready out of the box

### Target Users

- Solo developers who need a backend quickly
- Startups prototyping a product without a dedicated backend engineer
- Internal tools teams who need structured data storage with an admin interface
- Developers integrating LLMs into their applications

### Architecture Overview

```
+-----------------------------------------------------+
|                    Rotifex Server                   |
|  +----------+  +------------+  +-----------------+  |
|  |  Fastify  |  |  Schema    |  |  SQLite (via    |  |
|  |  HTTP     |  |  Engine    |  |  better-sqlite3)|  |
|  |  Server   |  |  (live)    |  |                 |  |
|  +----------+  +------------+  +-----------------+  |
|  +----------+  +------------+  +-----------------+  |
|  |  JWT     |  |  Storage   |  |  AI / Agents    |  |
|  |  Auth    |  |  Manager   |  |  System         |  |
|  +----------+  +------------+  +-----------------+  |
|  +------------------------------------------------+  |
|         Admin SPA (React + Vite)                     |
|  +------------------------------------------------+  |
+-----------------------------------------------------+
```

- **Framework:** Fastify v5 (Node.js)
- **Database:** SQLite via `better-sqlite3`
- **Admin frontend:** React 19 + Vite, served as a static SPA from `/`
- **Config format:** JSON (`schema.json`, `ai.config.json`, `agents.config.json`)
- **Persistence:** `.env` for secrets, JSON files for AI/agent config, SQLite for all app data

---

## 2. Feature Documentation

### 2.1 Dynamic REST Engine

**Description:** The core of Rotifex. Reads `schema.json`, creates SQLite tables, and registers five CRUD routes per model — all at startup and live when models are added via the admin API.

**Use case:** A developer defines a `Product` model with `name`, `price`, and `in_stock` fields. Rotifex immediately exposes `/api/products` with full CRUD, filtering, sorting, and pagination — no restart needed.

**How it works:**

1. `schema.json` is parsed by `schemaLoader.js` into normalized model definitions.
2. `tableSync.js` runs `CREATE TABLE IF NOT EXISTS` for each model. On subsequent startups it **automatically adds missing columns** via `ALTER TABLE ADD COLUMN` — no manual migrations needed when fields are added to an existing model.
3. `routeFactory.js` registers generic parametric routes (`/api/:table`) that resolve the model from an in-memory store at request time.
4. When a model is added/removed via the admin API, the in-memory store is updated and routes resolve immediately.

**Field types supported:**

| Schema Type | SQLite Type | Notes         |
| ----------- | ----------- | ------------- |
| `string`    | `TEXT`      |               |
| `number`    | `REAL`      | Float         |
| `integer`   | `INTEGER`   |               |
| `boolean`   | `INTEGER`   | Stored as 0/1 |

**Field definition formats:**

```json
// Shorthand
{ "name": "string" }

// Full form
{
  "name": {
    "type": "string",
    "required": true,
    "unique": false,
    "default": "Unnamed"
  }
}
```

**Auto-generated columns:** Every model automatically gets `id` (UUID), `created_at` (ISO 8601), and `updated_at` (ISO 8601).

**Table naming:** Model names are lowercased and pluralized. `Product` -> table `products`, route `/api/products`.

---

### 2.2 JWT Authentication

**Description:** Full authentication system with access tokens, refresh tokens, token rotation, logout/revocation, password hashing, and role-based access control.

**Use case:** Secure user registration and login for a Rotifex-backed application. Protect admin routes from regular users.

**How it works:**

1. On first run, the admin account is created through the `/setup` endpoint (accessible from the dashboard setup screen).
2. `POST /auth/register` hashes the password with bcrypt (12 rounds) and inserts a user row with role `user` — the role field is not accepted from the request body.
3. `POST /auth/login` verifies credentials and issues a short-lived access token and long-lived refresh token.
4. The JWT middleware runs on every non-public request, verifies the `Authorization: Bearer` header, and injects `x-user-id` / `x-user-role` headers that downstream routes use for authorization. These headers are always stripped from incoming requests first, so they cannot be forged by clients.
5. `POST /auth/refresh` issues a new token pair and **revokes the consumed refresh token** (single-use rotation). Each refresh token embeds a unique `jti` (JWT ID) used for targeted revocation.
6. `POST /auth/logout` invalidates the provided refresh token immediately.
7. `POST /auth/change-password` lets an authenticated user change their own password.

**Token TTLs are configurable** via env vars (see Section 10). Defaults: access token 60 minutes, refresh token 30 days. The refresh TTL must be at least 2× the access TTL and no shorter than 2 hours.

**Roles:** `user` (default via public registration) and `admin`. Admin access is required for all `/admin/api/*` endpoints. Admins are created only via `/setup` (first run) or the admin user management panel.

**Password rules:**

- Minimum 8 characters
- At least one letter
- At least one number

---

### 2.3 File Storage

**Description:** Upload, download, list, and delete files. Supports public and private visibility with HMAC-signed URLs for private file access.

**Use case:** Allow users to upload profile pictures, documents, or any binary files. Private files can only be accessed by their uploader or admins, or via a time-limited signed URL.

**How it works:**

1. Files are uploaded via multipart form to `POST /files/upload`.
2. The `StorageManager` validates MIME type and per-user storage quota.
3. Files are stored on disk with UUID-based names in separate `public/` and `private/` directories.
4. Metadata (name, MIME type, size, uploader, visibility) is recorded in the `_files` SQLite table.
5. Private files require a signed URL generated by `GET /files/:id/signed-url`. The URL includes an HMAC token and expiry timestamp; it is verified on download.

---

### 2.4 AI / LLM Integration

**Description:** Connect multiple LLM providers and use them for text generation and multi-turn chat from a unified API.

**Use case:** Add AI-powered features to your application — content generation, Q&A, summarization — using whichever provider you have access to.

**How it works:**

1. Providers (OpenAI, Anthropic, Gemini, Ollama) are configured via the admin panel; API keys are stored in `ai.config.json`.
2. `POST /api/ai/generate` and `POST /api/ai/chat` proxy requests to the selected provider using native `fetch`.
3. Each call records token usage to `ai.usage.json` for persistent tracking.

---

### 2.5 AI Agents

**Description:** Configurable AI agents that use a ReAct (Reasoning + Acting) loop to complete multi-step tasks using tools.

**Use case:** An agent tasked with "What's 15% of the current Bitcoin price?" will search the web for the price, then use the calculator tool to compute the result — all automatically.

**How it works:**

1. Agents are defined with a name, provider, model, system prompt, tool list, temperature, and iteration limits.
2. When run, the agent sends the task to the LLM with tool definitions.
3. If the LLM calls a tool, the tool is executed and the result is appended to the conversation.
4. The loop continues until the LLM returns a final answer or `maxIterations` is reached.
5. Steps (thinking, tool call, tool result, final answer) are returned for inspection.

**Available tools:**

| Tool             | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `get_datetime`   | Returns current ISO 8601 datetime, UTC string, and Unix timestamp        |
| `calculate`      | Safely evaluates math expressions (`+`, `-`, `*`, `/`, `%`, parentheses) |
| `web_search`     | DuckDuckGo instant-answer search (no API key required)                   |
| `http_get`       | Makes HTTP GET requests to public URLs; returns up to 4000 chars of body |
| `database_query` | Runs read-only `SELECT` queries on the Rotifex SQLite database           |

---

### 2.6 Admin Dashboard

**Description:** A React SPA served at `/` providing a visual interface for all administrative operations.

**First-run setup:** On the very first visit (before any admin account exists), the dashboard shows a setup screen prompting you to create the admin account. This is the only way to create an admin — the public registration endpoint always creates regular users.

**Tabs:**

- **Dashboard** — stat cards (schemas, records, users, files, storage, connected LLMs, agents, uptime, status) and overview tables
- **Database Schemas** — create, view, and delete data models
- **User Management** — view and manage registered users
- **File Browser** — browse, preview, and delete uploaded files
- **AI Integration** — configure providers, playground for generate/chat, agent management, API docs
- **Server Logs** — real-time in-memory log viewer with level filtering
- **Settings** — edit environment variables (port, CORS, rate limits, JWT secrets, storage limits)

---

## 3. API Documentation

### Base URL

```
http://localhost:4994
```

All API responses follow the envelope format:

- **Success:** `{ "data": <payload>, "meta"?: <pagination> }`
- **Error:** `{ "error": "<type>", "message": "<detail>", "statusCode": <number> }`

---

### 3.1 Health

#### `GET /health`

Check server status.

**Auth:** None

**Response:**

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

---

### 3.2 First-Run Setup Endpoints

These endpoints handle the initial admin account creation. They are public (no auth required) and the `POST /setup` endpoint rejects all requests once an admin already exists.

#### `GET /setup/status`

Check whether first-run setup is still needed.

**Auth:** None

**Response:**

```json
{ "needsSetup": true }
```

| Field        | Type    | Description                                   |
| ------------ | ------- | --------------------------------------------- |
| `needsSetup` | boolean | `true` if no admin account exists yet         |

---

#### `POST /setup`

Create the one-and-only admin account. Rejected with `409` if any admin already exists.

**Auth:** None

**Request Body:**

```json
{
  "email": "admin@example.com",
  "password": "secure123",
  "display_name": "Jane Doe"
}
```

| Field          | Type   | Required | Notes                             |
| -------------- | ------ | -------- | --------------------------------- |
| `email`        | string | Yes      | Must be a valid email             |
| `password`     | string | Yes      | Min 8 chars, 1 letter, 1 number   |
| `display_name` | string | No       | Display name                      |

**Response `201`:**

```json
{
  "data": {
    "id": "uuid",
    "email": "admin@example.com",
    "display_name": "Jane Doe",
    "role": "admin",
    "created_at": "2026-03-06T12:00:00.000Z"
  },
  "message": "Admin account created. You can now sign in.",
  "warning": "There is no password recovery. Store your credentials in a safe place."
}
```

**Errors:**

| Code  | Reason                                           |
| ----- | ------------------------------------------------ |
| `400` | Validation failed (invalid email, weak password) |
| `409` | Setup already completed — an admin exists        |

---

### 3.3 Authentication Endpoints

#### `POST /auth/register`

Register a new user. Always creates a `user` role — admin accounts cannot be created through this endpoint.

**Auth:** None

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "display_name": "Jane Doe"
}
```

| Field          | Type   | Required | Notes                           |
| -------------- | ------ | -------- | ------------------------------- |
| `email`        | string | Yes      | Must be a valid email           |
| `password`     | string | Yes      | Min 8 chars, 1 letter, 1 number |
| `display_name` | string | No       | Display name                    |

**Response `201`:**

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Jane Doe",
    "role": "user",
    "created_at": "2026-03-06T12:00:00.000Z"
  },
  "message": "User registered successfully"
}
```

**Errors:**

| Code  | Reason                                           |
| ----- | ------------------------------------------------ |
| `400` | Validation failed (invalid email, weak password) |
| `409` | Email already in use                             |

---

#### `POST /auth/login`

Authenticate and receive tokens.

**Auth:** None

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Response `200`:**

```json
{
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "Jane Doe",
      "role": "user"
    }
  }
}
```

**Errors:**

| Code  | Reason                    |
| ----- | ------------------------- |
| `400` | Missing email or password |
| `401` | Invalid credentials       |

---

#### `POST /auth/refresh`

Exchange a refresh token for a new token pair. The consumed refresh token is immediately revoked (single-use rotation).

**Auth:** None

**Request Body:**

```json
{
  "refreshToken": "<jwt>"
}
```

**Response `200`:**

```json
{
  "data": {
    "accessToken": "<new-jwt>",
    "refreshToken": "<new-jwt>"
  }
}
```

**Errors:**

| Code  | Reason                                     |
| ----- | ------------------------------------------ |
| `400` | Missing refreshToken                       |
| `401` | Invalid, expired, or already-revoked token |

---

#### `POST /auth/logout`

Revoke a refresh token. After this call the token cannot be used to issue new pairs.

**Auth:** None

**Request Body:**

```json
{
  "refreshToken": "<jwt>"
}
```

**Response `204`:** No content.

---

#### `POST /auth/change-password`

Change the authenticated user's own password.

**Auth:** `Authorization: Bearer <accessToken>`

**Request Body:**

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password123"
}
```

**Response `204`:** No content.

**Errors:**

| Code  | Reason                              |
| ----- | ----------------------------------- |
| `400` | Missing fields or weak new password |
| `401` | Wrong current password / bad token  |
| `404` | User not found                      |

---

#### `GET /auth/me`

Return the currently authenticated user.

**Auth:** `Authorization: Bearer <accessToken>`

**Response `200`:**

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Jane Doe",
    "role": "user",
    "created_at": "2026-03-06T12:00:00.000Z"
  }
}
```

**Errors:**

| Code  | Reason                   |
| ----- | ------------------------ |
| `401` | Missing or invalid token |
| `404` | User not found           |

---

### 3.4 Dynamic CRUD Endpoints

These endpoints are available for every model defined in `schema.json`. Replace `:table` with the model's table name (e.g. `products` for a `Product` model).

#### `GET /api/:table`

List records with filtering, sorting, and pagination.

**Auth:** Optional

**Query Parameters:**

| Parameter | Type    | Default      | Description                              |
| --------- | ------- | ------------ | ---------------------------------------- |
| `page`    | integer | `1`          | Page number                              |
| `limit`   | integer | `20`         | Records per page (max 100)               |
| `sort`    | string  | `created_at` | Field to sort by                         |
| `order`   | string  | `DESC`       | `ASC` or `DESC`                          |
| `<field>` | any     | —            | Filter by exact value on any model field |

**Example:** `GET /api/products?sort=price&order=ASC&page=2&limit=10&in_stock=1`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Widget",
      "price": 9.99,
      "in_stock": 1,
      "created_at": "2026-03-06T12:00:00.000Z",
      "updated_at": "2026-03-06T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 2,
    "limit": 10,
    "pages": 5
  }
}
```

---

#### `GET /api/:table/:id`

Get a single record by ID.

**Response `200`:**

```json
{
  "data": {
    "id": "uuid",
    "name": "Widget",
    "price": 9.99
  }
}
```

**Errors:**

| Code  | Reason                            |
| ----- | --------------------------------- |
| `404` | Record not found or unknown table |

---

#### `POST /api/:table`

Create a new record.

**Auth:** Optional

**Request Body:** JSON object matching the model's field definitions.

```json
{
  "name": "Widget",
  "price": 9.99,
  "in_stock": true
}
```

**Response `201`:**

```json
{
  "data": {
    "id": "uuid",
    "name": "Widget",
    "price": 9.99,
    "in_stock": 1,
    "created_at": "2026-03-06T12:00:00.000Z",
    "updated_at": "2026-03-06T12:00:00.000Z"
  }
}
```

**Errors:**

| Code  | Reason                                                  |
| ----- | ------------------------------------------------------- |
| `400` | Validation error (missing required fields, wrong types) |
| `404` | Unknown table                                           |

---

#### `PUT /api/:table/:id`

Update a record (partial — only send fields to change).

**Request Body:**

```json
{
  "price": 14.99
}
```

**Response `200`:**

```json
{
  "data": {
    "id": "uuid",
    "name": "Widget",
    "price": 14.99
  }
}
```

**Errors:**

| Code  | Reason                                 |
| ----- | -------------------------------------- |
| `400` | Validation error or no fields provided |
| `404` | Record or table not found              |

---

#### `DELETE /api/:table/:id`

Delete a record.

**Response:** `204 No Content`

**Errors:**

| Code  | Reason                    |
| ----- | ------------------------- |
| `404` | Record or table not found |

---

### 3.5 File Endpoints

#### `POST /files/upload`

Upload a file.

**Auth:** Optional (identity from JWT `Authorization` header)

**Request:** `multipart/form-data`

| Field        | Type   | Required | Description                         |
| ------------ | ------ | -------- | ----------------------------------- |
| `file`       | file   | Yes      | The file to upload                  |
| `visibility` | string | No       | `"public"` (default) or `"private"` |

**Response `201`:**

```json
{
  "data": {
    "id": "uuid",
    "original_name": "photo.jpg",
    "stored_name": "uuid.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 204800,
    "visibility": "public",
    "uploader_id": "user-uuid",
    "created_at": "2026-03-06T12:00:00.000Z"
  }
}
```

**Errors:**

| Code  | Reason                                    |
| ----- | ----------------------------------------- |
| `400` | No file provided, invalid visibility      |
| `413` | File exceeds size limit or per-user quota |

---

#### `GET /files`

List files. Admins see all files; other users see only their own.

**Response `200`:**

```json
{
  "data": [
    /* array of file metadata objects */
  ],
  "meta": { "total": 5 }
}
```

---

#### `GET /files/:id`

Get metadata for a single file.

**Errors:**

| Code  | Reason                      |
| ----- | --------------------------- |
| `403` | Not the owner and not admin |
| `404` | File not found              |

---

#### `GET /files/:id/download`

Download a file. Public files are accessible directly. Private files require a signed URL.

**Query Parameters (private files only):**

| Parameter | Description                        |
| --------- | ---------------------------------- |
| `token`   | HMAC token from the signed URL     |
| `expires` | Unix timestamp from the signed URL |

**Response:** File stream with appropriate `Content-Type` and `Content-Disposition` headers.

**Errors:**

| Code  | Reason                                         |
| ----- | ---------------------------------------------- |
| `403` | Private file accessed without valid signed URL |
| `404` | File not found                                 |

---

#### `GET /files/:id/signed-url`

Generate a time-limited signed URL for a private file.

**Auth:** Must be the file owner or admin.

**Response `200`:**

```json
{
  "data": {
    "url": "http://localhost:4994/files/uuid/download?token=abc123&expires=1741300000",
    "expires": 1741300000
  }
}
```

**Errors:**

| Code  | Reason                      |
| ----- | --------------------------- |
| `400` | File is not private         |
| `403` | Not the owner and not admin |
| `404` | File not found              |

---

#### `DELETE /files/:id`

Delete a file from disk and database.

**Auth:** Must be the file owner or admin.

**Response:** `204 No Content`

---

### 3.6 AI Endpoints

#### `GET /api/ai/providers`

List all enabled AI providers (public).

**Response `200`:**

```json
{
  "data": [
    {
      "id": "openai",
      "label": "OpenAI",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "defaultModel": "gpt-4o"
    }
  ]
}
```

---

#### `GET /api/ai/models`

Flat list of all models across all enabled providers.

**Response `200`:**

```json
{
  "data": [
    { "provider": "openai", "providerLabel": "OpenAI", "model": "gpt-4o" },
    { "provider": "anthropic", "providerLabel": "Anthropic", "model": "claude-sonnet-4-6" }
  ]
}
```

---

#### `GET /api/ai/models/:provider`

Models for a specific provider.

**Response `200`:**

```json
{ "data": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] }
```

---

#### `POST /api/ai/generate`

Generate a single text completion.

**Request Body:**

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "prompt": "Explain quantum entanglement in one sentence.",
  "system": "You are a physics professor.",
  "maxTokens": 256,
  "temperature": 0.7
}
```

| Field         | Type    | Required | Description                                             |
| ------------- | ------- | -------- | ------------------------------------------------------- |
| `provider`    | string  | Yes      | Provider ID (`openai`, `anthropic`, `gemini`, `ollama`) |
| `prompt`      | string  | Yes      | The user prompt                                         |
| `model`       | string  | No       | Defaults to provider's `defaultModel`                   |
| `system`      | string  | No       | System instruction                                      |
| `maxTokens`   | integer | No       | Maximum tokens to generate                              |
| `temperature` | number  | No       | Sampling temperature (0-2)                              |

**Response `200`:**

```json
{
  "data": {
    "text": "Quantum entanglement is a phenomenon where two particles...",
    "model": "gpt-4o",
    "usage": {
      "prompt_tokens": 42,
      "completion_tokens": 28
    }
  }
}
```

---

#### `POST /api/ai/chat`

Multi-turn conversation.

**Request Body:**

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "messages": [
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi there! How can I help?" },
    { "role": "user", "content": "What is 2+2?" }
  ],
  "system": "You are a helpful assistant.",
  "maxTokens": 512
}
```

**Response `200`:**

```json
{
  "data": {
    "message": { "role": "assistant", "content": "2+2 equals 4." },
    "model": "claude-sonnet-4-6",
    "usage": {
      "prompt_tokens": 60,
      "completion_tokens": 12
    }
  }
}
```

---

### 3.7 Agent Endpoints

#### `GET /api/agents`

List all defined agents (public).

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Research Assistant",
      "description": "Searches the web and summarizes results",
      "provider": "openai",
      "model": "gpt-4o",
      "tools": ["web_search", "calculate"],
      "createdAt": "2026-03-06T12:00:00.000Z"
    }
  ]
}
```

---

#### `GET /api/agents/tools`

List all available tools.

**Response `200`:**

```json
{
  "data": [
    {
      "name": "calculate",
      "description": "Safely evaluate a mathematical expression...",
      "parameters": {
        "expression": { "type": "string", "description": "A math expression" }
      },
      "required": ["expression"]
    }
  ]
}
```

---

#### `POST /api/agents/:id/run`

Run an agent with a task input.

**Request Body:**

```json
{
  "input": "What is 18% tip on a $47.50 bill?"
}
```

**Response `200`:**

```json
{
  "data": {
    "agentId": "uuid",
    "agentName": "Math Helper",
    "input": "What is 18% tip on a $47.50 bill?",
    "output": "The 18% tip on a $47.50 bill is $8.55.",
    "steps": [
      { "type": "thinking", "content": "I need to calculate 18% of 47.50", "iteration": 1 },
      { "type": "tool_call", "tool": "calculate", "args": { "expression": "47.50 * 0.18" }, "iteration": 1 },
      { "type": "tool_result", "tool": "calculate", "result": "{\"result\":8.55}", "iteration": 1 },
      { "type": "final_answer", "content": "The 18% tip on a $47.50 bill is $8.55.", "iteration": 2 }
    ],
    "usage": { "prompt_tokens": 320, "completion_tokens": 85 }
  }
}
```

**Errors:**

| Code  | Reason                   |
| ----- | ------------------------ |
| `400` | Missing or empty `input` |
| `404` | Agent not found          |
| `500` | LLM provider error       |

---

### 3.8 Admin Endpoints

All admin endpoints require `Authorization: Bearer <accessToken>` where the token belongs to an `admin` role user.

#### `GET /admin/api/stats`

Dashboard statistics.

**Response `200`:**

```json
{
  "data": {
    "models": [{ "model": "Product", "table": "products", "count": 42 }],
    "users": { "count": 15 },
    "files": { "count": 8, "storageMB": 12.5 },
    "uptime": 3600,
    "ai": {
      "connectedLLMs": 2,
      "enabledLLMs": 2,
      "providers": [{ "id": "openai", "label": "OpenAI", "hasKey": true }],
      "agentsCount": 3,
      "usage": {
        "totalRequests": 120,
        "totalInputTokens": 45000,
        "totalOutputTokens": 12000
      }
    }
  }
}
```

---

#### `GET /admin/api/schema`

Get all model definitions.

---

#### `POST /admin/api/schema`

Create a new model. Routes become active immediately — no restart required.

**Request Body:**

```json
{
  "name": "Product",
  "fields": {
    "name": { "type": "string", "required": true },
    "price": "number",
    "in_stock": "boolean"
  }
}
```

**Response `201`:**

```json
{
  "data": { "name": "Product", "tableName": "products", "fields": [] },
  "message": "Model \"Product\" is live. Routes /products are active now."
}
```

**Errors:**

| Code  | Reason                                         |
| ----- | ---------------------------------------------- |
| `400` | Missing `name` or `fields`, reserved name used |
| `409` | Model with that name already exists            |

---

#### `DELETE /admin/api/schema/:name`

Remove a model. Routes are deactivated immediately; the DB table is preserved.

**Response:** `204 No Content`

---

#### `POST /admin/api/users`

Create a user from the admin panel (can set any role).

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "secure123",
  "display_name": "Jane Doe",
  "role": "user"
}
```

**Response `201`:** User object.

---

#### `PUT /admin/api/users/:id/password`

Force-reset any user's password.

**Request Body:**

```json
{ "password": "newpassword123" }
```

**Response:** `204 No Content`

---

#### `GET /admin/api/logs`

Retrieve in-memory server logs.

**Query Parameters:**

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `after`   | Unix timestamp — only return logs after this time |
| `level`   | Filter by level: `info`, `warn`, `error`, `debug` |

---

#### `GET /admin/api/env`

Read current environment/config values.

---

#### `POST /admin/api/env`

Write environment variables to `.env`. Restart required for changes to take effect.

**Request Body:**

```json
{
  "vars": {
    "ROTIFEX_PORT": "4000",
    "ROTIFEX_CORS_ORIGIN": "https://myapp.com"
  }
}
```

---

#### `GET /admin/api/ai/providers`

Get all AI providers with masked API keys.

---

#### `PUT /admin/api/ai/providers/:id`

Update a provider's configuration (enable/disable, set API key, set default model).

---

#### `GET /admin/api/agents` / `GET /admin/api/agents/:id`

List all agents or get a single agent with full detail including system prompt.

---

#### `POST /admin/api/agents`

Create an agent.

**Request Body:**

```json
{
  "name": "Research Assistant",
  "description": "Searches and summarizes web content",
  "provider": "openai",
  "model": "gpt-4o",
  "systemPrompt": "You are a research assistant. Use tools to answer questions accurately.",
  "tools": ["web_search", "calculate"],
  "temperature": 0.7,
  "maxTokens": 2048,
  "maxIterations": 10
}
```

---

#### `PUT /admin/api/agents/:id`

Update an agent (partial patch). Same body shape as POST.

---

#### `DELETE /admin/api/agents/:id`

Delete an agent permanently. **Response:** `204 No Content`

---

## 4. Authentication

### Admin Account Bootstrap

The very first time you start Rotifex and open the dashboard, a setup screen appears. Fill in your email, password, and display name to create the admin account. This screen only appears once — once an admin exists, it is replaced by the normal login screen.

To reset and go through setup again (e.g. if you lose access):

```bash
rotifex reset-admin --yes
```

> **There is no password recovery.** Store your admin credentials securely. If you lose them, use `reset-admin` from the terminal to start over.

### Auth Flow

```
Client                          Rotifex Server
  |                                   |
  |-- GET /setup/status ------------> |  Check if admin exists
  |<- { needsSetup: true } ---------- |
  |                                   |
  |-- POST /setup ------------------> |  Create first admin (once only)
  |<- { data: user, warning } ------- |
  |                                   |
  |-- POST /auth/login -------------> |  Verify password
  |<- { accessToken, refreshToken }-- |
  |                                   |
  |-- GET /admin/api/stats            |
  |   Authorization: Bearer <token> > |  Verify JWT, inject x-user-id/x-user-role
  |<- { data: {...} } --------------- |
  |                                   |
  |-- POST /auth/refresh -----------> |  Verify refresh token, issue new pair
  |<- { accessToken, refreshToken }-- |
```

### Token Details

| Token         | Algorithm | Default TTL | TTL Env Var                 | Secret Env Var       |
| ------------- | --------- | ----------- | --------------------------- | -------------------- |
| Access Token  | HS256     | 60 min      | `ROTIFEX_ACCESS_TOKEN_TTL`  | `JWT_SECRET`         |
| Refresh Token | HS256     | 30 days     | `ROTIFEX_REFRESH_TOKEN_TTL` | `JWT_REFRESH_SECRET` |

TTLs are in **minutes**. The refresh TTL must be ≥ 2× the access TTL and ≥ 120 minutes.

Refresh tokens embed a unique `jti` (JWT ID) enabling individual revocation. Token rotation is enforced — each refresh token is single-use.

Secrets are auto-generated and saved to `.env` on first startup if not explicitly set.

### Security Notes

- `x-user-id` and `x-user-role` are always stripped from incoming requests by the JWT middleware — they cannot be forged by clients.
- The `POST /auth/register` endpoint always assigns `role: "user"` — the role field is ignored even if provided.
- Admin accounts can only be created via `POST /setup` (first run) or `POST /admin/api/users` (requires existing admin auth).

### Permission Levels

| Role    | Access                                        |
| ------- | --------------------------------------------- |
| `user`  | Public endpoints, own files, own data records |
| `admin` | All endpoints including `/admin/api/*`        |

---

## 5. Models / Data Structures

### User

Built-in model managed by the auth system. Not configurable via the schema engine.

| Field           | Type              | Required | Notes                               |
| --------------- | ----------------- | -------- | ----------------------------------- |
| `id`            | string (UUID)     | Auto     | Primary key                         |
| `email`         | string            | Yes      | Unique                              |
| `display_name`  | string            | No       |                                     |
| `role`          | string            | Yes      | `"user"` or `"admin"`               |
| `password_hash` | string            | Internal | bcrypt hash — never returned by API |
| `created_at`    | string (ISO 8601) | Auto     |                                     |
| `updated_at`    | string (ISO 8601) | Auto     |                                     |

---

### \_files (File Metadata)

Internal table managed by `StorageManager`. Not in `schema.json`.

| Field           | Type              | Notes                                    |
| --------------- | ----------------- | ---------------------------------------- |
| `id`            | string (UUID)     | Primary key                              |
| `original_name` | string            | Original filename from upload            |
| `stored_name`   | string            | `<uuid>.<ext>` — actual filename on disk |
| `mime_type`     | string            | e.g. `image/jpeg`                        |
| `size_bytes`    | integer           | File size in bytes                       |
| `visibility`    | string            | `"public"` or `"private"`                |
| `uploader_id`   | string            | UUID of the uploading user               |
| `created_at`    | string (ISO 8601) |                                          |

---

### Custom Models (schema.json)

All custom models automatically receive `id`, `created_at`, and `updated_at`.

**Example `schema.json`:**

```json
{
  "Product": {
    "fields": {
      "name": { "type": "string", "required": true },
      "price": "number",
      "in_stock": "boolean",
      "sku": { "type": "string", "unique": true }
    }
  },
  "Order": {
    "fields": {
      "product_id": { "type": "string", "required": true },
      "quantity": { "type": "integer", "required": true },
      "status": { "type": "string", "default": "pending" }
    }
  }
}
```

**Resulting routes:**

- `Product` -> table `products` -> `/api/products`, `/api/products/:id`
- `Order` -> table `orders` -> `/api/orders`, `/api/orders/:id`

---

### Agent

Stored in `agents.config.json`.

| Field           | Type              | Default | Description                                  |
| --------------- | ----------------- | ------- | -------------------------------------------- |
| `id`            | string (UUID)     | Auto    |                                              |
| `name`          | string            | —       | Display name                                 |
| `description`   | string            | `""`    | Human-readable description                   |
| `provider`      | string            | —       | `openai`, `anthropic`, `gemini`, or `ollama` |
| `model`         | string            | —       | Model ID                                     |
| `systemPrompt`  | string            | `""`    | Agent's system instruction                   |
| `tools`         | string[]          | `[]`    | List of tool names to enable                 |
| `temperature`   | number            | `0.7`   | Sampling temperature                         |
| `maxTokens`     | integer           | `2048`  | Max tokens per LLM call                      |
| `maxIterations` | integer           | `10`    | Max tool-call loop iterations                |
| `createdAt`     | string (ISO 8601) | Auto    |                                              |
| `updatedAt`     | string (ISO 8601) | Auto    |                                              |

---

### AI Provider (ai.config.json)

| Field          | Type     | Description                        |
| -------------- | -------- | ---------------------------------- |
| `label`        | string   | Display name                       |
| `apiKey`       | string   | API key (empty string if not set)  |
| `enabled`      | boolean  | Whether the provider is active     |
| `models`       | string[] | Available model IDs                |
| `defaultModel` | string   | Default model ID                   |
| `baseUrl`      | string   | Only for Ollama — local server URL |

---

### Token Usage (ai.usage.json)

```json
{
  "totalRequests": 150,
  "totalInputTokens": 55000,
  "totalOutputTokens": 14000,
  "byProvider": {
    "openai": { "requests": 100, "inputTokens": 40000, "outputTokens": 10000 },
    "anthropic": { "requests": 50, "inputTokens": 15000, "outputTokens": 4000 }
  }
}
```

---

## 6. AI / LLM Integration

### Supported Providers

| Provider ID | Label          | Requires API Key | Default Models                                                |
| ----------- | -------------- | ---------------- | ------------------------------------------------------------- |
| `openai`    | OpenAI         | Yes              | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo              |
| `anthropic` | Anthropic      | Yes              | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001 |
| `gemini`    | Google Gemini  | Yes              | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash            |
| `ollama`    | Ollama (Local) | No               | llama3.2, mistral, codellama, phi3                            |

### Configuration

Providers are configured via:

1. **Admin panel -> AI Integration -> Providers tab:** Enable provider, paste API key, select default model.
2. **Direct file edit:** Edit `ai.config.json` in the project root.

Ollama requires a running local Ollama server. Default base URL: `http://localhost:11434`.

### Token Usage Tracking

Every call to `POST /api/ai/generate`, `POST /api/ai/chat`, and `POST /api/agents/:id/run` records input token count, output token count, and a per-provider breakdown. Data is persisted to `ai.usage.json` and survives server restarts.

### Agent System — ReAct Loop

```
User Input
    |
    v
LLM (receives task + tool definitions)
    |
    +-- Tool call requested?
    |         |
    |         +-- Execute tool
    |         +-- Append result to conversation
    |         +-- Loop back to LLM
    |
    +-- Final answer -> return output + all steps to caller
```

#### Agent Step Types

| Type           | Description                                 |
| -------------- | ------------------------------------------- |
| `thinking`     | LLM reasoning text before invoking a tool   |
| `tool_call`    | Name and arguments of the tool being called |
| `tool_result`  | Raw output from the tool execution          |
| `final_answer` | The LLM's conclusive response               |

---

## 7. File Storage / Media Handling

### Upload Process

1. Client sends `POST /files/upload` as `multipart/form-data` with a `file` field and optional `visibility` field.
2. Server reads and buffers the stream, validates MIME type against the allowed list.
3. Checks the file size against `maxFileSizeMB` (default 10 MB).
4. Checks the uploader's total storage against `maxStoragePerUserMB` (default 100 MB).
5. Writes the file to disk as `<uuid><original-extension>` in the appropriate directory.
6. Inserts metadata into the `_files` SQLite table.
7. Returns the full file metadata record.

### Access URLs

| Visibility | Download URL                                         | Auth Required            |
| ---------- | ---------------------------------------------------- | ------------------------ |
| `public`   | `/files/:id/download`                                | No                       |
| `private`  | `/files/:id/download?token=<hmac>&expires=<unix-ts>` | Signed URL (HMAC-SHA256) |

### Storage Structure

```
<project-root>/
  storage/
    public/         <- Publicly downloadable files
      <uuid>.jpg
    private/        <- Signed-URL-only files
      <uuid>.pdf
```

### Size and Quota Limits

| Setting              | Environment Variable                | Default |
| -------------------- | ----------------------------------- | ------- |
| Max file size        | `ROTIFEX_STORAGE_MAX_FILE_SIZE_MB`  | 10 MB   |
| Max storage per user | Config only (`maxStoragePerUserMB`) | 100 MB  |

---

## 8. Admin Panel Features

### First-Run Setup Screen

When no admin account exists, the dashboard shows a setup screen instead of the login form. Fill in your email, password, and display name to create the admin account.

> **Save your password — there is no password recovery.** If you lose access, run `rotifex reset-admin --yes` from the terminal to delete admin accounts and re-run setup.

### Dashboard

- **Stat cards:** Schemas, Total Records, Users, Files, Storage Used, Connected LLMs, Agents Created, Server Uptime, Server Status
- **Schema Overview table:** model name, table name, record count per model
- **Connected LLMs table:** provider name, request count, tokens in, tokens out, key status

### Database Schemas

- View all defined models with their field names, types, and constraints
- Create a new model via a field builder UI
- Delete a model (routes deactivate immediately; underlying data table is preserved)

### User Management

- List all registered users: email, display name, role, creation date
- **Create user** — modal with email, password, display name, and role
- **Reset password** — admin force-sets any user's password
- Password validation enforced: minimum 8 characters, at least one letter and one number

### File Browser

- Browse all files (admins see all; users see their own)
- Preview images inline, download or delete any file

### AI Integration

- **Providers tab:** Enable/disable providers, enter API keys, set default model
- **Playground tab:** Generate mode and multi-turn chat mode
- **Agents tab:** Create, edit, delete, and run agents interactively
- **API Docs tab:** Built-in reference for all AI and agent endpoints

### Server Logs

- In-memory ring buffer of structured log entries with level filtering

### Settings

Editable via admin panel — writes to `.env`:

| Variable                            | Description                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `ROTIFEX_ACCESS_TOKEN_TTL`          | Access token lifetime in minutes (min 5, default 60)                      |
| `ROTIFEX_REFRESH_TOKEN_TTL`         | Refresh token lifetime in minutes (min 120 and ≥ 2×access, default 43200) |
| `JWT_SECRET`                        | Access token signing secret                                               |
| `JWT_REFRESH_SECRET`                | Refresh token signing secret                                              |
| `ROTIFEX_PORT`                      | Server port                                                               |
| `ROTIFEX_HOST`                      | Server bind host                                                          |
| `ROTIFEX_CORS_ORIGIN`               | Allowed CORS origin(s)                                                    |
| `ROTIFEX_RATE_LIMIT_MAX`            | Max requests per time window                                              |
| `ROTIFEX_LOG_LEVEL`                 | Log verbosity                                                             |
| `ROTIFEX_STORAGE_MAX_FILE_SIZE_MB`  | Max upload size in MB                                                     |
| `ROTIFEX_STORAGE_SIGNED_URL_SECRET` | HMAC secret for signed URLs                                               |

---

## 9. Error Handling

### Error Response Format

```json
{
  "error": "Error Type",
  "message": "Human-readable description of what went wrong.",
  "statusCode": 400
}
```

### Common HTTP Error Codes

| Code  | Meaning               | Common Causes                                                                         |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| `400` | Bad Request           | Missing required fields, invalid types, reserved model names, no fields to update     |
| `401` | Unauthorized          | Missing, expired, or invalid JWT access token                                         |
| `403` | Forbidden             | Non-admin accessing `/admin/api/*`, file access without ownership or valid signed URL |
| `404` | Not Found             | Unknown table name, record ID not found, agent not found, file not found              |
| `409` | Conflict              | Email already registered, model name already exists, setup already completed          |
| `413` | Payload Too Large     | File exceeds per-request size limit or per-user storage quota                         |
| `500` | Internal Server Error | Unexpected server error, LLM provider failure                                         |

---

## 10. Environment Configuration

### Configuration Priority (highest to lowest)

1. Shell environment variables
2. CLI flags (`--port`, `--host`, `--verbose`)
3. `config.json` (optional user overrides)
4. `config.default.json` (shipped defaults)
5. `.env` file (auto-loaded at startup)

### Environment Variables Reference

| Variable                            | Default   | Description                                                     |
| ----------------------------------- | --------- | --------------------------------------------------------------- |
| `ROTIFEX_PORT`                      | `4994`    | TCP port (auto-tries 4994 → 4995 → 4996 if unset)               |
| `ROTIFEX_HOST`                      | `0.0.0.0` | Bind address                                                    |
| `ROTIFEX_CORS_ORIGIN`               | `*`       | Allowed CORS origin                                             |
| `ROTIFEX_RATE_LIMIT_MAX`            | `100`     | Max requests per rate-limit window                              |
| `ROTIFEX_LOG_LEVEL`                 | `info`    | Log level (`info`, `debug`, `warn`, `error`)                    |
| `ROTIFEX_STORAGE_MAX_FILE_SIZE_MB`  | `10`      | Max upload size in MB                                           |
| `ROTIFEX_STORAGE_SIGNED_URL_SECRET` | auto      | HMAC secret for signed file URLs                                |
| `ROTIFEX_ACCESS_TOKEN_TTL`          | `60`      | Access token TTL in minutes (min 5)                             |
| `ROTIFEX_REFRESH_TOKEN_TTL`         | `43200`   | Refresh token TTL in minutes (min 120, must be ≥ 2× access TTL) |
| `JWT_SECRET`                        | auto      | Access token signing secret                                     |
| `JWT_REFRESH_SECRET`                | auto      | Refresh token signing secret                                    |

> `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ROTIFEX_STORAGE_SIGNED_URL_SECRET` are auto-generated on first startup if absent and saved to `.env`.

### Example `.env`

```env
ROTIFEX_PORT=4994
ROTIFEX_HOST=0.0.0.0
ROTIFEX_CORS_ORIGIN=https://myapp.com
ROTIFEX_RATE_LIMIT_MAX=200
ROTIFEX_LOG_LEVEL=info
ROTIFEX_STORAGE_MAX_FILE_SIZE_MB=25
ROTIFEX_ACCESS_TOKEN_TTL=60
ROTIFEX_REFRESH_TOKEN_TTL=43200
JWT_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-another-long-random-string
ROTIFEX_STORAGE_SIGNED_URL_SECRET=replace-with-yet-another-secret
```

---

## 11. Deployment

### Requirements

- Node.js 18 or later
- npm 9 or later

### Setup

```bash
git clone <repo-url>
cd rotifex
npm install
```

### Running in Development

```bash
# Default port 4994 (falls back to 4995, 4996 if in use)
npx rotifex start

# Pin a specific port
npx rotifex start --port 4000

# Custom host
npx rotifex start --host 127.0.0.1

# Verbose (debug) logging
npx rotifex start --verbose
```

### Build the Admin Dashboard

```bash
npm run build:admin
```

Output is written to `admin/dist/`. The server automatically serves it at `/` when the directory exists.

### Production Setup

**1. Set secrets in environment:**

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ROTIFEX_STORAGE_SIGNED_URL_SECRET="$(openssl rand -hex 32)"
export ROTIFEX_CORS_ORIGIN="https://yourfrontend.com"
```

**2. Build the admin dashboard:**

```bash
npm run build:admin
```

**3. Use a process manager:**

```bash
npm install -g pm2
pm2 start "npx rotifex start" --name rotifex
pm2 save
pm2 startup
```

**4. Reverse proxy (Nginx example):**

```nginx
server {
  listen 80;
  server_name api.yourapp.com;

  location / {
    proxy_pass http://127.0.0.1:4994;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

**5. Backup the database:**

```bash
cp rotifex.db rotifex.db.backup
```

---

## 12. Example Workflows

### First-Time Setup

```bash
# Start the server
npx rotifex start

# Open the dashboard in your browser
# http://localhost:4994
# You will see the setup screen — fill in email, password, display name
# Save your password — there is no recovery mechanism
```

### Registering a User and Logging In

```bash
# Register (always creates role: user)
curl -X POST http://localhost:4994/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secure123","display_name":"Jane"}'

# Login — save the returned accessToken
curl -X POST http://localhost:4994/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secure123"}'

export TOKEN="<accessToken from response>"
```

---

### Defining a Model and Using the CRUD API

```bash
# 1. Create model (admin role required)
curl -X POST http://localhost:4994/admin/api/schema \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Product",
    "fields": {
      "name": {"type": "string", "required": true},
      "price": "number",
      "in_stock": "boolean"
    }
  }'

# 2. Create a record
curl -X POST http://localhost:4994/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":9.99,"in_stock":true}'

# 3. List with sort and filter
curl "http://localhost:4994/api/products?sort=price&order=ASC&in_stock=1"

# 4. Update
curl -X PUT http://localhost:4994/api/products/<id> \
  -H "Content-Type: application/json" \
  -d '{"price":14.99}'

# 5. Delete
curl -X DELETE http://localhost:4994/api/products/<id>
```

---

### Uploading and Downloading Files

```bash
# Upload a public file
curl -X POST http://localhost:4994/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/photo.jpg" \
  -F "visibility=public"

# Download (no auth needed for public)
curl http://localhost:4994/files/<id>/download -o photo.jpg

# Upload a private file
curl -X POST http://localhost:4994/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "visibility=private"

# Get a signed URL and download
curl http://localhost:4994/files/<id>/signed-url \
  -H "Authorization: Bearer $TOKEN"

curl "<signed-url>" -o document.pdf
```

---

### Calling an AI Model

```bash
curl -X POST http://localhost:4994/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "prompt": "Write a one-sentence tagline for a productivity app.",
    "maxTokens": 60
  }'
```

---

### Creating and Running an AI Agent

```bash
# Create agent (admin required)
curl -X POST http://localhost:4994/admin/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Math Helper",
    "provider": "openai",
    "model": "gpt-4o",
    "systemPrompt": "You are a precise math assistant.",
    "tools": ["calculate"],
    "temperature": 0.2,
    "maxIterations": 5
  }'

# Run the agent
curl -X POST http://localhost:4994/api/agents/<id>/run \
  -H "Content-Type: application/json" \
  -d '{"input": "What is (144 / 12) * 7.5 plus 33?"}'
```

---

### Resetting Admin Access

```bash
# Lost your admin password? Reset from the terminal:
rotifex reset-admin --yes

# Then open the dashboard — the setup screen will reappear
```

---

## 13. Notes for Documentation Generators

### Docusaurus

- Place this file in `docs/` as `intro.md`.
- Split by `##` heading into separate files under `docs/api/`, `docs/guides/`, `docs/features/`.
- All code blocks use fenced syntax compatible with Docusaurus's Prism highlighter.

### Mintlify

- Each `##` section maps to a separate `.mdx` page.
- API endpoint documentation can be supplemented by an `openapi.yaml` generated from §3.
- Use `<Note>`, `<Warning>`, and `<Tip>` components for callouts when converting to Mintlify MDX.

### GitBook

- Import this file directly. GitBook renders all standard Markdown.
- Use `{% hint style="warning" %}` blocks for the password-recovery warning.

### Swagger / OpenAPI Mapping

| Section               | OpenAPI Component                                |
| --------------------- | ------------------------------------------------ |
| §3.2 Setup endpoints  | `paths` under `/setup/*`                         |
| §3.3 Auth endpoints   | `paths` under `/auth/*`                          |
| §3.4 CRUD endpoints   | `paths` under `/api/{table}`                     |
| §3.5 File endpoints   | `paths` under `/files/*`                         |
| §3.6 AI endpoints     | `paths` under `/api/ai/*`                        |
| §3.7 Agent endpoints  | `paths` under `/api/agents/*`                    |
| §3.8 Admin endpoints  | `paths` under `/admin/api/*`                     |
| §5 Data Structures    | `components/schemas`                             |
| §9 Error codes        | `components/responses`                           |
| §4 Auth headers       | `components/securitySchemes` (BearerAuth, HS256) |
