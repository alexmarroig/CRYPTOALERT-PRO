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
  entry: z.number().optional(),
  take_profit: z.number().optional(),
  stop_loss: z.number().optional(),
  confidence_pct: z.number().int().min(0).max(100).optional(),
  confidence_score: z.number().int().min(0).max(100).optional(),
  reason_text: z.string().optional(),
  explainability: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'closed'])
});

export const alertsControllerDeps = { notifyFollowers };

function toUiAlert(row: any, creator: any) {
  return {
    id: row.id,
    creator: {
      id: creator?.id ?? row.creator_id,
      username: creator?.username ?? null,
      display_name: creator?.display_name ?? null
    },
    asset: row.asset,
    side: row.side,
    reference_price: row.ref_price ?? null,
    target_price: row.target_price ?? null,
    stop_price: row.stop_price ?? null,
    entry: row.ref_price ?? null,
    take_profit: row.target_price ?? null,
    stop_loss: row.stop_price ?? null,
    confidence_score: row.confidence_pct ?? null,
    confidence_pct: row.confidence_pct ?? null,
    explainability: row.reason_text ?? null,
    reason: row.reason_text ?? null,
    status: row.status,
    created_at: row.created_at
  };
}

export async function listAlerts(req: Request, res: Response) {
  const { filter = 'all', scope = 'all', creator, status = 'active' } = req.query as Record<string, string>;

  let query = supabaseAdmin.from('alerts').select('*');
  if (filter === 'buy' || filter === 'sell') query = query.eq('side', filter);
  if (status === 'active' || status === 'closed') query = query.eq('status', status);
  if (scope === 'creator' && creator) query = query.eq('creator_id', creator);

  if (scope === 'following') {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { data: following } = await supabaseAdmin.from('follows').select('following_id').eq('follower_id', req.user.id).eq('following_type', 'influencer');
    const ids = (following ?? []).map((row) => row.following_id);
    query = query.in('creator_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const creatorIds = [...new Set((data ?? []).map((item) => item.creator_id))];
  const { data: creators } = await supabaseAdmin.from('profiles').select('id, username, display_name').in('id', creatorIds.length ? creatorIds : ['00000000-0000-0000-0000-000000000000']);
  const creatorMap = new Map((creators ?? []).map((item) => [item.id, item]));

  return res.json({ alerts: (data ?? []).map((item) => toUiAlert(item, creatorMap.get(item.creator_id))) });
}

export async function createAlert(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const parse = createAlertSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('alerts')
    .insert({
      creator_id: req.user.id,
      asset: parse.data.asset,
      side: parse.data.side,
      ref_price: parse.data.entry ?? parse.data.ref_price,
      target_price: parse.data.take_profit ?? parse.data.target_price,
      stop_price: parse.data.stop_loss ?? parse.data.stop_price,
      confidence_pct: parse.data.confidence_score ?? parse.data.confidence_pct,
      reason_text: parse.data.explainability ?? parse.data.reason_text
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  logger.info('audit.alert.create', { alert_id: data.id, creator_id: req.user.id, informative: true });

  await alertsControllerDeps.notifyFollowers(req.user.id, {
    title: `Novo alerta informativo de ${parse.data.asset}`,
    body: `${parse.data.side === 'buy' ? 'Compra' : 'Venda'} · conteúdo informativo`,
    data: { alert_id: data.id }
  });

  return res.status(201).json({ alert: toUiAlert(data, { id: req.user.id, username: req.user.username, display_name: req.user.username }) });
}

export async function updateAlertStatus(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const parse = updateStatusSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('alerts')
    .update({ status: parse.data.status })
    .eq('id', req.params.id)
    .eq('creator_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Alert not found for this user' });

  return res.json({ alert: data });
}
