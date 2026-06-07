import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { ProfileForm } from '../components/ProfileForm';
import type { FounderProfile, ProfileInput } from '../types';

export default function CreateProfilePage() {
  const navigate = useNavigate();

  async function handleCreate(input: ProfileInput) {
    await api.post<FounderProfile>('/api/profile', input);
    navigate('/profile');
  }

  return (
    <div className="page">
      <h1>Create founder profile</h1>
      <p className="placeholder">Complete your profile to enter the queue.</p>
      <ProfileForm submitLabel="Create profile" onSubmit={handleCreate} />
    </div>
  );
}
