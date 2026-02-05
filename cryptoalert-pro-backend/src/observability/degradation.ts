import { getDependencySnapshots, getRouteSnapshots, type RouteSnapshot } from './metrics.js';

type BaselineState = {
  ewmaLatency: number;
  ewmaErrorRate: number;
  seasonalLatency: Map<number, number>;
  seasonalErrorRate: Map<number, number>;
};

export type DegradationAlert = {
  endpoint: string;
  latencyRegressionPct: number;
  errorRegressionPct: number;
  hypothesis: 'DB' | 'rede' | 'provider' | 'aplicação';
  observedP95Ms: number;
  baselineP95Ms: number;
  observedErrorRate: number;
  baselineErrorRate: number;
  createdAt: string;
};

const ALPHA = 0.3;
const states = new Map<string, BaselineState>();
const alertBuffer: DegradationAlert[] = [];

function getState(key: string): BaselineState {
  const existing = states.get(key);
  if (existing) return existing;
  const created: BaselineState = {
    ewmaLatency: 0,
    ewmaErrorRate: 0,
    seasonalLatency: new Map<number, number>(),
    seasonalErrorRate: new Map<number, number>()
  };
  states.set(key, created);
  return created;
}

function ewma(previous: number, current: number): number {
  if (!previous) return current;
  return previous + ALPHA * (current - previous);
}

function inferHypothesis(route: RouteSnapshot): DegradationAlert['hypothesis'] {
  const dependencies = getDependencySnapshots();
  const supabase = dependencies.filter((item) => item.dependency === 'supabase').reduce((sum, item) => sum + item.errorRate, 0);
  const stripe = dependencies.filter((item) => item.dependency === 'stripe').reduce((sum, item) => sum + item.errorRate, 0);
  const news = dependencies.filter((item) => item.dependency === 'news_provider').reduce((sum, item) => sum + item.errorRate, 0);

  if (supabase > 0.1) return 'DB';
  if (stripe > 0.1 || news > 0.1) return 'provider';
  if (route.p95Ms > 1200) return 'rede';
  return 'aplicação';
}

export function evaluateDegradation() {
  const now = new Date();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  for (const route of getRouteSnapshots()) {
    const state = getState(route.route);
    state.ewmaLatency = ewma(state.ewmaLatency, route.p95Ms);
    state.ewmaErrorRate = ewma(state.ewmaErrorRate, route.errorRate);

    const seasonalLatencyBase = state.seasonalLatency.get(minuteOfDay) ?? route.p95Ms;
    const seasonalErrorBase = state.seasonalErrorRate.get(minuteOfDay) ?? route.errorRate;

    const baselineLatency = (state.ewmaLatency + seasonalLatencyBase) / 2;
    const baselineError = (state.ewmaErrorRate + seasonalErrorBase) / 2;

    const latencyRegressionPct = baselineLatency > 0 ? ((route.p95Ms - baselineLatency) / baselineLatency) * 100 : 0;
    const errorRegressionPct = baselineError > 0 ? ((route.errorRate - baselineError) / baselineError) * 100 : 0;

    if ((latencyRegressionPct > 30 && route.p95Ms > 300) || (errorRegressionPct > 50 && route.errorRate > 0.03)) {
      alertBuffer.unshift({
        endpoint: route.route,
        latencyRegressionPct,
        errorRegressionPct,
        hypothesis: inferHypothesis(route),
        observedP95Ms: route.p95Ms,
        baselineP95Ms: baselineLatency,
        observedErrorRate: route.errorRate,
        baselineErrorRate: baselineError,
        createdAt: now.toISOString()
      });
    }

    state.seasonalLatency.set(minuteOfDay, ewma(seasonalLatencyBase, route.p95Ms));
    state.seasonalErrorRate.set(minuteOfDay, ewma(seasonalErrorBase, route.errorRate));
  }

  if (alertBuffer.length > 50) {
    alertBuffer.splice(50);
  }
}

export function getAlerts() {
  return alertBuffer;
}
