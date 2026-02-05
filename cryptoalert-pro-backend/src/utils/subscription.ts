import { supabaseAdmin } from '../config/supabase.js';

export type SubscriptionTier = 'free' | 'pro' | 'vip';

export async function getSubscriptionTier(userId?: string | null): Promise<SubscriptionTier> {
  if (!userId) {
    return 'free';
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();

  if (error) {
    return 'free';
  }

  return (data?.plan as SubscriptionTier) ?? 'free';
}
