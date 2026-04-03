import { logger } from '../../utils/logger.js';

interface AssetData {
    symbol: string;
    expectedReturn: number;
    volatility: number;
    weight?: number;
}

/**
 * Modern Portfolio Theory (MPT) - Simplified Implementation
 * Aiming for Mean-Variance Optimization
 */
export function calculateOptimalPortfolio(assets: AssetData[], targetRisk?: number) {
    logger.info('Optimizing portfolio using MPT');

    // Basic allocation: Equal weight as baseline
    const totalReturn = assets.reduce((sum, a) => sum + a.expectedReturn, 0);
    const avgReturn = totalReturn / assets.length;

    // Inverse volatility weighting: allocate more to less volatile assets
    const totalInverseVol = assets.reduce((sum, a) => sum + (1 / a.volatility), 0);

    const optimized = assets.map(asset => ({
        ...asset,
        weight: (1 / asset.volatility) / totalInverseVol
    }));

    return optimized;
}

export function calculateKellyCriterion(winRate: number, profitRatio: number) {
    // k = (p * (b + 1) - 1) / b
    // p = win rate, b = profit / loss ratio
    const kelly = (winRate * (profitRatio + 1) - 1) / profitRatio;
    return Math.max(0, kelly); // Avoid negative bets
}

export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02) {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.map(x => (x - meanReturn) ** 2).reduce((a, b) => a + b, 0) / returns.length);

    return (meanReturn - riskFreeRate) / stdDev;
}
