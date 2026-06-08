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

export interface CaptainNomineeView {
  userId: string;
  displayName: string;
  votes: number;
}

// Returned by the /api/teams/:id/captain* endpoints.
export interface CaptainVoteState {
  teamStatus: TeamStatus;
  captainId: string | null;
  memberCount: number;
  majorityNeeded: number;
  nominees: CaptainNomineeView[];
  myNomination: boolean;
  myVote: string | null;
}

export interface DeliverableView {
  title: string;
  description: string;
}

export interface DeliverableAssignmentView {
  title: string;
  description: string;
  assignedToId: string;
  assignedToName: string;
}

export interface MissionDraft {
  id: string;
  title: string;
  brief: string;
  durationHours: number;
  deliverables: DeliverableView[];
  assignments: DeliverableAssignmentView[];
}

export interface SubmissionView {
  id: string;
  summary: string;
  pitchText: string | null;
  prototypeUrl: string | null;
  demoUrl: string | null;
  landingPageUrl: string | null;
  links: string[];
  notes: string | null;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'FINAL';
  submittedByName: string;
  submittedAt: string;
  reviewDelayed: boolean;
}

export interface TeamReviewCategory {
  category: string;
  score: number;
  feedback: string;
}

// A completed VC review shown privately to the team.
export interface TeamReviewView {
  vcName: string;
  isAppealReview: boolean;
  overallScore: number;
  status: 'VALID' | 'INVALID';
  createdAt: string;
  categories: TeamReviewCategory[];
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
  mission: MissionDraft | null;
  submission: SubmissionView | null;
  reviews: TeamReviewView[];
  appealWindowExpiresAt: string | null;
  reviewFinal: boolean;
  finalScore: number | null;
}

export interface TeamMessageView {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
}

// Returned by GET /api/vc/me.
export interface VCMe {
  approved: boolean;
  approvedAt: string | null;
  reviewCooldownUntil: string | null;
}

export type VCAssignmentStatus = 'ASSIGNED' | 'ACCEPTED' | 'COMPLETED' | 'EXPIRED' | 'PASSED';

// Anonymized review assignment (GET /api/vc/current-assignment, queue/enter).
// Contains NO team or member identities.
export interface VCAssignmentView {
  assignmentId: string;
  status: VCAssignmentStatus;
  deadlineAt: string | null;
  isAppealReview: boolean;
  missionTitle: string;
  missionBrief: string;
  deliverables: { title: string; description: string }[];
  submission: {
    summary: string;
    pitchText: string | null;
    prototypeUrl: string | null;
    demoUrl: string | null;
    landingPageUrl: string | null;
    links: string[];
    notes: string | null;
  };
}

// Standard API envelopes (Foundation Bible, Section 4.5).
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
