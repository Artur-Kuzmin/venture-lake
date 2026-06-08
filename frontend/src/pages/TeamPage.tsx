import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import type { TeamDetail, TeamMessageView } from '../types';

// Controlled reject reasons (Foundation Bible, Section 5).
const REJECT_REASONS = [
  'Too technical',
  'Not technical enough',
  'Not interested in industry',
  'Too generic',
  'Too hard for our availability',
  'Too similar to existing products',
  'Weak business potential',
  'Other',
];

// Team lobby + idea voting. Backend enforces membership and all transitions.
export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [messages, setMessages] = useState<TeamMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMode, setNoMode] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [note, setNote] = useState('');
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
    const toLobbyOn404 = (err: unknown) => {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        navigate('/lobby');
        return true;
      }
      return false;
    };
    load()
      .catch((err) => {
        if (!toLobbyOn404(err) && active) setError('Could not load the team.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const interval = setInterval(() => {
      load().catch(toLobbyOn404);
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const toggleReady = () =>
    run(() => api.post(`/api/teams/${teamId}/ready`), 'Could not update ready status.');
  const generateIdea = () =>
    run(() => api.post(`/api/teams/${teamId}/generate-idea`), 'Could not generate an idea.');
  const regenerate = () =>
    run(() => api.post(`/api/teams/${teamId}/regenerate-idea`), 'Could not regenerate.');

  function voteYes(ideaId: string) {
    return run(() => api.post(`/api/mission-ideas/${ideaId}/vote`, { vote: 'YES' }), 'Could not vote.');
  }
  function voteNo(ideaId: string) {
    return run(async () => {
      await api.post(`/api/mission-ideas/${ideaId}/vote`, {
        vote: 'NO',
        rejectReason,
        feedbackNote: note.trim() || undefined,
      });
      setNoMode(false);
      setNote('');
    }, 'Could not vote.');
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

  function leaveTeam() {
    setBusy(true);
    api
      .post(`/api/teams/${teamId}/leave`)
      .then(() => navigate('/lobby'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not leave the team.');
        setBusy(false);
      });
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
  const inLobby = team.status === 'LOBBY';
  const idea = team.currentIdea;
  const voteByUser = new Map(idea?.votes.map((v) => [v.userId, v]) ?? []);

  return (
    <div className="page">
      <h1>Team {inLobby ? 'lobby' : ''}</h1>

      {team.matchExplanation && (
        <p className="placeholder match-explanation">{team.matchExplanation}</p>
      )}

      <section className="queue-state">
        <h2>Members ({team.members.length})</h2>
        <ul className="party-members">
          {team.members.map((m) => (
            <li key={m.userId}>
              {inLobby && (m.ready ? '✅ ' : '⬜ ')}
              {m.displayName}
              {m.userId === team.currentUserId && <span className="badge"> · you</span>}
              {m.isCaptain && <span className="badge"> · captain</span>}
            </li>
          ))}
        </ul>

        {inLobby && (
          <>
            <button type="button" onClick={toggleReady} disabled={busy}>
              {me?.ready ? 'Not ready' : 'Ready up'}
            </button>
            {allReady ? (
              <button type="button" onClick={generateIdea} disabled={busy}>
                {busy ? 'Generating…' : 'Generate mission idea'}
              </button>
            ) : (
              <p className="placeholder">Everyone must ready up to generate a mission idea.</p>
            )}
          </>
        )}
      </section>

      {idea && team.status !== 'LOBBY' && (
        <section className="queue-state idea-card">
          <h2>
            Mission idea <span className="badge">#{idea.generationNumber}</span>
          </h2>
          <h3>{idea.title}</h3>
          <p className="badge">{idea.category}</p>
          <p>{idea.description}</p>
          <p className="placeholder">{idea.reasoning}</p>

          {idea.status === 'PROPOSED' && (
            <>
              <h3>Votes</h3>
              <ul className="party-members">
                {team.members.map((m) => {
                  const v = voteByUser.get(m.userId);
                  return (
                    <li key={m.userId}>
                      {m.displayName}:{' '}
                      {v ? (
                        <strong>
                          {v.vote}
                          {v.vote === 'NO' && v.rejectReason ? ` (${v.rejectReason})` : ''}
                        </strong>
                      ) : (
                        <span className="placeholder">not voted</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {!noMode ? (
                <div className="vote-actions">
                  <button type="button" onClick={() => voteYes(idea.id)} disabled={busy}>
                    Vote YES
                  </button>
                  <button type="button" onClick={() => setNoMode(true)} disabled={busy} className="link-button">
                    Vote NO
                  </button>
                </div>
              ) : (
                <div className="no-vote-form">
                  <label>
                    Reason
                    <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
                      {REJECT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note"
                    maxLength={500}
                  />
                  <div className="vote-actions">
                    <button type="button" onClick={() => voteNo(idea.id)} disabled={busy}>
                      Submit NO
                    </button>
                    <button type="button" onClick={() => setNoMode(false)} className="link-button">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {idea.status === 'REJECTED' && (
            <>
              <p className="form-error">Idea rejected.</p>
              <ul className="party-members">
                {idea.votes
                  .filter((v) => v.vote === 'NO')
                  .map((v) => (
                    <li key={v.userId}>
                      {v.displayName}: {v.rejectReason}
                      {v.feedbackNote ? ` — ${v.feedbackNote}` : ''}
                    </li>
                  ))}
              </ul>
              <button type="button" onClick={regenerate} disabled={busy}>
                {busy ? 'Regenerating…' : 'Regenerate idea'}
              </button>
              {team.rejectedIdeaCount >= 3 && (
                <p className="placeholder">
                  🔒 Vote-kick unlocks after 3 rejections (coming later).
                </p>
              )}
            </>
          )}

          {idea.status === 'ACCEPTED' && (
            <p>
              <strong>Idea accepted!</strong> Captain selection is next.
            </p>
          )}
        </section>
      )}

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

      {inLobby && (
        <button type="button" onClick={leaveTeam} disabled={busy} className="link-button">
          Leave team
        </button>
      )}
    </div>
  );
}
