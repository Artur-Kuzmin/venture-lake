-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PrimaryRole" AS ENUM ('BUILDER', 'DESIGNER', 'GROWTH_SALES', 'BUSINESS_OPERATIONS');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('QUEUED', 'MATCHED', 'COOLDOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('FORMING', 'QUEUED', 'MATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('LOBBY', 'IDEA_VOTING', 'CAPTAIN_VOTING', 'MISSION_ACTIVE', 'SUBMITTED', 'UNDER_REVIEW', 'APPEAL_WINDOW', 'REVIEW_FINAL', 'CONTINUATION_VOTING', 'CONTINUING', 'PIVOTING', 'PUBLISHED', 'DISBANDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MissionIdeaStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdeaVoteValue" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'FAILED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'FINAL');

-- CreateEnum
CREATE TYPE "VCAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'PASSED');

-- CreateEnum
CREATE TYPE "VCReviewStatus" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "ReviewAppealStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppealVoteValue" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "ContinuationChoice" AS ENUM ('CONTINUE', 'PIVOT', 'PUBLISH_END', 'DISBAND_PRIVATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "languages" TEXT[],
    "primaryRole" "PrimaryRole" NOT NULL,
    "skills" TEXT[],
    "industryInterests" TEXT[],
    "availabilityHoursPerWeek" INTEGER NOT NULL,
    "bio" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partyId" TEXT,
    "status" "QueueStatus" NOT NULL DEFAULT 'QUEUED',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "status" "PartyStatus" NOT NULL DEFAULT 'FORMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMember" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'LOBBY',
    "captainId" TEXT,
    "matchExplanation" TEXT,
    "missionStartedAt" TIMESTAMP(3),
    "missionDeadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionIdea" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "MissionIdeaStatus" NOT NULL DEFAULT 'PROPOSED',
    "generationNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaVote" (
    "id" TEXT NOT NULL,
    "missionIdeaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "IdeaVoteValue" NOT NULL,
    "rejectReason" TEXT,
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptainNomination" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptainNomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptainVote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptainVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "missionIdeaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL DEFAULT 72,
    "deliverables" JSONB NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableAssignment" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,

    CONSTRAINT "DeliverableAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionSubmission" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "pitchText" TEXT,
    "prototypeUrl" TEXT,
    "landingPageUrl" TEXT,
    "demoUrl" TEXT,
    "files" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "MissionSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VCProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "reviewCooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VCReviewAssignment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "vcUserId" TEXT NOT NULL,
    "status" "VCAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isAppealReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VCReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VCReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "vcUserId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "isAppealReview" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "status" "VCReviewStatus" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VCReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VCReviewCategory" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,

    CONSTRAINT "VCReviewCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAppeal" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "ReviewAppealStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppealVote" (
    "id" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "AppealVoteValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppealVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuationVote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" "ContinuationChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuationVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseProject" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "missionSubmissionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "shortPitch" TEXT NOT NULL,
    "prototypeUrl" TEXT NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ShowcaseProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseAttribution" (
    "id" TEXT NOT NULL,
    "showcaseProjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShowcaseAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FounderProfile_userId_key" ON "FounderProfile"("userId");

-- CreateIndex
CREATE INDEX "QueueEntry_userId_idx" ON "QueueEntry"("userId");

-- CreateIndex
CREATE INDEX "QueueEntry_status_idx" ON "QueueEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMember_partyId_userId_key" ON "PartyMember"("partyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "TeamMessage_teamId_idx" ON "TeamMessage"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVote_missionIdeaId_userId_key" ON "IdeaVote"("missionIdeaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptainNomination_teamId_userId_key" ON "CaptainNomination"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptainVote_teamId_voterId_key" ON "CaptainVote"("teamId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "VCProfile_userId_key" ON "VCProfile"("userId");

-- CreateIndex
CREATE INDEX "VCReviewAssignment_vcUserId_idx" ON "VCReviewAssignment"("vcUserId");

-- CreateIndex
CREATE INDEX "VCReviewAssignment_submissionId_idx" ON "VCReviewAssignment"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AppealVote_appealId_userId_key" ON "AppealVote"("appealId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContinuationVote_teamId_userId_key" ON "ContinuationVote"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseAttribution_showcaseProjectId_userId_key" ON "ShowcaseAttribution"("showcaseProjectId", "userId");

-- AddForeignKey
ALTER TABLE "FounderProfile" ADD CONSTRAINT "FounderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionIdea" ADD CONSTRAINT "MissionIdea_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_missionIdeaId_fkey" FOREIGN KEY ("missionIdeaId") REFERENCES "MissionIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainNomination" ADD CONSTRAINT "CaptainNomination_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainNomination" ADD CONSTRAINT "CaptainNomination_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainVote" ADD CONSTRAINT "CaptainVote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainVote" ADD CONSTRAINT "CaptainVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainVote" ADD CONSTRAINT "CaptainVote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_missionIdeaId_fkey" FOREIGN KEY ("missionIdeaId") REFERENCES "MissionIdea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableAssignment" ADD CONSTRAINT "DeliverableAssignment_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableAssignment" ADD CONSTRAINT "DeliverableAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionSubmission" ADD CONSTRAINT "MissionSubmission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionSubmission" ADD CONSTRAINT "MissionSubmission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionSubmission" ADD CONSTRAINT "MissionSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCProfile" ADD CONSTRAINT "VCProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReviewAssignment" ADD CONSTRAINT "VCReviewAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "MissionSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReviewAssignment" ADD CONSTRAINT "VCReviewAssignment_vcUserId_fkey" FOREIGN KEY ("vcUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReview" ADD CONSTRAINT "VCReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "MissionSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReview" ADD CONSTRAINT "VCReview_vcUserId_fkey" FOREIGN KEY ("vcUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReview" ADD CONSTRAINT "VCReview_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VCReviewAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VCReviewCategory" ADD CONSTRAINT "VCReviewCategory_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "VCReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAppeal" ADD CONSTRAINT "ReviewAppeal_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "MissionSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAppeal" ADD CONSTRAINT "ReviewAppeal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealVote" ADD CONSTRAINT "AppealVote_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "ReviewAppeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealVote" ADD CONSTRAINT "AppealVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuationVote" ADD CONSTRAINT "ContinuationVote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuationVote" ADD CONSTRAINT "ContinuationVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseProject" ADD CONSTRAINT "ShowcaseProject_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseProject" ADD CONSTRAINT "ShowcaseProject_missionSubmissionId_fkey" FOREIGN KEY ("missionSubmissionId") REFERENCES "MissionSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseAttribution" ADD CONSTRAINT "ShowcaseAttribution_showcaseProjectId_fkey" FOREIGN KEY ("showcaseProjectId") REFERENCES "ShowcaseProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseAttribution" ADD CONSTRAINT "ShowcaseAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

