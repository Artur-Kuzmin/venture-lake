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
import { Toast } from '../components/lake/Toast';
import { EmptyState } from '../components/lake/EmptyState';
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

// The mission ledger (§3): six fixed steps form the 72-hour arc. team.status picks
// the ONE active (inverted) step; earlier steps render done (quiet), later steps
// locked (faint). Confirmed mapping: Build folds assign+72h; VC Review bundles
// submitted/under-review/appeal/final/continuation.
const STEP_OF_STATUS: Record<string, number> = {
  LOBBY: 1,
  PIVOTING: 1,
  IDEA_VOTING: 2,
  CAPTAIN_VOTING: 3,
  MISSION_ACTIVE: 4,
  CONTINUING: 4,
  FAILED: 4,
  SUBMITTED: 5,
  UNDER_REVIEW: 5,
  APPEAL_WINDOW: 5,
  REVIEW_FINAL: 5,
  CONTINUATION_VOTING: 5,
  PUBLISHED: 6,
  DISBANDED: 6,
};
const LEDGER_TITLES: Record<number, string> = {
  1: 'Team matched',
  2: 'Idea accepted',
  3: 'Captain elected',
  4: 'The build · 72h',
  5: 'VC review',
  6: 'Showcase',
};
type StepState = 'done' | 'active' | 'locked' | 'blocked';

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

  // --- Ledger state (§3) ---
  const currentStep = STEP_OF_STATUS[team.status] ?? 4;
  const terminal =
    team.status === 'DISBANDED' || (team.status === 'PUBLISHED' && showcase != null);
  const stepStateOf = (n: number): StepState =>
    n < currentStep
      ? 'done'
      : n > currentStep
        ? 'locked'
        : team.status === 'FAILED'
          ? 'blocked'
          : terminal
            ? 'done'
            : 'active';
  const captainName = team.captainId ? nameOf(team.captainId) : null;
  const readyCount = team.members.filter((mbr) => mbr.ready).length;
  const finalScoreText = team.finalScore != null ? `${Math.round(team.finalScore)}/100` : '—';
  const showTimer =
    (team.status === 'MISSION_ACTIVE' || team.status === 'CONTINUING') &&
    Boolean(team.missionDeadlineAt);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const stepKicker = (state: StepState) => {
    const map: Record<StepState, { cls: string; text: string }> = {
      done: { cls: 'vl-step__kicker--done', text: '✓ Done' },
      active: { cls: 'vl-step__kicker--live', text: 'Live' },
      blocked: { cls: 'vl-step__kicker--blocked', text: '✕ Failed' },
      locked: { cls: 'vl-step__kicker--locked', text: '• Locked' },
    };
    const k = map[state];
    return <span className={`vl-step__kicker ${k.cls}`}>{k.text}</span>;
  };

  // A ledger row: number column + body (kicker, title, then state-specific body).
  const ledgerStep = (n: number, body: React.ReactNode) => {
    const state = stepStateOf(n);
    return (
      <li className={`vl-step vl-step--${state}`}>
        <div className="vl-step__num">{pad2(n)}</div>
        <div className="vl-step__body">
          {stepKicker(state)}
          <h2 className="vl-step__title">{LEDGER_TITLES[n]}</h2>
          {state !== 'locked' ? body : null}
        </div>
      </li>
    );
  };

  // ---- Step bodies ---------------------------------------------------------

  const step1 = ledgerStep(
    1,
    stepStateOf(1) === 'active' ? (
      <>
        {team.matchExplanation && <p className="vl-step__lead">{team.matchExplanation}</p>}
        <ul className="vl-list">
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
                {mem.ready ? '✅ ' : '⬜ '}
                {mem.displayName}
                {mem.userId === team.currentUserId && ' · you'}
                {mem.isCaptain && ' · captain'}
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
        <p>
          {readyCount} of {team.members.length} ready
        </p>
        <div className="vl-actions">
          <button type="button" className="vl-btn vl-btn--ghost" onClick={toggleReady} disabled={busy}>
            {me?.ready ? 'Not ready' : 'Ready up'}
          </button>
          {allReady ? (
            <button
              type="button"
              className="vl-btn vl-btn--primary"
              onClick={generateIdea}
              disabled={busy}
            >
              {busy ? 'Generating…' : 'Generate mission idea'}
            </button>
          ) : (
            <p>Everyone must ready up to generate a mission idea.</p>
          )}
        </div>
      </>
    ) : (
      <p className="vl-step__lead">
        {team.matchExplanation || `${team.members.length} founders matched.`}
      </p>
    )
  );

  const step2 = ledgerStep(
    2,
    stepStateOf(2) === 'active' && idea ? (
      <>
        <p className="vl-step__lead">{idea.title}</p>
        <span className="vl-chip">{idea.category}</span>
        <p>{idea.description}</p>
        <p>{idea.reasoning}</p>

        {idea.status === 'PROPOSED' && (
          <>
            <h3>Votes</h3>
            <ul className="vl-list">
              {team.members.map((mbr) => {
                const v = voteByUser.get(mbr.userId);
                return (
                  <li key={mbr.userId}>
                    {mbr.displayName}:{' '}
                    {v ? (
                      <strong>
                        {v.vote}
                        {v.vote === 'NO' && v.rejectReason ? ` (${v.rejectReason})` : ''}
                      </strong>
                    ) : (
                      <span>not voted</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!noMode ? (
              <div className="vl-actions">
                <button
                  type="button"
                  className="vl-btn vl-btn--primary"
                  onClick={() => voteYes(idea.id)}
                  disabled={busy}
                >
                  Vote YES
                </button>
                <button
                  type="button"
                  className="vl-btn vl-btn--ghost"
                  onClick={() => setNoMode(true)}
                  disabled={busy}
                >
                  Vote NO
                </button>
              </div>
            ) : (
              <div className="vl-form">
                <label>
                  Reason
                  <select
                    className="vl-input"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  >
                    {REJECT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="vl-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  maxLength={500}
                />
                <div className="vl-actions">
                  <button
                    type="button"
                    className="vl-btn vl-btn--primary"
                    onClick={() => voteNo(idea.id)}
                    disabled={busy}
                  >
                    Submit NO
                  </button>
                  <button
                    type="button"
                    className="vl-btn vl-btn--ghost"
                    onClick={() => setNoMode(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {idea.status === 'REJECTED' && (
          <>
            <p className="vl-error">Idea rejected.</p>
            <ul className="vl-list">
              {idea.votes
                .filter((v) => v.vote === 'NO')
                .map((v) => (
                  <li key={v.userId}>
                    {v.displayName}: {v.rejectReason}
                    {v.feedbackNote ? ` — ${v.feedbackNote}` : ''}
                  </li>
                ))}
            </ul>
            <div className="vl-actions">
              <button
                type="button"
                className="vl-btn vl-btn--primary"
                onClick={regenerate}
                disabled={busy}
              >
                {busy ? 'Regenerating…' : 'Regenerate idea'}
              </button>
            </div>
          </>
        )}

        {idea.status === 'ACCEPTED' && (
          <p>
            <strong>Idea accepted!</strong> Captain selection is next.
          </p>
        )}
      </>
    ) : idea ? (
      <>
        <p className="vl-step__lead">{idea.title}</p>
        <span className="vl-chip">{idea.category}</span>
      </>
    ) : (
      <p>Idea pending.</p>
    )
  );

  const step3 = ledgerStep(
    3,
    stepStateOf(3) === 'active' && captainVote ? (
      captainVote.captainId ? (
        <>
          <p className="vl-step__lead">Captain: {nameOf(captainVote.captainId)}</p>
          {!mission ? (
            isCaptain ? (
              <div className="vl-actions">
                <button
                  type="button"
                  className="vl-btn vl-btn--primary"
                  onClick={generateDeliverables}
                  disabled={busy}
                >
                  {busy ? 'Generating…' : 'Generate deliverables'}
                </button>
              </div>
            ) : (
              <p>Waiting for the captain to generate deliverables.</p>
            )
          ) : (
            <>
              <h3>Deliverables</h3>
              <ul className="vl-list">
                {mission.deliverables.map((d, i) => (
                  <li key={i}>
                    <strong>{d.title}</strong> — {d.description}
                    <div>
                      Owner:{' '}
                      {isCaptain ? (
                        <select
                          className="vl-input"
                          value={ownerByIndex[i] ?? ''}
                          onChange={(e) =>
                            setOwnerByIndex((p) => ({ ...p, [i]: e.target.value }))
                          }
                        >
                          <option value="">— select —</option>
                          {team.members.map((mbr) => (
                            <option key={mbr.userId} value={mbr.userId}>
                              {mbr.displayName}
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
                <div className="vl-actions">
                  <button
                    type="button"
                    className="vl-btn vl-btn--primary"
                    onClick={saveAssignments}
                    disabled={busy || !allAssigned}
                  >
                    {busy ? 'Saving…' : 'Save assignments'}
                  </button>
                  <button
                    type="button"
                    className="vl-btn vl-btn--ghost"
                    onClick={generateDeliverables}
                    disabled={busy}
                  >
                    Regenerate
                  </button>
                </div>
              )}
              {deliverablesAssigned && <p>All deliverables assigned.</p>}
              {isCaptain && deliverablesAssigned && (
                <div className="vl-actions">
                  <button
                    type="button"
                    className="vl-btn vl-btn--go"
                    onClick={startMission}
                    disabled={busy}
                  >
                    {busy ? 'Starting…' : 'Start the mission →'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p>
            Self-nominate, then vote. Simple majority ({captainVote.majorityNeeded} of{' '}
            {captainVote.memberCount}) wins.
          </p>
          {!captainVote.myNomination && (
            <div className="vl-actions">
              <button
                type="button"
                className="vl-btn vl-btn--primary"
                onClick={nominateCaptain}
                disabled={busy}
              >
                Self-nominate
              </button>
            </div>
          )}
          <EmptyState show={captainVote.nominees.length === 0} kicker="Captain vote">
            No nominees yet — nominate a teammate to get the vote moving.
          </EmptyState>
          {captainVote.nominees.length > 0 && (
            <ul className="vl-list">
              <AnimatePresence initial={false}>
                {/* Leaderboard: votes desc, name tiebreak. An optimistic vote
                    changes a tally and the layout (FLIP) reorder lands the row
                    in its new rank on the snappy spring. */}
                {[...captainVote.nominees]
                  .sort((a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName))
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
                        ' · your vote'
                      ) : (
                        <button
                          type="button"
                          className="vl-btn vl-btn--ghost vl-btn--sm"
                          onClick={() => voteCaptain(n.userId)}
                          disabled={busy}
                        >
                          Vote
                        </button>
                      )}
                    </m.li>
                  ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )
    ) : (
      <p className="vl-step__lead">Captain: {captainName ?? '—'}</p>
    )
  );

  const step4 = ledgerStep(
    4,
    team.status === 'FAILED' ? (
      <>
        <p>
          The 72-hour deadline passed without a submission, so this session has ended. No penalty —
          you can jump back into the queue.
        </p>
        <div className="vl-actions">
          <button
            type="button"
            className="vl-btn vl-btn--primary"
            onClick={requeueIndividually}
            disabled={busy}
          >
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
        </div>
      </>
    ) : stepStateOf(4) === 'active' && mission ? (
      <>
        <p className="vl-step__lead">{mission.title}</p>
        <p>{mission.brief}</p>
        {team.status === 'CONTINUING' && (
          <p>
            Follow-up mission · proposed duration {Math.round(mission.durationHours / 24)} days. It
            starts once the whole team approves it.
          </p>
        )}
        {missionExpired && (
          <p className="vl-error">
            The deadline has passed. Unless a package is submitted, this mission will be marked
            failed.
          </p>
        )}

        <h3>Deliverables</h3>
        <ul className="vl-list">
          {mission.assignments.map((a, i) => (
            <li key={i}>
              <strong>{a.title}</strong> — {a.description} <span className="vl-chip">{a.assignedToName}</span>
            </li>
          ))}
          {mission.assignments.length === 0 &&
            mission.deliverables.map((d, i) => (
              <li key={i}>
                <strong>{d.title}</strong> — {d.description}
              </li>
            ))}
        </ul>

        <h3>Final submission</h3>
        {isCaptain ? (
          <div className="vl-form">
            <label>
              Summary *
              <textarea
                className="vl-input"
                value={submitForm.summary}
                onChange={setSubmitField('summary')}
                rows={3}
              />
            </label>
            <label>
              Pitch
              <textarea
                className="vl-input"
                value={submitForm.pitchText}
                onChange={setSubmitField('pitchText')}
                rows={2}
              />
            </label>
            <label>
              Prototype / demo URL
              <input
                className="vl-input"
                value={submitForm.prototypeUrl}
                onChange={setSubmitField('prototypeUrl')}
                placeholder="https://"
              />
            </label>
            <label>
              Landing page URL
              <input
                className="vl-input"
                value={submitForm.landingPageUrl}
                onChange={setSubmitField('landingPageUrl')}
                placeholder="https://"
              />
            </label>
            <label>
              File / resource links (one per line)
              <textarea
                className="vl-input"
                value={submitForm.links}
                onChange={setSubmitField('links')}
                rows={2}
              />
            </label>
            <label>
              Notes
              <textarea
                className="vl-input"
                value={submitForm.notes}
                onChange={setSubmitField('notes')}
                rows={2}
              />
            </label>
            <div className="vl-actions">
              <button
                type="button"
                className="vl-btn vl-btn--go"
                onClick={submitMission}
                disabled={busy || !submitForm.summary.trim()}
              >
                {busy ? 'Submitting…' : 'Submit final package →'}
              </button>
            </div>
          </div>
        ) : (
          <p>
            Your captain submits the final package. Get your deliverables done and coordinate in
            chat before the clock runs out.
          </p>
        )}
        <p>
          What happens next: when the captain submits, the package enters the anonymized VC review
          queue. A reviewer scores it across five categories, then your team gets a 6-hour appeal
          window before the score becomes final.
        </p>
      </>
    ) : (
      <p className="vl-step__lead">{mission?.title ?? 'Mission'} — final package submitted.</p>
    )
  );

  const step5 = ledgerStep(
    5,
    stepStateOf(5) === 'active' ? (
      <>
        {team.status === 'SUBMITTED' && team.submission && (
          <>
            <p className="vl-step__lead">
              {team.submission.reviewDelayed ? 'Review delayed' : 'Submitted — awaiting VC review'}
            </p>
            {team.submission.reviewDelayed && (
              <p className="vl-error">
                Your reviewer missed the 6-hour window, so the submission is back at the front of the
                review queue. No action needed — the next available VC will pick it up.
              </p>
            )}
            <p>Submitted by {team.submission.submittedByName}.</p>
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
            {team.submission.notes && (
              <p>
                <strong>Notes:</strong> {team.submission.notes}
              </p>
            )}
          </>
        )}

        {/* Hidden in pre-review stages so a pivoted team's fresh round doesn't
            show the previous round's review. */}
        {team.reviews.length > 0 &&
          !['LOBBY', 'IDEA_VOTING', 'CAPTAIN_VOTING', 'MISSION_ACTIVE'].includes(team.status) && (
            <>
              <h3>VC review</h3>
              {team.status === 'APPEAL_WINDOW' && team.appealWindowExpiresAt && (
                <p>
                  ⏳ Appeal window closes in{' '}
                  <span className="vl-mono">
                    <Countdown to={team.appealWindowExpiresAt} format={formatRemaining} />
                  </span>
                </p>
              )}

              {team.status === 'APPEAL_WINDOW' && !appeal && team.submission && (
                <>
                  <div className="vl-actions">
                    <button
                      type="button"
                      className="vl-btn vl-btn--primary"
                      onClick={startAppeal}
                      disabled={busy}
                    >
                      Start appeal
                    </button>
                  </div>
                  <p>
                    A score can be appealed once. The team then has 6 hours to approve the appeal by
                    majority vote; if approved, a different VC reviews the submission blind.
                  </p>
                </>
              )}

              {appeal && appeal.status === 'OPEN' && !appealExpired && (
                <>
                  <p>
                    <strong>Appeal vote open</strong>
                  </p>
                  <p>
                    ⏳{' '}
                    <span className="vl-mono">
                      <Countdown to={appeal.expiresAt} format={formatRemaining} onExpire={forceRender} />
                    </span>{' '}
                    to reach a majority
                  </p>
                  <p>
                    YES: {appeal.yesCount} · NO: {appeal.noCount} · Needed: {appeal.majorityNeeded}
                  </p>
                  <div className="vl-actions">
                    <button
                      type="button"
                      className="vl-btn vl-btn--primary"
                      onClick={() => voteAppeal('YES')}
                      disabled={busy || appeal.myVote === 'YES'}
                    >
                      Vote YES{appeal.myVote === 'YES' ? ' ✓' : ''}
                    </button>
                    <button
                      type="button"
                      className="vl-btn vl-btn--ghost"
                      onClick={() => voteAppeal('NO')}
                      disabled={busy || appeal.myVote === 'NO'}
                    >
                      Vote NO{appeal.myVote === 'NO' ? ' ✓' : ''}
                    </button>
                  </div>
                </>
              )}

              {appeal?.status === 'APPROVED' && (
                <p>Appeal approved. The submission has been sent to a new reviewer.</p>
              )}

              {appeal &&
                (appeal.status === 'REJECTED' || (appeal.status === 'OPEN' && appealExpired)) && (
                  <p>Appeal closed. The first review is final.</p>
                )}

              {team.reviews.map((r, i) => (
                <div key={i}>
                  <h3>
                    {r.isAppealReview ? 'Appeal review' : 'Review'} by {r.vcName} —{' '}
                    {Math.round(r.overallScore)}/100
                  </h3>
                  <ul className="vl-list">
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
                    <strong>Final score: {finalScoreText}</strong> (locked)
                  </p>
                  {team.status === 'REVIEW_FINAL' && (
                    <div className="vl-actions">
                      <button
                        type="button"
                        className="vl-btn vl-btn--primary"
                        onClick={startContinuationVote}
                        disabled={busy}
                      >
                        Start continuation vote
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>Score is not final until the appeal window closes.</p>
                  <p>🔒 The continuation vote is locked until the review is final.</p>
                </>
              )}
            </>
          )}

        {team.status === 'CONTINUATION_VOTING' && continuation && (
          <>
            <h3>What's next? Team vote</h3>
            <p>
              Majority wins ({continuation.majorityNeeded} of {continuation.memberCount}). You can
              change your vote until a majority is reached.
            </p>
            <ul className="vl-list">
              {CONTINUATION_OPTIONS.map((opt) => {
                const tally = continuation.tallies.find((t) => t.choice === opt.choice)?.votes ?? 0;
                const mine = continuation.myChoice === opt.choice;
                return (
                  <li key={opt.choice}>
                    <button
                      type="button"
                      className="vl-btn vl-btn--ghost vl-btn--sm"
                      onClick={() => voteContinuation(opt.choice)}
                      disabled={busy || mine}
                    >
                      {opt.label}
                    </button>{' '}
                    — {tally} vote{tally === 1 ? '' : 's'}
                    {mine && ' · your vote'}
                    <div>{opt.hint}</div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    ) : (
      <p className="vl-step__lead">Final score: {finalScoreText}</p>
    )
  );

  const step6 = ledgerStep(
    6,
    team.status === 'DISBANDED' ? (
      <>
        <p>
          The team disbanded privately — nothing is published. No penalty; requeue whenever you
          like.
        </p>
        <div className="vl-actions">
          <button
            type="button"
            className="vl-btn vl-btn--primary"
            onClick={requeueIndividually}
            disabled={busy}
          >
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
        </div>
      </>
    ) : team.status === 'PUBLISHED' ? (
      <>
        {!showcase ? (
          <>
            <p>The team voted to publish. Fill in the public entry — any member can publish it.</p>
            <div className="vl-form">
              <label>
                Project name *
                <input
                  className="vl-input"
                  value={publishForm.title}
                  onChange={setPublishField('title')}
                  maxLength={120}
                />
              </label>
              <label>
                Tagline *
                <input
                  className="vl-input"
                  value={publishForm.tagline}
                  onChange={setPublishField('tagline')}
                  maxLength={160}
                />
              </label>
              <label>
                Short pitch *
                <textarea
                  className="vl-input"
                  value={publishForm.shortPitch}
                  onChange={setPublishField('shortPitch')}
                  rows={3}
                />
              </label>
              <label>
                Prototype / demo URL *
                <input
                  className="vl-input"
                  value={publishForm.prototypeUrl}
                  onChange={setPublishField('prototypeUrl')}
                  placeholder="https://"
                />
              </label>
              <div className="vl-actions">
                <button
                  type="button"
                  className="vl-btn vl-btn--go"
                  onClick={publishShowcase}
                  disabled={
                    busy ||
                    !publishForm.title.trim() ||
                    !publishForm.tagline.trim() ||
                    !publishForm.shortPitch.trim() ||
                    !publishForm.prototypeUrl.trim()
                  }
                >
                  {busy ? 'Publishing…' : 'Publish to showcase →'}
                </button>
              </div>
            </div>
            <p>
              The public page shows the name, tagline, pitch, demo link, the raw final score, and
              only the members who opt in. VC feedback and category scores stay private.
            </p>
          </>
        ) : (
          <>
            <p className="vl-step__lead">
              {showcase.title} is live with a score of {showcase.finalScore}/100.
            </p>
            <p>
              Attribution is personal:{' '}
              {showcase.myVisible ? 'your name is currently shown.' : 'you are currently hidden.'}
            </p>
            <div className="vl-actions">
              <button
                type="button"
                className="vl-btn vl-btn--primary"
                onClick={() => setAttribution(true)}
                disabled={busy || showcase.myVisible === true}
              >
                Show my name
              </button>
              <button
                type="button"
                className="vl-btn vl-btn--ghost"
                onClick={() => setAttribution(false)}
                disabled={busy || showcase.myVisible === false}
              >
                Hide me
              </button>
            </div>
            <ul className="vl-list">
              {showcase.attributions.map((a) => (
                <li key={a.userId}>
                  {a.displayName}: {a.visible ? 'shown' : 'hidden'}
                  {a.userId === team.currentUserId && ' · you'}
                </li>
              ))}
            </ul>
            <p>
              <Link to="/showcase">View the public showcase</Link>
            </p>
          </>
        )}
        <div className="vl-actions">
          <button
            type="button"
            className="vl-btn vl-btn--ghost"
            onClick={requeueIndividually}
            disabled={busy}
          >
            {busy ? 'Requeuing…' : 'Requeue individually'}
          </button>
        </div>
      </>
    ) : (
      <p>Ships to the public showcase once the review is settled and the team votes to publish.</p>
    )
  );

  const canLeave =
    inLobby || team.status === 'REVIEW_FINAL' || team.status === 'CONTINUATION_VOTING';

  return (
    <div className="page team-page lake-scope">
      <header className="vl-band">
        <div>
          <StatePill state={STATUS_PILL[team.status] ?? 'active'} label={statusMeta.label} />
          <h1 className="vl-band__title">{inLobby ? 'The Lobby' : 'The Mission'}</h1>
          <p className="vl-band__data">
            {team.members.length} founders · stage {pad2(currentStep)}/06 · captain:{' '}
            <b>{captainName ?? 'TBD'}</b>
          </p>
          <div className="vl-avatars" aria-hidden="true">
            {team.members.map((mem) => (
              <span
                key={mem.userId}
                className="vl-avatars__a"
                data-captain={mem.isCaptain}
                title={mem.displayName}
              >
                {mem.displayName.slice(0, 2)}
              </span>
            ))}
          </div>
        </div>
        {showTimer && team.missionDeadlineAt && (
          <div className="vl-clock">
            <div className="vl-clock__t">
              <Countdown to={team.missionDeadlineAt} format={formatRemaining} onExpire={forceRender} />
            </div>
            <div className="vl-clock__l">{missionExpired ? 'Deadline passed' : 'Time remaining'}</div>
          </div>
        )}
      </header>

      <ol className="vl-ledger">
        {step1}
        {step2}
        {step3}
        {step4}
        {step5}
        {step6}
      </ol>

      <section className="vl-chatstrip">
        <h2 className="vl-step__title">Team chat</h2>
        <div className="vl-chatstrip__log">
          <EmptyState show={messages.length === 0} kicker="Team chat">
            Quiet so far — introduce yourself and claim a deliverable.
          </EmptyState>
          {messages.length > 0 && (
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                // Only YOUR optimistic message (temp id) animates its landing;
                // polled messages render in place — matching the optimistic
                // doctrine of animating your own action's local appearance.
                const optimisticMsg = msg.id.startsWith('temp-');
                return (
                  <m.div
                    key={msg.id}
                    className="vl-chatstrip__line"
                    layout={!reduce}
                    initial={reduce || !optimisticMsg ? false : listEnter}
                    animate={reduce ? undefined : listShown}
                    exit={reduce ? undefined : listExit}
                    transition={reduce ? undefined : listTransition}
                  >
                    <strong>{msg.displayName}:</strong> {msg.body}
                    {pending.includes(msg.id) && <span> · sending…</span>}
                  </m.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={sendMessage} className="vl-chatstrip__form">
          <input
            className="vl-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message your team…"
            maxLength={2000}
          />
          <Tooltip label="Send message">
            <button
              type="submit"
              className="vl-btn vl-btn--primary vl-chatstrip__send"
              disabled={!draft.trim()}
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
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

      {canLeave && (
        <div className="vl-teamfoot">
          <button type="button" className="vl-btn vl-btn--ghost" onClick={leaveTeam} disabled={busy}>
            {inLobby ? 'Leave team' : 'Leave team (no penalty)'}
          </button>
        </div>
      )}

      <Toast message={error} tone="error" onClose={() => setError(null)} />
    </div>
  );
}
