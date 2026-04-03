import { Router } from 'express';
import { executeSimulatedTrade, initiateSimulatedTransfer } from '../../services/simulation/simulationService.js';
import { executeArbitrage } from '../../services/simulation/arbitrageSimulator.js';
import { analyzeNewsSentiment } from '../../services/intelligence/sentimentAnalysisService.js';
import { calculateOptimalPortfolio } from '../../services/intelligence/economicTheoryService.js';
import { supabaseAdmin } from '../../config/supabase.js';

const router = Router();

// 1. Get Simulation Stats
router.get('/stats', async (req, res) => {
    const userId = (req as any).user.id;
    const { data, error } = await supabaseAdmin.from('simulation_stats').select('*').eq('user_id', userId).single();
    if (error) return res.status(500).json({ error: 'Could not fetch simulation stats' });
    res.json(data);
});

// 2. Execute Simulated Trade
router.post('/trade', async (req, res) => {
    const userId = (req as any).user.id;
    const { exchangeId, symbol, side, amount, price } = req.body;
    try {
        const result = await executeSimulatedTrade(userId, exchangeId, symbol, side, amount, price);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// 3. Detect and Execute Arbitrage
router.post('/arbitrage', async (req, res) => {
    const userId = (req as any).user.id;
    const { symbol } = req.body;
    const result = await executeArbitrage(userId, symbol);
    res.json(result);
});

// 4. Intelligence: News Sentiment
router.get('/intelligence/sentiment', async (req, res) => {
    const result = await analyzeNewsSentiment();
    res.json(result);
});

// 5. Intelligence: Portfolio Optimization
router.post('/intelligence/optimize', async (req, res) => {
    const { assets } = req.body; // Array of { symbol, expectedReturn, volatility }
    const result = calculateOptimalPortfolio(assets);
    res.json(result);
});

// 6. Transfer virtual funds
router.post('/transfer', async (req, res) => {
    const userId = (req as any).user.id;
    const { fromExchange, toExchange, asset, amount } = req.body;
    try {
        const result = await initiateSimulatedTransfer(userId, fromExchange, toExchange, asset, amount);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

export default router;
