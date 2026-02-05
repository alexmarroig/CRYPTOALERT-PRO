import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.STAGING_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEV_SEED_KEY = process.env.DEV_SEED_KEY;

const ARTIFACT_DIR = path.resolve('artifacts/journeys');

const scenarios = [
  { id: 'pt_free_newcomer', locale: 'pt', actor: 'premium', plan: 'free' },
  { id: 'en_pro_trader', locale: 'en', actor: 'premium', plan: 'pro' },
  { id: 'pt_vip_expert', locale: 'pt', actor: 'expert', plan: 'vip' },
  { id: 'en_admin_ops', locale: 'en', actor: 'admin', plan: 'vip' }
];

const stepStats = new Map();
const flowStats = new Map();

const nowIso = () => new Date().toISOString();

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function ensureStep(flowName, stepName) {
  const key = `${flowName}:${stepName}`;
  if (!stepStats.has(key)) {
    stepStats.set(key, {
      flowName,
      stepName,
      attempts: 0,
      failures: 0,
      durationsMs: []
    });
  }
  return stepStats.get(key);
}

function ensureFlow(flowName) {
  if (!flowStats.has(flowName)) {
    flowStats.set(flowName, {
      attempts: 0,
      successes: 0,
      failures: 0,
      durationsMs: []
    });
  }
  return flowStats.get(flowName);
}

