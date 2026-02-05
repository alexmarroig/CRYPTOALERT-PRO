import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyFollowers } from '../services/notifyService.js';
import { logger } from '../utils/logger.js';

const createAlertSchema = z.object({
  asset: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  ref_price: z.number().optional(),
  target_price: z.number().optional(),
  stop_price: z.number().optional(),
  confidence_pct: z.number().int().min(0).max(100).optional(),
  reason_text: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'closed'])
});

export async function listAlerts(req: Request, res: Response) {
  const { filter = 'all', scope = 'all', creator, status = 'active' } = req.query as Record<string, string>;

  let query = supabaseAdmin.from('alerts').select('*');

  if (filter === 'buy' || filter === 'sell') {
    query = query.eq('side', filter);
  }

  if (status === 'active' || status === 'closed') {
    query = query.eq('status', status);
  }

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
      .eq('follower_id', req.user.id)
      .eq('following_type', 'influencer');

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

  return res.json({ alerts: data });
}

export async function createAlert(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = createAlertSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('alerts')
    .insert({
      creator_id: req.user.id,
      asset: parse.data.asset,
      side: parse.data.side,
      ref_price: parse.data.ref_price,
      target_price: parse.data.target_price,
      stop_price: parse.data.stop_price,
      confidence_pct: parse.data.confidence_pct,
      reason_text: parse.data.reason_text
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  logger.info('audit.alert.create', { alert_id: data.id, creator_id: req.user.id });

  await notifyFollowers(req.user.id, {
    title: `Novo alerta de ${parse.data.asset}`,
    body: `${parse.data.side === 'buy' ? 'Compra' : 'Venda'} · confira agora`,
    data: { alert_id: data.id }
  });

  return res.status(201).json({ alert: data });
}

export async function updateAlertStatus(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = updateStatusSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('alerts')
    .update({ status: parse.data.status })
    .eq('id', id)
    .eq('creator_id', req.user.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: 'Alert not found for this user' });
  }

  return res.json({ alert: data });
}
