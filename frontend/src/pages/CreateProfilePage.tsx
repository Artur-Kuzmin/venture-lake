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
      <h1>Create founder profile</h1>
      <p className="placeholder">Complete your profile to enter the queue.</p>
      <ProfileForm submitLabel="Create profile" onSubmit={handleCreate} />
    </div>
  );
}