async function apiRequest(relativeUrl, options = {}) {
  const response = await fetch(`${BASE_URL}${relativeUrl}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  let body = null;
  const responseText = await response.text();
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = { raw: responseText };
    }
  }

  return { response, body };
}

async function authenticate(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required to authenticate synthetic users.');
  }

  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const authBody = await authResponse.json();
  if (!authResponse.ok || !authBody.access_token) {
    throw new Error(`Supabase sign-in failed for ${email}: ${JSON.stringify(authBody)}`);
  }

  return authBody.access_token;
}

async function runStep(flowName, stepName, run) {
  const stat = ensureStep(flowName, stepName);
  stat.attempts += 1;

  const start = performance.now();
  try {
    const result = await run();
    stat.durationsMs.push(Math.round(performance.now() - start));
    return result;
  } catch (error) {
    stat.failures += 1;
    stat.durationsMs.push(Math.round(performance.now() - start));
    throw error;
  }
}

async function runFlow(flowName, run, scenarioId) {
  const stat = ensureFlow(flowName);
  stat.attempts += 1;

  const start = performance.now();
  try {
    await run();
    stat.successes += 1;
    stat.durationsMs.push(Math.round(performance.now() - start));
    return { flowName, scenarioId, status: 'passed' };
  } catch (error) {
    stat.failures += 1;
    stat.durationsMs.push(Math.round(performance.now() - start));
    return {
      flowName,
      scenarioId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function seedStagingData() {
  if (!DEV_SEED_KEY) {
    throw new Error('DEV_SEED_KEY is required to prepare synthetic journeys in staging.');
  }

  const { response, body } = await apiRequest('/v1/dev/seed', {
    method: 'POST',
    headers: {
      'X-Dev-Seed-Key': DEV_SEED_KEY
    },
    body: JSON.stringify({ source: 'synthetic-journeys' })
  });

  if (!response.ok) {
    throw new Error(`Seed failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

function buildFlowImplementations(context) {
  return {
    onboarding: async ({ token, scenario }) => {
      await runStep('onboarding', 'get_profile', async () => {
        const { response } = await apiRequest('/v1/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`GET /v1/me failed (${response.status})`);
      });

      await runStep('onboarding', 'set_language', async () => {
        const { response } = await apiRequest('/v1/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ language: scenario.locale })
        });
        if (!response.ok) throw new Error(`PATCH /v1/me failed (${response.status})`);
      });
    },

    accept_invite: async ({ adminToken, userToken, scenario }) => {
      const inviteEmail = `synthetic+${scenario.id}.${Date.now()}@example.com`;

      const inviteToken = await runStep('accept_invite', 'create_invite', async () => {
        const { response, body } = await apiRequest('/v1/admin/invites', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ email: inviteEmail })
        });

        if (!response.ok || !body?.invite?.token) {
          throw new Error(`POST /v1/admin/invites failed (${response.status})`);
        }

        return body.invite.token;
      });

      await runStep('accept_invite', 'accept_invite', async () => {
        const { response } = await apiRequest('/v1/auth/accept-invite', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({ token: inviteToken })
        });

        if (!response.ok) {
          throw new Error(`POST /v1/auth/accept-invite failed (${response.status})`);
        }
      });
    },

    follow_expert: async ({ userToken, expertUserId }) => {
      await runStep('follow_expert', 'follow', async () => {
        const follow = await apiRequest('/v1/follow', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({ followingId: expertUserId, followingType: 'influencer' })
        });

        if (!(follow.response.status === 201 || follow.response.status === 409)) {
          throw new Error(`POST /v1/follow failed (${follow.response.status})`);
        }
      });

      await runStep('follow_expert', 'list_following', async () => {
        const { response } = await apiRequest('/v1/following', {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        if (!response.ok) throw new Error(`GET /v1/following failed (${response.status})`);
      });
    },

    create_alert: async ({ expertToken, scenario }) => {
      await runStep('create_alert', 'create_alert', async () => {
        const payload = {
          asset: scenario.plan === 'vip' ? 'SOL' : 'BTC',
          side: scenario.locale === 'pt' ? 'buy' : 'sell',
          confidence_pct: scenario.plan === 'vip' ? 85 : 65,
          reason_text: scenario.locale === 'pt'
            ? 'Cenário sintético para medir performance da jornada.'
            : 'Synthetic scenario to measure journey health.'
        };

        const { response } = await apiRequest('/v1/alerts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${expertToken}` },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`POST /v1/alerts failed (${response.status})`);
      });

      await runStep('create_alert', 'list_alerts', async () => {
        const { response } = await apiRequest('/v1/alerts?scope=following', {
          headers: { Authorization: `Bearer ${expertToken}` }
        });
        if (!response.ok) throw new Error(`GET /v1/alerts failed (${response.status})`);
      });
    },

    sync_portfolio: async ({ userToken }) => {
      await runStep('sync_portfolio', 'trigger_sync', async () => {
        const { response } = await apiRequest('/v1/portfolio/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({ source: 'synthetic' })
        });
        if (!response.ok) throw new Error(`POST /v1/portfolio/sync failed (${response.status})`);
      });

      await runStep('sync_portfolio', 'read_snapshot', async () => {
        const { response } = await apiRequest('/v1/portfolio/me', {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        if (!response.ok) throw new Error(`GET /v1/portfolio/me failed (${response.status})`);
      });
    }
  };
}

function summarize(results) {
  const flows = {};
  for (const [flowName, stat] of flowStats) {
    flows[flowName] = {
      attempts: stat.attempts,
      successes: stat.successes,
      failures: stat.failures,
      successRate: stat.attempts > 0 ? Number((stat.successes / stat.attempts).toFixed(4)) : 0,
      p50LatencyMs: percentile(stat.durationsMs, 50),
      p95LatencyMs: percentile(stat.durationsMs, 95),
      avgLatencyMs: stat.durationsMs.length
        ? Math.round(stat.durationsMs.reduce((sum, value) => sum + value, 0) / stat.durationsMs.length)
        : 0
    };
  }

  const friction = [...stepStats.values()]
    .map((step) => {
      const avgLatencyMs = step.durationsMs.length
        ? Math.round(step.durationsMs.reduce((sum, value) => sum + value, 0) / step.durationsMs.length)
        : 0;
      const abandonRate = step.attempts > 0 ? Number((step.failures / step.attempts).toFixed(4)) : 0;
      return {
        flow: step.flowName,
        step: step.stepName,
        attempts: step.attempts,
        failures: step.failures,
        abandonRate,
        avgLatencyMs,
        p95LatencyMs: percentile(step.durationsMs, 95)
      };
    })
    .sort((a, b) => {
      if (b.abandonRate !== a.abandonRate) return b.abandonRate - a.abandonRate;
      return b.avgLatencyMs - a.avgLatencyMs;
    });

  return {
    generatedAt: nowIso(),
    environment: BASE_URL,
    totals: {
      flowRuns: results.length,
      failedRuns: results.filter((result) => result.status === 'failed').length
    },
    flows,
    friction,
    runs: results
  };
}

function toMarkdown(report) {
  const flowLines = Object.entries(report.flows)
    .map(([flowName, flow]) => `| ${flowName} | ${flow.attempts} | ${(flow.successRate * 100).toFixed(1)}% | ${flow.p95LatencyMs} | ${flow.failures} |`)
    .join('\n');

  const frictionLines = report.friction.slice(0, 10)
    .map((step) => `| ${step.flow} | ${step.step} | ${(step.abandonRate * 100).toFixed(1)}% | ${step.avgLatencyMs} | ${step.p95LatencyMs} |`)
    .join('\n');

  return `# Synthetic Journey Report\n\n- Generated at: ${report.generatedAt}\n- Environment: ${report.environment}\n- Flow runs: ${report.totals.flowRuns}\n- Failed runs: ${report.totals.failedRuns}\n\n## KPI by Flow\n\n| Flow | Runs | Success | P95 Latency (ms) | Failures |\n|---|---:|---:|---:|---:|\n${flowLines}\n\n## Friction Hotspots\n\n| Flow | Step | Abandon | Avg Latency (ms) | P95 Latency (ms) |\n|---|---|---:|---:|---:|\n${frictionLines}\n`;
}

async function main() {
  const seeded = await seedStagingData();

  const adminToken = await authenticate(seeded.admin.email, seeded.admin.password);
  const expertToken = await authenticate(seeded.expert.email, seeded.expert.password);
  const userToken = await authenticate(seeded.premium.email, seeded.premium.password);

  const flows = buildFlowImplementations({ seeded });

  const results = [];

  for (const scenario of scenarios) {
    const actorToken = scenario.actor === 'admin'
      ? adminToken
      : scenario.actor === 'expert'
        ? expertToken
        : userToken;

    results.push(await runFlow('onboarding', () => flows.onboarding({ token: actorToken, scenario }), scenario.id));
    results.push(await runFlow('accept_invite', () => flows.accept_invite({ adminToken, userToken, scenario }), scenario.id));
    results.push(await runFlow('follow_expert', () => flows.follow_expert({ userToken, expertUserId: seeded.expert.id }), scenario.id));
    results.push(await runFlow('create_alert', () => flows.create_alert({ expertToken, scenario }), scenario.id));
    results.push(await runFlow('sync_portfolio', () => flows.sync_portfolio({ userToken }), scenario.id));
  }

  const report = summarize(results);
  const markdown = toMarkdown(report);

  await mkdir(ARTIFACT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(ARTIFACT_DIR, `journey-report-${timestamp}.json`);
  const mdPath = path.join(ARTIFACT_DIR, `journey-report-${timestamp}.md`);
  const latestJsonPath = path.join(ARTIFACT_DIR, 'latest-report.json');
  const latestMdPath = path.join(ARTIFACT_DIR, 'latest-report.md');

  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(mdPath, markdown, 'utf8');
  await copyFile(jsonPath, latestJsonPath);
  await copyFile(mdPath, latestMdPath);

  console.log(`Synthetic journeys finished. JSON: ${jsonPath}`);
  console.log(`Synthetic journeys finished. Markdown: ${mdPath}`);

  if (report.totals.failedRuns > 0) {
    process.exitCode = 1;
  }
}

await main();
