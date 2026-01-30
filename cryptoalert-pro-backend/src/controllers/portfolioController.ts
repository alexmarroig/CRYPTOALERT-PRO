import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { PortfolioService } from '../services/portfolio.js';
import { getLivePrices } from '../utils/coingecko.js';
import { getSubscriptionTier } from '../utils/subscription.js';

const syncSchema = z.object({
  exchange: z.string().min(1),
  api_key: z.string().min(1),
  api_secret: z.string().min(1)
});

const manualSchema = z.array(
  z.object({
    symbol: z.string().min(1),
    amount: z.number().positive()
  })
);

const portfolioService = new PortfolioService();

export async function syncPortfolio(req: Request, res: Response) {
  const parse = syncSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const tier = await getSubscriptionTier(req.user?.id);
  if (tier === 'free') {
    return res.status(403).json({ error: 'Upgrade required to sync exchange portfolios.' });
  }

  const portfolio = await portfolioService.syncExchange(
    req.user?.id ?? '',
    parse.data.exchange,
    parse.data.api_key,
    parse.data.api_secret
  );

  return res.json({ portfolio });
}

export async function getPortfolio(req: Request, res: Response) {
  const { data, error } = await supabase
    .from('users')
    .select('portfolio_manual')
    .eq('id', req.user?.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const manual = (data?.portfolio_manual ?? []) as Array<{ symbol: string; amount: number }>;
  const prices = await getLivePrices(manual.map((item) => item.symbol));
  const holdings = manual.map((item) => ({
    ...item,
    usd_value: (prices[item.symbol.toLowerCase()]?.usd ?? 0) * item.amount
  }));

  return res.json({ manual: holdings });
}

export async function updateManualPortfolio(req: Request, res: Response) {
  const parse = manualSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { error } = await supabase
    .from('users')
    .update({ portfolio_manual: parse.data })
    .eq('id', req.user?.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ portfolio_manual: parse.data });
}

export async function getPortfolioPnLComparison(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single();

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  const influencerId = (req.query.influencer_id as string | undefined) ?? user?.referred_by ?? null;
  if (!influencerId) {
    return res.status(400).json({ error: 'Influencer ID not provided' });
  }

  const { data: userTrades, error: userTradesError } = await supabase
    .from('user_trades')
    .select('pnl_usd, pnl_pct')
    .eq('user_id', userId);

  if (userTradesError) {
    return res.status(500).json({ error: userTradesError.message });
  }

  const userTotals = (userTrades ?? []).reduce(
    (acc, trade) => {
      acc.totalUsd += Number(trade.pnl_usd ?? 0);
      acc.totalPct += Number(trade.pnl_pct ?? 0);
      acc.count += 1;
      return acc;
    },
    { totalUsd: 0, totalPct: 0, count: 0 }
  );

  const { data: influencerTrades, error: influencerTradesError } = await supabase
    .from('user_trades')
    .select('pnl_usd, pnl_pct, signals!inner(influencer_id)')
    .eq('signals.influencer_id', influencerId);

  if (influencerTradesError) {
    return res.status(500).json({ error: influencerTradesError.message });
  }

  const influencerTotals = (influencerTrades ?? []).reduce(
    (acc, trade) => {
      acc.totalUsd += Number(trade.pnl_usd ?? 0);
      acc.totalPct += Number(trade.pnl_pct ?? 0);
      acc.count += 1;
      return acc;
    },
    { totalUsd: 0, totalPct: 0, count: 0 }
  );

  return res.json({
    user: {
      user_id: userId,
      total_pnl_usd: userTotals.totalUsd,
      average_pnl_pct: userTotals.count ? userTotals.totalPct / userTotals.count : 0,
      trades_count: userTotals.count
    },
    influencer: {
      influencer_id: influencerId,
      total_pnl_usd: influencerTotals.totalUsd,
      average_pnl_pct: influencerTotals.count ? influencerTotals.totalPct / influencerTotals.count : 0,
      trades_count: influencerTotals.count
    }
  });
}
