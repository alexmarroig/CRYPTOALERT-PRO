-- Add new fields to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS points INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_days INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT FALSE;

-- Add performance metrics to influencer_metrics
ALTER TABLE influencer_metrics
ADD COLUMN IF NOT EXISTS win_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_roi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC DEFAULT 0;

-- Add close_price to alerts for ROI calculation
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS close_price NUMERIC;

-- Create portfolios_history table for trend analysis and alerts
CREATE TABLE IF NOT EXISTS portfolios_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_value NUMERIC NOT NULL,
  assets JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create market_alerts table for automated market events
CREATE TABLE IF NOT EXISTS market_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'whale', 'rsi', 'volume'
  asset TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for new tables
ALTER TABLE portfolios_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios_history_owner" ON portfolios_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "market_alerts_public_read" ON market_alerts
  FOR SELECT USING (true);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_portfolios_history_user_created ON portfolios_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_alerts_created ON market_alerts(created_at DESC);
