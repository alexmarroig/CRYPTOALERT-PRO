import { Router } from 'express';
import { connectPortfolio, getMyPortfolio, getPublicPortfolio, syncPortfolio, testPortfolioConnection, updatePortfolioVisibility } from '../../controllers/portfolioController.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';

export const portfolioRoutes = Router();

portfolioRoutes.post('/connect', requireAuth, connectPortfolio);
portfolioRoutes.post('/test-connection', requireAuth, testPortfolioConnection);
portfolioRoutes.post('/sync', requireAuth, syncPortfolio);
portfolioRoutes.get('/me', requireAuth, getMyPortfolio);
portfolioRoutes.patch('/visibility', requireAuth, updatePortfolioVisibility);
portfolioRoutes.get('/public/:username', optionalAuth, getPublicPortfolio);
