import { useState, useEffect } from 'react';
import { api } from '../api';

// ── Variable definitions ──────────────────────────────────────────────────────

const SECTIONS = [
  {
    title: 'Authentication',
    icon: '◈',
    desc: 'Secrets used to sign and verify JWT tokens. Change these if a secret is compromised. Restart required.',
    vars: [
      {
        key:     'JWT_SECRET',
        label:   'JWT Secret',
        secret:  true,
        desc:    'Signs access tokens. Must be a long random string in production.',
        example: 'openssl rand -hex 32',
      },
      {
        key:     'JWT_REFRESH_SECRET',
        label:   'JWT Refresh Secret',
        secret:  true,
        desc:    'Signs refresh tokens. Use a different value from JWT_SECRET.',
        example: 'openssl rand -hex 32',
      },
    ],
  },
  {
    title: 'Server',
    icon: '▤',
    desc: 'Network and runtime settings for the Fastify server.',
    vars: [
      {
        key:         'ROTIFEX_PORT',
        label:       'Port',
        secret:      false,
        desc:        'TCP port the server listens on.',
        placeholder: '4994',
        type:        'number',
      },
      {
        key:         'ROTIFEX_HOST',
        label:       'Host',
        secret:      false,
        desc:        'Bind address. Use 0.0.0.0 to accept connections on all interfaces.',
        placeholder: '0.0.0.0',
      },
      {
        key:         'ROTIFEX_CORS_ORIGIN',
        label:       'CORS Origin',
        secret:      false,
        desc:        'Allowed request origin. Use * to allow all, or a specific domain.',
        placeholder: '*',
      },
      {
        key:         'ROTIFEX_RATE_LIMIT_MAX',
        label:       'Rate Limit (req / min)',
        secret:      false,
        desc:        'Maximum requests per minute per IP before the server returns 429.',
        placeholder: '100',
        type:        'number',
      },
      {
        key:         'ROTIFEX_LOG_LEVEL',
        label:       'Log Level',
        secret:      false,
        desc:        'Minimum log level written to the in-memory buffer.',
        placeholder: 'info',
        options:     ['trace', 'debug', 'info', 'warn', 'error'],
      },
    ],
  },
  {
    title: 'Storage',
    icon: '◫',
    desc: 'File upload and signed-URL settings.',
    vars: [
      {
        key:         'ROTIFEX_STORAGE_MAX_FILE_SIZE_MB',
        label:       'Max File Size (MB)',
        secret:      false,
        desc:        'Maximum allowed upload size in megabytes.',
        placeholder: '10',
        type:        'number',
      },
      {
        key:     'ROTIFEX_STORAGE_SIGNED_URL_SECRET',
        label:   'Signed URL Secret',
        secret:  true,
        desc:    'HMAC secret used to generate expiring signed download URLs for private files.',
        example: 'openssl rand -hex 32',
      },
    ],
  },
  {
    title: 'Database',
    icon: '◧',
    desc: 'External SQL database connection string. Leave blank to use the default SQLite database. Supported: PostgreSQL, MySQL, MariaDB. Restart required.',
    vars: [
      {
        key:         'ROTIFEX_DATABASE_URL',
        label:       'Connection String',
        secret:      true,
        desc:        'Full database URL. Empty = use local SQLite (default). Requires the matching driver: pg (PostgreSQL), mysql2 (MySQL/MariaDB).',
        placeholder: 'postgresql://user:pass@host:5432/dbname',
        example:     'postgresql://user:pass@localhost:5432/mydb',
      },
    ],
  },
];

// ── Token Timing ─────────────────────────────────────────────────────────────

const ACCESS_KEY  = 'ROTIFEX_ACCESS_TOKEN_TTL';
const REFRESH_KEY = 'ROTIFEX_REFRESH_TOKEN_TTL';

// Hard thresholds — must match auth.service.js constants.
const ACCESS_MIN        = 5;    // minutes
const REFRESH_MIN       = 120;  // minutes (2 h floor)
const REFRESH_MULT      = 2;    // refresh >= REFRESH_MULT × access

