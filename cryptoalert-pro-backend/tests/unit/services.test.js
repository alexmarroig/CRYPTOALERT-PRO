import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

const requiredEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon_key_minimum_length',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_key_minimum_length',
  STRIPE_SECRET: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_VIP: 'price_vip',
  FIREBASE_PROJECT_ID: 'test-project',
  FCM_SERVICE_ACCOUNT_JSON: '{"type":"service_account","project_id":"test","private_key":"-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n","client_email":"test@example.com"}',
  JWT_SECRET: 'jwt_secret_minimum_length',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
};
for (const [k, v] of Object.entries(requiredEnv)) process.env[k] = v;

function createMockFrom(results) {
  return {
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    upsert: async () => (results.upsert ?? { data: null, error: null }),
    update: async () => (results.update ?? { data: null, error: null }),
    insert: async () => (results.insert ?? { data: null, error: null }),
    single: async () => (results.single ?? { data: null, error: null }),
    maybeSingle: async () => (results.maybeSingle ?? { data: null, error: null }),
    range() { return this; }
  };
}

beforeEach(async () => {
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  supabaseAdmin.from = () => createMockFrom({});
});

test('newsService normaliza e usa cache', async () => {
  const { fetchNews } = await import('../../src/services/newsService.js');
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        items: [{ url: 'https://n.com/a', title: 'A', source: 'S', assets: [{ symbol: 'btc' }] }]
      })
    };
  };

  const first = await fetchNews({ limit: 1, lang: 'pt' });
  const second = await fetchNews({ limit: 1, lang: 'pt' });

  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  assert.deepEqual(first.items[0].assets, ['btc']);
});

test('newsService falha quando provider indisponível', async () => {
  const { fetchNewsCategories } = await import('../../src/services/newsService.js');
  globalThis.fetch = async () => ({ ok: false });
  await assert.rejects(() => fetchNewsCategories(), /Failed to fetch categories/);
});

test('portfolioSync agrega holdings e gera snapshot', async () => {
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  const { portfolioSyncDeps, syncPortfolioSnapshot } = await import('../../src/services/portfolioSync.js');

  let profileUpdated = false;
  supabaseAdmin.from = (table) => {
    if (table === 'exchange_connections') {
      return createMockFrom({ single: { data: null, error: null }, select: null, update: null, upsert: null, insert: null, maybeSingle: null, range: null,
        });
    }
    const chain = {
      select() { return this; },
      eq() { return this; },
      upsert() { return this; },
      update() { return this; },
      single: async () => ({ data: table === 'profiles' ? { points: 0, streak_days: 0 } : { id: 'snap-1' }, error: null }),
      then(resolve) {
        if (table === 'exchange_connections') resolve({ data: [{ exchange: 'binance', api_key: 'k', api_secret_encrypted: 'enc' }], error: null });
        else resolve({ data: null, error: null });
      }
    };
    if (table === 'profiles') {
      chain.update = () => { profileUpdated = true; return chain; };
    }
    return chain;
  };

  portfolioSyncDeps.decryptApiKey = () => 'secret';
  portfolioSyncDeps.syncExchange = async () => ([{ symbol: 'BTC', amount: 1, value: 100 }]);

  await syncPortfolioSnapshot('u1');
  assert.equal(profileUpdated, true);
});

test('inviteService valida convite e promove usuário', async () => {
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  const { acceptInvite } = await import('../../src/services/inviteService.js');

  let inviteUpdated = false;
  supabaseAdmin.from = (table) => ({
    select() { return this; },
    eq() { return this; },
    update() { if (table === 'invites') inviteUpdated = true; return this; },
    single: async () => {
      if (table === 'invites') return { data: { id: 'i1', email: 'u@e.com', status: 'pending', expires_at: new Date(Date.now() + 10000).toISOString() }, error: null };
      return { data: { id: 'u1', role: 'influencer' }, error: null };
    }
  });

  const profile = await acceptInvite('u1', 'u@e.com', 'token');
  assert.equal(inviteUpdated, true);
  assert.equal(profile.role, 'influencer');
});

test('stripeService cria checkout e processa webhook', async () => {
  const { stripe } = await import('../../src/config/stripe.js');
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  const { createCheckoutSession, handleStripeWebhook } = await import('../../src/services/stripeService.js');

  stripe.checkout.sessions.create = async () => ({ url: 'https://checkout.test' });
  const session = await createCheckoutSession('a@b.com', 'u1', 'pro');
  assert.equal(session.url, 'https://checkout.test');

  let planUpdated = false;
  supabaseAdmin.from = (table) => ({
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: table === 'stripe_customers' ? { user_id: 'u1' } : null, error: null }),
    update() { if (table === 'profiles') planUpdated = true; return this; },
    upsert: async () => ({ data: null, error: null })
  });

  await handleStripeWebhook({
    type: 'customer.subscription.updated',
    data: { object: { id: 's1', customer: 'c1', current_period_end: 1, items: { data: [{ price: { id: 'price_pro' } }] }, metadata: { user_id: 'u1' } } }
  });
  assert.equal(planUpdated, true);
});

test('notifications envia push para token válido e ignora token nulo', async () => {
  const { firebaseAdmin } = await import('../../src/config/firebase.js');
  const { sendPushNotification } = await import('../../src/services/notifications.js');

  let sent = 0;
  Object.defineProperty(firebaseAdmin, 'messaging', {
    configurable: true,
    value: () => ({ send: async () => { sent += 1; } })
  });

  await sendPushNotification(null, { coin: 'BTC', direction: 'buy', entry_price: 1, id: '1' });
  await sendPushNotification('token-1', { coin: 'BTC', direction: 'buy', entry_price: 1, id: '1' });
  assert.equal(sent, 1);
});
