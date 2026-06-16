import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/apiClient';
import { useAuth } from '../lib/authContext';
import { ProfileForm } from '../components/ProfileForm';
import type { FounderProfile, ProfileInput } from '../types';

export default function CreateProfilePage() {
  const navigate = useNavigate();
  // Profile existence comes from the viewer already loaded at startup — no extra
  // fetch. ProtectedRoute waits for the viewer before rendering this page, so
  // hasProfile is reliable here.
  const { hasProfile, refreshViewer } = useAuth();
  const [alreadyExists, setAlreadyExists] = useState(false);

  // Already onboarded: never show the create flow — send them to the lobby.
  if (hasProfile) {
    return <Navigate to="/lobby" replace />;
  }

  async function handleCreate(input: ProfileInput) {
    try {
      await api.post<FounderProfile>('/api/profile', input);
      // Refresh viewer status so the now-present profile is known before the
      // profile-guarded /lobby route evaluates.
      await refreshViewer();
      navigate('/lobby');
    } catch (err) {
      // A 409 means a profile already exists (e.g. created in another tab).
      // Show a friendly notice with a link to /profile — never the raw backend
      // message ("Use PUT to update it") or any HTTP-verb text. Other errors
      // (validation, etc.) fall through to the form's normal handler.
      if (err instanceof ApiError && err.status === 409) {
        setAlreadyExists(true);
        return;
      }
      throw err;
    }
  }

  if (alreadyExists) {
    return (
      <div className="page">
        <div className="queue-state">
          <span className="status status--info">Already set up</span>
          <h2>You already have a profile</h2>
          <p className="placeholder">
            Your founder profile is ready — you can review or edit it any time.
          </p>
          <p>
            <Link to="/profile">Go to your profile</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <span className="home-eyebrow">Founder signal</span>
      <h1>Set up your Founder Signal</h1>
      <p className="placeholder profile-intro">
        Your Founder Signal powers matchmaking — your role, skills, availability, and interests
        decide which team you're placed on. Be precise; it's how we build a balanced team around
        you.
      </p>
      <ProfileForm submitLabel="Create profile" onSubmit={handleCreate} />
    </div>
  );
}
