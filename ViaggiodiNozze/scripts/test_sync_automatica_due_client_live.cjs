/**
 * test_sync_automatica_due_client_live.cjs
 * 
 * Test Funzionale Live su Firestore Emulator:
 * Sincronizzazione automatica bidirezionale Owner - Copilota sul viaggio 0000.
 * 
 * Requisiti verificati:
 * 1. Salvataggio locale -> coda persistente -> push automatico a Firestore SENZA sincronizzazione manuale.
 * 2. Listener onSnapshot del destinatario -> IndexedDB -> notifica immediata della UI.
 * 3. Bidirezionalità completa: modifiche Owner arrivano a Copilota E modifiche Copilota arrivano a Owner.
 * 4. Nessuna perdita silenziosa, nessun blocco da falso conflitto timestamp se server non ha updatedAt.
 * 5. Corretta rimozione dalla coda e nessun ghost lock che blocca onSnapshot.
 * 6. Ripristino online e ripresa da visibilitychange con flush automatico della coda.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');

console.log('--- TEST FUNZIONALE LIVE: SINCRONIZZAZIONE AUTOMATICA OWNER <-> COPILOTA (EMULATOR) ---');

const root = path.resolve(__dirname, '..');
const project = 'demo-hounigo-auto-sync-live';
const host = 'http://127.0.0.1:8194';
const base = `${host}/v1/projects/${project}/databases/(default)/documents`;
const rulesPath = path.join(root, 'firestore.rules');
const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');

function fields(data) {
  const value = item => Array.isArray(item) ? { arrayValue: { values: item.map(value) } }
    : typeof item === 'string' ? { stringValue: item }
      : typeof item === 'boolean' ? { booleanValue: item }
        : typeof item === 'number' ? { doubleValue: item }
          : { mapValue: { fields: fields(item) } };
  return Object.fromEntries(Object.entries(data).filter(([,v])=>v !== undefined).map(([k,v])=>[k,value(v)]));
}

function parseFields(docFields) {
  if (!docFields) return {};
  const res = {};
  for (const [k, v] of Object.entries(docFields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.integerValue !== undefined) res[k] = parseInt(v.integerValue, 10);
    else if (v.doubleValue !== undefined) res[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.arrayValue && v.arrayValue.values) res[k] = v.arrayValue.values.map(val => val.stringValue || (val.mapValue ? parseFields(val.mapValue.fields) : val));
    else if (v.mapValue && v.mapValue.fields) res[k] = parseFields(v.mapValue.fields);
    else res[k] = v;
  }
  return res;
}

function token(uid) {
  if (!uid) return null;
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({alg:'none',typ:'JWT'})}.${b64({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,auth_time:Math.floor(Date.now()/1000),firebase:{identities:{},sign_in_provider:'google.com'}})}.`;
}

async function request(method, docPath, uid, data) {
  const headers = { 'Content-Type':'application/json' };
  if (uid) headers.Authorization = `Bearer ${uid === 'ADMIN_EMULATOR_ONLY' ? 'owner' : token(uid)}`;
  return fetch(`${base}/${docPath}`, { method, headers, body: data ? JSON.stringify({fields:fields(data)}) : undefined, signal:AbortSignal.timeout(10000) });
}

function load(file, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root,file),'utf8').replaceAll('import.meta.env.DEV','false');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>{
    assert.ok(id in dependencies, `Unexpected dependency ${id}`);
    return dependencies[id];
  },console,structuredClone,setTimeout,clearTimeout,...globals});
  return exports;
}

(async () => {
  assert.ok(fs.existsSync(jar), 'Firestore emulator JAR missing');

  const emulator = spawn('java', [
    '-Duser.language=en',
    '-Duser.country=US',
    '-jar', jar,
    '--host', '127.0.0.1',
    '--port', '8194',
    '--project_id', project,
    '--single_project_mode', 'true',
    '--rules', rulesPath
  ], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  let emulatorReady = false;
  try {
    for (let i = 0; i < 100; i++) {
      if (emulator.exitCode !== null) throw new Error('Emulator exited unexpectedly');
      try {
        await fetch(host, { signal: AbortSignal.timeout(500) });
        emulatorReady = true;
        break;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(emulatorReady, 'Firestore emulator failed to start on port 8194');
    console.log('✓ Firestore Emulator avviato su 127.0.0.1:8194');

    const ownerUid = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';
    const copilotUid = 'EY8lnbnfy7gbES6tijrTfjlJzjS2';

    const seed = async (doc, data) => {
      const res = await request('PATCH', doc, 'ADMIN_EMULATOR_ONLY', data);
      assert.ok(res.ok, `Seed failed: ${await res.text()}`);
    };

    await seed('trips/0000', {
      ownerUid,
      members: [ownerUid, copilotUid]
    });
    await seed(`trips/0000/members/${ownerUid}`, { uid: ownerUid, role: 'owner' });
    await seed(`trips/0000/members/${copilotUid}`, { uid: copilotUid, role: 'copilota' });

    // Seed di un'attività senza updatedAt su Firestore per testare la compatibilità con dati legacy
    await seed('trips/0000/attivita/att_legacy_no_ts', {
      id: 'att_legacy_no_ts',
      titolo: 'Attività Legacy Senza Timestamp su Firestore',
      createdAt: 100000
    });

    console.log('✓ Setup iniziale Firestore completato.');

    // Simula bus di eventi broadcast su Firestore per emulare le notifiche onSnapshot in tempo reale
    const cloudWatchers = new Map(); // colPath -> Set<callback>
    function registerCloudWatcher(colPath, cb) {
      if (!cloudWatchers.has(colPath)) cloudWatchers.set(colPath, new Set());
      cloudWatchers.get(colPath).add(cb);
      return () => cloudWatchers.get(colPath).delete(cb);
    }
    function notifyCloudChange(colPath, docId, type, docData) {
      const listeners = cloudWatchers.get(colPath);
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb({
              docChanges: () => [{
                type,
                doc: {
                  id: docId,
                  metadata: { hasPendingWrites: false },
                  data: () => structuredClone(docData)
                }
              }]
            });
          } catch (err) {
            console.error('Error in onSnapshot listener:', err);
          }
        }
      }
    }

    function createClient(uid, role) {
      const localStorageStore = new Map();
      localStorageStore.set('hounigo_allow_cloud_write_0000', 'true');
      localStorageStore.set('hounigo_allow_queue_flush_0000', 'true');
      localStorageStore.set('houni_device_role', role === 'owner' ? 'guida' : 'copilota');

      const fakeLocalStorage = {
        getItem: (k) => localStorageStore.get(k) || null,
        setItem: (k, v) => localStorageStore.set(k, String(v)),
        removeItem: (k) => localStorageStore.delete(k)
      };

      let onLine = true;
      const fakeNavigator = {
        get onLine() { return onLine; },
        set onLine(val) { onLine = val; }
      };

      const eventListeners = new Map();
      const dispatchedEvents = [];
      const fakeWindow = {
        addEventListener: (type, fn) => {
          if (!eventListeners.has(type)) eventListeners.set(type, new Set());
          eventListeners.get(type).add(fn);
        },
        removeEventListener: (type, fn) => {
          if (eventListeners.has(type)) eventListeners.get(type).delete(fn);
        },
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
          const listeners = eventListeners.get(event.type);
          if (listeners) {
            for (const fn of Array.from(listeners)) {
              try { fn(event); } catch (e) { console.error('Event listener error:', e); }
            }
          }
          return true;
        }
      };

      const idbData = {
        settings: new Map(),
        attivita: new Map(),
        tappe: new Map(),
        note: new Map(),
        alloggi: new Map(),
        trasporti: new Map(),
        documenti: new Map(),
        ristoranti: new Map(),
        shopping: new Map(),
        spese: new Map(),
        bagagli: new Map(),
        giorni: new Map()
      };

      const pendingQueue = [];
      const conflictArchive = [];

      const queueModule = load('src/storage/localMutationQueue.ts', {}, {
        window: { indexedDB: null },
        localStorage: fakeLocalStorage,
        console
      });

      // Override queue module persistence to use in-memory pendingQueue array
      queueModule.getPendingMutations = async (tripId) => [...pendingQueue];
      queueModule.savePendingMutation = async (m) => {
        const norm = queueModule.normalizeQueueEntityType(m.entityType);
        const dataId = m.data?.id || m.id;
        const normAction = m.action === 'delete' ? 'delete' : 'save';
        const record = { ...m, entityType: norm, action: normAction, timestamp: m.timestamp || Date.now() };
        const idx = pendingQueue.findIndex(q => (q.data?.id || q.id) === dataId && queueModule.normalizeQueueEntityType(q.entityType) === norm);
        if (idx >= 0) pendingQueue[idx] = record;
        else pendingQueue.push(record);
      };
      queueModule.removePendingMutation = async (tripId, type, id, expected) => {
        const norm = queueModule.normalizeQueueEntityType(type);
        const idx = pendingQueue.findIndex(q => {
          const matchId = (q.data?.id || q.id) === id && queueModule.normalizeQueueEntityType(q.entityType) === norm;
          if (!matchId) return false;
          if (!expected) return true;
          const expAction = expected.action === 'delete' ? 'delete' : 'save';
          const matchAction = q.action === expAction || q.action === expected.action;
          const matchMutation = !expected.mutationId || !q.mutationId || q.mutationId === expected.mutationId;
          return matchAction && matchMutation;
        });
        if (idx >= 0) pendingQueue.splice(idx, 1);
      };
      queueModule.hasPendingMutation = async (tripId, type, id) => {
        const norm = queueModule.normalizeQueueEntityType(type);
        return pendingQueue.some(q => (q.data?.id || q.id) === id && queueModule.normalizeQueueEntityType(q.entityType) === norm);
      };
      queueModule.saveConflictBackup = async (c) => {
        conflictArchive.push({ ...c, id: `conf_${Date.now()}_${Math.random()}` });
      };
      queueModule.getConflictBackups = async () => [...conflictArchive];

      const indexedDbModule = {
        STORES: {
          SETTINGS: 'settings', NOTE: 'note', ATTIVITA: 'attivita', TAPPE: 'tappe',
          ALLOGGI: 'alloggi', TRASPORTI: 'trasporti', DOCUMENTI: 'documenti',
          RISTORANTI: 'ristoranti', SHOPPING: 'shopping', SPESE: 'spese',
          BAGAGLI: 'bagagli', GIORNI: 'giorni'
        },
        idbGet: async (store, key) => (idbData[store] ? idbData[store].get(key) || null : null),
        idbPut: async (store, val) => { if (idbData[store] && val && val.id) idbData[store].set(val.id, structuredClone(val)); },
        idbDelete: async (store, key) => { if (idbData[store]) idbData[store].delete(key); },
        idbGetAll: async (store) => (idbData[store] ? Array.from(idbData[store].values()) : [])
      };

      let authRole = role;
      const identityModule = {
        isCloudAuthorized: (tripId) => fakeLocalStorage.getItem(`houni_revoked_trip_${tripId}`) !== 'true' && Boolean(uid && (authRole === 'owner' || authRole === 'copilota')),
        isTripAuthRevoked: (tripId) => fakeLocalStorage.getItem(`houni_revoked_trip_${tripId}`) === 'true',
        getAuthoritativeCloudRole: () => (fakeLocalStorage.getItem(`houni_revoked_trip_0000`) === 'true' ? 'viewer' : authRole),
        setAuthoritativeCloudRole: (r) => { authRole = r; },
        assertCanMutate: () => {
          if (fakeLocalStorage.getItem(`houni_revoked_trip_0000`) === 'true' || (authRole !== 'owner' && authRole !== 'copilota')) {
            throw new Error('Cloud authorization changed: session revoked or unauthorized');
          }
        }
      };

      const tripConfigModule = {
        getTripConfig: () => ({ id: '0000', ownerUid })
      };

      const splitter = load('src/utils/securityDataSplitter.ts', {});

      let failBatchOnClient = false;
      const firestoreMock = {
        collection: (_db, ...p) => p.join('/'),
        doc: (_db, ...p) => p.join('/'),
        onSnapshot: (colPath, onNext) => {
          return registerCloudWatcher(colPath, onNext);
        },
        writeBatch: () => {
          const ops = [];
          return {
            set: (ref, data) => { ops.push({ type: 'set', ref, data }); },
            delete: (ref) => { ops.push({ type: 'delete', ref }); },
            commit: async () => {
              if (!fakeNavigator.onLine) throw new Error('Offline (simulated network failure during batch commit)');
              if (failBatchOnClient) {
                failBatchOnClient = false;
                throw new Error('Simulated crash / network fault during atomic batch write');
              }
              for (const op of ops) {
                if (op.type === 'set') {
                  const res = await request('PATCH', op.ref, uid, op.data);
                  if (!res.ok) throw new Error(`batch setDoc failed: ${await res.text()}`);
                } else if (op.type === 'delete') {
                  const res = await request('DELETE', op.ref, uid);
                  if (!res.ok) throw new Error(`batch deleteDoc failed: ${await res.text()}`);
                }
              }
              for (const op of ops) {
                const parts = op.ref.split('/');
                const colPath = parts.slice(0, -1).join('/');
                const docId = parts[parts.length - 1];
                if (op.type === 'set') {
                  notifyCloudChange(colPath, docId, 'modified', op.data);
                } else {
                  notifyCloudChange(colPath, docId, 'removed', { id: docId });
                }
              }
            }
          };
        },
        setDoc: async (docRef, data) => {
          if (!fakeNavigator.onLine) throw new Error('Offline (simulated network failure)');
          const res = await request('PATCH', docRef, uid, data);
          if (!res.ok) throw new Error(`setDoc failed: ${await res.text()}`);
          const parts = docRef.split('/');
          const colPath = parts.slice(0, -1).join('/');
          const docId = parts[parts.length - 1];
          notifyCloudChange(colPath, docId, 'modified', data);
        },
        deleteDoc: async (docRef) => {
          if (!fakeNavigator.onLine) throw new Error('Offline');
          const res = await request('DELETE', docRef, uid);
          if (!res.ok) throw new Error(`deleteDoc failed: ${await res.text()}`);
          const parts = docRef.split('/');
          const colPath = parts.slice(0, -1).join('/');
          const docId = parts[parts.length - 1];
          notifyCloudChange(colPath, docId, 'removed', { id: docId });
        },
        getDoc: async (docRef) => {
          if (!fakeNavigator.onLine) throw new Error('Offline');
          const res = await request('GET', docRef, uid);
          const json = res.ok ? await res.json() : null;
          const parsed = json ? parseFields(json.fields) : null;
          return {
            exists: () => res.ok,
            data: () => parsed
          };
        },
        getDocs: async (colRef) => {
          if (!fakeNavigator.onLine) throw new Error('Offline');
          const res = await request('GET', colRef, uid);
          if (!res.ok) return { docs: [] };
          const json = await res.json();
          const documents = json.documents || [];
          return {
            docs: documents.map(d => ({
              id: d.name.split('/').pop(),
              data: () => parseFields(d.fields)
            }))
          };
        }
      };

      const fakeDocument = {
        visibilityState: 'visible',
        addEventListener: (type, fn) => fakeWindow.addEventListener(type, fn),
        removeEventListener: (type, fn) => fakeWindow.removeEventListener(type, fn),
        dispatchEvent: (event) => fakeWindow.dispatchEvent(event)
      };

      const storageServiceModule = load('src/storage/storageService.ts', {
        '../types': {},
        './indexedDB': indexedDbModule,
        '../utils/tripDates': { formatDateIT: () => '', normalizeTimestamp: v => Number(v) || 0 },
        '../utils/useAuthIdentity': identityModule,
        '../utils/timelineOrdering': { compareTimelineItems: () => 0 },
        '../utils/deadlines': { sortDeadlines: d => d },
        '../utils/geoCoordinatesHelper': { lookupKnownCoordinate: () => null }
      }, {
        window: fakeWindow,
        document: fakeDocument,
        localStorage: fakeLocalStorage,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
      });

      const syncServiceModule = load('src/storage/syncService.ts', {
        'firebase/firestore': firestoreMock,
        '../firebase': { auth: { get currentUser() { return { uid, isAnonymous: false }; } }, db: {} },
        './indexedDB': indexedDbModule,
        './storageService': { notifyDataChanged: storageServiceModule.notifyDataChanged },
        '../utils/tripDates': { normalizeTimestamp: v => Number(v) || 0 },
        '../utils/useAuthIdentity': identityModule,
        '../utils/tripConfig': tripConfigModule,
        '../services/pushNotificationService': { recordPushMutation: async () => {} },
        '../utils/securityDataSplitter': splitter,
        './localMutationQueue': queueModule
      }, {
        localStorage: fakeLocalStorage,
        navigator: fakeNavigator,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        Event: class Event { constructor(type) { this.type = type; } },
        window: fakeWindow,
        document: fakeDocument
      });

      const syncService = new syncServiceModule.SyncService('0000');

      return {
        uid,
        role,
        fakeLocalStorage,
        fakeNavigator,
        fakeWindow,
        fakeDocument,
        idbData,
        pendingQueue,
        conflictArchive,
        dispatchedEvents,
        queueModule,
        setFailBatch: (v) => { failBatchOnClient = v; },
        storageService: storageServiceModule.storageService,
        syncService,
        notifyDataChanged: storageServiceModule.notifyDataChanged
      };
    }

    const clientOwner = createClient(ownerUid, 'owner');
    const clientCopilot = createClient(copilotUid, 'copilota');

    // =========================================================================
    // TEST 1: SALVATAGGIO LOCALE OWNER -> FIRESTORE AUTOMATICO (SENZA SYNC MANUALE)
    // =========================================================================
    console.log('\n--- TEST 1: Modifica Owner -> Invio automatico a Firestore ---');
    const activityOwner = {
      id: 'att_auto_owner_01',
      titolo: 'Visita guidata Colosseo organizzata da Nunzio',
      date: '2026-06-16',
      dayId: 'day_2026-06-16',
      time: '10:00',
      category: 'Cultura',
      cost: '75',
      noteCopilota: 'Biglietti salta-fila già prenotati',
      updatedAt: Date.now()
    };

    // Salvataggio locale da parte dell'Owner tramite storageService
    await clientOwner.storageService.saveActivity(activityOwner);

    // Attendi elaborazione asincrona del push to cloud
    await new Promise(r => setTimeout(r, 600));

    // Verifica che l'attività sia stata salvata su Firestore Emulator
    const resOwnerOnCloud = await request('GET', 'trips/0000/attivita/att_auto_owner_01', ownerUid);
    assert.ok(resOwnerOnCloud.ok, 'Attività Owner deve essere presente su Firestore automaticamente');
    const cloudActivityData = parseFields((await resOwnerOnCloud.json()).fields);
    assert.equal(cloudActivityData.titolo, 'Visita guidata Colosseo organizzata da Nunzio');

    // Verifica che le credenziali private (costo, note) siano in private_credentials
    const resVaultOnCloud = await request('GET', 'trips/0000/private_credentials/attivita_att_auto_owner_01', ownerUid);
    assert.ok(resVaultOnCloud.ok, 'Cassaforte deve essere creata automaticamente per attività');
    const cloudVaultData = parseFields((await resVaultOnCloud.json()).fields);
    assert.equal(String(cloudVaultData.cost), '75');

    // Verifica che la coda locale dell'Owner sia pulita (rimossa dopo conferma Firestore)
    assert.equal(clientOwner.pendingQueue.length, 0, 'La coda locale dell\'Owner deve essere svuotata automaticamente');
    console.log('✓ TEST 1 SUPERATO: Salvataggio locale Owner inviato a Firestore senza sync manuale.');

    // =========================================================================
    // TEST 2: ON-SNAPSHOT RICEZIONE AUTOMATICA COPILOTA -> INDEXEDDB & UI EVENT
    // =========================================================================
    console.log('\n--- TEST 2: Ricezione automatica Copilota (onSnapshot) -> IndexedDB & Notifica UI ---');
    // Client Copilot NON ha chiamato syncBidirectional() né premuto alcun tasto.
    // L'onSnapshot deve aver inserito il record in IndexedDB di Copilota
    const copilotLocalActivity = clientCopilot.idbData.attivita.get('att_auto_owner_01');
    assert.ok(copilotLocalActivity, 'Copilota deve aver ricevuto l\'attività automaticamente in IndexedDB via onSnapshot');
    assert.equal(copilotLocalActivity.titolo, 'Visita guidata Colosseo organizzata da Nunzio');
    assert.equal(String(copilotLocalActivity.cost), '75', 'Copilota autorizzato deve ricostruire i dati sensibili dalla cassaforte');

    // Verifica che l'evento per la UI sia stato emesso sul window del Copilota
    const uiEventsCopilot = clientCopilot.dispatchedEvents.filter(e =>
      e.type === 'roadbook_data_mutated' || e.type === 'attivita_updated'
    );
    assert.ok(uiEventsCopilot.length > 0, 'Copilota deve aver emesso l\'evento di mutazione dati per aggiornare la UI istantaneamente');
    console.log('✓ TEST 2 SUPERATO: Modifica Owner ricevuta automaticamente da Copilota in tempo reale.');

    // =========================================================================
    // TEST 3: COPILOTA MODIFICA ORARIO RECORD ESISTENTE CON CLOCK SKEW -> INVIO E RICEZIONE OWNER LIVE
    // =========================================================================
    console.log('\n--- TEST 3: Modifica Orario Copilota con Clock Skew -> Ricezione automatica Owner ---');
    clientOwner.dispatchedEvents.length = 0; // reset log eventi

    // Simula clock skew reale: l'orologio di Giusy è indietro rispetto al timestamp di creazione dell'Owner!
    const creationTime = activityOwner.updatedAt || Date.now();
    const skewedCopilotTime = creationTime - 3000; // 3 secondi INDIETRO rispetto alla creazione Owner

    const updatedByCopilot = {
      ...copilotLocalActivity,
      time: '11:30',
      orario: '11:30',
      orarioInizio: '11:30',
      orarioRitrovo: '11:15',
      titolo: 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)',
      noteCopilota: 'Orario spostato alle 11:30 con sotterranei inclusi',
      updatedAt: skewedCopilotTime
    };

    // Copilota salva la modifica dell'orario tramite storageService
    await clientCopilot.storageService.saveActivity(updatedByCopilot);

    // Attendi elaborazione push e snapshot
    await new Promise(r => setTimeout(r, 600));

    // Verifica su Firestore: la modifica deve essere stata scritta e il timestamp deve essere monotonicamente avanzato
    const resCloudFromCopilot = await request('GET', 'trips/0000/attivita/att_auto_owner_01', copilotUid);
    assert.ok(resCloudFromCopilot.ok, 'Modifica Copilota deve essere scritta su Firestore');
    const cloudCopilotData = parseFields((await resCloudFromCopilot.json()).fields);
    assert.equal(cloudCopilotData.time, '11:30', 'Orario su Firestore deve essere aggiornato alle 11:30');
    assert.equal(cloudCopilotData.titolo, 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)');
    assert.ok(cloudCopilotData.updatedAt >= creationTime, 'Timestamp su Firestore deve essere monotonicamente avanzato rispetto alla creazione');

    // Verifica che l'Owner abbia ricevuto l'orario aggiornato in IndexedDB SENZA sync manuale
    const ownerReceivedFromCopilot = clientOwner.idbData.attivita.get('att_auto_owner_01');
    assert.ok(ownerReceivedFromCopilot, 'Owner deve avere il record aggiornato in IndexedDB');
    assert.equal(ownerReceivedFromCopilot.time, '11:30', 'Owner deve vedere il nuovo orario 11:30 aggiornato automaticamente');
    assert.equal(ownerReceivedFromCopilot.titolo, 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)');
    assert.equal(ownerReceivedFromCopilot.noteCopilota, 'Orario spostato alle 11:30 con sotterranei inclusi');

    // Verifica evento UI emesso per l'Owner
    const uiEventsOwner = clientOwner.dispatchedEvents.filter(e =>
      e.type === 'roadbook_data_mutated' || e.type === 'attivita_updated'
    );
    assert.ok(uiEventsOwner.length > 0, 'Owner deve aver emesso evento UI per aggiornamento automatico');
    console.log('✓ TEST 3 SUPERATO: Modifica orario Copilota con clock skew ricevuta automaticamente da Owner.');

    // =========================================================================
    // TEST 3B: CLOCK SKEW RICEZIONE OWNER (localUpdated >= serverUpdated NON SCARTA MODIFICA REMOTA)
    // =========================================================================
    console.log('\n--- TEST 3B: Listener Owner onSnapshot non scarta modifiche remote in presenza di clock skew locale ---');
    clientOwner.dispatchedEvents.length = 0;

    // Crea seconda attività creata da Copilota
    const act2 = {
      id: 'att_skew_test_02',
      titolo: 'Pranzo a Trastevere scelto da Giusy',
      time: '13:00',
      orario: '13:00',
      date: '2026-06-16',
      dayId: 'day_2026-06-16',
      updatedAt: 1000000
    };
    await clientCopilot.storageService.saveActivity(act2);
    await new Promise(r => setTimeout(r, 600));

    // Simula che l'Owner abbia un timestamp locale AVANTI (ad es. per orologio locale Owner avanti di 5 minuti)
    const ownerLocalSkewed = clientOwner.idbData.attivita.get('att_skew_test_02');
    assert.ok(ownerLocalSkewed, 'Owner deve aver ricevuto act2 inizialmente');
    ownerLocalSkewed.updatedAt = 1005000; // Orologio locale Owner avanti di 5 secondi
    clientOwner.idbData.attivita.set('att_skew_test_02', ownerLocalSkewed);

    // Giusy ora modifica l'orario a 13:30 con il suo orologio (timestamp 1002000, che è MINORE di 1005000 di Owner)
    // ma Giusy ha salvato la modifica e la invia a Firestore
    const act2ModifiedByGiusy = {
      ...clientCopilot.idbData.attivita.get('att_skew_test_02'),
      time: '13:30',
      orario: '13:30',
      updatedAt: 1002000
    };
    await clientCopilot.storageService.saveActivity(act2ModifiedByGiusy);
    await new Promise(r => setTimeout(r, 600));

    // Verifica che l'Owner, pur avendo localUpdated (1005000) > serverUpdated originario, NON abbia scartato la modifica
    const ownerFinalAct2 = clientOwner.idbData.attivita.get('att_skew_test_02');
    assert.equal(ownerFinalAct2.time, '13:30', 'Owner deve aver aggiornato l\'orario a 13:30 nonostante il clock skew locale');
    console.log('✓ TEST 3B SUPERATO: Owner accetta modifiche del collaboratore anche con clock locale avanti.');

    // =========================================================================
    // TEST 4: DOCUMENTO FIRESTORE SENZA UPDATEDAT NON VIENE SOVRASCRITTO (ISOLATO)
    // =========================================================================
    console.log('\n--- TEST 4: Protezione documento legacy privo di updatedAt (nessuna sovrascrittura automatica) ---');
    const editLegacy = {
      id: 'att_legacy_no_ts',
      titolo: 'Tentativo di Modifica su Dato Legacy Discordante',
      date: '2026-06-20',
      dayId: 'day_2026-06-20',
      category: 'Relax',
      updatedAt: Date.now()
    };

    await clientOwner.storageService.saveActivity(editLegacy);
    await new Promise(r => setTimeout(r, 600));

    // Il documento su Firestore NON deve essere stato sovrascritto
    const checkLegacyCloud = await request('GET', 'trips/0000/attivita/att_legacy_no_ts', ownerUid);
    assert.ok(checkLegacyCloud.ok, 'Dato legacy deve esistere su Firestore');
    const checkLegacyData = parseFields((await checkLegacyCloud.json()).fields);
    assert.equal(checkLegacyData.titolo, 'Attività Legacy Senza Timestamp su Firestore', 'Documento Firestore privo di updatedAt NON deve essere sovrascritto');

    // Entrambe le copie devono essere preservate nell'archivio conflitti
    const legacyConflict = clientOwner.conflictArchive.find(c => c.dataId === 'att_legacy_no_ts');
    assert.ok(legacyConflict, 'Conflitto di timestamp inaffidabile archiviato preservando entrambe le versioni');
    assert.equal(legacyConflict.conflictType, 'unreliable_timestamp_conflict');
    assert.equal(legacyConflict.serverData.titolo, 'Attività Legacy Senza Timestamp su Firestore');
    assert.equal(legacyConflict.localData.titolo, 'Tentativo di Modifica su Dato Legacy Discordante');
    console.log('✓ TEST 4 SUPERATO: Documento legacy remoto non sovrascritto, entrambe le copie conservate e record isolato.');

    // Rimuovi il conflitto di test per non sporcare i test successivi
    clientOwner.pendingQueue.splice(0, clientOwner.pendingQueue.length);

    // =========================================================================
    // TEST 5: OFFLINE -> ONLINE -> FLUSH AUTOMATICO SENZA SINCRONIZZA
    // =========================================================================
    console.log('\n--- TEST 5: Modifiche Offline -> Ritorno Online -> Flush Automatico ---');
    clientCopilot.fakeNavigator.onLine = false;

    const offlineActivity = {
      id: 'att_offline_copilot_99',
      titolo: 'Cena a Trastevere creata in aereo da Giusy (offline)',
      date: '2026-06-17',
      dayId: 'day_2026-06-17',
      category: 'Cibo',
      updatedAt: Date.now()
    };

    await clientCopilot.storageService.saveActivity(offlineActivity);
    await new Promise(r => setTimeout(r, 100));

    // La mutazione deve trovarsi nella coda persistente
    assert.ok(clientCopilot.pendingQueue.some(q => q.data?.id === 'att_offline_copilot_99'), 'Mutazione offline presente in coda');

    // Su Firestore non deve ancora esistere
    const checkOfflinePre = await request('GET', 'trips/0000/attivita/att_offline_copilot_99', ownerUid);
    assert.equal(checkOfflinePre.status, 404, 'Offline: non ancora su Firestore');

    // Copilota torna online ed emette evento 'online'
    clientCopilot.fakeNavigator.onLine = true;
    clientCopilot.fakeWindow.dispatchEvent(new (class Event { constructor(type) { this.type = type; } })('online'));

    // Attendi flush automatico
    await new Promise(r => setTimeout(r, 1000));

    // Su Firestore deve essere presente ora
    const checkOfflinePost = await request('GET', 'trips/0000/attivita/att_offline_copilot_99', ownerUid);
    assert.ok(checkOfflinePost.ok, 'Dato offline deve essere sincronizzato automaticamente al ritorno online');
    assert.equal(clientCopilot.pendingQueue.length, 0, 'Coda Copilota svuotata automaticamente');

    // E Owner deve averlo ricevuto via onSnapshot
    assert.ok(clientOwner.idbData.attivita.has('att_offline_copilot_99'), 'Owner ha ricevuto il dato creato offline da Copilota');
    console.log('✓ TEST 5 SUPERATO: Ritorno online flushato e propagato automaticamente.');

    // =========================================================================
    // TEST 6: RIAPERTURA PWA / VISIBILITY CHANGE CON MUTAZIONE IN CODA
    // =========================================================================
    console.log('\n--- TEST 6: Riapertura PWA / Ripresa Foreground con Flush Automatico ---');
    // Simula una mutazione rimasta in coda (es. crash o chiusura immediata)
    const backgroundMutation = {
      id: 'att_bg_resume_01',
      titolo: 'Attività rimasta in coda e recuperata al resume PWA',
      date: '2026-06-18',
      dayId: 'day_2026-06-18',
      category: 'Trekking',
      updatedAt: Date.now()
    };
    await clientOwner.queueModule.savePendingMutation({
      tripId: '0000',
      entityType: 'attivita',
      action: 'save',
      data: backgroundMutation
    });
    assert.equal(clientOwner.pendingQueue.length, 1);

    // Emetti evento visibilitychange (PWA riportata in primo piano)
    clientOwner.fakeDocument.dispatchEvent(new (class Event { constructor(type) { this.type = type; } })('visibilitychange'));

    // Attendi elaborazione
    await new Promise(r => setTimeout(r, 1000));

    // Verifica che sia stato inviato a Firestore
    const checkResumeCloud = await request('GET', 'trips/0000/attivita/att_bg_resume_01', ownerUid);
    assert.ok(checkResumeCloud.ok, 'Mutazione recuperata al resume PWA deve essere su Firestore');
    assert.equal(clientOwner.pendingQueue.length, 0, 'Coda Owner svuotata al resume PWA');
    console.log('✓ TEST 6 SUPERATO: Riapertura PWA / visibilitychange ha recuperato e inviato le mutazioni.');

    // =========================================================================
    // TEST 7: SCRITTURA ATOMICA BATCH (DATI PUBBLICI + CASSAFORTE PRIVATE_CREDENTIALS)
    // =========================================================================
    console.log('\n--- TEST 7: Scrittura Atomica Batch (Dati Pubblici + Private Credentials) ---');
    const atomicActivity = {
      id: 'att_atomic_01',
      titolo: 'Biglietti Musei Vaticani prenotati',
      date: '2026-06-22',
      dayId: 'day_2026-06-22',
      category: 'Museo',
      cost: '120',
      bookingCode: 'VAT-998877',
      pinCode: '4321',
      noteCopilota: 'Entrare dall\'ingresso riservato gruppi ore 10:00',
      updatedAt: Date.now()
    };

    await clientOwner.storageService.saveActivity(atomicActivity);
    await new Promise(r => setTimeout(r, 800));

    // Verifica documento pubblico su Firestore (senza leak dei dati riservati)
    const checkAtomicPub = await request('GET', 'trips/0000/attivita/att_atomic_01', ownerUid);
    assert.ok(checkAtomicPub.ok, 'Documento pubblico deve esistere su Firestore');
    const pubData = parseFields((await checkAtomicPub.json()).fields);
    assert.equal(pubData.titolo, 'Biglietti Musei Vaticani prenotati');
    assert.equal(pubData.cost, undefined, 'Nessun leak economico nel documento pubblico');
    assert.equal(pubData.pinCode, undefined, 'Nessun leak PIN nel documento pubblico');
    assert.equal(pubData.hasPrivateCredentials, true, 'Segnaposto cassaforte presente');

    // Verifica cassaforte privata su Firestore
    const checkAtomicPriv = await request('GET', 'trips/0000/private_credentials/attivita_att_atomic_01', ownerUid);
    assert.ok(checkAtomicPriv.ok, 'Cassaforte privata deve esistere su Firestore');
    const privData = parseFields((await checkAtomicPriv.json()).fields);
    assert.equal(String(privData.cost), '120');
    assert.equal(privData.bookingCode, 'VAT-998877');
    assert.equal(privData.pinCode, '4321');

    // Verifica che Copilota abbia ricevuto entrambi i dati ricostruiti via onSnapshot
    const copilotAtomicRec = clientCopilot.idbData.attivita.get('att_atomic_01');
    assert.ok(copilotAtomicRec, 'Copilota deve aver ricevuto l\'entità');
    assert.equal(String(copilotAtomicRec.cost), '120', 'Copilota ha il costo ricostruito dalla cassaforte');
    assert.equal(copilotAtomicRec.bookingCode, 'VAT-998877', 'Copilota ha il codice prenotazione');
    console.log('✓ TEST 7 SUPERATO: Scrittura atomica batch completata e verificata con successo.');

    // =========================================================================
    // TEST 8: CRASH TRA SCRITTURE / SIMULAZIONE ERRORE BATCH & PERMANENZA CODA
    // =========================================================================
    console.log('\n--- TEST 8: Crash / Errore Batch: Nessun Salvataggio Parziale e Permanenza Coda ---');
    clientOwner.setFailBatch(true);

    const failActivity = {
      id: 'att_batch_fail_01',
      titolo: 'Attività durante fault di rete',
      date: '2026-06-23',
      dayId: 'day_2026-06-23',
      category: 'Tour',
      cost: '200',
      pinCode: '9999',
      updatedAt: Date.now()
    };

    try {
      await clientOwner.storageService.saveActivity(failActivity);
    } catch {}

    await new Promise(r => setTimeout(r, 600));

    // A seguito del fallimento atomico:
    // 1. Il documento pubblico NON deve esistere su Firestore
    const checkFailPub = await request('GET', 'trips/0000/attivita/att_batch_fail_01', ownerUid);
    assert.equal(checkFailPub.status, 404, 'Nessun salvataggio parziale del documento pubblico su Firestore');

    // 2. La cassaforte NON deve esistere su Firestore
    const checkFailPriv = await request('GET', 'trips/0000/private_credentials/attivita_att_batch_fail_01', ownerUid);
    assert.equal(checkFailPriv.status, 404, 'Nessun salvataggio parziale della cassaforte su Firestore');

    // 3. La mutazione DEVE rimanere nella coda locale persistente (zero perdita)
    assert.ok(clientOwner.pendingQueue.some(q => q.data?.id === 'att_batch_fail_01'), 'Mutazione deve permanere nella coda locale dopo l\'errore');
    console.log('✓ TEST 8 PARTE A: Nessun salvataggio parziale e mutazione preservata nella coda locale.');

    // Ripristina e svuota la coda
    clientOwner.setFailBatch(false);
    await clientOwner.syncService.flushPendingQueue();
    await new Promise(r => setTimeout(r, 800));

    // Ora entrambi i documenti devono esistere su Firestore
    const checkRecoverPub = await request('GET', 'trips/0000/attivita/att_batch_fail_01', ownerUid);
    assert.ok(checkRecoverPub.ok, 'Documento pubblico presente dopo ripristino');
    const checkRecoverPriv = await request('GET', 'trips/0000/private_credentials/attivita_att_batch_fail_01', ownerUid);
    assert.ok(checkRecoverPriv.ok, 'Cassaforte presente dopo ripristino');
    assert.equal(clientOwner.pendingQueue.length, 0, 'Coda svuotata dopo ripristino');
    console.log('✓ TEST 8 SUPERATO: Recupero verificabile e sicuro completato con successo.');

    // =========================================================================
    // TEST 9: MODIFICA SOLO PUBBLICA (ZERO TOCCO CASSAFORTE)
    // =========================================================================
    console.log('\n--- TEST 9: Modifica Solo Pubblica (Zero Tocco Cassaforte) ---');
    const purelyPublicActivity = {
      id: 'att_purely_public_01',
      titolo: 'Passeggiata a Villa Borghese',
      date: '2026-06-24',
      dayId: 'day_2026-06-24',
      category: 'Natura',
      updatedAt: Date.now()
    };

    await clientOwner.storageService.saveActivity(purelyPublicActivity);
    await new Promise(r => setTimeout(r, 600));

    // Documento pubblico deve esistere
    const checkPubOnly = await request('GET', 'trips/0000/attivita/att_purely_public_01', ownerUid);
    assert.ok(checkPubOnly.ok, 'Documento pubblico presente su Firestore');

    // La cassaforte NON deve essere stata toccata né creata
    const checkPrivOnly = await request('GET', 'trips/0000/private_credentials/attivita_att_purely_public_01', ownerUid);
    assert.equal(checkPrivOnly.status, 404, 'Cassaforte NON creata per modifica solo pubblica');
    console.log('✓ TEST 9 SUPERATO: Modifica solo pubblica non tocca la cassaforte.');

    // =========================================================================
    // TEST 10: ERRORE DI AUTORIZZAZIONE E PERMANENZA CODA
    // =========================================================================
    console.log('\n--- TEST 10: Errore di Autorizzazione / Lockdown e Permanenza Coda ---');
    const unauthorizedEdit = {
      id: 'att_unauth_01',
      titolo: 'Tentativo di modifica non autorizzata',
      date: '2026-06-25',
      dayId: 'day_2026-06-25',
      category: 'Relax',
      updatedAt: Date.now()
    };

    // 1. Salva mutazione nella coda prima della revoca
    await clientCopilot.queueModule.savePendingMutation({
      tripId: '0000',
      entityType: 'attivita',
      action: 'save',
      data: unauthorizedEdit
    });
    assert.equal(clientCopilot.pendingQueue.length, 1);

    // 2. Simula revoca autorizzazioni per il Copilota
    clientCopilot.fakeLocalStorage.setItem('houni_revoked_trip_0000', 'true');

    // 3. Tentativo di salvataggio da sessione revocata viene respinto
    let mutateBlocked = false;
    try {
      await clientCopilot.storageService.saveActivity(unauthorizedEdit);
    } catch {
      mutateBlocked = true;
    }
    assert.ok(mutateBlocked, 'storageService deve bloccare scritture non autorizzate');

    // 4. Tentativo di svuotamento coda viene bloccato da assertAuthorized
    try {
      await clientCopilot.syncService.flushPendingQueue();
    } catch {}

    // Il documento non deve essere stato scritto su Firestore
    const checkUnauth = await request('GET', 'trips/0000/attivita/att_unauth_01', ownerUid);
    assert.equal(checkUnauth.status, 404, 'Nessuna scrittura su Firestore da sessione revocata');

    // La mutazione deve trovarsi nella coda isolata (non persa)
    assert.ok(clientCopilot.pendingQueue.some(q => q.data?.id === 'att_unauth_01'), 'Mutazione non autorizzata protetta e conservata in coda');

    // Ripristina autorizzazioni
    clientCopilot.fakeLocalStorage.removeItem('houni_revoked_trip_0000');
    clientCopilot.pendingQueue.splice(0, clientCopilot.pendingQueue.length);
    console.log('✓ TEST 10 SUPERATO: Errore autorizzazione gestito con protezione da scritture arbitrarie.');

    // =========================================================================
    // TEST 11: MODIFICHE CONCORRENTI E PRESERVAZIONE SENZA PERDITA DATI
    // =========================================================================
    console.log('\n--- TEST 11: Modifiche Concorrenti e Protezione Dati ---');
    // Pre-popola una nota su Firestore
    const baseNote = {
      id: 'note_concurrent_01',
      testo: 'Nota iniziale condivisa',
      updatedAt: 100000
    };
    await request('PATCH', 'trips/0000/note/note_concurrent_01', ownerUid, baseNote);

    // Copilota aggiorna la nota con timestamp più recente
    const copilotNote = {
      id: 'note_concurrent_01',
      testo: 'Modifica Copilota più recente',
      updatedAt: 300000
    };
    await request('PATCH', 'trips/0000/note/note_concurrent_01', copilotUid, copilotNote);

    // Owner tenta di inviare una modifica con timestamp meno recente (200000)
    const ownerConcurrentNote = {
      id: 'note_concurrent_01',
      testo: 'Modifica Owner meno recente (concorrente)',
      updatedAt: 200000
    };

    await clientOwner.syncService.pushToCloud('note', 'save', ownerConcurrentNote);

    // Verifica che la modifica dell'Owner sia stata archiviata in sicurezza senza sovrascrivere Firestore
    const checkConcurrentCloud = await request('GET', 'trips/0000/note/note_concurrent_01', ownerUid);
    const currentCloudNote = parseFields((await checkConcurrentCloud.json()).fields);
    assert.equal(currentCloudNote.testo, 'Modifica Copilota più recente', 'Firestore conserva la versione più recente');

    // L'archivio dell'Owner contiene la copia di backup del dato locale
    const conflictFound = clientOwner.conflictArchive.find(c => c.dataId === 'note_concurrent_01');
    assert.ok(conflictFound, 'Copia di backup archiviata per modifica concorrente');
    assert.equal(conflictFound.localData.testo, 'Modifica Owner meno recente (concorrente)');
    console.log('✓ TEST 11 SUPERATO: Modifiche concorrenti gestite con archivio di sicurezza e zero perdita dati.');

    console.log('\n====================================================================');
    console.log('✓✓✓ TUTTI GLI 11 TEST DI SINCRONIZZAZIONE AUTOMATICA LIVE E SICUREZZA SUPERATI! ✓✓✓');
    console.log('====================================================================');

  } finally {
    emulator.kill();
  }
})().catch(err => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
