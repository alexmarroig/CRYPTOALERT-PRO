import { readFile } from 'node:fs/promises';
import path from 'node:path';

const reportPath = process.argv[2] ?? 'artifacts/journeys/latest-report.json';
const thresholdsPath = process.argv[3] ?? 'tests/journeys/kpi-thresholds.json';

function readJson(filePath) {
  return readFile(path.resolve(filePath), 'utf8').then((content) => JSON.parse(content));
}

function asPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const [report, thresholds] = await Promise.all([
    readJson(reportPath),
    readJson(thresholdsPath)
  ]);

  const violations = [];

  for (const [flowName, flowData] of Object.entries(report.flows)) {
    const flowThreshold = thresholds.flows?.[flowName] ?? {};
    const maxP95 = flowThreshold.maxP95LatencyMs ?? thresholds.global.maxP95LatencyMs;
    const minSuccessRate = flowThreshold.minSuccessRate ?? thresholds.global.minSuccessRate;

    if (flowData.p95LatencyMs > maxP95) {
      violations.push(
        `${flowName}: p95 latency ${flowData.p95LatencyMs}ms > threshold ${maxP95}ms`
      );
    }

    if (flowData.successRate < minSuccessRate) {
      violations.push(
        `${flowName}: success rate ${asPercent(flowData.successRate)} < threshold ${asPercent(minSuccessRate)}`
      );
    }
  }

  if (violations.length) {
    console.error('Journey KPI regression detected:');
    for (const violation of violations) {
      console.error(` - ${violation}`);
    }
    process.exit(1);
  }

  console.log('Journey KPI checks passed.');
}

await main();
