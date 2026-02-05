import { supabaseAdmin } from '../config/supabase.js';

export type MetricType = 'http_5xx_rate' | 'conversion_rate' | 'timeout_rate' | 'payload_entropy' | 'traffic_rps';
export type SignalType = 'explosion_5xx' | 'conversion_drop' | 'timeout_spike' | 'payload_pattern_unusual';
export type EventType = 'deploy' | 'traffic' | 'provider_failure' | 'manual';

interface TelemetryPoint {
  metric_type: MetricType;
  service_name: string;
  provider?: string | null;
  value: number;
  sample_size?: number | null;
  metadata?: Record<string, unknown>;
  recorded_at?: string;
}

interface OpsEvent {
  event_type: EventType;
  service_name?: string | null;
  provider?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

interface DetectorScores {
  robust_z_score: number;
  changepoint_score: number;
  isolation_forest_score: number;
}

const RECOMMENDATIONS: Record<SignalType, string[]> = {
  explosion_5xx: [
    'Ativar circuit breaker para o provider afetado',
    'Executar rollback do deploy mais recente',
    'Habilitar cache fallback para respostas idempotentes'
  ],
  conversion_drop: [
    'Validar funil de autenticação e gateway de pagamento',
    'Executar rollback de feature flag recente',
    'Servir página degradada com cache fallback enquanto investiga'
  ],
  timeout_spike: [
    'Ativar circuit breaker e reduzir timeout upstream',
    'Escalar horizontalmente workers críticos',
    'Habilitar rota de cache fallback para leituras quentes'
  ],
  payload_pattern_unusual: [
    'Aplicar bloqueio/rate limit para assinatura suspeita de payload',
    'Habilitar validação estrita de schema no edge',
    'Isolar tráfego anômalo via regra de WAF'
  ]
};

export async function ingestTelemetryPoint(point: TelemetryPoint) {
  const payload = {
    ...point,
    metadata: point.metadata ?? {},
    recorded_at: point.recorded_at ?? new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('ops_telemetry')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function recordOpsEvent(event: OpsEvent) {
  const payload = {
    ...event,
    metadata: event.metadata ?? {},
    occurred_at: event.occurred_at ?? new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('ops_events')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function detectOpsAnomalies(serviceName: string, lookbackMinutes: number = 180) {
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('ops_telemetry')
    .select('*')
    .eq('service_name', serviceName)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });

  if (error) throw new Error(error.message);

  const telemetry = (data ?? []) as Array<TelemetryPoint & { id: string }>;
  const byMetric = new Map<MetricType, Array<TelemetryPoint & { id: string }>>();
  for (const point of telemetry) {
    const list = byMetric.get(point.metric_type) ?? [];
    list.push(point);
    byMetric.set(point.metric_type, list);
  }

  const incidents = [] as unknown[];

  for (const [metricType, points] of byMetric.entries()) {
    if (points.length < 12) continue;

    const values = points.map((point) => Number(point.value));
    const currentValue = values[values.length - 1];
    const robustZ = robustZScore(values);
    const changepoint = changepointScore(values);
    const isoScore = isolationForestScore(values);
    const detectors: DetectorScores = {
      robust_z_score: round(robustZ),
      changepoint_score: round(changepoint),
      isolation_forest_score: round(isoScore)
    };

    const signal = classifySignal(metricType, currentValue, values, detectors);
    if (!signal) continue;

    const recordedAt = points[points.length - 1].recorded_at ?? new Date().toISOString();
    const correlatedEvents = await fetchCorrelatedEvents(serviceName, recordedAt);

    const incidentPayload = {
      signal,
      service_name: serviceName,
      provider: points[points.length - 1].provider ?? null,
      metric_type: metricType,
      detector_scores: detectors,
      metric_snapshot: {
        current_value: currentValue,
        p95: percentile(values, 95),
        median: median(values),
        samples: points.length
      },
      correlated_events: correlatedEvents,
      recommendations: RECOMMENDATIONS[signal],
      recorded_at: recordedAt
    };

    const { data: created, error: insertError } = await supabaseAdmin
      .from('ops_incidents')
      .insert(incidentPayload)
      .select('*')
      .single();

    if (insertError) throw new Error(insertError.message);
    incidents.push(created);
  }

  return incidents;
}

export async function listOpsIncidents(serviceName: string, status?: string) {
  let query = supabaseAdmin
    .from('ops_incidents')
    .select('*')
    .eq('service_name', serviceName)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function registerIncidentFeedback(input: {
  incidentId: string;
  reviewerId?: string;
  verdict: 'true_positive' | 'false_positive' | 'needs_tuning';
  notes?: string;
}) {
  const { data: feedback, error: feedbackError } = await supabaseAdmin
    .from('ops_incident_feedback')
    .insert({
      incident_id: input.incidentId,
      reviewer_id: input.reviewerId ?? null,
      verdict: input.verdict,
      notes: input.notes ?? null
    })
    .select('*')
    .single();

  if (feedbackError) throw new Error(feedbackError.message);

  const incidentStatus = input.verdict === 'false_positive' ? 'false_positive' : 'monitoring';

  await supabaseAdmin
    .from('ops_incidents')
    .update({ status: incidentStatus, updated_at: new Date().toISOString() })
    .eq('id', input.incidentId);

  return feedback;
}

async function fetchCorrelatedEvents(serviceName: string, recordedAt: string) {
  const center = new Date(recordedAt).getTime();
  const from = new Date(center - 30 * 60_000).toISOString();
  const to = new Date(center + 30 * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('ops_events')
    .select('id, event_type, provider, summary, occurred_at, metadata')
    .eq('service_name', serviceName)
    .gte('occurred_at', from)
    .lte('occurred_at', to)
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function classifySignal(metric: MetricType, current: number, values: number[], scores: DetectorScores): SignalType | null {
  const baseline = median(values.slice(0, -1));
  const detectorVotes = Number(scores.robust_z_score >= 3)
    + Number(scores.changepoint_score >= 2)
    + Number(scores.isolation_forest_score >= 0.62);

  if (detectorVotes < 2) {
    return null;
  }

  if (metric === 'http_5xx_rate' && current >= Math.max(baseline * 2, baseline + 0.02)) {
    return 'explosion_5xx';
  }

  if (metric === 'conversion_rate' && current <= baseline * 0.7) {
    return 'conversion_drop';
  }

  if (metric === 'timeout_rate' && current >= Math.max(baseline * 1.8, baseline + 0.03)) {
    return 'timeout_spike';
  }

  if (metric === 'payload_entropy' && Math.abs(current - baseline) >= Math.max(0.8, Math.abs(baseline) * 0.35)) {
    return 'payload_pattern_unusual';
  }

  return null;
}

function robustZScore(values: number[]) {
  if (values.length < 3) return 0;
  const baseline = values.slice(0, -1);
  const med = median(baseline);
  const mad = median(baseline.map((value) => Math.abs(value - med))) || 1e-6;
  return 0.6745 * (values[values.length - 1] - med) / mad;
}

function changepointScore(values: number[]) {
  if (values.length < 10) return 0;
  const window = Math.max(4, Math.floor(values.length * 0.2));
  const before = values.slice(values.length - window * 2, values.length - window);
  const after = values.slice(values.length - window);
  if (!before.length || !after.length) return 0;

  const beforeMean = mean(before);
  const afterMean = mean(after);
  const pooledStd = Math.sqrt((variance(before) + variance(after)) / 2) || 1e-6;
  return Math.abs(afterMean - beforeMean) / pooledStd;
}

function isolationForestScore(values: number[]) {
  if (values.length < 8) return 0;
  const sample = values.slice(-Math.min(64, values.length));
  const baseline = sample.slice(0, -1);
  const current = sample[sample.length - 1];
  const q1 = percentile(baseline, 25);
  const q3 = percentile(baseline, 75);
  const iqr = Math.max(1e-6, q3 - q1);
  const lowerFence = q1 - (1.5 * iqr);
  const upperFence = q3 + (1.5 * iqr);

  if (current >= lowerFence && current <= upperFence) {
    return 0.15;
  }

  const distance = current < lowerFence ? (lowerFence - current) : (current - upperFence);
  return Math.min(1, distance / (iqr * 3));
}


function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]) {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[position];
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? 0;
}

function round(value: number) {
  return Number(value.toFixed(4));
}
