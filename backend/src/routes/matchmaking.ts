import { Router } from 'express';

import { sendData } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { tryMatchQueue } from '../services/matchmakingEngine.js';

// Manual matchmaking trigger (Foundation Bible, Phase 3.1). Automatic triggering
// on queue join is added in Phase 3.2; this endpoint is for dev/admin runs.
const router = Router();

// POST /api/matchmaking/run — form as many teams as possible from the queue.
router.post(
  '/run',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await tryMatchQueue();
    sendData(res, result);
  })
);

export default router;
