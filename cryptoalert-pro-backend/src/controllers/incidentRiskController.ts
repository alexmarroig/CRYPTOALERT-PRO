import type { Request, Response } from 'express';
import { z } from 'zod';
import { incidentRiskService } from '../services/incidentRisk/incidentRiskService.js';

const telemetrySchema = z.object({
  events: z.array(z.object({
    timestamp: z.string().datetime(),
    service: z.string().min(1),
    route: z.string().min(1),
    statusCode: z.number().int().min(100).max(599),
    latencyMs: z.number().min(0),
    memoryMb: z.number().min(0),
    cpuPct: z.number().min(0).max(100),
    retries: z.number().int().min(0),
    timeout: z.boolean()
  })).min(1)
});

const etlSchema = z.object({
  bucketMinutes: z.number().int().min(1).max(120).default(5),
  lookbackHours: z.number().int().min(1).max(168).default(24)
});

const trainSchema = z.object({
  horizonHours: z.number().int().min(1).max(48).default(6),
  incidentThreshold: z.number().min(0.01).max(1).default(0.2),
  learningRate: z.number().min(0.0001).max(1).default(0.05),
  epochs: z.number().int().min(1).max(500).default(100)
});

const inferBatchSchema = z.object({
  items: z.array(z.object({
    service: z.string().min(1),
    route: z.string().min(1),
    bucketStart: z.string().datetime(),
    errorRate: z.number().min(0).max(1).optional(),
    p95LatencyMs: z.number().min(0).optional(),
    p99LatencyMs: z.number().min(0).optional(),
    avgMemoryMb: z.number().min(0).optional(),
    avgCpuPct: z.number().min(0).max(100).optional(),
    retriesRate: z.number().min(0).optional(),
    timeoutRate: z.number().min(0).max(1).optional(),
    totalRequests: z.number().int().min(0).optional()
  })).min(1)
});

const alertSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.8)
});

const backtestSchema = z.object({
  horizonHours: z.number().int().min(1).max(48).default(6),
  incidentThreshold: z.number().min(0.01).max(1).default(0.2),
  topK: z.number().int().min(1).max(1000).default(20)
});

export function ingestTelemetry(req: Request, res: Response) {
  const parsed = telemetrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = incidentRiskService.ingestTelemetry(parsed.data.events);
  return res.status(202).json(result);
}

export function runIncidentRiskEtl(req: Request, res: Response) {
  const parsed = etlSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = incidentRiskService.runETL(parsed.data);
  return res.json(result);
}

export function trainIncidentModel(req: Request, res: Response) {
  const parsed = trainSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = incidentRiskService.train(parsed.data);
  return res.json(result);
}

export function inferIncidentRiskBatch(req: Request, res: Response) {
  const parsed = inferBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  return res.json({ predictions: incidentRiskService.inferBatch(parsed.data.items) });
}

export function inferIncidentRiskLive(req: Request, res: Response) {
  const service = typeof req.query.service === 'string' ? req.query.service : undefined;
  const route = typeof req.query.route === 'string' ? req.query.route : undefined;

  return res.json({ predictions: incidentRiskService.inferLatest(service, route) });
}

export function evaluatePreventiveAlerts(req: Request, res: Response) {
  const parsed = alertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const alerts = incidentRiskService.evaluateAlerts(parsed.data.threshold);
  return res.json({ alerts, count: alerts.length });
}

export function runIncidentBacktest(req: Request, res: Response) {
  const parsed = backtestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const metrics = incidentRiskService.backtest(parsed.data.horizonHours, parsed.data.incidentThreshold, parsed.data.topK);
  return res.json(metrics);
}

export function incidentRiskSummary(_req: Request, res: Response) {
  return res.json({
    telemetry: incidentRiskService.summarizeTelemetry(),
    featureRows: incidentRiskService.getFeatureRows().length
  });
}
