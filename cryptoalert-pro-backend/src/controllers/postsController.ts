import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyFollowers } from '../services/notifyService.js';

const createPostSchema = z.object({
  text: z.string().min(1)
});

export async function listPosts(req: Request, res: Response) {
  const { scope = 'all', creator } = req.query as Record<string, string>;

  let query = supabaseAdmin.from('posts').select('*');

  if (scope === 'creator' && creator) {
    query = query.eq('creator_id', creator);
  }

  if (scope === 'following') {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: following, error } = await supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const ids = (following ?? []).map((row) => row.following_id);
    query = query.in('creator_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ posts: data });
}

export async function createPost(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = createPostSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .insert({
      creator_id: req.user.id,
      text: parse.data.text
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  await notifyFollowers(req.user.id, {
    title: 'Novo post do influencer',
    body: parse.data.text.slice(0, 80),
    data: { post_id: data.id }
  });

  return res.status(201).json({ post: data });
}
