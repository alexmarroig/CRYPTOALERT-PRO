import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const profileSchema = z.object({
  display_name: z.string().min(2).max(120).optional(),
  bio: z.string().max(600).optional(),
  links: z.array(z.string().url()).max(5).optional(),
  specialties: z.array(z.string().max(40)).max(10).optional(),
  risk_style: z.enum(['conservative', 'moderate', 'aggressive']).optional()
});

const bulkAlertSchema = z.object({
  alerts: z.array(z.object({
    asset: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    entry: z.number().optional(),
    take_profit: z.number().optional(),
    stop_loss: z.number().optional(),
    confidence_score: z.number().min(0).max(100).optional(),
    explainability: z.string().max(500).optional()
  })).min(1).max(20)
});

export async function getExpertDashboard(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ count: followers }, { data: alerts }, { count: closedAlerts }] = await Promise.all([
    supabaseAdmin.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', req.user.id),
    supabaseAdmin.from('alerts').select('id, asset, status').eq('creator_id', req.user.id),
    supabaseAdmin.from('alerts').select('id', { count: 'exact', head: true }).eq('creator_id', req.user.id).eq('status', 'closed').gte('created_at', since.toISOString())
  ]);

  const activeAlerts = (alerts ?? []).filter((alert) => alert.status === 'active');
  const topAssets = activeAlerts.reduce<Record<string, number>>((acc, alert) => {
    const asset = String(alert.asset ?? '').toUpperCase();
    if (!asset) return acc;
    acc[asset] = (acc[asset] ?? 0) + 1;
    return acc;
  }, {});

  return res.json({
    dashboard: {
      my_followers: followers ?? 0,
      active_alerts: activeAlerts.length,
      closed_alerts_30d: closedAlerts ?? 0,
      avg_return_estimate: null,
      engagement: {
        followers_growth_hint: 'Acompanhe alertas fechados para manter engajamento.'
      },
      top_assets: Object.entries(topAssets).map(([asset, count]) => ({ asset, count }))
    }
  });
}

export async function updateExpertProfile(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      display_name: parsed.data.display_name,
      bio: parsed.data.bio,
      links: parsed.data.links,
      specialties: parsed.data.specialties,
      risk_style: parsed.data.risk_style,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.user.id)
    .select('id, username, display_name, bio, links, specialties, risk_style')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ profile: data });
}

export async function createBulkAlerts(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = bulkAlertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payload = parsed.data.alerts.map((alert) => ({
    creator_id: req.user!.id,
    asset: alert.asset,
    side: alert.side,
    ref_price: alert.entry,
    target_price: alert.take_profit,
    stop_price: alert.stop_loss,
    confidence_pct: alert.confidence_score,
    reason_text: alert.explainability
  }));

  const { data, error } = await supabaseAdmin.from('alerts').insert(payload).select();
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ alerts: data ?? [] });
}
