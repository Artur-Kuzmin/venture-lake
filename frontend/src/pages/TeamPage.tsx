import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mutate as globalMutate } from 'swr';
import type { KeyedMutator } from 'swr';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { api, ApiError } from '../lib/apiClient';
import { useApi } from '../lib/swr';
import { listEnter, listExit, listShown, listTransition } from '../lib/motion';
import { Countdown } from '../components/Countdown';
import { TeamSkeleton } from '../components/PageSkeletons';
import { Tooltip } from '../components/Tooltip';
import { StatePill, type PillState } from '../components/lake/StatePill';
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

// Display-only mapping of team status to a header label + status-chip variant.
const STATUS_META: Record<string, { label: string; cls: string }> = {
  LOBBY: { label: 'Lobby — ready up', cls: '' },
  IDEA_VOTING: { label: 'Idea voting', cls: 'status--info' },
  CAPTAIN_VOTING: { label: 'Captain selection', cls: 'status--info' },
  MISSION_ACTIVE: { label: 'Mission active', cls: 'status--success' },
  SUBMITTED: { label: 'Awaiting VC review', cls: 'status--info' },
  UNDER_REVIEW: { label: 'Under review', cls: 'status--info' },
  APPEAL_WINDOW: { label: 'Appeal window', cls: 'status--warning' },
  REVIEW_FINAL: { label: 'Review final', cls: 'status--success' },
  CONTINUATION_VOTING: { label: 'Continuation vote', cls: 'status--info' },
  CONTINUING: { label: 'Follow-up mission', cls: 'status--success' },
  PIVOTING: { label: 'Pivoting', cls: 'status--info' },
  PUBLISHED: { label: 'Published', cls: 'status--success' },
  DISBANDED: { label: 'Session ended', cls: '' },
  FAILED: { label: 'Mission failed', cls: 'status--danger' },
};

// Display-only mapping of team status to a Lake StatePill state (§7). draft=idle,
// active=in-progress, committed=executing, done=settled, blocked=failed.
const STATUS_PILL: Record<string, PillState> = {
  LOBBY: 'draft',
  IDEA_VOTING: 'active',
  CAPTAIN_VOTING: 'active',
  MISSION_ACTIVE: 'committed',
  SUBMITTED: 'active',
  UNDER_REVIEW: 'active',
  APPEAL_WINDOW: 'active',
  REVIEW_FINAL: 'done',
  CONTINUATION_VOTING: 'active',
  CONTINUING: 'committed',
  PIVOTING: 'active',
  PUBLISHED: 'done',
  DISBANDED: 'draft',
  FAILED: 'blocked',
};

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

// Optimistic local update for an idea vote: shows YOUR OWN vote in the votes
// list immediately. It never touches idea.status, so no ACCEPTED/REJECTED
// transition is implied — that stays server-confirmed.
function optimisticIdeaVote(
  cur: TeamDetail | undefined,
  vote: 'YES' | 'NO',
  rejectReason: string | null = null,
  feedbackNote: string | null = null
): TeamDetail | undefined {
  if (!cur?.currentIdea) return cur;
  const meId = cur.currentUserId;
  const myName = cur.members.find((m) => m.userId === meId)?.displayName ?? 'You';
  const others = cur.currentIdea.votes.filter((v) => v.userId !== meId);
  const mine = {
    userId: meId,
    displayName: myName,
    vote,
    rejectReason: vote === 'NO' ? rejectReason : null,
    feedbackNote,
  };
  return { ...cur, currentIdea: { ...cur.currentIdea, votes: [...others, mine] } };
}

