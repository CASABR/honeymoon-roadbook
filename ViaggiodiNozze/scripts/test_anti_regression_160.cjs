const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTs(file, deps = {}, globals = {}, dev = false) {
  const exports = {};
  const source = fs
    .readFileSync(path.join(root, file), 'utf8')
    .replaceAll('import.meta.env.DEV', String(dev))
    .replaceAll('import.meta.env', `({DEV:${dev},PROD:${!dev}})`);
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: id => {
      if (!(id in deps)) throw new Error(`Unexpected import ${id} in ${file}`);
      return deps[id];
    },
    console: { log() {}, warn() {}, error() {} },
    Date,
    structuredClone,
    setTimeout,
    clearTimeout,
    AbortController,
    Blob,
    atob,
    ...globals,
  });
  return exports;
}

class CustomEvt extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
}

function makeGlobals(online = true) {
  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear(),
  };
  const win = new EventTarget();
  win.localStorage = localStorage;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  const nav = { onLine: online };
  return {
    storage,
    globals: { localStorage, window: win, navigator: nav, CustomEvent: CustomEvt, Event },
    setOnline: v => { nav.onLine = v; },
  };
}

function makeIdb(seedSettings = {}, seedData = {}) {
  const stores = {
    GIORNI: 'giorni', ATTIVITA: 'attivita', ALLOGGI: 'alloggi', TRASPORTI: 'trasporti',
    DOCUMENTI: 'documenti', TAPPE: 'tappe', RISTORANTI: 'ristoranti', SHOPPING: 'shopping',
    SPESE: 'spese', NOTE: 'note', BAGAGLI: 'bagagli', SETTINGS: 'settings',
  };
  const db = new Map(Object.values(stores).map(c => [c, new Map()]));
  for (const [k, v] of Object.entries(seedSettings)) db.get('settings').set(k, structuredClone(v));
  for (const [col, rows] of Object.entries(seedData)) {
    for (const r of rows) db.get(col).set(r.id, structuredClone(r));
  }
  return {
    db,
    idb: {
      STORES: stores,
      idbGetAll: async c => structuredClone([...db.get(c).values()]),
      idbGet: async (c, id) => structuredClone(db.get(c).get(id)),
      idbPut: async (c, v) => { db.get(c).set(v.id, structuredClone(v)); },
      idbDelete: async (c, id) => { db.get(c).delete(id); },
    },
  };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  console.log(`PASS ${++passed}: ${name}`);
}

