import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/authContext';
import { ProfileForm } from '../components/ProfileForm';
import type { FounderProfile, ProfileInput } from '../types';

export default function CreateProfilePage() {
  const navigate = useNavigate();
  const { refreshViewer } = useAuth();

  async function handleCreate(input: ProfileInput) {
    await api.post<FounderProfile>('/api/profile', input);
    // Refresh viewer status so the now-present profile is known before the
    // profile-guarded /lobby route evaluates.
    await refreshViewer();
    navigate('/lobby');
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
