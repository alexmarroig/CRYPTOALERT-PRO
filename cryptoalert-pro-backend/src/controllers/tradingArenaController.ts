import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export class TradingArenaController {
  async getRanking(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('strategy_performance')
        .select('*, strategy:trading_strategies(name, description, theory_base)')
        .order('total_roi_pct', { ascending: false })
        .limit(20);

      if (error) throw error;
      return res.json(data);
    } catch (error) {
      logger.error('Error fetching arena ranking:', error);
      return res.status(500).json({ error: 'Failed to fetch ranking' });
    }
  }

  async getStrategies(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('trading_strategies')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      return res.json(data);
    } catch (error) {
      logger.error('Error fetching strategies:', error);
      return res.status(500).json({ error: 'Failed to fetch strategies' });
    }
  }

  async getNewsImpact(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('news_impact_analysis')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return res.json(data);
    } catch (error) {
      logger.error('Error fetching news impact:', error);
      return res.status(500).json({ error: 'Failed to fetch news impact' });
    }
  }

  async placePaperOrder(req: Request, res: Response) {
    const { symbol, side, amount, price } = req.body;
    const userId = (req as any).user?.id;

    try {
      const { data, error } = await supabaseAdmin.from('paper_orders').insert({
        owner_id: userId,
        symbol,
        side,
        type: 'market',
        price,
        amount,
        cost: price * amount,
        status: 'filled'
      }).select().single();

      if (error) throw error;
      return res.json(data);
    } catch (error) {
      logger.error('Error placing paper order:', error);
      return res.status(500).json({ error: 'Failed to place paper order' });
    }
  }
}
