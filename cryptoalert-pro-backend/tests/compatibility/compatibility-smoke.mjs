import fs from 'node:fs/promises';
import process from 'node:process';

const matrixPath = new URL('./compatibility-matrix.json', import.meta.url);
const rawMatrix = await fs.readFile(matrixPath, 'utf8');
const matrix = JSON.parse(rawMatrix);

const requiredKeys = ['browsers', 'operatingSystems', 'devices', 'apiSmokeTargets'];
for (const key of requiredKeys) {
  if (!Array.isArray(matrix[key]) || matrix[key].length === 0) {
    throw new Error(`Compatibility matrix inválida: '${key}' precisa ter ao menos um item.`);
  }
}

const baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  console.log('BASE_URL não definido. Validação da matriz concluída sem smoke HTTP.');
  process.exit(0);
}

const authToken = process.env.AUTH_TOKEN;
const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

let failed = false;
for (const target of matrix.apiSmokeTargets) {
  const response = await fetch(new URL(target, baseUrl), { headers });
  const allowedStatuses = target.includes('/v1/portfolio') || target.includes('/v1/alerts')
    ? [200, 401]
    : [200];

  if (!allowedStatuses.includes(response.status)) {
    failed = true;
    console.error(`Falha em ${target}: status ${response.status} (esperado: ${allowedStatuses.join(', ')})`);
  } else {
    console.log(`OK ${target}: ${response.status}`);
  }
}

if (failed) {
  process.exit(1);
}
