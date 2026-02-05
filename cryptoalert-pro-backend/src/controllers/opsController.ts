import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  detectOpsAnomalies,
  ingestTelemetryPoint,
  listOpsIncidents,
  recordOpsEvent,
  registerIncidentFeedback
} from '../services/opsAnomalyService.js';

const telemetrySchema = z.object({
  metric_type: z.enum(['http_5xx_rate', 'conversion_rate', 'timeout_rate', 'payload_entropy', 'traffic_rps']),
  service_name: z.string().min(2),
  provider: z.string().min(2).optional(),
  value: z.number(),
  sample_size: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
  recorded_at: z.string().datetime().optional()
});

const opsEventSchema = z.object({
  event_type: z.enum(['deploy', 'traffic', 'provider_failure', 'manual']),
  service_name: z.string().min(2).optional(),
  provider: z.string().min(2).optional(),
  summary: z.string().min(4),
  metadata: z.record(z.any()).optional(),
  occurred_at: z.string().datetime().optional()
});

const analyzeSchema = z.object({ service_name: z.string().min(2), lookback_minutes: z.number().int().min(15).max(24 * 60).optional() });
const feedbackSchema = z.object({ verdict: z.enum(['true_positive', 'false_positive', 'needs_tuning']), notes: z.string().max(1500).optional() });

export async function ingestOpsTelemetry(req: Request, res: Response) {
  const parsed = telemetrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const telemetry = await ingestTelemetryPoint({
      ...parsed.data,
      idempotency_key: req.header('Idempotency-Key') ?? req.header('X-Idempotency-Key') ?? undefined
    });
    return res.status(201).json({ telemetry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao ingerir telemetria';
    return res.status(500).json({ error: message });
  }
}

export async function createOpsEvent(req: Request, res: Response) {
  const parsed = opsEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const event = await recordOpsEvent({
      ...parsed.data,
      idempotency_key: req.header('Idempotency-Key') ?? req.header('X-Idempotency-Key') ?? undefined
    });
    return res.status(201).json({ event });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao registrar evento operacional';
    return res.status(500).json({ error: message });
  }
}

export async function analyzeOpsAnomalies(req: Request, res: Response) {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const incidents = await detectOpsAnomalies(parsed.data.service_name, parsed.data.lookback_minutes);
    return res.status(201).json({ incidents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao analisar anomalias';
    return res.status(500).json({ error: message });
  }
}

export async function getOpsIncidents(req: Request, res: Response) {
  const serviceName = req.query.service_name;
  if (typeof serviceName !== 'string' || serviceName.length < 2) {
    return res.status(400).json({ error: 'service_name is required' });
  }

  try {
    const incidents = await listOpsIncidents(serviceName, typeof req.query.status === 'string' ? req.query.status : undefined);
    return res.json({ incidents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao listar incidentes';
    return res.status(500).json({ error: message });
  }
}

export async function submitIncidentFeedback(req: Request, res: Response) {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const feedback = await registerIncidentFeedback({
      incidentId: req.params.id,
      reviewerId: req.user?.id,
      verdict: parsed.data.verdict,
      notes: parsed.data.notes
    });
    return res.status(201).json({ feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao registrar feedback';
    return res.status(500).json({ error: message });
  }
}
