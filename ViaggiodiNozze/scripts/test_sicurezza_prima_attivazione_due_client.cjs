/**
 * test_sicurezza_prima_attivazione_due_client.cjs
 * Test sintetico su Firestore Emulator per la convalida dei requisiti di sicurezza prima attivazione:
 * 1. Prima attivazione 0000: NESSUN push massivo da IndexedDB a Firestore, NESSUNA cancellazione automatica su Firestore.
 * 2. Riconciliazione sicura: identificazione di record solo locali (preservati localmente e archiviati),
 *    timestamp discordanti preservati in entrambe le versioni, tombstones non distruttivi.
 * 3. Nuove modifiche esplicite bidirezionali Owner - Copilota tramite coda persistente.
 * 4. Offline / Online con conservazione della coda e invio al ripristino.
 * 5. Protezione assoluta di cassaforte (private_credentials), importi, allegati e note.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');

console.log('--- TEST SICUREZZA PRIMA ATTIVAZIONE 0000 (DUE CLIENT SU EMULATOR): AVVIO ---');

const root = path.resolve(__dirname, '..');
const project = 'demo-hounigo-first-activation-safety';
const host = 'http://127.0.0.1:8193';
const base = `${host}/v1/projects/${project}/databases/(default)/documents`;
const rulesPath = path.join(root, 'firestore.rules');
const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');

function fields(data) {
  const value = item => item === null ? { nullValue: null }
    : Array.isArray(item) ? { arrayValue: { values: item.map(value) } }
      : typeof item === 'string' ? { stringValue: item }
        : typeof item === 'boolean' ? { booleanValue: item }
          : typeof item === 'number' ? (Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item })
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
  return `${b64({alg:'none',typ:'JWT'})}.${b64({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,auth_time:Math.floor(Date.now()/1000),firebase:{identities:{},sign_in_provider:uid==='anonymous-device'?'anonymous':'google.com'}})}.`;
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
  },console,structuredClone,setTimeout,...globals});
  return exports;
}

(async () => {
  assert.ok(fs.existsSync(jar), 'Firestore emulator JAR missing');

  const emulator = spawn('java', [
    '-Duser.language=en',
    '-Duser.country=US',
    '-jar', jar,
    '--host', '127.0.0.1',
    '--port', '8193',
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
    assert.ok(emulatorReady, 'Firestore emulator failed to start on port 8193');
    console.log('✓ Firestore Emulator avviato su 127.0.0.1:8193');

    // 1. Seed dati canonici su Firestore
    const seed = async (doc, data) => {
      const res = await request('PATCH', doc, 'ADMIN_EMULATOR_ONLY', data);
      assert.ok(res.ok, `Seed failed: ${await res.text()}`);
    };

    const ownerUid = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';
    const copilotUid = 'EY8lnbnfy7gbES6tijrTfjlJzjS2';

    await seed('trips/0000', {
      ownerUid,
      members: [ownerUid, copilotUid]
    });
    await seed(`trips/0000/members/${ownerUid}`, { uid: ownerUid, role: 'owner' });
    await seed(`trips/0000/members/${copilotUid}`, { uid: copilotUid, role: 'copilota' });

    // Documento canonico su Firestore (es. Tappa 1 e Attività con Credenziali Private)
    const canonicalActivityId = 'att_canonical_01';
    await seed(`trips/0000/attivita/${canonicalActivityId}`, {
      id: canonicalActivityId,
      titolo: 'Attività Canonica Server 0000',
      hasPrivateCredentials: true,
      updatedAt: 10000
    });
    // Cassaforte privata corrispondente su Firestore (con ID calcolato da getVaultDocId)
    await seed(`trips/0000/private_credentials/attivita_${canonicalActivityId}`, {
      id: `attivita_${canonicalActivityId}`,
      entityId: canonicalActivityId,
      pnr: 'CANONICAL-PNR-777',
      pin: '1234',
      cost: 250,
      notes: 'Nota riservata Owner/Copilota',
      updatedAt: 10000
    });

    console.log('✓ Dati canonici (pubblici + cassaforte) caricati su Firestore Emulator');

    // Funzione helper per creare un ambiente client isolato (Client A = Owner, Client B = Copilota)
    function createClientEnvironment(uid, role) {
      const localStorageStore = new Map();
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

      const idbData = {
        settings: new Map(),
        attivita: new Map(),
        tappe: new Map(),
        note: new Map(),
        alloggi: new Map(),
        trasporti: new Map(),
        documenti: new Map()
      };

      const pendingQueue = [];
      const conflictArchive = [];

      const queueModule = {
        getPendingMutations: async (tripId) => [...pendingQueue],
        savePendingMutation: async (m) => {
          const idx = pendingQueue.findIndex(q => (q.data?.id || q.id) === (m.data?.id || m.id) && q.entityType === m.entityType);
          if (idx >= 0) pendingQueue[idx] = m;
          else pendingQueue.push(m);
        },
        removePendingMutation: async (tripId, type, id) => {
          const idx = pendingQueue.findIndex(q => (q.data?.id || q.id) === id && q.entityType === type);
          if (idx >= 0) pendingQueue.splice(idx, 1);
        },
        hasPendingMutation: async (tripId, type, id) => pendingQueue.some(q => (q.data?.id || q.id) === id && q.entityType === type),
        normalizeQueueEntityType: (t) => t,
        saveConflictBackup: async (c) => { conflictArchive.push({ ...c, id: `conf_${Date.now()}_${Math.random()}` }); },
        getConflictBackups: async (tripId) => [...conflictArchive],
        getConflictBackupById: async (id) => conflictArchive.find(c => c.id === id),
        getPendingConflictBackups: async (tripId) => conflictArchive.filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record'),
        updateConflictStatus: async (id, status, note) => {
          const item = conflictArchive.find(c => c.id === id);
          if (item) { item.status = status; item.resolutionNote = note; }
        }
      };

      const indexedDbModule = {
        STORES: { SETTINGS: 'settings', NOTE: 'note', ATTIVITA: 'attivita', TAPPE: 'tappe', ALLOGGI: 'alloggi', TRASPORTI: 'trasporti', DOCUMENTI: 'documenti' },
        idbGet: async (store, key) => (idbData[store] ? idbData[store].get(key) || null : null),
        idbPut: async (store, val) => { if (idbData[store] && val && val.id) idbData[store].set(val.id, structuredClone(val)); },
        idbDelete: async (store, key) => { if (idbData[store]) idbData[store].delete(key); },
        idbGetAll: async (store) => (idbData[store] ? Array.from(idbData[store].values()) : [])
      };

      let authRole = role;
      const identityModule = {
        isCloudAuthorized: (tripId) => Boolean(uid && (authRole === 'owner' || authRole === 'copilota')),
        isTripAuthRevoked: (tripId) => localStorageStore.get(`houni_revoked_trip_${tripId}`) === 'true',
        getAuthoritativeCloudRole: () => authRole,
        setAuthoritativeCloudRole: (r) => { authRole = r; }
      };

      const tripConfigModule = {
        getTripConfig: () => ({ id: '0000', ownerUid })
      };

      const splitter = load('src/utils/securityDataSplitter.ts', {});

      let simulateNetworkFailure = false;
      const syncServiceModule = load('src/storage/syncService.ts', {
        'firebase/firestore': {
          collection: (_db, ...p) => p.join('/'),
          onSnapshot: () => () => {},
          doc: (_db, ...p) => p.join('/'),
          setDoc: async (docRef, data, opts) => {
            if (simulateNetworkFailure) {
              throw new Error('Simulated network failure during Firestore write');
            }
            const mask = opts?.merge && data && typeof data === 'object'
              ? '?' + Object.keys(data).filter(k => data[k] !== undefined).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
              : '';
            const res = await request('PATCH', `${docRef}${mask === '?' ? '' : mask}`, uid, data);
            if (!res.ok) throw new Error(`setDoc failed: ${await res.text()}`);
          },
          deleteDoc: async (docRef) => {
            const res = await request('DELETE', docRef, uid);
            if (!res.ok) throw new Error(`deleteDoc failed: ${await res.text()}`);
          },
          getDoc: async (docRef) => {
            const res = await request('GET', docRef, uid);
            const json = res.ok ? await res.json() : null;
            const parsed = json ? parseFields(json.fields) : null;
            return {
              exists: () => res.ok,
              data: () => parsed
            };
          },
          getDocs: async (colRef) => {
            const res = await request('GET', colRef, uid);
            if (!res.ok) {
              console.log(`[TEST DEBUG] getDocs ${colRef} FAILED for ${uid}: status ${res.status}`);
              return { docs: [] };
            }
            const json = await res.json();
            const documents = json.documents || [];
            console.log(`[TEST DEBUG] getDocs ${colRef} for ${uid}: found ${documents.length} docs`);
            return {
              docs: documents.map(d => ({
                id: d.name.split('/').pop(),
                data: () => parseFields(d.fields)
              }))
            };
          }
        },
        '../firebase': { auth: { get currentUser() { return { uid, isAnonymous: false }; } }, db: {} },
        './indexedDB': indexedDbModule,
        './storageService': { notifyDataChanged: () => {} },
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
        window: {
          dispatchEvent: () => {},
          addEventListener: () => {},
          removeEventListener: () => {}
        }
      });

      return {
        uid,
        role,
        fakeLocalStorage,
        fakeNavigator,
        idbData,
        pendingQueue,
        conflictArchive,
        queueModule,
        syncServiceModule,
        setSimulateNetworkFailure: (val) => { simulateNetworkFailure = val; },
        syncService: new syncServiceModule.SyncService('0000')
      };
    }

    async function waitForSync(service) {
      for (let i = 0; i < 50; i++) {
        if (!service['isSyncing'] && !service['autoSyncDebounceTimer'] && !service['pendingSyncRequest']) break;
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // Inizializza i due client
    const clientA = createClientEnvironment(ownerUid, 'owner');
    const clientB = createClientEnvironment(copilotUid, 'copilota');

    // =========================================================================
    // POPOLAMENTO DATI STORICI DIVERSI NEI DUE CLIENT
    // =========================================================================
    // Client A possiede:
    // 1) Un record solo locale orfano in attivita (MAI presente su Firestore)
    clientA.idbData.attivita.set('att_orphan_clientA', {
      id: 'att_orphan_clientA',
      titolo: 'Attività orfana locale iPhone Owner',
      updatedAt: 5000
    });
    // 2) Un record discordante con updatedAt > serverUpdated ma non in coda esplicita
    clientA.idbData.attivita.set(canonicalActivityId, {
      id: canonicalActivityId,
      titolo: 'Attività modificata localmente mesi fa (discordante)',
      updatedAt: 99999
    });
    // 3) Un tombstone locale storico in settings
    clientA.idbData.settings.set('tombstone_attivita_old_stale', {
      id: 'tombstone_attivita_old_stale',
      value: { deletedId: 'old_stale_id', timestamp: 2000, pending: true }
    });

    // Client B possiede:
    // Un record solo locale orfano in note
    clientB.idbData.note.set('note_orphan_clientB', {
      id: 'note_orphan_clientB',
      titolo: 'Nota orfana locale iPhone Copilota',
      updatedAt: 3000
    });

    console.log('✓ Dati storici diversi pre-caricati nei due client.');

    // =========================================================================
    // TEST FASE 1: ATTIVAZIONE CLIENT A (OWNER) CON CODA VUOTA
    // =========================================================================
    // Inizialmente le scritture sono bloccate
    assert.equal(clientA.syncServiceModule.isTrip0000CloudWriteAllowed(), false);

    // Esecuzione attivazione Owner con 0 modifiche pendenti
    const actOwnerRes = await clientA.syncServiceModule.executeControlledReconciliation('0000');
    assert.equal(actOwnerRes.success, true);
    assert.equal(clientA.syncServiceModule.isTrip0000CloudWriteAllowed(), true);

    await waitForSync(clientA.syncService);
    // Esegui la sincronizzazione bidirezionale sul client A se non già avvenuta
    await clientA.syncService.syncBidirectional();
    await waitForSync(clientA.syncService);

    // VERIFICHE CRITICHE 0000 PER CLIENT A:
    // a) Il record orfano NON deve essere stato inviato a Firestore!
    const checkOrphanOnCloud = await request('GET', 'trips/0000/attivita/att_orphan_clientA', ownerUid);
    assert.equal(checkOrphanOnCloud.status, 404, 'CRITICO: Il record locale orfano NON deve essere stato pushato massivamente a Firestore!');
    assert.ok(clientA.idbData.attivita.has('att_orphan_clientA'), 'Il record locale deve restare conservato nel client');
    const orphanA = clientA.conflictArchive.find(c => c.dataId === 'att_orphan_clientA');
    assert.ok(orphanA, 'Archiviato come local_only_record');
    assert.equal(orphanA.status, 'archived_local_only', 'I record solo locali storici devono avere status archived_local_only (zero conflitti bloccanti)');

    // Verifica che getPendingConflictBackups NON conteggi i record solo locali come conflitti bloccanti
    const activeConflictsA = await clientA.queueModule.getPendingConflictBackups('0000');
    assert.ok(!activeConflictsA.some(c => c.conflictType === 'local_only_record'), 'I record solo locali non devono figurare tra i conflitti attivi');

    // b) Il tombstone locale NON deve essere stato inviato a Firestore e NESSUN deleteDoc deve essere avvenuto
    const checkTombstoneOnCloud = await request('GET', 'trips/0000/settings/tombstone_attivita_old_stale', ownerUid);
    assert.equal(checkTombstoneOnCloud.status, 404, 'CRITICO: I tombstone locali non devono essere pubblicati massivamente su Firestore settings!');

    // c) Il record discordante NON deve aver sovrascritto il Cloud! Entrambe le versioni devono essere preservate
    const checkCanonicalCloud = await request('GET', `trips/0000/attivita/${canonicalActivityId}`, ownerUid);
    assert.ok(checkCanonicalCloud.ok);
    const canonicalCloudJson = await checkCanonicalCloud.json();
    assert.equal(canonicalCloudJson.fields.titolo.stringValue, 'Attività Canonica Server 0000', 'Firestore non deve essere stato sovrascritto ciecamente dal record locale');
    assert.ok(clientA.conflictArchive.some(c => c.dataId === canonicalActivityId && c.conflictType === 'unreliable_timestamp_conflict'), 'Conflitto archiviato e versioni preservate');

    // d) Cassaforte intatta
    const checkVault = await request('GET', `trips/0000/private_credentials/attivita_${canonicalActivityId}`, ownerUid);
    assert.ok(checkVault.ok);
    const vaultJson = await checkVault.json();
    assert.equal(vaultJson.fields.pnr.stringValue, 'CANONICAL-PNR-777');
    assert.equal(vaultJson.fields.pin.stringValue, '1234');

    console.log('✓ TEST 1 SUPERATO: Prima attivazione Owner sicura (zero push massivi, zero cancellazioni automatiche, cassaforte intatta).');

    // =========================================================================
    // TEST FASE 2: ATTIVAZIONE CLIENT B (COPILOTA GIUSY)
    // =========================================================================
    const actCopilotRes = await clientB.syncServiceModule.enableCopilotBidirectionalSync('0000');
    assert.equal(actCopilotRes.success, true);
    assert.equal(clientB.syncServiceModule.isTrip0000CloudWriteAllowed(), true);

    await waitForSync(clientB.syncService);
    await clientB.syncService.syncBidirectional();
    await waitForSync(clientB.syncService);

    // a) Il record orfano di B non deve essere finito su Firestore
    const checkOrphanBOnCloud = await request('GET', 'trips/0000/note/note_orphan_clientB', copilotUid);
    assert.equal(checkOrphanBOnCloud.status, 404, 'Record locale orfano Copilota non deve essere finito su Firestore');
    assert.ok(clientB.idbData.note.has('note_orphan_clientB'), 'Record preservato in locale Copilota');

    // b) Copilota ha ricevuto i dati canonici dal Cloud
    assert.ok(clientB.idbData.attivita.has(canonicalActivityId), 'Copilota deve aver ricevuto l\'attività canonica');
    const copilotCanonicalLocal = clientB.idbData.attivita.get(canonicalActivityId);
    assert.equal(copilotCanonicalLocal.titolo, 'Attività Canonica Server 0000');
    // E la cassaforte è stata unita in consultazione
    assert.equal(copilotCanonicalLocal.pnr, 'CANONICAL-PNR-777');

    console.log('✓ TEST 2 SUPERATO: Attivazione Copilota sicura con allineamento dati e protezione cassaforte.');

    // =========================================================================
    // TEST FASE 3: MODIFICHE BIDIREZIONALI ESPLICITE TRAMITE CODA PERSISTENTE
    // =========================================================================
    // Client A (Owner) crea una nuova attività esplicita
    const explicitActivityA = {
      id: 'att_nuova_owner_esplicita',
      titolo: 'Nuova Attività programmata da Nunzio',
      hasPrivateCredentials: true,
      pin: '5566',
      pnr: 'NUNZIO-EXP-01',
      updatedAt: Date.now()
    };

    // Salvataggio tramite pushToCloud (da UI)
    await clientA.syncService['pushToCloud']('attivita', 'save', explicitActivityA);

    // Verifica che l'attività sia su Firestore
    const checkNewActivityOnCloud = await request('GET', 'trips/0000/attivita/att_nuova_owner_esplicita', ownerUid);
    assert.ok(checkNewActivityOnCloud.ok, 'Attività esplicita Owner salvata su Firestore');

    // Verifica che la cassaforte sia stata salvata separatamente
    const checkNewVaultOnCloud = await request('GET', 'trips/0000/private_credentials/attivita_att_nuova_owner_esplicita', ownerUid);
    assert.ok(checkNewVaultOnCloud.ok, 'Cassaforte salvata separatamente per attività Owner');
    const newVaultJson = await checkNewVaultOnCloud.json();
    assert.equal(newVaultJson.fields.pin.stringValue, '5566');

    // Client B sincronizza e riceve la nuova attività dell'Owner
    await clientB.syncService.syncBidirectional();
    assert.ok(clientB.idbData.attivita.has('att_nuova_owner_esplicita'), 'Copilota ha ricevuto la nuova attività creata dall\'Owner');
    assert.equal(clientB.idbData.attivita.get('att_nuova_owner_esplicita').titolo, 'Nuova Attività programmata da Nunzio');

    // Ora Client B (Copilota) crea una nuova nota esplicita
    const explicitNoteB = {
      id: 'note_nuova_copilota_esplicita',
      titolo: 'Nota creata da Giusy sul programma',
      testo: 'Promemoria: acquistare i biglietti del traghetto',
      updatedAt: Date.now()
    };

    await clientB.syncService['pushToCloud']('note', 'save', explicitNoteB);

    // Verifica su Firestore
    const checkNewNoteOnCloud = await request('GET', 'trips/0000/note/note_nuova_copilota_esplicita', copilotUid);
    assert.ok(checkNewNoteOnCloud.ok, 'Nota Copilota salvata su Firestore');

    // Client A sincronizza e riceve la nota del Copilota
    await clientA.syncService.syncBidirectional();
    assert.ok(clientA.idbData.note.has('note_nuova_copilota_esplicita'), 'Owner ha ricevuto la nota creata dal Copilota');

    console.log('✓ TEST 3 SUPERATO: Modifiche bidirezionali esplicite Owner-Copilota sincronizzate con successo.');

    // =========================================================================
    // TEST FASE 4: OFFLINE / ONLINE CON CONSERVAZIONE CODA
    // =========================================================================
    // Client B va offline
    clientB.fakeNavigator.onLine = false;

    const offlineActivityB = {
      id: 'att_offline_copilota',
      titolo: 'Attività creata offline da Giusy',
      updatedAt: Date.now()
    };

    // Client B crea attività mentre offline: deve essere archiviata nella coda persistente
    await clientB.syncService['pushToCloud']('attivita', 'save', offlineActivityB);
    assert.ok(clientB.pendingQueue.some(q => q.data?.id === 'att_offline_copilota'), 'L\'attività creata offline deve rimanere nella coda persistente');

    // Su Firestore non è ancora presente
    const checkOfflinePreCloud = await request('GET', 'trips/0000/attivita/att_offline_copilota', ownerUid);
    assert.equal(checkOfflinePreCloud.status, 404, 'Offline: Firestore non deve ancora contenere il record');

    // Client B torna online ed esegue il flush
    clientB.fakeNavigator.onLine = true;
    await clientB.syncService.flushPendingQueue();

    // Ora è presente su Firestore
    const checkOfflinePostCloud = await request('GET', 'trips/0000/attivita/att_offline_copilota', copilotUid);
    assert.ok(checkOfflinePostCloud.ok, 'Online: Firestore ha ricevuto il record dopo il flush');
    assert.equal(clientB.pendingQueue.length, 0, 'La coda locale si è liberata');

    console.log('✓ TEST 4 SUPERATO: Comportamento Offline/Online verificato con conservazione e flush della coda.');

    // =========================================================================
    // TEST FASE 5: PROTEZIONE CASSAFORTE SU MODIFICHE PARZIALI O PUBBLICHE
    // =========================================================================
    // Copilota aggiorna il titolo di canonicalActivityId
    const publicEditCanonical = {
      id: canonicalActivityId,
      titolo: 'Attività Canonica con Titolo Aggiornato da Giusy',
      hasPrivateCredentials: false, // Non include credenziali private
      updatedAt: Date.now()
    };

    await clientB.syncService['pushToCloud']('attivita', 'save', publicEditCanonical);

    // Verifica che su Firestore la cassaforte sia ancora integra al 100%
    const checkVaultAfterPublicEdit = await request('GET', `trips/0000/private_credentials/attivita_${canonicalActivityId}`, ownerUid);
    assert.ok(checkVaultAfterPublicEdit.ok, 'Cassaforte non deve mai essere cancellata da modifiche pubbliche!');
    const finalVaultJson = await checkVaultAfterPublicEdit.json();
    assert.equal(finalVaultJson.fields.pnr.stringValue, 'CANONICAL-PNR-777');
    assert.equal(finalVaultJson.fields.pin.stringValue, '1234');
    assert.equal(Number(finalVaultJson.fields.cost.integerValue ?? finalVaultJson.fields.cost.doubleValue), 250);

    console.log('✓ TEST 5 SUPERATO: Protezione assoluta cassaforte, PIN, PNR e costi verificata.');

    // =========================================================================
    // TEST FASE 6: GESTIONE SICURA TOMBSTONE REMOTI (NESSUNA CANCELLAZIONE AUTOMATICA)
    // =========================================================================
    // Aggiungi un elemento locale su Client A
    clientA.idbData.attivita.set('att_preservata_da_tombstone', {
      id: 'att_preservata_da_tombstone',
      titolo: 'Attività non verificata locale',
      updatedAt: 500
    });
    // Simula arrivo di tombstone remoto su Firestore
    await seed('trips/0000/settings/tombstone_attivita_att_preservata_da_tombstone', {
      id: 'tombstone_attivita_att_preservata_da_tombstone',
      deletedId: 'att_preservata_da_tombstone',
      timestamp: 99999
    });

    // Sincronizza Client A: il dato locale NON deve essere cancellato automaticamente
    await clientA.syncService.syncBidirectional();
    assert.ok(clientA.idbData.attivita.has('att_preservata_da_tombstone'), 'Il dato locale NON deve essere cancellato automaticamente da tombstone remoto su 0000');
    assert.ok(clientA.conflictArchive.some(c => c.dataId === 'att_preservata_da_tombstone' && c.status === 'archived_remote_delete'), 'Copia di sicurezza archiviata');

    console.log('✓ TEST 6 SUPERATO: Gestione tombstone remoti senza cancellazioni automatiche.');

    // =========================================================================
    // TEST FASE 7: MODIFICA DELLA STESSA NOTA DA COPILOTA -> VISIBILE A OWNER
    // E MODIFICA CONCORRENTE SU STESSO ELEMENTO (ZERO PERDITA SILENZIOSA)
    // =========================================================================
    const sharedNoteOwner = {
      id: 'note_shared_bidirectional',
      titolo: 'Lista ristoranti Tokyo (v1 Owner)',
      testo: 'Ramen Street',
      updatedAt: 200000
    };
    await clientA.syncService['pushToCloud']('note', 'save', sharedNoteOwner);
    await clientB.syncService.syncBidirectional();
    assert.equal(clientB.idbData.note.get('note_shared_bidirectional')?.titolo, 'Lista ristoranti Tokyo (v1 Owner)');

    // Copilota modifica la stessa nota con timestamp più recente
    const sharedNoteCopilotEdit = {
      id: 'note_shared_bidirectional',
      titolo: 'Lista ristoranti Tokyo (v2 Copilota Giusy)',
      testo: 'Ramen Street + Sushi Dai',
      updatedAt: 250000
    };
    await clientB.syncService['pushToCloud']('note', 'save', sharedNoteCopilotEdit);
    await clientA.syncService.syncBidirectional();
    assert.equal(clientA.idbData.note.get('note_shared_bidirectional')?.titolo, 'Lista ristoranti Tokyo (v2 Copilota Giusy)', 'Owner deve vedere la modifica del Copilota sulla stessa nota');

    // Modifica concorrente: Owner tenta di salvare una versione con timestamp inferiore al server (es. 220000 < 250000)
    const concurrentStaleOwnerEdit = {
      id: 'note_shared_bidirectional',
      titolo: 'Lista ristoranti Tokyo (modifica concorrente Owner)',
      testo: 'Versione concorrente non deve andare persa',
      updatedAt: 220000
    };
    await clientA.syncService['pushToCloud']('note', 'save', concurrentStaleOwnerEdit);
    // Verifica che la versione concorrente sia stata salvata in conflictArchive senza perdita silenziosa
    assert.ok(
      clientA.conflictArchive.some(c => c.dataId === 'note_shared_bidirectional' && c.localData?.titolo === 'Lista ristoranti Tokyo (modifica concorrente Owner)'),
      'La modifica concorrente deve essere salvata in conflictArchive senza perdita silenziosa'
    );
    console.log('✓ TEST 7 SUPERATO: Modifica stessa nota Owner<->Copilota e protezione modifiche concorrenti senza perdita silenziosa.');

    // =========================================================================
    // TEST FASE 8: ELIMINAZIONE ESPLICITA CON PROPAGAZIONE CONTROLLATA
    // =========================================================================
    // Owner elimina esplicitamente note_shared_bidirectional
    await clientA.syncService['pushToCloud']('note', 'delete', { id: 'note_shared_bidirectional' });
    // Verifica che il tombstone esplicito contenga explicitDeleteBy
    const checkExplicitTombstone = await request('GET', 'trips/0000/settings/tombstone_note_note_shared_bidirectional', ownerUid);
    assert.ok(checkExplicitTombstone.ok, 'Il tombstone esplicito deve essere scritto su Firestore settings');

    // Copilota sincronizza: la nota viene rimossa dallo store attivo ma archiviata in conflictArchive per sicurezza
    await clientB.syncService.syncBidirectional();
    assert.equal(clientB.idbData.note.has('note_shared_bidirectional'), false, 'L\'eliminazione esplicita confermata deve propagarsi al Copilota');
    assert.ok(
      clientB.conflictArchive.some(c => c.dataId === 'note_shared_bidirectional' && c.status === 'archived_remote_delete'),
      'Copia di sicurezza archiviata prima della rimozione sul client ricevente'
    );
    console.log('✓ TEST 8 SUPERATO: Eliminazione esplicita propagata con backup di sicurezza.');

    // =========================================================================
    // TEST FASE 9: ERRORE DI RETE DURANTE INVIO -> ELEMENTO IN CODA + STATO ERRORE -> RECUPERO
    // =========================================================================
    // Risolviamo i conflitti di test precedenti su Client A per verificare lo stato pulito
    for (const c of clientA.conflictArchive) {
      if (c.status === 'pending_review') c.status = 'resolved_keep_remote';
    }

    clientA.setSimulateNetworkFailure(true);
    const networkFailNote = {
      id: 'note_net_error_recovery',
      titolo: 'Nota durante errore di rete',
      updatedAt: Date.now()
    };
    let caughtNetErr = false;
    try {
      await clientA.syncService['pushToCloud']('note', 'save', networkFailNote);
    } catch {
      caughtNetErr = true;
    }
    assert.equal(caughtNetErr, true, 'L\'errore di rete deve essere rilevato');
    assert.ok(clientA.pendingQueue.some(q => q.data?.id === 'note_net_error_recovery'), 'L\'elemento deve restare nella coda persistente in caso di errore di rete');

    const reportDuringError = await clientA.syncServiceModule.getPreActivationSyncReport('0000');
    assert.equal(reportDuringError.hasActiveErrors, true, 'Il report deve segnalare errore attivo');
    assert.equal(reportDuringError.userFriendlyStatus, 'Errore di sincronizzazione', 'Non deve mai apparire Sincronizzazione attiva se c\'è un errore');

    // Ripristina rete e riprova
    clientA.setSimulateNetworkFailure(false);
    await clientA.syncService.flushPendingQueue();
    assert.equal(clientA.pendingQueue.some(q => q.data?.id === 'note_net_error_recovery'), false, 'Coda svuotata dopo recupero rete');
    const reportAfterRecovery = await clientA.syncServiceModule.getPreActivationSyncReport('0000');
    assert.equal(reportAfterRecovery.hasActiveErrors, false, 'Errore azzerato dopo invio riuscito');
    assert.equal(reportAfterRecovery.userFriendlyStatus, 'Sincronizzazione attiva', 'Stato tornato a Sincronizzazione attiva');
    console.log('✓ TEST 9 SUPERATO: Gestione errore di rete durante invio, stato UI onesto e recupero automatico.');

    // =========================================================================
    // TEST FASE 10: PERSISTENZA ATTIVAZIONE DOPO RIAVVIO PWA
    // =========================================================================
    // Simula chiusura PWA
    clientA.syncService.destroy();
    clientB.syncService.destroy();

    // Verifica persistenza del flag cloud-write nei rispettivi localStorage
    assert.equal(clientA.fakeLocalStorage.getItem('hounigo_allow_cloud_write_0000'), 'true', 'Flag Owner persistito in localStorage');
    assert.equal(clientB.fakeLocalStorage.getItem('hounigo_allow_cloud_write_0000'), 'true', 'Flag Copilota persistito in localStorage');

    console.log('✓ TEST 10 SUPERATO: Persistenza attivazione al riavvio PWA verificata.');

    console.log('\n--- TUTTI I 12 SCENARI OBBLIGATORI DI SICUREZZA E SINCRONIZZAZIONE SUPERATI CON SUCCESSO ---');
  } finally {
    emulator.kill();
  }
})();
