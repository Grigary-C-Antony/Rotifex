/**
 * Persistent token usage tracker.
 * Totals are accumulated in ai.usage.json so they survive restarts.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE_PATH = resolve('ai.usage.json');

const EMPTY = () => ({
  totalRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  byProvider: {},
});

function read() {
  if (!existsSync(USAGE_PATH)) return EMPTY();
  try { return JSON.parse(readFileSync(USAGE_PATH, 'utf-8')); }
  catch { return EMPTY(); }
}

function write(data) {
  try { writeFileSync(USAGE_PATH, JSON.stringify(data, null, 2)); }
  catch { /* filesystem not writable — totals are lost but won't crash */ }
}

/**
 * Record a completed inference call.
 * @param {string} provider   Provider ID (openai, anthropic, …)
 * @param {{ prompt_tokens?: number, completion_tokens?: number }} usage
 */
export function recordUsage(provider, usage) {
  if (!usage) return;
  const input  = usage.prompt_tokens    || 0;
  const output = usage.completion_tokens || 0;
  if (!input && !output) return;

  const data = read();
  data.totalRequests      += 1;
  data.totalInputTokens   += input;
  data.totalOutputTokens  += output;

  if (!data.byProvider[provider]) {
    data.byProvider[provider] = { requests: 0, inputTokens: 0, outputTokens: 0 };
  }
  data.byProvider[provider].requests    += 1;
  data.byProvider[provider].inputTokens += input;
  data.byProvider[provider].outputTokens += output;

  write(data);
}

/** Return the current usage summary. */
export function getUsageSummary() {
  return read();
}
