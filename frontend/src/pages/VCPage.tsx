import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import type { VCMe } from '../types';

// VC reviewer mode. Locked until an admin approves the account (Phase 7.1).
export default function VCPage() {
  const [vc, setVc] = useState<VCMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<VCMe>('/api/vc/me')
      .then((v) => {
        if (active) setVc(v);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <h1>VC Reviewer</h1>
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>VC Reviewer</h1>
      {vc?.approved ? (
        <div className="queue-state">
          <p>
            <strong>Reviewer mode unlocked.</strong> You can review anonymized submissions.
          </p>
          <p className="placeholder">The review queue opens next (Phase 7.2).</p>
        </div>
      ) : (
        <div className="queue-state">
          <p>🔒 VC reviewer mode is locked.</p>
          <p className="placeholder">An admin must approve your account before you can review.</p>
        </div>
      )}
    </div>
  );
}
