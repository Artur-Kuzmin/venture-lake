import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

// Public landing page shown at / for logged-out visitors.
export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="page">
      <h1>Get matched. Build fast. Prove your work.</h1>
      <p className="placeholder">
        VentureLake matches young founders into startup teams, gives them focused 72-hour
        missions, and turns the best work into reviewed proof-of-work.
      </p>
      <div className="vote-actions">
        <button type="button" onClick={() => navigate(isAuthenticated ? '/lobby' : '/signup')}>
          Get started
        </button>
        <button type="button" className="link-button" onClick={() => navigate('/showcase')}>
          View showcase
        </button>
      </div>
    </div>
  );
}
