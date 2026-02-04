import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const expertsQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional()
});

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function sanitizeQuery(value?: string) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[^\p{L}\p{N}\s_-]/gu, '');
  if (!cleaned) return undefined;
  return cleaned.slice(0, 60);
}

function parseNumber(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 0), max);
}

async function getFollowerCount(userId: string) {
  const { count } = await supabaseAdmin
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', userId);
  return count ?? 0;
}

async function getPostsCount(userId: string) {
  const { count } = await supabaseAdmin
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', userId);
  return count ?? 0;
}

async function getActiveAlertsCount(userId: string) {
  const { count } = await supabaseAdmin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', userId)
    .eq('status', 'active');
  return count ?? 0;
}

export async function listExperts(req: Request, res: Response) {
  const parse = expertsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const limit = parseNumber(parse.data.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseNumber(parse.data.offset, 0, 1000);
  const search = sanitizeQuery(parse.data.query);

  let query = supabaseAdmin
    .from('profiles')
    .select('*')
    .in('role', ['influencer', 'admin'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  const { data: profiles, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const ids = (profiles ?? []).map((profile) => profile.id);
  const { data: visibilityRows } = await supabaseAdmin
    .from('portfolio_visibility')
    .select('user_id, visibility')
    .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);

  const visibilityMap = new Map(
    (visibilityRows ?? []).map((row) => [row.user_id, row.visibility ?? 'private'])
  );

  const enriched = await Promise.all((profiles ?? []).map(async (profile) => {
    const [followers_count, posts_count, active_alerts_count] = await Promise.all([
      getFollowerCount(profile.id),
      getPostsCount(profile.id),
      getActiveAlertsCount(profile.id)
    ]);

    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url ?? null,
      bio: profile.bio ?? null,
      is_verified: profile.is_verified ?? false,
      followers_count,
      posts_count,
      active_alerts_count,
      portfolio_visibility_hint: visibilityMap.get(profile.id) ?? 'private',
      last_active_at: profile.last_active_at ?? null,
      public_label: 'expert' as const
    };
  }));

  return res.json({
    experts: enriched,
    meta: {
      limit,
      offset
    }
  });
}

export async function getExpertProfile(req: Request, res: Response) {
  const { username } = req.params;
  const sanitizedUsername = sanitizeQuery(username);

  if (!sanitizedUsername) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('username', sanitizedUsername)
    .in('role', ['influencer', 'admin'])
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Expert not found' });
  }

  const [alertsResponse, postsResponse, visibilityResponse, snapshotResponse] = await Promise.all([
    supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('creator_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('posts')
      .select('*')
      .eq('creator_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('portfolio_visibility')
      .select('visibility')
      .eq('user_id', profile.id)
      .single(),
    supabaseAdmin
      .from('portfolios_snapshot')
      .select('total_value, change_pct_30d, assets, updated_at')
      .eq('user_id', profile.id)
      .single()
  ]);

  const visibility = visibilityResponse.data?.visibility ?? 'private';
  let publicPortfolioSummary: Record<string, unknown> | null = null;

  if (visibility !== 'private') {
    const shouldAllow =
      visibility !== 'friends'
      || (req.user && await isMutualFollow(req.user.id, profile.id));

    if (shouldAllow) {
      const snapshot = snapshotResponse.data;
      const asOf = snapshot?.updated_at ?? new Date().toISOString();
      const currency = process.env.PORTFOLIO_CURRENCY ?? 'USD';

      if (visibility === 'percent') {
        publicPortfolioSummary = {
          visibility,
          change_pct_30d: snapshot?.change_pct_30d ?? 0,
          top_assets_percent: (snapshot?.assets ?? []).map((asset: { symbol: string; pct: number }) => ({
            symbol: asset.symbol,
            pct: asset.pct
          })),
          currency,
          as_of: asOf
        };
      } else if (visibility === 'public') {
        publicPortfolioSummary = {
          visibility,
          snapshot,
          currency,
          as_of: asOf
        };
      }
    }
  }

  return res.json({
    profile: {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url ?? null,
      bio: profile.bio ?? null,
      is_verified: profile.is_verified ?? false,
      public_label: 'expert'
    },
    recent_alerts: alertsResponse.data ?? [],
    recent_posts: postsResponse.data ?? [],
    public_portfolio_summary: publicPortfolioSummary
  });
}

async function isMutualFollow(requesterId: string, targetId: string) {
  const [{ data: following }, { data: reciprocal }] = await Promise.all([
    supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', requesterId)
      .eq('following_id', targetId)
      .maybeSingle(),
    supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', targetId)
      .eq('following_id', requesterId)
      .maybeSingle()
  ]);

  return Boolean(following && reciprocal);
}
