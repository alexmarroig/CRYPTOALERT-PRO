import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  getPortfolioSnapshotByUserId,
  getPortfolioVisibilityByUserId,
  getProfileByUsername,
  getPublicPortfolioSnapshotByUserId,
  upsertPortfolioVisibility
} from '../repositories/portfolioRepository.js';
import { enforcePortfolioVisibilityPolicy, buildPercentVisibilitySnapshot } from '../services/portfolioPolicyService.js';
import { connectExchange, syncPortfolioSnapshot, testExchangeConnection } from '../services/portfolioSync.js';
import { supabaseAdmin } from '../config/supabase.js';
import { connectExchange, reconcilePortfolio, syncPortfolioSnapshot, testExchangeConnection } from '../services/portfolioSync.js';
import { logger } from '../utils/logger.js';

const connectSchema = z.object({
  exchange: z.enum(['binance', 'okx']),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1)
});

const visibilitySchema = z.object({
  visibility: z.enum(['private', 'friends', 'public', 'percent'])
});

export const portfolioControllerDeps = {
  connectExchange,
  testExchangeConnection,
  syncPortfolioSnapshot
};
export async function connectPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }
const performanceRangeSchema = z.object({
  range: z.enum(['7d', '30d', '1y']).default('30d')
});

const goalsAlertsSchema = z.object({
  maxDrawdownPct: z.number().min(0).max(100).optional(),
  targetNetWorth: z.number().min(0).optional(),
  assetDailyChangePct: z.number().min(0).max(100).optional()
});

function rangeToDate(range: '7d' | '30d' | '1y') {
  const now = new Date();
  if (range === '7d') now.setDate(now.getDate() - 7);
  if (range === '30d') now.setDate(now.getDate() - 30);
  if (range === '1y') now.setFullYear(now.getFullYear() - 1);
  return now.toISOString();
}

export async function connectPortfolio(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = connectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  await portfolioControllerDeps.connectExchange(req.user.id, parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
  logger.info('audit.portfolio.connect', { user_id: req.user.id, exchange: parse.data.exchange });
  return res.status(201).json({ connected: true });
    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    await connectExchange(req.user.id, parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    logger.info('audit.portfolio.connect', { user_id: req.user.id, exchange: parse.data.exchange });
    return res.status(201).json({ connected: true });
  } catch (error) {
    return next(error);
  }
}

export async function testPortfolioConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    await testExchangeConnection(parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function syncPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const snapshot = await syncPortfolioSnapshot(req.user.id);
    return res.json({ snapshot });
  } catch (error) {
    return next(error);
  }
}

export async function getMyPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }
export async function getPortfolioPerformance(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = performanceRangeSchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  await portfolioControllerDeps.testExchangeConnection(parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
  return res.json({ ok: true });
  const startDate = rangeToDate(parse.data.range);
  const { data, error } = await supabaseAdmin
    .from('portfolios_history')
    .select('total_value, created_at')
    .eq('user_id', req.user.id)
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const firstValue = Number(data?.[0]?.total_value ?? 0);
  const lastValue = Number(data?.[data.length - 1]?.total_value ?? 0);
  const performancePct = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

  return res.json({
    range: parse.data.range,
    performance_pct: performancePct,
    points: (data ?? []).map((point) => ({
      total_value: Number(point.total_value ?? 0),
      created_at: point.created_at
    }))
  });
}

export async function getPortfolioComposition(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const snapshot = await portfolioControllerDeps.syncPortfolioSnapshot(req.user.id);
  return res.json({ snapshot });
  const { data: snapshot, error } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('assets, total_value')
    .eq('user_id', req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const assets = ((snapshot?.assets ?? []) as Array<Record<string, unknown>>)
    .map((asset) => ({
      symbol: String(asset.symbol ?? ''),
      qty: Number(asset.qty ?? 0),
      value: Number(asset.value ?? 0),
      exchange: String(asset.exchange ?? 'unknown')
    }))
    .filter((asset) => asset.symbol && asset.value >= 0);

  const totalValue = Number(snapshot?.total_value ?? 0);
  const topHoldings = [...assets]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((asset) => ({
      ...asset,
      pct: totalValue > 0 ? (asset.value / totalValue) * 100 : 0
    }));

  const concentration = topHoldings.reduce((sum, asset) => sum + asset.pct, 0);

  const exposureByExchangeMap = new Map<string, number>();
  for (const asset of assets) {
    exposureByExchangeMap.set(asset.exchange, (exposureByExchangeMap.get(asset.exchange) ?? 0) + asset.value);
  }

  const exposureByExchange = [...exposureByExchangeMap.entries()].map(([exchange, value]) => ({
    exchange,
    value,
    pct: totalValue > 0 ? (value / totalValue) * 100 : 0
  })).sort((a, b) => b.value - a.value);

  const classBuckets = assets.reduce((acc, asset) => {
    const symbol = asset.symbol.toUpperCase();
    const assetClass = ['USDT', 'USDC', 'DAI'].includes(symbol) ? 'stablecoin' : 'crypto';
    acc.set(assetClass, (acc.get(assetClass) ?? 0) + asset.value);
    return acc;
  }, new Map<string, number>());

  const byClass = [...classBuckets.entries()].map(([assetClass, value]) => ({
    class: assetClass,
    value,
    pct: totalValue > 0 ? (value / totalValue) * 100 : 0
  }));

  return res.json({
    total_value: totalValue,
    top_holdings: topHoldings,
    concentration_pct_top5: concentration,
    exposure_by_exchange: exposureByExchange,
    composition_by_class: byClass
  });
}

export async function getPortfolioGoalsAlerts(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('portfolio_goals_alerts')
    .select('*')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ goals_alerts: data ?? null });
}

