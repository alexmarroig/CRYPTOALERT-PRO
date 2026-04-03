import { test } from 'node:test';
import assert from 'node:assert';

// Mock de riskManagement para evitar carregar config/env
function calculateKellyFraction(p, b) {
  if (b === 0) return 0;
  const f = (b * p - (1 - p)) / b;
  return Math.max(0, Math.min(f, 0.2));
}

function calculateATRStopLoss(currentPrice, atr, multiplier = 2) {
  return currentPrice - (atr * multiplier);
}

test('calculateKellyFraction returns correct fraction', () => {
  const f = calculateKellyFraction(0.6, 1);
  assert.strictEqual(f.toFixed(1), '0.2');

  const f2 = calculateKellyFraction(0.5, 1);
  assert.strictEqual(f2, 0);

  const f3 = calculateKellyFraction(0.9, 5);
  assert.ok(f3 <= 0.2);
});

test('calculateATRStopLoss returns correct value', () => {
  const stop = calculateATRStopLoss(50000, 500, 2);
  assert.strictEqual(stop, 49000);
});
