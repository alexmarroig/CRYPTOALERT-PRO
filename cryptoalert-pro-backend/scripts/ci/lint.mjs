import fs from 'node:fs';
import path from 'node:path';

const failures = [];

try {
  const openapi = JSON.parse(fs.readFileSync('docs/openapi.json', 'utf8'));
  if (!openapi.openapi || !openapi.paths || Object.keys(openapi.paths).length === 0) {
    failures.push('docs/openapi.json must define `openapi` and at least one `paths` entry.');
  }
} catch (error) {
  failures.push(`docs/openapi.json must be valid JSON: ${error.message}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(resolved);
      continue;
    }
    if (!resolved.endsWith('.ts')) continue;
    const content = fs.readFileSync(resolved, 'utf8');
    if (content.includes('\t')) {
      failures.push(`${resolved}: tab characters are not allowed.`);
    }
  }
}

walk('src');

if (failures.length > 0) {
  console.error('Lint failed:');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('Lint passed.');
