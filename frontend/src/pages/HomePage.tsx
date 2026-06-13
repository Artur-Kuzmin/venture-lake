import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

// Public landing page shown at / for logged-out visitors.

const STEPS = [
  { title: 'Create your founder profile', desc: 'Define your role, skills, and the kind of work you want to do.' },
  { title: 'Queue solo or with friends', desc: 'Enter the global queue alone, or bring a party of up to five.' },
  {
    title: 'Get matched into a balanced team',
    desc: 'Skill-coverage matchmaking spans build, design, growth, and business.',
  },
  { title: 'Accept a 72-hour mission', desc: 'A scoped startup mission your team votes to take on together.' },
  { title: 'Submit your work', desc: 'Your captain ships the final package before the countdown ends.' },
  { title: 'Get reviewed', desc: 'Approved VC-style reviewers score the submission across five categories.' },
  {
    title: 'Continue, pivot, publish, or disband',
    desc: 'The team votes on what happens next with the project.',
  },
];

const SCORECARD = [
  { label: 'Execution', value: 94 },
  { label: 'Market opportunity', value: 76 },
  { label: 'Product design', value: 88 },
  { label: 'Team dynamics', value: 67 },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const getStarted = () => navigate(isAuthenticated ? '/lobby' : '/signup');
  const viewShowcase = () => navigate('/showcase');

  return (
    <div className="page landing">
      {/* Hero --------------------------------------------------------------- */}
      <section className="lp-hero">
        <div className="lp-hero__grid" aria-hidden="true" />
        <div className="lp-hero__glow" aria-hidden="true" />

        <div className="lp-hero__inner">
          <span className="home-eyebrow">Private founder execution platform</span>
          <h1>Get matched. Build fast. Prove your work.</h1>
          <p className="lp-lead">
            VentureLake matches young founders into startup teams, gives them focused 72-hour
            missions, and turns the best work into reviewed proof-of-work.
          </p>
          <div className="lp-cta">
            <button type="button" className="btn btn--lg" onClick={getStarted}>
              Get started
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={viewShowcase}>
              View showcase
            </button>
          </div>
        </div>

        {/* Product preview (mock, CSS-only) */}
        <div className="lp-preview" aria-hidden="true">
          <div className="lp-preview__bar">
            <span className="lp-preview__dot" />
            <span className="lp-preview__dot" />
            <span className="lp-preview__dot" />
            <span className="lp-preview__title">venturelake — mission control</span>
          </div>
          <div className="lp-preview__body">
            <div className="lp-mock-panel">
              <div className="lp-mock-row">
                <span className="status status--success">Mission active</span>
                <span className="lp-mock-timer">47:56:21</span>
              </div>
              <h4 className="lp-mock-title">Mission brief — Landing page sprint</h4>
              <ul className="lp-mock-list">
                <li>
                  <span className="lp-check lp-check--on" /> Hero &amp; value proposition
                </li>
                <li>
                  <span className="lp-check lp-check--on" /> Pricing section
                </li>
                <li>
                  <span className="lp-check" /> Waitlist capture
                </li>
              </ul>
            </div>
            <div className="lp-mock-side">
              <div className="lp-score">
                <span className="lp-score__num">82</span>
                <span className="lp-score__label">VC score / 100</span>
              </div>
              <div className="lp-mock-stat">
                <strong>4</strong>
                <span>builders matched</span>
              </div>
              <div className="lp-mock-stat">
                <strong>72h</strong>
                <span>to ship</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The High-Velocity Cycle ------------------------------------------- */}
      <section className="lp-section">
        <div className="lp-section__head">
          <span className="home-eyebrow">The high-velocity cycle</span>
          <h2>From profile to proof in one focused loop.</h2>
        </div>
        <ol className="lp-steps">
          {STEPS.map((step, i) => (
            <li className="lp-step-card" key={step.title}>
              <span className="lp-step-card__index">{String(i + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Proof of work ----------------------------------------------------- */}
      <section className="lp-section lp-split">
        <div>
          <span className="home-eyebrow">Proof of work</span>
          <h2>Execution you can point to — not just connections.</h2>
          <p className="lp-body">
            VentureLake isn't networking for its own sake. Every mission turns real work into
            reviewed, visible proof-of-work — scored by reviewers, attributed to the people who
            built it, and published to a public showcase when the team chooses.
          </p>
        </div>
        <ul className="lp-points">
          <li>
            <strong>Scored.</strong> Independent reviewers grade every submission.
          </li>
          <li>
            <strong>Attributed.</strong> Contributors opt in to their name on the work.
          </li>
          <li>
            <strong>Public.</strong> The best missions become a showcase you can share.
          </li>
        </ul>
      </section>

      {/* VC review --------------------------------------------------------- */}
      <section className="lp-section lp-split">
        <div>
          <span className="home-eyebrow">VC review</span>
          <h2>Reviewed by people who judge real ventures.</h2>
          <p className="lp-body">
            Approved VC-style reviewers independently score each submitted mission across five
            categories before the team decides what happens next. Don't agree with a score? A team
            can appeal once for a second, blind review.
          </p>
        </div>
        <div className="lp-scorecard" aria-hidden="true">
          <div className="lp-scorecard__head">
            <span className="lp-score__num lp-score__num--sm">82</span>
            <span className="placeholder">Aggregate score</span>
          </div>
          {SCORECARD.map((c) => (
            <div className="lp-score-row" key={c.label}>
              <span>{c.label}</span>
              <span className="lp-meter">
                <i style={{ width: `${c.value}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA --------------------------------------------------------- */}
      <section className="lp-final">
        <h2>Ready to build something real?</h2>
        <p className="placeholder">Get matched into a team and turn 72 hours into proof-of-work.</p>
        <div className="lp-cta">
          <button type="button" className="btn btn--lg" onClick={getStarted}>
            Get started
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={viewShowcase}>
            View showcase
          </button>
        </div>
      </section>
    </div>
  );
}
