import type { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

export async function getInfluencerMetrics(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ count: followers }, { count: alerts }, { count: posts }] = await Promise.all([
    supabaseAdmin
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', req.user.id),
    supabaseAdmin
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', req.user.id)
      .gte('created_at', since.toISOString()),
    supabaseAdmin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', req.user.id)
      .gte('created_at', since.toISOString())
  ]);

  return res.json({
    followers_count: followers ?? 0,
    alerts_count_30d: alerts ?? 0,
    posts_count_30d: posts ?? 0,
    performance_methodology: {
      methodology: 'Estimativa baseada em alertas fechados (alvo vs stop vs expiração). Sem promessa de retorno.',
      sample_size: alerts ?? 0,
      period: '30d',
      disclaimer: 'Histórico estimado. Resultados passados não garantem retornos futuros.'
    }
  });
}
