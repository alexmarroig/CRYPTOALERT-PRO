import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

async function ensureProfile(userId: string, email: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, role, plan')
    .eq('id', userId)
    .single();

  const { data: whitelist } = await supabaseAdmin
    .from('admin_whitelist')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  const role = whitelist ? 'admin' : profile?.role ?? 'user';
  if (!profile) {
    const username = email.split('@')[0]?.toLowerCase() ?? `user-${userId.slice(0, 8)}`;
    const { data: inserted } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email,
        username,
        display_name: username,
        role,
        plan: 'free'
      })
      .select('id, email, username, role, plan')
      .single();
    return inserted ?? { id: userId, email, username, role, plan: 'free' as const };
  }

  if (whitelist && profile.role !== 'admin') {
    const { data: updated } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId)
      .select('id, email, username, role, plan')
      .single();
    return updated ?? { ...profile, role: 'admin' };
  }

  return profile;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user || !data.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const profile = await ensureProfile(data.user.id, data.user.email);
  if (!profile) {
    return res.status(500).json({ error: 'Failed to load profile' });
  }

  req.authToken = token;
  req.user = {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    role: profile.role,
    plan: profile.plan
  };

  return next();
}
