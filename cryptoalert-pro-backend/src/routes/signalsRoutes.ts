import { Router } from 'express';
import { copySignal, createSignal, getSignal, getSignals } from '../controllers/signalsController.js';
import { requireAuth, requireInfluencer } from '../middleware/auth.js';

export const signalsRoutes = Router();

signalsRoutes.post('/', requireAuth, requireInfluencer, createSignal);

signalsRoutes.get('/', getSignals);

signalsRoutes.get('/:id', getSignal);

signalsRoutes.post('/:id/copy', requireAuth, copySignal);
