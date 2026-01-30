import ccxt from 'ccxt';
import { getLivePrices } from './coingecko.js';

type BalanceEntry = { free: number };

function hasFreeAmount(value: unknown): value is BalanceEntry {
  return typeof value === 'object'
    && value !== null
    && 'free' in value
    && typeof (value as BalanceEntry).free === 'number';
}

export async function syncExchange(exchange: string, credentials: { key: string; secret: string }) {
  const exchanges: Record<string, { fetchBalance: () => Promise<Record<string, unknown>> }> = {
    binance: new ccxt.binance({ apiKey: credentials.key, secret: credentials.secret }),
    okx: new ccxt.okx({ apiKey: credentials.key, secret: credentials.secret })
  };

  const exchangeInstance = exchanges[exchange];
  if (!exchangeInstance) {
    throw new Error('Unsupported exchange');
  }

  const balance = await exchangeInstance.fetchBalance() as Record<string, unknown>;
  const entries = Object.entries(balance)
    .filter(([_, amount]) => hasFreeAmount(amount)) as Array<[string, BalanceEntry]>;
  const symbols = entries.map(([symbol]) => symbol.toLowerCase());

  const prices = await getLivePrices(symbols);

  return entries
    .filter(([_, amount]) => amount.free > 0)
    .map(([symbol, amount]) => ({
      symbol,
      amount: amount.free,
      value: amount.free * (prices[symbol.toLowerCase()]?.usd ?? 0)
    }));
}
