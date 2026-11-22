const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const { preview } = require('vite');
const { chromium } = require('playwright');
const { initializeApp } = require('firebase/app');
const {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore,
  orderBy, query, setDoc, updateDoc, where
} = require('firebase/firestore');

const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'cloudflare/houniai-worker');
const origin = 'https://casabr.github.io';
const projectId = 'demo-hounigo-comments';

(async () => {
  // 1. Static checks for 4-tab layout (icon above, full label below, no truncation, generic header, diary separation)
  const editorialSrc = fs.readFileSync(path.join(root, 'src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
  assert.ok(editorialSrc.includes("? 'Il nostro viaggio'"), 'Header fallback must be Il nostro viaggio');
  assert.ok(!editorialSrc.includes("? 'Diario di viaggio'"), 'Diario di viaggio must not be used in header');
  assert.ok(editorialSrc.includes('flex min-h-12 flex-col items-center justify-center gap-0.5'), 'Tabs must stack icon above label');
  assert.ok(editorialSrc.includes('whitespace-nowrap text-[11px] sm:text-xs font-bold leading-tight'), 'Tab labels must never truncate');
  assert.ok(editorialSrc.includes('const diaryUpdates = useMemo(') && editorialSrc.includes('!u.photoUrl || !u.photoUrl.trim()'), 'Diario must exclude photo posts');
  console.log('PASS 1: Tab layout, generic header, and Foto/Diario separation verified');

  // 2. Worker comment endpoint security (2 separate photos, XSS rejection, Origin check, D1 5/min antispam)
  const { handleRequest } = await import(pathToFileURL(path.join(workerDir, 'src/index.js')).href);
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(workerDir, 'migrations/0003_live_photos.sql'), 'utf8'));
  const database = {
    withSession() { return this; },
    prepare(q) {
      let vals = [];
      return {
        bind(...v) { vals = v; return this; },
        async first() { return sql.prepare(q).get(...vals) || null; },
        async run() { const r = sql.prepare(q).run(...vals); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
    }
  };
  const emuBase = `http://127.0.0.1:8085/v1/projects/${projectId}/databases/(default)/documents`;
  const app = initializeApp({ apiKey: 'demo-key', projectId }, 'guest-comments');
  const guestDb = getFirestore(app);
  connectFirestoreEmulator(guestDb, '127.0.0.1', 8085);

  const seed = async (p, fields) => {
    const r = await fetch(`${emuBase}/${p}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    assert.equal(r.ok, true);
  };

  await seed('trips/synth-c', { title: { stringValue: 'Viaggio' }, ownerUid: { stringValue: 'owner-1' } });
  await seed('trips/synth-c/private_credentials/priv-1', { secret: { stringValue: 'PNR-999' } });
  await seed('live_feeds/synth-c', { title: { stringValue: 'Viaggio' }, status: { stringValue: 'in_corso' }, lastUpdateAt: { integerValue: String(Date.now()) } });
  await seed('live_feeds/synth-c/updates/photo-1', {
    title: { stringValue: 'Foto 1' }, text: { stringValue: '' },
    photoUrl: { stringValue: 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth-c/' + 'a'.repeat(48) },
    publicSchemaVersion: { integerValue: '2' }, timestamp: { integerValue: '1000' }
  });
  await seed('live_feeds/synth-c/updates/photo-2', {
    title: { stringValue: 'Foto 2' }, text: { stringValue: '' },
    photoUrl: { stringValue: 'https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth-c/' + 'b'.repeat(48) },
    publicSchemaVersion: { integerValue: '2' }, timestamp: { integerValue: '2000' }
  });

  // Patch global.fetch ONLY for firestore.googleapis.com calls from Worker -> redirect to Firestore Emulator
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://firestore.googleapis.com/v1/projects/')) {
      const target = u.replace(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`, emuBase);
      return realFetch(target, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer owner' } });
    }
    return realFetch(url, opts);
  };

  try {
    const env = {
      LIVE_PHOTOS_ENABLED: 'true',
      LIVE_PHOTOS_FREE_PLAN_CONFIRMED: 'true',
      LIVE_PHOTOS: {},
      RATE_LIMITS: database,
      ALLOWED_ORIGIN: origin,
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_SERVICE_ACCOUNT_EMAIL: 'sa@demo.iam.gserviceaccount.com',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: 'fixture'
    };
    const { handleLivePhotoRequest } = await import(pathToFileURL(path.join(workerDir, 'src/livePhotos.js')).href);
    const sec = {
      verifyFirebaseIdentity: async () => null,
      assertEditor: async () => false,
      getFirestoreDocument: async (p, t) => {
        const r = await realFetch(`${emuBase}/${p}`, { headers: { Authorization: `Bearer ${t}` } });
        return r.ok ? r.json() : null;
      },
      getServiceAccountToken: async () => 'owner'
    };

    const postComment = (body, ip = '192.0.2.50', org = origin) =>
      handleLivePhotoRequest(new Request('https://worker.test/v1/live-photos/synth-c/comments', {
        method: 'POST',
        headers: { Origin: org, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body)
      }), env, sec);

    // Reject XSS & evil Origin
    assert.equal((await postComment({ postId: 'photo-1', authorName: 'Bob', text: '<script>alert(1)</script>' })).status, 400);
    assert.equal((await postComment({ postId: 'photo-1', authorName: 'Bob', text: 'Ciao' }, '192.0.2.50', 'https://evil.test')).status, 403);

    // Guest posts separate comments on photo-1 and photo-2
    const c1 = await postComment({ postId: 'photo-1', authorName: 'Zia Anna', text: 'Bellissima foto 1!' }, '192.0.2.51');
    assert.equal(c1.status, 201, await c1.clone().text());
    const c1Json = await c1.json();
    const c2 = await postComment({ postId: 'photo-2', authorName: 'Marco', text: 'Stupenda foto 2!' }, '192.0.2.52');
    assert.equal(c2.status, 201);

    // Antispam: 6th comment in 1 min from same IP -> 429
    for (let i = 0; i < 4; i++) assert.equal((await postComment({ postId: 'photo-1', authorName: 'Spam', text: 'Msg ' + i }, '192.0.2.51')).status, 201);
    assert.equal((await postComment({ postId: 'photo-1', authorName: 'Spam', text: 'Too many' }, '192.0.2.51')).status, 429);

    // Guest reads separated comments from Firestore Emulator (survives reload)
    const q1 = query(collection(guestDb, 'live_feeds/synth-c/updates/photo-1/comments'), where('publicSchemaVersion', '==', 2), where('deleted', '==', false), orderBy('createdAt', 'asc'));
    const q2 = query(collection(guestDb, 'live_feeds/synth-c/updates/photo-2/comments'), where('publicSchemaVersion', '==', 2), where('deleted', '==', false), orderBy('createdAt', 'asc'));
    const s1 = await getDocs(q1);
    const s2 = await getDocs(q2);
    assert.ok(s1.docs.some(d => d.data().text === 'Bellissima foto 1!'));
    assert.equal(s1.docs.some(d => d.data().text === 'Stupenda foto 2!'), false);
    assert.equal(s2.size, 1);
    assert.equal(s2.docs[0].data().text, 'Stupenda foto 2!');

    // Guest CANNOT write directly to Firestore comments or read private_credentials
    let directDenied = false;
    try {
      await setDoc(doc(guestDb, 'live_feeds/synth-c/updates/photo-1/comments/unauth'), { authorName: 'X', text: 'Y', createdAt: 1, deleted: false, publicSchemaVersion: 2 });
    } catch { directDenied = true; }
    assert.equal(directDenied, true, 'Unauthenticated direct Firestore comment write must be denied');

    let privDenied = false;
    try { await getDoc(doc(guestDb, 'trips/synth-c/private_credentials/priv-1')); } catch { privDenied = true; }
    assert.equal(privDenied, true);

    // Owner soft-deletes comment c1 -> disappears from guest query
    await realFetch(`${emuBase}/live_feeds/synth-c/updates/photo-1/comments/${c1Json.id}?updateMask.fieldPaths=deleted&updateMask.fieldPaths=text`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { deleted: { booleanValue: true }, text: { stringValue: '[Rimosso]' } } })
    });
    const s1After = await getDocs(q1);
    assert.equal(s1After.docs.some(d => d.id === c1Json.id), false, 'Deleted comment must disappear for guest');
    console.log('PASS 2: Photo comments separated per photo, XSS/antispam enforced, direct Firestore write blocked, Owner delete verified');
  } finally {
    global.fetch = realFetch;
    sql.close();
  }

  // 3. Playwright responsive check for 4 tabs at 320px, 393px, 768px (iPad), 1280px (Desktop)
  const port = 4187;
  const server = await preview({ root, configFile: false, base: '/honeymoon-roadbook/', preview: { host: '127.0.0.1', port, strictPort: true } });
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' });
    await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/honeymoon-roadbook/?live=1&tripId=synth-c&view=live`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="live-tab-mappa"]', { timeout: 8000 });

    for (const vp of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(150);
      for (const [id, label] of [['mappa', 'Mappa'], ['foto', 'Foto'], ['diario', 'Diario'], ['messaggi', 'Messaggi']]) {
        const txt = (await page.locator(`[data-testid="live-tab-${id}"]`).innerText()).trim();
        assert.ok(txt.includes(label), `Tab ${id} truncated or missing label at ${vp.width}: ${txt}`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false, `Horizontal overflow at ${vp.width}x${vp.height}`);
    }
    const headerTxt = await page.locator('[data-testid="live-section-header"] h1').innerText();
    assert.equal(headerTxt.trim(), 'Il nostro viaggio');
    await ctx.close();
    console.log('PASS 3: Playwright 4-tab full labels & zero overflow verified at 320px, 393px, 768px (iPad), 1280px');
  } finally {
    await browser.close();
    server.httpServer.closeAllConnections?.();
    await new Promise(resolve => { server.httpServer.close(() => resolve()); setTimeout(resolve, 500); });
  }
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
