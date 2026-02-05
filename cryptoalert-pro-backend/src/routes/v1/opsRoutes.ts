import { Router } from 'express';
import { getRouteSnapshots, getDependencySnapshots } from '../../observability/metrics.js';
import { evaluateDegradation, getAlerts } from '../../observability/degradation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';
import { supabaseAdmin } from '../../config/supabase.js';

export const opsRoutes = Router();

opsRoutes.get('/ops/dashboard', requireAuth, requireRole('admin'), async (_req, res) => {
  evaluateDegradation();
  const routes = getRouteSnapshots();
  const dependencies = getDependencySnapshots();

  const [profilesRes, alerts24hRes, alerts7dRes, syncsRes, pushesRes, incidentsRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, plan, role, created_at, last_active_at'),
    supabaseAdmin.from('alerts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabaseAdmin.from('alerts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    supabaseAdmin.from('portfolios_history').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabaseAdmin.from('ops_incidents').select('id, signal, service_name, status, created_at').order('created_at', { ascending: false }).limit(10)
  ]);

  const profiles = profilesRes.data ?? [];
  const now = Date.now();
  const dau = profiles.filter((p) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 24 * 3600 * 1000).length;
  const wau = profiles.filter((p) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 7 * 24 * 3600 * 1000).length;
  const mau = profiles.filter((p) => p.last_active_at && now - new Date(p.last_active_at).getTime() <= 30 * 24 * 3600 * 1000).length;
  const usersByPlan = profiles.reduce<Record<string, number>>((acc, p) => {
    const plan = p.plan ?? 'free';
    acc[plan] = (acc[plan] ?? 0) + 1;
    return acc;
  }, {});

  const expertsActive = profiles.filter((p) => p.role === 'influencer' || p.role === 'admin').length;
  const topErrors = routes.filter((r) => r.errors > 0).slice(0, 10).map((r) => ({ endpoint: r.route, errors: r.errors, error_rate: r.errorRate }));
  const averageLatencyMs = routes.length ? routes.reduce((sum, r) => sum + r.p95Ms, 0) / routes.length : 0;

  res.json({
    generatedAt: new Date().toISOString(),
    kpis: {
      active_users: { dau, wau, mau },
      users_by_plan: usersByPlan,
      active_experts: expertsActive,
      alerts_created: { last_24h: alerts24hRes.count ?? 0, last_7d: alerts7dRes.count ?? 0 },
      portfolio_syncs_24h: syncsRes.count ?? 0,
      pushes_sent_24h: pushesRes.count ?? 0,
      average_latency_ms: Number(averageLatencyMs.toFixed(2)),
      top_errors: topErrors
    },
    routes: routes.map((item) => ({ endpoint: item.route, p95Ms: item.p95Ms, p99Ms: item.p99Ms, errorRate: item.errorRate, throughputRps: item.throughputRps, requests: item.requests })),
    dependencies,
    incidents: incidentsRes.data ?? [],
    alerts: getAlerts()
  });
});

opsRoutes.get('/ops/alerts', requireAuth, requireRole('admin'), async (_req, res) => {
  evaluateDegradation();
  const [incidentAlerts, providerFailures] = await Promise.all([
    supabaseAdmin.from('ops_incidents').select('id, signal, service_name, status, created_at').order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('ops_events').select('id, event_type, service_name, provider, summary, occurred_at').in('event_type', ['provider_failure']).order('occurred_at', { ascending: false }).limit(20)
  ]);

  res.json({
    alerts: getAlerts(),
    incidents: incidentAlerts.data ?? [],
    provider_failures: providerFailures.data ?? []
  });
});
