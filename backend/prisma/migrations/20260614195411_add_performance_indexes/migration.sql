-- CreateIndex
CREATE INDEX "DeliverableAssignment_missionId_idx" ON "DeliverableAssignment"("missionId");

-- CreateIndex
CREATE INDEX "Mission_teamId_idx" ON "Mission"("teamId");

-- CreateIndex
CREATE INDEX "Mission_status_deadlineAt_idx" ON "Mission"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "MissionIdea_teamId_idx" ON "MissionIdea"("teamId");

-- CreateIndex
CREATE INDEX "MissionSubmission_teamId_idx" ON "MissionSubmission"("teamId");

-- CreateIndex
CREATE INDEX "MissionSubmission_status_idx" ON "MissionSubmission"("status");

-- CreateIndex
CREATE INDEX "ReviewAppeal_submissionId_idx" ON "ReviewAppeal"("submissionId");

-- CreateIndex
CREATE INDEX "ReviewAppeal_status_expiresAt_idx" ON "ReviewAppeal"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ShowcaseProject_isPublic_publishedAt_idx" ON "ShowcaseProject"("isPublic", "publishedAt");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "VCReview_submissionId_idx" ON "VCReview"("submissionId");
