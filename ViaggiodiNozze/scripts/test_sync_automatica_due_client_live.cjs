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
        isCloudAuthorized: (tripId) => Boolean(uid && (authRole === 'owner' || authRole === 'copilota')),
        isTripAuthRevoked: (tripId) => fakeLocalStorage.getItem(`houni_revoked_trip_${tripId}`) === 'true',
        getAuthoritativeCloudRole: () => authRole,
        setAuthoritativeCloudRole: (r) => { authRole = r; },
        assertCanMutate: () => {}
      };

      const tripConfigModule = {
        getTripConfig: () => ({ id: '0000', ownerUid })
      };

      const splitter = load('src/utils/securityDataSplitter.ts', {});

      const firestoreMock = {
        collection: (_db, ...p) => p.join('/'),
        doc: (_db, ...p) => p.join('/'),
        onSnapshot: (colPath, onNext) => {
          return registerCloudWatcher(colPath, onNext);
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
    // TEST 3: COPILOTA MODIFICA RECORD ESISTENTE -> INVIO E RICEZIONE OWNER LIVE
    // =========================================================================
    console.log('\n--- TEST 3: Modifica Copilota -> Ricezione automatica Owner ---');
    clientOwner.dispatchedEvents.length = 0; // reset log eventi

    const updatedByCopilot = {
      ...copilotLocalActivity,
      titolo: 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)',
      noteCopilota: 'Aggiunti sotterranei e ritrovo alle 09:30',
      updatedAt: Date.now() + 5000
    };

    // Copilota salva la modifica tramite storageService
    await clientCopilot.storageService.saveActivity(updatedByCopilot);

    // Attendi elaborazione push e snapshot
    await new Promise(r => setTimeout(r, 600));

    // Verifica su Firestore
    const resCloudFromCopilot = await request('GET', 'trips/0000/attivita/att_auto_owner_01', copilotUid);
    assert.ok(resCloudFromCopilot.ok, 'Modifica Copilota deve essere scritta su Firestore');
    const cloudCopilotData = parseFields((await resCloudFromCopilot.json()).fields);
    assert.equal(cloudCopilotData.titolo, 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)');

    // Verifica che l'Owner abbia ricevuto l'aggiornamento in IndexedDB
    const ownerReceivedFromCopilot = clientOwner.idbData.attivita.get('att_auto_owner_01');
    assert.ok(ownerReceivedFromCopilot, 'Owner deve avere il record aggiornato in IndexedDB');
    assert.equal(ownerReceivedFromCopilot.titolo, 'Visita guidata Colosseo + Sotterranei (aggiornato da Giusy)');
    assert.equal(ownerReceivedFromCopilot.noteCopilota, 'Aggiunti sotterranei e ritrovo alle 09:30');

    // Verifica evento UI emesso per l'Owner
    const uiEventsOwner = clientOwner.dispatchedEvents.filter(e =>
      e.type === 'roadbook_data_mutated' || e.type === 'attivita_updated'
    );
    assert.ok(uiEventsOwner.length > 0, 'Owner deve aver emesso evento UI per aggiornamento automatico');
    console.log('✓ TEST 3 SUPERATO: Modifica Copilota ricevuta automaticamente da Owner.');

    // =========================================================================
    // TEST 4: MODIFICA SU DATO LEGACY SENZA TIMESTAMP SU FIRESTORE (NO BLOCCO INCERTEZZA)
    // =========================================================================
    console.log('\n--- TEST 4: Modifica su record legacy senza timestamp su Firestore ---');
    const editLegacy = {
      id: 'att_legacy_no_ts',
      titolo: 'Attività Legacy Modificata Oggi dall\'Owner',
      date: '2026-06-20',
      dayId: 'day_2026-06-20',
      category: 'Relax',
      updatedAt: Date.now()
    };

    await clientOwner.storageService.saveActivity(editLegacy);
    await new Promise(r => setTimeout(r, 600));

    // Non deve essere stato creato un backup di conflitto ingiustificato
    assert.equal(clientOwner.conflictArchive.length, 0, 'Nessun falso conflitto da incertezza per record locale recente');

    // Deve essere presente su Firestore con il nuovo titolo
    const checkLegacyCloud = await request('GET', 'trips/0000/attivita/att_legacy_no_ts', ownerUid);
    assert.ok(checkLegacyCloud.ok, 'Dato legacy aggiornato deve essere su Firestore');
    const checkLegacyData = parseFields((await checkLegacyCloud.json()).fields);
    assert.equal(checkLegacyData.titolo, 'Attività Legacy Modificata Oggi dall\'Owner');
    console.log('✓ TEST 4 SUPERATO: Nessun falso blocco su record remoti privi di timestamp.');

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

    console.log('\n====================================================================');
    console.log('✓✓✓ TUTTI I 6 TEST DI SINCRONIZZAZIONE AUTOMATICA LIVE SUPERATI! ✓✓✓');
    console.log('====================================================================');

  } finally {
    emulator.kill();
  }
})().catch(err => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
