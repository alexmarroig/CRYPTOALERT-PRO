import { test, beforeEach, afterEach } from 'node:test';
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

  lte(field, value) {
    this.filters.push((row) => row[field] <= value);
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


const originalFetch = globalThis.fetch;

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
  ops_telemetry: [],
  ops_events: [],
  ops_incidents: [],
  ops_incident_feedback: []
  portfolios_history: [],
  portfolio_ledger: [],
  portfolio_goals_alerts: [],
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
afterEach(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(async () => {
  const { supabaseAdmin } = await import('../src/config/supabase.js');
  const { incidentRiskService } = await import('../src/services/incidentRisk/incidentRiskService.js');
  incidentRiskService.reset();

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
  state.ops_telemetry = [];
  state.ops_events = [];
  state.ops_incidents = [];
  state.ops_incident_feedback = [];
  state.portfolios_history = [];
  state.portfolio_ledger = [];
  state.portfolio_goals_alerts = [];
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
test('news endpoints: success, timeout fallback and degraded mode with cache', async () => {
  const { resetNewsServiceState } = await import('../src/services/newsService.js');
  resetNewsServiceState();

  let call = 0;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    call += 1;

    if (call === 1 && target.includes('/news?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 'news-1', title: 'BTC sobe', source: 'News', url: 'https://example.com/n1', published_at: '2024-01-01', assets: ['BTC'] }
          ]
        })
      };
    }

    if (call <= 2 && options?.signal) {
      const timeoutError = new Error('timeout');
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }

    if (target.includes('/news?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 'news-2', title: 'ETH dispara', source: 'Fallback', url: 'https://example.com/n2', published_at: '2024-01-02', assets: ['ETH'] }
          ]
        })
      };
    }

    if (target.includes('/news/categories')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ categories: ['btc', 'defi'] })
      };
    }

    if (target.includes('/market/fear-greed')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 65,
            value_classification: 'Greed',
            updated_at: '2024-02-01T00:00:00.000Z'
          }
        })
      };
    }

    return { ok: false, status: 503, json: async () => ({}) };
  };


test('GET /v1/news/categories success', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ categories: ['bitcoin', 'defi'] })
  });

  const app = await loadApp();
  const response = await request(app).get('/v1/news/categories');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, ['bitcoin', 'defi']);
  assert.equal(response.body.meta.cached, false);
});

test('GET /v1/market/fear-greed success', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        value: 72,
        value_classification: 'Greed',
        updated_at: '2024-01-03T00:00:00.000Z'
      }
    })
  });

  const app = await loadApp();
  const response = await request(app).get('/v1/market/fear-greed');

  assert.equal(response.status, 200);
  assert.equal(response.body.value, 72);
  assert.equal(response.body.classification_en, 'Greed');
  assert.equal(response.body.meta.cached, false);
});

test('news provider failure returns 502 with standardized payload', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({})
  });

  const app = await loadApp();
  const response = await request(app).get('/v1/news?limit=2');

  assert.equal(response.status, 502);
  assert.equal(response.body.error.code, 'EXTERNAL_PROVIDER_UNAVAILABLE');
  assert.equal(response.body.error.message, 'Falha ao consultar notícias externas');
});

