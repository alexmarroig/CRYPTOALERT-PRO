CREATE TABLE IF NOT EXISTS portfolio_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'okx')),
  asset TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trade', 'deposit', 'withdraw', 'fee')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_ledger_user_asset_time
  ON portfolio_ledger(user_id, asset, executed_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_goals_alerts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  max_drawdown_pct NUMERIC,
  target_net_worth NUMERIC,
  asset_daily_change_pct NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_goals_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_ledger_owner" ON portfolio_ledger
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "portfolio_goals_alerts_owner" ON portfolio_goals_alerts
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE portfolios_snapshot
  ADD COLUMN IF NOT EXISTS holdings JSONB,
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl NUMERIC DEFAULT 0;
