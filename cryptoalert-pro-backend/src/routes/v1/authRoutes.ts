import { Router } from 'express';
import { acceptInfluencerInvite } from '../../controllers/authController.js';
import { requireAuth } from '../../middleware/auth.js';

export const authRoutes = Router();

authRoutes.post('/accept-invite', requireAuth, acceptInfluencerInvite);
