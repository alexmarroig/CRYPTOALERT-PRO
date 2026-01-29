import ccxt from 'ccxt';
import { getLivePrices } from './coingecko.js';

export async function syncExchange(exchange: string, credentials: { key: string; secret: string }) {
  const exchanges: Record<string, ccxt.Exchange> = {
    binance: new ccxt.binance({ apiKey: credentials.key, secret: credentials.secret }),
    okx: new ccxt.okx({ apiKey: credentials.key, secret: credentials.secret })
  };

  const exchangeInstance = exchanges[exchange];
  if (!exchangeInstance) {
    throw new Error('Unsupported exchange');
  }

  const balance = await exchangeInstance.fetchBalance();
  const symbols = Object.entries(balance)
    .filter(([_, amount]) => typeof amount === 'object' && amount && 'free' in amount)
    .map(([symbol]) => symbol.toLowerCase());

  const prices = await getLivePrices(symbols);

  return Object.entries(balance)
    .filter(([_, amount]) => typeof amount === 'object' && amount && 'free' in amount && amount.free > 0)
    .map(([symbol, amount]) => ({
      symbol,
      amount: amount.free,
      value: amount.free * (prices[symbol.toLowerCase()]?.usd ?? 0)
    }));
}
