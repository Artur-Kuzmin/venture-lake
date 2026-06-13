import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { useAuth } from '../lib/authContext';
import type { AuthResponse } from '../types';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AuthResponse>(
        '/api/auth/login',
        { email, password },
        { auth: false }
      );
      login(res.token, res.user);
      // Root routes to the right place once viewer status loads (lobby if the
      // user has a profile, otherwise create-profile).
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="auth-layout">
        <aside className="auth-aside">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true" />
            VentureLake
          </Link>
          <h2>Build teams around execution, not bios.</h2>
          <p>
            Log back into your founder workspace — your queue, your team, and your missions are
            waiting.
          </p>
          <ul className="auth-points">
            <li>Pick up where your team left off</li>
            <li>Track live mission countdowns</li>
            <li>Review scores and decide what's next</li>
          </ul>
        </aside>

        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="auth-card__sub">Log in to your founder workspace.</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="auth-switch">
            Need an account? <Link to="/signup">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
