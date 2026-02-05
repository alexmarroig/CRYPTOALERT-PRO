import winston from 'winston';
import { getTraceContext } from '../observability/telemetry.js';

const traceCorrelationFormat = winston.format((info) => {
  const trace = getTraceContext();
  if (trace) {
    info.trace_id = trace.traceId;
    info.span_id = trace.spanId;
    if (trace.parentSpanId) {
      info.parent_span_id = trace.parentSpanId;
    }
  }
  return info;
});
import type { Request } from 'express';

interface StructuredErrorLog {
  trace_id: string | null;
  user_id: string | null;
  endpoint: string;
  status: number;
  erro: string;
  [key: string]: unknown;
}

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    traceCorrelationFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
  }));
}

export function buildRequestLogContext(req: Request) {
  return {
    trace_id: req.traceId ?? null,
    user_id: req.user?.id ?? null,
    endpoint: req.originalUrl,
    method: req.method
  };
}

export function logStructuredError(payload: StructuredErrorLog) {
  logger.error('request.error', payload);
}
