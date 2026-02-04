import { Router } from 'express';
import { createInfluencerInvite, listInfluencers, listInvites, revokeInfluencerInvite } from '../../controllers/adminController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';
import { invitesRateLimit } from '../../middleware/rateLimit.js';

export const adminRoutes = Router();

adminRoutes.post('/invites', invitesRateLimit, requireAuth, requireRole('admin'), createInfluencerInvite);
adminRoutes.get('/invites', invitesRateLimit, requireAuth, requireRole('admin'), listInvites);
adminRoutes.post('/invites/:id/revoke', invitesRateLimit, requireAuth, requireRole('admin'), revokeInfluencerInvite);
adminRoutes.get('/influencers', requireAuth, requireRole('admin'), listInfluencers);
