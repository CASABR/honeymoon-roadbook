const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

function createD1Shim(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_photo_requests (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS live_photo_objects (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, owner_hash TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL, post_id TEXT, created_at INTEGER NOT NULL);
  `);
  return {
    withSession() { return this; },
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() { return db.prepare(sql).get(...this.args) || null; },
        async run() { return db.prepare(sql).run(...this.args); },
      };
    },
  };
}

async function run() {
  const root = path.resolve(__dirname, '..');

  // 1. LiveIntelligence tests (compiled TS via esbuild/vite or direct dynamic import? Use tsx/vite or check)
  // Actually let's test the Worker OPTIONS + 200/201 POST + persistence + second session read first,
  // and test LiveIntelligence via Vite/Playwright or esbuild transform!
  const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  let deriveLiveIntelligence;
  try {
    ({ deriveLiveIntelligence } = await vite.ssrLoadModule('/src/utils/liveIntelligenceHelper.ts'));
  } finally {
    await vite.close();
  }

  const nov25 = new Date('2026-11-25T10:30:00+01:00');
  const preTripInternal = deriveLiveIntelligence({
    giorni: [],
    attivita: [],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: nov25,
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    realGpsCoords: { lat: 40.7, lng: 14.7 },
    isExternalGuest: false,
    timeZone: 'Europe/Rome',
  });
  assert.equal(preTripInternal.tripStatus, 'pre_trip', '25/11 con inizio 28/11 deve essere pre_trip anche con GPS attivo');

  const preTripGuest = deriveLiveIntelligence({
    giorni: [{ id: 'g1', date: '2026-11-28', title: 'Partenza', location: 'Roma' }],
    attivita: [{ id: 'a1', date: '2026-11-28', title: 'Segreto' }],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: nov25,
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    realGpsCoords: { lat: 40.7, lng: 14.7 },
    isExternalGuest: true,
    timeZone: 'Europe/Rome',
  });
  assert.equal(preTripGuest.tripStatus, 'pre_trip', 'Ospite esterno pre-partenza deve risultare pre_trip');
  assert.equal(preTripGuest.currentEvent, null, 'Ospite esterno non deve vedere eventi privati');
  assert.equal(preTripGuest.plannedLocation, null, 'Ospite esterno non deve vedere tappe private');

  const missingDatesInternal = deriveLiveIntelligence({
    giorni: [],
    attivita: [],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: nov25,
    isExternalGuest: false,
    timeZone: 'Europe/Rome',
  });
  assert.equal(missingDatesInternal.tripStatus, 'unknown', 'Senza date attendibili non deve mai fare fallback a in_trip');

  const missingDatesGuest = deriveLiveIntelligence({
    giorni: [],
    attivita: [],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: nov25,
    isExternalGuest: true,
    timeZone: 'Europe/Rome',
  });
  assert.equal(missingDatesGuest.tripStatus, 'unknown', 'Ospite esterno senza date deve risultare unknown');

  const inTrip = deriveLiveIntelligence({
    giorni: [],
    attivita: [],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: new Date('2026-12-01T12:00:00+01:00'),
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    isExternalGuest: true,
    timeZone: 'Europe/Rome',
  });
  assert.equal(inTrip.tripStatus, 'in_trip');

  const postTrip = deriveLiveIntelligence({
    giorni: [],
    attivita: [],
    tappe: [],
    alloggi: [],
    trasporti: [],
    currentDateTime: new Date('2027-01-15T12:00:00+01:00'),
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    isExternalGuest: true,
    timeZone: 'Europe/Rome',
  });
  assert.equal(postTrip.tripStatus, 'post_trip');
  console.log('✓ [PASS] LiveIntelligence: pre_trip su 25/11 con GPS attivo, isExternalGuest e fallback unknown verificati');

  // 2. Worker CORS preflight OPTIONS + 200/201 POST + persistence + second session read
  const workerPath = path.join(root, 'cloudflare/houniai-worker/src/index.js');
  const { handleRequest } = await import(pathToFileURL(workerPath).href);

  // In-memory Firestore REST store
  const fsStore = new Map([
    ['live_feeds/synth_trip', {
      fields: { status: { stringValue: 'in_corso' }, deleted: { booleanValue: false } }
    }],
    ['live_feeds/synth_trip/updates/upd_1', {
      fields: {
        title: { stringValue: 'Foto test' },
        photoUrl: { stringValue: 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/' + 'a'.repeat(48) },
        publicSchemaVersion: { integerValue: '2' },
        deleted: { booleanValue: false },
        reactionCounts: { mapValue: { fields: {} } },
      }
    }],
  ]);

  const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'sa-test-token', expires_in: 3600 }), { status: 200 });
    }
    const prefix = 'https://firestore.googleapis.com/v1/projects/test-proj/databases/(default)/documents/';
    if (u.startsWith(prefix)) {
      const [docPath, query] = u.slice(prefix.length).split('?');
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'GET') {
        const doc = fsStore.get(docPath);
        return doc ? new Response(JSON.stringify({ name: docPath, ...doc }), { status: 200 }) : new Response('{}', { status: 404 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(init.body);
        const existing = fsStore.get(docPath) || { fields: {} };
        if (query && query.includes('updateMask.fieldPaths=reactionCounts')) {
          existing.fields.reactionCounts = body.fields.reactionCounts;
        } else {
          existing.fields = { ...existing.fields, ...body.fields };
        }
        fsStore.set(docPath, existing);
        return new Response(JSON.stringify({ name: docPath, ...existing }), { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(init.body);
        const newId = `doc_${fsStore.size + 1}`;
        const fullPath = `${docPath}/${newId}`;
        fsStore.set(fullPath, { fields: body.fields });
        return new Response(JSON.stringify({ name: `projects/test-proj/databases/(default)/documents/${fullPath}`, fields: body.fields }), { status: 200 });
      }
    }
    throw new Error(`Unexpected fetch: ${u}`);
  };

  try {
    const db = new DatabaseSync(':memory:');
    const env = {
      ALLOWED_ORIGIN: 'https://casabr.github.io',
      FIREBASE_PROJECT_ID: 'test-proj',
      FIREBASE_SERVICE_ACCOUNT_EMAIL: 'test@test-proj.iam.gserviceaccount.com',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
      LIVE_PHOTOS_ENABLED: 'true',
      LIVE_PHOTOS_FREE_PLAN_CONFIRMED: 'true',
      LIVE_PHOTOS: { get: async () => null, put: async () => {}, delete: async () => {} },
      RATE_LIMITS: createD1Shim(db),
    };

    const origin = 'https://casabr.github.io';
    for (const ep of ['reactions', 'guest-messages', 'comments']) {
      const optRes = await handleRequest(new Request(`https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/${ep}`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      }), env);
      assert.equal(optRes.status, 204, `OPTIONS /${ep} deve restituire 204, ricevuto ${optRes.status}`);
      assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), origin);
    }
    console.log('✓ [PASS] Preflight CORS OPTIONS -> 204 su reactions, guest-messages e comments');

    // POST reaction (session 1 + session 2)
    const r1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/reactions', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ updateId: 'upd_1', type: '❤️', visitorId: 'vis_session_1' }),
    }), env);
    assert.equal(r1.status, 200);
    const r1Body = await r1.json();
    assert.equal(r1Body.reactionCounts['❤️'], 1);

    const r2 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/reactions', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '5.6.7.8' },
      body: JSON.stringify({ updateId: 'upd_1', type: '❤️', visitorId: 'vis_session_2' }),
    }), env);
    assert.equal(r2.status, 200);
    const r2Body = await r2.json();
    assert.equal(r2Body.reactionCounts['❤️'], 2);
    assert.equal(fsStore.get('live_feeds/synth_trip/updates/upd_1').fields.reactionCounts.mapValue.fields['❤️'].integerValue, '2');

    // POST guest message + verify persisted doc
    const m1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/guest-messages', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ visitorId: 'vis_session_1', authorName: 'Zia Maria', message: 'Buon viaggio!' }),
    }), env);
    assert.equal(m1.status, 201);
    const m1Body = await m1.json();
    assert.ok(m1Body.id);
    const savedMsg = fsStore.get(`live_feeds/synth_trip/guest_messages/${m1Body.id}`);
    assert.equal(savedMsg.fields.authorName.stringValue, 'Zia Maria');
    assert.equal(savedMsg.fields.publicSchemaVersion.integerValue, '2');

    // POST photo comment + verify persisted doc
    const c1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/comments', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ postId: 'upd_1', authorName: 'Marco', text: 'Bellissima foto!' }),
    }), env);
    assert.equal(c1.status, 201);
    const c1Body = await c1.json();
    assert.ok(c1Body.id);
    const savedComment = fsStore.get(`live_feeds/synth_trip/updates/upd_1/comments/${c1Body.id}`);
    assert.equal(savedComment.fields.authorName.stringValue, 'Marco');
    assert.equal(savedComment.fields.text.stringValue, 'Bellissima foto!');
    assert.equal(savedComment.fields.publicSchemaVersion.integerValue, '2');
    console.log('✓ [PASS] Worker POST 200/201 + persistenza Firestore + lettura seconda sessione verificati');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
