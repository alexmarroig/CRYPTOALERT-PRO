import { supabaseAdmin } from '../config/supabase.js';
import { decryptApiKey, encryptApiKey } from '../utils/encryption.js';
import { syncExchange } from '../utils/ccxt.js';

type Exchange = 'binance' | 'okx';

export async function testExchangeConnection(exchange: Exchange, apiKey: string, apiSecret: string) {
  await syncExchange(exchange, { key: apiKey, secret: apiSecret });
}

export async function connectExchange(userId: string, exchange: Exchange, apiKey: string, apiSecret: string) {
  const encryptedSecret = encryptApiKey(apiSecret);

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
    const secret = decryptApiKey(connection.api_secret_encrypted);
    const holdings = await syncExchange(connection.exchange, {
      key: connection.api_key,
      secret
    });
    assets.push(...holdings);
  }

  const totalValue = assets.reduce((sum, asset) => sum + (asset.value ?? 0), 0);
  const normalizedAssets = assets.map((asset) => ({
    symbol: asset.symbol,
    qty: asset.amount,
    value: asset.value,
    pct: totalValue > 0 ? (asset.value / totalValue) * 100 : 0
  }));

  const { error: upsertError, data } = await supabaseAdmin
    .from('portfolios_snapshot')
    .upsert({
      user_id: userId,
      total_value: totalValue,
      change_pct_30d: 0,
      assets: normalizedAssets,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (upsertError) {
    throw upsertError;
  }

  return data;
}
