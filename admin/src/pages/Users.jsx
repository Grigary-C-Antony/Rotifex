import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const ROLES = ['user', 'admin', 'moderator'];

// ── Auth API Docs ────────────────────────────────────────────────────────────

const BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

const AUTH_ENDPOINTS = [
  {
    method:  'POST',
    path:    '/auth/register',
    desc:    'Create a new user account with a hashed password.',
    auth:    false,
    request: {
      body: {
        email:        { type: 'string',  required: true,  desc: 'Unique email address' },
        password:     { type: 'string',  required: true,  desc: 'Min 8 chars, at least 1 letter + 1 number' },
        display_name: { type: 'string',  required: false, desc: 'Optional display name' },
        role:         { type: 'string',  required: false, desc: '"user" | "admin" | "moderator" (default: user)' },
      },
    },
    responses: [
      {
        status: 201,
        desc:   'User registered successfully',
        body:   { data: { id: '<uuid>', email: 'jane@example.com', display_name: 'Jane Doe', role: 'user', created_at: '2026-01-01T00:00:00.000Z' }, message: 'User registered successfully' },
      },
      {
        status: 400,
        desc:   'Validation error',
        body:   { error: 'Validation Error', message: ['Password must be at least 8 characters.', 'Password must contain at least one number.'], statusCode: 400 },
      },
      {
        status: 409,
        desc:   'Email already in use',
        body:   { error: 'Registration failed', message: 'Email already in use', statusCode: 409 },
      },
    ],
    exampleBody: { email: 'jane@example.com', password: 'secret123', display_name: 'Jane Doe', role: 'user' },
  },
  {
    method:  'POST',
    path:    '/auth/login',
    desc:    'Authenticate with email and password. Returns access + refresh tokens.',
    auth:    false,
    request: {
      body: {
        email:    { type: 'string', required: true, desc: 'Registered email address' },
        password: { type: 'string', required: true, desc: 'Account password' },
      },
    },
    responses: [
      {
        status: 200,
        desc:   'Login successful',
        body:   { data: { accessToken: '<jwt>', refreshToken: '<jwt>', user: { id: '<uuid>', email: 'jane@example.com', display_name: 'Jane Doe', role: 'user' } } },
      },
      {
        status: 401,
        desc:   'Invalid credentials',
        body:   { error: 'Authentication failed', message: 'Invalid credentials', statusCode: 401 },
      },
    ],
    exampleBody: { email: 'jane@example.com', password: 'secret123' },
  },
  {
    method:  'POST',
    path:    '/auth/refresh',
    desc:    'Exchange a refresh token for a new access + refresh token pair.',
    auth:    false,
    request: {
      body: {
        refreshToken: { type: 'string', required: true, desc: 'The refresh token received at login' },
      },
    },
    responses: [
      {
        status: 200,
        desc:   'Tokens refreshed',
        body:   { data: { accessToken: '<new-jwt>', refreshToken: '<new-refresh-jwt>' } },
      },
      {
        status: 401,
        desc:   'Invalid or expired refresh token',
        body:   { error: 'Token refresh failed', message: 'Invalid or expired refresh token', statusCode: 401 },
      },
    ],
    exampleBody: { refreshToken: '<your-refresh-token>' },
  },
  {
    method:  'GET',
    path:    '/auth/me',
    desc:    'Return the profile of the currently authenticated user. Requires a valid access token.',
    auth:    true,
    request: { body: null },
    responses: [
      {
        status: 200,
        desc:   'Current user profile',
        body:   { data: { id: '<uuid>', email: 'jane@example.com', display_name: 'Jane Doe', role: 'user', created_at: '2026-01-01T00:00:00.000Z' } },
      },
      {
        status: 401,
        desc:   'Missing or invalid token',
        body:   { error: 'Unauthorized', message: 'Invalid or expired token', statusCode: 401 },
      },
    ],
    exampleBody: null,
  },
  {
    method:  'POST',
    path:    '/auth/change-password',
    desc:    'Change the password of the currently authenticated user. Requires a valid access token.',
    auth:    true,
    request: {
      body: {
        currentPassword: { type: 'string', required: true, desc: 'The user\'s current password' },
        newPassword:     { type: 'string', required: true, desc: 'New password — min 8 chars, at least 1 letter + 1 number' },
      },
    },
    responses: [
      {
        status: 204,
        desc:   'Password changed successfully (no body)',
        body:   null,
      },
      {
        status: 400,
        desc:   'Weak or missing new password',
        body:   { error: 'Password change failed', message: 'New password must be at least 8 characters', statusCode: 400 },
      },
      {
        status: 401,
        desc:   'Wrong current password or missing token',
        body:   { error: 'Password change failed', message: 'Current password is incorrect', statusCode: 401 },
      },
    ],
    exampleBody: { currentPassword: 'oldpass1', newPassword: 'newpass2' },
  },
  {
    method:  'POST',
    path:    '/auth/logout',
    desc:    'Revoke the current refresh token. The access token expires naturally after 1 h.',
    auth:    false,
    request: {
      body: {
        refreshToken: { type: 'string', required: true, desc: 'The refresh token to invalidate' },
      },
    },
    responses: [
      {
        status: 204,
        desc:   'Logged out successfully (no body)',
        body:   null,
      },
    ],
    exampleBody: { refreshToken: '<your-refresh-token>' },
  },
];

