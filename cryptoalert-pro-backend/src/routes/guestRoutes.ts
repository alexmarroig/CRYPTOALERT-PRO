import { Router } from 'express';
import { getGuestOverview, getGuestPortfolio, getGuestSignals } from '../controllers/guestController.js';

export const guestRoutes = Router();

guestRoutes.get('/overview', getGuestOverview);
guestRoutes.get('/signals', getGuestSignals);
guestRoutes.get('/portfolio', getGuestPortfolio);
