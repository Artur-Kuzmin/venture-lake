import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler } from './middleware/errorHandler.js';
import { sendData } from './lib/response.js';
import { expireOverdueMissions } from './services/missionExpiry.js';
import { expireOverdueReviewAssignments } from './services/reviewExpiry.js';
import { expireAppealWindows } from './services/appealExpiry.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import queueRoutes from './routes/queue.js';
import matchmakingRoutes from './routes/matchmaking.js';
import partyRoutes from './routes/party.js';
import teamsRoutes from './routes/teams.js';
import missionIdeasRoutes from './routes/missionIdeas.js';
import missionsRoutes from './routes/missions.js';
import vcRoutes from './routes/vc.js';
import appealsRoutes from './routes/appeals.js';
import showcaseRoutes from './routes/showcase.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Behind a proxy/load balancer, trust the first hop so req.ip (used by the auth
// rate limiter) reflects the real client. Opt-in to avoid spoofable IPs in dev.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Baseline security headers (safe defaults for a JSON API).
app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
if ((!corsOrigin || corsOrigin.length === 0) && process.env.NODE_ENV === 'production') {
  console.warn(
    '[cors] CORS_ORIGIN is not set — allowing all origins. Set CORS_ORIGIN to your frontend origin in production.'
  );
}
app.use(cors({ origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true }));
// Cap request bodies to a sane size; the app only sends small JSON payloads.
app.use(express.json({ limit: '1mb' }));

// Health check.
app.get('/health', (_req, res) => {
  sendData(res, { status: 'ok', service: 'venturelake-backend' });
});

// Mount route modules. Business logic is filled in by later phases.
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/party', partyRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/mission-ideas', missionIdeasRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/vc', vcRoutes);
// Review appeals: /api/submissions/:id/appeal/start and /api/appeals/:id/vote.
app.use('/api', appealsRoutes);
app.use('/api/showcase', showcaseRoutes);
app.use('/api/admin', adminRoutes);

// Centralized error handler — must be registered last.
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[venturelake-backend] listening on http://localhost:${port}`);
});

// Background jobs: auto-fail overdue missions, expire overdue VC reviews, and
// finalize reviews whose appeal window or appeal vote has lapsed.
// Enabled by default (so local dev runs them); set RUN_BACKGROUND_JOBS=false to
// disable on extra instances when horizontally scaling, leaving exactly one
// process (or a dedicated worker) responsible for them.
const EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
const backgroundJobsEnabled = process.env.RUN_BACKGROUND_JOBS !== 'false';
if (backgroundJobsEnabled) {
  console.log('[venturelake-backend] background expiry jobs ENABLED');
  setInterval(() => {
    expireOverdueMissions().catch((err) => console.error('[missionExpiry]', err));
    expireOverdueReviewAssignments().catch((err) => console.error('[reviewExpiry]', err));
    expireAppealWindows().catch((err) => console.error('[appealExpiry]', err));
  }, EXPIRY_INTERVAL_MS);
} else {
  console.log('[venturelake-backend] background expiry jobs DISABLED (RUN_BACKGROUND_JOBS=false)');
}

export default app;
