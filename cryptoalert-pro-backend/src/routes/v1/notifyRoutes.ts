import { Router } from 'express';
import { registerPushToken, testNotification } from '../../controllers/notifyController.js';
import { requireAuth } from '../../middleware/auth.js';

export const notifyRoutes = Router();

notifyRoutes.post('/notify/test', requireAuth, testNotification);
notifyRoutes.post('/push/register', requireAuth, registerPushToken);
