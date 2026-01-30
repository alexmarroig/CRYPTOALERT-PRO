import { Router } from 'express';
import { billingStatus, createCheckout, webhook } from '../../controllers/billingController.js';
import { requireAuth } from '../../middleware/auth.js';

export const billingRoutes = Router();

billingRoutes.post('/checkout', requireAuth, createCheckout);
billingRoutes.get('/status', requireAuth, billingStatus);
billingRoutes.post('/webhook', webhook);
