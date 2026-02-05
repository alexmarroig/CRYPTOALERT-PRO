import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const DEMO_ASSETS = [
  { symbol: 'BTC', pct: 60 },
  { symbol: 'ETH', pct: 30 },
  { symbol: 'SOL', pct: 10 }
];

export async function seedDevData(req: Request, res: Response) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const expertEmail = process.env.EXPERT_EMAIL;
  const expertPassword = process.env.EXPERT_PASSWORD;
  const premiumEmail = process.env.PREMIUM_EMAIL;
  const premiumPassword = process.env.PREMIUM_PASSWORD;
  const premiumPlan = process.env.PREMIUM_PLAN ?? 'pro';

  if (!adminEmail || !adminPassword || !expertEmail || !expertPassword || !premiumEmail || !premiumPassword) {
    return res.status(400).json({ error: 'Missing seed credentials' });
  }

  const admin = await ensureUser(adminEmail, adminPassword, 'admin', 'admin');
  const expert = await ensureUser(expertEmail, expertPassword, 'influencer', 'expert');
  const premium = await ensureUser(premiumEmail, premiumPassword, 'user', 'premium', premiumPlan);

  const [alerts, posts] = await Promise.all([
    ensureAlerts(expert.id),
    ensurePosts(expert.id)
  ]);

  await ensureFollow(premium.id, expert.id, 'influencer');
  await ensurePortfolioSnapshots(expert.id, premium.id);

  logger.info('audit.dev.seed', {
    endpoint: req.originalUrl,
    method: req.method,
    actor_user_id: req.user?.id ?? null,
    seeded_admin_id: admin.id,
    seeded_expert_id: expert.id,
    seeded_premium_id: premium.id
  });

  return res.json({ admin, expert, premium, alerts, posts });
}

async function ensureUser(email: string, password: string, role: 'admin' | 'influencer' | 'user', usernamePrefix: string, plan = 'free') {
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (existingProfile) {
    await supabaseAdmin.from('profiles').update({ role, plan }).eq('id', existingProfile.id);
    return { id: existingProfile.id, email, password, role, plan };
  }

  const { data: userData, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !userData.user) {
    throw new Error(error?.message ?? 'Failed to create user');
  }

  const username = `${usernamePrefix}-${randomUUID().slice(0, 8)}`;

  await supabaseAdmin.from('profiles').insert({
    id: userData.user.id,
    email,
    username,
    display_name: username,
    role,
    plan
  });

  return { id: userData.user.id, email, password, role, plan };
}

async function ensureAlerts(creatorId: string) {
  const { data: existing } = await supabaseAdmin.from('alerts').select('id').eq('creator_id', creatorId);
  if ((existing ?? []).length >= 3) return existing;

  const payload = [
    { asset: 'BTC', side: 'buy', reason_text: 'Alerta informativo: possível continuação de alta.' },
    { asset: 'ETH', side: 'sell', reason_text: 'Alerta informativo: risco de correção no curto prazo.' },
    { asset: 'SOL', side: 'buy', reason_text: 'Alerta informativo: volume comprador crescente.' }
  ];

  const { data } = await supabaseAdmin.from('alerts').insert(payload.map((item) => ({ ...item, creator_id: creatorId }))).select();
  return data ?? [];
}

async function ensurePosts(creatorId: string) {
  const { data: existing } = await supabaseAdmin.from('posts').select('id').eq('creator_id', creatorId);
  if ((existing ?? []).length >= 2) return existing;

  const payload = [
    { text: 'Atualização informativa: mantenha gestão de risco e tamanho de posição.' },
    { text: 'Resumo do dia: cenário lateral, sem recomendação automática de execução.' }
  ];

  const { data } = await supabaseAdmin.from('posts').insert(payload.map((item) => ({ ...item, creator_id: creatorId }))).select();
  return data ?? [];
}

async function ensureFollow(followerId: string, followingId: string, followingType: 'user' | 'influencer') {
  const { data: existing } = await supabaseAdmin
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from('follows').insert({ follower_id: followerId, following_id: followingId, following_type: followingType });
  }
}

async function ensurePortfolioSnapshots(expertId: string, premiumId: string) {
  const now = new Date().toISOString();

  await supabaseAdmin.from('portfolios_snapshot').upsert({ user_id: expertId, total_value: 0, change_pct_30d: 12.5, assets: DEMO_ASSETS, updated_at: now }, { onConflict: 'user_id' });
  await supabaseAdmin.from('portfolio_visibility').upsert({ user_id: expertId, visibility: 'percent' });

  await supabaseAdmin.from('portfolios_snapshot').upsert({ user_id: premiumId, total_value: 12000, change_pct_30d: -1.2, assets: DEMO_ASSETS, updated_at: now }, { onConflict: 'user_id' });
  await supabaseAdmin.from('portfolio_visibility').upsert({ user_id: premiumId, visibility: 'private' });
}
