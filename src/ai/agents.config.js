import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';

const CONFIG_PATH = resolve('agents.config.json');

function read() {
  if (!existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return {}; }
}

function write(data) {
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

export function listAgents() {
  return Object.values(read());
}

export function getAgent(id) {
  return read()[id] ?? null;
}

export function createAgent({ name, description, provider, model, systemPrompt, tools, temperature, maxTokens, maxIterations }) {
  const agents = read();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  agents[id] = {
    id, name, description: description || '',
    provider, model,
    systemPrompt: systemPrompt || '',
    tools: tools || [],
    temperature: temperature ?? 0.7,
    maxTokens: maxTokens ?? 2048,
    maxIterations: maxIterations ?? 10,
    createdAt: now,
    updatedAt: now,
  };
  write(agents);
  return agents[id];
}

export function updateAgent(id, patch) {
  const agents = read();
  if (!agents[id]) {
    const err = new Error(`Agent "${id}" not found`);
    err.statusCode = 404;
    throw err;
  }
  const { id: _id, createdAt: _c, ...rest } = patch;
  Object.assign(agents[id], rest, { updatedAt: new Date().toISOString() });
  write(agents);
  return agents[id];
}

export function deleteAgent(id) {
  const agents = read();
  if (!agents[id]) {
    const err = new Error(`Agent "${id}" not found`);
    err.statusCode = 404;
    throw err;
  }
  delete agents[id];
  write(agents);
}
