import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const rankingQuerySchema = z.object({ limit: z.string().optional() });
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

function parseLimit(value?: string) {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export async function getSocialRanking(req: Request, res: Response) {
  const parse = rankingQuerySchema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const limit = parseLimit(parse.data.limit);
  const { data: visibilityRows, error: visibilityError } = await supabaseAdmin
    .from('portfolio_visibility')
    .select('user_id, visibility')
    .in('visibility', ['public', 'percent', 'friends']);

  if (visibilityError) return res.status(500).json({ error: visibilityError.message });

  const visibilityMap = new Map((visibilityRows ?? []).map((row) => [row.user_id, row.visibility]));
  if (!visibilityMap.size) return res.json({ ranking: [] });

  const userIds = Array.from(visibilityMap.keys());
  const [{ data: snapshots, error: snapshotError }, { data: profiles, error: profileError }] = await Promise.all([
    supabaseAdmin.from('portfolios_snapshot').select('user_id, change_pct_30d, updated_at').in('user_id', userIds).not('change_pct_30d', 'is', null).order('change_pct_30d', { ascending: false }).limit(limit),
    supabaseAdmin.from('profiles').select('id, username, display_name').in('id', userIds)
  ]);

  if (snapshotError || profileError) return res.status(500).json({ error: snapshotError?.message ?? profileError?.message });

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const ranking = (snapshots ?? []).map((snapshot, index) => ({
    rank: index + 1,
    user_id: snapshot.user_id,
    username: profileMap.get(snapshot.user_id)?.username ?? null,
    display_name: profileMap.get(snapshot.user_id)?.display_name ?? null,
    change_pct_30d: snapshot.change_pct_30d,
    visibility: visibilityMap.get(snapshot.user_id) ?? 'private',
    updated_at: snapshot.updated_at
  }));

  return res.json({ ranking });
}