function copy(text, setCopied) {
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}

function buildCurl(ep) {
  const headers = ep.auth
    ? `-H 'Authorization: Bearer <your-access-token>'`
    : '';
  const bodyFlag = ep.exampleBody
    ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(ep.exampleBody)}'`
    : '';
  return `curl -X ${ep.method} '${BASE}${ep.path}' \\\n  ${headers}${bodyFlag}`.replace(/\\\n  $/, '');
}

function buildFetch(ep) {
  const headers = {};
  if (ep.auth) headers['Authorization'] = 'Bearer <your-access-token>';
  if (ep.exampleBody) headers['Content-Type'] = 'application/json';
  const bodyLine = ep.exampleBody
    ? `\n  body: JSON.stringify(${JSON.stringify(ep.exampleBody, null, 2).replace(/\n/g, '\n  ')}),`
    : '';
  const headersStr = Object.keys(headers).length
    ? `\n  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`
    : '';
  return `const res = await fetch('${BASE}${ep.path}', {
  method: '${ep.method}',${headersStr}${bodyLine}
});
const data = await res.json();`;
}

function AuthApiEndpoint({ ep }) {
  const [tab, setTab]       = useState('overview'); // 'overview' | 'curl' | 'fetch'
  const [copiedCurl, setCopiedCurl]   = useState(false);
  const [copiedFetch, setCopiedFetch] = useState(false);
  const [copiedUrl, setCopiedUrl]     = useState(false);

  const curlText  = buildCurl(ep);
  const fetchText = buildFetch(ep);

  return (
    <div className="endpoint-card">
      {/* Header */}
      <div className="endpoint-header">
        <span className={`method-badge method-${ep.method.toLowerCase()}`}>{ep.method}</span>
        <code className="endpoint-path">{BASE}{ep.path}</code>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 4, flexShrink: 0 }}
          title="Copy URL"
          onClick={() => copy(`${BASE}${ep.path}`, setCopiedUrl)}
        >
          {copiedUrl ? '✓' : '⎘'}
        </button>
        {ep.auth && (
          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', flexShrink: 0 }}>requires token</span>
        )}
        <span className="endpoint-desc">{ep.desc}</span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: '#fafbfc', paddingLeft: 16 }}>
        {['overview', 'curl', 'fetch'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
              marginBottom: -1,
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="endpoint-body">
        {tab === 'overview' && (
          <>
            {/* Request schema */}
            {ep.request.body && (
              <div className="endpoint-section">
                <div className="endpoint-label">Request Body</div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Field', 'Type', 'Required', 'Description'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ep.request.body).map(([field, meta]) => (
                      <tr key={field}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, fontFamily: 'SF Mono, Fira Code, monospace', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{field}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}><span className="type-badge">{meta.type}</span></td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: meta.required ? 'var(--danger)' : 'var(--text-muted)' }}>{meta.required ? '✓ yes' : 'no'}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{meta.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ep.auth && (
              <div className="endpoint-section">
                <div className="endpoint-label">Required Header</div>
                <pre className="endpoint-pre">{'Authorization: Bearer <access-token>'}</pre>
              </div>
            )}

            {/* Responses */}
            <div className="endpoint-section">
              <div className="endpoint-label">Responses</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ep.responses.map(r => (
                  <div key={r.status}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: r.status < 300 ? '#dcfce7' : r.status < 500 ? '#fef3c7' : '#fee2e2',
                        color:      r.status < 300 ? '#15803d' : r.status < 500 ? '#92400e' : '#991b1b',
                        fontFamily: 'SF Mono, Fira Code, monospace',
                      }}>
                        {r.status}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.desc}</span>
                    </div>
                    {r.body !== null
                      ? <pre className="endpoint-pre" style={{ fontSize: 11 }}>{JSON.stringify(r.body, null, 2)}</pre>
                      : <pre className="endpoint-pre" style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No response body</pre>
                    }
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'curl' && (
          <div className="endpoint-section">
            <div className="endpoint-copy-bar" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(curlText, setCopiedCurl)}>
                {copiedCurl ? '✓ Copied!' : 'Copy cURL'}
              </button>
            </div>
            <pre className="endpoint-pre">{curlText}</pre>
          </div>
        )}

        {tab === 'fetch' && (
          <div className="endpoint-section">
            <div className="endpoint-copy-bar" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(fetchText, setCopiedFetch)}>
                {copiedFetch ? '✓ Copied!' : 'Copy fetch'}
              </button>
            </div>
            <pre className="endpoint-pre">{fetchText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthApiDocs() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info banner */}
      <div className="card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--primary)' }}>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--text-muted)' }}>
          All auth endpoints live under <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 12 }}>/auth</code>.
          Access tokens expire based on the configured TTL (default <strong>1 h</strong>); refresh tokens expire based on their configured TTL (default <strong>30 d</strong>) and are <strong>single-use</strong> (rotated on each refresh). Both can be tuned in <strong>Settings → Token Timing</strong>.
          Logging out via <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 12 }}>/auth/logout</code> immediately revokes the refresh token.
          Passwords are hashed with <strong>bcrypt</strong> (12 rounds) and are never returned in any response.
          Protected routes require <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 12 }}>Authorization: Bearer &lt;token&gt;</code>.
        </p>
      </div>

      {AUTH_ENDPOINTS.map(ep => (
        <AuthApiEndpoint key={ep.method + ep.path} ep={ep} />
      ))}
    </div>
  );
}

