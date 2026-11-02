import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../cloudflare/houniai-worker/src/index.js';
import { TEXT_MODEL, VISION_MODEL, normalizeAiResponse } from '../cloudflare/houniai-worker/src/core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

class MemoryD1 {
  constructor() { this.counters = new Map(); }
  prepare() {
    return {
      bind: (bucket, identityHash, now) => ({
        first: async () => {
          const key = `${bucket}|${identityHash}`;
          const requestCount = (this.counters.get(key)?.requestCount || 0) + 1;
          this.counters.set(key, { requestCount, now });
          return { request_count: requestCount };
        },
      }),
    };
  }
}

function workerEnv() {
  return {
    ALLOWED_ORIGIN: 'https://casabr.github.io',
    FIREBASE_PROJECT_ID: 'demo-hounigo',
    FIREBASE_WEB_API_KEY: 'synthetic-public-key',
    RATE_LIMITS: new MemoryD1(),
    AI: {
      calls: [],
      async run(model, input) {
        this.calls.push({ model, input });
        return { response: '{"entityType":"tappa","tappa":{"titolo":"Demo","data":"2099-05-10"}}' };
      },
    },
  };
}

function request(body = {}, token = 'valid-token', origin = 'https://casabr.github.io') {
  return new Request('https://hounigo-ai.example/v1/houniai', {
    method: 'POST',
    headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId: 'demo-trip',
      consentVersion: 'cloudflare-workers-ai-v1',
      requestBody: { contents: [{ role: 'user', parts: [{ text: 'Prenotazione sintetica' }] }] },
      ...body,
    }),
  });
}

const originalFetch = globalThis.fetch;
let memberRole = 'copilota';
globalThis.fetch = async url => {
  const value = String(url);
  if (value.includes('accounts:lookup')) return Response.json({ users: [{ localId: 'uid-demo', disabled: false }] });
  if (value.includes('/members/uid-demo')) return Response.json({ fields: { role: { stringValue: memberRole } } });
  if (value.includes('/documents/trips/demo-trip')) return Response.json({ fields: { ownerUid: { stringValue: 'owner-demo' } } });
  throw new Error('Unexpected synthetic request');
};

let passed = 0;
async function test(name, callback) {
  await callback();
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

try {
  await test('CORS rifiuta origini diverse da HOUNIGO', async () => {
    const response = await handleRequest(request({}, 'valid-token', 'https://example.com'), workerEnv());
    assert.equal(response.status, 403);
  });

  await test('Richieste senza token sono negate', async () => {
    const response = await handleRequest(request({}, ''), workerEnv());
    assert.equal(response.status, 401);
  });

  await test('Viewer autenticato non può usare AI', async () => {
    memberRole = 'viewer';
    const response = await handleRequest(request(), workerEnv());
    assert.equal(response.status, 403);
    memberRole = 'copilota';
  });

  await test('Copilota autorizzato usa esclusivamente il modello testo Cloudflare', async () => {
    const env = workerEnv();
    const response = await handleRequest(request(), env);
    assert.equal(response.status, 200);
    assert.equal(env.AI.calls[0].model, TEXT_MODEL);
  });

  await test('Vision usa il modello Cloudflare dedicato', async () => {
    const env = workerEnv();
    const onePixel = btoa(String.fromCharCode(137, 80, 78, 71));
    const response = await handleRequest(request({ requestBody: { contents: [{ role: 'user', parts: [{ text: 'Leggi screenshot' }, { inline_data: { data: onePixel } }] }] } }), env);
    assert.equal(response.status, 200);
    assert.equal(env.AI.calls[0].model, VISION_MODEL);
    assert.equal(env.AI.calls[0].model, '@cf/qwen/qwen3.8-27b');
    assert.equal(env.AI.calls[0].input.messages.at(-1).content.at(-1).type, 'image_url');
    assert.equal(env.AI.calls[0].input.messages.at(-1).content.at(-1).image_url.url.startsWith('data:image/jpeg;base64,'), true);
    assert.equal('image' in env.AI.calls[0].input, false);
  });

  await test('La terza richiesta nello stesso minuto viene bloccata', async () => {
    const env = workerEnv();
    assert.equal((await handleRequest(request(), env)).status, 200);
    assert.equal((await handleRequest(request(), env)).status, 200);
    assert.equal((await handleRequest(request(), env)).status, 429);
  });

  await test('Cinque prenotazioni sintetiche rispettano il contratto campi', async () => {
    const fixtures = [
      { response: { entityType: 'alloggio', alloggio: { name: 'Hotel Demo', checkIn: '2099-05-10', checkOut: '2099-05-12', checkInTime: '15:00' } }, expected: ['alloggio', '2099-05-10', '15:00'] },
      { response: { entityType: 'trasporto', trasporto: { tipoTrasporto: 'volo', date: '2099-05-13', departureTime: '08:20', arrivalTime: '11:40' } }, expected: ['trasporto', '2099-05-13', '08:20'] },
      { response: { entityType: 'trasporto', trasporto: { tipoTrasporto: 'treno', date: '2099-05-14', departureTime: '09:10', arrivalTime: '10:35' } }, expected: ['trasporto', '2099-05-14', '09:10'] },
      { response: { entityType: 'attivita', attivita: { title: 'Tour Demo', date: '2099-05-15', time: '14:30' } }, expected: ['attivita', '2099-05-15', '14:30'] },
      { response: { entityType: 'alloggio', alloggio: { name: 'Hotel Demo', checkIn: '2099-05-10', checkOut: '2099-05-12', checkInTime: '15:00' } }, expected: ['alloggio', '2099-05-10', '15:00'], duplicateOf: 0 },
    ];
    const normalized = fixtures.map(fixture => JSON.parse(normalizeAiResponse({ response: fixture.response })));
    normalized.forEach((item, index) => {
      const serialized = JSON.stringify(item);
      fixtures[index].expected.forEach(value => assert.equal(serialized.includes(value), true));
    });
    assert.deepEqual(normalized[4], normalized[0]);
    assert.equal(source('src/components/modals/SmartInsertModal.tsx').includes("status: 'pending'"), true);
    assert.equal(source('src/components/modals/SmartInsertModal.tsx').includes('existingData && !duplicateConfirmed'), true);
  });

  await test('D1 non riceve prompt o risposte', async () => {
    const env = workerEnv();
    await handleRequest(request(), env);
    assert.equal([...env.RATE_LIMITS.counters.keys()].some(key => key.includes('Prenotazione')), false);
  });

  await test('Nessun modello Meta o provider esterno è configurato', async () => {
    assert.equal(TEXT_MODEL, '@cf/qwen/qwen3.8-27b');
    assert.equal(VISION_MODEL, '@cf/qwen/qwen3.8-27b');
    assert.equal(source('cloudflare/houniai-worker/src/core.js').includes('@cf/meta/'), false);
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`\n${passed}/${passed} test Worker e fixture sintetiche superati.`);
