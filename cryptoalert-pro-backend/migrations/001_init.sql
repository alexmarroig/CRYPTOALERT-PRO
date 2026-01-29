CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR UNIQUE NOT NULL,
  subscription_tier VARCHAR DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'vip')),
  stripe_customer_id VARCHAR,
  referral_code VARCHAR UNIQUE,
  referred_by VARCHAR,
  api_keys JSONB DEFAULT '{}',
  portfolio_manual JSONB DEFAULT '[]',
  notifications_enabled BOOLEAN DEFAULT true,
  fcm_token VARCHAR,
  role VARCHAR DEFAULT 'user' CHECK (role IN ('user', 'influencer', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES users(id),
  coin VARCHAR NOT NULL,
  direction VARCHAR CHECK (direction IN ('long', 'short')),
  entry_price DECIMAL,
  tp1 DECIMAL,
  tp2 DECIMAL,
  sl_price DECIMAL,
  confidence_pct INTEGER CHECK (confidence_pct BETWEEN 0 AND 100),
  ai_analysis TEXT,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  win_rate DECIMAL,
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  signal_id UUID REFERENCES signals(id),
  amount DECIMAL,
  entry_price DECIMAL,
  status VARCHAR DEFAULT 'active',
  pnl_usd DECIMAL DEFAULT 0,
  pnl_pct DECIMAL DEFAULT 0,
  closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS influencer_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES users(id),
  user_id UUID REFERENCES users(id),
  revenue_type VARCHAR,
  amount DECIMAL,
  payout_status VARCHAR DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
