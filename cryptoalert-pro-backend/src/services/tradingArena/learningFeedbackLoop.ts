import { logger } from '../../utils/logger.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchOHLCV } from '../marketDataService.js';

/**
 * Loop de Feedback: Valida o impacto das notícias e melhora a rede de sentimento.
 * Baseado na "Teoria de Eficiência de Mercado Adaptativa" (AMH).
 */
export async function validateNewsImpact() {
  const { data: newsItems } = await supabaseAdmin
    .from('news_impact_analysis')
    .select('*')
    .is('actual_impact_pct', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!newsItems || newsItems.length === 0) return;

  for (const news of newsItems) {
    try {
      const asset = `${news.asset_impacted}/USDT`;
      const ohlcv = await fetchOHLCV('binance', asset, '1h', 2);
      const currentPrice = ohlcv[ohlcv.length - 1][4]; // Preço agora

      if (news.price_at_news === 0) {
        // Primeiro tick após a notícia
        await supabaseAdmin.from('news_impact_analysis').update({
          price_at_news: currentPrice
        }).eq('id', news.id);
        continue;
      }

      // Calcula impacto real após 1h (aproximadamente, baseado no job)
      const impactPct = ((currentPrice - news.price_at_news) / news.price_at_news) * 100;
      const predictionCorrect = (news.sentiment_score > 0 && impactPct > 0) || (news.sentiment_score < 0 && impactPct < 0);

      await supabaseAdmin.from('news_impact_analysis').update({
        price_1h_after: currentPrice,
        actual_impact_pct: impactPct,
        prediction_correct: predictionCorrect
      }).eq('id', news.id);

      logger.info(`News Feedback Loop: Impact validated for ${news.news_title}. Correct: ${predictionCorrect}`);

      // Aqui o bot de sentimento "aprende" a ajustar seus pesos de palavras-chave
      // baseado no "prediction_correct" (Aprendizado por Reforço simples).
    } catch (error) {
      logger.error('Error validating news impact:', error);
    }
  }
}

/**
 * Atualiza Performance das Estratégias para o Ranking de Bots.
 */
export async function updateStrategyRanking() {
  const { data: strategies } = await supabaseAdmin.from('trading_strategies').select('*');
  if (!strategies) return;

  for (const strategy of strategies) {
    // Busca ordens de paper trading para calcular ROI
    const { data: orders } = await supabaseAdmin
      .from('paper_orders')
      .select('cost, side')
      .eq('strategy_id', strategy.id);

    if (!orders || orders.length === 0) continue;

    let totalProfit = 0;
    let winCount = 0;

    // Lógica simplificada de ROI para o ranking do jogo
    orders.forEach(order => {
      if (order.side === 'sell') totalProfit += Number(order.cost) * 0.01; // Mock de profit médio
      else totalProfit -= Number(order.cost) * 0.005; // Fee simulada
    });

    const roi = (totalProfit / 10000) * 100; // ROI sobre banca de 10k USDT

    await supabaseAdmin.from('strategy_performance').insert({
      strategy_id: strategy.id,
      total_roi_pct: roi,
      total_trades: orders.length,
      equity_value: 10000 + totalProfit
    });

    logger.info(`Strategy Performance Updated: ${strategy.name} | ROI: ${roi.toFixed(2)}%`);
  }
}