// ── Avatar / role helpers ─────────────────────────────────────────────────────

function avatar(user) {
  const name = user.display_name || user.email || '?';
  return name.slice(0, 2).toUpperCase();
}

function roleCls(role) {
  if (role === 'admin')     return 'role-admin';
  if (role === 'moderator') return 'role-mod';
  return 'role-user';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Users() {
  const [users, setUsers]           = useState([]);
  const [meta, setMeta]             = useState({});
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [error, setError]           = useState(null);
  const [notFound, setNotFound]     = useState(false);
  const [view, setView]             = useState('users'); // 'users' | 'api'

  const load = useCallback(() => {
    const q = `page=${page}&limit=20${search ? `&email=${encodeURIComponent(search)}` : ''}`;
    api.list('users', q)
      .then(res => { setUsers(res.data); setMeta(res.meta || {}); setNotFound(false); })
      .catch(e => {
        if (e.message?.includes('Unknown resource')) setNotFound(true);
        else setError(e.message);
      });
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'edit') await api.update('users', modal.data.id, data);
      else                       await api.adminCreateUser(data);
      setModal(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async () => {
    try {
      await api.remove('users', confirmDel.id);
      setConfirmDel(null);
      load();
    } catch (e) { setError(e.message); }
  };

  if (notFound) return (
    <div className="user-not-found">
      <div className="unf-icon">◉</div>
      <h3>User model not set up</h3>
      <p>Add a model named <strong>User</strong> with fields: <code>email</code>, <code>display_name</code>, <code>role</code> — then come back here.</p>
    </div>
  );

  return (
    <>
      {error && (
        <div className="error-msg">
          {error}
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="view-tabs">
        <button className={`view-tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>Users</button>
        <button className={`view-tab ${view === 'api'   ? 'active' : ''}`} onClick={() => setView('api')}>Auth API Docs</button>
      </div>

      {view === 'api' ? <AuthApiDocs /> : (
        <>
          <div className="toolbar">
            <input
              className="user-search"
              placeholder="Search by email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'create', data: {} })}>
              + New User
            </button>
          </div>

          <div className="card">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Profile Image</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No users yet</td></tr>
                ) : users.map(u => (
                  <tr key={u.id}>
                    <td><div className="user-avatar">{avatar(u)}</div></td>
                    <td>
                      <div className="user-name">{u.display_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                      <div className="user-email">{u.email}</div>
                    </td>
                    <td><span className={`role-badge ${roleCls(u.role)}`}>{u.role || 'user'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.created_at?.slice(0, 10)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ mode: 'edit', data: u })}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDel(u)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {meta.pages > 1 && (
              <div className="pagination">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span>Page {page} of {meta.pages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page >= meta.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}

      {modal && (
        <UserModal mode={modal.mode} initial={modal.data} onSave={handleSave} onClose={() => setModal(null)} />
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete User</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                Delete <strong>{confirmDel.display_name || confirmDel.email}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── User modal ────────────────────────────────────────────────────────────────

function UserModal({ mode, initial, onSave, onClose }) {
  const [form, setForm] = useState({
    email:        initial?.email        ?? '',
    display_name: initial?.display_name ?? '',
    role:         initial?.role         ?? 'user',
    password:     '',
  });
  const [resetPw, setResetPw]     = useState('');
  const [pwError, setPwError]     = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [savingPw, setSavingPw]   = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {};
    if (form.email)        data.email        = form.email;
    if (form.display_name) data.display_name = form.display_name;
    if (form.role)         data.role         = form.role;
    if (mode === 'create') data.password     = form.password;
    onSave(data);
  };

  const handleResetPassword = async () => {
    if (!resetPw || resetPw.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    setSavingPw(true);
    setPwError(null);
    try {
      await api.adminSetPassword(initial.id, resetPw);
      setPwSuccess(true);
      setResetPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e) {
      setPwError(e.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'edit' ? 'Edit User' : 'New User'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="user@example.com" />
            </div>
            <div className="form-group">
              <label>Display Name</label>
              <input type="text" value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {mode === 'create' && (
              <div className="form-group">
                <label>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min 8 chars, 1 letter + 1 number"
                />
              </div>
            )}
            {mode === 'edit' && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Reset Password
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    value={resetPw}
                    onChange={e => { setResetPw(e.target.value); setPwError(null); setPwSuccess(false); }}
                    placeholder="New password"
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleResetPassword}
                    disabled={savingPw}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {savingPw ? '…' : pwSuccess ? '✓ Saved' : 'Set Password'}
                  </button>
                </div>
                {pwError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{pwError}</div>}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{mode === 'edit' ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
