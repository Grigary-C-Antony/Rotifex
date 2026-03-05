/**
 * Agent execution engine.
 *
 * Runs a ReAct-style tool-calling loop for each supported provider.
 * Returns { output, steps, usage } where steps is an array of
 * { type, tool?, args?, result?, content?, iteration } records for observability.
 */

import { getProvider } from './ai.config.js';
import { getTool, executeTool } from './tools/registry.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireProvider(providerId) {
  const p = getProvider(providerId);
  if (!p) { const e = new Error(`Provider "${providerId}" not found`); e.statusCode = 404; throw e; }
  if (!p.enabled) { const e = new Error(`Provider "${providerId}" is not enabled`); e.statusCode = 400; throw e; }
  return p;
}

async function handleFetchError(res, label) {
  let body;
  try { body = await res.json(); } catch { body = {}; }
  const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
  const e = new Error(`${label} error: ${msg}`);
  e.statusCode = res.status >= 500 ? 502 : res.status;
  throw e;
}

// Convert our tool definitions to provider-specific formats

function toOpenAITools(toolDefs) {
  return toolDefs.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.parameters || {}).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: t.required || [],
      },
    },
  }));
}

function toAnthropicTools(toolDefs) {
  return toolDefs.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.parameters || {}).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
      required: t.required || [],
    },
  }));
}

function toGeminiTools(toolDefs) {
  const typeMap = { string: 'STRING', number: 'NUMBER', boolean: 'BOOLEAN', object: 'OBJECT', array: 'ARRAY' };
  return [{
    functionDeclarations: toolDefs.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties: Object.fromEntries(
          Object.entries(t.parameters || {}).map(([k, v]) => [k, { type: typeMap[v.type] || 'STRING', description: v.description }])
        ),
        required: t.required || [],
      },
    })),
  }];
}

// ── OpenAI / Ollama executor ───────────────────────────────────────────────────

async function runOpenAILoop(baseUrl, apiKey, agent, toolDefs, messages, maxIter, ctx) {
  const oaiTools = toolDefs.length ? toOpenAITools(toolDefs) : undefined;
  const steps = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  for (let iter = 1; iter <= maxIter; iter++) {
    const body = {
      model:       agent.model,
      messages,
      temperature: agent.temperature,
      max_tokens:  agent.maxTokens,
      ...(oaiTools ? { tools: oaiTools, tool_choice: 'auto' } : {}),
    };

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) await handleFetchError(res, baseUrl.includes('anthropic') ? 'Anthropic' : 'OpenAI');

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('Provider returned no choices.');

    if (data.usage) {
      totalUsage.prompt_tokens    += data.usage.prompt_tokens    || 0;
      totalUsage.completion_tokens += data.usage.completion_tokens || 0;
    }

    const msg = choice.message;
    messages = [...messages, msg];

    // If text content exists, capture it as a thinking step
    if (msg.content) {
      steps.push({ type: 'thinking', content: msg.content, iteration: iter });
    }

    // Final answer
    if (!msg.tool_calls?.length) {
      steps.push({ type: 'final_answer', content: msg.content || '', iteration: iter });
      return { output: msg.content || '', steps, usage: totalUsage };
    }

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      let args;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
      steps.push({ type: 'tool_call', tool: tc.function.name, args, iteration: iter });

      let result;
      try { result = await executeTool(tc.function.name, args, ctx); }
      catch (e) { result = `Tool error: ${e.message}`; }

      steps.push({ type: 'tool_result', tool: tc.function.name, result, iteration: iter });
      messages = [...messages, { role: 'tool', tool_call_id: tc.id, content: String(result) }];
    }
  }

  return { output: 'Maximum iterations reached without a final answer.', steps, usage: totalUsage };
}

// ── Anthropic executor ─────────────────────────────────────────────────────────

async function runAnthropicLoop(provider, agent, toolDefs, userInput, maxIter, ctx) {
  const antTools = toolDefs.length ? toAnthropicTools(toolDefs) : undefined;
  const steps = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  // Anthropic uses a separate `system` param, not a system message
  let messages = [{ role: 'user', content: userInput }];

  for (let iter = 1; iter <= maxIter; iter++) {
    const body = {
      model:      agent.model,
      max_tokens: agent.maxTokens,
      temperature: agent.temperature,
      system:     agent.systemPrompt || undefined,
      messages,
      ...(antTools ? { tools: antTools } : {}),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) await handleFetchError(res, 'Anthropic');

    const data = await res.json();
    if (data.usage) {
      totalUsage.prompt_tokens     += data.usage.input_tokens  || 0;
      totalUsage.completion_tokens += data.usage.output_tokens || 0;
    }

    messages = [...messages, { role: 'assistant', content: data.content }];

    const textBlock  = data.content.find(b => b.type === 'text');
    const toolBlocks = data.content.filter(b => b.type === 'tool_use');

    if (textBlock?.text) {
      steps.push({ type: 'thinking', content: textBlock.text, iteration: iter });
    }

    // Final answer
    if (data.stop_reason === 'end_turn' || !toolBlocks.length) {
      const output = textBlock?.text || '';
      steps.push({ type: 'final_answer', content: output, iteration: iter });
      return { output, steps, usage: totalUsage };
    }

    // Execute tools
    const toolResults = [];
    for (const tb of toolBlocks) {
      steps.push({ type: 'tool_call', tool: tb.name, args: tb.input, iteration: iter });
      let result;
      try { result = await executeTool(tb.name, tb.input, ctx); }
      catch (e) { result = `Tool error: ${e.message}`; }
      steps.push({ type: 'tool_result', tool: tb.name, result, iteration: iter });
      toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: String(result) });
    }

    messages = [...messages, { role: 'user', content: toolResults }];
  }

  return { output: 'Maximum iterations reached without a final answer.', steps, usage: totalUsage };
}

