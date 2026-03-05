import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";

// ── Shared styles ──────────────────────────────────────────────────────────────

const S = {
  card: {
    background: "#fff",
    border: "1px solid #e2e5ea",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    padding: "18px 20px",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
    display: "block",
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "7px 12px",
    border: "1px solid #e2e5ea",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    background: "#fff",
    color: "#1a1d23",
    boxSizing: "border-box",
  },
  select: {
    padding: "7px 12px",
    border: "1px solid #e2e5ea",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    background: "#fff",
    color: "#1a1d23",
  },
  tag: (bg, color) => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 9999,
    fontWeight: 600,
    background: bg,
    color,
  }),
};

// ── Token pricing (USD per 1M tokens) ─────────────────────────────────────────
// Approximate list prices as of early 2025. Actual prices may vary.

const PRICING = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Anthropic
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  // Google Gemini
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  // Ollama — local, free
};

/** Rough token approximation (~4 chars/token for English, GPT-style). */
function approximateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate cost in USD given model and token counts. Returns null if no pricing. */
function estimateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model];
  if (!p || !inputTokens) return null;
  return (
    (inputTokens / 1_000_000) * p.input +
    ((outputTokens || 0) / 1_000_000) * p.output
  );
}

function formatCost(usd) {
  if (usd === null || usd === undefined) return null;
  if (usd < 0.000001) return "< $0.000001";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

// ── Token Usage Panel ──────────────────────────────────────────────────────────

function TokenPanel({ usage, model, compact = false }) {
  if (!usage) return null;

  const input = usage.prompt_tokens ?? null;
  const output = usage.completion_tokens ?? null;
  const total = input != null && output != null ? input + output : null;
  const approx = input == null; // true when we used approximation
  const cost = estimateCost(model, input ?? 0, output ?? 0);

  const stat = (label, value, color = "#374151") => (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div
        style={{
          fontSize: compact ? 18 : 22,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
        }}
      >
        {value ?? "—"}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#9ca3af",
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: compact ? "10px 14px" : "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: compact ? 16 : 20,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: compact ? 16 : 24,
          alignItems: "center",
          flex: 1,
        }}
      >
        {stat(
          "Input",
          input != null
            ? input.toLocaleString()
            : "~" + approximateTokens(usage._rawPrompt || "").toLocaleString(),
          "#1e40af",
        )}
        <div style={{ color: "#d1d5db", fontSize: 18, fontWeight: 300 }}>+</div>
        {stat(
          "Output",
          output != null ? output.toLocaleString() : "—",
          "#7c3aed",
        )}
        <div style={{ color: "#d1d5db", fontSize: 18, fontWeight: 300 }}>=</div>
        {stat("Total", total != null ? total.toLocaleString() : "—", "#059669")}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          borderLeft: "1px solid #e5e7eb",
          paddingLeft: compact ? 16 : 20,
        }}
      >
        {cost !== null ? (
          <>
            <div
              style={{
                fontSize: compact ? 15 : 18,
                fontWeight: 700,
                color: "#d97706",
              }}
            >
              {formatCost(cost)}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Est. Cost
            </div>
          </>
        ) : (
          <>
            <div
              style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}
            >
              Free / N/A
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Est. Cost
            </div>
          </>
        )}
        {approx && (
          <div style={{ fontSize: 10, color: "#9ca3af" }}>~approximated</div>
        )}
        {PRICING[model] && !approx && (
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {PRICING[model].input}/M in · {PRICING[model].output}/M out
          </div>
        )}
      </div>
    </div>
  );
}

