import { logger } from '../../utils/logger.js';
import { getMacroIndicators } from '../macroService.js';
import { supabaseAdmin } from '../../config/supabase.js';

export async function runMacroHedgeBot() {
  try {
    const indicators = await getMacroIndicators();
    const vix = indicators.find(i => i.symbol === 'VIX')?.value || 15;
    const spx = indicators.find(i => i.symbol === 'SPX')?.value || 5000;
    const dxy = indicators.find(i => i.symbol === 'DXY')?.value || 103;

    // Teoria de Hedge: Se VIX (Volatilidade) sobe muito ou DXY (Dólar) sobe,
    // ativos de risco como BTC costumam cair (correlação negativa).
    const riskOffScore = (vix / 20) + (dxy / 100) - (spx / 5000);
    const isRiskOff = riskOffScore > 1.5;

    logger.info(`Macro Risk Score: ${riskOffScore.toFixed(2)} | VIX: ${vix} | DXY: ${dxy}`);

    const { data: bot } = await supabaseAdmin.from('trading_strategies').select('id').eq('name', 'Macro Hedge Bot').maybeSingle();
    if (bot) {
      if (isRiskOff) {
        logger.info('Macro Hedge Bot: RISK OFF signal detected. Selling BTC simulation.');
        await executePaperTrade(bot.id, 'BTC/USDT', 'sell', 1000);
      } else {
        logger.info('Macro Hedge Bot: RISK ON signal. Buying BTC simulation.');
        await executePaperTrade(bot.id, 'BTC/USDT', 'buy', 500);
      }
    }
  } catch (error) {
    logger.error('Error in Macro Hedge Bot:', error);
  }
}

async function executePaperTrade(strategyId: string, symbol: string, side: 'buy' | 'sell', costUsdt: number) {
  await supabaseAdmin.from('paper_orders').insert({
    owner_id: strategyId,
    strategy_id: strategyId,
    symbol,
    side,
    type: 'market',
    amount: costUsdt / 50000,
    cost: costUsdt,
    status: 'filled'
  });
}
