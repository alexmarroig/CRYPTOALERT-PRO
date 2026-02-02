import { supabaseAdmin } from '../config/supabase.js';

export async function updateInfluencerStats(influencerId: string) {
  const { data: alerts, error } = await supabaseAdmin
    .from('alerts')
    .select('side, ref_price, close_price')
    .eq('creator_id', influencerId)
    .eq('status', 'closed')
    .not('close_price', 'is', null)
    .not('ref_price', 'is', null);

  if (error || !alerts || alerts.length === 0) return;

  let totalRoi = 0;
  let wins = 0;
  let maxDrawdown = 0;

  alerts.forEach((alert) => {
    const ref = Number(alert.ref_price);
    const close = Number(alert.close_price);
    let roi = 0;

    if (alert.side === 'buy') {
      roi = ((close - ref) / ref) * 100;
    } else {
      roi = ((ref - close) / ref) * 100;
    }

    totalRoi += roi;
    if (roi > 0) wins++;
    if (roi < maxDrawdown) maxDrawdown = roi;
  });

  const winRate = (wins / alerts.length) * 100;
  const avgRoi = totalRoi / alerts.length;

  await supabaseAdmin
    .from('influencer_metrics')
    .upsert({
      influencer_id: influencerId,
      win_rate: winRate,
      avg_roi: avgRoi,
      max_drawdown: Math.abs(maxDrawdown),
      updated_at: new Date().toISOString()
    }, { onConflict: 'influencer_id' });
}
