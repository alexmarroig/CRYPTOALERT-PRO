import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeepLink, generateWebLink } from '../src/utils/deeplinks.js';

test('Deep Link Utility', async (t) => {
  await t.test('Binance deep links', () => {
    const link = generateDeepLink({
      exchange: 'binance',
      symbol: 'BTC-USDT',
      side: 'buy',
      price: 75000
    });
    assert.equal(link, 'binance://trade?symbol=BTCUSDT&side=BUY&price=75000');
  });

  await t.test('OKX deep links', () => {
    const link = generateDeepLink({
      exchange: 'okx',
      symbol: 'BTCUSDT',
      side: 'sell',
      price: 70000
    });
    assert.equal(link, 'okx://trade?instId=BTC-USDT&side=sell&px=70000');
  });

  await t.test('Bybit deep links', () => {
    const link = generateDeepLink({
      exchange: 'bybit',
      symbol: 'ETHUSDT',
      side: 'buy'
    });
    assert.equal(link, 'bybitapp://open/trade?symbol=ETHUSDT&side=Buy');
  });

  await t.test('Web links', () => {
    const link = generateWebLink({
      exchange: 'binance',
      symbol: 'SOL-USDT',
      side: 'buy'
    });
    assert.equal(link, 'https://www.binance.com/en/trade/SOLUSDT');
  });
});