// Team lobby + idea voting. Backend enforces membership and all transitions.
export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  // Team state machine via the shared SWR cache: deduped, cached across
  // navigations, polled every 5s (refreshInterval pauses while the tab is
  // hidden). A short dedupingInterval + revalidateOnFocus keeps the fast-moving
  // status fresh. Sub-views are fetched only in the statuses that use them.
  const {
    data: team,
    error: teamError,
    isLoading: teamLoading,
    mutate: mutateTeam,
  } = useApi<TeamDetail>(teamId ? `/api/teams/${teamId}` : null, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    dedupingInterval: 1500,
  });
  const { data: messages = [], mutate: mutateMessages } = useApi<TeamMessageView[]>(
    teamId ? `/api/teams/${teamId}/messages` : null,
    { refreshInterval: 5000 }
  );
  const { data: captainVote = null, mutate: mutateCaptainVote } = useApi<CaptainVoteState>(
    team?.status === 'CAPTAIN_VOTING' && teamId ? `/api/teams/${teamId}/captain-vote` : null,
    { refreshInterval: 5000 }
  );
  const { data: continuation = null, mutate: mutateContinuation } = useApi<ContinuationState>(
    team?.status === 'CONTINUATION_VOTING' && teamId ? `/api/teams/${teamId}/continuation` : null,
    { refreshInterval: 5000 }
  );
  const { data: showcase = null } = useApi<ShowcaseTeamState | null>(
    team?.status === 'PUBLISHED' && teamId ? `/api/showcase/team/${teamId}` : null,
    { refreshInterval: 5000 }
  );
  const [publishForm, setPublishForm] = useState({
    title: '',
    tagline: '',
    shortPitch: '',
    prototypeUrl: '',
  });
  const [draft, setDraft] = useState('');
  // Temp ids of chat messages whose POST is still in flight (shown as "sending").
  const [pending, setPending] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMode, setNoMode] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [note, setNote] = useState('');
  const [ownerByIndex, setOwnerByIndex] = useState<Record<number, string>>({});
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const [submitForm, setSubmitForm] = useState({
    summary: '',
    pitchText: '',
    prototypeUrl: '',
    landingPageUrl: '',
    links: '',
    notes: '',
  });
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Reduced motion drops list enter/exit + layout reorder; updates stay instant.
  const reduce = useReducedMotion();

  // Revalidate every team-scoped key after an action. The backend remains the
  // source of truth; this only refreshes the shared cache.
  const revalidate = useCallback(async () => {
    if (!teamId) return;
    await Promise.all([
      globalMutate(`/api/teams/${teamId}`),
      globalMutate(`/api/teams/${teamId}/messages`),
      globalMutate(`/api/teams/${teamId}/captain-vote`),
      globalMutate(`/api/teams/${teamId}/continuation`),
      globalMutate(`/api/showcase/team/${teamId}`),
    ]);
  }, [teamId]);

  // A team that 403s/404s (you left, it disbanded, not a member) returns you to
  // the lobby — same behavior as the previous poll's error handling.
  useEffect(() => {
    if (teamError instanceof ApiError && (teamError.status === 403 || teamError.status === 404)) {
      navigate('/lobby');
    }
  }, [teamError, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
      await revalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  // Optimistic update for low-risk actions: write the expected local change to
  // the cache now, then POST. On success revalidate to reconcile with the
  // server; on failure revalidate too — which rolls back to the true state,
  // since the rejected change was never persisted — and surface a brief error.
  // Used ONLY for your own action's local appearance, never for a server
  // state transition.
  async function optimistic<T>(
    mutateKey: KeyedMutator<T>,
    patch: (cur: T | undefined) => T | undefined,
    action: () => Promise<unknown>,
    fallback: string
  ) {
    setError(null);
    void mutateKey(patch, { revalidate: false });
    try {
      await action();
      await mutateKey();
    } catch (err) {
      await mutateKey();
      setError(err instanceof ApiError ? err.message : fallback);
    }
  }

  const toggleReady = () =>
    optimistic(
      mutateTeam,
      (cur) =>
        cur
          ? {
              ...cur,
              members: cur.members.map((m) =>
                m.userId === cur.currentUserId ? { ...m, ready: !m.ready } : m
              ),
            }
          : cur,
      () => api.post(`/api/teams/${teamId}/ready`),
      'Could not update ready status.'
    );
  const generateIdea = () =>
    run(() => api.post(`/api/teams/${teamId}/generate-idea`), 'Could not generate an idea.');
  const regenerate = () =>
    run(() => api.post(`/api/teams/${teamId}/regenerate-idea`), 'Could not regenerate.');
  const nominateCaptain = () =>
    run(() => api.post(`/api/teams/${teamId}/captain/nominate`), 'Could not self-nominate.');
  const voteCaptain = (candidateId: string) =>
    optimistic(
      mutateCaptainVote,
      (cur) =>
        cur
          ? {
              ...cur,
              myVote: candidateId,
              nominees: cur.nominees.map((n) => {
                let votes = n.votes;
                if (cur.myVote === n.userId) votes -= 1;
                if (n.userId === candidateId) votes += 1;
                return { ...n, votes };
              }),
            }
          : cur,
      () => api.post(`/api/teams/${teamId}/captain/vote`, { candidateId }),
      'Could not vote.'
    );
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

  const startAppeal = () =>
    run(
      () => api.post(`/api/submissions/${team!.submission!.id}/appeal/start`),
      'Could not start the appeal.'
    );
  const voteAppeal = (vote: 'YES' | 'NO') =>
    optimistic(
      mutateTeam,
      (cur) => {
        if (!cur?.appeal) return cur;
        const a = cur.appeal;
        let yesCount = a.yesCount;
        let noCount = a.noCount;
        if (a.myVote === 'YES') yesCount -= 1;
        if (a.myVote === 'NO') noCount -= 1;
        if (vote === 'YES') yesCount += 1;
        else noCount += 1;
        // myVote + counts only — appeal.status stays server-confirmed.
        return { ...cur, appeal: { ...a, myVote: vote, yesCount, noCount } };
      },
      () => api.post(`/api/appeals/${team!.appeal!.id}/vote`, { vote }),
      'Could not vote on the appeal.'
    );

  const startContinuationVote = () =>
    run(() => api.post(`/api/teams/${teamId}/continuation/start`), 'Could not start the vote.');
  const voteContinuation = (choice: ContinuationChoice) =>
    optimistic(
      mutateContinuation,
      (cur) =>
        cur
          ? {
              ...cur,
              myChoice: choice,
              tallies: cur.tallies.map((t) => {
                let votes = t.votes;
                if (cur.myChoice === t.choice) votes -= 1;
                if (t.choice === choice) votes += 1;
                return { ...t, votes };
              }),
            }
          : cur,
      () => api.post(`/api/teams/${teamId}/continuation/vote`, { choice }),
      'Could not vote.'
    );

  function voteYes(ideaId: string) {
    return optimistic(
      mutateTeam,
      (cur) => optimisticIdeaVote(cur, 'YES'),
      () => api.post(`/api/mission-ideas/${ideaId}/vote`, { vote: 'YES' }),
      'Could not vote.'
    );
  }
  function voteNo(ideaId: string) {
    const reason = rejectReason;
    const fb = note.trim() || null;
    return optimistic(
      mutateTeam,
      (cur) => optimisticIdeaVote(cur, 'NO', reason, fb),
      async () => {
        await api.post(`/api/mission-ideas/${ideaId}/vote`, {
          vote: 'NO',
          rejectReason: reason,
          feedbackNote: note.trim() || undefined,
        });
        setNoMode(false);
        setNote('');
      },
      'Could not vote.'
    );
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !team) return;
    setDraft('');
    // Show the message immediately as "sending"; reconcile on confirm/fail.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: TeamMessageView = {
      id: tempId,
      userId: team.currentUserId,
      displayName: team.members.find((m) => m.userId === team.currentUserId)?.displayName ?? 'You',
      body,
      createdAt: new Date().toISOString(),
    };
    setPending((p) => [...p, tempId]);
    void mutateMessages((cur) => [...(cur ?? []), optimisticMsg], { revalidate: false });
    try {
      await api.post<TeamMessageView>(`/api/teams/${teamId}/messages`, { body });
      await mutateMessages(); // confirmed — server list replaces the temp message
    } catch (err) {
      await mutateMessages(); // failed — roll back to the server's real list
      setError(err instanceof ApiError ? err.message : 'Could not send message.');
      setDraft(body);
    } finally {
      setPending((p) => p.filter((id) => id !== tempId));
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

  if (teamLoading && !team) {
    return <TeamSkeleton />;
  }
  if (!team) {
    return (
      <div className="page">
        <h1>Team</h1>
        <p className="form-error">
          {teamError instanceof ApiError ? teamError.message : 'Team unavailable.'}
        </p>
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
  const appeal = team.appeal;
  const appealExpired = appeal ? new Date(appeal.expiresAt).getTime() <= Date.now() : false;
  const statusMeta = STATUS_META[team.status] ?? { label: team.status, cls: '' };
  const missionExpired =
    team.missionDeadlineAt != null && new Date(team.missionDeadlineAt).getTime() <= Date.now();

  return (
    <div className="page team-page lake-scope">
      <header className="team-header">
        <div>
          <h1>Team {inLobby ? 'lobby' : 'workspace'}</h1>
          <StatePill state={STATUS_PILL[team.status] ?? 'active'} label={statusMeta.label} />
        </div>
        {(team.status === 'MISSION_ACTIVE' || team.status === 'CONTINUING') &&
          team.missionDeadlineAt && (
            <div className="team-header__timer">
              <span className="qt-mono">Time remaining</span>
              <p className="timer">
                <Countdown to={team.missionDeadlineAt} format={formatRemaining} onExpire={forceRender} />
              </p>
            </div>
          )}
      </header>

      <div className="team-grid">
        <aside className="team-col team-col--left">
          {team.matchExplanation && (
            <p className="placeholder match-explanation">{team.matchExplanation}</p>
          )}

          <section className="queue-state">
            <h2>Members ({team.members.length})</h2>
        <ul className="party-members">
          <AnimatePresence initial={false}>
            {team.members.map((mem) => (
              <m.li
                key={mem.userId}
                layout={!reduce}
                initial={reduce ? false : listEnter}
                animate={reduce ? undefined : listShown}
                exit={reduce ? undefined : listExit}
                transition={reduce ? undefined : listTransition}
              >
                {inLobby && (mem.ready ? '✅ ' : '⬜ ')}
                {mem.displayName}
                {mem.userId === team.currentUserId && <span className="badge"> · you</span>}
                {mem.isCaptain && <span className="badge"> · captain</span>}
              </m.li>
            ))}
          </AnimatePresence>
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
        </aside>

        <main className="team-col team-col--center">
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
                    <button type="button" className="vl-ember-action" onClick={startMission} disabled={busy}>
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
                  <AnimatePresence initial={false}>
                    {/* Leaderboard: votes desc, name tiebreak. An optimistic vote
                        changes a tally and the layout (FLIP) reorder lands the row
                        in its new rank on the snappy spring. */}
                    {[...captainVote.nominees]
                      .sort(
                        (a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName)
                      )
                      .map((n) => (
                        <m.li
                          key={n.userId}
                          layout={!reduce}
                          initial={reduce ? false : listEnter}
                          animate={reduce ? undefined : listShown}
                          exit={reduce ? undefined : listExit}
                          transition={reduce ? undefined : listTransition}
                        >
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
                        </m.li>
                      ))}
                  </AnimatePresence>
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {team.status === 'MISSION_ACTIVE' && mission && (
        <section className="queue-state mission-workspace">
          <div className="mw-head">
            <StatePill
              state={missionExpired ? 'blocked' : 'committed'}
              label={missionExpired ? 'Deadline passed' : 'Mission active'}
            />
            <h2 className="mw-title">{mission.title}</h2>
            <p className="mw-brief">{mission.brief}</p>
          </div>

          {team.missionDeadlineAt && (
            <div className={`mw-timer${missionExpired ? ' mw-timer--over' : ''}`}>
              <span className="qt-mono">{missionExpired ? 'Deadline' : 'Time remaining'}</span>
              <p className="timer">
                <Countdown to={team.missionDeadlineAt} format={formatRemaining} onExpire={forceRender} />
              </p>
            </div>
          )}

          {missionExpired && (
            <p className="form-error">
              The deadline has passed. Unless a package is submitted, this mission will be marked
              failed.
            </p>
          )}

          <h3 className="mw-section-title">Deliverables</h3>
          <div className="mw-tasks">
            {mission.assignments.map((a, i) => (
              <div className="mw-task" key={i}>
                <strong>{a.title}</strong>
                <p>{a.description}</p>
                <span className="mw-owner">{a.assignedToName}</span>
              </div>
            ))}
            {/* A follow-up mission starts before owners are assigned. */}
            {mission.assignments.length === 0 &&
              mission.deliverables.map((d, i) => (
                <div className="mw-task" key={i}>
                  <strong>{d.title}</strong>
                  <p>{d.description}</p>
                </div>
              ))}
          </div>

          <div className="mw-submit">
            <h3 className="mw-section-title">Final submission</h3>
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
              <p className="placeholder">
                Your captain submits the final package. Get your deliverables done and coordinate
                in chat before the clock runs out.
              </p>
            )}
          </div>

          <p className="mw-next placeholder">
            What happens next: when the captain submits, the package enters the anonymized VC
            review queue. A reviewer scores it across five categories, then your team gets a
            6-hour appeal window before the score becomes final.
          </p>
        </section>
      )}

      {team.status === 'SUBMITTED' && team.submission && (
        <section className="queue-state">
          <h2>{team.submission.reviewDelayed ? 'Review delayed' : 'Submitted — awaiting VC review'}</h2>
          {team.submission.reviewDelayed && (
            <p className="form-error">
              Your reviewer missed the 6-hour window, so the submission is back at the front of
              the review queue. No action needed — the next available VC will pick it up.
            </p>
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
              <Countdown to={team.appealWindowExpiresAt} format={formatRemaining} />
            </p>
          )}

          {team.status === 'APPEAL_WINDOW' && !appeal && team.submission && (
            <div>
              <button type="button" onClick={startAppeal} disabled={busy}>
                Start appeal
              </button>
              <p className="placeholder">
                A score can be appealed once. The team then has 6 hours to approve the appeal by
                majority vote; if approved, a different VC reviews the submission blind.
              </p>
            </div>
          )}

          {appeal && appeal.status === 'OPEN' && !appealExpired && (
            <div>
              <p>
                <strong>Appeal vote open</strong>
              </p>
              <p className="timer">
                ⏳ <Countdown to={appeal.expiresAt} format={formatRemaining} onExpire={forceRender} />{' '}
                to reach a majority
              </p>
              <p>
                YES: {appeal.yesCount} · NO: {appeal.noCount} · Needed: {appeal.majorityNeeded}
              </p>
              <div className="vote-actions">
                <button
                  type="button"
                  onClick={() => voteAppeal('YES')}
                  disabled={busy || appeal.myVote === 'YES'}
                >
                  Vote YES{appeal.myVote === 'YES' ? ' ✓' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => voteAppeal('NO')}
                  disabled={busy || appeal.myVote === 'NO'}
                  className="link-button"
                >
                  Vote NO{appeal.myVote === 'NO' ? ' ✓' : ''}
                </button>
              </div>
            </div>
          )}

          {appeal?.status === 'APPROVED' && (
            <p>Appeal approved. The submission has been sent to a new reviewer.</p>
          )}

          {appeal &&
            (appeal.status === 'REJECTED' || (appeal.status === 'OPEN' && appealExpired)) && (
            <p>Appeal closed. The first review is final.</p>
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

          {error && <p className="form-error">{error}</p>}

          {(inLobby ||
            team.status === 'REVIEW_FINAL' ||
            team.status === 'CONTINUATION_VOTING') && (
            <button type="button" onClick={leaveTeam} disabled={busy} className="link-button">
              {inLobby ? 'Leave team' : 'Leave team (no penalty)'}
            </button>
          )}
        </main>

        <aside className="team-col team-col--right">
          <section className="queue-state team-side-card">
            <h2>Mission status</h2>
            <StatePill state={STATUS_PILL[team.status] ?? 'active'} label={statusMeta.label} />
            {team.reviewFinal && (
              <p>
                <strong>
                  Final score: {team.finalScore != null ? Math.round(team.finalScore) : '—'}/100
                </strong>
              </p>
            )}
            {inLobby && (
              <p className="placeholder">
                {team.members.filter((m) => m.ready).length} of {team.members.length} ready
              </p>
            )}
          </section>

          <section className="queue-state chat">
            <h2>Chat</h2>
            <div className="chat-log">
              {messages.length === 0 ? (
                <p className="placeholder">No messages yet. Say hello to your team.</p>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => {
                    // Only YOUR optimistic message (temp id) animates its landing;
                    // polled messages render in place — matching the optimistic
                    // doctrine of animating your own action's local appearance.
                    const optimistic = msg.id.startsWith('temp-');
                    return (
                      <m.div
                        key={msg.id}
                        className="chat-line"
                        layout={!reduce}
                        initial={reduce || !optimistic ? false : listEnter}
                        animate={reduce ? undefined : listShown}
                        exit={reduce ? undefined : listExit}
                        transition={reduce ? undefined : listTransition}
                      >
                        <strong>{msg.displayName}:</strong> {msg.body}
                        {pending.includes(msg.id) && (
                          <span className="placeholder"> · sending…</span>
                        )}
                      </m.div>
                    );
                  })}
                </AnimatePresence>
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
              <Tooltip label="Send message">
                <button
                  type="submit"
                  className="icon-btn icon-btn--primary"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </button>
              </Tooltip>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
