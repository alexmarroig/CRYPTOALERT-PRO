import { logger } from '../../utils/logger.js';
import { fetchOHLCV } from '../marketDataService.js';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * LSTM Trend Follower Simulator
 * Em produção, isso usaria TensorFlow.js ou um microsserviço Python (FastAPI/PyTorch)
 * Aqui simulamos a inferência do modelo pré-treinado.
 */
export async function runLSTMBot(symbol: string = 'BTC/USDT') {
  try {
    const ohlcv = await fetchOHLCV('binance', symbol, '1h', 24);
    const prices = ohlcv.map((item: any) => item[4] as number); // Fechamentos

    // Simulação de inferência LSTM (Rede Neural Recorrente)
    // Calcula tendência baseada nos pesos "aprendidos" (simulado)
    const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const lastPrice = prices[prices.length - 1];

    const modelPrediction = lastPrice > avg ? 0.75 : -0.25; // Score de confiança do modelo LSTM

    if (Math.abs(modelPrediction) > 0.5) {
      const side = modelPrediction > 0 ? 'buy' : 'sell';
      logger.info(`LSTM Model Signal for ${symbol}: ${side} | Confidence: ${modelPrediction.toFixed(2)}`);

      const { data: bot } = await supabaseAdmin.from('trading_strategies').select('id').eq('name', 'LSTM Trend Follower').maybeSingle();
      if (bot) {
        await executePaperTrade(bot.id, symbol, side, 500); // 500 USDT simulado
      }
    }
  } catch (error) {
    logger.error('Error in LSTM Bot:', error);
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
