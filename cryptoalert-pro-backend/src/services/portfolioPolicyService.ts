import { AppError } from '../errors/AppError.js';
import { areUsersFriends, type PortfolioVisibility } from '../repositories/portfolioRepository.js';

export async function enforcePortfolioVisibilityPolicy({
  mode,
  viewerId,
  profileId
}: {
  mode: PortfolioVisibility;
  viewerId?: string;
  profileId: string;
}) {
  if (mode === 'private') {
    throw new AppError('Portfolio is private', 403, { code: 'PORTFOLIO_PRIVATE' });
  }

  if (mode === 'friends') {
    if (!viewerId) {
      throw new AppError('Friends-only portfolio', 403, { code: 'PORTFOLIO_FRIENDS_ONLY' });
    }

    // Friends visibility requires a reciprocal follow relation between both users.
    const friends = await areUsersFriends(viewerId, profileId);
    if (!friends) {
      throw new AppError('Friends-only portfolio', 403, { code: 'PORTFOLIO_FRIENDS_ONLY' });
    }
  }
}

export function buildPercentVisibilitySnapshot(snapshot: {
  change_pct_30d?: number;
  assets?: Array<{ symbol: string; pct: number }>;
  updated_at?: string;
}) {
  // Percent mode intentionally exposes allocation percentages while hiding total values.
  const topAssets = (snapshot.assets ?? []).map((asset) => ({
    symbol: asset.symbol,
    pct: asset.pct
  }));

  return {
    change_pct_30d: snapshot.change_pct_30d ?? 0,
    top_assets_percent: topAssets,
    as_of: snapshot.updated_at ?? new Date().toISOString()
  };
}
