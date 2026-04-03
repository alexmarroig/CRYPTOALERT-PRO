import { logger } from '../../utils/logger.js';
import { fetchNews } from '../newsService.js';
import { supabaseAdmin } from '../../config/supabase.js';

export async function runSentimentSentinel(asset: string = 'BTC') {
  try {
    const news = await fetchNews({ limit: 10, query: asset, lang: 'en' });
    const items = news.items;

    for (const item of items) {
      // Mock de análise NLP (Transformers seria integrado via API externa em prod)
      const sentiment = Math.random() * 2 - 1; // -1 a 1
      const isPositive = sentiment > 0.3;
      const isNegative = sentiment < -0.3;

      if (isPositive || isNegative) {
        logger.info(`Sentiment Alert for ${asset}: ${sentiment.toFixed(2)} | ${item.title}`);

        // Registra impacto científico
        await supabaseAdmin.from('news_impact_analysis').insert({
          news_title: item.title,
          news_source: item.source,
          sentiment_score: sentiment,
          asset_impacted: asset,
          price_at_news: 0, // A ser preenchido por trigger ou worker de market
          keywords: [asset, 'sentiment']
        });

        // Simulação de execução
        const { data: bot } = await supabaseAdmin.from('trading_strategies').select('id').eq('name', 'Sentiment Sentinel').maybeSingle();
        if (bot) {
          const side = isPositive ? 'buy' : 'sell';
          await executePaperTrade(bot.id, `${asset}/USDT`, side, 100); // 100 USDT simulado
        }
      }
    }
  } catch (error) {
    logger.error('Error in Sentiment Sentinel:', error);
  }
}

async function executePaperTrade(strategyId: string, symbol: string, side: 'buy' | 'sell', costUsdt: number) {
  // Simples execução para ranking
  await supabaseAdmin.from('paper_orders').insert({
    owner_id: strategyId,
    strategy_id: strategyId,
    symbol,
    side,
    type: 'market',
    amount: costUsdt / 50000, // Preço fake de 50k
    cost: costUsdt,
    status: 'filled'
  });
}
