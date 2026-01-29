import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { EarningsService } from '../services/earnings.js';

const earningsService = new EarningsService();

export async function getEarnings(req: Request, res: Response) {
  const totals = await earningsService.calculateInfluencerEarnings(req.user?.id ?? '');
  return res.json(totals);
}

export async function requestPayout(req: Request, res: Response) {
  const { error } = await supabase
    .from('influencer_earnings')
    .update({ payout_status: 'requested' })
    .eq('influencer_id', req.user?.id)
    .eq('payout_status', 'pending');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ status: 'requested' });
}

export async function getStats(req: Request, res: Response) {
  const influencerId = req.user?.id;

  const { data: signals } = await supabase
    .from('signals')
    .select('id, status, win_rate')
    .eq('influencer_id', influencerId);

  const { data: referred } = await supabase
    .from('users')
    .select('id')
    .eq('referred_by', influencerId);

  const totalSignals = signals?.length ?? 0;
  const winRate = signals?.reduce((sum, signal) => sum + Number(signal.win_rate ?? 0), 0) / (totalSignals || 1);

  return res.json({
    totalSignals,
    totalUsers: referred?.length ?? 0,
    conversionRate: (referred?.length ?? 0) / (totalSignals || 1),
    averageWinRate: Number.isFinite(winRate) ? winRate : 0
  });
}
