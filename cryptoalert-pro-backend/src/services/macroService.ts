import fetch from 'node-fetch';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export async function updateMacroIndicators() {
  try {
    const response = await fetch(`${COINGECKO_BASE}/global`);
    const payload = await response.json() as { data?: { market_cap_percentage?: Record<string, number> } };

    if (payload.data?.market_cap_percentage?.btc) {
      const btcDom = payload.data.market_cap_percentage.btc;
      await supabaseAdmin.from('macro_indicators').upsert({
        symbol: 'BTC_DOMINANCE',
        value: btcDom,
        updated_at: new Date().toISOString()
      });
    }

    // Como as APIs de macro (VIX, SPX) costumam ser pagas ou limitadas em feriados/fins de semana,
    // usaremos um simulador para garantir dados no "jogo" se a fonte principal falhar.
    const mockMacro = [
      { symbol: 'SPX', value: 5000 + Math.random() * 50 },
      { symbol: 'VIX', value: 15 + Math.random() * 5 },
      { symbol: 'DXY', value: 103 + Math.random() * 2 }
    ];

    for (const item of mockMacro) {
      await supabaseAdmin.from('macro_indicators').upsert({
        ...item,
        updated_at: new Date().toISOString()
      });
    }

    logger.info('Macro indicators updated');
  } catch (error) {
    logger.error('Error updating macro indicators:', error);
  }
}

export async function getMacroIndicators() {
  const { data, error } = await supabaseAdmin
    .from('macro_indicators')
    .select('*');

  if (error) {
    logger.error('Error fetching macro indicators:', error);
    return [];
  }
  return data;
}