export async function upsertPortfolioGoalsAlerts(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = goalsAlertsSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('portfolio_goals_alerts')
    .upsert({
      user_id: req.user.id,
      max_drawdown_pct: parse.data.maxDrawdownPct,
      target_net_worth: parse.data.targetNetWorth,
      asset_daily_change_pct: parse.data.assetDailyChangePct,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ goals_alerts: data });
}

export async function getPortfolioReconciliation(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [{ data: ledgerEntries, error: ledgerError }, { data: snapshot, error: snapshotError }] = await Promise.all([
    supabaseAdmin
      .from('portfolio_ledger')
      .select('user_id, exchange, asset, type, quantity, price, executed_at')
      .eq('user_id', req.user.id),
    supabaseAdmin
      .from('portfolios_snapshot')
      .select('assets')
      .eq('user_id', req.user.id)
      .single()
  ]);

  if (ledgerError || snapshotError) {
    return res.status(500).json({ error: ledgerError?.message ?? snapshotError?.message });
  }

  const marketPrices = Object.fromEntries(
    ((snapshot?.assets ?? []) as Array<Record<string, unknown>>).map((asset) => {
      const qty = Number(asset.qty ?? 0);
      const value = Number(asset.value ?? 0);
      const price = qty > 0 ? value / qty : 0;
      return [String(asset.symbol ?? '').toUpperCase(), price];
    })
  );

  const reconciliation = reconcilePortfolio(ledgerEntries as Array<{
    user_id: string;
    exchange: 'binance' | 'okx';
    asset: string;
    type: 'trade' | 'deposit' | 'withdraw' | 'fee';
    quantity: number;
    price: number;
    executed_at: string;
  }>, marketPrices);

  return res.json(reconciliation);
}

export async function updatePortfolioVisibility(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = visibilitySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

    const data = await getPortfolioSnapshotByUserId(req.user.id);
    return res.json({ snapshot: data });
  } catch (error) {
    return next(error);
  }
}

export async function updatePortfolioVisibility(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const parse = visibilitySchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    const data = await upsertPortfolioVisibility(req.user.id, parse.data.visibility);

    logger.info('audit.portfolio.visibility', { user_id: req.user.id, visibility: parse.data.visibility });

    return res.json({ visibility: data });
  } catch (error) {
    return next(error);
  }
}

export async function getPublicPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    const { username } = req.params;

    const profile = await getProfileByUsername(username);
    if (!profile) {
      throw new AppError('Profile not found', 404, { code: 'PROFILE_NOT_FOUND' });
    }

    const mode = await getPortfolioVisibilityByUserId(profile.id);
    const currency = process.env.PORTFOLIO_CURRENCY ?? 'USD';

    await enforcePortfolioVisibilityPolicy({
      mode,
      viewerId: req.user?.id,
      profileId: profile.id
    });

    const snapshot = await getPublicPortfolioSnapshotByUserId(profile.id);

    if (mode === 'percent') {
      const percentSnapshot = buildPercentVisibilitySnapshot(snapshot ?? {});
      return res.json({
        username: profile.username,
        change_pct_30d: percentSnapshot.change_pct_30d,
        top_assets_percent: percentSnapshot.top_assets_percent,
        currency,
        as_of: percentSnapshot.as_of
      });
    }

    return res.json({
      username: profile.username,
      snapshot,
      currency,
      as_of: snapshot?.updated_at ?? new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
}
