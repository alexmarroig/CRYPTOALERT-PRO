import { logger } from '../../utils/logger.js';
import type { BacktestMetrics, FeatureRow, PredictionResult, TelemetryEvent, TrainingRow } from './types.js';

interface ETLConfig {
  bucketMinutes: number;
  lookbackHours: number;
}

interface TrainConfig {
  horizonHours: number;
  incidentThreshold: number;
  learningRate: number;
  epochs: number;
}

const FEATURE_KEYS: Array<keyof Omit<FeatureRow, 'bucketStart' | 'service' | 'route'>> = [
  'errorRate',
  'p95LatencyMs',
  'p99LatencyMs',
  'avgMemoryMb',
  'avgCpuPct',
  'retriesRate',
  'timeoutRate',
  'totalRequests'
];

const MAX_EVENTS = 20_000;

export class IncidentRiskService {
  private readonly events: TelemetryEvent[] = [];

  private featureStore: FeatureRow[] = [];

  private weights = new Map<string, number>();

  private bias = 0;

  private means = new Map<string, number>();

  private stdDevs = new Map<string, number>();

  constructor() {
    for (const key of FEATURE_KEYS) {
      this.weights.set(key, 0);
      this.means.set(key, 0);
      this.stdDevs.set(key, 1);
    }
  }

  ingestTelemetry(events: TelemetryEvent[]): { ingested: number; retained: number } {
    for (const event of events) {
      this.events.push(event);
    }

    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    return { ingested: events.length, retained: this.events.length };
  }

  runETL(config: ETLConfig): { generatedRows: number; dataset: FeatureRow[] } {
    const bucketMs = config.bucketMinutes * 60_000;
    const minTimestamp = Date.now() - config.lookbackHours * 3_600_000;
    const selected = this.events.filter((event) => Date.parse(event.timestamp) >= minTimestamp);

    const groups = new Map<string, TelemetryEvent[]>();
    for (const event of selected) {
      const bucketStartMs = Math.floor(Date.parse(event.timestamp) / bucketMs) * bucketMs;
      const key = `${event.service}|${event.route}|${bucketStartMs}`;
      const current = groups.get(key) ?? [];
      current.push(event);
      groups.set(key, current);
    }

    const rows: FeatureRow[] = [];
    for (const [key, group] of groups.entries()) {
      const [service, route, bucketStartMsRaw] = key.split('|');
      const bucketStartMs = Number(bucketStartMsRaw);
      const latencies = group.map((item) => item.latencyMs).sort((a, b) => a - b);
      const errors = group.filter((item) => item.statusCode >= 500).length;
      const timeouts = group.filter((item) => item.timeout).length;

      rows.push({
        bucketStart: new Date(bucketStartMs).toISOString(),
        service,
        route,
        errorRate: ratio(errors, group.length),
        p95LatencyMs: percentile(latencies, 95),
        p99LatencyMs: percentile(latencies, 99),
        avgMemoryMb: average(group.map((item) => item.memoryMb)),
        avgCpuPct: average(group.map((item) => item.cpuPct)),
        retriesRate: average(group.map((item) => item.retries)),
        timeoutRate: ratio(timeouts, group.length),
        totalRequests: group.length
      });
    }

    rows.sort((a, b) => Date.parse(a.bucketStart) - Date.parse(b.bucketStart));
    this.featureStore = rows;

    return { generatedRows: rows.length, dataset: rows };
  }

  train(config: TrainConfig): { trainedRows: number; positives: number } {
    const trainingSet = this.buildTrainingRows(config.horizonHours, config.incidentThreshold);
    if (!trainingSet.length) {
      return { trainedRows: 0, positives: 0 };
    }

    this.fitScaler(trainingSet);

    for (let epoch = 0; epoch < config.epochs; epoch += 1) {
      for (const row of trainingSet) {
        const normalized = this.toVector(row);
        const logit = this.bias + dotProduct(normalized, this.weights);
        const prediction = sigmoid(logit);
        const error = prediction - row.label;

        for (const key of FEATURE_KEYS) {
          const weight = this.weights.get(key) ?? 0;
          const gradient = error * normalized.get(key)!;
          this.weights.set(key, weight - config.learningRate * gradient);
        }

        this.bias -= config.learningRate * error;
      }
    }

    const positives = trainingSet.filter((row) => row.label === 1).length;
    logger.info('Incident model trained', { rows: trainingSet.length, positives });

    return { trainedRows: trainingSet.length, positives };
  }

  inferLatest(service?: string, route?: string): PredictionResult[] {
    let rows = [...this.featureStore];
    if (service) rows = rows.filter((row) => row.service === service);
    if (route) rows = rows.filter((row) => row.route === route);

    const latestByKey = new Map<string, FeatureRow>();
    for (const row of rows) {
      const key = `${row.service}|${row.route}`;
      const current = latestByKey.get(key);
      if (!current || Date.parse(row.bucketStart) > Date.parse(current.bucketStart)) {
        latestByKey.set(key, row);
      }
    }

    return Array.from(latestByKey.values()).map((row) => this.predictRow(row));
  }

  inferBatch(items: Array<Pick<FeatureRow, 'service' | 'route' | 'bucketStart'> & Partial<FeatureRow>>): PredictionResult[] {
    return items.map((item) => {
      const merged = {
        errorRate: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        avgMemoryMb: 0,
        avgCpuPct: 0,
        retriesRate: 0,
        timeoutRate: 0,
        totalRequests: 0,
        ...item
      } as FeatureRow;

      return this.predictRow(merged);
    });
  }

