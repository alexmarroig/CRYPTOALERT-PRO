import { supabaseAdmin } from '../config/supabase.js';
import { decryptApiKey, encryptApiKey } from '../utils/encryption.js';
import { syncExchange } from '../utils/ccxt.js';

type Exchange = 'binance' | 'okx';
type LedgerType = 'trade' | 'deposit' | 'withdraw' | 'fee';

type LedgerEntry = {
  user_id: string;
  exchange: Exchange;
  asset: string;
  type: LedgerType;
  quantity: number;
  price: number;
  executed_at: string;
};

type HoldingSummary = {
  asset: string;
  quantity: number;
  averageCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  marketPrice: number;
  marketValue: number;
};

export const portfolioSyncDeps = {
  syncExchange,
  encryptApiKey,
  decryptApiKey
};

export async function testExchangeConnection(exchange: Exchange, apiKey: string, apiSecret: string) {
  await portfolioSyncDeps.syncExchange(exchange, { key: apiKey, secret: apiSecret });
}

export async function connectExchange(userId: string, exchange: Exchange, apiKey: string, apiSecret: string) {
  const encryptedSecret = portfolioSyncDeps.encryptApiKey(apiSecret);

  const { error } = await supabaseAdmin
    .from('exchange_connections')
    .upsert({
      user_id: userId,
      exchange,
      api_key: apiKey,
      api_secret_encrypted: encryptedSecret,
      permissions: 'read_only'
    }, { onConflict: 'user_id,exchange' });

  if (error) {
    throw error;
  }
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAsset(asset: unknown): string {
  return String(asset ?? '').toUpperCase();
}

export function reconcilePortfolio(ledgerEntries: LedgerEntry[], marketPrices: Record<string, number>): {
  holdings: HoldingSummary[];
  totals: {
    realizedPnl: number;
    unrealizedPnl: number;
    totalMarketValue: number;
  };
} {
  const grouped = new Map<string, HoldingSummary>();

  const orderedEntries = [...ledgerEntries].sort((a, b) =>
    new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
  );

  for (const entry of orderedEntries) {
    const asset = normalizeAsset(entry.asset);
    if (!asset) {
      continue;
    }

    const quantity = Math.abs(normalizeNumber(entry.quantity));
    const price = normalizeNumber(entry.price);

    if (!grouped.has(asset)) {
      grouped.set(asset, {
        asset,
        quantity: 0,
        averageCost: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        marketPrice: marketPrices[asset] ?? 0,
        marketValue: 0
      });
    }

    const current = grouped.get(asset)!;

    if (entry.type === 'trade') {
      if (normalizeNumber(entry.quantity) >= 0) {
        const totalCost = (current.averageCost * current.quantity) + (quantity * price);
        current.quantity += quantity;
        current.averageCost = current.quantity > 0 ? totalCost / current.quantity : 0;
      } else {
        const sellQty = Math.min(quantity, current.quantity);
        current.realizedPnl += sellQty * (price - current.averageCost);
        current.quantity -= sellQty;
        if (current.quantity <= 0) {
          current.quantity = 0;
          current.averageCost = 0;
        }
      }
    }

    if (entry.type === 'deposit') {
      const totalCost = (current.averageCost * current.quantity) + (quantity * price);
      current.quantity += quantity;
      current.averageCost = current.quantity > 0 ? totalCost / current.quantity : 0;
    }

    if (entry.type === 'withdraw') {
      const withdrawQty = Math.min(quantity, current.quantity);
      current.quantity -= withdrawQty;
      if (current.quantity <= 0) {
        current.quantity = 0;
        current.averageCost = 0;
      }
    }

    if (entry.type === 'fee') {
      current.realizedPnl -= quantity * price;
    }
  }

  const holdings = [...grouped.values()].map((holding) => {
    const marketPrice = marketPrices[holding.asset] ?? holding.marketPrice ?? 0;
    const marketValue = holding.quantity * marketPrice;
    const unrealizedPnl = holding.quantity * (marketPrice - holding.averageCost);

    return {
      ...holding,
      marketPrice,
      marketValue,
      unrealizedPnl
    };
  }).sort((a, b) => b.marketValue - a.marketValue);

  const totals = holdings.reduce((acc, holding) => ({
    realizedPnl: acc.realizedPnl + holding.realizedPnl,
    unrealizedPnl: acc.unrealizedPnl + holding.unrealizedPnl,
    totalMarketValue: acc.totalMarketValue + holding.marketValue
  }), {
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalMarketValue: 0
  });

  return { holdings, totals };
}

export async function syncPortfolioSnapshot(userId: string) {
  const { data: connections, error } = await supabaseAdmin
    .from('exchange_connections')
    .select('exchange, api_key, api_secret_encrypted')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const assets = [];
  for (const connection of connections ?? []) {
    const secret = portfolioSyncDeps.decryptApiKey(connection.api_secret_encrypted);
    const holdings = await portfolioSyncDeps.syncExchange(connection.exchange, {
      key: connection.api_key,
      secret
    });
    assets.push(...holdings.map((holding) => ({ ...holding, exchange: connection.exchange })));
  }

  const { data: ledgerEntries, error: ledgerError } = await supabaseAdmin
    .from('portfolio_ledger')
    .select('user_id, exchange, asset, type, quantity, price, executed_at')
    .eq('user_id', userId);

  if (ledgerError) {
    throw ledgerError;
  }

  const marketPrices = Object.fromEntries(
    assets.map((asset) => [normalizeAsset(asset.symbol), normalizeNumber(asset.value) / Math.max(normalizeNumber(asset.amount), 1e-8)])
  ) as Record<string, number>;

  const reconciliation = reconcilePortfolio((ledgerEntries ?? []) as LedgerEntry[], marketPrices);

  const totalValue = assets.reduce((sum, asset) => sum + (asset.value ?? 0), 0);
  const normalizedAssets = assets.map((asset) => ({
    symbol: asset.symbol,
    qty: asset.amount,
    value: asset.value,
    exchange: asset.exchange,
    pct: totalValue > 0 ? (asset.value / totalValue) * 100 : 0
  }));

  const nowIso = new Date().toISOString();

  const { error: upsertError, data } = await supabaseAdmin
    .from('portfolios_snapshot')
    .upsert({
      user_id: userId,
      total_value: totalValue,
      change_pct_30d: 0,
      assets: normalizedAssets,
      realized_pnl: reconciliation.totals.realizedPnl,
      unrealized_pnl: reconciliation.totals.unrealizedPnl,
      holdings: reconciliation.holdings,
      updated_at: nowIso
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (upsertError) {
    throw upsertError;
  }

  const { error: historyError } = await supabaseAdmin
    .from('portfolios_history')
    .insert({
      user_id: userId,
      total_value: totalValue,
      assets: normalizedAssets,
      created_at: nowIso
    });

  if (historyError) {
    throw historyError;
  }

  // Update streaks and points
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('points, streak_days, last_sync_at')
    .eq('id', userId)
    .single();

  if (profile) {
    const newPoints = (profile.points ?? 0) + 10;
    let newStreak = profile.streak_days ?? 0;
    const now = new Date();
    const lastSync = profile.last_sync_at ? new Date(profile.last_sync_at) : null;

    if (!lastSync) {
      newStreak = 1;
    } else {
      const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24 && diffHours < 48) {
        newStreak += 1;
      } else if (diffHours >= 48) {
        newStreak = 1;
      }
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        points: newPoints,
        streak_days: newStreak,
        last_sync_at: now.toISOString()
      })
      .eq('id', userId);
  }

  return data;
}
