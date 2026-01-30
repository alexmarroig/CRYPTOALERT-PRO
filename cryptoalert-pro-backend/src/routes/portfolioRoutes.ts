import { Router } from 'express';
import {
  getPortfolio,
  getPortfolioPnLComparison,
  syncPortfolio,
  updateManualPortfolio
} from '../controllers/portfolioController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateApiKey } from '../middleware/validateApiKey.js';

export const portfolioRoutes = Router();

portfolioRoutes.post('/sync', requireAuth, validateApiKey, syncPortfolio);

portfolioRoutes.get('/', requireAuth, getPortfolio);

portfolioRoutes.get('/pnl', requireAuth, getPortfolioPnLComparison);

portfolioRoutes.post('/manual', requireAuth, updateManualPortfolio);
