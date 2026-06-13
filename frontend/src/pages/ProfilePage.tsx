import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuth } from '../lib/authContext';
import { ProfileForm } from '../components/ProfileForm';
import { Loading } from '../components/Loading';
import type { FounderProfile, PrimaryRole, ProfileInput } from '../types';

const ROLE_LABELS: Record<PrimaryRole, string> = {
  BUILDER: 'Builder',
  DESIGNER: 'Designer',
  GROWTH_SALES: 'Growth/Sales',
  BUSINESS_OPERATIONS: 'Business/Operations',
};

export default function ProfilePage() {
  const { isVc, isAdmin } = useAuth();
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
        <Loading />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Profile</h1>
        <div className="queue-state">
          <p>You haven't created your Founder Signal yet.</p>
          <p className="placeholder">
            Your profile — skills, role, interests, availability — is what the matchmaking uses to
            build your team. It's required before you can join the queue.
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
        <span className="home-eyebrow">Founder signal</span>
        <h1>Edit your profile</h1>
        <p className="placeholder profile-intro">
          This is what powers how you're matched into a team. Keep it sharp.
        </p>
        <ProfileForm initial={profile} submitLabel="Save changes" onSubmit={handleSave} />
        <p>
          <button type="button" onClick={() => setEditing(false)} className="link-button">
            Cancel
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="profile-head">
        <div>
          <span className="home-eyebrow">Founder signal</span>
          <h1>{profile.name}</h1>
          <p className="placeholder">
            {ROLE_LABELS[profile.primaryRole]} · {profile.city} · {profile.timezone}
          </p>
          {(isVc || isAdmin) && (
            <div className="profile-status">
              {isVc && <span className="status status--success">Approved VC reviewer</span>}
              {isAdmin && <span className="status status--info">Admin</span>}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setEditing(true)}>
          Edit profile
        </button>
      </div>

      <div className="profile-cards">
        <section className="queue-state">
          <h2>Role &amp; skills</h2>
          <p className="placeholder">Primary role</p>
          <p>
            <strong>{ROLE_LABELS[profile.primaryRole]}</strong>
          </p>
          {profile.skills.length > 0 && (
            <div className="tag-row">
              {profile.skills.map((s) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="queue-state">
          <h2>Availability</h2>
          <p>
            <strong>{profile.availabilityHoursPerWeek} h</strong> / week
          </p>
          <p className="placeholder">Timezone · {profile.timezone}</p>
          {profile.languages.length > 0 && (
            <div className="tag-row">
              {profile.languages.map((l) => (
                <span className="tag" key={l}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="queue-state">
          <h2>Industry interests</h2>
          {profile.industryInterests.length > 0 ? (
            <div className="tag-row">
              {profile.industryInterests.map((i) => (
                <span className="tag" key={i}>
                  {i}
                </span>
              ))}
            </div>
          ) : (
            <p className="placeholder">None listed.</p>
          )}
        </section>

        {profile.bio && (
          <section className="queue-state">
            <h2>Bio</h2>
            <p>{profile.bio}</p>
          </section>
        )}
      </div>
    </div>
  );
}