  evaluateAlerts(threshold: number): Array<PredictionResult & { alert: 'preventive_incident_risk' }> {
    const predictions = this.inferLatest();
    return predictions
      .filter((item) => item.riskScore >= threshold)
      .map((item) => ({ ...item, alert: 'preventive_incident_risk' as const }));
  }

  backtest(horizonHours: number, incidentThreshold: number, topK: number): BacktestMetrics {
    const rows = this.buildTrainingRows(horizonHours, incidentThreshold);
    if (!rows.length) {
      return { auc: 0, precisionAtK: 0, recallIncidents: 0, support: 0 };
    }

    const scored = rows.map((row) => ({ row, score: this.predictScore(row) }));
    const auc = calculateAUC(scored.map((item) => item.score), scored.map((item) => item.row.label));

    scored.sort((a, b) => b.score - a.score);
    const k = Math.min(topK, scored.length);
    const top = scored.slice(0, k);

    const truePositives = top.filter((item) => item.row.label === 1).length;
    const positives = scored.filter((item) => item.row.label === 1).length;

    return {
      auc,
      precisionAtK: k ? truePositives / k : 0,
      recallIncidents: positives ? truePositives / positives : 0,
      support: scored.length
    };
  }

  reset(): void {
    this.events.splice(0, this.events.length);
    this.featureStore = [];
    this.bias = 0;
    for (const key of FEATURE_KEYS) {
      this.weights.set(key, 0);
      this.means.set(key, 0);
      this.stdDevs.set(key, 1);
    }
  }

  summarizeTelemetry() {
    const total = this.events.length;
    const errors = this.events.filter((event) => event.statusCode >= 500).length;
    const timeouts = this.events.filter((event) => event.timeout).length;
    return {
      total,
      errorRate: ratio(errors, total),
      timeoutRate: ratio(timeouts, total)
    };
  }

  getFeatureRows() {
    return this.featureStore;
  }

  private buildTrainingRows(horizonHours: number, incidentThreshold: number): TrainingRow[] {
    const byStream = new Map<string, FeatureRow[]>();
    for (const row of this.featureStore) {
      const key = `${row.service}|${row.route}`;
      const current = byStream.get(key) ?? [];
      current.push(row);
      byStream.set(key, current);
    }

    const horizonMs = horizonHours * 3_600_000;
    const rows: TrainingRow[] = [];

    for (const stream of byStream.values()) {
      stream.sort((a, b) => Date.parse(a.bucketStart) - Date.parse(b.bucketStart));
      for (let i = 0; i < stream.length; i += 1) {
        const current = stream[i];
        const currentTime = Date.parse(current.bucketStart);

        let label: 0 | 1 = 0;
        for (let j = i + 1; j < stream.length; j += 1) {
          const future = stream[j];
          const futureTime = Date.parse(future.bucketStart);
          if (futureTime - currentTime > horizonMs) {
            break;
          }

          if (future.errorRate >= incidentThreshold || future.timeoutRate >= incidentThreshold) {
            label = 1;
            break;
          }
        }

        rows.push({ ...current, label });
      }
    }

    return rows;
  }

  private fitScaler(rows: TrainingRow[]): void {
    for (const key of FEATURE_KEYS) {
      const values = rows.map((row) => Number(row[key]));
      const mean = average(values);
      const variance = average(values.map((value) => (value - mean) ** 2));
      const std = Math.sqrt(variance) || 1;
      this.means.set(key, mean);
      this.stdDevs.set(key, std);
    }
  }

  private toVector(row: FeatureRow): Map<string, number> {
    const vector = new Map<string, number>();
    for (const key of FEATURE_KEYS) {
      const mean = this.means.get(key) ?? 0;
      const std = this.stdDevs.get(key) ?? 1;
      vector.set(key, (Number(row[key]) - mean) / std);
    }

    return vector;
  }

  private predictScore(row: FeatureRow): number {
    const vector = this.toVector(row);
    const logit = this.bias + dotProduct(vector, this.weights);
    return sigmoid(logit);
  }

  private predictRow(row: FeatureRow): PredictionResult {
    const vector = this.toVector(row);
    const riskScore = sigmoid(this.bias + dotProduct(vector, this.weights));

    const topFactors = FEATURE_KEYS
      .map((key) => ({ feature: key, contribution: (this.weights.get(key) ?? 0) * (vector.get(key) ?? 0) }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);

    return {
      service: row.service,
      route: row.route,
      bucketStart: row.bucketStart,
      riskScore,
      topFactors
    };
  }
}

export const incidentRiskService = new IncidentRiskService();

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function ratio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function dotProduct(values: Map<string, number>, weights: Map<string, number>): number {
  let sum = 0;
  for (const [key, value] of values.entries()) {
    sum += value * (weights.get(key) ?? 0);
  }
  return sum;
}

function calculateAUC(scores: number[], labels: number[]): number {
  const positives: number[] = [];
  const negatives: number[] = [];

  for (let i = 0; i < scores.length; i += 1) {
    if (labels[i] === 1) positives.push(scores[i]);
    else negatives.push(scores[i]);
  }

  if (!positives.length || !negatives.length) {
    return 0;
  }

  let correctPairs = 0;
  let ties = 0;

  for (const pScore of positives) {
    for (const nScore of negatives) {
      if (pScore > nScore) correctPairs += 1;
      else if (pScore === nScore) ties += 1;
    }
  }

  const totalPairs = positives.length * negatives.length;
  return (correctPairs + ties * 0.5) / totalPairs;
}
