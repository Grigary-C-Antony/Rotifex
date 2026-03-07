import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth.js';

const BASE = window.location.origin;

// ── Token refresh ─────────────────────────────────────────────────────────────

async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    setTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

// ── Core request helper ───────────────────────────────────────────────────────

async function request(path, options = {}, _isRetry = false) {
  const token = getAccessToken();
  const url   = `${BASE}${path}`;

  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (options.raw) return res;

  // Auto-refresh on 401 (once) then retry the original request.
  if (res.status === 401 && !_isRetry) {
    const ok = await tryRefresh();
    if (ok) return request(path, options, true);
    // Refresh failed — session is dead, force re-login.
    clearTokens();
    window.location.reload();
    return;
  }

  if (res.status === 204) return null;

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Request failed');
  return json;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const api = {
  // First-run setup
  setupStatus: ()                                   => request('/setup/status'),
  setup:       (email, password, display_name)      => request('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, display_name }) }),

  // Auth
  login:          (email, password)                     => request('/auth/login',           { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
  register:       (email, password, display_name)       => request('/auth/register',        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, display_name }) }),
  logout:         ()                                    => request('/auth/logout',          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: getRefreshToken() }) }),
  changePassword: (currentPassword, newPassword)        => request('/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) }),
  getMe:          ()                                    => request('/auth/me'),

  // Admin — user management
  adminCreateUser:  (data)        => request('/admin/api/users',              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminSetPassword: (id, password) => request(`/admin/api/users/${id}/password`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }),

  // Admin endpoints
  getSchema:  ()      => request('/admin/api/schema'),
  getStats:   ()      => request('/admin/api/stats'),
  getLogs:    (opts)  => request(`/admin/api/logs?after=${opts?.after || 0}&level=${opts?.level || ''}`),
  getEnv:     ()      => request('/admin/api/env'),
  saveEnv:    (vars)  => request('/admin/api/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vars }) }),

  // CRUD
  list:       (table, query = '') => request(`/api/${table}${query ? '?' + query : ''}`),
  getById:    (table, id)         => request(`/api/${table}/${id}`),
  create:     (table, body)       => request(`/api/${table}`,      { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  update:     (table, id, body)   => request(`/api/${table}/${id}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  remove:     (table, id)         => request(`/api/${table}/${id}`, { method: 'DELETE' }),

  // Files
  listFiles:  ()     => request('/files'),
  deleteFile: (id)   => request(`/files/${id}`, { method: 'DELETE' }),
  uploadFile: (file, visibility = 'public') => {
    const form = new FormData();
    form.append('file', file);
    form.append('visibility', visibility);
    return request('/files/upload', { method: 'POST', body: form });
  },

  // Schema management
  createModel: (name, fields) => request('/admin/api/schema', { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, fields }) }),
  deleteModel: (name)         => request(`/admin/api/schema/${name}`, { method: 'DELETE' }),

  // AI — public
  aiProviders:  ()                          => request('/api/ai/providers'),
  aiModels:     (provider)                  => provider ? request(`/api/ai/models/${provider}`) : request('/api/ai/models'),
  aiGenerate:   (body)                      => request('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  aiChat:       (body)                      => request('/api/ai/chat',     { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),

  // AI — admin
  aiAdminProviders: ()         => request('/admin/api/ai/providers'),
  aiUpdateProvider: (id, data) => request(`/admin/api/ai/providers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Agents — public
  listAgents:  ()          => request('/api/agents'),
  listTools:   ()          => request('/api/agents/tools'),
  runAgent:    (id, input) => request(`/api/agents/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) }),

  // Agents — admin
  adminListAgents:   ()         => request('/admin/api/agents'),
  adminGetAgent:     (id)       => request(`/admin/api/agents/${id}`),
  adminCreateAgent:  (data)     => request('/admin/api/agents',      { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminUpdateAgent:  (id, data) => request(`/admin/api/agents/${id}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminDeleteAgent:  (id)       => request(`/admin/api/agents/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request('/health'),
};
