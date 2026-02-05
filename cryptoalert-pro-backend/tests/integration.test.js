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
  state.invites = [];
  state.follows = [];
  state.alerts = [];
  state.posts = [];
  state.portfolios_snapshot = [];
  state.portfolio_visibility = [];
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
