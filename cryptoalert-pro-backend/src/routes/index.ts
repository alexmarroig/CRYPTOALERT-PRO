import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { signalsRoutes } from './signalsRoutes.js';
import { portfolioRoutes } from './portfolioRoutes.js';
import { paymentsRoutes } from './paymentsRoutes.js';
import { influencerRoutes } from './influencerRoutes.js';
import { feedRoutes } from './feedRoutes.js';

export const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/signals', signalsRoutes);
apiRoutes.use('/portfolio', portfolioRoutes);
apiRoutes.use('/payments', paymentsRoutes);
apiRoutes.use('/influencer', influencerRoutes);
apiRoutes.use('/feed', feedRoutes);