(async () => {
  const security = loadTs('src/utils/securityDataSplitter.ts');
  const privacy = loadTs('src/utils/livePhotoPrivacy.ts');

  await test('1. Viewer cache purge preserves session + sanitized trip config offline recovery without leaking private stores', async () => {
    const { globals } = makeGlobals(false);
    const { db, idb } = makeIdb(
      {
        device_session_backup: { id: 'device_session_backup', value: { uid: 'viewer-1', authenticated: true, tripId: '0000', role: 'viewer', updatedAt: Date.now() + 1000 } },
        trip_config_backup: { id: 'trip_config_backup', value: { id: '0000', title: 'Viaggio Reale', startDate: '2026-11-28', endDate: '2027-01-10', budgetConfig: { secret: 999 }, infoAltro: { numeriEmergenza: 'PRIVATE' } } },
        theme: { id: 'theme', value: 'dark' },
        'tombstone_alloggi_deleted-1': { id: 'tombstone_alloggi_deleted-1', value: { deletedAt: 100, timestamp: 100, entityType: 'alloggi', dataId: 'deleted-1' } },
      },
      {
        alloggi: [{ id: 'hotel-1', name: 'Hotel', cost: '120.00', pnr: 'SECRET', bookingCode: 'XYZ', updatedAt: 1 }],
        spese: [{ id: 'spesa-1', title: 'Secret expense', amount: 50 }],
        documenti: [{ id: 'doc-1', title: 'Passport.pdf' }],
      }
    );
    const authState = { currentUser: { uid: 'viewer-1', isAnonymous: false }, authStateReady: async () => {} };
    const queue = loadTs('src/storage/localMutationQueue.ts', {}, globals);
    const sync = loadTs('src/storage/syncService.ts', {
      'firebase/firestore': {},
      '../firebase': { auth: authState, db: {} },
      './indexedDB': idb,
      './storageService': { notifyDataChanged() {} },
      '../utils/tripDates': { normalizeTimestamp: x => (typeof x === 'number' ? x : 0) },
      '../utils/useAuthIdentity': { isCloudAuthorized: () => false, isTripAuthRevoked: () => false, getAuthoritativeCloudRole: () => 'viewer' },
      '../utils/tripConfig': { getTripConfig: () => ({ id: '0000' }) },
      '../services/pushNotificationService': { recordPushMutation() {} },
      '../utils/securityDataSplitter': security,
      './localMutationQueue': queue,
    }, globals);

    const svc = Object.create(sync.SyncService.prototype);
    svc.tripId = '0000';
    await svc.purgeSensitiveLocalCache();

    const sessionMod = loadTs('src/utils/deviceSession.ts', { '../storage/indexedDB': idb, '../firebase': { auth: authState } }, globals);
    const restored = await sessionMod.restorePersistedSessionFromIndexedDB();
    assert.equal(restored.isAuthenticated, true);
    assert.equal(restored.tripId, '0000');
    assert.equal(restored.role, 'viewer');

    assert.equal(db.get('settings').has('device_session_backup'), true);
    assert.equal(db.get('settings').has('trip_config_backup'), true);
    assert.equal(db.get('settings').get('trip_config_backup').value.budgetConfig, undefined);
    assert.equal(db.get('settings').get('trip_config_backup').value.infoAltro, undefined);
    assert.equal(db.get('settings').get('trip_config_backup').value.title, 'Viaggio Reale');
    assert.equal(db.get('settings').has('theme'), true);
    assert.equal(db.get('settings').has('tombstone_alloggi_deleted-1'), true);
    assert.equal(db.get('spese').size, 0);
    assert.equal(db.get('documenti').size, 0);
    assert.equal(db.get('alloggi').get('hotel-1').cost, undefined);
    assert.equal(db.get('alloggi').get('hotel-1').pnr, undefined);
  });

  await test('2. User switch and revoked access block offline session recovery and never archive prior user secrets', async () => {
    const { globals } = makeGlobals(false);
    const { db, idb } = makeIdb(
      {
        device_session_backup: { id: 'device_session_backup', value: { uid: 'user-A', authenticated: true, tripId: '0000', role: 'copilota', updatedAt: Date.now() + 1000 } },
        trip_config_backup: { id: 'trip_config_backup', value: { id: '0000', title: 'Viaggio Reale' } },
      },
      { spese: [{ id: 's1', ownerUid: 'user-A', title: 'Private User A' }] }
    );
    const authUserB = { currentUser: { uid: 'user-B', isAnonymous: false }, authStateReady: async () => {} };
    const queue = loadTs('src/storage/localMutationQueue.ts', {}, globals);
    const sessionMod = loadTs('src/utils/deviceSession.ts', { '../storage/indexedDB': idb, '../firebase': { auth: authUserB } }, globals);

    const switchedRestore = await sessionMod.restorePersistedSessionFromIndexedDB();
    assert.equal(switchedRestore.isAuthenticated, false);

    let revoked = false;
    const sync = loadTs('src/storage/syncService.ts', {
      'firebase/firestore': {},
      '../firebase': { auth: authUserB, db: {} },
      './indexedDB': idb,
      './storageService': { notifyDataChanged() {} },
      '../utils/tripDates': { normalizeTimestamp: x => (typeof x === 'number' ? x : 0) },
      '../utils/useAuthIdentity': { isCloudAuthorized: () => false, isTripAuthRevoked: () => revoked, getAuthoritativeCloudRole: () => 'viewer' },
      '../utils/tripConfig': { getTripConfig: () => ({ id: '0000' }) },
      '../services/pushNotificationService': { recordPushMutation() {} },
      '../utils/securityDataSplitter': security,
      './localMutationQueue': queue,
    }, globals);

    const svc = Object.create(sync.SyncService.prototype);
    svc.tripId = '0000';
    await svc.purgeSensitiveLocalCache();
    assert.equal(db.get('settings').has('device_session_backup'), false);
    assert.equal((await queue.getConflictBackups('0000')).length, 0);

    // Revocation for the SAME user also blocks restorePersistedSessionFromIndexedDB
    await idb.idbPut('settings', { id: 'device_session_backup', value: { uid: 'user-B', authenticated: true, tripId: '0000', role: 'viewer', updatedAt: Date.now() } });
    globals.localStorage.setItem('houni_revoked_trip_0000', 'true');
    const revokedRestore = await sessionMod.restorePersistedSessionFromIndexedDB();
    assert.equal(revokedRestore.isAuthenticated, false);
    revoked = true;
    await svc.purgeSensitiveLocalCache();
    assert.equal(db.get('settings').has('trip_config_backup'), false);
  });

  await test('3. Archived records never block Copilota 0000 activation and two simulated clients reconcile without resurrection', async () => {
    const { globals } = makeGlobals(true);
    const { db, idb } = makeIdb(
      { 'tombstone_alloggi_deleted-hotel': { id: 'tombstone_alloggi_deleted-hotel', value: { deletedAt: 500, timestamp: 500, entityType: 'alloggi', dataId: 'deleted-hotel', explicitDeleteBy: 'owner' } } },
      { alloggi: [{ id: 'hotel-1', name: 'Hotel', cost: '80.00', updatedAt: 100 }] }
    );
    const queue = loadTs('src/storage/localMutationQueue.ts', {}, globals);
    const remoteAlloggi = new Map([['hotel-1', { id: 'hotel-1', name: 'Hotel', updatedAt: 100 }]]);
    let cloudAuth = false;
    const firestoreMock = {
      collection: (_db, ...segs) => segs.join('/'),
      doc: (_db, ...segs) => segs.join('/'),
      getDocs: async pathStr => {
        const col = pathStr.split('/').pop();
        if (col === 'alloggi') {
          return { docs: [...remoteAlloggi.entries()].map(([id, data]) => ({ id, data: () => structuredClone(data) })) };
        }
        return { docs: [] };
      },
      getDoc: async pathStr => {
        const parts = pathStr.split('/');
        const id = parts[parts.length - 1];
        const col = parts[parts.length - 2];
        if (col === 'alloggi' && remoteAlloggi.has(id)) {
          return { exists: () => true, data: () => structuredClone(remoteAlloggi.get(id)) };
        }
        return { exists: () => false };
      },
      setDoc: async () => {},
      deleteDoc: async () => {},
    };
    const sync = loadTs('src/storage/syncService.ts', {
      'firebase/firestore': firestoreMock,
      '../firebase': { auth: { currentUser: { uid: 'copilot-1', isAnonymous: false } }, db: {} },
      './indexedDB': idb,
      './storageService': { notifyDataChanged() {} },
      '../utils/tripDates': { normalizeTimestamp: x => (typeof x === 'number' ? x : 0) },
      '../utils/useAuthIdentity': { isCloudAuthorized: () => cloudAuth, isTripAuthRevoked: () => false, getAuthoritativeCloudRole: () => 'copilota' },
      '../utils/tripConfig': { getTripConfig: () => ({ id: '0000' }) },
      '../services/pushNotificationService': { recordPushMutation() {} },
      '../utils/securityDataSplitter': security,
      './localMutationQueue': queue,
    }, globals);

    // Purge as Viewer -> creates archived_private_cache backup
    const svc = Object.create(sync.SyncService.prototype);
    svc.tripId = '0000';
    svc.getOperationalCollections = () => [{ fb: 'alloggi', store: 'alloggi' }];
    await svc.purgeSensitiveLocalCache();
    // Plus legacy/quarantined private_cache_copy & local_only_record
    await queue.saveConflictBackup({
      tripId: '0000', entityType: 'alloggi', dataId: 'archived-item',
      localData: { id: 'archived-item' }, serverData: null, conflictType: 'local_only_record', status: 'archived_local_only'
    });

    // Simulate Copilot offline edit equivalent to already-synced v2 marker + Copilota activation
    await queue.savePendingMutation({
      ownerUid: 'copilot-1',
      tripId: '0000',
      entityType: 'alloggi',
      action: 'save',
      data: { id: 'hotel-1', name: 'Hotel', cost: '80.00', publicSchemaVersion: 2, updatedAt: 100 },
    });
    const activation = await sync.enableCopilotBidirectionalSync('0000');
    assert.equal(activation.success, true);
    assert.equal(activation.isCloudWriteAllowed, true);
    // Tombstone remained intact across purge
    assert.equal(db.get('settings').has('tombstone_alloggi_deleted-hotel'), true);
    // Offline queue from foreign user cannot be claimed by copilot-1
    await queue.savePendingMutation({
      ownerUid: 'other-user',
      tripId: '0000',
      entityType: 'alloggi',
      action: 'save',
      data: { id: 'foreign-edit', name: 'Foreign', updatedAt: 200 },
    });
    const pendingBefore = await queue.getPendingMutations('0000');
    assert.ok(pendingBefore.some(m => m.ownerUid === 'other-user'));

    // Two-client sync roundtrip: Client A (Owner) deletes deleted-hotel (tombstone) & saves hotel-2,
    // Client B (Copilota) comes online, pulls hotel-2 cleanly, respects tombstone (zero resurrection).
    cloudAuth = true;
    remoteAlloggi.set('hotel-2', { id: 'hotel-2', name: 'Harbour Hotel', publicSchemaVersion: 2, updatedAt: 600 });
    const pullRes = await svc.syncOperationalEntities();
    assert.ok(pullRes.pulledCount >= 1);
    const localHotel2 = await idb.idbGet('alloggi', 'hotel-2');
    assert.equal(localHotel2?.name, 'Harbour Hotel');
    // Tombstoned item deleted-hotel stays deleted even if present remotely
    remoteAlloggi.set('deleted-hotel', { id: 'deleted-hotel', name: 'Zombie', createdAt: 100, updatedAt: 100 });
    await svc.syncOperationalEntities();
    assert.equal(await idb.idbGet('alloggi', 'deleted-hotel'), undefined);
  });

  await test('4. Viewer metadata keeps openingHours & publishable doc refs while isolating private fields and credentials', () => {
    const full = {
      id: 't1',
      titolo: 'Museum Walk',
      openingHours: { status: 'verified', accessType: 'attraction', weekly: { mon: '09:00-17:00' } },
      publicDocumentIds: ['public-guide-id'],
      linkedDocumentIds: ['public-guide-id', 'private-passport-id'],
      linkedDocumentId: 'private-passport-id',
      pnr: 'PNR999',
      cost: '150.00',
      depositPaid: '50.00',
      originalCurrency: 'AUD',
      originalCost: 240,
      noteCopilota: 'Private copilot tip',
    };
    const split = security.splitEntitySecurityData('tappa', '0000', full);
    assert.equal(JSON.stringify(split.publicDoc.openingHours), JSON.stringify(full.openingHours));
    assert.equal(JSON.stringify(split.publicDoc.linkedDocumentIds), JSON.stringify(['public-guide-id']));
    assert.equal(split.publicDoc.linkedDocumentId, undefined);
    assert.equal(split.publicDoc.pnr, undefined);
    assert.equal(split.publicDoc.cost, undefined);
    assert.equal(split.publicDoc.depositPaid, undefined);
    assert.equal(split.publicDoc.originalCost, undefined);
    assert.equal(split.publicDoc.noteCopilota, undefined);
    assert.equal(split.publicDoc.publicSchemaVersion, 2);

    const merged = security.mergeEntitySecurityData(split.publicDoc, split.privateCredentialsDoc);
    assert.equal(JSON.stringify(merged.linkedDocumentIds), JSON.stringify(['public-guide-id', 'private-passport-id']));
    assert.equal(merged.linkedDocumentId, 'private-passport-id');
    assert.equal(merged.pnr, 'PNR999');
    assert.equal(merged.cost, '150.00');
  });

  await test('5. Local LIVE photos remain visible to authorized owner/copilota offline and stay hidden from viewers/revoked/guests', () => {
    const { globals, setOnline } = makeGlobals(false);
    globals.localStorage.setItem('houni_verified_trip_auth', JSON.stringify({ tripId: '0000', uid: 'owner-1', role: 'owner', verifiedAt: Date.now() }));
    const authMock = { currentUser: { uid: 'owner-1', isAnonymous: false } };
    const authIdentity = loadTs('src/utils/useAuthIdentity.ts', {
      'react': { useState: x => [x, () => {}], useEffect: () => {} },
      'firebase/auth': { onAuthStateChanged: () => () => {} },
      'firebase/firestore': { doc: () => ({}), getDocFromServer: async () => ({ exists: () => false }) },
      '../firebase': { auth: authMock, db: {} },
      './tripConfig': { getTripConfig: () => ({ id: '0000' }) },
    }, globals);

    authIdentity.setAuthoritativeCloudRole('offline');
    const offlineRole = authIdentity.getAuthorizedLocalEditorRole('0000', 'owner-1');
    assert.equal(offlineRole, 'owner');

    const localPhoto = { id: 'p1', url: 'data:image/jpeg;base64,abc', tripId: '0000', userId: 'owner-1', isCustom: true, pendingSync: true };
    assert.equal(privacy.canReadLocalLivePhoto(localPhoto, '0000', 'owner-1', offlineRole, false), true);
    assert.equal(privacy.canReadLocalLivePhoto(localPhoto, '0000', 'owner-1', 'viewer', false), false);
    assert.equal(privacy.canReadLocalLivePhoto(localPhoto, '0000', 'owner-1', offlineRole, true), false);

    authIdentity.revokeTripAuth('0000');
    assert.equal(authIdentity.getAuthorizedLocalEditorRole('0000', 'owner-1'), null);
    setOnline(true);
  });

  await test('6. Legacy records & LIVE postcards: publishable historical entries show cleanly; dirty legacy docs fail closed', async () => {
    assert.equal(security.classifyLegacyRecord('alloggi', { id: 'clean-legacy', name: 'Hotel Sydney', updatedAt: 1 }), 'legacy_publishable');
    assert.equal(security.classifyLegacyRecord('alloggi', { id: 'v2-doc', name: 'Hotel Sydney', publicSchemaVersion: 2, updatedAt: 1 }), 'v2_verified');
    assert.equal(security.classifyLegacyRecord('alloggi', { id: 'dirty-legacy', name: 'Hotel', cost: '100 AUD', noteCopilota: 'secret' }), 'requires_classification');
    assert.equal(security.classifyLegacyRecord('tappe', { id: 'priv-doc-ref', title: 'Stop', linkedDocumentIds: ['secret-doc'] }), 'requires_classification');
    assert.equal(security.classifyLegacyRecord('alloggi', { id: 'explicit-zero', name: 'Hotel', publicSchemaVersion: 0 }), 'requires_classification');

    const { globals } = makeGlobals(true);
    let snapshotMode = 'active';
    const updatesDocs = [
      { id: 'legacy-postcard', data: () => ({ title: 'Ciao da Auckland', text: 'Tutto bene', photoUrl: 'https://example.com/1.jpg', timestamp: 10 }) },
      { id: 'dirty-postcard', data: () => ({ title: 'Leak', timestamp: 11, cost: '500 EUR' }) },
      { id: 'v2-postcard', data: () => ({ title: 'V2 Postcard', text: 'Ok', timestamp: 12, publicSchemaVersion: 2 }) },
    ];
    let lastFallbackUsed = false;
    const liveMod = loadTs('src/services/liveService.ts', {
      'firebase/firestore': {
        collection: (_db, ...segs) => ({ path: segs.join('/') }),
        doc: (_db, ...segs) => segs.join('/'),
        query: (col, ...constraints) => ({ col, hasV2: constraints.some(c => c?.field === 'publicSchemaVersion') }),
        where: (field, op, val) => ({ field, op, val }),
        orderBy: () => ({}),
        limit: () => ({}),
        onSnapshot: (q, onNext, onErr) => {
          if (snapshotMode === 'v2_rules' && !q.hasV2) {
            onErr({ code: 'permission-denied' });
            return () => {};
          }
          if (q.hasV2) lastFallbackUsed = true;
          const rows = q.hasV2 ? updatesDocs.filter(d => d.data().publicSchemaVersion === 2) : updatesDocs;
          onNext({ forEach: fn => rows.forEach(fn) });
          return () => {};
        },
        getDoc: async () => ({ exists: () => false }),
        writeBatch: () => ({ set() {}, commit: async () => {} }),
        setDoc: async () => {},
        updateDoc: async () => {},
        deleteDoc: async () => {},
        deleteField: () => ({}),
      },
      '../firebase': { db: {}, auth: {} },
      '../config/featureFlags': { FEATURE_FLAGS: {} },
    }, globals);

    let activeSeen = [];
    liveMod.liveService.subscribeToLiveUpdates('0000', list => { activeSeen = list; }, false)();
    assert.equal(JSON.stringify(activeSeen.map(x => x.id)), JSON.stringify(['legacy-postcard', 'v2-postcard']));

    snapshotMode = 'v2_rules';
    let v2Seen = [];
    liveMod.liveService.subscribeToLiveUpdates('0000', list => { v2Seen = list; }, false)();
    assert.equal(lastFallbackUsed, true);
    assert.equal(JSON.stringify(v2Seen.map(x => x.id)), JSON.stringify(['v2-postcard']));

    assert.equal(liveMod.classifyLegacyGuestMessage({ visitorId: 'v1', authorName: 'Anna', message: 'Auguri!', createdAt: 1, hidden: false }), 'legacy_publishable');
    assert.equal(liveMod.classifyLegacyGuestMessage({ visitorId: 'v1', authorName: 'Anna', message: 'Auguri!', cost: '100', createdAt: 1 }), 'requires_classification');
  });

  console.log(`\nALL ${passed} ANTI-REGRESSION CHECKS PASSED.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
