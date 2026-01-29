import type { NextFunction, Request, Response } from 'express';
import ccxt from 'ccxt';

export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const { exchange, api_key, api_secret } = req.body as {
    exchange?: string;
    api_key?: string;
    api_secret?: string;
  };

  if (!exchange || !api_key || !api_secret) {
    return res.status(400).json({ error: 'Missing API credentials' });
  }

  try {
    const exchangeInstance = new ccxt[exchange]({
      apiKey: api_key,
      secret: api_secret,
      options: { defaultType: 'spot' }
    });

    await exchangeInstance.fetchBalance();
    return next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid API credentials' });
  }
}
