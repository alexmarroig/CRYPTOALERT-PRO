import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeepLink, generateWebLink } from '../../src/utils/deeplinks.ts';

test('generateDeepLink formats exchange-specific links', () => {
  assert.equal(
    generateDeepLink({ exchange: 'binance', symbol: 'BTC-USDT', side: 'buy', price: 65000 }),
    'binance://trade?symbol=BTCUSDT&side=BUY&price=65000'
  );

  assert.equal(
    generateDeepLink({ exchange: 'okx', symbol: 'ETHUSDT', side: 'sell', price: 3200 }),
    'okx://trade?instId=ETH-USDT&side=sell&px=3200'
  );

  assert.equal(
    generateDeepLink({ exchange: 'bybit', symbol: 'SOL-USDT', side: 'buy' }),
    'bybitapp://open/trade?symbol=SOLUSDT&side=Buy'
  );
});

test('generateWebLink returns fallback trading URLs', () => {
  assert.equal(
    generateWebLink({ exchange: 'binance', symbol: 'BTC-USDT', side: 'buy' }),
    'https://www.binance.com/en/trade/BTCUSDT'
  );

  assert.equal(
    generateWebLink({ exchange: 'okx', symbol: 'ETHUSDT', side: 'sell' }),
    'https://www.okx.com/trade-spot/eth-usdt'
  );

  assert.equal(
    generateWebLink({ exchange: 'bybit', symbol: 'SOL-USDT', side: 'buy' }),
    'https://www.bybit.com/en-US/trade/spot/SOLUSDT/USDT'
  );
});
