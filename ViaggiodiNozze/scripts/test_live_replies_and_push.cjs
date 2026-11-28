const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

function createD1Shim(db) {
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
  const workerDir = path.join(root, 'cloudflare/houniai-worker');
  const { handleRequest } = await import(pathToFileURL(path.join(workerDir, 'src/index.js')).href);
  const { enqueueLivePushEvent } = await import(pathToFileURL(path.join(workerDir, 'src/push.js')).href);

  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(workerDir, 'migrations/0001_rate_limits.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(workerDir, 'migrations/0002_push_notifications.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(workerDir, 'migrations/0003_live_photos.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(workerDir, 'migrations/0004_push_job_meta.sql'), 'utf8'));

  const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const origin = 'https://casabr.github.io';

  const fsDocs = new Map([
    ['live_feeds/trip_a', { fields: { status: { stringValue: 'in_corso' }, deleted: { booleanValue: false } } }],
    ['live_feeds/trip_b', { fields: { status: { stringValue: 'in_corso' }, deleted: { booleanValue: false } } }],
    ['live_feeds/trip_a/updates/upd_1', {
      fields: {
        title: { stringValue: 'Foto 1' },
        photoUrl: { stringValue: 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/' + 'a'.repeat(48) },
        publicSchemaVersion: { integerValue: '2' },
        deleted: { booleanValue: false },
      }
    }],
    ['live_feeds/trip_a/updates/upd_2', {
      fields: {
        title: { stringValue: 'Foto 2' },
        photoUrl: { stringValue: 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/' + 'b'.repeat(48) },
        publicSchemaVersion: { integerValue: '2' },
        deleted: { booleanValue: false },
      }
    }],
    ['trips/trip_a', { fields: { ownerUid: { stringValue: 'owner_1' } } }],
    ['trips/trip_a/members/copilota_1', { fields: { role: { stringValue: 'copilota' } } }],
  ]);

  const fakeJwt = (uid) => {
    const h = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({
      sub: uid, aud: 'test-proj', iss: 'https://securetoken.google.com/test-proj',
      firebase: { sign_in_provider: 'google.com' }
    })).toString('base64url');
    return `${h}.${p}.sig`;
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'sa-tok', expires_in: 3600 }), { status: 200 });
    }
    if (u.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      const { idToken } = JSON.parse(init.body);
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
      return new Response(JSON.stringify({ users: [{ localId: payload.sub, disabled: false }] }), { status: 200 });
    }
    const prefix = 'https://firestore.googleapis.com/v1/projects/test-proj/databases/(default)/documents/';
    if (u.startsWith(prefix)) {
      const docPath = u.slice(prefix.length).split('?')[0];
      const doc = fsDocs.get(docPath);
      return doc ? new Response(JSON.stringify({ name: docPath, ...doc }), { status: 200 }) : new Response('{}', { status: 404 });
    }
    throw new Error(`Unexpected fetch: ${u}`);
  };

  try {
    const env = {
      ALLOWED_ORIGIN: origin,
      FIREBASE_PROJECT_ID: 'test-proj',
      FIREBASE_WEB_API_KEY: 'test-web-key',
      FIREBASE_SERVICE_ACCOUNT_EMAIL: 'test@test-proj.iam.gserviceaccount.com',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
      LIVE_PHOTOS_ENABLED: 'true',
      LIVE_PHOTOS_FREE_PLAN_CONFIRMED: 'true',
      LIVE_PHOTOS: { get: async () => null, put: async () => {}, delete: async () => {} },
      RATE_LIMITS: createD1Shim(db),
    };

    // 1. Guest message + WhatsApp-style reply + cross-trip rejection + Copilota delete
    const m1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/guest-messages', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' },
      body: JSON.stringify({ visitorId: 'vis_guest_1', authorName: 'Zia Anna', message: 'Buon viaggio ragazzi!' }),
    }), env);
    assert.equal(m1.status, 201);
    const m1Data = await m1.json();

    const mReply = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/guest-messages', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '2.2.2.2' },
      body: JSON.stringify({ visitorId: 'vis_guest_2', authorName: 'Marco', message: 'Grazie zia!', replyToId: m1Data.id }),
    }), env);
    assert.equal(mReply.status, 201);
    const mReplyData = await mReply.json();
    assert.equal(mReplyData.replyToId, m1Data.id);
    assert.equal(mReplyData.replyToAuthor, 'Zia Anna');
    assert.equal(mReplyData.replyToPreview, 'Buon viaggio ragazzi!');

    // Cross-trip reply must fail with 400
    const crossTripReply = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_b/guest-messages', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '3.3.3.3' },
      body: JSON.stringify({ visitorId: 'vis_guest_3', authorName: 'Esterno', message: 'Cross', replyToId: m1Data.id }),
    }), env);
    assert.equal(crossTripReply.status, 400);

    // GET returns reply metadata
    const listMsgs = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/guest-messages', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': '4.4.4.4' },
    }), env);
    assert.equal(listMsgs.status, 200);
    const listMsgsData = await listMsgs.json();
    const foundReply = listMsgsData.messages.find(m => m.id === mReplyData.id);
    assert.equal(foundReply.replyToAuthor, 'Zia Anna');
    assert.equal(foundReply.replyToPreview, 'Buon viaggio ragazzi!');

    // Copilota can delete guest message
    const delMsg = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/guest-messages/moderate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${fakeJwt('copilota_1')}`, 'CF-Connecting-IP': '5.5.5.5' },
      body: JSON.stringify({ messageId: m1Data.id, action: 'delete' }),
    }), env);
    assert.equal(delMsg.status, 200);
    console.log('✓ [PASS] Messaggi ospiti: risposte WhatsApp-style, isolamento trip e moderazione Copilota');

    // 2. Photo comments + reply + cross-photo rejection + Copilota delete
    const c1 = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/comments', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' },
      body: JSON.stringify({ postId: 'upd_1', authorName: 'Lucia', text: 'Che panorama!' }),
    }), env);
    assert.equal(c1.status, 201);
    const c1Data = await c1.json();

    const cReply = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/comments', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '2.2.2.2' },
      body: JSON.stringify({ postId: 'upd_1', authorName: 'Paolo', text: 'Vero!', replyToId: c1Data.id }),
    }), env);
    assert.equal(cReply.status, 201);
    const cReplyData = await cReply.json();
    assert.equal(cReplyData.replyToAuthor, 'Lucia');
    assert.equal(cReplyData.replyToPreview, 'Che panorama!');

    // Cross-photo reply must fail with 400
    const crossPhotoReply = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/comments', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '3.3.3.3' },
      body: JSON.stringify({ postId: 'upd_2', authorName: 'Paolo', text: 'Cross photo', replyToId: c1Data.id }),
    }), env);
    assert.equal(crossPhotoReply.status, 400);

    // Copilota can delete photo comment
    const delComment = await handleRequest(new Request('https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/comments/moderate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${fakeJwt('copilota_1')}`, 'CF-Connecting-IP': '5.5.5.5' },
      body: JSON.stringify({ postId: 'upd_1', commentId: c1Data.id }),
    }), env);
    assert.equal(delComment.status, 200);
    console.log('✓ [PASS] Commenti foto: risposte WhatsApp-style, isolamento conversazione e moderazione Copilota');

    // 3. Push grouping, dedupe, deep-links, and actor exclusion
    const msgJob = db.prepare("SELECT * FROM push_jobs WHERE entity_key = 'live:live_guest_msg:trip_a'").get();
    assert.ok(msgJob, 'Push job per messaggi ospiti accodato');
    const msgMeta = JSON.parse(msgJob.meta_json);
    assert.equal(msgMeta.count, 2, 'Due messaggi ravvicinati raggruppati in un solo job');
    assert.equal(msgMeta.url, '/honeymoon-roadbook/?pushView=live&liveTab=messaggi');

    const dup = await enqueueLivePushEvent(env, {
      tripId: 'trip_a',
      eventType: 'live_photo',
      actorUid: 'owner_1',
      dedupeKey: 'photo_1:upd_1',
      photoId: 'upd_1',
    });
    assert.equal(dup.queued, true);
    const dup2 = await enqueueLivePushEvent(env, {
      tripId: 'trip_a',
      eventType: 'live_photo',
      actorUid: 'owner_1',
      dedupeKey: 'photo_1:upd_1',
      photoId: 'upd_1',
    });
    assert.equal(dup2.duplicate, true, 'Duplicati push esclusi');
    const photoJob = db.prepare("SELECT * FROM push_jobs WHERE entity_key = 'live:live_photo:upd_1'").get();
    assert.equal(photoJob.actor_uid, 'owner_1', 'actor_uid salvato per escludere le proprie azioni');
    assert.equal(JSON.parse(photoJob.meta_json).url, '/honeymoon-roadbook/?pushView=live&liveTab=foto&photoId=upd_1');
    console.log('✓ [PASS] Push LIVE: raggruppamento, deduplica, esclusione actor_uid e deep-link verificati');

    // A queued authenticated reply retried after a lost response is the same mutation.
    for (const [uid, visitor, ip] of [['owner_1','vis_owner_retry','6.6.6.6'], ['copilota_1','vis_copilot_retry','7.7.7.7']]) {
      const headers = { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${fakeJwt(uid)}`, 'CF-Connecting-IP': ip };
      for (const [endpoint, payload] of [
        ['guest-messages', { visitorId: visitor, authorName: 'Same name', message: 'Reply', replyToId: mReplyData.id, clientMutationId: 'off_test' }],
        ['comments', { postId: 'upd_1', authorName: 'Same name', text: 'Reply', replyToId: cReplyData.id, clientMutationId: 'off_test' }]
      ]) {
        const url = `https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/trip_a/${endpoint}`;
        const req = () => new Request(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        const first = await handleRequest(req(), env);
        assert.equal(first.status, 201);
        const firstBody = await first.json();
        const second = await handleRequest(req(), env);
        assert.equal(second.status, 200);
        assert.equal((await second.json()).id, firstBody.id);
      }
    }
    for (const key of ['live:live_guest_msg:trip_a', 'live:live_comment:upd_1']) {
      const jobs = db.prepare('SELECT actor_uid, meta_json FROM push_jobs WHERE entity_key = ?').all(key);
      assert.equal(jobs.length, 3);
      assert.ok(jobs.some(j => j.actor_uid === 'owner_1' && JSON.parse(j.meta_json).count === 1));
      assert.ok(jobs.some(j => j.actor_uid === 'copilota_1' && JSON.parse(j.meta_json).count === 1));
      assert.ok(jobs.some(j => j.actor_uid === null && JSON.parse(j.meta_json).count === 2));
    }
    console.log('✓ [PASS] Verified author isolation and idempotent offline replies');

  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
