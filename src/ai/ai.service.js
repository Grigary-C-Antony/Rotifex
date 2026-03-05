import { getProvider } from './ai.config.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireProvider(providerId) {
  const provider = getProvider(providerId);
  if (!provider) {
    const err = new Error(`Provider "${providerId}" not found`);
    err.statusCode = 404;
    throw err;
  }
  if (!provider.enabled) {
    const err = new Error(`Provider "${providerId}" is not enabled`);
    err.statusCode = 400;
    throw err;
  }
  return provider;
}

async function handleFetchError(res, providerLabel) {
  let body;
  try { body = await res.json(); } catch { body = {}; }
  const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
  const err = new Error(`${providerLabel} error: ${msg}`);
  err.statusCode = res.status >= 500 ? 502 : res.status;
  throw err;
}

// ── Provider adapters ──────────────────────────────────────────────────────────

async function openaiGenerate(provider, { model, prompt, system, maxTokens, temperature }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      messages,
      max_tokens: maxTokens || 1024,
      temperature: temperature ?? 0.7,
    }),
  });

  if (!res.ok) await handleFetchError(res, 'OpenAI');
  const data = await res.json();
  return {
    text: data.choices[0].message.content,
    model: data.model,
    usage: data.usage,
  };
}

async function openaiChat(provider, { model, messages, system, maxTokens, temperature }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push(...messages);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      messages: msgs,
      max_tokens: maxTokens || 1024,
      temperature: temperature ?? 0.7,
    }),
  });

  if (!res.ok) await handleFetchError(res, 'OpenAI');
  const data = await res.json();
  return {
    message: data.choices[0].message,
    model: data.model,
    usage: data.usage,
  };
}

async function anthropicGenerate(provider, { model, prompt, system, maxTokens, temperature }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      max_tokens: maxTokens || 1024,
      temperature: temperature ?? 0.7,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) await handleFetchError(res, 'Anthropic');
  const data = await res.json();
  return {
    text: data.content[0].text,
    model: data.model,
    usage: { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens },
  };
}

async function anthropicChat(provider, { model, messages, system, maxTokens, temperature }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      max_tokens: maxTokens || 1024,
      temperature: temperature ?? 0.7,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!res.ok) await handleFetchError(res, 'Anthropic');
  const data = await res.json();
  return {
    message: { role: 'assistant', content: data.content[0].text },
    model: data.model,
    usage: { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens },
  };
}

async function geminiGenerate(provider, { model, prompt, system, maxTokens, temperature }) {
  const mdl = model || provider.defaultModel;
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const systemInstruction = system ? { parts: [{ text: system }] } : undefined;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${provider.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: { maxOutputTokens: maxTokens || 1024, temperature: temperature ?? 0.7 },
      }),
    },
  );

  if (!res.ok) await handleFetchError(res, 'Gemini');
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return {
    text,
    model: mdl,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount,
      completion_tokens: data.usageMetadata?.candidatesTokenCount,
    },
  };
}

async function geminiChat(provider, { model, messages, system, maxTokens, temperature }) {
  const mdl = model || provider.defaultModel;
  // Gemini uses 'model' instead of 'assistant'
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }],
  }));
  const systemInstruction = system ? { parts: [{ text: system }] } : undefined;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${provider.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: { maxOutputTokens: maxTokens || 1024, temperature: temperature ?? 0.7 },
      }),
    },
  );

  if (!res.ok) await handleFetchError(res, 'Gemini');
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return {
    message: { role: 'assistant', content: text },
    model: mdl,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount,
      completion_tokens: data.usageMetadata?.candidatesTokenCount,
    },
  };
}

async function ollamaGenerate(provider, { model, prompt, system, maxTokens, temperature }) {
  const baseUrl = provider.baseUrl || 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      prompt,
      ...(system ? { system } : {}),
      options: { num_predict: maxTokens || 1024, temperature: temperature ?? 0.7 },
      stream: false,
    }),
  });

  if (!res.ok) await handleFetchError(res, 'Ollama');
  const data = await res.json();
  return {
    text: data.response,
    model: data.model,
    usage: { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count },
  };
}

async function ollamaChat(provider, { model, messages, system, maxTokens, temperature }) {
  const baseUrl = provider.baseUrl || 'http://localhost:11434';
  const msgs = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      messages: msgs,
      options: { num_predict: maxTokens || 1024, temperature: temperature ?? 0.7 },
      stream: false,
    }),
  });

  if (!res.ok) await handleFetchError(res, 'Ollama');
  const data = await res.json();
  return {
    message: data.message,
    model: data.model,
    usage: { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count },
  };
}

// ── Dispatch table ─────────────────────────────────────────────────────────────

const GENERATE = { openai: openaiGenerate, anthropic: anthropicGenerate, gemini: geminiGenerate, ollama: ollamaGenerate };
const CHAT     = { openai: openaiChat,     anthropic: anthropicChat,     gemini: geminiChat,     ollama: ollamaChat };

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generate(providerId, params) {
  const provider = requireProvider(providerId);
  const fn = GENERATE[providerId];
  if (!fn) {
    const err = new Error(`No generate adapter for provider "${providerId}"`);
    err.statusCode = 400;
    throw err;
  }
  return fn(provider, params);
}

export async function chat(providerId, params) {
  const provider = requireProvider(providerId);
  const fn = CHAT[providerId];
  if (!fn) {
    const err = new Error(`No chat adapter for provider "${providerId}"`);
    err.statusCode = 400;
    throw err;
  }
  return fn(provider, params);
}
