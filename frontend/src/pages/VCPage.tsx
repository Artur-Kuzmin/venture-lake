import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/apiClient';
import type { VCAssignmentView, VCMe } from '../types';

// VC reviewer mode (Phase 7.1–7.2). Locked until an admin approves; once
// approved, the VC enters the queue and is shown ONE anonymized submission.
export default function VCPage() {
  const [vc, setVc] = useState<VCMe | null>(null);
  const [assignment, setAssignment] = useState<VCAssignmentView | null>(null);
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
      if (!a) setInfo('No submissions are available for review right now.');
    }, 'Could not enter the review queue.');

  const accept = () =>
    run(async () => {
      const a = await api.post<VCAssignmentView>(
        `/api/vc/assignments/${assignment!.assignmentId}/accept`
      );
      setAssignment(a);
    }, 'Could not accept.');

  const pass = () =>
    run(async () => {
      await api.post(`/api/vc/assignments/${assignment!.assignmentId}/pass`);
      setAssignment(null);
      setInfo('Passed. Enter the queue again for another submission.');
    }, 'Could not pass.');

  if (loading) {
    return (
      <div className="page">
        <h1>VC Reviewer</h1>
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  if (!vc?.approved) {
    return (
      <div className="page">
        <h1>VC Reviewer</h1>
        <div className="queue-state">
          <p>🔒 VC reviewer mode is locked.</p>
          <p className="placeholder">An admin must approve your account before you can review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>VC Reviewer</h1>

      {!assignment ? (
        <div className="queue-state">
          <p>
            <strong>Reviewer mode.</strong> Enter the queue to receive one anonymized submission.
          </p>
          <button type="button" onClick={enterQueue} disabled={busy}>
            {busy ? 'Finding…' : 'Enter review queue'}
          </button>
          {info && <p className="placeholder">{info}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <div className="queue-state">
          <h2>Anonymized submission</h2>
          <h3>{assignment.missionTitle}</h3>
          <p className="placeholder">{assignment.missionBrief}</p>

          <h3>Deliverables</h3>
          <ul className="party-members">
            {assignment.deliverables.map((d, i) => (
              <li key={i}>
                <strong>{d.title}</strong> — {d.description}
              </li>
            ))}
          </ul>

          <h3>Submission</h3>
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

          {assignment.status === 'ASSIGNED' ? (
            <div className="vote-actions">
              <button type="button" onClick={accept} disabled={busy}>
                Accept
              </button>
              <button type="button" onClick={pass} disabled={busy} className="link-button">
                Pass
              </button>
            </div>
          ) : (
            <p className="placeholder">Accepted — the scoring form opens next (Phase 7.3).</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
