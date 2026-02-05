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

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

beforeEach(async () => {
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  supabaseAdmin.from = () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, in() { return this; }, limit() { return this; }, range() { return this; },
    insert() { return this; }, update() { return this; }, upsert() { return this; }, delete() { return this; }, single: async () => ({ data: {}, error: null }), maybeSingle: async () => ({ data: {}, error: null }), then(resolve){ resolve({ data: [], error: null, count: 0}); } });
});

test('auth/admin controllers validam auth e schema', async () => {
  const { acceptInfluencerInvite, authControllerDeps } = await import('../../src/controllers/authController.js');
  const { createInfluencerInvite, adminControllerDeps } = await import('../../src/controllers/adminController.js');

  let res = mockRes();
  await acceptInfluencerInvite({ body: {}, user: null }, res);
  assert.equal(res.statusCode, 401);

  authControllerDeps.acceptInvite = async () => ({ id: 'u1' });
  res = mockRes();
  await acceptInfluencerInvite({ body: { token: '11111111-1111-1111-1111-111111111111' }, user: { id: 'u1', email: 'u@e.com' } }, res);
  assert.equal(res.statusCode, 200);

  adminControllerDeps.createInvite = async () => ({ id: 'i1' });
  res = mockRes();
  await createInfluencerInvite({ body: { email: 'x@y.com' }, user: { id: 'a1' } }, res);
  assert.equal(res.statusCode, 201);
});

test('billing/news/follow/profile retornam cenários esperados', async () => {
  const { createCheckout, billingControllerDeps } = await import('../../src/controllers/billingController.js');
  const { getNews } = await import('../../src/controllers/newsController.js');
  const { follow } = await import('../../src/controllers/followController.js');
  const { getMe } = await import('../../src/controllers/profileController.js');

  billingControllerDeps.createCheckoutSession = async () => ({ url: 'https://checkout' });
  let res = mockRes();
  await createCheckout({ user: { id: 'u1', email: 'u@e.com' }, body: { plan: 'pro' } }, res);
  assert.equal(res.statusCode, 200);

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
  res = mockRes();
  await getNews({ query: { limit: '2' } }, res);
  assert.equal(res.statusCode, 200);

  res = mockRes();
  await follow({ user: null, body: {} }, res);
  assert.equal(res.statusCode, 401);

  res = mockRes();
  await getMe({ user: { id: 'u1' } }, res);
  assert.equal(res.statusCode, 200);
});

test('alerts/posts/notify/portfolio usam dependências mockadas', async () => {
  const { createAlert, alertsControllerDeps } = await import('../../src/controllers/alertsController.js');
  const { createPost, postsControllerDeps } = await import('../../src/controllers/postsController.js');
  const { testNotification, notifyControllerDeps } = await import('../../src/controllers/notifyController.js');
  const { syncPortfolio, portfolioControllerDeps } = await import('../../src/controllers/portfolioController.js');

  alertsControllerDeps.notifyFollowers = async () => {};
  postsControllerDeps.notifyFollowers = async () => {};
  notifyControllerDeps.notifyFollowers = async () => {};
  portfolioControllerDeps.syncPortfolioSnapshot = async () => ({ id: 'snap-1' });

  let res = mockRes();
  await createAlert({ user: { id: 'u1' }, body: { asset: 'BTC', side: 'buy' } }, res);
  assert.equal(res.statusCode, 201);

  res = mockRes();
  await createPost({ user: { id: 'u1' }, body: { text: 'oi' } }, res);
  assert.equal(res.statusCode, 201);

  res = mockRes();
  await testNotification({ user: { id: 'u1' } }, res);
  assert.equal(res.statusCode, 200);

  res = mockRes();
  await syncPortfolio({ user: { id: 'u1' } }, res);
  assert.equal(res.statusCode, 200);
});
