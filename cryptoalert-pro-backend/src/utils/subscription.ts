import { supabase } from '../config/supabase.js';

export type SubscriptionTier = 'free' | 'pro' | 'vip';

export async function getSubscriptionTier(userId?: string | null): Promise<SubscriptionTier> {
  if (!userId) {
    return 'free';
  }

  const { data, error } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  if (error) {
    return 'free';
  }

  return (data?.subscription_tier as SubscriptionTier) ?? 'free';
}
