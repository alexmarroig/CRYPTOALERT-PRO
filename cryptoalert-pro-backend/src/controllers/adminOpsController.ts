import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { getTopErrors } from '../observability/errorTracker.js';

const usersQuerySchema = z.object({
  query: z.string().optional(),
  plan: z.enum(['free', 'pro', 'vip']).optional(),
  role: z.enum(['user', 'influencer', 'admin']).optional(),
  status: z.string().optional(),
  page: z.string().optional()
});

const moderationActionSchema = z.object({
  action: z.enum(['hide_post', 'ban_user', 'unban_user', 'flag_alert', 'unflag_alert']),
  target_id: z.string().min(4),
  reason: z.string().min(4).max(500)
});

const usageRangeSchema = z.object({
  range: z.enum(['7d', '30d']).optional()
});

const errorsRangeSchema = z.object({
  range: z.enum(['24h', '7d']).optional()
});

function maskEmail(email: string | null) {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const visible = user.length <= 2 ? user[0] : user.slice(0, 2);
  return `${visible}***@${domain}`;
}

function parsePage(value?: string) {
  const page = Number(value);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

function sinceFromRange(range: '7d' | '30d') {
  const date = new Date();
  date.setDate(date.getDate() - (range === '30d' ? 30 : 7));
  return date.toISOString();
}

export async function listUsersAdmin(req: Request, res: Response) {
  const parsed = usersQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const page = parsePage(parsed.data.page);
  const limit = 20;
  const offset = (page - 1) * limit;
  let query = supabaseAdmin
    .from('profiles')
    .select('id, email, username, role, plan, created_at, last_seen_at, status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (parsed.data.query) {
    const term = parsed.data.query.trim();
    query = query.or(`email.ilike.%${term}%,username.ilike.%${term}%`);
  }
  if (parsed.data.plan) query = query.eq('plan', parsed.data.plan);
  if (parsed.data.role) query = query.eq('role', parsed.data.role);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    items: (data ?? []).map((row) => ({
      id: row.id,
      email_masked: maskEmail(row.email ?? null),
      username: row.username,
      role: row.role,
      plan: row.plan,
      status: row.status ?? 'active',
      created_at: row.created_at,
      last_seen_at: row.last_seen_at ?? null
    })),
    page,
    total: count ?? data?.length ?? 0
  });
}

export async function getUserAdmin(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, display_name, role, plan, created_at, last_seen_at, status, bio, avatar_url')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'User not found' });

  return res.json({
    user: {
      id: data.id,
      email_masked: maskEmail(data.email ?? null),
      username: data.username,
      display_name: data.display_name ?? null,
      role: data.role,
      plan: data.plan,
      status: data.status ?? 'active',
      created_at: data.created_at,
      last_seen_at: data.last_seen_at ?? null,
      bio: data.bio ?? null,
      avatar_url: data.avatar_url ?? null
    }
  });
}

export async function getSubscriptionsSummary(req: Request, res: Response) {
  const [free, pro, vip, trials] = await Promise.all([
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'free'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'vip'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gt('trial_ends_at', new Date().toISOString())
  ]);

  if (free.error || pro.error || vip.error || trials.error) {
    return res.status(500).json({ error: free.error?.message ?? pro.error?.message ?? vip.error?.message ?? trials.error?.message ?? 'Failed to load subscription summary' });
  }

  return res.json({
    summary: {
      free: free.count ?? 0,
      pro: pro.count ?? 0,
      vip: vip.count ?? 0,
      churn_30d: 0,
      mrr_estimate: (pro.count ?? 0) * 39 + (vip.count ?? 0) * 99,
      trials_active: trials.count ?? 0
    }
  });
}

