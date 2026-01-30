CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  language TEXT DEFAULT 'pt' CHECK (language IN ('pt', 'en')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'vip')),
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'influencer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_whitelist (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token UUID UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_type TEXT NOT NULL CHECK (following_type IN ('user', 'influencer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  asset TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  ref_price NUMERIC,
  target_price NUMERIC,
  stop_price NUMERIC,
  confidence_pct INT CHECK (confidence_pct BETWEEN 0 AND 100),
  reason_text TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'okx')),
  api_key TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  permissions TEXT DEFAULT 'read_only',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

CREATE TABLE IF NOT EXISTS portfolios_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_value NUMERIC,
  change_pct_30d NUMERIC,
  assets JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS portfolio_visibility (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public', 'percent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS influencer_metrics (
  influencer_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  followers_count INT DEFAULT 0,
  alerts_views INT DEFAULT 0,
  posts_views INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  subscription_id TEXT,
  current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS push_tokens (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  device TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, fcm_token)
);

CREATE VIEW IF NOT EXISTS public_profiles AS
  SELECT id, username, display_name FROM profiles;

GRANT SELECT ON public_profiles TO anon, authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "admin_whitelist_admin_only" ON admin_whitelist
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "invites_admin_manage" ON invites
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "invites_accept" ON invites
  FOR UPDATE USING (
    status = 'pending' AND email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "follows_read_own" ON follows
  FOR SELECT USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "follows_insert_own" ON follows
  FOR INSERT WITH CHECK (follower_id = auth.uid());

CREATE POLICY "follows_delete_own" ON follows
  FOR DELETE USING (follower_id = auth.uid());

CREATE POLICY "alerts_public_read" ON alerts
  FOR SELECT USING (true);

CREATE POLICY "alerts_write_influencer" ON alerts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('influencer', 'admin'))
  );

CREATE POLICY "alerts_update_own" ON alerts
  FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "posts_public_read" ON posts
  FOR SELECT USING (true);

CREATE POLICY "posts_write_influencer" ON posts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('influencer', 'admin'))
  );

CREATE POLICY "exchange_connections_owner" ON exchange_connections
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "portfolio_snapshot_owner" ON portfolios_snapshot
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "portfolio_visibility_owner" ON portfolio_visibility
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "stripe_customers_owner" ON stripe_customers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "push_tokens_owner" ON push_tokens
  FOR ALL USING (user_id = auth.uid());
