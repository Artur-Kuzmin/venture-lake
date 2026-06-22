import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { ShowcaseSkeleton } from '../components/PageSkeletons';
import { Tooltip } from '../components/Tooltip';
import type { PublicShowcaseProject } from '../types';

// Public showcase (Phase 10): published projects only — name, tagline, short
// pitch, demo link, the raw final VC score, and the contributors who opted in.
// VC feedback and category scores are never returned by the API.
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
      <section className="sc-hero">
        <span className="home-eyebrow">Proof of work</span>
        <h1>Reviewed startup work from VentureLake teams.</h1>
        <p className="lead">
          Every project here was built by a matched founder team in a focused mission, scored by a
          VC-style reviewer, and published by the team. No portfolios, no bios — just shipped work.
        </p>
      </section>

      {error && <p className="form-error">{error}</p>}
      {!error && !projects && <ShowcaseSkeleton />}

      {projects && projects.length === 0 && (
        <div className="queue-state sc-empty">
          <span className="status status--info">Coming soon</span>
          <h2>No projects published yet.</h2>
          <p className="placeholder">
            The first teams are still building. Published missions will appear here as a gallery of
            reviewed proof-of-work.
          </p>
          <p>
            <Link to="/lobby">Team up in the lobby</Link> and be the first.
          </p>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="sc-grid">
          {projects.map((p) => (
            <article key={p.id} className="sc-card">
              <div className="sc-card__top">
                <span className="sc-score">
                  {p.finalScore}
                  <small>/100</small>
                </span>
                <span className="sc-card__badge">VC reviewed</span>
              </div>

              <h2 className="sc-card__title">{p.title}</h2>
              <p className="sc-card__tagline">{p.tagline}</p>
              <p className="sc-card__pitch">{p.shortPitch}</p>

              <div className="sc-card__foot">
                {p.contributors.length > 0 && (
                  <div className="tag-row">
                    {p.contributors.map((c) => (
                      <span className="tag" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {p.prototypeUrl && (
                  <Tooltip label="Open prototype (new tab)">
                    <a
                      className="icon-btn"
                      href={p.prototypeUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open prototype in a new tab"
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
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                    </a>
                  </Tooltip>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
