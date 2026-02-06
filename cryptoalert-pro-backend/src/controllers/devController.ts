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
  const defaultPassword = process.env.DEMO_PASSWORD ?? `Dev#${randomUUID().slice(0, 8)}`;

  const demoUsers = [
    { email: process.env.ADMIN_DEMO_EMAIL ?? 'admin_demo@cryptoalert.test', role: 'admin', plan: 'vip', usernamePrefix: 'admin', password: process.env.ADMIN_DEMO_PASSWORD ?? defaultPassword },
    { email: process.env.EXPERT_DEMO_EMAIL ?? 'expert_demo@cryptoalert.test', role: 'influencer', plan: 'pro', usernamePrefix: 'expert', password: process.env.EXPERT_DEMO_PASSWORD ?? defaultPassword },
    { email: process.env.FREE_DEMO_EMAIL ?? 'free_demo@cryptoalert.test', role: 'user', plan: 'free', usernamePrefix: 'free', password: process.env.FREE_DEMO_PASSWORD ?? defaultPassword },
    { email: process.env.PRO_DEMO_EMAIL ?? 'pro_demo@cryptoalert.test', role: 'user', plan: 'pro', usernamePrefix: 'pro', password: process.env.PRO_DEMO_PASSWORD ?? defaultPassword },
    { email: process.env.VIP_DEMO_EMAIL ?? 'vip_demo@cryptoalert.test', role: 'user', plan: 'vip', usernamePrefix: 'vip', password: process.env.VIP_DEMO_PASSWORD ?? defaultPassword }
  ] as const;

  const createdUsers = [];
  for (const user of demoUsers) {
    createdUsers.push(await ensureUser(user.email, user.password, user.role, user.usernamePrefix, user.plan));
  }

  const admin = createdUsers[0];
  const expert = createdUsers[1];
  const freeUser = createdUsers[2];
  const proUser = createdUsers[3];
  const vipUser = createdUsers[4];

  const [alerts, posts] = await Promise.all([
    ensureAlerts(expert.id),
    ensurePosts(expert.id)
  ]);

  await Promise.all([
    ensureFollow(freeUser.id, expert.id, 'influencer'),
    ensureFollow(proUser.id, expert.id, 'influencer'),
    ensureFollow(vipUser.id, expert.id, 'influencer')
  ]);

  await ensurePortfolioSnapshots(expert.id, vipUser.id);
  await ensureNewsCache();

  const magicLinks = await Promise.all(createdUsers.map((user) => generateMagicLink(user.email)));

  logger.info('audit.dev.seed', {
    endpoint: req.originalUrl,
    method: req.method,
    actor_user_id: req.user?.id ?? null,
    seeded_admin_id: admin.id,
    seeded_expert_id: expert.id,
    seeded_users: createdUsers.map((user) => user.id)
  });

  return res.json({
    users: createdUsers.map((user, index) => ({
      ...user,
      magic_link: magicLinks[index]
    })),
    alerts,
    posts,
    notes: 'Credenciais e magic links disponíveis apenas em ambiente de desenvolvimento.'
  });
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

async function generateMagicLink(email: string) {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email
    });
    if (error) {
      return null;
    }
    return data?.properties?.action_link ?? null;
  } catch {
    return null;
  }
}

async function ensureNewsCache() {
  try {
    await supabaseAdmin.from('news_cache').upsert({
      key: 'seed',
      payload: {
        items: [
          {
            id: 'seed-1',
            title: 'Mercado cripto abre a semana em equilíbrio',
            source: 'CryptoAlert Seed',
            url: 'https://cryptoalert.pro/news/seed-1',
            published_at: new Date().toISOString(),
            assets: ['BTC', 'ETH'],
            summary: 'Conteúdo fictício para testes de UI.'
          }
        ],
        meta: { provider: 'seed', cached: true, ttl_seconds: 3600, degraded: false, fetched_at: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
  } catch (error) {
    logger.warn('dev.seed.news_cache_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
}
