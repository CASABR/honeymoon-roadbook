// Synthetic reproduction test for Owner -> External Guest LIVE photo visibility.
// Uses isolated in-memory SQLite + KV double + mocked Firebase REST/Firestore + real Chromium JPEG compression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'cloudflare/houniai-worker');
const origin = 'https://casabr.github.io';
const base = 'https://photos.test';
const project = 'demo-live-photos';

const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const makeToken = (uid, provider = 'google.com') =>
  `${b64({ alg: 'RS256' })}.${b64({
    sub: uid,
    aud: project,
    iss: `https://securetoken.google.com/${project}`,
    firebase: { sign_in_provider: provider }
  })}.fixture`;

const ownerToken = makeToken('owner-synth');
const posts = new Map();
const fields = data => Object.fromEntries(
  Object.entries(data).map(([k, v]) => [
    k,
    typeof v === 'number'
      ? { integerValue: String(v) }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : { stringValue: String(v) }
  ])
);

const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  url = String(url);
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
    const body = JSON.parse(options.body || '{}');
    const uid = body.idToken === ownerToken ? 'owner-synth' : null;
    return Response.json(uid ? { users: [{ localId: uid, disabled: false }] } : { error: 'invalid' }, { status: uid ? 200 : 401 });
  }
  if (url.startsWith('https://firestore.googleapis.com/')) {
    const p = decodeURIComponent(url.split('/documents/')[1] || '');
    if (p === 'trips/synth-trip') return Response.json({ fields: fields({ ownerUid: 'owner-synth', title: 'Viaggio Sintetico' }) });
    if (posts.has(p)) return Response.json({ fields: fields(posts.get(p)) });
    return Response.json({}, { status: 404 });
  }
  throw new Error('Unexpected external network call: ' + url);
};

function createWorkerFixture(enabled) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(workerDir, 'migrations/0003_live_photos.sql'), 'utf8'));
  const database = {
    withSession(mode) { assert.equal(mode, 'first-primary'); return this; },
    prepare(query) {
      let values = [];
      return {
        bind(...v) { values = v; return this; },
        async first() { return sql.prepare(query).get(...values) || null; },
        async run() {
          const result = sql.prepare(query).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
    }
  };
  const kvStore = new Map();
  const kv = {
    async put(k, v) { kvStore.set(k, Uint8Array.from(v)); },
    async get(k) { const v = kvStore.get(k); return v ? Uint8Array.from(v).buffer : null; },
    async delete(k) { kvStore.delete(k); }
  };
  return {
    sql,
    kvStore,
    env: {
      LIVE_PHOTOS_ENABLED: enabled ? 'true' : 'false',
      LIVE_PHOTOS_FREE_PLAN_CONFIRMED: enabled ? 'true' : 'false',
      LIVE_PHOTOS: kv,
      RATE_LIMITS: database,
      ALLOWED_ORIGIN: origin,
      FIREBASE_PROJECT_ID: project,
      FIREBASE_WEB_API_KEY: 'fixture-only'
    }
  };
}

function loadTs(source, deps = {}, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(
    source.replaceAll('import.meta.env', '({DEV:false,VITE_LIVE_PHOTOS_WORKER_URL:"https://photos.test"})'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(js, {
    exports,
    require: id => {
      assert.ok(id in deps, 'Unexpected import ' + id);
      return deps[id];
    },
    console, URL, Blob, AbortSignal, Date, setTimeout, clearTimeout, ...globals
  });
  return exports;
}

(async () => {
  const { handleRequest } = await import(pathToFileURL(path.join(workerDir, 'src/index.js')).href);
  let jpeg;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<body></body>' }));
    await page.goto(origin);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/livePhotoImage.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const res = await page.evaluate(async code => {
      const exports = {};
      new Function('exports', 'require', code)(exports, () => ({
        dataUrlToBlob: s => {
          const [h, b] = s.split(',');
          return new Blob([Uint8Array.from(atob(b), c => c.charCodeAt(0))], { type: h.match(/:(.*?);/)[1] });
        }
      }));
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#336699';
      ctx.fillRect(0, 0, 640, 480);
      const raw = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const compressed = await exports.compressLivePhoto(raw);
      return { bytes: Array.from(new Uint8Array(await compressed.arrayBuffer())) };
    }, code);
    jpeg = Uint8Array.from(res.bytes);
  } finally {
    await browser.close();
  }

  // Case 1: Repro current production state (LIVE_PHOTOS_ENABLED='false')
  {
    const f = createWorkerFixture(false);
    const auth = { currentUser: { uid: 'owner-synth', isAnonymous: false, getIdToken: async () => ownerToken } };
    const storageSvc = loadTs(
      fs.readFileSync(path.join(root, 'src/services/liveStorageService.ts'), 'utf8'),
      {
        '../firebase': { auth },
        '../config/freeArchitecture': { HOUNIAI_WORKER_URL: base },
        '../utils/livePhotoImage': { MAX_COMPRESSED_LIVE_BYTES: 512000, compressLivePhoto: async () => new Blob([jpeg], { type: 'image/jpeg' }) },
        '../utils/fileAttachment': {}
      },
      { fetch: async (u, o) => handleRequest(new Request(u, { ...o, headers: { ...o.headers, Origin: origin, 'CF-Connecting-IP': '192.0.2.10' } }), f.env) }
    );
    await assert.rejects(
      storageSvc.uploadLivePhoto('synth-trip', new Blob([jpeg]), undefined, 'owner-synth'),
      /Foto LIVE non ancora attivate\. La foto resta sul dispositivo\./
    );
    assert.equal(f.kvStore.size, 0);
    assert.equal(posts.size, 0);
    console.log('PASS 1: Repro 503 confirmed — Worker disabled leaves photo only on Owner device, zero guest posts');
    f.sql.close();
  }

  // Case 2: Verify Owner -> Publish -> External Guest flow when Worker is active, and verify private isolation
  {
    const f = createWorkerFixture(true);
    const auth = { currentUser: { uid: 'owner-synth', isAnonymous: false, getIdToken: async () => ownerToken } };
    const workerFetch = async (u, o = {}) => handleRequest(
      new Request(u, { ...o, headers: { ...(o.headers || {}), Origin: origin, 'CF-Connecting-IP': '192.0.2.11' } }),
      f.env
    );
    const storageSvc = loadTs(
      fs.readFileSync(path.join(root, 'src/services/liveStorageService.ts'), 'utf8'),
      {
        '../firebase': { auth },
        '../config/freeArchitecture': { HOUNIAI_WORKER_URL: base },
        '../utils/livePhotoImage': { MAX_COMPRESSED_LIVE_BYTES: 512000, compressLivePhoto: async () => new Blob([jpeg], { type: 'image/jpeg' }) },
        '../utils/fileAttachment': {}
      },
      { fetch: workerFetch }
    );
    const db = {};
    const ref = (...parts) => ({ path: parts.join('/'), id: parts.at(-1) });
    const firestoreMock = {
      collection: (_db, ...parts) => ref(...parts),
      doc: (parent, ...parts) => (parts.length ? ref(...parts) : ref(parent.path, 'post-synth-1')),
      getDoc: async r => ({ exists: () => true, data: () => (r.path === 'trips/synth-trip' ? { ownerUid: 'owner-synth', title: 'Viaggio Sintetico' } : posts.get(r.path) || {}) }),
      writeBatch: () => {
        const ops = [];
        return {
          set: (r, data) => ops.push([r, data]),
          commit: async () => { for (const [r, data] of ops) posts.set(r.path, data); }
        };
      },
      updateDoc: async (r, data) => posts.set(r.path, { ...posts.get(r.path), ...data }),
      query: (...args) => ({ args }),
      where: (...args) => ({ where: args }),
      orderBy: (...args) => ({ orderBy: args }),
      limit: n => ({ limit: n }),
      onSnapshot: () => () => {}
    };
    const liveSvc = loadTs(
      fs.readFileSync(path.join(root, 'src/services/liveService.ts'), 'utf8'),
      {
        'firebase/firestore': firestoreMock,
        '../firebase': { auth, db },
        '../config/featureFlags': { FEATURE_FLAGS: {} },
        './liveStorageService': storageSvc,
        '../utils/liveNextTransport': { deriveNextPublicTransport: () => null }
      }
    ).liveService;

    const uploaded = await storageSvc.uploadLivePhoto('synth-trip', new Blob([jpeg]), undefined, 'owner-synth');
    // Before publish, guest GET must fail (404)
    const beforePub = await workerFetch(uploaded.downloadUrl, { method: 'GET' });
    assert.equal(beforePub.status, 404);

    // Owner publishes LIVE update -> confirms photo on Worker
    const postId = await liveSvc.publishToLive('synth-trip', {
      title: 'Tramonto sintetico',
      text: '',
      photoUrl: uploaded.downloadUrl
    });
    assert.equal(postId, 'post-synth-1');

    // External guest (no auth token) reads published photo
    const guestGet = await workerFetch(uploaded.downloadUrl, { method: 'GET' });
    assert.equal(guestGet.status, 200);
    assert.equal(guestGet.headers.get('Content-Type'), 'image/jpeg');

    // Verify no private base64/attachments leaked into Firestore live_feeds
    const serializedPost = JSON.stringify(posts.get('live_feeds/synth-trip/updates/post-synth-1'));
    assert.ok(!serializedPost.includes('data:image/'));
    assert.ok(!serializedPost.includes('private'));

    // Verify LiveEditorialExperience shows pendingSync badge only to internal Owner, never to external guest
    const editorialSrc = fs.readFileSync(path.join(root, 'src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
    assert.ok(editorialSrc.includes('latestPhoto.pendingSync && !props.isExternal'));
    assert.ok(editorialSrc.includes('Solo sul dispositivo'));

    console.log('PASS 2: Active Worker Owner -> Publish -> External Guest 200 JPEG + private isolation verified');
    f.sql.close();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = realFetch;
});
