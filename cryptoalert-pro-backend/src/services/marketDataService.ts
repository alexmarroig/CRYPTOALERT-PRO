import ccxt from 'ccxt';
import { logger } from '../utils/logger.js';

// ccxt.Exchange might not be directly exported as a namespace member in all versions/types
const exchanges: Record<string, any> = {
  binance: new ccxt.binance({ enableRateLimit: true }),
  okx: new ccxt.okx({ enableRateLimit: true }),
  bybit: new ccxt.bybit({ enableRateLimit: true }),
};

export async function fetchTickers(symbol: string) {
  const results: Record<string, { bid: number; ask: number; last: number; timestamp: number }> = {};

  const promises = Object.entries(exchanges).map(async ([id, exchange]) => {
    try {
      const ticker = await (exchange as any).fetchTicker(symbol);
      results[id] = {
        bid: ticker.bid || 0,
        ask: ticker.ask || 0,
        last: ticker.last || 0,
        timestamp: ticker.timestamp || Date.now(),
      };
    } catch (error) {
      logger.error(`Error fetching ticker from ${id} for ${symbol}:`, error);
    }
  });

  await Promise.all(promises);
  return results;
}

export async function fetchOHLCV(exchangeId: string, symbol: string, timeframe: string = '1h', limit: number = 100) {
  const exchange = exchanges[exchangeId];
  if (!exchange) throw new Error(`Exchange ${exchangeId} not supported`);

  try {
    return await (exchange as any).fetchOHLCV(symbol, timeframe, undefined, limit);
  } catch (error) {
    logger.error(`Error fetching OHLCV from ${exchangeId} for ${symbol}:`, error);
    throw error;
  }
}

export function getSupportedExchanges() {
  return Object.keys(exchanges);
}
