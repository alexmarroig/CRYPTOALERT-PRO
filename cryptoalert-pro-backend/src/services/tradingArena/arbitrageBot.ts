import { logger } from '../../utils/logger.js';
import { fetchTickers } from '../marketDataService.js';
import { supabaseAdmin } from '../../config/supabase.js';

export async function runArbitrageScanner(symbol: string = 'BTC/USDT') {
  try {
    const tickers = await fetchTickers(symbol);
    const exchanges = Object.entries(tickers);

    if (exchanges.length < 2) return;

    let bestBuy = exchanges[0];
    let bestSell = exchanges[0];

    for (const [id, data] of exchanges) {
      if (data.ask < (bestBuy[1].ask || Infinity)) bestBuy = [id, data];
      if (data.bid > (bestSell[1].bid || -Infinity)) bestSell = [id, data];
    }

    const spread = bestSell[1].bid - bestBuy[1].ask;
    const spreadPct = (spread / bestBuy[1].ask) * 100;

    if (spreadPct > 0.05) { // 0.05% spread mínimo
      logger.info(`Arbitrage opportunity found for ${symbol}: ${bestBuy[0]} -> ${bestSell[0]} | Spread: ${spreadPct.toFixed(4)}%`);

      // Registra oportunidade
      await supabaseAdmin.from('market_alerts').insert({
        type: 'arbitrage',
        asset: symbol,
        title: 'Arbitrage Opportunity',
        body: `Buy on ${bestBuy[0]} at ${bestBuy[1].ask} | Sell on ${bestSell[0]} at ${bestSell[1].bid} | Spread: ${spreadPct.toFixed(4)}%`,
        data: { buyExchange: bestBuy[0], sellExchange: bestSell[0], spreadPct }
      });

      // Simulação de execução por um bot específico (Arbitrage Alpha)
      const { data: bot } = await supabaseAdmin.from('trading_strategies').select('id').eq('name', 'Arbitrage Alpha').maybeSingle();
      if (bot) {
        await executePaperArbitrage(bot.id, symbol, bestBuy[0], bestSell[0], bestBuy[1].ask, bestSell[1].bid);
      }
    }
  } catch (error) {
    logger.error('Error in arbitrage scanner:', error);
  }
}

async function executePaperArbitrage(strategyId: string, symbol: string, buyEx: string, sellEx: string, buyPrice: number, sellPrice: number) {
  // Simplificação: executa paper trading para registrar ROI
  const amount = 0.1; // 0.1 BTC
  const cost = amount * buyPrice;
  const revenue = amount * sellPrice;
  const profit = revenue - cost;

  await supabaseAdmin.from('paper_orders').insert([
    { owner_id: strategyId, strategy_id: strategyId, symbol, side: 'buy', type: 'market', price: buyPrice, amount, cost, status: 'filled' },
    { owner_id: strategyId, strategy_id: strategyId, symbol, side: 'sell', type: 'market', price: sellPrice, amount, cost: revenue, status: 'filled' }
  ]);

  logger.info(`Arbitrage Paper Executed: Profit ${profit.toFixed(2)} USDT`);
}
