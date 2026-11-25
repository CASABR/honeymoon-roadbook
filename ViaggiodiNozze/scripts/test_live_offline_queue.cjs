const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  const root = path.resolve(__dirname, '..');
  // Mock browser localStorage + window events
  const store = new Map();
  const listeners = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  globalThis.window = {
    addEventListener: (t, fn) => { listeners.set(t, fn); },
    removeEventListener: (t) => { listeners.delete(t); },
    dispatchEvent: (ev) => { const fn = listeners.get(ev.type); if (fn) fn(ev); },
  };

  const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let mod;
  try {
    mod = await vite.ssrLoadModule('/src/utils/liveOfflineQueue.ts');
  } finally {
    await vite.close();
  }

  const {
    enqueueLiveOfflineItem,
    loadLiveOfflineQueue,
    removeLiveOfflineItem,
    flushLiveOfflineQueue,
  } = mod;

  // 1. Enqueue guest_message + photo_comment + diary_message offline for Owner/Copilota
  const q1 = enqueueLiveOfflineItem({
    kind: 'guest_message',
    tripId: 'trip_synth',
    uid: 'owner_uid',
    authorName: 'Nunzio',
    text: 'Messaggio offline',
    replyTo: { id: 'd1_abc', authorName: 'Ospite', preview: 'Ciao!' },
  });
  const q2 = enqueueLiveOfflineItem({
    kind: 'photo_comment',
    tripId: 'trip_synth',
    uid: 'owner_uid',
    authorName: 'Nunzio',
    text: 'Commento offline',
    photoId: 'upd_1',
  });
  const q3 = enqueueLiveOfflineItem({
    kind: 'diary_message',
    tripId: 'trip_synth',
    uid: 'owner_uid',
    authorName: 'Sposi',
    text: 'Da cancellare',
  });
  assert.equal(loadLiveOfflineQueue('trip_synth').length, 3);

  // 2. Cancel q3 before reconnect
  removeLiveOfflineItem(q3.id);
  assert.equal(loadLiveOfflineQueue('trip_synth').length, 2);

  // 3. Offline flush must NOT send
  const sentIds = [];
  const offCount = await flushLiveOfflineQueue({
    tripId: 'trip_synth',
    currentUid: 'owner_uid',
    isOnline: false,
    verifyPermission: async () => true,
    sendItem: async (item) => { sentIds.push(item.id); },
  });
  assert.equal(offCount, 0);
  assert.equal(sentIds.length, 0);

  // 4. Online concurrent flushes must NOT duplicate (single-flight lock)
  const [c1, c2] = await Promise.all([
    flushLiveOfflineQueue({
      tripId: 'trip_synth',
      currentUid: 'owner_uid',
      isOnline: true,
      verifyPermission: async () => true,
      sendItem: async (item) => {
        await new Promise(r => setTimeout(r, 25));
        sentIds.push(item.id);
      },
    }),
    flushLiveOfflineQueue({
      tripId: 'trip_synth',
      currentUid: 'owner_uid',
      isOnline: true,
      verifyPermission: async () => true,
      sendItem: async (item) => { sentIds.push(item.id); },
    }),
  ]);
  assert.equal(c1, 2);
  assert.equal(c2, 2);
  assert.deepEqual(sentIds, [q1.id, q2.id], 'Nessuna duplicazione durante flush concorrenti');
  assert.equal(loadLiveOfflineQueue('trip_synth').length, 0);

  // 5. Revoked permissions must drop queued items without sending
  enqueueLiveOfflineItem({
    kind: 'guest_message',
    tripId: 'trip_synth',
    uid: 'revoked_uid',
    authorName: 'ExCopilota',
    text: 'Non deve partire',
  });
  const revokedSent = [];
  const cRevoked = await flushLiveOfflineQueue({
    tripId: 'trip_synth',
    currentUid: 'revoked_uid',
    isOnline: true,
    verifyPermission: async () => false,
    sendItem: async (item) => { revokedSent.push(item.id); },
  });
  assert.equal(cRevoked, 0);
  assert.equal(revokedSent.length, 0);
  assert.equal(loadLiveOfflineQueue('trip_synth').length, 0);

  console.log('✓ [PASS] Coda offline Owner/Copilota: persistenza, annullamento, verifica permessi e anti-duplicazione');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