test('news endpoint serves cached response when provider fails', async () => {
  let shouldFail = false;
  globalThis.fetch = async () => {
    if (shouldFail) {
      throw new Error('network down');
    }
    return {
      ok: true,
      json: async () => ({
        items: [
          { id: 'cached-news-1', title: 'ETH dispara', source: 'News', url: 'https://example.com/cache', published_at: '2024-01-02', assets: ['ETH'] }
        ]
      })
    };
  };

  const app = await loadApp();
  const first = await request(app).get('/v1/news?limit=1&category=cache-test');
  assert.equal(first.status, 200);
  assert.equal(first.body.meta.cached, false);

  shouldFail = true;
  const second = await request(app).get('/v1/news?limit=1&category=cache-test');
  assert.equal(second.status, 200);
  assert.equal(second.body.meta.cached, true);
  assert.equal(second.body.items[0].id, 'cached-news-1');
});
test('news proxy returns normalized items', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      items: [
        { id: 'news-1', title: 'BTC sobe', source: 'News', url: 'https://example.com', published_at: '2024-01-01', assets: ['BTC'] }
      ]
    })
  });

  const app = await loadApp();

  const newsResponse = await request(app).get('/v1/news?limit=1&lang=pt');
  assert.equal(newsResponse.status, 200);
  assert.equal(newsResponse.body.items[0].id, 'news-1');
  assert.equal(newsResponse.body.meta.degraded, false);

  const categoriesResponse = await request(app).get('/v1/news/categories');
  assert.equal(categoriesResponse.status, 200);
  assert.deepEqual(categoriesResponse.body.categories, ['btc', 'defi']);

  const fearGreedResponse = await request(app).get('/v1/market/fear-greed');
  assert.equal(fearGreedResponse.status, 200);
  assert.equal(fearGreedResponse.body.value, 65);
  assert.equal(typeof fearGreedResponse.body.meta.metrics.cache.hit_ratio, 'number');

  globalThis.fetch = async (_url, options) => {
    const timeoutError = new Error('timeout');
    timeoutError.name = options?.signal ? 'AbortError' : 'Error';
    throw timeoutError;
  };

  const realDateNow = Date.now;
  Date.now = () => realDateNow() + 61_000;
  const degradedResponse = await request(app).get('/v1/news?limit=1&lang=pt');
  Date.now = realDateNow;

  assert.equal(degradedResponse.status, 200);
  assert.equal(degradedResponse.body.meta.degraded, true);
  assert.equal(degradedResponse.body.meta.provider, 'stale-cache');
});

test('news endpoints return consistent error contract when no fallback cache exists', async () => {
  const { resetNewsServiceState } = await import('../src/services/newsService.js');
  resetNewsServiceState();

  globalThis.fetch = async (_url, options) => {
    const timeoutError = new Error('timeout');
    timeoutError.name = options?.signal ? 'AbortError' : 'Error';
    throw timeoutError;
  };

  const app = await loadApp();
  const response = await request(app).get('/v1/news?limit=3&lang=en');

  assert.equal(response.status, 502);
  assert.equal(response.body.error_code, 'UPSTREAM_TIMEOUT');
  assert.equal(typeof response.body.message, 'string');
  assert.equal(response.body.retryable, true);
});

test('incident-risk pipeline ingests telemetry, runs ETL, trains and infers', async () => {
  const app = await loadApp();
  const baseTs = Date.now() - 60 * 60 * 1000;

  const events = Array.from({ length: 60 }).map((_, idx) => {
    const isIncident = idx >= 40;
    return {
      timestamp: new Date(baseTs + idx * 60_000).toISOString(),
      service: 'alerts-api',
      route: '/v1/alerts',
      statusCode: isIncident && idx % 2 === 0 ? 500 : 200,
      latencyMs: isIncident ? 1800 + idx * 3 : 120 + idx,
      memoryMb: isIncident ? 850 : 420,
      cpuPct: isIncident ? 92 : 45,
      retries: isIncident ? 2 : 0,
      timeout: isIncident && idx % 3 === 0
    };
  });

  const ingest = await request(app)
    .post('/v1/incident-risk/telemetry')
    .send({ events });
  assert.equal(ingest.status, 202);
  assert.equal(ingest.body.ingested, 60);

  const etl = await request(app)
    .post('/v1/incident-risk/etl/run')
    .send({ bucketMinutes: 10, lookbackHours: 168 });
  assert.equal(etl.status, 200);
  assert.ok(etl.body.generatedRows > 0);

  const train = await request(app)
    .post('/v1/incident-risk/model/train')
    .send({ horizonHours: 2, incidentThreshold: 0.2, learningRate: 0.1, epochs: 80 });
  assert.equal(train.status, 200);
  assert.ok(train.body.trainedRows > 0);

  const live = await request(app)
    .get('/v1/incident-risk/infer/live?service=alerts-api&route=/v1/alerts');
  assert.equal(live.status, 200);
  assert.equal(live.body.predictions.length, 1);
  assert.ok(typeof live.body.predictions[0].riskScore === 'number');
  assert.ok(Array.isArray(live.body.predictions[0].topFactors));

  const backtest = await request(app)
    .post('/v1/incident-risk/backtest')
    .send({ horizonHours: 2, incidentThreshold: 0.2, topK: 3 });
  assert.equal(backtest.status, 200);
  assert.ok(backtest.body.auc >= 0 && backtest.body.auc <= 1);
});

