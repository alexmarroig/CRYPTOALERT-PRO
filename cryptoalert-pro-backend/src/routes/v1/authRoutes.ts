import { Router } from 'express';
import { acceptInfluencerInvite } from '../../controllers/authController.js';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rateLimit.js';

export const authRoutes = Router();

authRoutes.post('/accept-invite', authRateLimit, requireAuth, acceptInfluencerInvite);
