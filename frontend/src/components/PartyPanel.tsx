import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { Tooltip } from './Tooltip';
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
      <div className="vl-card">
        <h2>Party</h2>
        <p className="placeholder">Queue with friends as a party of up to 5.</p>
        <button
          type="button"
          className="vl-btn vl-btn--primary"
          onClick={handleCreate}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Create party'}
        </button>
        <div className="party-join">
          <input
            className="vl-input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
          />
          <button
            type="button"
            className="vl-btn vl-btn--primary"
            onClick={handleJoin}
            disabled={busy || !joinCode.trim()}
          >
            Join party
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  const isQueued = party.status === 'QUEUED';

  return (
    <div className="vl-card">
      <h2>Your party ({party.members.length}/5)</h2>

      <ul className="vl-list">
        {party.members.map((m) => (
          <li key={m.userId}>
            {m.displayName}
            {m.isLeader && ' · leader'}
          </li>
        ))}
      </ul>

      <div className="party-invite">
        <span>
          Invite code: <code>{party.inviteCode}</code>
        </span>
        <Tooltip label={copied ? 'Copied!' : 'Copy invite link'}>
          <button
            type="button"
            onClick={copyInvite}
            className="icon-btn"
            aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
          >
            {copied ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </Tooltip>
      </div>

      {isQueued ? (
        <p>
          <span className="pulse-dot" aria-hidden="true" />
          <strong>Queued as a party.</strong> Your party will be matched together.
        </p>
      ) : (
        party.isLeader && (
          <button
            type="button"
            className="vl-btn vl-btn--primary"
            onClick={handleQueue}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Queue as party'}
          </button>
        )
      )}

      <button
        type="button"
        onClick={handleLeave}
        disabled={busy}
        className="vl-btn vl-btn--ghost"
      >
        Leave party
      </button>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default PartyPanel;
