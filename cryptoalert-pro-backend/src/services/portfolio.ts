import { supabase } from '../config/supabase.js';
import { encryptApiKey } from '../utils/encryption.js';
import { syncExchange } from '../utils/ccxt.js';

export class PortfolioService {
  async syncExchange(userId: string, exchange: string, apiKey: string, secret: string) {
    const portfolio = await syncExchange(exchange, { key: apiKey, secret });

    const encryptedKeys = {
      [exchange]: {
        key: encryptApiKey(apiKey),
        secret: encryptApiKey(secret)
      }
    };

    const { error } = await supabase
      .from('users')
      .update({ api_keys: encryptedKeys })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return portfolio;
  }
}
