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
import { buildPercentVisibilitySnapshot, enforcePortfolioVisibilityPolicy } from '../services/portfolioPolicyService.js';
import { connectExchange, reconcilePortfolio, syncPortfolioSnapshot, testExchangeConnection } from '../services/portfolioSync.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const connectSchema = z.object({ exchange: z.enum(['binance', 'okx']), apiKey: z.string().min(1), apiSecret: z.string().min(1) });
const visibilitySchema = z.object({ visibility: z.enum(['private', 'friends', 'public', 'percent']) });
const performanceRangeSchema = z.object({ range: z.enum(['7d', '30d', '90d']).optional() });
const goalsAlertsSchema = z.object({ maxDrawdownPct: z.number().min(0).max(100).optional(), targetNetWorth: z.number().min(0).optional(), assetDailyChangePct: z.number().min(0).max(100).optional() });

export const portfolioControllerDeps = { connectExchange, testExchangeConnection, syncPortfolioSnapshot };

function ensureAuth(req: Request) {
  if (!req.user) throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
}

function sinceFromRange(range: '7d' | '30d' | '90d') {
  const date = new Date();
  if (range === '7d') date.setDate(date.getDate() - 7);
  if (range === '30d') date.setDate(date.getDate() - 30);
  if (range === '90d') date.setDate(date.getDate() - 90);
  return date.toISOString();
}

export async function connectPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAuth(req);
    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });

    await portfolioControllerDeps.connectExchange(req.user!.id, parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    logger.info('audit.portfolio.connect', { user_id: req.user!.id, exchange: parse.data.exchange });
    return res.status(201).json({ connected: true });
  } catch (error) {
    return next(error);
  }
}

export async function testPortfolioConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    await portfolioControllerDeps.testExchangeConnection(parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function syncPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAuth(req);
    const snapshot = await portfolioControllerDeps.syncPortfolioSnapshot(req.user!.id);
    return res.json({ snapshot });
  } catch (error) {
    return next(error);
  }
}

export async function getMyPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAuth(req);
    const snapshot = await getPortfolioSnapshotByUserId(req.user!.id);
    return res.json({ snapshot });
  } catch (error) {
    return next(error);
  }
}

export async function getPortfolioPerformance(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const parse = performanceRangeSchema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const ranges: Array<'7d' | '30d' | '90d'> = parse.data.range ? [parse.data.range] : ['7d', '30d', '90d'];
  const series: Record<string, Array<{ at: string; value: number; change_pct: number }>> = {};

  for (const range of ranges) {
    const { data } = await supabaseAdmin
      .from('portfolios_history')
      .select('total_value, created_at')
      .eq('user_id', req.user.id)
      .gte('created_at', sinceFromRange(range))
      .order('created_at', { ascending: true });

    const firstValue = Number(data?.[0]?.total_value ?? 0) || 0;
    series[range] = (data ?? []).map((point) => {
      const value = Number(point.total_value ?? 0);
      return {
        at: point.created_at,
        value,
        change_pct: firstValue > 0 ? Number((((value - firstValue) / firstValue) * 100).toFixed(4)) : 0
      };
    });
  }

  return res.json({ series, currency: process.env.PORTFOLIO_CURRENCY ?? 'USD', as_of: new Date().toISOString() });
}

export async function getPortfolioComposition(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseAdmin.from('portfolios_snapshot').select('assets, updated_at').eq('user_id', req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });

  const assets = ((data?.assets ?? []) as Array<any>).map((asset) => ({
    symbol: asset.symbol ?? asset.asset,
    percent: Number(asset.pct ?? 0),
    value: asset.value ?? null
  })).sort((a, b) => b.percent - a.percent);

  return res.json({ items: assets, as_of: data?.updated_at ?? new Date().toISOString(), currency: process.env.PORTFOLIO_CURRENCY ?? 'USD' });
}

export async function getPortfolioGoalsAlerts(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseAdmin.from('portfolio_goals_alerts').select('*').eq('user_id', req.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ goals_alerts: data ?? null });
}

export async function upsertPortfolioGoalsAlerts(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const parse = goalsAlertsSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { data, error } = await supabaseAdmin.from('portfolio_goals_alerts').upsert({
    user_id: req.user.id,
    max_drawdown_pct: parse.data.maxDrawdownPct,
    target_net_worth: parse.data.targetNetWorth,
    asset_daily_change_pct: parse.data.assetDailyChangePct,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ goals_alerts: data });
}

export async function getPortfolioReconciliation(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const [{ data: ledgerEntries, error: ledgerError }, { data: snapshot, error: snapshotError }] = await Promise.all([
    supabaseAdmin.from('portfolio_ledger').select('user_id, exchange, asset, type, quantity, price, executed_at').eq('user_id', req.user.id),
    supabaseAdmin.from('portfolios_snapshot').select('assets').eq('user_id', req.user.id).single()
  ]);

  if (ledgerError || snapshotError) return res.status(500).json({ error: ledgerError?.message ?? snapshotError?.message });

  const marketPrices = Object.fromEntries(((snapshot?.assets ?? []) as Array<any>).map((asset) => {
    const qty = Number(asset.qty ?? 0);
    const value = Number(asset.value ?? 0);
    return [String(asset.symbol ?? '').toUpperCase(), qty > 0 ? value / qty : 0];
  }));

  return res.json(reconcilePortfolio((ledgerEntries ?? []) as any, marketPrices));
}

export async function updatePortfolioVisibility(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAuth(req);
    const parse = visibilitySchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });

    const data = await upsertPortfolioVisibility(req.user!.id, parse.data.visibility);
    logger.info('audit.portfolio.visibility', { user_id: req.user!.id, visibility: parse.data.visibility });
    return res.json({ visibility: data });
  } catch (error) {
    return next(error);
  }
}

export async function getPublicPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getProfileByUsername(req.params.username);
    if (!profile) throw new AppError('Profile not found', 404, { code: 'PROFILE_NOT_FOUND' });

    const mode = await getPortfolioVisibilityByUserId(profile.id);
    await enforcePortfolioVisibilityPolicy({ mode, viewerId: req.user?.id, profileId: profile.id });

    const snapshot = await getPublicPortfolioSnapshotByUserId(profile.id);
    if (mode === 'percent') {
      const percent = buildPercentVisibilitySnapshot(snapshot ?? {});
      return res.json({ username: profile.username, visibility: mode, change_pct_30d: percent.change_pct_30d, top_assets_percent: percent.top_assets_percent, currency: process.env.PORTFOLIO_CURRENCY ?? 'USD', as_of: percent.as_of });
    }

    return res.json({ username: profile.username, visibility: mode, snapshot, currency: process.env.PORTFOLIO_CURRENCY ?? 'USD', as_of: snapshot?.updated_at ?? new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
}
