import { useState } from 'react';
import { api } from '../api';
import { setTokens } from '../auth';

export default function Login({ onLogin }) {
  const [mode, setMode]       = useState('login');   // 'login' | 'register'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await api.login(email, password);
        setTokens(res.data);
        onLogin(res.data.user);
      } else {
        const res = await api.register(email, password, name, 'admin');
        // After register, auto-login
        const login = await api.login(email, password);
        setTokens(login.data);
        onLogin(login.data.user);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src="/Logo.png" alt="Rotifex" style={{ height: 40, width: 'auto' }} />
        </div>

        <h2 className="login-title">
          {mode === 'login' ? 'Sign in to your dashboard' : 'Create admin account'}
        </h2>

        {error && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            {error}
            <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'login' ? (
            <>No account yet? <button className="link-btn" onClick={() => { setMode('register'); setError(null); }}>Create admin account</button></>
          ) : (
            <>Already have an account? <button className="link-btn" onClick={() => { setMode('login'); setError(null); }}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
