const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const files = {
  config: read('src/config/freeArchitecture.ts'),
  gateway: read('src/services/houniAiGateway.ts'),
  smartModal: read('src/components/modals/SmartInsertModal.tsx'),
  worker: read('cloudflare/houniai-worker/src/index.js'),
  workerCore: read('cloudflare/houniai-worker/src/core.js'),
  rules: read('firestore.rules'),
  index: read('index.html'),
};

let passed = 0;
function test(name, callback) {
  callback();
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('Il client si attiva soltanto con endpoint HTTPS configurato', () => {
  assert.equal(files.config.includes("VITE_HOUNIAI_WORKER_URL"), true);
  assert.equal(files.config.includes("/^https:\\\/\\\//"), true);
  assert.equal(files.gateway.includes('if (!HOUNIAI_WORKER_URL)'), true);
  assert.equal(files.index.includes('connect-src'), true);
  assert.equal(files.index.includes('https://hounigo-ai.nunzio114.workers.dev'), true);
});

test('Il gateway invia token Firebase e nessuna chiave AI', () => {
  assert.equal(files.gateway.includes('currentUser.getIdToken()'), true);
  assert.equal(files.gateway.includes('Authorization: `Bearer ${idToken}`'), true);
  assert.equal(files.gateway.includes('VITE_GEMINI_API_KEY'), false);
  assert.equal(files.gateway.includes('CLOUDFLARE_API_TOKEN'), false);
});

test('Consenso Cloudflare richiesto prima di qualsiasi inferenza', () => {
  assert.equal(files.gateway.includes('hasCloudflareAiConsent()'), true);
  assert.equal(files.smartModal.includes('Prima di usare HouniAI'), true);
  assert.equal(files.smartModal.includes('Nessun file viene inviato automaticamente'), true);
  assert.equal(files.smartModal.includes('Nessuna scheda viene salvata finché non la approvi singolarmente'), true);
});

test('Il Worker verifica identità e membership Owner Copilota', () => {
  assert.equal(files.worker.includes('accounts:lookup'), true);
  assert.equal(files.worker.includes('getFirestoreDocument(`trips/${encodedTripId}`'), true);
  assert.equal(files.workerCore.includes("member.role === 'owner' || member.role === 'copilota'"), true);
  assert.equal(files.rules.includes('allow get: if isSignedIn()'), true);
});

test('Quote conservative bloccano prima di Workers AI', () => {
  assert.equal(files.workerCore.includes('MAX_UID_REQUESTS_PER_DAY = 5'), true);
  assert.equal(files.workerCore.includes('MAX_GLOBAL_REQUESTS_PER_DAY = 20'), true);
  assert.equal(files.workerCore.includes('MAX_UID_REQUESTS_PER_MINUTE = 2'), true);
  assert.equal(files.worker.indexOf('await enforceRateLimits') < files.worker.indexOf('await runAi'), true);
});

test('Nessun prompt risposta o documento viene registrato', () => {
  assert.equal(files.worker.includes('console.'), false);
  assert.equal(files.worker.includes('.put('), false);
  assert.equal(files.worker.includes('AI_GATEWAY'), false);
});

test('Fallback manuale offline quota ed errori resta esplicito', () => {
  for (const message of ['Sei offline', 'Quota gratuita HouniAI raggiunta', 'Continua con l’inserimento manuale']) {
    assert.equal(`${files.gateway}\n${files.worker}`.includes(message), true);
  }
  assert.equal(files.smartModal.includes('Inserisci manualmente'), true);
});

console.log(`\n${passed}/${passed} verifiche HouniAI Cloudflare sicure superate.`);
