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
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
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
      const inserted = payload.map((row) => ({ id: crypto.randomUUID(), ...row }));
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
          const inserted = { id: crypto.randomUUID(), ...rowPayload };
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
  portfolios_history: [],
  portfolio_ledger: [],
  portfolio_goals_alerts: [],
  exchange_connections: []
};

const authUsers = new Map();

beforeEach(async () => {
  const { supabaseAdmin } = await import('../src/config/supabase.js');

  state.profiles = [
    { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com', username: 'admin', display_name: 'Admin', role: 'admin', plan: 'free' },
    { id: '22222222-2222-2222-2222-222222222222', email: 'expert@example.com', username: 'expert', display_name: 'Expert', role: 'influencer', plan: 'free' },
    { id: '33333333-3333-3333-3333-333333333333', email: 'user@example.com', username: 'user', display_name: 'User', role: 'user', plan: 'free' },
    { id: '44444444-4444-4444-4444-444444444444', email: 'friend@example.com', username: 'friend', display_name: 'Friend', role: 'user', plan: 'free' }
  ];
  state.invites = [];
  state.follows = [];
  state.alerts = [];
  state.posts = [];
  state.portfolios_snapshot = [];
  state.portfolio_visibility = [];
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
      if (!user) {
        return { data: { user: null }, error: new Error('Unauthorized') };
      }
      return { data: { user }, error: null };
    },
    admin: {
      createUser: async ({ email }) => ({
        data: { user: { id: crypto.randomUUID(), email } },
        error: null
      })
    }
  };
});

test('health check returns ok', async () => {
  const app = await loadApp();
  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('unknown route returns 404', async () => {
  const app = await loadApp();
  const response = await request(app).get('/unknown');

  assert.equal(response.status, 404);
});

test('GET /v1/me returns authenticated profile', async () => {
  const app = await loadApp();
  const response = await request(app)
    .get('/v1/me')
    .set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.profile.email, 'user@example.com');
});

test('invite flow updates role to influencer', async () => {
  const app = await loadApp();
  const createInvite = await request(app)
    .post('/v1/admin/invites')
    .set('Authorization', 'Bearer admin-token')
    .send({ email: 'user@example.com' });

  assert.equal(createInvite.status, 201);
  const token = createInvite.body.invite.token;

  const acceptInvite = await request(app)
    .post('/v1/auth/accept-invite')
    .set('Authorization', 'Bearer user-token')
    .send({ token });

  assert.equal(acceptInvite.status, 200);
  assert.equal(acceptInvite.body.profile.role, 'influencer');
});

test('follow and unfollow work', async () => {
  const app = await loadApp();

  const followResponse = await request(app)
    .post('/v1/follow')
    .set('Authorization', 'Bearer user-token')
    .send({ followingId: '22222222-2222-2222-2222-222222222222', followingType: 'influencer' });

  assert.equal(followResponse.status, 201);
  assert.equal(state.follows.length, 1);

  const unfollowResponse = await request(app)
    .delete('/v1/follow/22222222-2222-2222-2222-222222222222')
    .set('Authorization', 'Bearer user-token');

  assert.equal(unfollowResponse.status, 204);
  assert.equal(state.follows.length, 0);
});

test('alerts list supports status filter', async () => {
  state.alerts.push(
    { id: 'alert-1', creator_id: '22222222-2222-2222-2222-222222222222', side: 'buy', asset: 'BTC', status: 'active', created_at: '2024-01-01' },
    { id: 'alert-2', creator_id: '22222222-2222-2222-2222-222222222222', side: 'sell', asset: 'ETH', status: 'closed', created_at: '2024-01-02' }
  );

  const app = await loadApp();
  const activeResponse = await request(app)
    .get('/v1/alerts?scope=creator&creator=22222222-2222-2222-2222-222222222222')
    .set('Authorization', 'Bearer user-token');

  assert.equal(activeResponse.status, 200);
  assert.equal(activeResponse.body.alerts.length, 1);
  assert.equal(activeResponse.body.alerts[0].status, 'active');

  const closedResponse = await request(app)
    .get('/v1/alerts?scope=creator&creator=22222222-2222-2222-2222-222222222222&status=closed')
    .set('Authorization', 'Bearer user-token');

  assert.equal(closedResponse.status, 200);
  assert.equal(closedResponse.body.alerts.length, 1);
  assert.equal(closedResponse.body.alerts[0].status, 'closed');
});

test('portfolio visibility rules are enforced', async () => {
  state.portfolios_snapshot.push(
    { id: 'snap-private', user_id: '33333333-3333-3333-3333-333333333333', total_value: 1000, change_pct_30d: 3, assets: [], updated_at: '2024-01-01' },
    { id: 'snap-percent', user_id: '22222222-2222-2222-2222-222222222222', total_value: 2000, change_pct_30d: 5, assets: [{ symbol: 'BTC', pct: 60 }], updated_at: '2024-01-02' },
    { id: 'snap-public', user_id: '44444444-4444-4444-4444-444444444444', total_value: 3000, change_pct_30d: -2, assets: [], updated_at: '2024-01-03' }
  );
  state.portfolio_visibility.push(
    { user_id: '33333333-3333-3333-3333-333333333333', visibility: 'private' },
    { user_id: '22222222-2222-2222-2222-222222222222', visibility: 'percent' },
    { user_id: '44444444-4444-4444-4444-444444444444', visibility: 'public' }
  );

  const app = await loadApp();
  const privateResponse = await request(app).get('/v1/portfolio/public/user');
  assert.equal(privateResponse.status, 403);

  const percentResponse = await request(app).get('/v1/portfolio/public/expert');
  assert.equal(percentResponse.status, 200);
  assert.ok(Array.isArray(percentResponse.body.top_assets_percent));
  assert.ok(!('snapshot' in percentResponse.body));
  assert.equal(percentResponse.body.currency, 'USD');

  const publicResponse = await request(app).get('/v1/portfolio/public/friend');
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.body.snapshot.total_value, 3000);

  state.portfolio_visibility = state.portfolio_visibility.map((row) =>
    row.user_id === '44444444-4444-4444-4444-444444444444' ? { ...row, visibility: 'friends' } : row
  );
  state.follows.push(
    { follower_id: '33333333-3333-3333-3333-333333333333', following_id: '44444444-4444-4444-4444-444444444444', following_type: 'user' },
    { follower_id: '44444444-4444-4444-4444-444444444444', following_id: '33333333-3333-3333-3333-333333333333', following_type: 'user' }
  );

  const friendsResponse = await request(app)
    .get('/v1/portfolio/public/friend')
    .set('Authorization', 'Bearer user-token');
  assert.equal(friendsResponse.status, 200);
});



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
  const response = await request(app).get('/v1/news?limit=1&lang=pt');

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].id, 'news-1');
});


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
