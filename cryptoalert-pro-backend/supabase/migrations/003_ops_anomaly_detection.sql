CREATE TABLE IF NOT EXISTS ops_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('http_5xx_rate', 'conversion_rate', 'timeout_rate', 'payload_entropy', 'traffic_rps')),
  service_name TEXT NOT NULL,
  provider TEXT,
  value NUMERIC NOT NULL,
  sample_size INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('deploy', 'traffic', 'provider_failure', 'manual')),
  service_name TEXT,
  provider TEXT,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal TEXT NOT NULL CHECK (signal IN ('explosion_5xx', 'conversion_drop', 'timeout_spike', 'payload_pattern_unusual')),
  service_name TEXT NOT NULL,
  provider TEXT,
  metric_type TEXT NOT NULL,
  detector_scores JSONB NOT NULL,
  metric_snapshot JSONB NOT NULL,
  correlated_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'mitigated', 'false_positive')),
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_incident_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES ops_incidents(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('true_positive', 'false_positive', 'needs_tuning')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_telemetry_lookup ON ops_telemetry (service_name, metric_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_events_lookup ON ops_events (service_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_lookup ON ops_incidents (service_name, status, created_at DESC);

ALTER TABLE ops_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_incident_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_telemetry_admin_only" ON ops_telemetry
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "ops_events_admin_only" ON ops_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "ops_incidents_admin_only" ON ops_incidents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "ops_feedback_admin_only" ON ops_incident_feedback
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
