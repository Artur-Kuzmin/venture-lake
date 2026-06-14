import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { PartyPanel } from '../components/PartyPanel';
import { Loading } from '../components/Loading';
import type { Party, QueueMe, QueuePoolStats } from '../types';

export default function LobbyPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<QueueMe | null>(null);
  const [stats, setStats] = useState<QueuePoolStats | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [meRes, statsRes, partyRes] = await Promise.all([
      api.get<QueueMe>('/api/queue/me'),
      api.get<QueuePoolStats>('/api/queue/status'),
      api.get<Party | null>('/api/party/me'),
    ]);
    setMe(meRes);
    setStats(statsRes);
    setParty(partyRes);
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => {
        if (active) setError('Could not load the lobby. Check your connection and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Light polling keeps pool stats / queue state fresh.
    const interval = setInterval(() => {
      load().catch(() => {});
    }, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load]);

  // Once matched, send the user to their team lobby.
  useEffect(() => {
    if (me?.matchedTeamId) {
      navigate(`/team/${me.matchedTeamId}`);
    }
  }, [me?.matchedTeamId, navigate]);

  async function handleJoin() {
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/queue/join');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join the queue.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/queue/leave');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not leave the queue.');
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setError(null);
    setLoading(true);
    load()
      .catch(() => setError('Could not load the lobby. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Queue Terminal</h1>
        <Loading label="Connecting to the matchmaking system…" />
      </div>
    );
  }

  // Initial load failed — show a clear error with a retry instead of an
  // empty-looking lobby.
  if (!me) {
    return (
      <div className="page">
        <h1>Queue Terminal</h1>
        <div className="queue-state">
          <p className="form-error">{error ?? 'Could not load the lobby.'}</p>
          <button type="button" onClick={retry}>
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
        <span className="qt-syslabel">System // Matchmaking active</span>
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
        <PartyPanel party={party} onChanged={load} />

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
