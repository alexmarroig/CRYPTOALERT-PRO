import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const rankingQuerySchema = z.object({
  limit: z.string().optional()
});

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

function parseLimit(value?: string) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export async function getSocialRanking(req: Request, res: Response) {
  const parse = rankingQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const limit = parseLimit(parse.data.limit);

  const { data: visibilityRows, error: visibilityError } = await supabaseAdmin
    .from('portfolio_visibility')
    .select('user_id, visibility')
    .in('visibility', ['public', 'percent']);

  if (visibilityError) {
    return res.status(500).json({ error: visibilityError.message });
  }

  const visibilityMap = new Map(
    (visibilityRows ?? []).map((row) => [row.user_id, row.visibility])
  );

  if (visibilityMap.size === 0) {
    return res.json({ ranking: [] });
  }

  const { data: snapshots, error: snapshotError } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('user_id, total_value, change_pct_30d, updated_at')
    .in('user_id', Array.from(visibilityMap.keys()))
    .not('change_pct_30d', 'is', null)
    .order('change_pct_30d', { ascending: false })
    .limit(limit);

  if (snapshotError) {
    return res.status(500).json({ error: snapshotError.message });
  }

  const userIds = (snapshots ?? []).map((row) => row.user_id);

  if (userIds.length === 0) {
    return res.json({ ranking: [] });
  }

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name')
    .in('id', userIds);

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  const ranking = (snapshots ?? []).map((snapshot, index) => {
    const profile = profileMap.get(snapshot.user_id);
    const visibility = visibilityMap.get(snapshot.user_id);

    return {
      rank: index + 1,
      user_id: snapshot.user_id,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      change_pct_30d: snapshot.change_pct_30d,
      total_value: visibility === 'public' ? snapshot.total_value : null,
      visibility,
      updated_at: snapshot.updated_at
    };
  });

  return res.json({ ranking });
}
