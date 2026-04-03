-- Arena de Estratégias e Paper Trading

-- 1. Estratégias (Bots)
CREATE TABLE IF NOT EXISTS trading_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  theory_base TEXT, -- EMH, Behavioral, Quantitative, etc.
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Saldos de Paper Trading (Usuários e Bots)
CREATE TABLE IF NOT EXISTS paper_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL, -- Pode ser profiles.id ou trading_strategies.id
  asset TEXT NOT NULL DEFAULT 'USDT',
  balance NUMERIC NOT NULL DEFAULT 10000.0,
  locked_balance NUMERIC NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, asset)
);

-- 3. Ordens de Paper Trading
CREATE TABLE IF NOT EXISTS paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  strategy_id UUID REFERENCES trading_strategies(id), -- NULL se for ordem manual do usuário
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK (type IN ('market', 'limit')),
  status TEXT NOT NULL DEFAULT 'filled' CHECK (status IN ('open', 'filled', 'cancelled', 'rejected')),
  price NUMERIC,
  amount NUMERIC NOT NULL,
  cost NUMERIC,
  fee NUMERIC DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Performance de Estratégias (Snapshots)
CREATE TABLE IF NOT EXISTS strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES trading_strategies(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  total_roi_pct NUMERIC DEFAULT 0.0,
  win_rate_pct NUMERIC DEFAULT 0.0,
  max_drawdown_pct NUMERIC DEFAULT 0.0,
  sharpe_ratio NUMERIC,
  total_trades INT DEFAULT 0,
  equity_value NUMERIC
);

-- 5. Monitor de Notícias Científico (Impacto)
CREATE TABLE IF NOT EXISTS news_impact_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_title TEXT NOT NULL,
  news_source TEXT,
  sentiment_score NUMERIC, -- -1 a 1
  asset_impacted TEXT,
  price_at_news NUMERIC,
  price_1h_after NUMERIC,
  price_24h_after NUMERIC,
  actual_impact_pct NUMERIC,
  prediction_correct BOOLEAN,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Indicadores Macro
CREATE TABLE IF NOT EXISTS macro_indicators (
  symbol TEXT PRIMARY KEY, -- VIX, SPX, DXY, BTC_DOMINANCE
  value NUMERIC NOT NULL,
  change_24h_pct NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Correlações de Mercado
CREATE TABLE IF NOT EXISTS market_correlations (
  asset_a TEXT NOT NULL,
  asset_b TEXT NOT NULL,
  correlation_coefficient NUMERIC NOT NULL, -- -1 a 1
  timeframe TEXT DEFAULT '24h',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (asset_a, asset_b, timeframe)
);

-- RLS e Permissões
ALTER TABLE trading_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_impact_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_correlations ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública para Estratégias e Performance
CREATE POLICY "strategies_public_read" ON trading_strategies FOR SELECT USING (true);
CREATE POLICY "performance_public_read" ON strategy_performance FOR SELECT USING (true);
CREATE POLICY "news_impact_public_read" ON news_impact_analysis FOR SELECT USING (true);
CREATE POLICY "macro_public_read" ON macro_indicators FOR SELECT USING (true);
CREATE POLICY "correlations_public_read" ON market_correlations FOR SELECT USING (true);

-- Políticas para Paper Trading (Usuário vê o seu)
CREATE POLICY "paper_balances_owner" ON paper_balances FOR SELECT USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM trading_strategies WHERE id = owner_id));
CREATE POLICY "paper_orders_owner" ON paper_orders FOR SELECT USING (owner_id = auth.uid() OR strategy_id IS NOT NULL);

-- Inserir estratégias base
INSERT INTO trading_strategies (name, description, theory_base) VALUES
('Arbitrage Alpha', 'Explora spreads entre Binance, OKX e Bybit.', 'Market Inefficiency'),
('Sentiment Sentinel', 'Análise de notícias via Transformers e impacto imediato.', 'Behavioral Finance'),
('LSTM Trend Follower', 'Rede Neural Recorrente para previsão de tendência curta.', 'Quantitative / Deep Learning'),
('Macro Hedge Bot', 'Ajusta posições baseado em correlação com S&P500 e VIX.', 'Modern Portfolio Theory')
ON CONFLICT (name) DO NOTHING;
