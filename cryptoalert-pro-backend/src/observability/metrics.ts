import { performance } from 'node:perf_hooks';

export type RouteSnapshot = {
  route: string;
  requests: number;
  errors: number;
  errorRate: number;
  throughputRps: number;
  p95Ms: number;
  p99Ms: number;
};

export type DependencySnapshot = {
  dependency: string;
  operation: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgMs: number;
};

type CounterWindow = { timestamp: number; count: number; errors: number; durations: number[] };

const WINDOW_MS = 15 * 60 * 1000;
const counterBuckets = new Map<string, CounterWindow[]>();
const dependencyBuckets = new Map<string, CounterWindow[]>();

function trimWindows(windows: CounterWindow[]): CounterWindow[] {
  const floor = Date.now() - WINDOW_MS;
  return windows.filter((item) => item.timestamp >= floor);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1);
  return sorted[index] ?? 0;
}

function upsert(map: Map<string, CounterWindow[]>, key: string, durationMs: number, isError: boolean) {
  const minuteStamp = Math.floor(Date.now() / 60000) * 60000;
  const windows = map.get(key) ?? [];
  const current = windows.find((item) => item.timestamp === minuteStamp);
  if (current) {
    current.count += 1;
    current.errors += isError ? 1 : 0;
    current.durations.push(durationMs);
  } else {
    windows.push({ timestamp: minuteStamp, count: 1, errors: isError ? 1 : 0, durations: [durationMs] });
  }
  map.set(key, trimWindows(windows));
}

export function nowMs() {
  return performance.now();
}

export function recordRouteMetric(route: string, durationMs: number, statusCode: number) {
  upsert(counterBuckets, route, durationMs, statusCode >= 500);
}

export function recordDependencyMetric(dependency: string, operation: string, durationMs: number, isError: boolean) {
  upsert(dependencyBuckets, `${dependency}:${operation}`, durationMs, isError);
}

export function getRouteSnapshots(): RouteSnapshot[] {
  return [...counterBuckets.entries()].map(([route, windows]) => {
    const flattened = windows.flatMap((w) => w.durations);
    const requests = windows.reduce((sum, w) => sum + w.count, 0);
    const errors = windows.reduce((sum, w) => sum + w.errors, 0);
    return {
      route,
      requests,
      errors,
      errorRate: requests ? errors / requests : 0,
      throughputRps: requests / (WINDOW_MS / 1000),
      p95Ms: quantile(flattened, 0.95),
      p99Ms: quantile(flattened, 0.99)
    };
  }).sort((a, b) => b.requests - a.requests);
}

export function getDependencySnapshots(): DependencySnapshot[] {
  return [...dependencyBuckets.entries()].map(([key, windows]) => {
    const [dependency, operation] = key.split(':');
    const flattened = windows.flatMap((w) => w.durations);
    const requests = windows.reduce((sum, w) => sum + w.count, 0);
    const errors = windows.reduce((sum, w) => sum + w.errors, 0);
    const avgMs = flattened.length ? flattened.reduce((sum, value) => sum + value, 0) / flattened.length : 0;
    return {
      dependency: dependency ?? 'unknown',
      operation: operation ?? 'operation',
      requests,
      errors,
      errorRate: requests ? errors / requests : 0,
      avgMs
    };
  }).sort((a, b) => b.requests - a.requests);
}

export function createRouteMetricMiddleware() {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const start = nowMs();
    res.on('finish', () => {
      const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
      recordRouteMetric(route.replace(/\/+/g, '/'), nowMs() - start, res.statusCode);
    });
    next();
  };
}
