/**
 * Thin auth store backed by localStorage.
 *
 * Tokens and user info are persisted across page reloads.
 * The access token is read by api.js on every request.
 */

const KEYS = {
  access:  'rtfx_access',
  refresh: 'rtfx_refresh',
  user:    'rtfx_user',
};

export function getAccessToken()  { return localStorage.getItem(KEYS.access); }
export function getRefreshToken() { return localStorage.getItem(KEYS.refresh); }

export function getUser() {
  try { return JSON.parse(localStorage.getItem(KEYS.user)); } catch { return null; }
}

export function setTokens({ accessToken, refreshToken, user }) {
  if (accessToken)  localStorage.setItem(KEYS.access,  accessToken);
  if (refreshToken) localStorage.setItem(KEYS.refresh, refreshToken);
  if (user)         localStorage.setItem(KEYS.user,    JSON.stringify(user));
}

export function clearTokens() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

export function isAuthenticated() {
  return !!getAccessToken();
}
