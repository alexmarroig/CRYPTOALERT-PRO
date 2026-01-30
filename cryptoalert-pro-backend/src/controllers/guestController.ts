import type { Request, Response } from 'express';

const mockSignals = [
  {
    id: 'guest-signal-1',
    coin: 'BTC',
    direction: 'long',
    entry_price: 62450,
    tp1: 64800,
    tp2: 67200,
    sl_price: 60200,
    confidence_pct: 78,
    status: 'open',
    ai_analysis: 'Momentum positivo com suporte forte na zona de 60k.',
    created_at: '2024-09-10T14:20:00.000Z'
  },
  {
    id: 'guest-signal-2',
    coin: 'ETH',
    direction: 'short',
    entry_price: 3180,
    tp1: 3050,
    tp2: 2960,
    sl_price: 3320,
    confidence_pct: 64,
    status: 'open',
    ai_analysis: 'Rejeição em resistência semanal, fluxo vendedor aumentando.',
    created_at: '2024-09-09T18:05:00.000Z'
  },
  {
    id: 'guest-signal-3',
    coin: 'SOL',
    direction: 'long',
    entry_price: 148,
    tp1: 162,
    tp2: 176,
    sl_price: 138,
    confidence_pct: 71,
    status: 'closed',
    ai_analysis: 'Breakout confirmado acima da média de 50 períodos.',
    created_at: '2024-09-08T09:30:00.000Z'
  }
];

const mockPortfolio = [
  {
    symbol: 'BTC',
    amount: 0.18,
    usd_value: 11250
  },
  {
    symbol: 'ETH',
    amount: 2.4,
    usd_value: 7480
  },
  {
    symbol: 'USDT',
    amount: 3200,
    usd_value: 3200
  }
];

export function getGuestSignals(_req: Request, res: Response) {
  return res.json({ data: mockSignals, count: mockSignals.length });
}

export function getGuestPortfolio(_req: Request, res: Response) {
  return res.json({ manual: mockPortfolio });
}

export function getGuestOverview(_req: Request, res: Response) {
  return res.json({
    signals: { data: mockSignals, count: mockSignals.length },
    portfolio: { manual: mockPortfolio }
  });
}
