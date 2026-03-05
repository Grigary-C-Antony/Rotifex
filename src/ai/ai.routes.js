import { getProviders, getProvider, updateProvider } from './ai.config.js';
import { generate, chat } from './ai.service.js';
import { recordUsage } from './ai.usage.js';

/**
 * AI routes — public inference endpoints + admin config endpoints.
 *
 * Public:  POST /api/ai/generate, POST /api/ai/chat
 *          GET  /api/ai/providers, GET /api/ai/models
 *
 * Admin:   GET/PUT /admin/api/ai/providers, PUT /admin/api/ai/providers/:id
 */
export async function aiRoutes(app) {

  // ── GET /api/ai/providers — list enabled providers (public) ────────────────
  app.get('/api/ai/providers', () => {
    const all = getProviders();
    const result = Object.entries(all)
      .filter(([, p]) => p.enabled)
      .map(([id, p]) => ({
        id,
        label: p.label,
        models: p.models,
        defaultModel: p.defaultModel,
        ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
      }));
    return { data: result };
  });

  // ── GET /api/ai/models — flat model list from all enabled providers ─────────
  app.get('/api/ai/models', () => {
    const all = getProviders();
    const result = [];
    for (const [id, p] of Object.entries(all)) {
      if (!p.enabled) continue;
      for (const model of p.models) {
        result.push({ provider: id, providerLabel: p.label, model });
      }
    }
    return { data: result };
  });

  // ── GET /api/ai/models/:provider — models for a single provider ─────────────
  app.get('/api/ai/models/:provider', (request, reply) => {
    const { provider } = request.params;
    const p = getProvider(provider);
    if (!p || !p.enabled) {
      return reply.status(404).send({ error: 'Not Found', message: `Provider "${provider}" not found or not enabled`, statusCode: 404 });
    }
    return { data: p.models };
  });

  // ── POST /api/ai/generate ──────────────────────────────────────────────────
  app.post('/api/ai/generate', async (request, reply) => {
    const { provider, model, prompt, system, maxTokens, temperature } = request.body || {};

    if (!provider || !prompt) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '`provider` and `prompt` are required',
        statusCode: 400,
      });
    }

    try {
      const result = await generate(provider, { model, prompt, system, maxTokens, temperature });
      recordUsage(provider, result.usage);
      return { data: result };
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        error: 'AI Error',
        message: err.message,
        statusCode: err.statusCode || 500,
      });
    }
  });

  // ── POST /api/ai/chat ──────────────────────────────────────────────────────
  app.post('/api/ai/chat', async (request, reply) => {
    const { provider, model, messages, system, maxTokens, temperature } = request.body || {};

    if (!provider || !messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '`provider` and `messages` (non-empty array) are required',
        statusCode: 400,
      });
    }

    try {
      const result = await chat(provider, { model, messages, system, maxTokens, temperature });
      recordUsage(provider, result.usage);
      return { data: result };
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        error: 'AI Error',
        message: err.message,
        statusCode: err.statusCode || 500,
      });
    }
  });

  // ── Admin routes (guarded by x-user-role: admin via adminRoutes hook) ────────

  // GET /admin/api/ai/providers — all providers with API keys (admin)
  app.get('/admin/api/ai/providers', () => {
    const all = getProviders();
    const result = Object.entries(all).map(([id, p]) => ({
      id,
      label: p.label,
      enabled: p.enabled,
      apiKey: p.apiKey ? '***' + p.apiKey.slice(-4) : '',
      hasKey: !!p.apiKey,
      models: p.models,
      defaultModel: p.defaultModel,
      ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
    }));
    return { data: result };
  });

  // PUT /admin/api/ai/providers/:id — update provider config (admin)
  app.put('/admin/api/ai/providers/:id', (request, reply) => {
    const { id } = request.params;
    const patch = request.body || {};

    // Validate role
    if (request.headers['x-user-role'] !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required', statusCode: 403 });
    }

    try {
      const updated = updateProvider(id, patch);
      return {
        data: {
          id,
          label: updated.label,
          enabled: updated.enabled,
          hasKey: !!updated.apiKey,
          models: updated.models,
          defaultModel: updated.defaultModel,
          ...(updated.baseUrl ? { baseUrl: updated.baseUrl } : {}),
        },
        message: `Provider "${id}" updated.`,
      };
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: 'Error', message: err.message, statusCode: err.statusCode || 500 });
    }
  });
}
