export type RiskLabel = 0 | 1;

export interface TelemetryEvent {
  timestamp: string;
  service: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  memoryMb: number;
  cpuPct: number;
  retries: number;
  timeout: boolean;
}

export interface FeatureRow {
  bucketStart: string;
  service: string;
  route: string;
  errorRate: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgMemoryMb: number;
  avgCpuPct: number;
  retriesRate: number;
  timeoutRate: number;
  totalRequests: number;
}

export interface TrainingRow extends FeatureRow {
  label: RiskLabel;
}

export interface PredictionResult {
  service: string;
  route: string;
  bucketStart: string;
  riskScore: number;
  topFactors: Array<{ feature: string; contribution: number }>;
}

export interface BacktestMetrics {
  auc: number;
  precisionAtK: number;
  recallIncidents: number;
  support: number;
}
