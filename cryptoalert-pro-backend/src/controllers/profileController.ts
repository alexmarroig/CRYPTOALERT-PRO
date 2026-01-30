import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const updateProfileSchema = z.object({
  display_name: z.string().min(1).optional(),
  language: z.enum(['pt', 'en']).optional(),
  username: z.string().min(3).optional()
});

export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, display_name, language, plan, role, created_at')
    .eq('id', req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ profile: data });
}

export async function updateMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = updateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(parse.data)
    .eq('id', req.user.id)
    .select('id, email, username, display_name, language, plan, role')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ profile: data });
}