/** Accumulates token counts across multiple calls in a session. */
function SessionStats({ stats, model, requestCount, onReset }) {
  if (requestCount === 0) return null;

  const totalIn = stats.prompt_tokens || 0;
  const totalOut = stats.completion_tokens || 0;
  const totalTok = totalIn + totalOut;
  const cost = estimateCost(model, totalIn, totalOut);

  return (
    <div
      style={{
        ...S.card,
        background: "#f5f3ff",
        border: "1px solid #ddd6fe",
        marginBottom: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "#5b21b6" }}>
          Session Totals · {requestCount} request{requestCount !== 1 ? "s" : ""}
        </div>
        <button
          onClick={onReset}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            color: "#9ca3af",
            padding: 0,
          }}
        >
          Reset
        </button>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          ["Input", totalIn.toLocaleString(), "#1e40af"],
          ["Output", totalOut.toLocaleString(), "#7c3aed"],
          ["Total", totalTok.toLocaleString(), "#059669"],
          ["Cost", cost !== null ? formatCost(cost) : "Free", "#d97706"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ minWidth: 70 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div
              style={{
                fontSize: 10,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginTop: 2,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Providers Tab ──────────────────────────────────────────────────────────────

function ProviderCard({ provider, onSave }) {
  const [enabled, setEnabled] = useState(provider.enabled);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || "");
  const [defaultModel, setDefault] = useState(provider.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const isOllama = provider.id === "ollama";

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const patch = { enabled, defaultModel };
      if (apiKey) patch.apiKey = apiKey;
      if (isOllama) patch.baseUrl = baseUrl;
      await api.aiUpdateProvider(provider.id, patch);
      setMsg("Saved");
      setApiKey("");
      onSave();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  return (
    <div style={S.card}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1d23" }}>
            {provider.label}
          </span>
          <span
            style={
              provider.hasKey
                ? S.tag("#dcfce7", "#166534")
                : S.tag("#f3f4f6", "#6b7280")
            }
          >
            {provider.hasKey ? "Key set" : "No key"}
          </span>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontSize: 13,
            color: "#374151",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{
              width: 15,
              height: 15,
              cursor: "pointer",
              accentColor: "#4f6ef7",
            }}
          />
          Enabled
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isOllama ? (
          <div>
            <label style={S.label}>Base URL</label>
            <input
              style={S.input}
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label style={S.label}>API Key</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                style={{ ...S.input, fontFamily: "monospace" }}
                type={showKey ? "text" : "password"}
                placeholder={
                  provider.hasKey
                    ? "Enter new key to replace…"
                    : "Enter API key…"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                onClick={() => setShowKey((s) => !s)}
                title={showKey ? "Hide" : "Show"}
                style={{
                  flexShrink: 0,
                  padding: "6px 10px",
                  border: "1px solid #e2e5ea",
                  borderRadius: 6,
                  background: "#f9fafb",
                  cursor: "pointer",
                  fontSize: 14,
                  color: "#6b7280",
                  lineHeight: 1,
                }}
              >
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>
        )}

        <div>
          <label style={S.label}>Default Model</label>
          <select
            style={{ ...S.select, width: "100%" }}
            value={defaultModel}
            onChange={(e) => setDefault(e.target.value)}
          >
            {provider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          Available: {provider.models.join(" · ")}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid #f3f4f6",
        }}
      >
        <button
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span
            style={{
              fontSize: 13,
              color: msg === "Saved" ? "#16a34a" : "#dc2626",
            }}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.aiAdminProviders();
      setProviders(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="empty-state">Loading providers…</div>;
  if (error)
    return (
      <div className="empty-state" style={{ color: "#dc2626" }}>
        {error}
      </div>
    );

  return (
    <div>
      <div
        style={{
          ...S.card,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          marginBottom: 20,
        }}
      >
        <p
          style={{ margin: 0, fontSize: 13, color: "#1e40af", lineHeight: 1.7 }}
        >
          Configure LLM providers. Enable providers to make them available via{" "}
          <code
            style={{
              background: "#dbeafe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            POST /api/ai/generate
          </code>{" "}
          and{" "}
          <code
            style={{
              background: "#dbeafe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            POST /api/ai/chat
          </code>
          . API keys are write-only and never returned by the server.
        </p>
      </div>
      {providers.map((p) => (
        <ProviderCard key={p.id} provider={p} onSave={load} />
      ))}
    </div>
  );
}

// ── Playground Tab ─────────────────────────────────────────────────────────────

const EMPTY_SESSION = { prompt_tokens: 0, completion_tokens: 0 };

function PlaygroundTab() {
  const [mode, setMode] = useState("generate");
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [system, setSystem] = useState("");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]); // { role, content, usage? }
  const [chatInput, setChatInput] = useState("");
  const [result, setResult] = useState(null); // { text, model, usage }
  const [lastUsage, setLastUsage] = useState(null); // usage from last call
  const [sessionStats, setSession] = useState(EMPTY_SESSION);
  const [requestCount, setReqCnt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [maxTokens, setMaxTokens] = useState(1024);
  const [temperature, setTemp] = useState(0.7);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api
      .aiProviders()
      .then((res) => {
        const list = res?.data || [];
        setProviders(list);
        if (list.length > 0) {
          setProvider(list[0].id);
          setModel(list[0].defaultModel);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const p = providers.find((x) => x.id === provider);
    if (p) setModel(p.defaultModel);
  }, [provider]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedProvider = providers.find((p) => p.id === provider);

  /** Normalise usage — fill in approximations when provider returns null. */
  function normaliseUsage(usage, promptText, responseText) {
    const input = usage?.prompt_tokens ?? approximateTokens(promptText);
    const output = usage?.completion_tokens ?? approximateTokens(responseText);
    return {
      prompt_tokens: input,
      completion_tokens: output,
      _approx: !usage?.prompt_tokens,
    };
  }

  function accumulateSession(u) {
    setSession((prev) => ({
      prompt_tokens: (prev.prompt_tokens || 0) + (u.prompt_tokens || 0),
      completion_tokens:
        (prev.completion_tokens || 0) + (u.completion_tokens || 0),
    }));
    setReqCnt((n) => n + 1);
  }

  function resetSession() {
    setSession(EMPTY_SESSION);
    setReqCnt(0);
    setResult(null);
    setLastUsage(null);
  }

  async function runGenerate() {
    if (!provider || !prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setLastUsage(null);
    try {
      const res = await api.aiGenerate({
        provider,
        model: model || undefined,
        prompt,
        system: system || undefined,
        maxTokens,
        temperature,
      });
      const u = normaliseUsage(res.data.usage, prompt, res.data.text);
      setResult(res.data);
      setLastUsage(u);
      accumulateSession(u);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    if (!provider || !chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setLoading(true);
    setError("");
    try {
      const contextText = newMessages.map((m) => m.content).join(" ");
      const res = await api.aiChat({
        provider,
        model: model || undefined,
        messages: newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        system: system || undefined,
        maxTokens,
        temperature,
      });
      const u = normaliseUsage(
        res.data.usage,
        contextText,
        res.data.message.content,
      );
      setLastUsage(u);
      accumulateSession(u);
      setMessages((prev) => [...prev, { ...res.data.message, usage: u }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (providers.length === 0) {
    return (
      <div style={S.card}>
        <div className="empty-state" style={{ padding: "32px 0" }}>
          No providers enabled. Go to the <strong>Providers</strong> tab to
          enable one first.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Config row ─────────────────────────────────────────────── */}
      <div style={S.card}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 12,
          }}
        >
          {/* Mode */}
          <div>
            <label style={S.label}>Mode</label>
            <div
              style={{
                display: "flex",
                border: "1px solid #e2e5ea",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {["generate", "chat"].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setResult(null);
                    setMessages([]);
                    setError("");
                    setLastUsage(null);
                  }}
                  style={{
                    padding: "6px 14px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "inherit",
                    fontWeight: 500,
                    background: mode === m ? "#4f6ef7" : "#fff",
                    color: mode === m ? "#fff" : "#6b7280",
                    transition: "background 0.15s",
                  }}
                >
                  {m === "generate" ? "Generate" : "Chat"}
                </button>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div>
            <label style={S.label}>Provider</label>
            <select
              style={S.select}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={S.label}>Model</label>
            <select
              style={{ ...S.select, width: "100%" }}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {(selectedProvider?.models || []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Max Tokens */}
          <div>
            <label style={S.label}>Max Tokens</label>
            <input
              style={{ ...S.select, width: 90 }}
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={1}
              max={8192}
            />
          </div>

          {/* Temperature */}
          <div>
            <label style={S.label}>Temp</label>
            <input
              style={{ ...S.select, width: 70 }}
              type="number"
              value={temperature}
              onChange={(e) => setTemp(Number(e.target.value))}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
        </div>

        {/* System prompt */}
        <div>
          <label style={S.label}>
            System Prompt{" "}
            <span style={{ color: "#9ca3af", fontWeight: 400 }}>
              (optional)
            </span>
          </label>
          <textarea
            style={{ ...S.input, resize: "vertical", minHeight: 48 }}
            rows={2}
            placeholder="You are a helpful assistant…"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
          />
        </div>
      </div>

      {/* ── Generate mode ──────────────────────────────────────────── */}
      {mode === "generate" && (
        <div style={S.card}>
          <label style={S.label}>Prompt</label>
          <textarea
            style={{
              ...S.input,
              resize: "vertical",
              minHeight: 88,
              marginBottom: 10,
            }}
            rows={4}
            placeholder="Enter your prompt… (Ctrl+Enter to run)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) runGenerate();
            }}
          />

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: lastUsage ? 14 : 0,
            }}
          >
            <button
              className="btn btn-primary btn-sm"
              onClick={runGenerate}
              disabled={loading || !prompt.trim()}
            >
              {loading ? "Generating…" : "Generate"}
            </button>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Ctrl+Enter</span>
            {error && (
              <span style={{ fontSize: 13, color: "#dc2626", marginLeft: 4 }}>
                {error}
              </span>
            )}
          </div>

          {/* Token usage for last generate */}
          {/* {lastUsage && <TokenPanel usage={lastUsage} model={model} />} */}

          {/* Response */}
          {result && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {result.model}
                </span>
                {lastUsage?._approx && (
                  <span style={S.tag("#fef9c3", "#92400e")}>
                    Token counts approximated
                  </span>
                )}
              </div>
              <div
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "12px 14px",
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "#111827",
                }}
              >
                {result.text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Chat mode ──────────────────────────────────────────────── */}
      {mode === "chat" && (
        <div style={S.card}>
          {/* Message list */}
          <div
            style={{
              minHeight: 200,
              maxHeight: 420,
              overflowY: "auto",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 12,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  color: "#9ca3af",
                  fontSize: 13,
                  textAlign: "center",
                  marginTop: 70,
                }}
              >
                Start the conversation below
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                <div
                  style={{
                    maxWidth: "80%",
                    background: m.role === "user" ? "#4f6ef7" : "#fff",
                    color: m.role === "user" ? "#fff" : "#111827",
                    border: "1px solid",
                    borderColor: m.role === "user" ? "#4f6ef7" : "#e5e7eb",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
                {/* Inline token usage for assistant turns */}
                {m.role === "assistant" && m.usage && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 11,
                      color: "#9ca3af",
                      paddingLeft: 4,
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>
                      {m.usage.prompt_tokens?.toLocaleString()} in ·{" "}
                      {m.usage.completion_tokens?.toLocaleString()} out
                    </span>
                    {estimateCost(
                      model,
                      m.usage.prompt_tokens,
                      m.usage.completion_tokens,
                    ) !== null && (
                      <span style={{ color: "#d97706" }}>
                        {formatCost(
                          estimateCost(
                            model,
                            m.usage.prompt_tokens,
                            m.usage.completion_tokens,
                          ),
                        )}
                      </span>
                    )}
                    {m.usage._approx && (
                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                        ~approx
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  color: "#9ca3af",
                  fontSize: 13,
                }}
              >
                Thinking…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>
              {error}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="Type a message… (Enter to send)"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              disabled={loading}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={sendChat}
              disabled={loading || !chatInput.trim()}
            >
              Send
            </button>
            <button
              className="btn btn-ghost btn-sm"
              title="Clear chat"
              onClick={() => {
                setMessages([]);
                setError("");
                setLastUsage(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Session stats ───────────────────────────────────────────── */}
      <SessionStats
        stats={sessionStats}
        model={model}
        requestCount={requestCount}
        onReset={resetSession}
      />

      {/* Pricing disclaimer */}
      {requestCount > 0 && (
        <p
          style={{
            fontSize: 11,
            color: "#9ca3af",
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Pricing estimates are approximate and based on published list prices.
          Actual costs may vary. Ollama is always free (local inference). Token
          counts marked ~approx are calculated at ~4 chars/token.
        </p>
      )}
    </div>
  );
}

// ── API Docs Tab ───────────────────────────────────────────────────────────────

const METHOD_COLORS = {
  GET:    { bg: "#dcfce7", color: "#166534" },
  POST:   { bg: "#dbeafe", color: "#1e40af" },
  PUT:    { bg: "#fef9c3", color: "#854d0e" },
  DELETE: { bg: "#fee2e2", color: "#991b1b" },
};

const AI_ENDPOINTS = [
  {
    method: "GET",
    path: "/api/ai/providers",
    title: "List Enabled Providers",
    description:
      "Returns all enabled AI providers with their available models.",
    responseExample: `{
  "data": [
    {
      "id": "openai",
      "label": "OpenAI",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "defaultModel": "gpt-4o"
    }
  ]
}`,
    curlExample: `curl http://localhost:3000/api/ai/providers \\
  -H "Authorization: Bearer <token>"`,
    fetchExample: `const res = await fetch('/api/ai/providers', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const { data } = await res.json();`,
  },
  {
    method: "GET",
    path: "/api/ai/models",
    title: "List All Models",
    description: "Flat list of all models across all enabled providers.",
    responseExample: `{
  "data": [
    { "provider": "openai", "providerLabel": "OpenAI", "model": "gpt-4o" },
    { "provider": "anthropic", "providerLabel": "Anthropic", "model": "claude-sonnet-4-6" }
  ]
}`,
    curlExample: `curl http://localhost:3000/api/ai/models \\
  -H "Authorization: Bearer <token>"`,
    fetchExample: `const res = await fetch('/api/ai/models', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const { data } = await res.json();`,
  },
  {
    method: "POST",
    path: "/api/ai/generate",
    title: "Generate Text",
    description:
      "Single-turn text generation — send a prompt, get a completion.",
    requestSchema: [
      {
        field: "provider",
        type: "string",
        required: true,
        desc: "Provider ID: openai | anthropic | gemini | ollama",
      },
      {
        field: "prompt",
        type: "string",
        required: true,
        desc: "The user prompt",
      },
      {
        field: "model",
        type: "string",
        required: false,
        desc: "Override the default model",
      },
      {
        field: "system",
        type: "string",
        required: false,
        desc: "System/instruction prompt",
      },
      {
        field: "maxTokens",
        type: "number",
        required: false,
        desc: "Max output tokens (default: 1024)",
      },
      {
        field: "temperature",
        type: "number",
        required: false,
        desc: "Sampling temperature 0–2 (default: 0.7)",
      },
    ],
    responseExample: `{
  "data": {
    "text": "The capital of France is Paris.",
    "model": "gpt-4o",
    "usage": { "prompt_tokens": 12, "completion_tokens": 8 }
  }
}`,
    curlExample: `curl -X POST http://localhost:3000/api/ai/generate \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "prompt": "What is the capital of France?",
    "system": "Answer in one sentence.",
    "maxTokens": 100,
    "temperature": 0.5
  }'`,
    fetchExample: `const res = await fetch('/api/ai/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    provider: 'openai',
    model: 'gpt-4o',
    prompt: 'What is the capital of France?',
    maxTokens: 100,
    temperature: 0.5
  })
});
const { data } = await res.json();
// data.usage → { prompt_tokens, completion_tokens }`,
  },
  {
    method: "POST",
    path: "/api/ai/chat",
    title: "Chat Completion",
    description:
      "Multi-turn chat. Pass the full message history each call and append the assistant reply.",
    requestSchema: [
      {
        field: "provider",
        type: "string",
        required: true,
        desc: "Provider ID",
      },
      {
        field: "messages",
        type: "array",
        required: true,
        desc: 'Array of { role, content } — role is "user" or "assistant"',
      },
      {
        field: "model",
        type: "string",
        required: false,
        desc: "Override the default model",
      },
      {
        field: "system",
        type: "string",
        required: false,
        desc: "System prompt",
      },
      {
        field: "maxTokens",
        type: "number",
        required: false,
        desc: "Max output tokens (default: 1024)",
      },
      {
        field: "temperature",
        type: "number",
        required: false,
        desc: "Sampling temperature 0–2 (default: 0.7)",
      },
    ],
    responseExample: `{
  "data": {
    "message": { "role": "assistant", "content": "Sure, here's a joke…" },
    "model": "claude-sonnet-4-6",
    "usage": { "prompt_tokens": 32, "completion_tokens": 45 }
  }
}`,
    curlExample: `curl -X POST http://localhost:3000/api/ai/chat \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "system": "You are a helpful assistant.",
    "messages": [
      { "role": "user", "content": "Tell me a joke." }
    ]
  }'`,
    fetchExample: `const messages = [{ role: 'user', content: 'Tell me a joke.' }];

const res = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    system: 'You are a helpful assistant.',
    messages
  })
});
const { data } = await res.json();
// Maintain history for next turn:
messages.push(data.message);`,
  },
  {
    method: "PUT",
    path: "/admin/api/ai/providers/:id",
    title: "Update Provider Config",
    adminOnly: true,
    description:
      "Set API key, enable/disable, change default model, or set Ollama base URL. Requires admin role.",
    requestSchema: [
      {
        field: "enabled",
        type: "boolean",
        required: false,
        desc: "Enable or disable this provider",
      },
      {
        field: "apiKey",
        type: "string",
        required: false,
        desc: "API key (write-only — never returned)",
      },
      {
        field: "defaultModel",
        type: "string",
        required: false,
        desc: "Default model when none is specified",
      },
      {
        field: "baseUrl",
        type: "string",
        required: false,
        desc: "Ollama only: base URL (default: http://localhost:11434)",
      },
    ],
    responseExample: `{
  "data": {
    "id": "openai",
    "label": "OpenAI",
    "enabled": true,
    "hasKey": true,
    "models": ["gpt-4o", "gpt-4o-mini"],
    "defaultModel": "gpt-4o"
  },
  "message": "Provider \\"openai\\" updated."
}`,
    curlExample: `curl -X PUT http://localhost:3000/admin/api/ai/providers/openai \\
  -H "Authorization: Bearer <admin-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "sk-...",
    "enabled": true,
    "defaultModel": "gpt-4o"
  }'`,
    fetchExample: `const res = await fetch('/admin/api/ai/providers/openai', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + adminToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    apiKey: 'sk-...',
    enabled: true,
    defaultModel: 'gpt-4o'
  })
});
const { data } = await res.json();`,
  },
];

function EndpointCard({ ep }) {
  const [tab, setTab] = useState("overview");
  const [open, setOpen] = useState(false);
  const mc = METHOD_COLORS[ep.method] || {};

  return (
    <div
      style={{ ...S.card, marginBottom: 10, padding: 0, overflow: "hidden" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          cursor: "pointer",
          background: open ? "#fafbfc" : "#fff",
          borderBottom: open ? "1px solid #e2e5ea" : "none",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: mc.bg,
            color: mc.color,
            fontFamily: "monospace",
            minWidth: 42,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {ep.method}
        </span>
        <code style={{ fontSize: 13, color: "#374151", flex: 1 }}>
          {ep.path}
        </code>
        {ep.adminOnly && <span style={S.tag("#fef3c7", "#92400e")}>Admin</span>}
        <span style={{ color: "#9ca3af", fontSize: 13, flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
            {ep.description}
          </p>
          <div className="view-tabs" style={{ marginBottom: 14 }}>
            {["overview", "cURL", "fetch"].map((t) => (
              <button
                key={t}
                className={`view-tab${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ep.requestSchema && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                    }}
                  >
                    Request Body
                  </div>
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {["Field", "Type", "Required", "Description"].map(
                            (h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "7px 12px",
                                  textAlign: "left",
                                  borderBottom: "1px solid #e5e7eb",
                                  color: "#374151",
                                  fontWeight: 600,
                                  fontSize: 12,
                                }}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {ep.requestSchema.map((f, i) => (
                          <tr
                            key={f.field}
                            style={{
                              borderBottom:
                                i < ep.requestSchema.length - 1
                                  ? "1px solid #f3f4f6"
                                  : "none",
                            }}
                          >
                            <td style={{ padding: "7px 12px" }}>
                              <code
                                style={{
                                  fontSize: 12,
                                  background: "#f3f4f6",
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                }}
                              >
                                {f.field}
                              </code>
                            </td>
                            <td
                              style={{
                                padding: "7px 12px",
                                color: "#7c3aed",
                                fontFamily: "monospace",
                                fontSize: 12,
                              }}
                            >
                              {f.type}
                            </td>
                            <td style={{ padding: "7px 12px" }}>
                              <span
                                style={
                                  f.required
                                    ? S.tag("#fef3c7", "#92400e")
                                    : S.tag("#f3f4f6", "#6b7280")
                                }
                              >
                                {f.required ? "Required" : "Optional"}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "7px 12px",
                                color: "#6b7280",
                                fontSize: 12,
                              }}
                            >
                              {f.desc}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}
                >
                  Response
                </div>
                <pre
                  style={{
                    background: "#1e1e2e",
                    color: "#cdd6f4",
                    padding: "12px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: "auto",
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {ep.responseExample}
                </pre>
              </div>
            </div>
          )}
          {tab === "cURL" && (
            <pre
              style={{
                background: "#1e1e2e",
                color: "#cdd6f4",
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 12,
                overflow: "auto",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              {ep.curlExample}
            </pre>
          )}
          {tab === "fetch" && (
            <pre
              style={{
                background: "#1e1e2e",
                color: "#cdd6f4",
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 12,
                overflow: "auto",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              {ep.fetchExample}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const AGENT_ENDPOINTS = [
  {
    method: "GET", path: "/api/agents", title: "List Agents",
    description: "Returns all available agents. Accessible to any authenticated user.",
    responseExample: `{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Research Assistant",
      "description": "Gathers and summarises information from the web",
      "provider": "openai",
      "model": "gpt-4o",
      "tools": ["web_search", "http_get"],
      "createdAt": "2025-03-05T10:00:00.000Z"
    }
  ]
}`,
    curlExample: `curl http://localhost:3000/api/agents \\
  -H "Authorization: Bearer <token>"`,
    fetchExample: `const res = await fetch('/api/agents', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const { data } = await res.json();`,
  },
  {
    method: "GET", path: "/api/agents/tools", title: "List Available Tools",
    description: "Returns all built-in tools that can be assigned to agents, including their parameter schemas.",
    responseExample: `{
  "data": [
    {
      "name": "web_search",
      "description": "Search the web using DuckDuckGo...",
      "parameters": {
        "query": { "type": "string", "description": "The search query" }
      },
      "required": ["query"]
    },
    {
      "name": "calculate",
      "description": "Safely evaluate a mathematical expression...",
      "parameters": {
        "expression": { "type": "string", "description": "A math expression" }
      },
      "required": ["expression"]
    }
  ]
}`,
    curlExample: `curl http://localhost:3000/api/agents/tools \\
  -H "Authorization: Bearer <token>"`,
    fetchExample: `const res = await fetch('/api/agents/tools', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const { data: tools } = await res.json();`,
  },
  {
    method: "POST", path: "/api/agents/:id/run", title: "Run an Agent",
    description: "Execute an agent with a user input. The agent will autonomously decide which tools to call, iterate through a ReAct loop, and return a final answer along with all intermediate reasoning steps.",
    requestSchema: [
      { field: "input", type: "string", required: true, desc: "The task or question to give the agent" },
    ],
    responseExample: `{
  "data": {
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "agentName": "Research Assistant",
    "input": "What are the latest trends in battery technology?",
    "output": "Recent research in battery technology focuses on solid-state batteries...",
    "steps": [
      { "type": "thinking",     "content": "I should search for this.",    "iteration": 1 },
      { "type": "tool_call",   "tool": "web_search", "args": { "query": "battery technology 2025" }, "iteration": 1 },
      { "type": "tool_result", "tool": "web_search", "result": "Summary: ...", "iteration": 1 },
      { "type": "final_answer","content": "Recent research...", "iteration": 2 }
    ],
    "usage": { "prompt_tokens": 420, "completion_tokens": 310 }
  }
}`,
    curlExample: `curl -X POST http://localhost:3000/api/agents/550e8400-e29b-41d4-a716-446655440000/run \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "input": "What are the latest trends in battery technology?" }'`,
    fetchExample: `const agentId = '550e8400-e29b-41d4-a716-446655440000';

const res = await fetch(\`/api/agents/\${agentId}/run\`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    input: 'What are the latest trends in battery technology?'
  })
});
const { data } = await res.json();
console.log(data.output);  // Final answer
console.log(data.steps);   // Reasoning trace
console.log(data.usage);   // Token counts`,
  },
  {
    method: "GET", path: "/admin/api/agents", title: "List All Agents (Admin)",
    adminOnly: true,
    description: "Returns all agents with full configuration including system prompts. Requires admin role.",
    responseExample: `{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Research Assistant",
      "description": "...",
      "provider": "openai",
      "model": "gpt-4o",
      "systemPrompt": "You are a research assistant...",
      "tools": ["web_search", "http_get"],
      "temperature": 0.7,
      "maxTokens": 2048,
      "maxIterations": 10,
      "createdAt": "2025-03-05T10:00:00.000Z",
      "updatedAt": "2025-03-05T10:00:00.000Z"
    }
  ]
}`,
    curlExample: `curl http://localhost:3000/admin/api/agents \\
  -H "Authorization: Bearer <admin-token>"`,
    fetchExample: `const res = await fetch('/admin/api/agents', {
  headers: { 'Authorization': 'Bearer ' + adminToken }
});
const { data } = await res.json();`,
  },
  {
    method: "POST", path: "/admin/api/agents", title: "Create Agent",
    adminOnly: true,
    description: "Create a new agent. The agent is immediately available to run.",
    requestSchema: [
      { field: "name",          type: "string",  required: true,  desc: "Display name for the agent" },
      { field: "provider",      type: "string",  required: true,  desc: "Provider ID: openai | anthropic | gemini | ollama" },
      { field: "model",         type: "string",  required: true,  desc: "Model to use (must belong to the selected provider)" },
      { field: "description",   type: "string",  required: false, desc: "Short description of what the agent does" },
      { field: "systemPrompt",  type: "string",  required: false, desc: "System / instruction prompt sent to the model on every run" },
      { field: "tools",         type: "array",   required: false, desc: 'Array of tool names to enable, e.g. ["web_search", "calculate"]' },
      { field: "temperature",   type: "number",  required: false, desc: "Sampling temperature 0–2 (default: 0.7)" },
      { field: "maxTokens",     type: "number",  required: false, desc: "Max output tokens per LLM call (default: 2048)" },
      { field: "maxIterations", type: "number",  required: false, desc: "Max tool-calling iterations before stopping (default: 10)" },
    ],
    responseExample: `{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Assistant",
    "provider": "openai",
    "model": "gpt-4o",
    "tools": ["web_search"],
    "temperature": 0.7,
    "maxTokens": 2048,
    "maxIterations": 10,
    "createdAt": "2025-03-05T10:00:00.000Z"
  },
  "message": "Agent \\"Research Assistant\\" created."
}`,
    curlExample: `curl -X POST http://localhost:3000/admin/api/agents \\
  -H "Authorization: Bearer <admin-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Research Assistant",
    "provider": "openai",
    "model": "gpt-4o",
    "description": "Searches the web and summarises findings",
    "systemPrompt": "You are a research assistant. Always cite your sources.",
    "tools": ["web_search", "http_get"],
    "temperature": 0.5,
    "maxTokens": 2048,
    "maxIterations": 8
  }'`,
    fetchExample: `const res = await fetch('/admin/api/agents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + adminToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Research Assistant',
    provider: 'openai',
    model: 'gpt-4o',
    description: 'Searches the web and summarises findings',
    systemPrompt: 'You are a research assistant. Always cite your sources.',
    tools: ['web_search', 'http_get'],
    temperature: 0.5,
    maxIterations: 8
  })
});
const { data } = await res.json();
const agentId = data.id;`,
  },
  {
    method: "PUT", path: "/admin/api/agents/:id", title: "Update Agent",
    adminOnly: true,
    description: "Update any field of an existing agent. Only the fields you send are changed.",
    requestSchema: [
      { field: "name",          type: "string",  required: false, desc: "New display name" },
      { field: "description",   type: "string",  required: false, desc: "New description" },
      { field: "provider",      type: "string",  required: false, desc: "New provider ID" },
      { field: "model",         type: "string",  required: false, desc: "New model" },
      { field: "systemPrompt",  type: "string",  required: false, desc: "New system prompt" },
      { field: "tools",         type: "array",   required: false, desc: "Replacement tools array" },
      { field: "temperature",   type: "number",  required: false, desc: "New temperature" },
      { field: "maxTokens",     type: "number",  required: false, desc: "New max tokens" },
      { field: "maxIterations", type: "number",  required: false, desc: "New max iterations" },
    ],
    responseExample: `{
  "data": { "id": "...", "name": "Updated Name", "updatedAt": "2025-03-05T11:00:00.000Z" },
  "message": "Agent \\"Updated Name\\" updated."
}`,
    curlExample: `curl -X PUT http://localhost:3000/admin/api/agents/<id> \\
  -H "Authorization: Bearer <admin-token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "gpt-4o-mini", "temperature": 0.3 }'`,
    fetchExample: `const res = await fetch(\`/admin/api/agents/\${agentId}\`, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + adminToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.3 })
});
const { data } = await res.json();`,
  },
  {
    method: "DELETE", path: "/admin/api/agents/:id", title: "Delete Agent",
    adminOnly: true,
    description: "Permanently delete an agent. Returns 204 No Content on success.",
    responseExample: `HTTP 204 No Content`,
    curlExample: `curl -X DELETE http://localhost:3000/admin/api/agents/<id> \\
  -H "Authorization: Bearer <admin-token>"`,
    fetchExample: `await fetch(\`/admin/api/agents/\${agentId}\`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer ' + adminToken }
});
// 204 — agent deleted`,
  },
];

function ApiDocsTab() {
  return (
    <div>
      <div
        style={{
          ...S.card,
          background: "#f5f3ff",
          border: "1px solid #ddd6fe",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 6,
            color: "#5b21b6",
            fontSize: 14,
          }}
        >
          AI API Overview
        </div>
        <p
          style={{ margin: 0, fontSize: 13, color: "#6d28d9", lineHeight: 1.7 }}
        >
          All AI endpoints require a valid Bearer token. Public routes (
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            /api/ai/*
          </code>
          ) are accessible to all authenticated users. Admin routes (
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            /admin/api/ai/*
          </code>
          ) require{" "}
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            role: admin
          </code>
          . All generate/chat responses include a{" "}
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            usage
          </code>{" "}
          object with{" "}
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            prompt_tokens
          </code>{" "}
          and{" "}
          <code
            style={{
              background: "#ede9fe",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            completion_tokens
          </code>
          .
        </p>
      </div>
      {AI_ENDPOINTS.map((ep) => (
        <EndpointCard key={ep.method + ep.path} ep={ep} />
      ))}

      {/* ── Agents section ──────────────────────────────────────────── */}
      <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1d23", margin: "24px 0 12px" }}>
        Agents API
      </div>
      <div style={{ ...S.card, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#166534", lineHeight: 1.7 }}>
          Agents combine an LLM with a set of <strong>tools</strong> and a system prompt. When you run an agent it autonomously decides which tools to call, iterates through a ReAct loop (up to <code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>maxIterations</code>), and returns a final answer along with a full reasoning trace in <code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>steps</code>.
          Public routes (<code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>/api/agents/*</code>) require authentication.
          Admin routes (<code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>/admin/api/agents/*</code>) require <code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>role: admin</code>.
        </p>
      </div>
      {AGENT_ENDPOINTS.map((ep) => (
        <EndpointCard key={ep.method + ep.path} ep={ep} />
      ))}
    </div>
  );
}

// ── Agents Tab ────────────────────────────────────────────────────────────────

const TOOL_LABELS = {
  get_datetime:     'Date & Time',
  calculate:        'Calculator',
  web_search:       'Web Search',
  http_get:         'HTTP GET',
  database_query:   'Database Query',
};

function AgentForm({ initial, providers, tools, onSave, onCancel }) {
  const [name, setName]           = useState(initial?.name || '');
  const [desc, setDesc]           = useState(initial?.description || '');
  const [provider, setProvider]   = useState(initial?.provider || providers[0]?.id || '');
  const [model, setModel]         = useState(initial?.model || providers[0]?.defaultModel || '');
  const [systemPrompt, setSys]    = useState(initial?.systemPrompt || '');
  const [selTools, setSelTools]   = useState(new Set(initial?.tools || []));
  const [temperature, setTemp]    = useState(initial?.temperature ?? 0.7);
  const [maxTokens, setMaxTok]    = useState(initial?.maxTokens ?? 2048);
  const [maxIter, setMaxIter]     = useState(initial?.maxIterations ?? 10);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const selectedProv = providers.find(p => p.id === provider);

  useEffect(() => {
    const p = providers.find(x => x.id === provider);
    if (p) setModel(p.defaultModel || p.models[0] || '');
  }, [provider]);

  function toggleTool(name) {
    setSelTools(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await onSave({
        name: name.trim(), description: desc.trim(), provider, model,
        systemPrompt: systemPrompt.trim(), tools: [...selTools],
        temperature, maxTokens, maxIterations: maxIter,
      });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const row = { display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={row}>
          <label style={S.label}>Agent Name *</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="Research Assistant" />
        </div>
        <div style={row}>
          <label style={S.label}>Description</label>
          <input style={S.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this agent do?" />
        </div>
        <div style={row}>
          <label style={S.label}>Provider *</label>
          <select style={{ ...S.select, width: '100%' }} value={provider} onChange={e => setProvider(e.target.value)}>
            {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div style={row}>
          <label style={S.label}>Model *</label>
          <select style={{ ...S.select, width: '100%' }} value={model} onChange={e => setModel(e.target.value)}>
            {(selectedProv?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={row}>
          <label style={S.label}>Temperature</label>
          <input style={{ ...S.select, width: '100%' }} type="number" value={temperature} onChange={e => setTemp(Number(e.target.value))} min={0} max={2} step={0.1} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={row}>
            <label style={S.label}>Max Tokens</label>
            <input style={{ ...S.select, width: '100%' }} type="number" value={maxTokens} onChange={e => setMaxTok(Number(e.target.value))} min={256} max={16000} />
          </div>
          <div style={row}>
            <label style={S.label}>Max Iterations</label>
            <input style={{ ...S.select, width: '100%' }} type="number" value={maxIter} onChange={e => setMaxIter(Number(e.target.value))} min={1} max={20} />
          </div>
        </div>
      </div>

      <div style={row}>
        <label style={S.label}>System Prompt</label>
        <textarea style={{ ...S.input, resize: 'vertical', minHeight: 72 }} rows={3}
          value={systemPrompt} onChange={e => setSys(e.target.value)}
          placeholder="You are a helpful assistant that..." />
      </div>

      <div>
        <label style={{ ...S.label, marginBottom: 8 }}>Tools</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tools.map(t => (
            <label key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '5px 12px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${selTools.has(t.name) ? '#4f6ef7' : '#e2e5ea'}`,
              background: selTools.has(t.name) ? '#eff2ff' : '#fff',
              color: selTools.has(t.name) ? '#4f6ef7' : '#374151',
              transition: 'all 0.15s',
            }}>
              <input type="checkbox" checked={selTools.has(t.name)} onChange={() => toggleTool(t.name)}
                style={{ accentColor: '#4f6ef7' }} />
              {TOOL_LABELS[t.name] || t.name}
            </label>
          ))}
          {tools.length === 0 && <span style={{ fontSize: 13, color: '#9ca3af' }}>No tools available</span>}
        </div>
        {[...selTools].length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
            {[...selTools].map(n => TOOL_LABELS[n] || n).join(' · ')}
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : (initial ? 'Update Agent' : 'Create Agent')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function AgentSteps({ steps }) {
  if (!steps?.length) return null;
  const [open, setOpen] = useState(false);

  const icons = { thinking: '💭', tool_call: '🔧', tool_result: '✅', final_answer: '✓' };
  const colors = { thinking: '#6b7280', tool_call: '#1e40af', tool_result: '#166534', final_answer: '#059669' };

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: '1px solid #e2e5ea', borderRadius: 6,
        padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#6b7280',
        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {open ? '▲' : '▼'} {steps.length} reasoning step{steps.length !== 1 ? 's' : ''}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, i) => (
            <div key={i} style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6,
              padding: '8px 12px', fontSize: 12,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: step.content || step.args || step.result ? 5 : 0 }}>
                <span>{icons[step.type] || '•'}</span>
                <span style={{ fontWeight: 600, color: colors[step.type] || '#374151', textTransform: 'capitalize' }}>
                  {step.type.replace('_', ' ')}
                  {step.tool ? `: ${step.tool}` : ''}
                </span>
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>iter {step.iteration}</span>
              </div>
              {step.args && Object.keys(step.args).length > 0 && (
                <pre style={{ margin: 0, background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, fontSize: 11, overflow: 'auto', color: '#374151' }}>
                  {JSON.stringify(step.args, null, 2)}
                </pre>
              )}
              {(step.content || step.result) && (
                <div style={{ marginTop: 4, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                  {step.content || (typeof step.result === 'string' ? step.result : JSON.stringify(step.result))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentPlayground({ agent, onClose }) {
  const [input, setInput]         = useState('');
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [sessionStats, setSession]= useState({ prompt_tokens: 0, completion_tokens: 0 });
  const [reqCount, setReqCnt]     = useState(0);

  async function run() {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.runAgent(agent.id, input.trim());
      setResult(res.data);
      if (res.data.usage) {
        setSession(prev => ({
          prompt_tokens:     (prev.prompt_tokens    || 0) + (res.data.usage.prompt_tokens    || 0),
          completion_tokens: (prev.completion_tokens || 0) + (res.data.usage.completion_tokens || 0),
        }));
        setReqCnt(n => n + 1);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {/* Agent header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← Back</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{agent.provider} · {agent.model}</div>
        </div>
        {agent.tools?.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {agent.tools.map(t => (
              <span key={t} style={S.tag('#eff2ff', '#4f6ef7')}>{TOOL_LABELS[t] || t}</span>
            ))}
          </div>
        )}
      </div>

      {agent.systemPrompt && (
        <div style={{ ...S.card, background: '#f5f3ff', border: '1px solid #ddd6fe', marginBottom: 14, fontSize: 13, color: '#5b21b6' }}>
          <strong style={{ display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Prompt</strong>
          {agent.systemPrompt}
        </div>
      )}

      {/* Input */}
      <div style={S.card}>
        <label style={S.label}>Task / Input</label>
        <textarea
          style={{ ...S.input, resize: 'vertical', minHeight: 80, marginBottom: 10 }}
          rows={3}
          placeholder="Describe the task for this agent…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) run(); }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={run} disabled={loading || !input.trim()}>
            {loading ? 'Running agent…' : 'Run Agent'}
          </button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Ctrl+Enter</span>
          {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={S.card}>
          {/* Token usage */}
          {result.usage && (
            <div style={{ marginBottom: 14 }}>
              <TokenPanel usage={result.usage} model={agent.model} compact />
            </div>
          )}

          {/* Steps */}
          <AgentSteps steps={result.steps} />

          {/* Final output */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Output
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
              {result.output}
            </div>
          </div>
        </div>
      )}

      {/* Session stats */}
      {reqCount > 0 && (
        <SessionStats stats={sessionStats} model={agent.model} requestCount={reqCount} onReset={() => { setSession({ prompt_tokens: 0, completion_tokens: 0 }); setReqCnt(0); }} />
      )}
    </div>
  );
}

function AgentsTab() {
  const [agents, setAgents]       = useState([]);
  const [tools, setTools]         = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('list'); // 'list' | 'create' | 'edit' | 'run'
  const [selected, setSelected]   = useState(null);
  const [error, setError]         = useState('');

  async function load() {
    setLoading(true);
    try {
      const [agRes, toolRes, provRes] = await Promise.all([
        api.adminListAgents(),
        api.listTools(),
        api.aiAdminProviders(),
      ]);
      setAgents(agRes.data || []);
      setTools(toolRes.data || []);
      setProviders((provRes.data || []).filter(p => p.enabled));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data) {
    await api.adminCreateAgent(data);
    await load();
    setView('list');
  }

  async function handleUpdate(data) {
    await api.adminUpdateAgent(selected.id, data);
    await load();
    setView('list');
    setSelected(null);
  }

  async function handleDelete(agent) {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    await api.adminDeleteAgent(agent.id);
    await load();
  }

  if (loading) return <div className="empty-state">Loading agents…</div>;

  // Run playground
  if (view === 'run' && selected) {
    return <AgentPlayground agent={selected} onClose={() => { setView('list'); setSelected(null); }} />;
  }

  // Create form
  if (view === 'create') {
    if (providers.length === 0) {
      return (
        <div style={S.card}>
          <div className="empty-state" style={{ padding: '24px 0' }}>
            No providers enabled. Enable at least one provider in the <strong>Providers</strong> tab first.
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('list')}>← Back</button>
        </div>
      );
    }
    return (
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Create Agent</div>
        <AgentForm providers={providers} tools={tools} onSave={handleCreate} onCancel={() => setView('list')} />
      </div>
    );
  }

  // Edit form
  if (view === 'edit' && selected) {
    return (
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Edit Agent</div>
        <AgentForm initial={selected} providers={providers} tools={tools} onSave={handleUpdate} onCancel={() => { setView('list'); setSelected(null); }} />
      </div>
    );
  }

  // Agent list
  return (
    <div>
      {error && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setView('create')}>+ New Agent</button>
      </div>

      {agents.length === 0 ? (
        <div style={S.card}>
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No agents yet</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>
              Create your first agent to start building autonomous AI workflows.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {agents.map(agent => (
            <div key={agent.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</span>
                    <span style={S.tag('#eff2ff', '#4f6ef7')}>{agent.provider}</span>
                    <span style={S.tag('#f3f4f6', '#374151')}>{agent.model}</span>
                  </div>
                  {agent.description && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>{agent.description}</div>
                  )}
                  {agent.tools?.length > 0 ? (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {agent.tools.map(t => (
                        <span key={t} style={{ ...S.tag('#f0fdf4', '#166534'), fontSize: 10 }}>
                          {TOOL_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>No tools</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { setSelected(agent); setView('run'); }}>
                    ▶ Run
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(agent); setView('edit'); }}>
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }}
                    onClick={() => handleDelete(agent)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tools reference */}
      <div style={{ ...S.card, marginTop: 20, background: '#f9fafb' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Available Tools</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {tools.map(t => (
            <div key={t.name} style={{ display: 'flex', gap: 10 }}>
              <code style={{ fontSize: 12, background: '#e5e7eb', padding: '1px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{t.name}</code>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{t.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "providers", label: "Providers" },
  { key: "playground", label: "Playground" },
  { key: "agents",    label: "Agents" },
  { key: "docs",      label: "API Docs" },
];

export default function AI() {
  const [tab, setTab] = useState("providers");
  return (
    <div>
      <div className="view-tabs" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`view-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "providers" && <ProvidersTab />}
      {tab === "playground" && <PlaygroundTab />}
      {tab === "agents"    && <AgentsTab />}
      {tab === "docs"      && <ApiDocsTab />}
    </div>
  );
}
