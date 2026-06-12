import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import type { PublicShowcaseProject } from '../types';

// Public showcase (Phase 10): published projects only — name, tagline, short
// pitch, demo link, the raw final VC score, and the contributors who opted in.
export default function ShowcasePage() {
  const [projects, setProjects] = useState<PublicShowcaseProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PublicShowcaseProject[]>('/api/showcase')
      .then(setProjects)
      .catch(() => setError('Could not load the showcase.'));
  }, []);

  return (
    <div className="page">
      <h1>Showcase</h1>
      <p className="placeholder">Public proof-of-work from published teams.</p>

      {error && <p className="form-error">{error}</p>}
      {!error && !projects && <p className="placeholder">Loading…</p>}
      {projects && projects.length === 0 && (
        <p className="placeholder">No published projects yet.</p>
      )}

      {projects?.map((p) => (
        <section key={p.id} className="queue-state">
          <h2>{p.title}</h2>
          <p>
            <strong>{p.tagline}</strong>
          </p>
          <p>{p.shortPitch}</p>
          <p>
            <a href={p.prototypeUrl} target="_blank" rel="noreferrer">
              View prototype / demo
            </a>
          </p>
          <p>
            VC score: <strong>{p.finalScore}/100</strong>
          </p>
          {p.contributors.length > 0 && (
            <p className="placeholder">Built by {p.contributors.join(', ')}</p>
          )}
        </section>
      ))}
    </div>
  );
}
