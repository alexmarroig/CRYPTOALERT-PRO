import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('health check returns ok', async () => {
  const app = createApp();
  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('unknown route returns 404', async () => {
  const app = createApp();
  const response = await request(app).get('/unknown');

  assert.equal(response.status, 404);
});
