import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { nowMs, recordDependencyMetric } from './metrics.js';

type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

const traceStore = new AsyncLocalStorage<TraceContext>();

function randomHex(size: number) {
  return crypto.randomBytes(size).toString('hex');
}

export function getTraceContext() {
  return traceStore.getStore();
}

export async function startTelemetry() {
  return;
}

export async function shutdownTelemetry() {
  return;
}

export function createTraceMiddleware() {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const incoming = req.header('traceparent');
    const traceId = incoming?.split('-')[1] ?? randomHex(16);
    const spanId = randomHex(8);
    const ctx: TraceContext = { traceId, spanId };
    res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
    traceStore.run(ctx, next);
  };
}

export async function instrumentDependency<T>(dependency: string, operation: string, fn: () => Promise<T>): Promise<T> {
  const parent = traceStore.getStore();
  const spanId = randomHex(8);
  const context: TraceContext = {
    traceId: parent?.traceId ?? randomHex(16),
    spanId,
    parentSpanId: parent?.spanId
  };

  const start = nowMs();

  return traceStore.run(context, async () => {
    try {
      const output = await fn();
      recordDependencyMetric(dependency, operation, nowMs() - start, false);
      return output;
    } catch (error) {
      recordDependencyMetric(dependency, operation, nowMs() - start, true);
      throw error;
    }
  });
}
