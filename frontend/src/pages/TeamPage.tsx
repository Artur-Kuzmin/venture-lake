import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import type { TeamDetail, TeamMessageView } from '../types';

// Team lobby (status LOBBY). Member list + ready status, match explanation,
// and text chat. Backend enforces membership and all state transitions.
export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [messages, setMessages] = useState<TeamMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const [teamRes, messagesRes] = await Promise.all([
      api.get<TeamDetail>(`/api/teams/${teamId}`),
      api.get<TeamMessageView[]>(`/api/teams/${teamId}/messages`),
    ]);
    setTeam(teamRes);
    setMessages(messagesRes);
  }, [teamId]);

  useEffect(() => {
    let active = true;
    load()
      .catch((err) => {
        // No longer a member (left / dissolved) or not found -> back to lobby.
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          navigate('/lobby');
          return;
        }
        if (active) setError('Could not load the team.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const interval = setInterval(() => {
      load().catch((err) => {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          navigate('/lobby');
        }
      });
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function toggleReady() {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.post<TeamDetail>(`/api/teams/${teamId}/ready`);
      setTeam(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update ready status.');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      const msg = await api.post<TeamMessageView>(`/api/teams/${teamId}/messages`, { body });
      setMessages((prev) => [...prev, msg]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send message.');
      setDraft(body);
    }
  }

  async function leaveTeam() {
    setBusy(true);
    try {
      await api.post(`/api/teams/${teamId}/leave`);
      navigate('/lobby');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not leave the team.');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Team</h1>
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="page">
        <h1>Team</h1>
        <p className="form-error">{error ?? 'Team unavailable.'}</p>
      </div>
    );
  }

  const me = team.members.find((m) => m.userId === team.currentUserId);
  const allReady = team.members.length >= 2 && team.members.every((m) => m.ready);

  return (
    <div className="page">
      <h1>Team lobby</h1>

      {team.matchExplanation && (
        <p className="placeholder match-explanation">{team.matchExplanation}</p>
      )}

      <section className="queue-state">
        <h2>Members ({team.members.length})</h2>
        <ul className="party-members">
          {team.members.map((m) => (
            <li key={m.userId}>
              {m.ready ? '✅' : '⬜'} {m.displayName}
              {m.userId === team.currentUserId && <span className="badge"> · you</span>}
              {m.isCaptain && <span className="badge"> · captain</span>}
            </li>
          ))}
        </ul>
        <button type="button" onClick={toggleReady} disabled={busy}>
          {me?.ready ? 'Not ready' : 'Ready up'}
        </button>
        {allReady && <p className="placeholder">Everyone is ready.</p>}
      </section>

      <section className="queue-state chat">
        <h2>Chat</h2>
        <div className="chat-log">
          {messages.length === 0 ? (
            <p className="placeholder">No messages yet. Say hello to your team.</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="chat-line">
                <strong>{msg.displayName}:</strong> {msg.body}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={sendMessage} className="chat-form">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message your team…"
            maxLength={2000}
          />
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      </section>

      {error && <p className="form-error">{error}</p>}

      <button type="button" onClick={leaveTeam} disabled={busy} className="link-button">
        Leave team
      </button>
    </div>
  );
}