// ── Gemini executor ────────────────────────────────────────────────────────────

async function runGeminiLoop(provider, agent, toolDefs, userInput, maxIter, ctx) {
  const gemTools = toolDefs.length ? toGeminiTools(toolDefs) : undefined;
  const steps = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  const sysInstruction = agent.systemPrompt ? { parts: [{ text: agent.systemPrompt }] } : undefined;
  let contents = [{ role: 'user', parts: [{ text: userInput }] }];

  const mdl = agent.model;

  for (let iter = 1; iter <= maxIter; iter++) {
    const body = {
      contents,
      ...(sysInstruction ? { systemInstruction: sysInstruction } : {}),
      ...(gemTools ? { tools: gemTools } : {}),
      generationConfig: { maxOutputTokens: agent.maxTokens, temperature: agent.temperature },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${provider.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!res.ok) await handleFetchError(res, 'Gemini');

    const data = await res.json();
    if (data.usageMetadata) {
      totalUsage.prompt_tokens     += data.usageMetadata.promptTokenCount     || 0;
      totalUsage.completion_tokens += data.usageMetadata.candidatesTokenCount || 0;
    }

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates.');

    const parts = candidate.content?.parts || [];
    const textPart = parts.find(p => p.text);
    const fnCalls  = parts.filter(p => p.functionCall);

    if (textPart?.text) {
      steps.push({ type: 'thinking', content: textPart.text, iteration: iter });
    }

    contents = [...contents, { role: 'model', parts }];

    if (!fnCalls.length) {
      const output = textPart?.text || '';
      steps.push({ type: 'final_answer', content: output, iteration: iter });
      return { output, steps, usage: totalUsage };
    }

    // Execute tool calls
    const resultParts = [];
    for (const { functionCall: fc } of fnCalls) {
      steps.push({ type: 'tool_call', tool: fc.name, args: fc.args || {}, iteration: iter });
      let result;
      try { result = await executeTool(fc.name, fc.args || {}, ctx); }
      catch (e) { result = `Tool error: ${e.message}`; }
      steps.push({ type: 'tool_result', tool: fc.name, result, iteration: iter });
      resultParts.push({ functionResponse: { name: fc.name, response: { result: String(result) } } });
    }

    contents = [...contents, { role: 'function', parts: resultParts }];
  }

  return { output: 'Maximum iterations reached without a final answer.', steps, usage: totalUsage };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run an agent with the given input.
 *
 * @param {object} agent  Agent definition from agents.config.js
 * @param {string} input  User input / task description
 * @param {object} ctx    Execution context: { db }
 * @returns {Promise<{ output: string, steps: object[], usage: object }>}
 */
export async function runAgent(agent, input, ctx = {}) {
  const provider = requireProvider(agent.provider);

  // Resolve tool definitions for this agent
  const toolDefs = (agent.tools || [])
    .map(name => getTool(name))
    .filter(Boolean)
    .map(({ execute: _, ...rest }) => rest);

  const maxIter = agent.maxIterations || 10;

  if (agent.provider === 'anthropic') {
    return runAnthropicLoop(provider, agent, toolDefs, input, maxIter, ctx);
  }

  if (agent.provider === 'gemini') {
    return runGeminiLoop(provider, agent, toolDefs, input, maxIter, ctx);
  }

  if (agent.provider === 'ollama') {
    const baseUrl = provider.baseUrl || 'http://localhost:11434';
    const messages = [
      ...(agent.systemPrompt ? [{ role: 'system', content: agent.systemPrompt }] : []),
      { role: 'user', content: input },
    ];
    return runOpenAILoop(baseUrl, null, agent, toolDefs, messages, maxIter, ctx);
  }

  // OpenAI (default)
  const messages = [
    ...(agent.systemPrompt ? [{ role: 'system', content: agent.systemPrompt }] : []),
    { role: 'user', content: input },
  ];
  return runOpenAILoop('https://api.openai.com', provider.apiKey, agent, toolDefs, messages, maxIter, ctx);
}