test('incident-risk emits preventive alerts above threshold', async () => {
  const app = await loadApp();
  const baseTs = Date.now() - 30 * 60 * 1000;

  const events = Array.from({ length: 30 }).map((_, idx) => ({
    timestamp: new Date(baseTs + idx * 60_000).toISOString(),
    service: 'portfolio-api',
    route: '/v1/portfolio/sync',
    statusCode: idx > 20 ? 500 : 200,
    latencyMs: idx > 20 ? 2200 : 150,
    memoryMb: idx > 20 ? 950 : 430,
    cpuPct: idx > 20 ? 96 : 40,
    retries: idx > 20 ? 3 : 0,
    timeout: idx > 20
  }));

  await request(app).post('/v1/incident-risk/telemetry').send({ events });
  await request(app).post('/v1/incident-risk/etl/run').send({ bucketMinutes: 10, lookbackHours: 168 });
  await request(app).post('/v1/incident-risk/model/train').send({ horizonHours: 2, incidentThreshold: 0.2, epochs: 80 });

  const alerts = await request(app)
    .post('/v1/incident-risk/alerts/evaluate')
    .send({ threshold: 0 });

  assert.equal(alerts.status, 200);
  assert.ok(alerts.body.count >= 1);
});



test('admin ops anomaly pipeline creates incident and feedback', async () => {
  const app = await loadApp();
  const token = 'admin-token';

  const start = Date.now() - (30 * 60 * 1000);
  for (let i = 0; i < 14; i += 1) {
    await request(app)
      .post('/v1/admin/ops/telemetry')
      .set('Authorization', `Bearer ${token}`)
      .send({
        metric_type: 'http_5xx_rate',
        service_name: 'api-gateway',
        provider: 'news-provider',
        value: i < 13 ? 0.01 : 0.09,
        sample_size: 1000,
        metadata: { endpoint: '/v1/news' },
        recorded_at: new Date(start + i * 60_000).toISOString()
      })
      .expect(201);
  }

  await request(app)
    .post('/v1/admin/ops/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      event_type: 'deploy',
      service_name: 'api-gateway',
      summary: 'Deploy release 2026.02.05',
      occurred_at: new Date(start + 13 * 60_000).toISOString()
    })
    .expect(201);

  const analyzeResponse = await request(app)
    .post('/v1/admin/ops/analyze')
    .set('Authorization', `Bearer ${token}`)
    .send({ service_name: 'api-gateway', lookback_minutes: 60 })
    .expect(201);

  assert.equal(analyzeResponse.body.incidents.length, 1);
  const incident = analyzeResponse.body.incidents[0];
  assert.equal(incident.signal, 'explosion_5xx');
  assert.equal(incident.recommendations.length >= 1, true);

  const incidentsResponse = await request(app)
    .get('/v1/admin/ops/incidents')
    .set('Authorization', `Bearer ${token}`)
    .query({ service_name: 'api-gateway' })
    .expect(200);

  assert.equal(incidentsResponse.body.incidents.length, 1);

  await request(app)
    .post(`/v1/admin/ops/incidents/${incident.id}/feedback`)
    .set('Authorization', `Bearer ${token}`)
    .send({ verdict: 'false_positive', notes: 'Noise after deploy window' })
    .expect(201);

  const filtered = await request(app)
    .get('/v1/admin/ops/incidents')
    .set('Authorization', `Bearer ${token}`)
    .query({ service_name: 'api-gateway', status: 'false_positive' })
    .expect(200);

  assert.equal(filtered.body.incidents.length, 1);
  assert.equal(filtered.body.incidents[0].status, 'false_positive');
test('portfolio performance endpoint returns ranged series', async () => {
  const now = new Date();
  const d1 = new Date(now);
  const d2 = new Date(now);
  const d3 = new Date(now);
  d1.setDate(now.getDate() - 10);
  d2.setDate(now.getDate() - 5);
  d3.setDate(now.getDate() - 1);

  state.portfolios_history.push(
    { user_id: '33333333-3333-3333-3333-333333333333', total_value: 1000, created_at: d1.toISOString() },
    { user_id: '33333333-3333-3333-3333-333333333333', total_value: 1200, created_at: d2.toISOString() },
    { user_id: '33333333-3333-3333-3333-333333333333', total_value: 1100, created_at: d3.toISOString() }
  );

  const app = await loadApp();
  const response = await request(app)
    .get('/v1/portfolio/performance?range=1y')
    .set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.range, '1y');
  assert.equal(response.body.points.length, 3);
  assert.equal(Math.round(response.body.performance_pct), 10);
});

