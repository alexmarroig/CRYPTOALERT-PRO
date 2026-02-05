import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { createInvite, revokeInvite } from '../services/inviteService.js';
import { logger } from '../utils/logger.js';

const inviteSchema = z.object({
  email: z.string().email()
});

export const adminControllerDeps = {
  createInvite,
  revokeInvite
};

export async function createInfluencerInvite(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  try {
    const invite = await adminControllerDeps.createInvite(parse.data.email, req.user.id);
    logger.info('audit.invite.create', { invite_id: invite.id, invited_by: req.user.id });
    return res.status(201).json({ invite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invite';
    return res.status(500).json({ error: message });
  }
}

export async function listInvites(_req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ invites: data });
}

export async function revokeInfluencerInvite(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const invite = await adminControllerDeps.revokeInvite(id);
    logger.info('audit.invite.revoke', { invite_id: invite.id, revoked_by: req.user?.id ?? null });
    return res.json({ invite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke invite';
    return res.status(500).json({ error: message });
  }
}

export async function listInfluencers(_req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, display_name, plan, role, created_at')
    .eq('role', 'influencer')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ influencers: data });
}
