import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../lib/apiClient';
import type { FounderProfile, PrimaryRole, ProfileInput } from '../types';

// Controlled lists from the Foundation Bible, Section 5.
const PRIMARY_ROLE_OPTIONS: { value: PrimaryRole; label: string }[] = [
  { value: 'BUILDER', label: 'Builder' },
  { value: 'DESIGNER', label: 'Designer' },
  { value: 'GROWTH_SALES', label: 'Growth/Sales' },
  { value: 'BUSINESS_OPERATIONS', label: 'Business/Operations' },
];

const SKILLS = [
  'Frontend development',
  'Backend development',
  'No-code building',
  'UI/UX design',
  'Branding',
  'Sales',
  'Marketing',
  'Content creation',
  'Community building',
  'Finance',
  'Pitching',
  'Market research',
  'Operations',
  'Product management',
  'Data/AI',
];

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Shared form for creating and editing a founder profile. The parent supplies
// onSubmit, which performs the actual API call (POST or PUT) and navigation.
export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: FounderProfile | null;
  submitLabel: string;
  onSubmit: (input: ProfileInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? '');
  const [languages, setLanguages] = useState((initial?.languages ?? []).join(', '));
  const [primaryRole, setPrimaryRole] = useState<PrimaryRole>(initial?.primaryRole ?? 'BUILDER');
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [industryInterests, setIndustryInterests] = useState(
    (initial?.industryInterests ?? []).join(', ')
  );
  const [availability, setAvailability] = useState(
    initial?.availabilityHoursPerWeek != null ? String(initial.availabilityHoursPerWeek) : ''
  );
  const [bio, setBio] = useState(initial?.bio ?? '');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleSkill(skill: string) {
    setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        city: city.trim(),
        timezone: timezone.trim(),
        languages: splitList(languages),
        primaryRole,
        skills,
        industryInterests: splitList(industryInterests),
        availabilityHoursPerWeek: Number(availability),
        bio: bio.trim(),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="profile-form">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label>
        City
        <input value={city} onChange={(e) => setCity(e.target.value)} required />
      </label>

      <label>
        Timezone
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="e.g. Europe/Berlin"
          required
        />
      </label>

      <label>
        Languages (comma-separated)
        <input
          value={languages}
          onChange={(e) => setLanguages(e.target.value)}
          placeholder="e.g. English, German"
          required
        />
      </label>

      <label>
        Primary role
        <select value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value as PrimaryRole)}>
          {PRIMARY_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Skills</legend>
        <div className="checkbox-grid">
          {SKILLS.map((skill) => (
            <label key={skill} className="checkbox-row">
              <input
                type="checkbox"
                checked={skills.includes(skill)}
                onChange={() => toggleSkill(skill)}
              />
              {skill}
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        Industry interests (comma-separated)
        <input
          value={industryInterests}
          onChange={(e) => setIndustryInterests(e.target.value)}
          placeholder="e.g. Fintech, Climate"
          required
        />
      </label>

      <label>
        Availability (hours per week)
        <input
          type="number"
          min={0}
          max={168}
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          required
        />
      </label>

      <label>
        Bio
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

export default ProfileForm;
