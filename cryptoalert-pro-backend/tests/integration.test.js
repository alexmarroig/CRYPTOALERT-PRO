import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';

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
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  DEV_SEED_KEY: 'dev_seed_key'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

async function loadApp() {
  const { createApp } = await import('../src/app.js');
  return createApp();
}

class QueryBuilder {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = [];
    this._order = null;
    this._range = null;
    this._limit = null;
    this._selectOptions = null;
    this._or = null;
    this._action = null;
    this._payload = null;
    this._onConflict = null;
  }

  select(_columns, options) {
    this._selectOptions = options ?? null;
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field, values) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  gte(field, value) {
    this.filters.push((row) => row[field] >= value);
    return this;
  }

  not(field, operator, value) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
    }
    return this;
  }

  or(statement) {
    this._or = statement;
    return this;
  }

  order(field, { ascending }) {
    this._order = { field, ascending };
    return this;
  }

  range(from, to) {
    this._range = { from, to };
    return this;
  }

  limit(value) {
    this._limit = value;
    return this;
  }

  insert(payload) {
    this._action = 'insert';
    this._payload = payload;
    return this;
  }

  update(payload) {
    this._action = 'update';
    this._payload = payload;
    return this;
  }

  upsert(payload, { onConflict } = {}) {
    this._action = 'upsert';
    this._payload = payload;
    this._onConflict = onConflict;
    return this;
  }

  delete() {
    this._action = 'delete';
    return this;
  }

  async single() {
    const result = await this.execute();
    return { ...result, data: result.data?.[0] ?? null };
  }

  async maybeSingle() {
    const result = await this.execute();
    return { ...result, data: result.data?.[0] ?? null };
  }

  async execute() {
    const table = this.state[this.table];
    if (!Array.isArray(table)) {
      return { data: null, error: { message: 'Unknown table' } };
    }

    let resultRows = [];

    if (this._action === 'insert') {
      const payload = Array.isArray(this._payload) ? this._payload : [this._payload];
      const inserted = payload.map((row) => ({ id: row.id ?? crypto.randomUUID(), ...row }));
      table.push(...inserted);
      resultRows = inserted;
    } else if (this._action === 'update') {
      const updated = [];
      for (const row of table) {
        if (this.filters.every((filter) => filter(row))) {
          Object.assign(row, this._payload);
          updated.push(row);
        }
      }
      resultRows = updated;
    } else if (this._action === 'upsert') {
      const payload = Array.isArray(this._payload) ? this._payload : [this._payload];
      const updated = [];
      for (const rowPayload of payload) {
        const keys = (this._onConflict ?? '').split(',').map((key) => key.trim()).filter(Boolean);
        const existing = keys.length
          ? table.find((row) => keys.every((key) => row[key] === rowPayload[key]))
          : null;
        if (existing) {
          Object.assign(existing, rowPayload);
          updated.push(existing);
        } else {
          const inserted = { id: rowPayload.id ?? crypto.randomUUID(), ...rowPayload };
          table.push(inserted);
          updated.push(inserted);
        }
      }
      resultRows = updated;
    } else if (this._action === 'delete') {
      const remaining = [];
      for (const row of table) {
        if (this.filters.every((filter) => filter(row))) {
          continue;
        }
        remaining.push(row);
      }
      this.state[this.table] = remaining;
      resultRows = [];
    } else {
      resultRows = [...table];
    }

    if (this._or) {
      const match = /username\\.ilike\\.%(.*)%,display_name\\.ilike\\.%(.*)%/.exec(this._or);
      if (match) {
        const term = match[1].toLowerCase();
        resultRows = resultRows.filter((row) =>
          (row.username ?? '').toLowerCase().includes(term)
          || (row.display_name ?? '').toLowerCase().includes(term)
        );
      }
    }

    if (this.filters.length && this._action !== 'insert' && this._action !== 'upsert') {
      resultRows = resultRows.filter((row) => this.filters.every((filter) => filter(row)));
    }

    if (this._order) {
      const { field, ascending } = this._order;
      resultRows.sort((a, b) => {
        if (a[field] === b[field]) return 0;
        return ascending ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1);
      });
    }

    if (this._range) {
      resultRows = resultRows.slice(this._range.from, this._range.to + 1);
    }

    if (this._limit !== null && this._limit !== undefined) {
      resultRows = resultRows.slice(0, this._limit);
    }

    const count = this._selectOptions?.count === 'exact' ? resultRows.length : null;
    const data = this._selectOptions?.head ? [] : resultRows;

    return { data, error: null, count };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

