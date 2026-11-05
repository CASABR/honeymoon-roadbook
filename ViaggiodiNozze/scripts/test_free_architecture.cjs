const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const config = read('src/config/freeArchitecture.ts');
const gateway = read('src/services/houniAiGateway.ts');
const sync = read('src/storage/syncService.ts');
const pushModal = read('src/components/modals/PushNotificationModal.tsx');
const workerConfig = read('cloudflare/houniai-worker/wrangler.jsonc');
const envExample = read('.env.example');
const productionEnv = read('.env.production');
const packageJson = JSON.parse(read('package.json'));

function publicSourceText(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'prototypes') return [];
      return publicSourceText(fullPath);
    }
    return /\.(?:ts|tsx|json)$/.test(entry.name) ? [fs.readFileSync(fullPath, 'utf8')] : [];
  }).join('\n');
}

let passed = 0;
function test(name, callback) {
  callback();
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('La release è coerente', () => assert.ok(packageJson.version));

test('AI usa solo il Worker approvato e mantiene il fallback senza URL', () => {
  assert.equal(config.includes("VITE_HOUNIAI_WORKER_URL || ''"), true);
  assert.equal(productionEnv.includes('VITE_HOUNIAI_WORKER_URL=https://hounigo-ai.nunzio114.workers.dev/v1/houniai'), true);
  assert.equal(productionEnv.includes('VITE_PUSH_WORKER_URL=https://hounigo-ai.nunzio114.workers.dev/v1/push'), true);
  assert.equal(productionEnv.includes('VITE_VAPID_PUBLIC_KEY='), true);
});

test('Workers AI usa binding diretto e non provider esterni', () => {
  assert.equal(workerConfig.includes('"binding": "AI"'), true);
  assert.equal(workerConfig.includes('gateway'), false);
  assert.equal(gateway.includes('generativelanguage.googleapis.com'), false);
});

test('La sincronizzazione accoda push solo per mutazioni esplicite e configurate', () => {
  assert.equal(sync.includes("import { recordPushMutation } from '../services/pushNotificationService'"), true);
  assert.equal(sync.includes('options.notifyCollaborators && options.mutationId'), true);
  assert.equal(config.includes('PUSH_VAPID_PUBLIC_KEY.length > 40'), true);
  assert.equal(productionEnv.includes('VITE_PUSH_WORKER_URL'), true);
});

test('La UI mantiene il fallback e mostra il test solo con backend configurato', () => {
  assert.equal(pushModal.includes('BACKGROUND_PUSH_ENABLED'), true);
  assert.equal(pushModal.includes('usePushNotifications'), true);
  assert.equal(pushModal.includes('Invia notifica di prova'), true);
});

test('Nessuna chiave AI o VAPID è richiesta al frontend', () => {
  assert.equal(envExample.includes('VITE_VAPID_PUBLIC_KEY='), true);
  assert.equal(envExample.includes('VAPID_PRIVATE_KEY'), false);
  assert.equal(envExample.includes('VITE_GEMINI_API_KEY'), false);
  assert.equal(envExample.includes('CLOUDFLARE_API_TOKEN'), false);
});

test('La microcopy pubblica non presenta HOUNIGO come prototipo', () => {
  const publicCopy = `${publicSourceText(path.join(root, 'src'))}\n${read('CHANGELOG.md')}`;
  assert.equal(/tester|beta|fase di test|sperimentale|dimostrativ|prototip|collaud/i.test(publicCopy), false);
});

console.log(`\n${passed}/${passed} verifiche architettura gratuita superate.`);
