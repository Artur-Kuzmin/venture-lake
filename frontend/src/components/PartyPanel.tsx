import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import type { Party } from '../types';

// Party panel for the lobby: create/join a party, share the invite code/link,
// see members, and queue the whole party as one unit. Backend is the source of
// truth; this only calls endpoints and re-loads via onChanged.
export function PartyPanel({
  party,
  onChanged,
}: {
  party: Party | null;
  onChanged: () => Promise<void> | void;
}) {
  const [searchParams] = useSearchParams();
  const [joinCode, setJoinCode] = useState(searchParams.get('join') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const handleCreate = () => run(() => api.post('/api/party'), 'Could not create a party.');
  const handleJoin = () =>
    run(() => api.post(`/api/party/${joinCode.trim()}/join`), 'Could not join the party.');
  const handleLeave = () =>
    run(() => api.post(`/api/party/${party!.id}/leave`), 'Could not leave the party.');
  const handleQueue = () =>
    run(() => api.post(`/api/party/${party!.id}/queue`), 'Could not queue the party.');

  async function copyInvite() {
    if (!party) return;
    const link = `${window.location.origin}/lobby?join=${party.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Code: ' + party.inviteCode);
    }
  }

  if (!party) {
    return (
      <div className="queue-state">
        <h2>Party</h2>
        <p className="placeholder">Queue with friends as a party of up to 5.</p>
        <button type="button" onClick={handleCreate} disabled={busy}>
          {busy ? 'Working…' : 'Create party'}
        </button>
        <div className="party-join">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
          />
          <button type="button" onClick={handleJoin} disabled={busy || !joinCode.trim()}>
            Join party
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  const isQueued = party.status === 'QUEUED';

  return (
    <div className="queue-state">
      <h2>Your party ({party.members.length}/5)</h2>

      <ul className="party-members">
        {party.members.map((m) => (
          <li key={m.userId}>
            {m.displayName}
            {m.isLeader && <span className="badge"> · leader</span>}
          </li>
        ))}
      </ul>

      <div className="party-invite">
        <span>
          Invite code: <code>{party.inviteCode}</code>
        </span>
        <button type="button" onClick={copyInvite} className="link-button">
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>

      {isQueued ? (
        <p>
          <strong>Queued as a party.</strong> Your party will be matched together.
        </p>
      ) : (
        party.isLeader && (
          <button type="button" onClick={handleQueue} disabled={busy}>
            {busy ? 'Working…' : 'Queue as party'}
          </button>
        )
      )}

      <button type="button" onClick={handleLeave} disabled={busy} className="link-button">
        Leave party
      </button>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default PartyPanel;
