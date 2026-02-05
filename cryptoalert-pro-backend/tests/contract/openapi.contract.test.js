import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import openapi from '../../docs/openapi.json' with { type: 'json' };

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

for (const [key, value] of Object.entries(requiredEnv)) process.env[key] = value;

class QueryBuilder {
  constructor() {
    this.mode = 'select';
  }

  select() { return this; }
  eq() { return this; }

  update() {
    this.mode = 'update';
    return this;
  }

  async single() {
    return {
      data: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        role: 'user',
        username: 'user'
      },
      error: null
    };
  }

  async maybeSingle() {
    if (this.mode === 'update') {
      return { data: null, error: null };
    }
    return this.single();
  }
}

beforeEach(async () => {
  const { supabaseAdmin } = await import('../../src/config/supabase.js');
  supabaseAdmin.from = () => new QueryBuilder();
  supabaseAdmin.auth = {
    getUser: async () => ({
      data: {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'user@example.com'
        }
      },
      error: null
    })
  };

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      items: [
        { id: 'news-1', title: 'BTC sobe', source: 'News', url: 'https://example.com', published_at: '2024-01-01', assets: ['BTC'] }
      ]
    })
  });
});

async function loadApp() {
  const { createApp } = await import('../../src/app.js');
  return createApp();
}

test('OpenAPI defines critical API contracts', () => {
  assert.ok(/^3\./.test(openapi.openapi));
  assert.ok(openapi.paths['/me']?.get?.responses?.['200']);
  assert.ok(openapi.paths['/news']?.get?.responses?.['200']);

  const langParam = openapi.paths['/news'].get.parameters.find((param) => param.name === 'lang');
  assert.deepEqual(langParam.schema.enum, ['pt', 'en']);
});

test('GET /v1/me complies with documented 200 contract', async () => {
  const app = await loadApp();
  const response = await request(app).get('/v1/me').set('Authorization', 'Bearer user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.profile.email, 'user@example.com');
});

test('GET /v1/news enforces OpenAPI language enum contract', async () => {
  const app = await loadApp();

  const okResponse = await request(app).get('/v1/news?lang=pt&limit=1');
  assert.equal(okResponse.status, 200);
  assert.ok(Array.isArray(okResponse.body.items));

  const invalidResponse = await request(app).get('/v1/news?lang=es');
  assert.equal(invalidResponse.status, 400);
});
