import { Router } from 'express';
import { createInfluencerInvite, getIncidentsPanel, listInfluencers, listInvites, revokeInfluencerInvite } from '../../controllers/adminController.js';
import {
  analyzeOpsAnomalies,
  createOpsEvent,
  getOpsIncidents,
  ingestOpsTelemetry,
  submitIncidentFeedback
} from '../../controllers/opsController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';
import { invitesRateLimit } from '../../middleware/rateLimit.js';

export const adminRoutes = Router();

adminRoutes.post('/invites', invitesRateLimit, requireAuth, requireRole('admin'), createInfluencerInvite);
adminRoutes.get('/invites', invitesRateLimit, requireAuth, requireRole('admin'), listInvites);
adminRoutes.post('/invites/:id/revoke', invitesRateLimit, requireAuth, requireRole('admin'), revokeInfluencerInvite);
adminRoutes.get('/influencers', requireAuth, requireRole('admin'), listInfluencers);

adminRoutes.post('/ops/telemetry', requireAuth, requireRole('admin'), ingestOpsTelemetry);
adminRoutes.post('/ops/events', requireAuth, requireRole('admin'), createOpsEvent);
adminRoutes.post('/ops/analyze', requireAuth, requireRole('admin'), analyzeOpsAnomalies);
adminRoutes.get('/ops/incidents', requireAuth, requireRole('admin'), getOpsIncidents);
adminRoutes.post('/ops/incidents/:id/feedback', requireAuth, requireRole('admin'), submitIncidentFeedback);
adminRoutes.get('/incidents', requireAuth, requireRole('admin'), getIncidentsPanel);
