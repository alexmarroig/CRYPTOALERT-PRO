import fetch from 'node-fetch';
import { env } from '../config/env.js';

export async function getLivePrices(symbols: string[]) {
  if (symbols.length === 0) {
    return {} as Record<string, { usd: number }>;
  }

  const ids = symbols.map((symbol) => symbol.toLowerCase()).join(',');
  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', ids);
  url.searchParams.set('vs_currencies', 'usd');

  const response = await fetch(url, {
    headers: env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } : undefined
  });

  if (!response.ok) {
    throw new Error(`CoinGecko error: ${response.status}`);
  }

  return response.json() as Promise<Record<string, { usd: number }>>;
}
