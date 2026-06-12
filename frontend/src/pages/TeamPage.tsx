import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import type {
  CaptainVoteState,
  ContinuationChoice,
  ContinuationState,
  ShowcaseTeamState,
  TeamDetail,
  TeamMessageView,
} from '../types';

// Post-review continuation options (Phase 9).
const CONTINUATION_OPTIONS: { choice: ContinuationChoice; label: string; hint: string }[] = [
  {
    choice: 'CONTINUE',
    label: 'Continue same idea',
    hint: 'AI generates a longer follow-up mission for this project.',
  },
  {
    choice: 'PIVOT',
    label: 'Pivot together',
    hint: 'Full reset with the same team — back to the lobby.',
  },
  {
    choice: 'PUBLISH_END',
    label: 'Publish & end',
    hint: 'End the session and open the public showcase flow.',
  },
  {
    choice: 'DISBAND_PRIVATE',
    label: 'Disband privately',
    hint: 'End the session privately — nothing is published.',
  },
];

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

// Formats a remaining duration (ms) as "Dd HH:MM:SS", or "Time's up".
function formatRemaining(ms: number): string {
  if (ms <= 0) return "Time's up";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${days}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// Team lobby + idea voting. Backend enforces membership and all transitions.
export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [captainVote, setCaptainVote] = useState<CaptainVoteState | null>(null);
  const [continuation, setContinuation] = useState<ContinuationState | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseTeamState | null>(null);
  const [publishForm, setPublishForm] = useState({
    title: '',
    tagline: '',
    shortPitch: '',
    prototypeUrl: '',
  });
  const [messages, setMessages] = useState<TeamMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMode, setNoMode] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [note, setNote] = useState('');
  const [ownerByIndex, setOwnerByIndex] = useState<Record<number, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [submitForm, setSubmitForm] = useState({
    summary: '',
    pitchText: '',
    prototypeUrl: '',
    landingPageUrl: '',
    links: '',
    notes: '',
  });
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const [teamRes, messagesRes] = await Promise.all([
      api.get<TeamDetail>(`/api/teams/${teamId}`),
      api.get<TeamMessageView[]>(`/api/teams/${teamId}/messages`),
    ]);
    setTeam(teamRes);
    setMessages(messagesRes);
    if (teamRes.status === 'CAPTAIN_VOTING') {
      setCaptainVote(await api.get<CaptainVoteState>(`/api/teams/${teamId}/captain-vote`));
    } else {
      setCaptainVote(null);
    }
    if (teamRes.status === 'CONTINUATION_VOTING') {
      setContinuation(await api.get<ContinuationState>(`/api/teams/${teamId}/continuation`));
    } else {
      setContinuation(null);
    }
    if (teamRes.status === 'PUBLISHED') {
      setShowcase(await api.get<ShowcaseTeamState | null>(`/api/showcase/team/${teamId}`));
    } else {
      setShowcase(null);
    }
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

  // Tick the mission countdown once a second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Seed the owner dropdowns from the saved assignments; preserve in-progress
  // edits by only re-seeding when the mission or its assignment set changes.
  const mission = team?.mission ?? null;
  useEffect(() => {
    if (!mission) {
      setOwnerByIndex({});
      return;
    }
    const init: Record<number, string> = {};
    mission.deliverables.forEach((d, i) => {
      const a = mission.assignments.find((x) => x.title === d.title) ?? mission.assignments[i];
      init[i] = a?.assignedToId ?? '';
    });
    setOwnerByIndex(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, mission?.assignments.length]);

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
  const nominateCaptain = () =>
    run(() => api.post(`/api/teams/${teamId}/captain/nominate`), 'Could not self-nominate.');
  const voteCaptain = (candidateId: string) =>
    run(() => api.post(`/api/teams/${teamId}/captain/vote`, { candidateId }), 'Could not vote.');
  const generateDeliverables = () =>
    run(() => api.post(`/api/teams/${teamId}/generate-deliverables`), 'Could not generate deliverables.');
  const saveAssignments = () =>
    run(() => {
      const m = team!.mission!;
      return api.put(`/api/missions/${m.id}/deliverable-assignments`, {
        assignments: m.deliverables.map((d, i) => ({
          title: d.title,
          description: d.description,
          assignedToId: ownerByIndex[i],
        })),
      });
    }, 'Could not save assignments.');
  const startMission = () =>
    run(() => api.post(`/api/teams/${teamId}/start-mission`), 'Could not start the mission.');
  const submitMission = () =>
    run(() => {
      const m = team!.mission!;
      return api.post(`/api/missions/${m.id}/submit`, {
        summary: submitForm.summary,
        pitchText: submitForm.pitchText || undefined,
        prototypeUrl: submitForm.prototypeUrl || undefined,
        landingPageUrl: submitForm.landingPageUrl || undefined,
        links: submitForm.links
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: submitForm.notes || undefined,
      });
    }, 'Could not submit the final package.');
  const setSubmitField =
    (key: keyof typeof submitForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setSubmitForm((p) => ({ ...p, [key]: e.target.value }));

  // Prefill the publish form from the team's own data once, on entering
  // PUBLISHED (the 3s poll keeps the status constant, so edits are preserved).
  const teamStatus = team?.status;
  useEffect(() => {
    if (teamStatus !== 'PUBLISHED' || !team) return;
    const sub = team.submission;
    setPublishForm({
      title: team.mission?.title ?? '',
      tagline: '',
      shortPitch: sub?.pitchText ?? sub?.summary ?? '',
      prototypeUrl: sub?.prototypeUrl ?? sub?.demoUrl ?? sub?.landingPageUrl ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamStatus]);

  const publishShowcase = () =>
    run(() => api.post(`/api/showcase/team/${teamId}/publish`, publishForm), 'Could not publish.');
  const setAttribution = (visible: boolean) =>
    run(
      () => api.post(`/api/showcase/team/${teamId}/attribution`, { visible }),
      'Could not update your attribution.'
    );
  const setPublishField =
    (key: keyof typeof publishForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setPublishForm((p) => ({ ...p, [key]: e.target.value }));

  const startContinuationVote = () =>
    run(() => api.post(`/api/teams/${teamId}/continuation/start`), 'Could not start the vote.');
  const voteContinuation = (choice: ContinuationChoice) =>
    run(() => api.post(`/api/teams/${teamId}/continuation/vote`, { choice }), 'Could not vote.');

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

  function requeueIndividually() {
    setBusy(true);
    api
      .post('/api/queue/join')
      .then(() => navigate('/lobby'))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not requeue.');
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
  const nameOf = (id: string) =>
    team.members.find((m) => m.userId === id)?.displayName ??
    captainVote?.nominees.find((n) => n.userId === id)?.displayName ??
    'Unknown';
  const isCaptain = team.captainId === team.currentUserId;
  const allAssigned = mission
    ? mission.deliverables.every((_, i) => Boolean(ownerByIndex[i]))
    : false;
  const deliverablesAssigned = mission
    ? mission.deliverables.length > 0 && mission.assignments.length === mission.deliverables.length
    : false;

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

      {idea &&
        (team.status === 'IDEA_VOTING' ||
          team.status === 'CAPTAIN_VOTING' ||
          team.status === 'CONTINUING') && (
        <section className="queue-state idea-card">
          {team.status === 'CONTINUING' ? (
            <h2>Follow-up mission proposal</h2>
          ) : (
            <h2>
              Mission idea <span className="badge">#{idea.generationNumber}</span>
            </h2>
          )}
          <h3>{idea.title}</h3>
          <p className="badge">{idea.category}</p>
          <p>{idea.description}</p>
          <p className="placeholder">{idea.reasoning}</p>

          {team.status === 'CONTINUING' && mission && (
            <>
              <p>
                <strong>Proposed duration:</strong> {Math.round(mission.durationHours / 24)} days
              </p>
              <h3>Deliverables</h3>
              <ul className="party-members">
                {mission.deliverables.map((d, i) => (
                  <li key={i}>
                    <strong>{d.title}</strong> — {d.description}
                  </li>
                ))}
              </ul>
              <p className="placeholder">
                The second mission starts only after the whole team approves it.
              </p>
            </>
          )}

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

      {team.status === 'CAPTAIN_VOTING' && captainVote && (
        <section className="queue-state">
          <h2>Captain selection</h2>
          {captainVote.captainId ? (
            <>
              <p>
                <strong>Captain: {nameOf(captainVote.captainId)}.</strong>
              </p>
              {!mission ? (
                isCaptain ? (
                  <button type="button" onClick={generateDeliverables} disabled={busy}>
                    {busy ? 'Generating…' : 'Generate deliverables'}
                  </button>
                ) : (
                  <p className="placeholder">Waiting for the captain to generate deliverables.</p>
                )
              ) : (
                <div className="deliverables">
                  <h3>Deliverables</h3>
                  <ul className="party-members">
                    {mission.deliverables.map((d, i) => (
                      <li key={i}>
                        <strong>{d.title}</strong> — {d.description}
                        <div className="deliverable-owner">
                          Owner:{' '}
                          {isCaptain ? (
                            <select
                              value={ownerByIndex[i] ?? ''}
                              onChange={(e) =>
                                setOwnerByIndex((p) => ({ ...p, [i]: e.target.value }))
                              }
                            >
                              <option value="">— select —</option>
                              {team.members.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.displayName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{ownerByIndex[i] ? nameOf(ownerByIndex[i]) : 'unassigned'}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {isCaptain && (
                    <div className="vote-actions">
                      <button type="button" onClick={saveAssignments} disabled={busy || !allAssigned}>
                        {busy ? 'Saving…' : 'Save assignments'}
                      </button>
                      <button
                        type="button"
                        onClick={generateDeliverables}
                        disabled={busy}
                        className="link-button"
                      >
                        Regenerate
                      </button>
                    </div>
                  )}
                  {deliverablesAssigned && (
                    <p className="placeholder">All deliverables assigned.</p>
                  )}
                  {isCaptain && deliverablesAssigned && (
                    <button type="button" onClick={startMission} disabled={busy}>
                      {busy ? 'Starting…' : 'Start 72-hour mission'}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="placeholder">
                Self-nominate, then vote. Simple majority ({captainVote.majorityNeeded} of{' '}
                {captainVote.memberCount}) wins.
              </p>
              {!captainVote.myNomination && (
                <button type="button" onClick={nominateCaptain} disabled={busy}>
                  Self-nominate
                </button>
              )}
              {captainVote.nominees.length === 0 ? (
                <p className="placeholder">No nominees yet.</p>
              ) : (
                <ul className="party-members">
                  {captainVote.nominees.map((n) => (
                    <li key={n.userId}>
                      {n.displayName} — {n.votes} vote{n.votes === 1 ? '' : 's'}
                      {captainVote.myVote === n.userId ? (
                        <span className="badge"> · your vote</span>
                      ) : (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => voteCaptain(n.userId)}
                          disabled={busy}
                        >
                          {' '}
                          Vote
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {team.status === 'MISSION_ACTIVE' && mission && (
        <section className="queue-state mission-view">
          <h2>Mission active</h2>
          {team.missionDeadlineAt && (
            <p className="timer">
              ⏳ {formatRemaining(new Date(team.missionDeadlineAt).getTime() - now)} remaining
            </p>
          )}
          <h3>{mission.title}</h3>
          <p>{mission.brief}</p>

          <h3>Deliverables</h3>
          <ul className="party-members">
            {mission.assignments.map((a, i) => (
              <li key={i}>
                <strong>{a.title}</strong> — {a.description}
                <span className="badge"> · {a.assignedToName}</span>
              </li>
            ))}
            {/* A follow-up mission starts before owners are assigned. */}
            {mission.assignments.length === 0 &&
              mission.deliverables.map((d, i) => (
                <li key={i}>
                  <strong>{d.title}</strong> — {d.description}
                </li>
              ))}
          </ul>

          <h3>Final submission</h3>
          {isCaptain ? (
            <div className="submit-form">
              <label>
                Summary *
                <textarea value={submitForm.summary} onChange={setSubmitField('summary')} rows={3} />
              </label>
              <label>
                Pitch
                <textarea value={submitForm.pitchText} onChange={setSubmitField('pitchText')} rows={2} />
              </label>
              <label>
                Prototype / demo URL
                <input
                  value={submitForm.prototypeUrl}
                  onChange={setSubmitField('prototypeUrl')}
                  placeholder="https://"
                />
              </label>
              <label>
                Landing page URL
                <input
                  value={submitForm.landingPageUrl}
                  onChange={setSubmitField('landingPageUrl')}
                  placeholder="https://"
                />
              </label>
              <label>
                File / resource links (one per line)
                <textarea value={submitForm.links} onChange={setSubmitField('links')} rows={2} />
              </label>
              <label>
                Notes
                <textarea value={submitForm.notes} onChange={setSubmitField('notes')} rows={2} />
              </label>
              <button
                type="button"
                onClick={submitMission}
                disabled={busy || !submitForm.summary.trim()}
              >
                {busy ? 'Submitting…' : 'Submit final package'}
              </button>
            </div>
          ) : (
            <p className="placeholder">Your captain will submit the final package.</p>
          )}
        </section>
      )}

      {team.status === 'SUBMITTED' && team.submission && (
        <section className="queue-state">
          <h2>{team.submission.reviewDelayed ? 'Review delayed' : 'Submitted — awaiting VC review'}</h2>
          {team.submission.reviewDelayed && (
            <p className="form-error">Review delayed — reassigned to the queue.</p>
          )}
          <p className="placeholder">Submitted by {team.submission.submittedByName}.</p>
          <p>
            <strong>Summary:</strong> {team.submission.summary}
          </p>
          {team.submission.pitchText && (
            <p>
              <strong>Pitch:</strong> {team.submission.pitchText}
            </p>
          )}
          {team.submission.prototypeUrl && (
            <p>
              Prototype / demo:{' '}
              <a href={team.submission.prototypeUrl} target="_blank" rel="noreferrer">
                {team.submission.prototypeUrl}
              </a>
            </p>
          )}
          {team.submission.landingPageUrl && (
            <p>
              Landing page:{' '}
              <a href={team.submission.landingPageUrl} target="_blank" rel="noreferrer">
                {team.submission.landingPageUrl}
              </a>
            </p>
          )}
          {team.submission.links.length > 0 && (
            <ul className="party-members">
              {team.submission.links.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {team.submission.notes && (
            <p>
              <strong>Notes:</strong> {team.submission.notes}
            </p>
          )}
        </section>
      )}

      {team.status === 'FAILED' && (
        <section className="queue-state">
          <h2>Mission failed</h2>
          <p>
            The 72-hour deadline passed without a submission, so this session has ended. No penalty —
            you can jump back into the queue.
          </p>
          <button type="button" onClick={requeueIndividually} disabled={busy}>
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
        </section>
      )}

      {/* Hidden in pre-review stages so a pivoted team's fresh round doesn't
          show the previous round's review. */}
      {team.reviews.length > 0 &&
        !['LOBBY', 'IDEA_VOTING', 'CAPTAIN_VOTING', 'MISSION_ACTIVE'].includes(team.status) && (
        <section className="queue-state">
          <h2>VC review</h2>
          {team.status === 'APPEAL_WINDOW' && team.appealWindowExpiresAt && (
            <p className="timer">
              ⏳ Appeal window closes in{' '}
              {formatRemaining(new Date(team.appealWindowExpiresAt).getTime() - now)}
            </p>
          )}

          {team.reviews.map((r, i) => (
            <div key={i} className="review-block">
              <h3>
                {r.isAppealReview ? 'Appeal review' : 'Review'} by {r.vcName} —{' '}
                {Math.round(r.overallScore)}/100
              </h3>
              <ul className="party-members">
                {r.categories.map((c, j) => (
                  <li key={j}>
                    <strong>{c.category}:</strong> {c.score}/10 — {c.feedback}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {team.reviewFinal ? (
            <>
              <p>
                <strong>
                  Final score: {team.finalScore != null ? Math.round(team.finalScore) : '—'}/100
                </strong>{' '}
                (locked)
              </p>
              {team.status === 'REVIEW_FINAL' && (
                <button type="button" onClick={startContinuationVote} disabled={busy}>
                  Start continuation vote
                </button>
              )}
            </>
          ) : (
            <>
              <p className="placeholder">Score is not final until the appeal window closes.</p>
              <p className="placeholder">
                🔒 The continuation vote is locked until the review is final.
              </p>
            </>
          )}
        </section>
      )}

      {team.status === 'CONTINUATION_VOTING' && continuation && (
        <section className="queue-state">
          <h2>What's next? Team vote</h2>
          <p className="placeholder">
            Majority wins ({continuation.majorityNeeded} of {continuation.memberCount}). You can
            change your vote until a majority is reached.
          </p>
          <ul className="party-members">
            {CONTINUATION_OPTIONS.map((opt) => {
              const tally = continuation.tallies.find((t) => t.choice === opt.choice)?.votes ?? 0;
              const mine = continuation.myChoice === opt.choice;
              return (
                <li key={opt.choice}>
                  <button
                    type="button"
                    onClick={() => voteContinuation(opt.choice)}
                    disabled={busy || mine}
                  >
                    {opt.label}
                  </button>{' '}
                  — {tally} vote{tally === 1 ? '' : 's'}
                  {mine && <span className="badge"> · your vote</span>}
                  <div className="placeholder">{opt.hint}</div>
                </li>
              );
            })}
          </ul>
          {continuation.votes.length > 0 && (
            <p className="placeholder">
              {continuation.votes
                .map(
                  (v) =>
                    `${v.displayName}: ${
                      CONTINUATION_OPTIONS.find((o) => o.choice === v.choice)?.label ?? v.choice
                    }`
                )
                .join(' · ')}
            </p>
          )}
        </section>
      )}

      {team.status === 'PUBLISHED' && (
        <section className="queue-state">
          <h2>Published 🎉</h2>
          {!showcase ? (
            <>
              <p>
                The team voted to publish. Fill in the public entry — any member can publish it.
              </p>
              <div className="submit-form">
                <label>
                  Project name *
                  <input value={publishForm.title} onChange={setPublishField('title')} maxLength={120} />
                </label>
                <label>
                  Tagline *
                  <input value={publishForm.tagline} onChange={setPublishField('tagline')} maxLength={160} />
                </label>
                <label>
                  Short pitch *
                  <textarea value={publishForm.shortPitch} onChange={setPublishField('shortPitch')} rows={3} />
                </label>
                <label>
                  Prototype / demo URL *
                  <input
                    value={publishForm.prototypeUrl}
                    onChange={setPublishField('prototypeUrl')}
                    placeholder="https://"
                  />
                </label>
                <button
                  type="button"
                  onClick={publishShowcase}
                  disabled={
                    busy ||
                    !publishForm.title.trim() ||
                    !publishForm.tagline.trim() ||
                    !publishForm.shortPitch.trim() ||
                    !publishForm.prototypeUrl.trim()
                  }
                >
                  {busy ? 'Publishing…' : 'Publish to showcase'}
                </button>
              </div>
              <p className="placeholder">
                The public page shows the name, tagline, pitch, demo link, the raw final score,
                and only the members who opt in. VC feedback and category scores stay private.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>{showcase.title}</strong> is live in the public showcase with a score of{' '}
                <strong>{showcase.finalScore}/100</strong>.
              </p>
              <p>
                Attribution is personal:{' '}
                {showcase.myVisible ? 'your name is currently shown.' : 'you are currently hidden.'}
              </p>
              <div className="vote-actions">
                <button
                  type="button"
                  onClick={() => setAttribution(true)}
                  disabled={busy || showcase.myVisible === true}
                >
                  Show my name
                </button>
                <button
                  type="button"
                  onClick={() => setAttribution(false)}
                  disabled={busy || showcase.myVisible === false}
                  className="link-button"
                >
                  Hide me
                </button>
              </div>
              <ul className="party-members">
                {showcase.attributions.map((a) => (
                  <li key={a.userId}>
                    {a.displayName}: {a.visible ? 'shown' : 'hidden'}
                    {a.userId === team.currentUserId && <span className="badge"> · you</span>}
                  </li>
                ))}
              </ul>
              <p>
                <Link to="/showcase">View the public showcase</Link>
              </p>
            </>
          )}
          <button type="button" onClick={requeueIndividually} disabled={busy}>
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
        </section>
      )}

      {team.status === 'DISBANDED' && (
        <section className="queue-state">
          <h2>Session ended</h2>
          <p>
            The team disbanded privately — nothing is published. No penalty; requeue whenever you
            like.
          </p>
          <button type="button" onClick={requeueIndividually} disabled={busy}>
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
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

      {(inLobby || team.status === 'REVIEW_FINAL' || team.status === 'CONTINUATION_VOTING') && (
        <button type="button" onClick={leaveTeam} disabled={busy} className="link-button">
          {inLobby ? 'Leave team' : 'Leave team (no penalty)'}
        </button>
      )}
    </div>
  );
}
