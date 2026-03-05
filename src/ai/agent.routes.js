import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from './agents.config.js';
import { listTools } from './tools/registry.js';
import { runAgent } from './agent.service.js';
import { recordUsage } from './ai.usage.js';

function requireAdmin(request, reply) {
  if (request.headers['x-user-role'] !== 'admin') {
    reply.status(403).send({ error: 'Forbidden', message: 'Admin access required', statusCode: 403 });
    return false;
  }
  return true;
}

export async function agentRoutes(app, { db }) {

  // ── Public: list available agents ──────────────────────────────────────────
  app.get('/api/agents', () => {
    const agents = listAgents().map(a => ({
      id: a.id, name: a.name, description: a.description,
      provider: a.provider, model: a.model, tools: a.tools,
      createdAt: a.createdAt,
    }));
    return { data: agents };
  });

  // ── Public: list available tools ───────────────────────────────────────────
  app.get('/api/agents/tools', () => {
    return { data: listTools() };
  });

  // ── Public: run an agent ───────────────────────────────────────────────────
  app.post('/api/agents/:id/run', async (request, reply) => {
    const { id } = request.params;
    const { input } = request.body || {};

    if (!input || typeof input !== 'string' || !input.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: '`input` (string) is required', statusCode: 400 });
    }

    const agent = getAgent(id);
    if (!agent) {
      return reply.status(404).send({ error: 'Not Found', message: `Agent "${id}" not found`, statusCode: 404 });
    }

    try {
      const result = await runAgent(agent, input.trim(), { db });
      recordUsage(agent.provider, result.usage);
      return {
        data: {
          agentId:   agent.id,
          agentName: agent.name,
          input:     input.trim(),
          output:    result.output,
          steps:     result.steps,
          usage:     result.usage,
        },
      };
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        error: 'Agent Error',
        message: err.message,
        statusCode: err.statusCode || 500,
      });
    }
  });

  // ── Admin: full agent CRUD ─────────────────────────────────────────────────

  app.get('/admin/api/agents', (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return { data: listAgents() };
  });

  app.get('/admin/api/agents/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const agent = getAgent(request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Not Found', message: 'Agent not found', statusCode: 404 });
    return { data: agent };
  });

  app.post('/admin/api/agents', (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { name, provider, model } = request.body || {};
    if (!name || !provider || !model) {
      return reply.status(400).send({ error: 'Bad Request', message: '`name`, `provider`, and `model` are required', statusCode: 400 });
    }
    const agent = createAgent(request.body);
    return reply.status(201).send({ data: agent, message: `Agent "${agent.name}" created.` });
  });

  app.put('/admin/api/agents/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const agent = updateAgent(request.params.id, request.body || {});
      return { data: agent, message: `Agent "${agent.name}" updated.` };
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: 'Error', message: err.message, statusCode: err.statusCode || 500 });
    }
  });

  app.delete('/admin/api/agents/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      deleteAgent(request.params.id);
      return reply.status(204).send();
    } catch (err) {
      return reply.status(err.statusCode || 500).send({ error: 'Error', message: err.message, statusCode: err.statusCode || 500 });
    }
  });
}
