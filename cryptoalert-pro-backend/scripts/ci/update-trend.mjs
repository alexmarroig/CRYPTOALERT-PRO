import fs from 'node:fs';
import path from 'node:path';

const historyPath = process.env.CI_TREND_FILE ?? 'reports/ci-trend/history.json';
const summaryPath = process.env.COVERAGE_SUMMARY_FILE ?? 'reports/coverage/summary.txt';

const summaryText = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '';
const allFilesRow = summaryText
  .split('\n')
  .map((line) => line.replace(/^#\s*/, '').trim())
  .find((line) => line.startsWith('all files'));

let linesPct = null;
let branchesPct = null;
let functionsPct = null;
if (allFilesRow) {
  const parts = allFilesRow.split('|').map((part) => part.trim());
  linesPct = Number.parseFloat(parts[1]);
  branchesPct = Number.parseFloat(parts[2]);
  functionsPct = Number.parseFloat(parts[3]);
}

const entry = {
  sha: process.env.GITHUB_SHA ?? 'local',
  runId: process.env.GITHUB_RUN_ID ?? 'local',
  createdAt: new Date().toISOString(),
  linesPct: Number.isFinite(linesPct) ? linesPct : null,
  branchesPct: Number.isFinite(branchesPct) ? branchesPct : null,
  functionsPct: Number.isFinite(functionsPct) ? functionsPct : null
};

const historyDir = path.dirname(historyPath);
fs.mkdirSync(historyDir, { recursive: true });

let history = [];
if (fs.existsSync(historyPath)) {
  history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}

history.push(entry);
const trimmed = history.slice(-30);
fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2));

console.log(`Updated trend history with ${trimmed.length} entries.`);