function fmtMinutes(raw) {
  const m = Number(raw);
  if (!m || m <= 0) return '—';
  if (m < 60)   return `${m} min`;
  if (m < 1440) { const h = m / 60;   return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`;  }
  const d = m / 1440; return `${Number.isInteger(d) ? d : d.toFixed(1)} day${d !== 1 ? 's' : ''}`;
}

function TokenTimingCard({ values, set, dirty, onValidChange }) {
  const access  = Number(values[ACCESS_KEY])  || 60;
  const refresh = Number(values[REFRESH_KEY]) || 43200;

  const minRefresh   = Math.max(REFRESH_MIN, access * REFRESH_MULT);
  const accessError  = access  < ACCESS_MIN  ? `Minimum ${ACCESS_MIN} minutes` : null;
  const refreshError = refresh < minRefresh  ? `Must be ≥ ${REFRESH_MULT}× access TTL (min ${minRefresh} min = ${fmtMinutes(minRefresh)})` : null;
  const hasError     = !!(accessError || refreshError);

  // Notify parent whenever validity changes so the Save button can be gated.
  useEffect(() => { onValidChange(!hasError); }, [hasError]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--primary)', fontSize: 16 }}>⏱</span>
          <div>
            <h3 style={{ marginBottom: 2 }}>Token Timing</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, margin: 0 }}>
              How long tokens stay valid. Refresh token must be at least {REFRESH_MULT}× the access token TTL
              and no shorter than {fmtMinutes(REFRESH_MIN)}. Restart required.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 20px 20px' }}>
        {[
          {
            key:   ACCESS_KEY,
            label: 'Access Token TTL',
            desc:  `Short-lived token sent with every request. Min ${ACCESS_MIN} min.`,
            def:   60,
            error: accessError,
            min:   ACCESS_MIN,
          },
          {
            key:   REFRESH_KEY,
            label: 'Refresh Token TTL',
            desc:  `Long-lived token used to issue new access tokens. Min ${fmtMinutes(REFRESH_MIN)} and ≥ ${REFRESH_MULT}× access TTL.`,
            def:   43200,
            error: refreshError,
            min:   minRefresh,
          },
        ].map((field, i, arr) => (
          <div
            key={field.key}
            style={{
              paddingTop: 16, paddingBottom: 16,
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              {/* Label + desc */}
              <div style={{ flex: '0 0 220px', minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{field.label}</span>
                  {dirty[field.key] && (
                    <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>unsaved</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{field.desc}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'SF Mono, Fira Code, monospace' }}>
                  {field.key}
                </p>
              </div>

              {/* Input */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="env-input"
                    type="number"
                    min={field.min}
                    step={1}
                    value={values[field.key] ?? ''}
                    placeholder={String(field.def)}
                    onChange={e => set(field.key, e.target.value)}
                    style={{ width: 90 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>minutes</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    = {fmtMinutes(Number(values[field.key]) || field.def)}
                  </span>
                </div>
                {field.error && (
                  <p style={{ fontSize: 12, color: 'var(--danger)', margin: '5px 0 0' }}>⚠ {field.error}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {hasError && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
            Resolve the errors above before saving.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const [values, setValues]         = useState({});
  const [reveal, setReveal]         = useState({});   // which secret fields are unmasked
  const [dirty, setDirty]           = useState({});   // keys changed since last load
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [notice, setNotice]         = useState(null); // { type: 'success'|'error', msg }
  const [timingValid, setTimingValid] = useState(true);

  useEffect(() => {
    api.getEnv()
      .then(res => { setValues(res.data); setLoading(false); })
      .catch(e  => { setNotice({ type: 'error', msg: e.message }); setLoading(false); });
  }, []);

  const set = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setDirty(prev  => ({ ...prev, [key]: true }));
  };

  const toggleReveal = (key) => setReveal(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.saveEnv(values);
      setDirty({});
      setNotice({ type: 'success', msg: res.message });
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setSaving(false);
    }
  };

  const hasDirty  = Object.keys(dirty).length > 0;
  const canSave   = hasDirty && timingValid;

  if (loading) return <div className="empty-state"><p>Loading…</p></div>;

  return (
    <>
      {/* ── Top bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Values are saved to <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.env</code> in the project root.
          &nbsp;A server restart is required for changes to take effect.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || !canSave}
          style={{ flexShrink: 0, marginLeft: 16 }}
        >
          {saving ? 'Saving…' : hasDirty && !timingValid ? 'Fix errors to save' : `Save${hasDirty ? ` (${Object.keys(dirty).length})` : ''}`}
        </button>
      </div>

      {/* ── Notice ── */}
      {notice && (
        <div
          className={notice.type === 'error' ? 'error-msg' : 'notice-msg'}
          style={{ marginBottom: 20 }}
        >
          {notice.msg}
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {/* ── Sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TokenTimingCard
          values={values}
          set={set}
          dirty={dirty}
          onValidChange={setTimingValid}
        />
        {SECTIONS.map(section => (
          <div key={section.title} className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--primary)', fontSize: 16 }}>{section.icon}</span>
                <div>
                  <h3 style={{ marginBottom: 2 }}>{section.title}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, margin: 0 }}>
                    {section.desc}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '8px 20px 20px' }}>
              {section.vars.map((v, i) => (
                <div
                  key={v.key}
                  style={{
                    paddingTop: 16,
                    paddingBottom: 16,
                    borderBottom: i < section.vars.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    {/* Label + desc */}
                    <div style={{ flex: '0 0 220px', minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v.label}</span>
                        {v.secret && (
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: 10 }}>secret</span>
                        )}
                        {dirty[v.key] && (
                          <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>unsaved</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{v.desc}</p>
                      {v.example && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'SF Mono, Fira Code, monospace' }}>
                          Generate: <code style={{ color: 'var(--primary)' }}>{v.example}</code>
                        </p>
                      )}
                    </div>

                    {/* Input */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      {v.options ? (
                        <select
                          className="env-input"
                          value={values[v.key] ?? ''}
                          onChange={e => set(v.key, e.target.value)}
                        >
                          <option value="">— use default —</option>
                          {v.options.map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <input
                            className="env-input"
                            type={v.secret && !reveal[v.key] ? 'password' : (v.type || 'text')}
                            value={values[v.key] ?? ''}
                            placeholder={v.placeholder ?? ''}
                            onChange={e => set(v.key, e.target.value)}
                            spellCheck={false}
                            autoComplete="off"
                          />
                          {v.secret && (
                            <button
                              type="button"
                              className="env-reveal"
                              onClick={() => toggleReveal(v.key)}
                              title={reveal[v.key] ? 'Hide' : 'Reveal'}
                            >
                              {reveal[v.key] ? '◑' : '○'}
                            </button>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'SF Mono, Fira Code, monospace' }}>
                        {v.key}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
