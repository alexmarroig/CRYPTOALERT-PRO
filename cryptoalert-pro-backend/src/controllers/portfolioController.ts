import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { connectExchange, syncPortfolioSnapshot, testExchangeConnection } from '../services/portfolioSync.js';

const connectSchema = z.object({
  exchange: z.enum(['binance', 'okx']),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1)
});

const visibilitySchema = z.object({
  visibility: z.enum(['private', 'friends', 'public', 'percent'])
});

export async function connectPortfolio(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = connectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  await connectExchange(req.user.id, parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
  return res.status(201).json({ connected: true });
}

export async function testPortfolioConnection(req: Request, res: Response) {
  const parse = connectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  await testExchangeConnection(parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
  return res.json({ ok: true });
}

export async function syncPortfolio(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const snapshot = await syncPortfolioSnapshot(req.user.id);
  return res.json({ snapshot });
}

export async function getMyPortfolio(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ snapshot: data });
}

export async function updatePortfolioVisibility(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = visibilitySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('portfolio_visibility')
    .upsert({
      user_id: req.user.id,
      visibility: parse.data.visibility
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ visibility: data });
}

export async function getPublicPortfolio(req: Request, res: Response) {
  const { username } = req.params;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { data: visibility } = await supabaseAdmin
    .from('portfolio_visibility')
    .select('visibility')
    .eq('user_id', profile.id)
    .single();

  const mode = visibility?.visibility ?? 'private';
  if (mode === 'private') {
    return res.status(403).json({ error: 'Portfolio is private' });
  }

  if (mode === 'friends') {
    if (!req.user) {
      return res.status(403).json({ error: 'Friends-only portfolio' });
    }

    const { data: following } = await supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', req.user.id)
      .eq('following_id', profile.id)
      .maybeSingle();

    const { data: reciprocal } = await supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id)
      .eq('following_id', req.user.id)
      .maybeSingle();

    if (!following || !reciprocal) {
      return res.status(403).json({ error: 'Friends-only portfolio' });
    }
  }

  const { data: snapshot } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('total_value, change_pct_30d, assets, updated_at')
    .eq('user_id', profile.id)
    .single();

  if (mode === 'percent') {
    const topAssets = (snapshot?.assets ?? []).map((asset: { symbol: string; pct: number }) => ({
      symbol: asset.symbol,
      pct: asset.pct
    }));
    return res.json({
      username: profile.username,
      change_pct_30d: snapshot?.change_pct_30d ?? 0,
      top_assets_percent: topAssets
    });
  }

  return res.json({ username: profile.username, snapshot });
}
