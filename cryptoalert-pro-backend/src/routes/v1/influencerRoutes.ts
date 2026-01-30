import { Router } from 'express';
import { getInfluencerMetrics } from '../../controllers/influencerController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';

export const influencerRoutes = Router();

influencerRoutes.get('/metrics/me', requireAuth, requireRole('influencer', 'admin'), getInfluencerMetrics);
