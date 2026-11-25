// End-to-end Worker handler against an isolated in-memory D1 (no production writes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { handleLivePhotoRequest } = await import(pathToFileURL(path.join(root, 'cloudflare/houniai-worker/src/livePhotos.js')).href);
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE live_photo_requests(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `);
  db.exec(fs.readFileSync(path.join(root, 'cloudflare/houniai-worker/migrations/0005_live_guest_messages.sql'), 'utf8'));
  const database = {
    withSession() { return this; },
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() { return db.prepare(sql).get(...this.args) || null; },
        async all() { return { results: db.prepare(sql).all(...this.args) }; },
        async run() { return db.prepare(sql).run(...this.args); },
      };
    }
  };
  const feedStore = new Map([
    ['live_feeds/trip_test', { fields: { status: { stringValue: 'in_corso' }, deleted: { booleanValue: false } } }],
    ['live_feeds/trip_other', { fields: { status: { stringValue: 'in_corso' }, deleted: { booleanValue: false } } }]
  ]);
  const ownerToken = 'test.' + Buffer.from(JSON.stringify({
    sub: 'owner123',
    aud: 'test-project',
    iss: 'https://securetoken.google.com/test-project',
    firebase: { sign_in_provider: 'password' }
  })).toString('base64url') + '.fake-signature';
  const env = {
    FIREBASE_PROJECT_ID: 'test-project',
    ALLOWED_ORIGIN: 'https://casabr.github.io',
    RATE_LIMITS: database,
    LIVE_PHOTOS_ENABLED: 'true',
    LIVE_PHOTOS_FREE_PLAN_CONFIRMED: 'true',
    LIVE_PHOTOS: { get: async () => null },
  };
  const security = {
    getServiceAccountToken: async () => 'fake-access-token',
    getFirestoreDocument: async (p) => feedStore.get(p) || null,
    verifyFirebaseIdentity: async (token) => token === ownerToken ? 'owner123' : null,
    assertEditor: async (uid) => uid === 'owner123',
  };
  const base = 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/';
  const origin = 'https://casabr.github.io';
  const call = (trip, endpoint, method = 'GET', body = undefined, headers = {}) => {
    const h = { Origin: origin, 'CF-Connecting-IP': '11.22.33.44', ...headers };
    if (body) h['Content-Type'] = 'application/json';
    return handleLivePhotoRequest(new Request(base + trip + '/' + endpoint, {
      method, headers: h, ...(body ? { body: JSON.stringify(body) } : {})
    }), env, security);
  };

  const opts = await call('trip_test','guest-messages','OPTIONS',undefined,
    { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' });
  assert.equal(opts.status,204);
  assert.equal(opts.headers.get('Access-Control-Allow-Origin'),origin);

  const guest1 = await call('trip_test', 'guest-messages', 'POST',
    { visitorId: 'guest_phone_01', authorName: 'Zia Maria', message: 'Buon viaggio!' });
  assert.equal(guest1.status, 201);
  const saved = await guest1.json();
  assert.match(saved.id, /^d1_[a-f0-9]{32}$/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM live_guest_messages').get().n, 1);

  // Separate browser without Firebase session: exact same persistent message.
  const view = await call('trip_test', 'guest-messages');
  assert.equal(view.status, 200);
  const viewData = await view.json();
  assert.equal(viewData.messages.length, 1);
  assert.equal(viewData.messages[0].message, 'Buon viaggio!');
  assert.equal(viewData.messages[0].authorName, 'Zia Maria');
  assert.equal(viewData.messages[0].visitorId, undefined, 'Never expose private visitor ID');
  const other = await call('trip_other', 'guest-messages');
  assert.deepEqual((await other.json()).messages, []);

  const wrongOrigin = await handleLivePhotoRequest(new Request(base + 'trip_test/guest-messages', {
    method: 'POST', headers: { Origin:'https://evil.invalid', 'CF-Connecting-IP':'22.22.22.22', 'Content-Type':'application/json' },
    body: JSON.stringify({ visitorId: 'guest_evil_1', authorName:'x', message:'y' })
  }),env,security);
  assert.equal(wrongOrigin.status,403);
  const invalid = await call('trip_test','guest-messages','POST',
    {visitorId:'guest_phone_02',authorName:'',message:'Hello'},
    {'CF-Connecting-IP':'33.33.33.33'});
  assert.equal(invalid.status,400);

  const privateUnauth = await call('trip_test','guest-messages?includeHidden=1');
  assert.equal(privateUnauth.status,401);
  const moderateUnauth = await call('trip_test','guest-messages/moderate','POST',
    {messageId:saved.id,action:'hide'});
  assert.equal(moderateUnauth.status,401);
  const hide = await call('trip_test','guest-messages/moderate','POST',
    {messageId:saved.id,action:'hide'}, { Authorization: 'Bearer ' + ownerToken });
  assert.equal(hide.status,200);
  assert.deepEqual((await (await call('trip_test','guest-messages')).json()).messages, []);
  const hidden = await call('trip_test','guest-messages?includeHidden=1','GET',undefined,
    {Authorization:'Bearer ' + ownerToken});
  assert.equal(hidden.status,200);
  assert.equal((await hidden.json()).messages[0].hidden,true);
  const unhide = await call('trip_test','guest-messages/moderate','POST',
    {messageId:saved.id,action:'unhide'}, { Authorization: 'Bearer ' + ownerToken });
  assert.equal(unhide.status,200);
  assert.equal((await (await call('trip_test','guest-messages')).json()).messages.length,1);
  const remove = await call('trip_test','guest-messages/moderate','POST',
    {messageId:saved.id,action:'delete'}, { Authorization: 'Bearer ' + ownerToken });
  assert.equal(remove.status,200);
  assert.deepEqual((await (await call('trip_test','guest-messages')).json()).messages,[]);
  await call('trip_test','guest-messages/moderate','POST',
    {messageId:saved.id,action:'unhide'}, { Authorization: 'Bearer ' + ownerToken });
  assert.deepEqual((await (await call('trip_test','guest-messages')).json()).messages,[],
    'Deleting a message must be irreversible even if unhidden later');

  // The public feed must be active to accept a new guest message.
  feedStore.set('live_feeds/trip_test', { fields: { status: { stringValue: 'disabled' } } });
  const inactive = await call('trip_test','guest-messages','POST',
    { visitorId:'guest_phone_03',authorName:'Luca', message:'Hi' }, {'CF-Connecting-IP':'44.44.44.44'});
  assert.equal(inactive.status,404);
  console.log('LIVE GUEST D1: PASS — guest without login, persistence, second viewer, privacy, limits, moderation, STOP feed, no production changes');
}
main().catch(e => { console.error(e); process.exit(1); });
