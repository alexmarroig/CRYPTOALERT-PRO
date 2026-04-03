import { logger } from '../../utils/logger.js';
import { getMacroIndicators } from '../macroService.js';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Kelly Criterion: f* = (bp - q) / b
 * f* is the fraction of current bankroll to wager
 * b is net odds received on the wager (b to 1)
 * p is probability of winning
 * q is probability of losing (1 - p)
 */
export function calculateKellyFraction(p: number, b: number): number {
  if (b === 0) return 0;
  const f = (b * p - (1 - p)) / b;
  return Math.max(0, Math.min(f, 0.2)); // Cap de 20% para segurança (Fractional Kelly)
}

/**
 * Circuit Breaker: Verifica se a volatilidade do mercado permite novas operações.
 */
export async function isCircuitBreakerActive(): Promise<boolean> {
  const indicators = await getMacroIndicators();
  const vix = indicators.find(i => i.symbol === 'VIX')?.value || 15;

  if (vix > 35) { // VIX > 35 indica pânico extremo no mercado tradicional
    logger.warn(`Circuit Breaker ACTIVE: VIX is ${vix}. Blocking new trades simulation.`);
    return true;
  }
  return false;
}

/**
 * Correlation Check: Evita sobre-exposição a ativos altamente correlacionados.
 */
export async function checkPortfolioCorrelation(assetA: string, assetB: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('market_correlations')
    .select('correlation_coefficient')
    .eq('asset_a', assetA)
    .eq('asset_b', assetB)
    .maybeSingle();

  return data?.correlation_coefficient || 0;
}

/**
 * Salvaguarda Baseada em ATR (Average True Range) para Stop Loss Dinâmico.
 */
export function calculateATRStopLoss(currentPrice: number, atr: number, multiplier: number = 2): number {
  return currentPrice - (atr * multiplier);
}
