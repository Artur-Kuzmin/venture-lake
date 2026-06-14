import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/apiClient';
import { Loading } from '../components/Loading';
import type { VCAssignmentView, VCMe } from '../types';

const CATEGORIES = [
  'Clarity of idea',
  'Execution quality',
  'Market potential',
  'Presentation quality',
  'Use of team skills',
];

interface CategoryInput {
  category: string;
  score: number;
  feedback: string;
}

// Mirrors the backend feedback quality checks so the submit button can gate.
function feedbackValid(f: string): boolean {
  const t = f.trim();
  if (t.length < 15) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const unique = new Set(words.map((w) => w.toLowerCase())).size;
  return unique / words.length >= 0.5;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Time's up";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// VC reviewer mode (Phase 7.1–7.3): locked → enter queue → anonymized submission
// → accept/pass → category review form (6h window, validity-gated submit).
export default function VCPage() {
  const [vc, setVc] = useState<VCMe | null>(null);
  const [assignment, setAssignment] = useState<VCAssignmentView | null>(null);
  const [form, setForm] = useState<CategoryInput[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const me = await api.get<VCMe>('/api/vc/me');
    setVc(me);
    if (me.approved) {
      setAssignment(await api.get<VCAssignmentView | null>('/api/vc/current-assignment'));
    }
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Seed the form once when an assignment becomes accepted.
  useEffect(() => {
    if (assignment?.status === 'ACCEPTED') {
      setForm(CATEGORIES.map((category) => ({ category, score: 5, feedback: '' })));
    } else {
      setForm([]);
    }
  }, [assignment?.assignmentId, assignment?.status]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const enterQueue = () =>
    run(async () => {
      const a = await api.post<VCAssignmentView | null>('/api/vc/queue/enter');
      setAssignment(a);
      if (!a) setInfo('No submissions are waiting for review right now — check back soon.');
    }, 'Could not enter the review queue.');

  const accept = () =>
    run(async () => {
      setAssignment(await api.post<VCAssignmentView>(`/api/vc/assignments/${assignment!.assignmentId}/accept`));
    }, 'Could not accept.');

  const pass = () =>
    run(async () => {
      await api.post(`/api/vc/assignments/${assignment!.assignmentId}/pass`);
      setAssignment(null);
      setInfo('Passed. Enter the queue again for another submission.');
    }, 'Could not pass.');

  const submitReview = () =>
    run(async () => {
      await api.post(`/api/vc/assignments/${assignment!.assignmentId}/review`, { categories: form });
      setAssignment(null);
      setInfo('Review submitted. Thank you.');
    }, 'Could not submit the review.');

  function updateRow(i: number, patch: Partial<CategoryInput>) {
    setForm((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  if (loading) {
    return (
      <div className="page">
        <h1>VC Review Desk</h1>
        <Loading label="Loading the review desk…" />
      </div>
    );
  }

  if (!vc?.approved) {
    return (
      <div className="page">
        <h1>VC Review Desk</h1>
        <div className="queue-state">
          <span className="status status--warning">Locked</span>
          <h2>VC reviewer mode is locked</h2>
          <p className="placeholder">
            An admin must approve your account before you can review submissions.
          </p>
        </div>
      </div>
    );
  }

  const cooldownUntil = vc.reviewCooldownUntil ? new Date(vc.reviewCooldownUntil) : null;
  const onCooldown = Boolean(cooldownUntil && cooldownUntil.getTime() > now);
  const deadlineMs = assignment?.deadlineAt ? new Date(assignment.deadlineAt).getTime() : null;
  const expired = deadlineMs ? deadlineMs <= now : false;
  const allValid =
    form.length === CATEGORIES.length &&
    form.every((r) => r.score >= 1 && r.score <= 10 && feedbackValid(r.feedback));
  const overallPreview = form.length
    ? Math.round((form.reduce((s, r) => s + r.score, 0) / form.length) * 10)
    : 0;

  return (
    <div className="page">
      <header className="vc-header">
        <div>
          <span className="qt-syslabel">Review desk</span>
          <h1>VC Review Desk</h1>
        </div>
        <span className="status status--success">Approved reviewer</span>
      </header>

      {vc.appealedReviews.length > 0 && (
        <div className="queue-state">
          <span className="status status--warning">Appealed reviews</span>
          <ul className="party-members">
            {vc.appealedReviews.map((a) => (
              <li key={a.reviewId}>
                Your review of <strong>{a.missionTitle}</strong> was appealed by the team
                {a.appealedAt ? ` on ${new Date(a.appealedAt).toLocaleDateString()}` : ''} and sent
                to another reviewer. The outcome is not shared with you.
              </li>
            ))}
          </ul>
        </div>
      )}

      {!assignment ? (
        onCooldown ? (
          <div className="queue-state">
            <span className="status status--warning">Cooldown</span>
            <h2>You're on a review cooldown</h2>
            <p className="placeholder">
              You can re-enter the review queue after{' '}
              <strong>{cooldownUntil!.toLocaleString()}</strong>.
            </p>
          </div>
        ) : (
          <div className="queue-state">
            <span className="status">Idle</span>
            <h2>Enter the review queue</h2>
            <p className="placeholder">
              Receive one anonymized submission to evaluate. You'll have 6 hours to score it once
              you accept.
            </p>
            <button type="button" onClick={enterQueue} disabled={busy}>
              {busy ? 'Finding…' : 'Enter review queue'}
            </button>
            {error && <p className="form-error">{error}</p>}
          </div>
        )
      ) : (
        <div className="vc-grid">
          <section className="queue-state vc-submission">
            <div className="vc-submission__head">
              <span className="status status--info">Anonymized submission</span>
            </div>
            <h2>{assignment.missionTitle}</h2>
            <p className="placeholder">{assignment.missionBrief}</p>

            <h3 className="mw-section-title">Deliverables</h3>
            <ul className="party-members">
              {assignment.deliverables.map((d, i) => (
                <li key={i}>
                  <strong>{d.title}</strong> — {d.description}
                </li>
              ))}
            </ul>

            <h3 className="mw-section-title">Submission</h3>
            <p>
              <strong>Summary:</strong> {assignment.submission.summary}
            </p>
            {assignment.submission.pitchText && (
              <p>
                <strong>Pitch:</strong> {assignment.submission.pitchText}
              </p>
            )}
            {assignment.submission.prototypeUrl && (
              <p>
                Prototype / demo:{' '}
                <a href={assignment.submission.prototypeUrl} target="_blank" rel="noreferrer">
                  {assignment.submission.prototypeUrl}
                </a>
              </p>
            )}
            {assignment.submission.landingPageUrl && (
              <p>
                Landing page:{' '}
                <a href={assignment.submission.landingPageUrl} target="_blank" rel="noreferrer">
                  {assignment.submission.landingPageUrl}
                </a>
              </p>
            )}
            {assignment.submission.links.length > 0 && (
              <ul className="party-members">
                {assignment.submission.links.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
            {assignment.submission.notes && (
              <p>
                <strong>Notes:</strong> {assignment.submission.notes}
              </p>
            )}
          </section>

          {assignment.status === 'ASSIGNED' ? (
            <aside className="queue-state vc-side">
              <h2>Review assignment</h2>
              <p className="placeholder">
                Accept to start your 6-hour review, or pass to return it to the queue.
              </p>
              <div className="vote-actions">
                <button type="button" onClick={accept} disabled={busy}>
                  Accept
                </button>
                <button type="button" onClick={pass} disabled={busy} className="link-button">
                  Pass
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
            </aside>
          ) : (
            <aside className="queue-state vc-scorecard">
              <div className="vc-scorecard__head">
                <div>
                  <h2>Scorecard</h2>
                  {deadlineMs && (
                    <p className={`timer${expired ? ' vc-timer--over' : ''}`}>
                      ⏳ {formatRemaining(deadlineMs - now)} left
                    </p>
                  )}
                </div>
                <div
                  className="vc-ring"
                  style={{
                    background: `conic-gradient(var(--accent) ${overallPreview}%, var(--surface-3) 0)`,
                  }}
                >
                  <span className="vc-ring__num">{overallPreview}</span>
                  <span className="vc-ring__label">/100</span>
                </div>
              </div>

              {form.map((row, i) => {
                const invalid = row.feedback.length > 0 && !feedbackValid(row.feedback);
                return (
                  <div key={row.category} className="vc-cat">
                    <div className="vc-cat__head">
                      <strong>{row.category}</strong>
                      <span className="vc-cat__score">{row.score}/10</span>
                    </div>
                    <span className="vc-meter">
                      <i style={{ width: `${row.score * 10}%` }} />
                    </span>
                    <label className="vc-cat__score-input">
                      Score
                      <select
                        value={row.score}
                        onChange={(e) => updateRow(i, { score: Number(e.target.value) })}
                      >
                        {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      value={row.feedback}
                      onChange={(e) => updateRow(i, { feedback: e.target.value })}
                      rows={2}
                      placeholder="Required feedback (min 15 characters)"
                      className={invalid ? 'vc-textarea--invalid' : undefined}
                    />
                    {invalid ? (
                      <span className="vc-warn">⚠ Feedback is too short or low quality.</span>
                    ) : (
                      row.feedback.length === 0 && (
                        <span className="placeholder">Feedback is required.</span>
                      )
                    )}
                  </div>
                );
              })}

              <p className="vc-overall">
                Overall score preview: <strong>{overallPreview}/100</strong>
              </p>
              <button type="button" onClick={submitReview} disabled={busy || !allValid || expired}>
                {busy ? 'Submitting…' : 'Submit review'}
              </button>
              {expired && <p className="form-error">The review window has passed.</p>}
              {error && <p className="form-error">{error}</p>}
            </aside>
          )}
        </div>
      )}
      {info && !assignment && <p className="placeholder">{info}</p>}
    </div>
  );
}
