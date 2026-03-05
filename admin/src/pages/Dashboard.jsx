import { useState, useEffect } from "react";
import { api } from "../api";

function fmtUptime(seconds) {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ${h % 24}h`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ${d % 30}d`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ${mo % 12}mo`;
}

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const TOOL_LABELS = {
  get_datetime: "DateTime",
  calculate: "Calculator",
  web_search: "Web Search",
  http_get: "HTTP GET",
  database_query: "DB Query",
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getStats(), api.health()])
      .then(([s, h]) => {
        setStats(s.data);
        setHealth(h);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-msg">{error}</div>;
  if (!stats)
    return (
      <div className="empty-state">
        <p>Loading…</p>
      </div>
    );

  const totalRows = stats.models.reduce((sum, m) => sum + m.count, 0);
  const ai = stats.ai || {};
  const usage = ai.usage || {};
  const totalTokens =
    (usage.totalInputTokens || 0) + (usage.totalOutputTokens || 0);

  return (
    <>
      {/* ── Top stat cards ────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Schemas</div>
          <div className="value">{stats.models.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Records</div>
          <div className="value">{totalRows}</div>
        </div>
        <div className="stat-card">
          <div className="label">Users</div>
          <div className="value">{stats.users?.count ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Files</div>
          <div className="value">{stats.files.count}</div>
        </div>
        <div className="stat-card">
          <div className="label">Storage Used</div>
          <div className="value">{stats.files.storageMB} MB</div>
        </div>
        <div className="stat-card">
          <div className="label">Connected LLMs</div>
          <div
            className="value"
            style={{
              color:
                ai.connectedLLMs > 0 ? "var(--primary)" : "var(--text-muted)",
            }}
          >
            {ai.connectedLLMs ?? 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Agents Created</div>
          <div className="value">{ai.agentsCount ?? 0}</div>
        </div>
        {/* <div className="stat-card">
          <div className="label">Tokens Used</div>
          <div
            className="value"
            style={{
              color: totalTokens > 0 ? "var(--primary)" : "var(--text-muted)",
            }}
          >
            {fmt(totalTokens)}
          </div>
        </div> */}
        {/* <div className="stat-card">
          <div className="label">AI Requests</div>
          <div className="value">{usage.totalRequests ?? 0}</div>
        </div> */}
        <div className="stat-card">
          <div className="label">Uptime</div>
          <div className="value">{fmtUptime(stats.uptime)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Status</div>
          <div
            className="value"
            style={{
              color:
                health?.status === "ok" ? "var(--success)" : "var(--danger)",
            }}
          >
            {health?.status === "ok" ? "● Online" : "○ Down"}
          </div>
        </div>
      </div>

      {/* ── AI Overview ───────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Connected LLMs */}
        <div className="card">
          <div className="card-header">
            <h3>Schema Overview</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Table</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {stats.models.map((m) => (
                <tr key={m.model}>
                  <td style={{ fontWeight: 600 }}>{m.model}</td>
                  <td style={{ color: "var(--text-muted)" }}>{m.table}</td>
                  <td>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Connected LLMs</h3>
          </div>
          {(ai.providers || []).length === 0 ? (
            <div
              style={{
                padding: "20px 20px",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              No providers enabled. Configure them in the AI tab.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Requests</th>
                  <th>Tokens In</th>
                  <th>Tokens Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(ai.providers || []).map((p) => {
                  const u = usage.byProvider?.[p.id] || {};
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td>{u.requests ?? 0}</td>
                      <td>{fmt(u.inputTokens)}</td>
                      <td>{fmt(u.outputTokens)}</td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontWeight: 600,
                            background: p.hasKey ? "#dcfce7" : "#fef3c7",
                            color: p.hasKey ? "#166534" : "#92400e",
                          }}
                        >
                          {p.hasKey ? "Connected" : "No key"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Token usage breakdown */}
        {/* <div className="card">
          <div className="card-header">
            <h3>Token Usage</h3>
          </div>
          {totalTokens === 0 ? (
            <div
              style={{
                padding: "20px 20px",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              No tokens recorded yet. Run a prompt or agent to start tracking.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Total Requests", usage.totalRequests],
                  ["Input Tokens", usage.totalInputTokens],
                  ["Output Tokens", usage.totalOutputTokens],
                  ["Total Tokens", totalTokens],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ color: "var(--text-muted)" }}>{label}</td>
                    <td style={{ fontWeight: 600, fontFamily: "monospace" }}>
                      {(val || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div> */}
      </div>

      {/* ── Agents ────────────────────────────────────────────────── */}
      {/* {(ai.agents || []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3>Agents</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Tools</th>
              </tr>
            </thead>
            <tbody>
              {(ai.agents || []).map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td
                    style={{
                      color: "var(--text-muted)",
                      textTransform: "capitalize",
                    }}
                  >
                    {a.provider}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {a.model}
                  </td>
                  <td>
                    {a.tools?.length > 0 ? (
                      <div
                        style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                      >
                        {a.tools.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 9999,
                              fontWeight: 600,
                              background: "#eff2ff",
                              color: "#4f6ef7",
                            }}
                          >
                            {TOOL_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span
                        style={{ fontSize: 12, color: "var(--text-muted)" }}
                      >
                        None
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )} */}

      {/* ── Models Overview ───────────────────────────────────────── */}
    </>
  );
}
