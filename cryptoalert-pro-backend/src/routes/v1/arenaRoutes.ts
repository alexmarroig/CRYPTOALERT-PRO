import { Router } from 'express';
import { TradingArenaController } from '../../controllers/tradingArenaController.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
const controller = new TradingArenaController();

router.get('/ranking', controller.getRanking);
router.get('/strategies', controller.getStrategies);
router.get('/news-impact', controller.getNewsImpact);

// Paper trading individual
router.post('/paper-order', requireAuth, controller.placePaperOrder);

export default router;
