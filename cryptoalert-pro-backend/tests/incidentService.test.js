import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildIncidentPanel, classifyFailureType } from '../src/services/incidentService.ts';

test('classifyFailureType identifica categorias principais', () => {
  assert.equal(classifyFailureType('JWT token expired', '/v1/auth/me', 401), 'auth');
  assert.equal(classifyFailureType('validation failed on payload', '/v1/posts', 400), 'validacao');
  assert.equal(classifyFailureType('database constraint violation', '/v1/admin', 500), 'banco');
  assert.equal(classifyFailureType('ECONNRESET provider timeout', '/v1/news', 502), 'rede');
  assert.equal(classifyFailureType('stripe webhook unavailable', '/v1/billing/webhook', 503), 'provider_externo');
});

test('buildIncidentPanel agrega e ranqueia clusters com sugestões', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'incident-panel-'));
  const logFile = path.join(tempDir, 'error.log');

  const entries = [
    { level: 'error', endpoint: '/v1/auth/login', status: 401, erro: 'JWT token expired', trace_id: 't-1', user_id: 'u-1' },
    { level: 'error', endpoint: '/v1/auth/login', status: 401, erro: 'JWT token expired', trace_id: 't-2', user_id: 'u-2' },
    { level: 'error', endpoint: '/v1/posts', status: 400, erro: 'Validation failed: title required', trace_id: 't-3', user_id: 'u-3' }
  ];

  await fs.writeFile(logFile, `${entries.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');

  const incidents = await buildIncidentPanel(10, tempDir);

  assert.ok(incidents.length >= 2);
  const authCluster = incidents.find((item) => item.failure_type === 'auth');
  assert.ok(authCluster);
  assert.equal(authCluster?.frequencia, 2);
  assert.ok((authCluster?.sugestoes.length ?? 0) > 0);
});
