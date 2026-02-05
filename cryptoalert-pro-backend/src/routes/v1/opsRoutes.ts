import { Router } from 'express';
import { getRouteSnapshots, getDependencySnapshots } from '../../observability/metrics.js';
import { evaluateDegradation, getAlerts } from '../../observability/degradation.js';

export const opsRoutes = Router();

opsRoutes.get('/ops/dashboard', (_req, res) => {
  evaluateDegradation();
  const routes = getRouteSnapshots();
  const dependencies = getDependencySnapshots();

  res.json({
    generatedAt: new Date().toISOString(),
    routes: routes.map((item) => ({
      endpoint: item.route,
      p95Ms: item.p95Ms,
      p99Ms: item.p99Ms,
      errorRate: item.errorRate,
      throughputRps: item.throughputRps,
      requests: item.requests
    })),
    dependencies,
    red: {
      requestRateRps: routes.reduce((sum, item) => sum + item.throughputRps, 0),
      errorRate: routes.reduce((sum, item) => sum + item.errorRate, 0) / Math.max(routes.length, 1),
      durationP95Ms: Math.max(...routes.map((item) => item.p95Ms), 0),
      durationP99Ms: Math.max(...routes.map((item) => item.p99Ms), 0)
    },
    use: dependencies.map((dep) => ({
      dependency: dep.dependency,
      utilization: dep.requests,
      saturationMs: dep.avgMs,
      errors: dep.errorRate
    })),
    alerts: getAlerts()
  });
});

opsRoutes.get('/ops/alerts', (_req, res) => {
  evaluateDegradation();
  res.json({ alerts: getAlerts() });
});
