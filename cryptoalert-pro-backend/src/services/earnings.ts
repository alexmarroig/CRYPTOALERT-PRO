import { supabase } from '../config/supabase.js';

export class EarningsService {
  async calculateInfluencerEarnings(influencerId: string) {
    const { data: proSubs } = await supabase
      .from('influencer_earnings')
      .select('amount')
      .eq('influencer_id', influencerId)
      .eq('revenue_type', 'pro_sub');

    const { data: vipSubs } = await supabase
      .from('influencer_earnings')
      .select('amount')
      .eq('influencer_id', influencerId)
      .eq('revenue_type', 'vip_sub');

    const { data: referrals } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .eq('referred_by', influencerId);

    const proRevenue = (proSubs ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const vipRevenue = (vipSubs ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const proShare = proRevenue * 0.7;
    const vipShare = vipRevenue * 0.3;
    const referralBonus = (referrals?.length ?? 0) * 25;
    const total = proShare + vipShare + referralBonus;

    return { proShare, vipShare, referralBonus, total };
  }
}
