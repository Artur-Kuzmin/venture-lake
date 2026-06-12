import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { ProfileForm } from '../components/ProfileForm';
import type { FounderProfile, PrimaryRole, ProfileInput } from '../types';

const ROLE_LABELS: Record<PrimaryRole, string> = {
  BUILDER: 'Builder',
  DESIGNER: 'Designer',
  GROWTH_SALES: 'Growth/Sales',
  BUSINESS_OPERATIONS: 'Business/Operations',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<FounderProfile | null>('/api/profile/me')
      .then((p) => {
        if (active) setProfile(p);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSave(input: ProfileInput) {
    const updated = await api.put<FounderProfile>('/api/profile', input);
    setProfile(updated);
    setEditing(false);
  }

  if (loading) {
    return (
      <div className="page">
        <p className="placeholder">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Profile</h1>
        <div className="queue-state">
          <p>You haven't created your founder profile yet.</p>
          <p className="placeholder">
            Your profile — skills, role, interests, availability — is what the matchmaking uses
            to build your team. It's required before you can join the queue.
          </p>
          <p>
            <Link to="/create-profile">Create your profile</Link>
          </p>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="page">
        <h1>Edit profile</h1>
        <ProfileForm initial={profile} submitLabel="Save changes" onSubmit={handleSave} />
        <button type="button" onClick={() => setEditing(false)} className="link-button">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{profile.name}</h1>
      <dl className="profile-view">
        <dt>City</dt>
        <dd>{profile.city}</dd>
        <dt>Timezone</dt>
        <dd>{profile.timezone}</dd>
        <dt>Languages</dt>
        <dd>{profile.languages.join(', ')}</dd>
        <dt>Primary role</dt>
        <dd>{ROLE_LABELS[profile.primaryRole]}</dd>
        <dt>Skills</dt>
        <dd>{profile.skills.join(', ')}</dd>
        <dt>Industry interests</dt>
        <dd>{profile.industryInterests.join(', ')}</dd>
        <dt>Availability</dt>
        <dd>{profile.availabilityHoursPerWeek} h/week</dd>
        {profile.bio && (
          <>
            <dt>Bio</dt>
            <dd>{profile.bio}</dd>
          </>
        )}
      </dl>
      <button type="button" onClick={() => setEditing(true)}>
        Edit profile
      </button>
    </div>
  );
}
