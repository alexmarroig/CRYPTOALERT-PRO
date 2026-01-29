import { Router } from 'express';
import { createCheckout, createPortal, webhook } from '../controllers/paymentsController.js';
import { requireAuth } from '../middleware/auth.js';

export const paymentsRoutes = Router();

paymentsRoutes.post('/create-checkout', requireAuth, createCheckout);

paymentsRoutes.get('/portal', requireAuth, createPortal);

paymentsRoutes.post('/webhook', webhook);
