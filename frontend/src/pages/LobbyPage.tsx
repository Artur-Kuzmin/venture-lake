import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { PartyPanel } from '../components/PartyPanel';
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
        <h1>Lobby</h1>
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  // Initial load failed — show a clear error with a retry instead of an
  // empty-looking lobby.
  if (!me) {
    return (
      <div className="page">
        <h1>Lobby</h1>
        <p className="form-error">{error ?? 'Could not load the lobby.'}</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  const cooldownUntil = me?.cooldownUntil ? new Date(me.cooldownUntil) : null;
  const onCooldown = Boolean(cooldownUntil && cooldownUntil.getTime() > Date.now());
  const isQueued = Boolean(me?.entry);

  return (
    <div className="page">
      <h1>Lobby</h1>

      {stats && (
        <p className="placeholder">
          {stats.queuedCount === 0
            ? 'The queue is empty right now — be the first founder in.'
            : `${stats.queuedCount} founder${stats.queuedCount === 1 ? '' : 's'} currently in the global queue.`}
        </p>
      )}

      {/* Solo queue controls are hidden while in a party — queue via the party. */}
      {!party &&
        (onCooldown ? (
          <div className="queue-state">
            <p>
              You're on cooldown. You can rejoin the queue after{' '}
              <strong>{cooldownUntil!.toLocaleString()}</strong>.
            </p>
          </div>
        ) : isQueued ? (
          <div className="queue-state">
            <p>
              <strong>You're in the queue.</strong> Hang tight — we'll match you into a team.
            </p>
            <button type="button" onClick={handleLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave Queue'}
            </button>
          </div>
        ) : (
          <div className="queue-state">
            <p>You're not in the queue yet.</p>
            <p className="placeholder">
              Join the global queue and we'll match you into a founder team based on your skills
              and interests.
            </p>
            <button type="button" onClick={handleJoin} disabled={busy}>
              {busy ? 'Joining…' : 'Join Queue'}
            </button>
          </div>
        ))}

      {error && <p className="form-error">{error}</p>}

      <PartyPanel party={party} onChanged={load} />
    </div>
  );
}
