import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve('ai.config.json');

const DEFAULT_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    apiKey: '',
    enabled: false,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    label: 'Anthropic',
    apiKey: '',
    enabled: false,
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
  },
  gemini: {
    label: 'Google Gemini',
    apiKey: '',
    enabled: false,
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
  },
  ollama: {
    label: 'Ollama (Local)',
    apiKey: '',
    enabled: false,
    models: ['llama3.2', 'mistral', 'codellama', 'phi3'],
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434',
  },
};

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    // Deep merge with defaults so new providers/fields are picked up
    const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
    for (const [id, cfg] of Object.entries(raw)) {
      if (merged[id]) Object.assign(merged[id], cfg);
      else merged[id] = cfg;
    }
    return merged;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  }
}

function writeConfig(providers) {
  writeFileSync(CONFIG_PATH, JSON.stringify(providers, null, 2));
}

export function getProviders() {
  return readConfig();
}

export function getProvider(id) {
  const all = readConfig();
  return all[id] ?? null;
}

export function updateProvider(id, patch) {
  const all = readConfig();
  if (!all[id]) {
    const err = new Error(`Provider "${id}" not found`);
    err.statusCode = 404;
    throw err;
  }
  // Never allow provider id / models list to be overwritten via patch
  const { models: _m, ...rest } = patch;
  Object.assign(all[id], rest);
  writeConfig(all);
  return all[id];
}

export function getEnabledProviders() {
  const all = readConfig();
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v.enabled));
}
