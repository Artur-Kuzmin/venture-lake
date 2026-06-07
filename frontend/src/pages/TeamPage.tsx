import { useParams } from 'react-router-dom';

// Phases 4–9 implement the team lobby, mission flow, review, and continuation vote.
export default function TeamPage() {
  const { teamId } = useParams();
  return (
    <div className="page">
      <h1>Team</h1>
      <p className="placeholder">
        Team workspace for <code>{teamId}</code>. (Coming in Phases 4–9.)
      </p>
    </div>
  );
}
