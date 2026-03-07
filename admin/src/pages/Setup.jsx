import { useState } from 'react';
import { api } from '../api';
import { setTokens } from '../auth';

export default function Setup({ onSetupComplete }) {
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
      await api.setup(email, password, name);
      // Auto-login after setup
      const login = await api.login(email, password);
      setTokens(login.data);
      onSetupComplete(login.data.user);
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

        <h2 className="login-title">Create admin account</h2>

        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontSize: 13,
          color: '#856404',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠</span>
          <div>
            <strong>Save your password — there is no password recovery.</strong>
            <br />
            If you lose access, you will need to run <code style={{ background: 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 3 }}>rotifex reset-admin --yes</code> from the terminal and set up a new account.
          </div>
        </div>

        {error && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            {error}
            <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Display Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
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
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
