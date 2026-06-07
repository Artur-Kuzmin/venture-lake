import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { errorHandler } from './middleware/errorHandler.js';
import { sendData } from './lib/response.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import queueRoutes from './routes/queue.js';
import matchmakingRoutes from './routes/matchmaking.js';
import partyRoutes from './routes/party.js';
import teamsRoutes from './routes/teams.js';
import missionsRoutes from './routes/missions.js';
import vcRoutes from './routes/vc.js';
import showcaseRoutes from './routes/showcase.js';
import adminRoutes from './routes/admin.js';

const app = express();

const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
app.use(cors({ origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true }));
app.use(express.json());

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
app.use('/api/missions', missionsRoutes);
app.use('/api/vc', vcRoutes);
app.use('/api/showcase', showcaseRoutes);
app.use('/api/admin', adminRoutes);

// Centralized error handler — must be registered last.
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[venturelake-backend] listening on http://localhost:${port}`);
});

export default app;
