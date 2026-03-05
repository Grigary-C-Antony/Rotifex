/**
 * Tool registry for the AI Agents system.
 *
 * Each tool:
 *   name        — unique snake_case identifier
 *   description — shown to the LLM so it knows when to call the tool
 *   parameters  — { paramName: { type, description } }
 *   required    — array of required parameter names
 *   execute     — async (params, ctx) => string   (ctx provides { db })
 */

// ── Safe calculator ────────────────────────────────────────────────────────────

function safeCalc(expr) {
  if (!/^[\d\s+\-*/().,% ]+$/.test(expr)) {
    throw new Error('Expression contains disallowed characters. Only digits and + - * / ( ) . , % are allowed.');
  }
  // eslint-disable-next-line no-new-func
  const result = Function('"use strict"; return (' + expr + ')')();
  if (typeof result !== 'number' || !isFinite(result)) throw new Error('Expression did not evaluate to a finite number.');
  return result;
}

// ── Tool definitions ───────────────────────────────────────────────────────────

export const TOOLS = {

  get_datetime: {
    name: 'get_datetime',
    description: 'Get the current date and time. Returns the ISO 8601 timestamp, UTC string, and Unix timestamp.',
    parameters: {},
    required: [],
    async execute() {
      const now = new Date();
      return JSON.stringify({
        iso:       now.toISOString(),
        utc:       now.toUTCString(),
        timestamp: Math.floor(now.getTime() / 1000),
        timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
  },

  calculate: {
    name: 'calculate',
    description: 'Safely evaluate a mathematical expression and return the numeric result. Supports +, -, *, /, (, ), %. Does NOT support functions like sqrt or log.',
    parameters: {
      expression: { type: 'string', description: 'A math expression, e.g. "(10 * 5) / 2" or "100 * 0.18"' },
    },
    required: ['expression'],
    async execute({ expression }) {
      const result = safeCalc(expression);
      return JSON.stringify({ expression, result });
    },
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo and return a summary of results. Good for quick facts and definitions.',
    parameters: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
    async execute({ query }) {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Search request failed: HTTP ${res.status}`);
      const data = await res.json();

      const parts = [];
      if (data.AbstractText)   parts.push(`Summary: ${data.AbstractText}`);
      if (data.AbstractSource) parts.push(`Source: ${data.AbstractSource} — ${data.AbstractURL}`);

      const topics = (data.RelatedTopics || [])
        .slice(0, 6)
        .filter(t => t.Text)
        .map(t => `• ${t.Text}${t.FirstURL ? ' (' + t.FirstURL + ')' : ''}`);
      if (topics.length) parts.push(`Related topics:\n${topics.join('\n')}`);

      if (!parts.length) {
        return `No instant answer found for: "${query}". Try a more specific query or reformulate.`;
      }
      return parts.join('\n\n');
    },
  },

  http_get: {
    name: 'http_get',
    description: 'Make an HTTP GET request to any public URL and return the response body (truncated to 4000 characters). Useful for fetching data from public APIs.',
    parameters: {
      url:     { type: 'string', description: 'The URL to request (must be http:// or https://)' },
      headers: { type: 'string', description: 'Optional JSON string of request headers, e.g. {"Accept":"application/json"}' },
    },
    required: ['url'],
    async execute({ url, headers }) {
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error(`Invalid URL: "${url}"`); }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are allowed.');
      }

      let hdrs = {};
      if (headers) {
        try { hdrs = JSON.parse(headers); } catch { throw new Error('headers must be a valid JSON string.'); }
      }

      const res = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      const truncated = text.length > 4000;

      return JSON.stringify({
        status:    res.status,
        url,
        body:      text.slice(0, 4000),
        truncated,
        contentType: res.headers.get('content-type') || 'unknown',
      });
    },
  },

  database_query: {
    name: 'database_query',
    description: 'Run a read-only SQL SELECT query on the Rotifex database and return up to 100 rows as JSON. Use this to retrieve application data.',
    parameters: {
      query: { type: 'string', description: 'A SQL SELECT query' },
    },
    required: ['query'],
    async execute({ query }, { db } = {}) {
      if (!db) throw new Error('Database context is not available.');
      const trimmed = query.trim();
      if (!/^SELECT\s/i.test(trimmed)) throw new Error('Only SELECT queries are allowed.');
      // Block statement chaining that could piggyback dangerous SQL
      if (/;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|REPLACE|ATTACH)\b/i.test(query)) {
        throw new Error('Query contains disallowed SQL statements.');
      }
      const rows = db.all(query);
      return JSON.stringify({ rows: rows.slice(0, 100), total: rows.length });
    },
  },
};

// ── Public helpers ─────────────────────────────────────────────────────────────

export function listTools() {
  return Object.values(TOOLS).map(({ execute: _, ...rest }) => rest);
}

export function getTool(name) {
  return TOOLS[name] ?? null;
}

export async function executeTool(name, params, ctx = {}) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: "${name}"`);
  return tool.execute(params, ctx);
}