export async function getUsageSummary(req: Request, res: Response) {
  const parsed = usageRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const range = parsed.data.range ?? '7d';
  const since = sinceFromRange(range);
  const today = new Date().toISOString().slice(0, 10);

  const [usageRows, dau, wau, mau] = await Promise.all([
    supabaseAdmin
      .from('api_usage_daily')
      .select('date, route, requests')
      .gte('date', since.slice(0, 10)),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', since),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  ]);

  if (usageRows.error || dau.error || wau.error || mau.error) {
    return res.status(500).json({ error: usageRows.error?.message ?? dau.error?.message ?? wau.error?.message ?? mau.error?.message ?? 'Failed to load usage summary' });
  }

  const usageMap = new Map<string, number>();
  for (const row of usageRows.data ?? []) {
    const key = row.route;
    usageMap.set(key, (usageMap.get(key) ?? 0) + (row.requests ?? 0));
  }

  return res.json({
    range,
    as_of: today,
    summary: {
      dau: dau.count ?? 0,
      wau: wau.count ?? 0,
      mau: mau.count ?? 0,
      alerts_created: usageMap.get('POST /v1/alerts') ?? 0,
      syncs: usageMap.get('POST /v1/portfolio/sync') ?? 0,
      posts_created: usageMap.get('POST /v1/posts') ?? 0,
      follows: usageMap.get('POST /v1/follow') ?? 0
    }
  });
}

export async function getTopErrorsAdmin(req: Request, res: Response) {
  const parsed = errorsRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const range = parsed.data.range ?? '24h';
  const sinceMs = range === '7d' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const top = getTopErrors(sinceMs, 10);

  return res.json({
    range,
    items: top.map((item) => ({
      endpoint: item.endpoint,
      code: item.code,
      count: item.count,
      last_seen_at: item.last_seen_at,
      sample: {
        request_id: item.sample.request_id,
        status: item.sample.status,
        message: item.sample.message
      }
    }))
  });
}

export async function createModerationAction(req: Request, res: Response) {
  const parsed = moderationActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const action = parsed.data.action;
  const targetId = parsed.data.target_id;

  const { data: moderation, error } = await supabaseAdmin
    .from('moderation_actions')
    .insert({
      action,
      target_id: targetId,
      reason: parsed.data.reason,
      actor_id: req.user?.id ?? null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  if (action === 'ban_user') {
    await supabaseAdmin.from('profiles').update({ status: 'banned' }).eq('id', targetId);
  }
  if (action === 'unban_user') {
    await supabaseAdmin.from('profiles').update({ status: 'active' }).eq('id', targetId);
  }
  if (action === 'hide_post') {
    await supabaseAdmin.from('posts').update({ status: 'hidden' }).eq('id', targetId);
  }
  if (action === 'flag_alert') {
    await supabaseAdmin.from('alerts').update({ status: 'flagged' }).eq('id', targetId);
  }
  if (action === 'unflag_alert') {
    await supabaseAdmin.from('alerts').update({ status: 'active' }).eq('id', targetId);
  }

  return res.status(201).json({ action: moderation });
}

export async function getModerationQueue(req: Request, res: Response) {
  const { data: tickets } = await supabaseAdmin
    .from('support_tickets')
    .select('id, type, title, created_at, status, user_id')
    .eq('type', 'expert_report')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return res.json({ items: tickets ?? [] });
}

export async function getCostsSummary(req: Request, res: Response) {
  const since = new Date();
  since.setDate(since.getDate() - 1);

  const [usageRows, ticketsCount] = await Promise.all([
    supabaseAdmin.from('api_usage_daily').select('route, requests').gte('date', since.toISOString().slice(0, 10)),
    supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true })
  ]);

  if (usageRows.error || ticketsCount.error) {
    return res.status(500).json({ error: usageRows.error?.message ?? ticketsCount.error?.message ?? 'Failed to load cost summary' });
  }

  const usageMap = new Map<string, number>();
  for (const row of usageRows.data ?? []) {
    usageMap.set(row.route, (usageMap.get(row.route) ?? 0) + (row.requests ?? 0));
  }

  const newsCalls = usageMap.get('GET /v1/news') ?? 0;
  const syncCalls = usageMap.get('POST /v1/portfolio/sync') ?? 0;

  const newsCost = newsCalls * Number(process.env.NEWS_CALL_COST_USD ?? 0.0005);
  const syncCost = syncCalls * Number(process.env.PORTFOLIO_SYNC_COST_USD ?? 0.01);

  return res.json({
    window: '24h',
    summary: {
      news_calls: newsCalls,
      portfolio_sync_calls: syncCalls,
      tickets_storage: ticketsCount.count ?? 0,
      estimated_cost_usd: Number((newsCost + syncCost).toFixed(4))
    }
  });
}
