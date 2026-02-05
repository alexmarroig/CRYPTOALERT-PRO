import ccxt from 'ccxt';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyAllUsers } from './notifyService.js';

const exchange = new ccxt.binance();

export async function checkRSI(symbol: string = 'BTC/USDT') {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, '5m', undefined, 100);
    const closes = ohlcv.map((tick: number[]) => tick[4] as number);

    const rsi = calculateRSI(closes);

    if (rsi < 30 || rsi > 70) {
      const condition = rsi < 30 ? 'Oversold (Sobrevenda)' : 'Overbought (Sobrecompra)';
      const title = `🚨 RSI Alert: ${symbol}`;
      const body = `${symbol} está em ${condition} com RSI de ${rsi.toFixed(2)}.`;

      await saveMarketAlert('rsi', symbol, title, body, { rsi });
      await notifyAllUsers(title, body, { type: 'rsi', symbol });
    }
  } catch (error) {
    console.error('Error checking RSI:', error);
  }
}

export async function checkVolumeSpike(symbol: string = 'BTC/USDT') {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, '5m', undefined, 24);
    const volumes = ohlcv.map((tick: number[]) => tick[5] as number);
    const lastVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, -1).reduce((a: number, b: number) => a + b, 0) / (volumes.length - 1);

    if (lastVolume > avgVolume * 3) {
      const title = `📈 Volume Spike: ${symbol}`;
      const body = `Volume de negociação em ${symbol} aumentou 3x acima da média!`;

      await saveMarketAlert('volume', symbol, title, body, { volume: lastVolume, avg: avgVolume });
      await notifyAllUsers(title, body, { type: 'volume', symbol });
    }
  } catch (error) {
    console.error('Error checking Volume Spike:', error);
  }
}

export async function checkWhaleMovements() {
  // Skeleton for Whale Alert integration
  // In a real scenario, this would call the Whale Alert API
  // For MVP, we can simulate or skip if no API key
  console.log('Checking whale movements...');
}

async function saveMarketAlert(type: string, asset: string, title: string, body: string, data: any) {
  await supabaseAdmin.from('market_alerts').insert({
    type,
    asset,
    title,
    body,
    data
  });
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;

  let gains = [];
  let losses = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
