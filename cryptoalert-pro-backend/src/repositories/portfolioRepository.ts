import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../errors/AppError.js';

export type PortfolioVisibility = 'private' | 'friends' | 'public' | 'percent';

export type PortfolioProfile = {
  id: string;
  username: string;
};

export type PortfolioSnapshot = {
  total_value?: number;
  change_pct_30d?: number;
  assets?: Array<{ symbol: string; pct: number }>;
  updated_at?: string;
};

export async function getPortfolioSnapshotByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new AppError(error.message, 500, { code: 'PORTFOLIO_SNAPSHOT_FETCH_FAILED' });
  }

  return data;
}

export async function upsertPortfolioVisibility(userId: string, visibility: PortfolioVisibility) {
  const { data, error } = await supabaseAdmin
    .from('portfolio_visibility')
    .upsert({ user_id: userId, visibility })
    .select()
    .single();

  if (error) {
    throw new AppError(error.message, 500, { code: 'PORTFOLIO_VISIBILITY_UPDATE_FAILED' });
  }

  return data;
}

export async function getProfileByUsername(username: string): Promise<PortfolioProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function getPortfolioVisibilityByUserId(userId: string): Promise<PortfolioVisibility> {
  const { data } = await supabaseAdmin
    .from('portfolio_visibility')
    .select('visibility')
    .eq('user_id', userId)
    .single();

  return (data?.visibility ?? 'private') as PortfolioVisibility;
}

export async function areUsersFriends(viewerId: string, profileId: string): Promise<boolean> {
  const { data: following } = await supabaseAdmin
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewerId)
    .eq('following_id', profileId)
    .maybeSingle();

  const { data: reciprocal } = await supabaseAdmin
    .from('follows')
    .select('following_id')
    .eq('follower_id', profileId)
    .eq('following_id', viewerId)
    .maybeSingle();

  return Boolean(following && reciprocal);
}

export async function getPublicPortfolioSnapshotByUserId(userId: string): Promise<PortfolioSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from('portfolios_snapshot')
    .select('total_value, change_pct_30d, assets, updated_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return data as PortfolioSnapshot;
}
