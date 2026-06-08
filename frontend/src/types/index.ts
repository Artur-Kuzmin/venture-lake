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

export type QueueStatus = 'QUEUED' | 'MATCHED' | 'COOLDOWN' | 'CANCELLED';

export interface QueueEntry {
  id: string;
  userId: string;
  partyId: string | null;
  status: QueueStatus;
  queuedAt: string;
  matchedAt: string | null;
  cooldownUntil: string | null;
}

// Returned by GET /api/queue/me.
export interface QueueMe {
  entry: QueueEntry | null;
  cooldownUntil: string | null;
  // Set once the user has been matched into a team (redirect target).
  matchedTeamId: string | null;
}

// Returned by GET /api/queue/status.
export interface QueuePoolStats {
  queuedCount: number;
}

export type PartyStatus = 'FORMING' | 'QUEUED' | 'MATCHED' | 'CANCELLED';

export interface PartyMemberView {
  userId: string;
  displayName: string;
  isLeader: boolean;
}

// Returned by the /api/party endpoints (null when the caller has no party).
export interface Party {
  id: string;
  leaderId: string;
  status: PartyStatus;
  createdAt: string;
  inviteCode: string;
  isLeader: boolean;
  members: PartyMemberView[];
}

export interface TeamMemberView {
  userId: string;
  displayName: string;
  ready: boolean;
  isCaptain: boolean;
  joinedAt: string;
}

export type IdeaVoteValue = 'YES' | 'NO';
export type MissionIdeaStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';

export interface IdeaVoteView {
  userId: string;
  displayName: string;
  vote: IdeaVoteValue;
  rejectReason: string | null;
  feedbackNote: string | null;
}

export interface MissionIdeaView {
  id: string;
  title: string;
  description: string;
  category: string;
  reasoning: string;
  status: MissionIdeaStatus;
  generationNumber: number;
  createdAt: string;
  votes: IdeaVoteView[];
}

// Returned by GET /api/teams/:id.
export interface TeamDetail {
  id: string;
  status: TeamStatus;
  captainId: string | null;
  matchExplanation: string | null;
  missionStartedAt: string | null;
  missionDeadlineAt: string | null;
  currentUserId: string;
  members: TeamMemberView[];
  currentIdea: MissionIdeaView | null;
  rejectedIdeaCount: number;
}

export interface TeamMessageView {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
}

// Standard API envelopes (Foundation Bible, Section 4.5).
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
