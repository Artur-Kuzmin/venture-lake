// Shared TS types mirrored from the backend Prisma models.
// The frontend imports these rather than redefining shapes. Extend as later
// phases need more models; keep them in sync with backend/prisma/schema.prisma.

export type PrimaryRole =
  | 'BUILDER'
  | 'DESIGNER'
  | 'GROWTH_SALES'
  | 'BUSINESS_OPERATIONS';

export type TeamStatus =
  | 'LOBBY'
  | 'IDEA_VOTING'
  | 'CAPTAIN_VOTING'
  | 'MISSION_ACTIVE'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPEAL_WINDOW'
  | 'REVIEW_FINAL'
  | 'CONTINUATION_VOTING'
  | 'CONTINUING'
  | 'PIVOTING'
  | 'PUBLISHED'
  | 'DISBANDED'
  | 'FAILED';

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FounderProfile {
  id: string;
  userId: string;
  name: string;
  city: string;
  timezone: string;
  languages: string[];
  primaryRole: PrimaryRole;
  skills: string[];
  industryInterests: string[];
  availabilityHoursPerWeek: number;
  bio: string;
  createdAt: string;
  updatedAt: string;
}

// Payload sent to POST/PUT /api/profile.
export interface ProfileInput {
  name: string;
  city: string;
  timezone: string;
  languages: string[];
  primaryRole: PrimaryRole;
  skills: string[];
  industryInterests: string[];
  availabilityHoursPerWeek: number;
  bio: string;
}

// Returned by POST /api/auth/signup and POST /api/auth/login.
export interface AuthResponse {
  token: string;
  user: User;
}

// Standard API envelopes (Foundation Bible, Section 4.5).
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
