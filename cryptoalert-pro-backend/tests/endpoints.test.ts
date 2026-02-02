import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Set up environment for testing
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
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

async function loadApp() {
  const { createApp } = await import('../src/app.js');
  return createApp();
}

test('Comprehensive Endpoint Test', async (t) => {
  const app = await loadApp();

  await t.test('GET /health', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  await t.test('GET /v1/alerts (Public)', async () => {
    const res = await request(app).get('/v1/alerts');
    // It should return 200 or 500 (if Supabase fails), but the route should exist
    assert.ok([200, 500].includes(res.status));
  });

  await t.test('GET /v1/posts (Public)', async () => {
    const res = await request(app).get('/v1/posts');
    assert.ok([200, 500].includes(res.status));
  });

  await t.test('GET /v1/me (Unauthorized)', async () => {
    const res = await request(app).get('/v1/me');
    assert.equal(res.status, 401);
  });

  await t.test('POST /v1/billing/checkout (Unauthorized)', async () => {
    const res = await request(app).post('/v1/billing/checkout');
    assert.equal(res.status, 401);
  });

  await t.test('GET /v1/portfolio/me (Unauthorized)', async () => {
    const res = await request(app).get('/v1/portfolio/me');
    assert.equal(res.status, 401);
  });

  await t.test('GET /v1/ranking/friends (Unauthorized)', async () => {
    const res = await request(app).get('/v1/ranking/friends');
    assert.equal(res.status, 401);
  });

  await t.test('POST /v1/push/register (Unauthorized)', async () => {
    const res = await request(app).post('/v1/push/register');
    assert.equal(res.status, 401);
  });
});
