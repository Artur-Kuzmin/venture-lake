import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

// Public landing page shown at / for logged-out visitors.
const STEPS = ['Profile', 'Queue', 'Match', 'Lobby', 'Mission', 'Review', 'Continue or Publish'];

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="page">
      <section className="home-hero">
        <span className="home-eyebrow">Founder execution platform</span>
        <h1>Get matched. Build fast. Prove your work.</h1>
        <p className="lead">
          VentureLake matches young founders into startup teams, gives them focused 72-hour
          missions, and turns the best work into reviewed proof-of-work.
        </p>
        <div className="home-cta">
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => navigate(isAuthenticated ? '/lobby' : '/signup')}
          >
            Get started
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

      <section className="home-steps" aria-label="How VentureLake works">
        {STEPS.map((step, i) => (
          <span className="home-step" key={step}>
            <span className="home-step__index">{i + 1}</span>
            {step}
          </span>
        ))}
      </section>
    </div>
  );
}
