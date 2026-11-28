const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
        async all() { return { results: db.prepare(sql).all(...this.args) }; },
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

  const chronology = deriveLiveIntelligence({
    giorni: [], attivita: [], alloggi: [], trasporti: [],
    tappe: [
      { id: 'evening', titolo: 'Tappa serale', data: '2026-11-28', orario: '19:00', coordinate: { lat: 45.45, lng: 9.17 } },
      { id: 'morning', titolo: 'Tappa mattutina', data: '2026-11-28', orario: '09:00', coordinate: { lat: 45.46, lng: 9.19 } },
      { id: 'noon', titolo: 'Tappa successiva', data: '2026-11-28', orario: '12:00', coordinate: { lat: 45.48, lng: 9.2 } }
    ],
    currentDateTime: new Date('2026-11-28T10:00:00+01:00'),
    tripStartDate: '2026-11-28', tripEndDate: '2027-01-10', timeZone: 'Europe/Rome'
  });
  assert.equal(chronology.plannedLocation.title, 'Tappa mattutina');
  assert.equal(chronology.nextEvent.title, 'Tappa successiva');
  console.log('✓ [PASS] Planned location follows local time, not database order');

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

  let simulateDenied = false;
  let denialDetails = false;
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
        if (simulateDenied && docPath.includes('/reactions/')) {
          return new Response(JSON.stringify({ error: {
            status: 'PERMISSION_DENIED',
            message: denialDetails ? 'Permission datastore.entities.create denied on private/path/email@example.com SECRET' : 'Synthetic denial only',
            details: denialDetails ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'IAM_PERMISSION_DENIED', metadata: { permission: 'datastore.entities.create' } }] : []
          } }), { status: 403 });
        }
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
        if (simulateDenied && docPath.endsWith('/comments')) {
          return new Response(JSON.stringify({ error: {
            status: 'PERMISSION_DENIED',
            message: denialDetails
              ? 'Permission datastore.entities.create denied on private/path/email@example.com SECRET'
              : 'Synthetic denial only',
            details: denialDetails ? [{
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'IAM_PERMISSION_DENIED',
              metadata: {
                permission: 'datastore.entities.create',
                resource: '//firestore.googleapis.com/projects/private/path',
              }
            }] : []
          } }), { status: 403 });
        }
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
    db.exec(fs.readFileSync(path.join(root, 'cloudflare/houniai-worker/migrations/0005_live_guest_messages.sql'), 'utf8'));
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
    assert.match(m1Body.id, /^d1_[a-f0-9]{32}$/);
    const savedMsg = db.prepare('SELECT author_name,message,trip_id FROM live_guest_messages WHERE id=?1').get(m1Body.id);
    assert.equal(savedMsg.author_name, 'Zia Maria');
    assert.equal(savedMsg.message, 'Buon viaggio!');
    assert.equal(savedMsg.trip_id, 'synth_trip');
    assert.equal(fsStore.has(`live_feeds/synth_trip/guest_messages/${m1Body.id}`), false);
    const guestRead = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/guest-messages', {
      method: 'GET', headers: { Origin: origin, 'CF-Connecting-IP': '6.6.6.6' }
    }), env);
    assert.equal(guestRead.status, 200);
    const guestReadBody = await guestRead.json();
    assert.equal(guestReadBody.messages[0].id, m1Body.id);
    assert.equal(guestReadBody.messages[0].visitorId, undefined);

    // POST photo comment while Firestore comment writes are denied; verify D1 persistence.
    simulateDenied = true;
    const c1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/comments', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ postId: 'upd_1', authorName: 'Marco', text: 'Bellissima foto!' }),
    }), env);
    assert.equal(c1.status, 201);
    const c1Body = await c1.json();
    assert.ok(c1Body.id);
    assert.match(c1Body.id, /^d1pc_[a-f0-9]{32}$/);
    const savedComment = db.prepare('SELECT * FROM live_photo_comments WHERE id=?1').get(c1Body.id);
    assert.equal(savedComment.author_name, 'Marco');
    assert.equal(savedComment.text, 'Bellissima foto!');
    assert.equal(savedComment.post_id, 'upd_1');
    assert.equal(fsStore.has(`live_feeds/synth_trip/updates/upd_1/comments/${c1Body.id}`), false);
    const readComments = (postId) => handleRequest(new Request(`https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/comments?postId=${postId}`, {
      headers: { Origin: origin, 'CF-Connecting-IP': '6.6.6.6' }
    }), env);
    const comments = await readComments('upd_1');
    assert.equal(comments.status, 200);
    assert.equal((await comments.json()).comments[0].id, c1Body.id);
    assert.equal((await readComments('missing')).status, 404);
    const deniedModeration = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/comments/moderate', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: 'upd_1', commentId: c1Body.id })
    }), env);
    assert.equal(deniedModeration.status, 401);
    simulateDenied = false;
    console.log('✓ [PASS] Commenti foto D1 con scrittura Firestore negata, seconda sessione, foto inesistente e moderazione anonima negata');

    simulateDenied = true;
    const deniedReq = () => new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/reactions', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.8.7.6' },
      body: JSON.stringify({ updateId: 'upd_1', type: '😂', visitorId: 'denied_test' }),
    });
    const identityMismatch = await handleRequest(deniedReq(), env);
    assert.equal(identityMismatch.status, 503);
    assert.match((await identityMismatch.json()).error, /^LIVE-ID:/);
    env.FIREBASE_SERVICE_ACCOUNT_EMAIL = 'hounigo-push-reader@app-viaggio-di-nozze.iam.gserviceaccount.com';
    const iamDenied = await handleRequest(deniedReq(), env);
    assert.equal(iamDenied.status, 503);
    assert.match((await iamDenied.json()).error, /^LIVE-IAM:/);
    denialDetails = true;
    const explained = await handleRequest(deniedReq(), env);
    assert.equal(explained.status, 503);
    const explainedBody = await explained.json();
    assert.match(explainedBody.error, /LIVE-IAM: IAM_PERMISSION_DENIED \/ datastore\.entities\.create \/ ENTITY_PERMISSION/);
    assert.doesNotMatch(explainedBody.error, /private|email@example|SECRET|projects\//i);
    simulateDenied = false;
    denialDetails = false;

    // Read-only stale GPS, then verify that an explicit STOP revokes its public projection.
    fsStore.set('live_feeds/synth_trip/gps_control/current', {
      fields: {
        status: { stringValue: 'active' },
        holderDeviceId: { stringValue: 'synthetic-device-123456789' },
        expiresAt: { timestampValue: new Date(Date.now() + 3_600_000).toISOString() }
      }
    });
    fsStore.set('live_feeds/synth_trip/locations/current', {
      fields: {
        lat: { doubleValue: 40.71 },
        lng: { doubleValue: 14.72 },
        accuracy: { integerValue: '12' },
        city: { stringValue: 'Città test' },
        country: { stringValue: 'Italia' },
        status: { stringValue: 'active' },
        publisherDeviceId: { stringValue: 'synthetic-device-123456789' },
        updatedAt: { timestampValue: new Date(Date.now() - 3_600_000).toISOString() }
      }
    });
    const locationPath = 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth_trip/last-location';
    const locationResponse = await handleRequest(new Request(locationPath, {
      method: 'GET', headers: { Origin: origin, 'CF-Connecting-IP': '8.8.8.8' }
    }), env);
    assert.equal(locationResponse.status, 200);
    const lastFix = await locationResponse.json();
    assert.equal(lastFix.available, true);
    assert.equal(lastFix.location.lat, 40.71);
    assert.equal(lastFix.location.lng, 14.72);
    assert.equal(lastFix.location.publisherDeviceId, undefined);
    assert.equal(locationResponse.headers.get('Cache-Control'), 'no-store, max-age=0');

    fsStore.get('live_feeds/synth_trip/gps_control/current').fields.status = { stringValue: 'stopped' };
    const afterStopResponse = await handleRequest(new Request(locationPath, {
      method: 'GET', headers: { Origin: origin, 'CF-Connecting-IP': '8.8.8.8' }
    }), env);
    const afterStop = await afterStopResponse.json();
    assert.equal(afterStop.available, false);
    assert.equal(afterStop.stopped, true);
    assert.equal(afterStop.location, undefined);
    console.log('✓ [PASS] Ultima posizione GPS stale + revoca STOP senza esposizione metadati privati');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().then(() => {
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'test_live_replies_and_push.cjs')], { stdio: 'inherit' });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
