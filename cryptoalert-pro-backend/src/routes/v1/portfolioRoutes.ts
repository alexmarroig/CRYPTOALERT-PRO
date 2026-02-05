import { Router } from 'express';
import {
  connectPortfolio,
  getMyPortfolio,
  getPortfolioComposition,
  getPortfolioGoalsAlerts,
  getPortfolioPerformance,
  getPortfolioReconciliation,
  getPublicPortfolio,
  syncPortfolio,
  testPortfolioConnection,
  updatePortfolioVisibility,
  upsertPortfolioGoalsAlerts
} from '../../controllers/portfolioController.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';

export const portfolioRoutes = Router();

portfolioRoutes.post('/connect', requireAuth, connectPortfolio);
portfolioRoutes.post('/test-connection', requireAuth, testPortfolioConnection);
portfolioRoutes.post('/sync', requireAuth, syncPortfolio);
portfolioRoutes.get('/me', requireAuth, getMyPortfolio);
portfolioRoutes.get('/performance', requireAuth, getPortfolioPerformance);
portfolioRoutes.get('/composition', requireAuth, getPortfolioComposition);
portfolioRoutes.get('/reconciliation', requireAuth, getPortfolioReconciliation);
portfolioRoutes.get('/goals-alerts', requireAuth, getPortfolioGoalsAlerts);
portfolioRoutes.put('/goals-alerts', requireAuth, upsertPortfolioGoalsAlerts);
portfolioRoutes.patch('/visibility', requireAuth, updatePortfolioVisibility);
portfolioRoutes.get('/public/:username', optionalAuth, getPublicPortfolio);
