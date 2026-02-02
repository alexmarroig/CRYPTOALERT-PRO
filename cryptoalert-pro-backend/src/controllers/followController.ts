import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const followSchema = z.object({
  followingId: z.string().uuid(),
  followingType: z.enum(['user', 'influencer']).optional()
});

export async function follow(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = followSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', parse.data.followingId)
    .single();

  if (targetError || !target) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const followingType = parse.data.followingType ?? target.role;

  const { error } = await supabaseAdmin
    .from('follows')
    .insert({
      follower_id: req.user.id,
      following_id: parse.data.followingId,
      following_type: followingType
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ following_id: parse.data.followingId });
}

export async function unfollow(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { followingId } = req.params;
  const { error } = await supabaseAdmin
    .from('follows')
    .delete()
    .eq('follower_id', req.user.id)
    .eq('following_id', followingId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(204).send();
}

export async function listFollowing(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('follows')
    .select('following_id, following_type, created_at')
    .eq('follower_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ following: data });
}

export async function listFollowers(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('follows')
    .select('follower_id, following_type, created_at')
    .eq('following_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ followers: data });
}

export async function getFriendRanking(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1. Get list of following users
  const { data: following, error: followingError } = await supabaseAdmin
    .from('follows')
    .select('following_id')
    .eq('follower_id', req.user.id);

  if (followingError) {
    return res.status(500).json({ error: followingError.message });
  }

  const ids = (following ?? []).map((f) => f.following_id);
  ids.push(req.user.id); // Include self in ranking

  // 2. Get 30d performance for these users
  const { data: snapshots, error: snapshotError } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('user_id, change_pct_30d')
    .in('user_id', ids)
    .order('change_pct_30d', { ascending: false })
    .limit(100);

  if (snapshotError) {
    return res.status(500).json({ error: snapshotError.message });
  }

  return res.json({ ranking: snapshots });
}
