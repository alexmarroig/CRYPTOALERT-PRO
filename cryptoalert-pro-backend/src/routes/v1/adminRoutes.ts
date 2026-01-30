import { Router } from 'express';
import { createInfluencerInvite, listInfluencers, listInvites, revokeInfluencerInvite } from '../../controllers/adminController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';

export const adminRoutes = Router();

adminRoutes.post('/invites', requireAuth, requireRole('admin'), createInfluencerInvite);
adminRoutes.get('/invites', requireAuth, requireRole('admin'), listInvites);
adminRoutes.post('/invites/:id/revoke', requireAuth, requireRole('admin'), revokeInfluencerInvite);
adminRoutes.get('/influencers', requireAuth, requireRole('admin'), listInfluencers);
