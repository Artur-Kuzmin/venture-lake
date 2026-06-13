import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { useAuth } from '../lib/authContext';
import type { AuthResponse } from '../types';

export default function SignupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [displayName, setDisplayName] = useState('');
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
        '/api/auth/signup',
        { displayName, email, password },
        { auth: false }
      );
      login(res.token, res.user);
      navigate('/create-profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign up failed. Please try again.');
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
            Join a private network of founders who get matched into teams and prove themselves
            through focused 72-hour missions.
          </p>
          <ul className="auth-points">
            <li>Matched on skill coverage, not follower counts</li>
            <li>Ship real work on a 72-hour clock</li>
            <li>Earn reviewed, public proof-of-work</li>
          </ul>
        </aside>

        <div className="auth-card">
          <h1>Create your account</h1>
          <p className="auth-card__sub">Start building with a founder team today.</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
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
                minLength={8}
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