test('portfolio composition endpoint returns concentration and exchange exposure', async () => {
  state.portfolios_snapshot.push({
    id: 'snapshot-1',
    user_id: '33333333-3333-3333-3333-333333333333',
    total_value: 2000,
    assets: [
      { symbol: 'BTC', qty: 0.02, value: 1200, exchange: 'binance' },
      { symbol: 'ETH', qty: 0.5, value: 700, exchange: 'okx' },
      { symbol: 'USDT', qty: 100, value: 100, exchange: 'binance' }
    ]
  });

  const app = await loadApp();
  const response = await request(app)
    .get('/v1/portfolio/composition')
    .set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.top_holdings[0].symbol, 'BTC');
  assert.equal(response.body.exposure_by_exchange[0].exchange, 'binance');
  assert.equal(response.body.composition_by_class.length, 2);
});

test('portfolio goals and alerts endpoint supports upsert and read', async () => {
  const app = await loadApp();

  const update = await request(app)
    .put('/v1/portfolio/goals-alerts')
    .set('Authorization', 'Bearer user-token')
    .send({ maxDrawdownPct: 15, targetNetWorth: 100000, assetDailyChangePct: 8 });

  assert.equal(update.status, 200);
  assert.equal(update.body.goals_alerts.max_drawdown_pct, 15);

  const read = await request(app)
    .get('/v1/portfolio/goals-alerts')
    .set('Authorization', 'Bearer user-token');

  assert.equal(read.status, 200);
  assert.equal(read.body.goals_alerts.target_net_worth, 100000);
});

test('portfolio reconciliation consolidates holdings and pnl', async () => {
  state.portfolio_ledger.push(
    {
      user_id: '33333333-3333-3333-3333-333333333333',
      exchange: 'binance',
      asset: 'BTC',
      type: 'trade',
      quantity: 2,
      price: 100,
      executed_at: '2024-01-01T00:00:00.000Z'
    },
    {
      user_id: '33333333-3333-3333-3333-333333333333',
      exchange: 'binance',
      asset: 'BTC',
      type: 'trade',
      quantity: -1,
      price: 150,
      executed_at: '2024-01-02T00:00:00.000Z'
    },
    {
      user_id: '33333333-3333-3333-3333-333333333333',
      exchange: 'binance',
      asset: 'BTC',
      type: 'fee',
      quantity: 0.1,
      price: 10,
      executed_at: '2024-01-03T00:00:00.000Z'
    }
  );

  state.portfolios_snapshot.push({
    id: 'snapshot-2',
    user_id: '33333333-3333-3333-3333-333333333333',
    assets: [{ symbol: 'BTC', qty: 1, value: 160 }]
  });

  const app = await loadApp();
  const response = await request(app)
    .get('/v1/portfolio/reconciliation')
    .set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.holdings.length, 1);
  assert.equal(response.body.holdings[0].asset, 'BTC');
  assert.equal(Math.round(response.body.totals.realizedPnl), 49);
  assert.equal(Math.round(response.body.totals.unrealizedPnl), 60);
});



test('authz prevents privilege escalation for influencer-only routes', async () => {
  const app = await loadApp();
  const response = await request(app)
    .post('/v1/alerts')
    .set('Authorization', 'Bearer user-token')
    .send({ asset: 'BTC', side: 'buy' });

  assert.equal(response.status, 403);
});

test('authn rejects invalid tokens on protected endpoints', async () => {
  const app = await loadApp();
  const response = await request(app)
    .get('/v1/me')
    .set('Authorization', 'Bearer invalid-token');

  assert.equal(response.status, 401);
});

test('authz prevents role bypass on admin endpoints', async () => {
  const app = await loadApp();
  const response = await request(app)
    .get('/v1/admin/invites')
    .set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 403);
});

test('authz blocks IDOR when updating another creator alert', async () => {
  state.alerts.push(
    {
      id: 'idor-alert',
      creator_id: '22222222-2222-2222-2222-222222222222',
      side: 'buy',
      asset: 'BTC',
      status: 'active',
      created_at: '2024-01-01'
    }
  );

  const app = await loadApp();
  const response = await request(app)
    .patch('/v1/alerts/idor-alert/status')
    .set('Authorization', 'Bearer admin-token')
    .send({ status: 'closed' });

  assert.equal(response.status, 404);
  const row = state.alerts.find((alert) => alert.id === 'idor-alert');
  assert.equal(row?.status, 'active');
});