const state = {
  profiles: [],
  admin_whitelist: [],
  invites: [],
  follows: [],
  alerts: [],
  posts: [],
  portfolios_snapshot: [],
  portfolio_visibility: [],
  push_tokens: [],
  stripe_customers: [],
  influencer_metrics: [],
  exchange_connections: []
};

const authUsers = new Map();

const routeScenarios = [
  { method: 'GET', path: '/v1/me', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'PATCH', path: '/v1/me', authRequired: true, roleRequired: null, validPayload: { display_name: 'Novo nome' }, invalidPayload: { username: 'ab' }, expectedStatus: [200, 400, 401] },
  { method: 'POST', path: '/v1/auth/accept-invite', authRequired: true, roleRequired: null, validPayload: { token: '00000000-0000-0000-0000-000000000000' }, invalidPayload: { token: 'bad' }, expectedStatus: [200, 400, 401] },
  { method: 'POST', path: '/v1/admin/invites', authRequired: true, roleRequired: 'admin', validPayload: { email: 'person@example.com' }, invalidPayload: { email: 'bad' }, expectedStatus: [201, 400, 401, 403] },
  { method: 'GET', path: '/v1/admin/invites', authRequired: true, roleRequired: 'admin', validPayload: null, invalidPayload: null, expectedStatus: [200, 401, 403] },
  { method: 'POST', path: '/v1/admin/invites/:id/revoke', authRequired: true, roleRequired: 'admin', validPayload: null, invalidPayload: null, expectedStatus: [200, 401, 403] },
  { method: 'GET', path: '/v1/admin/influencers', authRequired: true, roleRequired: 'admin', validPayload: null, invalidPayload: null, expectedStatus: [200, 401, 403] },
  { method: 'POST', path: '/v1/follow', authRequired: true, roleRequired: null, validPayload: { followingId: '22222222-2222-2222-2222-222222222222' }, invalidPayload: { followingId: 'x' }, expectedStatus: [201, 400, 401] },
  { method: 'DELETE', path: '/v1/follow/:id', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [204, 401] },
  { method: 'GET', path: '/v1/following', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'GET', path: '/v1/followers', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'GET', path: '/v1/ranking/friends', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'GET', path: '/v1/alerts', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200] },
  { method: 'POST', path: '/v1/alerts', authRequired: true, roleRequired: 'influencer|admin', validPayload: { asset: 'BTC', side: 'buy' }, invalidPayload: { asset: '', side: 'hold' }, expectedStatus: [201, 400, 401, 403] },
  { method: 'PATCH', path: '/v1/alerts/:id/status', authRequired: true, roleRequired: 'influencer|admin', validPayload: { status: 'closed' }, invalidPayload: { status: 'done' }, expectedStatus: [200, 400, 401, 403] },
  { method: 'GET', path: '/v1/posts', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200] },
  { method: 'POST', path: '/v1/posts', authRequired: true, roleRequired: 'influencer|admin', validPayload: { text: 'Conteúdo' }, invalidPayload: { text: '' }, expectedStatus: [201, 400, 401, 403] },
  { method: 'POST', path: '/v1/portfolio/connect', authRequired: true, roleRequired: null, validPayload: { exchange: 'binance', apiKey: 'k', apiSecret: 's' }, invalidPayload: { exchange: 'invalid' }, expectedStatus: [201, 400, 401] },
  { method: 'POST', path: '/v1/portfolio/test-connection', authRequired: true, roleRequired: null, validPayload: { exchange: 'binance', apiKey: 'k', apiSecret: 's' }, invalidPayload: { exchange: 'invalid' }, expectedStatus: [200, 400, 401] },
  { method: 'POST', path: '/v1/portfolio/sync', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'GET', path: '/v1/portfolio/me', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'PATCH', path: '/v1/portfolio/visibility', authRequired: true, roleRequired: null, validPayload: { visibility: 'public' }, invalidPayload: { visibility: 'only-me' }, expectedStatus: [200, 400, 401] },
  { method: 'GET', path: '/v1/portfolio/public/:username', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 403, 404] },
  { method: 'GET', path: '/v1/influencer/metrics/me', authRequired: true, roleRequired: 'influencer|admin', validPayload: null, invalidPayload: null, expectedStatus: [200, 401, 403] },
  { method: 'POST', path: '/v1/notify/test', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'POST', path: '/v1/push/register', authRequired: true, roleRequired: null, validPayload: { fcmToken: 'fcm', device: 'ios' }, invalidPayload: { fcmToken: '' }, expectedStatus: [201, 400, 401] },
  { method: 'POST', path: '/v1/billing/checkout', authRequired: true, roleRequired: null, validPayload: { plan: 'pro' }, invalidPayload: { plan: 'invalid' }, expectedStatus: [200, 400, 401] },
  { method: 'GET', path: '/v1/billing/status', authRequired: true, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 401] },
  { method: 'POST', path: '/v1/billing/webhook', authRequired: false, roleRequired: null, validPayload: {}, invalidPayload: null, expectedStatus: [200, 400] },
  { method: 'GET', path: '/v1/ranking', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 400] },
  { method: 'GET', path: '/v1/news', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 400] },
  { method: 'GET', path: '/v1/news/categories', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200] },
  { method: 'GET', path: '/v1/market/fear-greed', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200] },
  { method: 'GET', path: '/v1/experts', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 400] },
  { method: 'GET', path: '/v1/experts/:username', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 400, 404] },
  { method: 'POST', path: '/v1/dev/seed', authRequired: false, roleRequired: null, validPayload: null, invalidPayload: null, expectedStatus: [200, 400, 401] }
];

