const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function compile(file) {
  return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.DEV', 'false'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}
function load(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require: id => {
    if (!(id in dependencies)) throw Error('Unexpected dependency: ' + id);
    return dependencies[id];
  }, console, structuredClone, setTimeout, ...globals });
  return exports;
}
(async () => {
  const storage = new Map();
  const auth = { currentUser: { uid: 'owner-original', isAnonymous: false } };
  const navigator = { onLine: true };
  const globals = { navigator, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    window: { dispatchEvent() {} }, CustomEvent: class {} };
  const identity = load('src/utils/useAuthIdentity.ts', {
    react: {}, 'firebase/auth': {}, 'firebase/firestore': {}, '../firebase': { auth, db: {} },
    './tripConfig': { getTripConfig: () => ({ id: 'synthetic-A' }) }
  }, globals);
  identity.setAuthoritativeCloudRole('owner');
  assert.equal(identity.isCloudAuthorized('synthetic-A'), true);
  assert.equal(identity.isCloudAuthorized('synthetic-B'), false);
  auth.currentUser = { uid: 'different', isAnonymous: false };
  assert.equal(identity.isCloudAuthorized('synthetic-A'), false);
  auth.currentUser = { uid: 'owner-original', isAnonymous: true };
  assert.equal(identity.isCloudAuthorized('synthetic-A'), false);
  auth.currentUser.isAnonymous = false;
  navigator.onLine = false;
  assert.equal(identity.isCloudAuthorized('synthetic-A'), false);
  navigator.onLine = true;
  identity.revokeTripAuth('synthetic-A');
  assert.equal(identity.isCloudAuthorized('synthetic-A'), false);
  console.log('PASS: authorization bound to UID, trip, online status and revocation');
  let popupError = null, redirects = 0;
  const googleOwner = { uid: 'owner-original', isAnonymous: false };
  const accounts = load('src/services/accountService.ts', {
    'firebase/auth': { GoogleAuthProvider: class { setCustomParameters() {} }, signInWithPopup: async () => {
      if (popupError) throw popupError; auth.currentUser = googleOwner; return { user: googleOwner };
    }, signInWithRedirect: async () => { redirects++; }, getRedirectResult: async () => ({ user: googleOwner }) },
    'firebase/firestore': {}, '../firebase': { auth, db: {} }, '../utils/tripDiscovery': {},
    './userAccessService': { recordUserAccess: async () => {} }
  }, globals);
  auth.currentUser = { uid: 'anonymous-device', isAnonymous: true };
  assert.equal((await accounts.loginWithGoogle()).user.uid, 'owner-original');
  popupError = { code: 'auth/popup-blocked' };
  assert.equal((await accounts.loginWithGoogle()).code, 'auth/redirect-started');
  assert.equal(redirects, 1);
  assert.equal((await accounts.checkPendingRedirectResult()).user.uid, 'owner-original');
  console.log('PASS: mocked popup and redirect recover original Google Owner UID');
  const queue = load('src/storage/localMutationQueue.ts', {});
  storage.delete('houni_revoked_trip_synthetic-A');
  identity.setAuthoritativeCloudRole('owner');
  let deny = true, writes = 0, changeUidAfterPublicWrite = false;
  const splitter = load('src/utils/securityDataSplitter.ts', {});
  const { SyncService } = load('src/storage/syncService.ts', {
    'firebase/firestore': { doc: (...parts) => parts.slice(1).join('/'), setDoc: async () => {
      writes++; if (deny) throw Object.assign(Error('permission-denied'), {code:'permission-denied'});
      if (changeUidAfterPublicWrite) auth.currentUser = {uid:'other',isAnonymous:false};
    }, deleteDoc: async () => { writes++; if (deny) throw Error('permission-denied'); } },
    '../firebase': { auth, db: {} }, './indexedDB': { STORES: { SETTINGS:'settings' }, idbGet: async () => null },
    './storageService': {}, '../utils/tripDates': { normalizeTimestamp: v=>Number(v)||0 },
    '../utils/useAuthIdentity': identity, '../services/pushNotificationService': {},
    '../utils/securityDataSplitter': splitter, './localMutationQueue': queue
  });
  const sync = Object.create(SyncService.prototype);
  sync.tripId = 'synthetic-A'; sync.isDestroyed = false; sync.emitSyncStatus = () => {};
  const payload = { id:'shared', cost:'1200', depositPaid:'300', bookingCode:'voucher', attachments:[{id:'v',data:'retained'}] };
  const opts = {mutationId:'edit-1'};
  identity.setAuthoritativeCloudRole('unverified');
  await sync.pushToCloud('alloggi','save',payload,opts);
  assert.equal(writes,0);
  assert.deepEqual(JSON.parse(JSON.stringify((await queue.getPendingMutations('synthetic-A'))[0].data)),payload);
  identity.setAuthoritativeCloudRole('owner');
  await sync.flushPendingPushes();
  assert.ok(writes > 0);
  assert.equal((await queue.getPendingMutations('synthetic-A')).length,1);
  deny = false; changeUidAfterPublicWrite = true;
  await sync.flushPendingPushes();
  assert.equal((await queue.getPendingMutations('synthetic-A')).length,1,'UID changed during write must retain private payload');
  auth.currentUser = googleOwner; changeUidAfterPublicWrite = false;
  identity.setAuthoritativeCloudRole('owner');
  await sync.flushPendingPushes();
  assert.equal((await queue.getPendingMutations('synthetic-A')).length,0);
  console.log('PASS: real SyncService preserves edits on anonymous transition, denied rules and UID change during write; authorized retry clears only after success');
  const queueCode = compile('src/storage/localMutationQueue.ts');
  const folder = fs.mkdtempSync(path.join(root, '.p0-queue-test-'));
  const htmlPath = path.join(folder, 'test.html');
  const browserTest = async () => {
    const ok = (v, msg) => { if (!v) throw Error(msg); };
    const open = version => new Promise((resolve,reject) => {
      const req = indexedDB.open('HounigoLocalQueueDB', version);
      req.onupgradeneeded = () => req.result.createObjectStore('pending_mutations', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const legacy = { id: 'alloggi_shared', tripId: 'synthetic-A', entityType: 'alloggi', action: 'save',
      data: { id: 'shared', cost: '1200', depositPaid: '300', deadline: '2027-01-01', attachments: [{ id: 'voucher', data: 'preserved' }] },
      mutationId: 'legacy', timestamp: 123 };
    const db = await open(1);
    await new Promise((resolve,reject) => { const tx = db.transaction('pending_mutations','readwrite'); tx.objectStore('pending_mutations').put(legacy); tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
    let rows = await exports.getPendingMutations('synthetic-A');
    ok(rows.length === 1 && JSON.stringify(rows[0].data) === JSON.stringify(legacy.data) && rows[0].timestamp === 123, 'lossless legacy migration');
    await exports.savePendingMutation({ ...legacy, tripId: 'synthetic-B', mutationId: 'B' });
    ok((await exports.getPendingMutations()).length === 2, 'two trips same entity ID');
    ok(await exports.hasPendingMutation('synthetic-A', 'alloggio', 'shared'), 'normalized lookup A');
    await exports.removePendingMutation('synthetic-B', 'alloggi', 'shared', { ...legacy, mutationId: 'old' });
    ok((await exports.getPendingMutations('synthetic-B')).length === 1, 'stale acknowledgement preserved newer edit');
    // Reload the module against the same persistent database, as after closing a PWA.
    const fresh = {};
    new Function('exports', QUEUE_CODE)(fresh);
    rows = await fresh.getPendingMutations();
    ok(rows.length === 2, 'reopening persisted edits');
    await fresh.removePendingMutation('synthetic-B', 'alloggio', 'shared');
    ok((await fresh.getPendingMutations('synthetic-A')).length === 1, 'removal scoped to trip');
    await fresh.savePendingMutation({ ...legacy, tripId: 'synthetic-B', action: 'delete' });
    await fresh.clearPendingMutations('synthetic-A');
    ok((await fresh.getPendingMutations('synthetic-B'))[0].action === 'delete', 'clear scoped to trip and delete preserved');
    ok(exports.mutationQueueKey('a_b','note','c') !== exports.mutationQueueKey('a','note','b_c'), 'delimiter safety');
    const deniedWindow = { indexedDB: { open() { throw Error('storage denied'); } } };
    const failing = {};
    new Function('exports','window',QUEUE_CODE)(failing,deniedWindow);
    let rejected = false;
    try { await failing.savePendingMutation(legacy); } catch { rejected = true; }
    ok(rejected, 'storage failures must be visible');
    await new Promise((resolve,reject) => { const req=indexedDB.deleteDatabase('HounigoLocalQueueDB'); req.onsuccess=resolve; req.onerror=reject; });
    const old = await open(1);
    await new Promise((resolve,reject) => { const tx=old.transaction('pending_mutations','readwrite'); const store=tx.objectStore('pending_mutations'); store.put(legacy); store.put({...legacy,id:'alloggio_shared',entityType:'alloggio',mutationId:'conflict'}); tx.oncomplete=resolve; tx.onabort=reject; }); old.close();
    rejected = false;
    try { await fresh.getPendingMutations(); } catch { rejected = true; }
    ok(rejected,'ambiguous migration aborts');
    const retained = await open(1);
    const originals = await new Promise(resolve => { const req=retained.transaction('pending_mutations').objectStore('pending_mutations').getAll(); req.onsuccess=()=>resolve(req.result); });
    retained.close();
    ok(originals.length===2 && originals.some(r=>r.mutationId==='conflict') && originals.some(r=>r.mutationId==='legacy'), 'aborted migration preserves every original');
    document.body.textContent = 'PASS: real IndexedDB migration, payloads, isolation, stale ACK, reopen, delete';
  };
  fs.writeFileSync(htmlPath, '<body>RUNNING<script>const exports={}; const QUEUE_CODE=' + JSON.stringify(queueCode) + '; new Function("exports",QUEUE_CODE)(exports); (' + browserTest.toString() + ')().catch(e=>document.body.textContent="FAIL: "+e.stack);</script>');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-software-rasterizer', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + path.join(folder,'profile'), 'file:///' + htmlPath.replaceAll('\\','/')], { windowsHide: true, stdio: 'ignore' });
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  let socket;
  try {
    const portFile = path.join(folder,'profile','DevToolsActivePort');
    for (let i=0; !fs.existsSync(portFile) && i<200; i++) await pause();
    const port = fs.readFileSync(portFile,'utf8').split('\n')[0].trim();
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 1; const pending = new Map();
    socket.onmessage = event => { const data = JSON.parse(event.data); if (pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); } };
    const evaluate = expression => new Promise(resolve => { const id=nextId++; pending.set(id,resolve); socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}})); });
    let body = '';
    for (let i=0;i<200;i++) {
      const response = await evaluate('document.body?.innerText');
      body = response.result?.result?.value || '';
      if (body.startsWith('PASS:') || body.startsWith('FAIL:')) break;
      await pause();
    }
    assert.ok(body.startsWith('PASS:'), body.slice(0,2000));
    console.log(body);
  } finally {
    socket?.close(); browser.kill();
    await new Promise(resolve => browser.once('exit',resolve));
  }
  // Only remove this test's resolved temporary directory inside the project.
  assert.equal(path.dirname(folder), root);
  fs.rmSync(folder, { recursive: true, force: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
