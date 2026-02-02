import { supabaseAdmin } from '../config/supabase.js';
import { sendPushNotification } from './notifyService.js';

export async function checkPortfolioAlerts(userId: string, currentValue: number, currentAssets: any[]) {
  // 1. Get last snapshot from history (e.g., from 1 hour ago)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: history } = await supabaseAdmin
    .from('portfolios_history')
    .select('total_value, assets')
    .eq('user_id', userId)
    .lte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (history) {
    const prevValue = Number(history.total_value);
    const dropPct = ((prevValue - currentValue) / prevValue) * 100;

    if (dropPct >= 5) {
      await sendPushNotification(userId, {
        title: '⚠️ Alerta de Patrimônio',
        body: `Seu patrimônio caiu ${dropPct.toFixed(2)}% na última hora!`,
        data: { type: 'portfolio_drop', value: currentValue }
      });
    }

    // Check specific positions (e.g., -10% in a specific coin)
    // This requires more complex mapping between currentAssets and history.assets
    // For MVP, total drop is the priority.
  }

  // Always save current to history
  await supabaseAdmin.from('portfolios_history').insert({
    user_id: userId,
    total_value: currentValue,
    assets: currentAssets
  });
}
