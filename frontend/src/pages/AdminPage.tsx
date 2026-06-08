import { useState } from 'react';
import { api, ApiError } from '../lib/apiClient';

interface VcApprovalResult {
  userId: string;
  displayName: string;
  email: string;
  approved: boolean;
}

// Simple admin VC-approval panel (Phase 7.1). Admin access is enforced by the
// backend (ADMIN_EMAILS allowlist); non-admins get a 403 on these actions.
export default function AdminPage() {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(action: 'approve-vc' | 'revoke-vc') {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await api.post<VcApprovalResult>(`/api/admin/users/${userId.trim()}/${action}`);
      setResult(`${r.displayName} (${r.email}): VC ${r.approved ? 'approved ✅' : 'revoked'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Admin</h1>
      <div className="queue-state">
        <h2>VC approval</h2>
        <p className="placeholder">Approve or revoke a user's VC reviewer access by user id.</p>
        <input
          className="admin-input"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User id"
        />
        <div className="vote-actions">
          <button type="button" onClick={() => call('approve-vc')} disabled={busy || !userId.trim()}>
            Approve VC
          </button>
          <button
            type="button"
            onClick={() => call('revoke-vc')}
            disabled={busy || !userId.trim()}
            className="link-button"
          >
            Revoke VC
          </button>
        </div>
        {result && <p>{result}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
