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
