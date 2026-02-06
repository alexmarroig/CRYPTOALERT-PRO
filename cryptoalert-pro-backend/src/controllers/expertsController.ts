import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const expertsQuerySchema = z.object({ query: z.string().optional(), limit: z.string().optional(), offset: z.string().optional() });
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function sanitizeQuery(value?: string) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[^\p{L}\p{N}\s_-]/gu, '');
  return cleaned ? cleaned.slice(0, 60) : undefined;
}

function parseNumber(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 0), max);
}

async function isMutualFollow(requesterId: string, targetId: string) {
  const [{ data: following }, { data: reciprocal }] = await Promise.all([
    supabaseAdmin.from('follows').select('following_id').eq('follower_id', requesterId).eq('following_id', targetId).maybeSingle(),
    supabaseAdmin.from('follows').select('following_id').eq('follower_id', targetId).eq('following_id', requesterId).maybeSingle()
  ]);
  return Boolean(following && reciprocal);
}

export async function listExperts(req: Request, res: Response) {
  const parse = expertsQuerySchema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const limit = parseNumber(parse.data.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseNumber(parse.data.offset, 0, 10000);
  const search = sanitizeQuery(parse.data.query);

  let query = supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio', { count: 'exact' })
    .in('role', ['influencer', 'admin'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);

  const { data: profiles, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const ids = (profiles ?? []).map((profile) => profile.id);
  const [visibilityRows, followersRows, alertsRows] = await Promise.all([
    supabaseAdmin.from('portfolio_visibility').select('user_id, visibility').in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin.from('follows').select('following_id'),
    supabaseAdmin.from('alerts').select('creator_id, status')
  ]);

  const visibilityMap = new Map((visibilityRows.data ?? []).map((row) => [row.user_id, row.visibility ?? 'private']));
  const followersCount = (followersRows.data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.following_id] = (acc[row.following_id] ?? 0) + 1;
    return acc;
  }, {});
  const activeAlertsCount = (alertsRows.data ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.status === 'active') acc[row.creator_id] = (acc[row.creator_id] ?? 0) + 1;
    return acc;
  }, {});

  const items = (profiles ?? []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    followers_count: followersCount[profile.id] ?? 0,
    active_alerts_count: activeAlertsCount[profile.id] ?? 0,
    visibility_hint: visibilityMap.get(profile.id) ?? 'private'
  }));

  const total = count ?? items.length;
  const nextCursor = offset + limit < total ? String(offset + limit) : undefined;
  return res.json({ items, total, next_cursor: nextCursor });
}

export async function getExpertProfile(req: Request, res: Response) {
  const username = sanitizeQuery(req.params.username);
  if (!username) return res.status(400).json({ error: 'Invalid username' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, role')
    .eq('username', username)
    .in('role', ['influencer', 'admin'])
    .single();

  if (!profile) return res.status(404).json({ error: 'Expert not found' });

  const [alertsResponse, postsResponse, visibilityResponse, snapshotResponse] = await Promise.all([
    supabaseAdmin.from('alerts').select('*').eq('creator_id', profile.id).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('posts').select('*').eq('creator_id', profile.id).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('portfolio_visibility').select('visibility').eq('user_id', profile.id).single(),
    supabaseAdmin.from('portfolios_snapshot').select('total_value, change_pct_30d, assets, updated_at').eq('user_id', profile.id).single()
  ]);

  const visibility = visibilityResponse.data?.visibility ?? 'private';
  let publicPortfolioSummary: Record<string, unknown> | null = null;
  if (visibility !== 'private') {
    const allow = visibility !== 'friends' || (req.user && await isMutualFollow(req.user.id, profile.id));
    if (allow) {
      const snapshot = snapshotResponse.data;
      if (visibility === 'percent') {
        publicPortfolioSummary = {
          visibility,
          change_pct_30d: snapshot?.change_pct_30d ?? 0,
          top_assets_percent: (snapshot?.assets ?? []).map((asset: any) => ({ symbol: asset.symbol, pct: asset.pct })),
          as_of: snapshot?.updated_at ?? new Date().toISOString()
        };
      }
      if (visibility === 'public' || visibility === 'friends') {
        publicPortfolioSummary = {
          visibility,
          snapshot,
          as_of: snapshot?.updated_at ?? new Date().toISOString()
        };
      }
    }
  }

  return res.json({
    profile,
    recent_alerts: alertsResponse.data ?? [],
    recent_posts: postsResponse.data ?? [],
    public_portfolio_summary: publicPortfolioSummary,
    performance_summary: {
      methodology: 'Estimativa baseada em alertas fechados (alvo vs stop vs expiração).',
      sample_size: (alertsResponse.data ?? []).length,
      period: '30d',
      disclaimer: 'Histórico de desempenho (estimado). Não representa promessa de retorno.'
    }
  });
}
