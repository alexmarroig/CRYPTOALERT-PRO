import { Router } from 'express';
import { getEarnings, getStats, requestPayout } from '../controllers/influencerController.js';
import { requireAuth, requireInfluencer } from '../middleware/auth.js';

export const influencerRoutes = Router();

influencerRoutes.get('/earnings', requireAuth, requireInfluencer, getEarnings);

influencerRoutes.post('/payout', requireAuth, requireInfluencer, requestPayout);

influencerRoutes.get('/stats', requireAuth, requireInfluencer, getStats);
