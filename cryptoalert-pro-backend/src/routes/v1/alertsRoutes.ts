import { Router } from 'express';
import { createAlert, listAlerts, updateAlertStatus } from '../../controllers/alertsController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';

export const alertsRoutes = Router();

alertsRoutes.get('/', listAlerts);
alertsRoutes.post('/', requireAuth, requireRole('influencer', 'admin'), createAlert);
alertsRoutes.patch('/:id/status', requireAuth, requireRole('influencer', 'admin'), updateAlertStatus);