beforeEach(async () => {
  const { supabaseAdmin } = await import('../src/config/supabase.js');
  const { stripe } = await import('../src/config/stripe.js');
  const ccxt = (await import('ccxt')).default;

  state.profiles = [
    { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com', username: 'admin', display_name: 'Admin', role: 'admin', plan: 'free' },
    { id: '22222222-2222-2222-2222-222222222222', email: 'expert@example.com', username: 'expert', display_name: 'Expert', role: 'influencer', plan: 'free' },
    { id: '33333333-3333-3333-3333-333333333333', email: 'user@example.com', username: 'user', display_name: 'User', role: 'user', plan: 'free' },
    { id: '44444444-4444-4444-4444-444444444444', email: 'friend@example.com', username: 'friend', display_name: 'Friend', role: 'user', plan: 'free' }
  ];
  state.admin_whitelist = [];
  state.invites = [];
  state.follows = [];
  state.alerts = [];
  state.posts = [];
  state.portfolios_snapshot = [];
  state.portfolio_visibility = [];
  state.push_tokens = [];
  state.stripe_customers = [];
  state.influencer_metrics = [];
  state.exchange_connections = [];

  authUsers.clear();
  authUsers.set('admin-token', { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com' });
  authUsers.set('user-token', { id: '33333333-3333-3333-3333-333333333333', email: 'user@example.com' });
  authUsers.set('expert-token', { id: '22222222-2222-2222-2222-222222222222', email: 'expert@example.com' });
  authUsers.set('friend-token', { id: '44444444-4444-4444-4444-444444444444', email: 'friend@example.com' });

  supabaseAdmin.from = (table) => new QueryBuilder(table, state);
  supabaseAdmin.auth = {
    getUser: async (token) => {
      const user = authUsers.get(token);
      if (!user) return { data: { user: null }, error: new Error('Unauthorized') };
      return { data: { user }, error: null };
    },
    admin: {
      createUser: async ({ email }) => ({ data: { user: { id: crypto.randomUUID(), email } }, error: null })
    }
  };

  stripe.checkout.sessions.create = async () => ({ url: 'https://checkout.test/session' });
  stripe.webhooks.constructEvent = () => ({ type: 'customer.subscription.created', data: { object: { items: { data: [{ price: { id: 'price_pro' } }] }, customer: 'cus_123', metadata: { user_id: '33333333-3333-3333-3333-333333333333' }, id: 'sub_123', current_period_end: 1730000000 } } });

  const fakeExchange = class {
    async fetchBalance() {
      return { BTC: { free: 1 }, ETH: { free: 2 } };
    }
  };
  ccxt.binance = fakeExchange;
  ccxt.okx = fakeExchange;

  globalThis.fetch = async (url) => {
    if (String(url).includes('/news/categories')) {
      return { ok: true, json: async () => ({ categories: ['btc', 'defi'] }) };
    }
    if (String(url).includes('/market/fear-greed')) {
      return { ok: true, json: async () => ({ data: { value: 70, value_classification: 'Greed', updated_at: '2024-01-01' } }) };
    }
    return { ok: true, json: async () => ({ items: [{ id: 'news-1', title: 'BTC', source: 'News', url: 'https://example.com', published_at: '2024-01-01', assets: ['BTC'] }] }) };
  };
});

function requestAs(app, token) {
  return {
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    patch: (path) => request(app).patch(path).set('Authorization', `Bearer ${token}`),
    delete: (path) => request(app).delete(path).set('Authorization', `Bearer ${token}`)
  };
}

test('cenário: tabela de rotas cobre módulos do index', () => {
  const registeredRouteGroups = ['/me', '/auth', '/admin', '/alerts', '/posts', '/portfolio', '/influencer', '/billing', '/ranking', '/news', '/experts', '/dev', '/follow', '/notify', '/push', '/market'];
  const scenarioPaths = routeScenarios.map((scenario) => scenario.path);
  for (const group of registeredRouteGroups) {
    assert.ok(scenarioPaths.some((path) => path.includes(group)), `missing scenario group ${group}`);
  }
  assert.ok(routeScenarios.length >= 30);
});

test('health check returns ok', async () => {
  const app = await loadApp();
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('protected routes return 401 without token', async () => {
  const app = await loadApp();
  const protectedCases = [
    ['get', '/v1/me'],
    ['patch', '/v1/me'],
    ['post', '/v1/auth/accept-invite'],
    ['post', '/v1/admin/invites'],
    ['get', '/v1/admin/invites'],
    ['post', '/v1/admin/invites/id/revoke'],
    ['get', '/v1/admin/influencers'],
    ['post', '/v1/follow'],
    ['delete', '/v1/follow/22222222-2222-2222-2222-222222222222'],
    ['get', '/v1/following'],
    ['get', '/v1/followers'],
    ['get', '/v1/ranking/friends'],
    ['post', '/v1/alerts'],
    ['patch', '/v1/alerts/alert-1/status'],
    ['post', '/v1/posts'],
    ['post', '/v1/portfolio/connect'],
    ['post', '/v1/portfolio/test-connection'],
    ['post', '/v1/portfolio/sync'],
    ['get', '/v1/portfolio/me'],
    ['patch', '/v1/portfolio/visibility'],
    ['get', '/v1/influencer/metrics/me'],
    ['post', '/v1/notify/test'],
    ['post', '/v1/push/register'],
    ['post', '/v1/billing/checkout'],
    ['get', '/v1/billing/status']
  ];

  for (const [method, path] of protectedCases) {
    const response = await request(app)[method](path);
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`);
  }
});

test('role-protected endpoints return 403 for user role', async () => {
  const app = await loadApp();
  const asUser = requestAs(app, 'user-token');

  const checks = [
    await asUser.post('/v1/admin/invites').send({ email: 'blocked@example.com' }),
    await asUser.get('/v1/admin/invites'),
    await asUser.post('/v1/admin/invites/some-id/revoke'),
    await asUser.get('/v1/admin/influencers'),
    await asUser.post('/v1/alerts').send({ asset: 'BTC', side: 'buy' }),
    await asUser.patch('/v1/alerts/alert-x/status').send({ status: 'closed' }),
    await asUser.post('/v1/posts').send({ text: 'texto' }),
    await asUser.get('/v1/influencer/metrics/me')
  ];

  checks.forEach((response) => assert.equal(response.status, 403));
});

test('validation errors (400) for Zod-backed endpoints', async () => {
  const app = await loadApp();
  const asUser = requestAs(app, 'user-token');
  const asExpert = requestAs(app, 'expert-token');
  const asAdmin = requestAs(app, 'admin-token');

  const checks = [
    await asUser.patch('/v1/me').send({ username: 'ab' }),
    await asUser.post('/v1/auth/accept-invite').send({ token: 'bad-token' }),
    await asAdmin.post('/v1/admin/invites').send({ email: 'bad-email' }),
    await asUser.post('/v1/follow').send({ followingId: 'not-uuid' }),
    await asExpert.post('/v1/alerts').send({ asset: '', side: 'hold' }),
    await asExpert.patch('/v1/alerts/alert-1/status').send({ status: 'done' }),
    await asExpert.post('/v1/posts').send({ text: '' }),
    await asUser.post('/v1/portfolio/connect').send({ exchange: 'coinbase' }),
    await asUser.post('/v1/portfolio/test-connection').send({ exchange: 'coinbase' }),
    await asUser.patch('/v1/portfolio/visibility').send({ visibility: 'only-me' }),
    await asUser.post('/v1/push/register').send({ fcmToken: '' }),
    await asUser.post('/v1/billing/checkout').send({ plan: 'gold' }),
    await request(app).get('/v1/news?lang=es')
  ];

  checks.forEach((response) => {
    assert.equal(response.status, 400);
    assert.ok(response.body.error);
  });
});

test('success cases by endpoint + response contract shape', async () => {
  state.alerts.push({ id: 'alert-1', creator_id: '22222222-2222-2222-2222-222222222222', side: 'buy', asset: 'BTC', status: 'active', created_at: '2024-01-01' });
  state.posts.push({ id: 'post-1', creator_id: '22222222-2222-2222-2222-222222222222', text: 'post', created_at: '2024-01-01' });
  state.invites.push({ id: 'invite-1', email: 'user@example.com', token: '55555555-5555-5555-5555-555555555555', status: 'pending', expires_at: '2099-01-01', invited_by: '11111111-1111-1111-1111-111111111111' });
  state.portfolios_snapshot.push(
    { id: 'snap-1', user_id: '33333333-3333-3333-3333-333333333333', total_value: 1000, change_pct_30d: 2, assets: [], updated_at: '2024-01-01' },
    { id: 'snap-2', user_id: '22222222-2222-2222-2222-222222222222', total_value: 2000, change_pct_30d: 5, assets: [{ symbol: 'BTC', pct: 60 }], updated_at: '2024-01-01' },
    { id: 'snap-3', user_id: '44444444-4444-4444-4444-444444444444', total_value: 3000, change_pct_30d: 4, assets: [], updated_at: '2024-01-01' }
  );
  state.portfolio_visibility.push(
    { user_id: '33333333-3333-3333-3333-333333333333', visibility: 'private' },
    { user_id: '22222222-2222-2222-2222-222222222222', visibility: 'percent' },
    { user_id: '44444444-4444-4444-4444-444444444444', visibility: 'public' }
  );
  state.stripe_customers.push({ user_id: '33333333-3333-3333-3333-333333333333', current_period_end: '2025-01-01' });

  const app = await loadApp();
  const asAdmin = requestAs(app, 'admin-token');
  const asUser = requestAs(app, 'user-token');
  const asExpert = requestAs(app, 'expert-token');

  const me = await asUser.get('/v1/me');
  assert.equal(me.status, 200);
  assert.ok(me.body.profile.id && me.body.profile.email);

  const mePatch = await asUser.patch('/v1/me').send({ display_name: 'User Updated' });
  assert.equal(mePatch.status, 200);
  assert.equal(mePatch.body.profile.display_name, 'User Updated');

  const acceptInvite = await asUser.post('/v1/auth/accept-invite').send({ token: '55555555-5555-5555-5555-555555555555' });
  assert.equal(acceptInvite.status, 200);
  assert.equal(acceptInvite.body.profile.role, 'influencer');

  const createInvite = await asAdmin.post('/v1/admin/invites').send({ email: 'new@example.com' });
  assert.equal(createInvite.status, 201);
  assert.ok(createInvite.body.invite.id && createInvite.body.invite.token);

  const invites = await asAdmin.get('/v1/admin/invites');
  assert.equal(invites.status, 200);
  assert.ok(Array.isArray(invites.body.invites));

  const revoke = await asAdmin.post(`/v1/admin/invites/${createInvite.body.invite.id}/revoke`);
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.invite.status, 'revoked');

  const influencers = await asAdmin.get('/v1/admin/influencers');
  assert.equal(influencers.status, 200);
  assert.ok(Array.isArray(influencers.body.influencers));

  const follow = await asUser.post('/v1/follow').send({ followingId: '22222222-2222-2222-2222-222222222222', followingType: 'influencer' });
  assert.equal(follow.status, 201);
  assert.equal(follow.body.following_id, '22222222-2222-2222-2222-222222222222');

  const following = await asUser.get('/v1/following');
  assert.equal(following.status, 200);
  assert.ok(Array.isArray(following.body.following));

  const followers = await asExpert.get('/v1/followers');
  assert.equal(followers.status, 200);
  assert.ok(Array.isArray(followers.body.followers));

  const friendRanking = await asUser.get('/v1/ranking/friends');
  assert.equal(friendRanking.status, 200);
  assert.ok(Array.isArray(friendRanking.body.ranking));

  const unfollow = await asUser.delete('/v1/follow/22222222-2222-2222-2222-222222222222');
  assert.equal(unfollow.status, 204);

  const listAlerts = await request(app).get('/v1/alerts');
  assert.equal(listAlerts.status, 200);
  assert.ok(Array.isArray(listAlerts.body.alerts));

  const createAlert = await asExpert.post('/v1/alerts').send({ asset: 'ETH', side: 'buy' });
  assert.equal(createAlert.status, 201);
  assert.ok(createAlert.body.alert.id && createAlert.body.alert.asset);

  const updateAlert = await asExpert.patch(`/v1/alerts/${createAlert.body.alert.id}/status`).send({ status: 'closed' });
  assert.equal(updateAlert.status, 200);
  assert.equal(updateAlert.body.alert.status, 'closed');

  const listPosts = await request(app).get('/v1/posts');
  assert.equal(listPosts.status, 200);
  assert.ok(Array.isArray(listPosts.body.posts));

  const createPost = await asExpert.post('/v1/posts').send({ text: 'Novo post de contrato' });
  assert.equal(createPost.status, 201);
  assert.ok(createPost.body.post.id && createPost.body.post.text);

  const sync = await asUser.post('/v1/portfolio/sync');
  assert.equal(sync.status, 200);
  assert.ok(sync.body.snapshot.user_id);

  const connect = await asUser.post('/v1/portfolio/connect').send({ exchange: 'binance', apiKey: 'k', apiSecret: 's' });
  assert.equal(connect.status, 201);
  assert.equal(connect.body.connected, true);

  const myPortfolio = await asUser.get('/v1/portfolio/me');
  assert.equal(myPortfolio.status, 200);
  assert.ok(myPortfolio.body.snapshot.user_id);

  const visibility = await asUser.patch('/v1/portfolio/visibility').send({ visibility: 'friends' });
  assert.equal(visibility.status, 200);
  assert.equal(visibility.body.visibility.visibility, 'friends');

  const privatePortfolio = await request(app).get('/v1/portfolio/public/user');
  assert.equal(privatePortfolio.status, 403);

  const percentPortfolio = await request(app).get('/v1/portfolio/public/expert');
  assert.equal(percentPortfolio.status, 200);
  assert.ok(Array.isArray(percentPortfolio.body.top_assets_percent));

  const publicPortfolio = await request(app).get('/v1/portfolio/public/friend');
  assert.equal(publicPortfolio.status, 200);
  assert.ok(publicPortfolio.body.snapshot.total_value);

  const metrics = await asExpert.get('/v1/influencer/metrics/me');
  assert.equal(metrics.status, 200);
  assert.ok(Number.isInteger(metrics.body.followers_count));

  const notify = await asUser.post('/v1/notify/test');
  assert.equal(notify.status, 200);
  assert.equal(notify.body.sent, true);

  const registerPush = await asUser.post('/v1/push/register').send({ fcmToken: 'fcm-1', device: 'ios' });
  assert.equal(registerPush.status, 201);
  assert.equal(registerPush.body.registered, true);

  const checkout = await asUser.post('/v1/billing/checkout').send({ plan: 'pro' });
  assert.equal(checkout.status, 200);
  assert.ok(checkout.body.checkout_url);

  const billingStatus = await asUser.get('/v1/billing/status');
  assert.equal(billingStatus.status, 200);
  assert.ok('plan' in billingStatus.body && 'current_period_end' in billingStatus.body);

  const webhook = await request(app).post('/v1/billing/webhook').set('stripe-signature', 'sig').send('payload');
  assert.equal(webhook.status, 200);
  assert.equal(webhook.body.received, true);

  const ranking = await request(app).get('/v1/ranking?limit=10');
  assert.equal(ranking.status, 200);
  assert.ok(Array.isArray(ranking.body.ranking));

  const news = await request(app).get('/v1/news?limit=1&lang=pt');
  assert.equal(news.status, 200);
  assert.ok(Array.isArray(news.body.items));

  const categories = await request(app).get('/v1/news/categories');
  assert.equal(categories.status, 200);
  assert.ok(Array.isArray(categories.body.categories));

  const fearGreed = await request(app).get('/v1/market/fear-greed');
  assert.equal(fearGreed.status, 200);
  assert.ok('value' in fearGreed.body && 'label' in fearGreed.body);

  const experts = await request(app).get('/v1/experts?query=exp&limit=10');
  assert.equal(experts.status, 200);
  assert.ok(Array.isArray(experts.body.experts));
  assert.ok('meta' in experts.body);

  const expertProfile = await request(app).get('/v1/experts/expert');
  assert.equal(expertProfile.status, 200);
  assert.ok(expertProfile.body.profile.id);

  delete process.env.ADMIN_EMAIL;
  const devMissing = await request(app).post('/v1/dev/seed').set('X-Dev-Seed-Key', 'dev_seed_key');
  assert.equal(devMissing.status, 400);

  process.env.ADMIN_EMAIL = 'seed-admin@example.com';
  process.env.ADMIN_PASSWORD = '123456';
  process.env.EXPERT_EMAIL = 'seed-expert@example.com';
  process.env.EXPERT_PASSWORD = '123456';
  process.env.PREMIUM_EMAIL = 'seed-premium@example.com';
  process.env.PREMIUM_PASSWORD = '123456';

  const devSeed = await request(app).post('/v1/dev/seed').set('X-Dev-Seed-Key', 'dev_seed_key');
  assert.equal(devSeed.status, 200);
  assert.ok(devSeed.body.admin && devSeed.body.expert && devSeed.body.premium);
});
