import { Router } from 'express';
import { createBulkAlerts, getExpertDashboard, updateExpertProfile } from '../../controllers/expertController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';

export const expertRoutes = Router();

expertRoutes.get('/expert/dashboard/me', requireAuth, requireRole('influencer', 'admin'), getExpertDashboard);
expertRoutes.patch('/expert/profile', requireAuth, requireRole('influencer', 'admin'), updateExpertProfile);
expertRoutes.post('/expert/alerts/bulk', requireAuth, requireRole('influencer', 'admin'), createBulkAlerts);
