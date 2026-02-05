import fs from 'node:fs';

const reportPath = process.argv[2] ?? 'npm-audit.json';

if (!fs.existsSync(reportPath)) {
  console.error(`Audit report not found: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = report.metadata?.vulnerabilities ?? {};

const critical = Number(vulnerabilities.critical ?? 0);
const high = Number(vulnerabilities.high ?? 0);
const moderate = Number(vulnerabilities.moderate ?? 0);
const low = Number(vulnerabilities.low ?? 0);

console.log(`Vulnerability summary => critical: ${critical}, high: ${high}, moderate: ${moderate}, low: ${low}`);

if (critical > 0) {
  console.error('Security gate failed: critical vulnerabilities detected. Release blocked.');
  process.exit(1);
}

console.log('Security gate passed: no critical vulnerabilities detected.');
