import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

// Public explainer of the VentureLake loop.
const STEPS = [
  {
    title: 'Profile',
    desc: 'Create a founder signal with your role, skills, interests, language, timezone, and availability.',
  },
  {
    title: 'Queue',
    desc: 'Join solo or with friends and enter the matchmaking pool.',
  },
  {
    title: 'Match',
    desc: 'VentureLake forms teams around skill coverage, language fit, availability, and shared interests.',
  },
  {
    title: 'Lobby',
    desc: 'Meet your team, chat, ready up, and vote on the mission idea.',
  },
  {
    title: 'Mission',
    desc: 'Complete a focused 72-hour startup sprint with assigned deliverables and a captain submission.',
  },
  {
    title: 'Review',
    desc: 'Approved VC-style reviewers score the team’s work and provide structured feedback.',
  },
  {
    title: 'Continue, pivot, publish, or disband',
    desc: 'After review, the team decides whether to keep building, reset the idea, publish proof-of-work, or end the session.',
  },
];

export default function HowItWorksPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="page">
      <section className="hiw-hero">
        <span className="home-eyebrow">How VentureLake works</span>
        <h1>From profile to proof-of-work.</h1>
        <p className="lead">
          VentureLake turns founder networking into a structured execution loop: match, build,
          review, and decide what happens next.
        </p>
      </section>

      <ol className="hiw-timeline">
        {STEPS.map((step, i) => (
          <li className="hiw-step" key={step.title}>
            <span className="hiw-step__index">{String(i + 1).padStart(2, '0')}</span>
            <div className="hiw-step__body">
              <h2>{step.title}</h2>
              <p>{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="hiw-cta">
        <h2>Ready to enter the loop?</h2>
        <div className="lp-cta">
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => navigate(isAuthenticated ? '/lobby' : '/signup')}
          >
            {isAuthenticated ? 'Go to lobby' : 'Get started'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--lg"
            onClick={() => navigate('/showcase')}
          >
            View showcase
          </button>
        </div>
      </section>
    </div>
  );
}
