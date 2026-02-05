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
    format: winston.format.simple()
  }));
}
