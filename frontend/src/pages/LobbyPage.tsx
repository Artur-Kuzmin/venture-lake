import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mutate as globalMutate } from 'swr';
import { api, ApiError } from '../lib/apiClient';
import { useApi } from '../lib/swr';
import { PartyPanel } from '../components/PartyPanel';
import { LobbySkeleton } from '../components/PageSkeletons';
import type { Party, QueueEntry, QueueMe, QueuePoolStats } from '../types';

// Placeholder queue entry for the optimistic "joined" state. Only its
// truthiness drives the queued UI; the real entry replaces it on revalidate.
const OPTIMISTIC_ENTRY: QueueEntry = {
  id: 'optimistic',
  userId: '',
  partyId: null,
  status: 'QUEUED',
  queuedAt: new Date().toISOString(),
  matchedAt: null,
  cooldownUntil: null,
};

export default function LobbyPage() {
  const navigate = useNavigate();
  // Queue/party state via the shared SWR cache: deduped, cached across
  // navigations, polled every 8s (refreshInterval pauses while the tab is
  // hidden). Revisiting from cache shows content instantly.
  const { data: me, error: meError, isLoading, mutate: mutateMe } = useApi<QueueMe>(
    '/api/queue/me',
    { refreshInterval: 8000 }
  );
  const { data: stats } = useApi<QueuePoolStats>('/api/queue/status', { refreshInterval: 8000 });
  const { data: party } = useApi<Party | null>('/api/party/me', { refreshInterval: 8000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    globalMutate('/api/queue/me');
    globalMutate('/api/queue/status');
    globalMutate('/api/party/me');
  }, []);

  // Once matched, send the user to their team lobby.
  useEffect(() => {
    if (me?.matchedTeamId) {
      navigate(`/team/${me.matchedTeamId}`);
    }
  }, [me?.matchedTeamId, navigate]);

  async function handleJoin() {
    setError(null);
    setBusy(true);
    // Optimistically show "searching"; reconcile (or roll back) on response.
    void mutateMe((cur) => (cur ? { ...cur, entry: OPTIMISTIC_ENTRY } : cur), { revalidate: false });
    try {
      await api.post('/api/queue/join');
      refresh();
    } catch (err) {
      await mutateMe(); // roll back to the true queue state
      setError(err instanceof ApiError ? err.message : 'Could not join the queue.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setError(null);
    setBusy(true);
    // Optimistically clear the queue entry; reconcile (or roll back) on response.
    void mutateMe((cur) => (cur ? { ...cur, entry: null } : cur), { revalidate: false });
    try {
      await api.post('/api/queue/leave');
      refresh();
    } catch (err) {
      await mutateMe(); // roll back to the true queue state
      setError(err instanceof ApiError ? err.message : 'Could not leave the queue.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !me) {
    return <LobbySkeleton />;
  }

  // Initial load failed — show a clear error with a retry instead of an
  // empty-looking lobby.
  if (!me) {
    return (
      <div className="page">
        <h1>Queue Terminal</h1>
        <div className="queue-state">
          <p className="form-error">
            {meError instanceof ApiError ? meError.message : 'Could not load the lobby.'}
          </p>
          <button type="button" onClick={() => globalMutate('/api/queue/me')}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const cooldownUntil = me.cooldownUntil ? new Date(me.cooldownUntil) : null;
  const onCooldown = Boolean(cooldownUntil && cooldownUntil.getTime() > Date.now());
  const isQueued = Boolean(me.entry);
  const matched = Boolean(me.matchedTeamId);
  const queuedCount = stats?.queuedCount ?? 0;

  return (
    <div className="page queue-terminal">
      <header className="qt-header">
        <h1>Queue Terminal</h1>
        <p className="placeholder">
          Join solo or with friends. VentureLake will match you into a balanced founder team.
        </p>
      </header>

      {/* Primary status. Matched first; otherwise the solo status (hidden while
          in a party — queueing then runs through the party). */}
      {matched ? (
        <section className="qt-status qt-status--matched">
          <div className="qt-status__bar">
            <span className="qt-chip qt-chip--ok">Match found</span>
            <span className="qt-mono">DEPLOYING</span>
          </div>
          <h2>Team assembled — entering your lobby…</h2>
          <p className="placeholder">Redirecting to your team workspace.</p>
        </section>
      ) : !party ? (
        onCooldown ? (
          <section className="qt-status qt-status--cooldown">
            <div className="qt-status__bar">
              <span className="qt-chip qt-chip--warn">Cooldown</span>
              <span className="qt-mono">LOCKED</span>
            </div>
            <h2>You're on cooldown</h2>
            <p className="placeholder">
              You can rejoin the queue after <strong>{cooldownUntil!.toLocaleString()}</strong>.
            </p>
          </section>
        ) : isQueued ? (
          <section className="qt-status qt-status--searching">
            <span className="qt-scan" aria-hidden="true" />
            <div className="qt-status__bar">
              <span className="qt-chip qt-chip--searching">
                <span className="pulse-dot" aria-hidden="true" />
                Searching
              </span>
              <span className="qt-mono">MATCHING…</span>
            </div>
            <h2>Searching for a team…</h2>
            <p className="placeholder">
              Hang tight — we're matching you on skill coverage, language, availability, and
              interests.
            </p>
            <button type="button" onClick={handleLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave Queue'}
            </button>
          </section>
        ) : (
          <section className="qt-status">
            <div className="qt-status__bar">
              <span className="qt-chip">Idle</span>
              <span className="qt-mono">READY</span>
            </div>
            <h2>Enter the matchmaking queue</h2>
            <p className="placeholder">
              Join the global queue and we'll place you into a balanced founder team based on your
              skills and interests.
            </p>
            <button type="button" className="btn btn--lg" onClick={handleJoin} disabled={busy}>
              {busy ? 'Joining…' : 'Join Queue'}
            </button>
          </section>
        )
      ) : null}

      {error && <p className="form-error">{error}</p>}

      <div className="qt-cols">
        <PartyPanel party={party ?? null} onChanged={refresh} />

        <aside className="qt-side">
          <div className="qt-stat">
            <span className="qt-stat__num">{queuedCount}</span>
            <span className="qt-stat__label">
              founder{queuedCount === 1 ? '' : 's'} in the global queue
            </span>
            {queuedCount === 0 && (
              <span className="qt-stat__hint">Queue is warming up — be the first in.</span>
            )}
          </div>

          <section className="queue-state">
            <h2>How matching works</h2>
            <p className="placeholder">
              Teams are formed around skill coverage, language compatibility, availability, and
              interests.
            </p>
            <div className="tag-row">
              <span className="tag">Skill coverage</span>
              <span className="tag">Language</span>
              <span className="tag">Availability</span>
              <span className="tag">Interests</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
