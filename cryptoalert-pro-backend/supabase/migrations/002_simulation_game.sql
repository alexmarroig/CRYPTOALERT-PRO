-- Simulation / Game Mode Schema

CREATE TABLE IF NOT EXISTS simulation_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL, -- 'binance_sim', 'okx_sim', etc.
  asset TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, exchange, asset)
);

CREATE TABLE IF NOT EXISTS simulation_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK (type IN ('market', 'limit')),
  price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  fee_asset TEXT,
  total_cost_usd NUMERIC,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulation_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  from_exchange TEXT NOT NULL,
  to_exchange TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS simulation_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_equity_usd NUMERIC DEFAULT 0,
  initial_capital_usd NUMERIC DEFAULT 0,
  roi_pct NUMERIC DEFAULT 0,
  win_rate_pct NUMERIC DEFAULT 0,
  max_drawdown_pct NUMERIC DEFAULT 0,
  trades_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE simulation_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "simulation_accounts_owner" ON simulation_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "simulation_trades_owner" ON simulation_trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "simulation_transfers_owner" ON simulation_transfers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "simulation_stats_owner" ON simulation_stats FOR ALL USING (auth.uid() = user_id);

-- Initial balance function (to be called on user joining the game)
CREATE OR REPLACE FUNCTION initialize_simulation_balance(target_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO simulation_accounts (user_id, exchange, asset, balance)
  VALUES
    (target_user_id, 'binance_sim', 'USDT', 10000),
    (target_user_id, 'okx_sim', 'USDT', 10000)
  ON CONFLICT DO NOTHING;

  INSERT INTO simulation_stats (user_id, total_equity_usd, initial_capital_usd)
  VALUES (target_user_id, 20000, 20000)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
