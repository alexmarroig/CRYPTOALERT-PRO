import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/controllers');
const files = fs.readdirSync(root).filter((file) => file.endsWith('Controller.ts'));

const missingValidation = [];
for (const file of files) {
  const fullPath = path.join(root, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes('req.body')) {
    continue;
  }

  if (!content.includes('safeParse(req.body)')) {
    missingValidation.push(file);
  }
}

if (missingValidation.length > 0) {
  console.error('Controllers with req.body but without safeParse(req.body):');
  for (const file of missingValidation) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log('Validation check passed: all controllers using req.body also validate with Zod safeParse.');
