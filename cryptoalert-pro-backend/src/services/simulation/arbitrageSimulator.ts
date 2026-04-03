import ccxt from 'ccxt';
import { executeSimulatedTrade, initiateSimulatedTransfer } from './simulationService.js';
import { logger } from '../../utils/logger.js';

const binance = new ccxt.binance();
const okx = new ccxt.okx();

export async function detectArbitrageOpportunities(symbol: string = 'BTC/USDT') {
    try {
        const binanceTicker = await binance.fetchTicker(symbol);
        const okxTicker = await okx.fetchTicker(symbol);

        const binancePrice = binanceTicker.last!;
        const okxPrice = okxTicker.last!;

        const diff = Math.abs(binancePrice - okxPrice);
        const spreadPct = (diff / Math.min(binancePrice, okxPrice)) * 100;

        if (spreadPct > 0.5) { // 0.5% spread threshold
            logger.info(`Arbitrage detected for ${symbol}: ${spreadPct.toFixed(2)}% spread!`);
            return {
                symbol,
                binancePrice,
                okxPrice,
                spreadPct,
                profitable: spreadPct > 0.2 // basic threshold for fee/transfer considerations
            };
        }
    } catch (error) {
        logger.error('Error in arbitrage detection', error);
    }
    return null;
}

export async function executeArbitrage(userId: string, symbol: string) {
    const opportunity = await detectArbitrageOpportunities(symbol);
    if (!opportunity || !opportunity.profitable) return null;

    const { binancePrice, okxPrice } = opportunity;
    const amount = 0.01; // example small amount

    if (binancePrice < okxPrice) {
        // Buy on Binance, Sell on OKX
        await executeSimulatedTrade(userId, 'binance_sim', symbol, 'buy', amount, binancePrice);
        await executeSimulatedTrade(userId, 'okx_sim', symbol, 'sell', amount, okxPrice);

        // Simulate rebalancing
        await initiateSimulatedTransfer(userId, 'okx_sim', 'binance_sim', 'USDT', amount * okxPrice);
    } else {
        // Buy on OKX, Sell on Binance
        await executeSimulatedTrade(userId, 'okx_sim', symbol, 'buy', amount, okxPrice);
        await executeSimulatedTrade(userId, 'binance_sim', symbol, 'sell', amount, binancePrice);

        // Simulate rebalancing
        await initiateSimulatedTransfer(userId, 'binance_sim', 'okx_sim', 'USDT', amount * binancePrice);
    }

    return opportunity;
}
