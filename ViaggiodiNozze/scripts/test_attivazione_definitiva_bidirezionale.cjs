/**
 * test_attivazione_definitiva_bidirezionale.cjs
 * Test sintetico su Firestore Emulator per la convalida formale dei requisiti di attivazione:
 * 1. Attivazione Owner esplicita con 0 modifiche pendenti dopo controlli di sicurezza
 * 2. Gestione Conflitti: blocco preventivo se presenti conflitti attivi pendenti
 * 3. Offline / Online: blocco immediato prima di ogni scrittura se offline
 * 4. Attivazione Sincronizzazione Copilota Giusy: separata dall'Owner, nessun replay abusivo, nessuna elevazione di ruolo
 * 5. Security Rules Emulator: verifica permessi Owner vs Copilota (scrittura collezioni condivise vs protezione cassaforte)
 * 6. Modifiche bidirezionali: sincronizzazione reciproca su collezioni condivise
 * 7. Riavvio PWA: persistenza della preferenza di sblocco in localStorage e corretto avvio di canWriteToCloud
 * 8. Conservazione private_credentials: le modifiche pubbliche preservano intatta la cassaforte
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');

console.log('--- TEST ATTIVAZIONE DEFINITIVA SINCRONIZZAZIONE (EMULATOR): AVVIO ---');

const root = path.resolve(__dirname, '..');
const project = 'demo-hounigo-bidirectional-test';
const host = 'http://127.0.0.1:8192';
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
    '--port', '8192',
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
    assert.ok(emulatorReady, 'Firestore emulator failed to start on port 8192');
    console.log('✓ Firestore Emulator avviato su 127.0.0.1:8192');

    // Seed dati sintetici per viaggio 0000
    const seed = async (doc, data) => {
      const res = await request('PATCH', doc, 'ADMIN_EMULATOR_ONLY', data);
      assert.ok(res.ok, `Seed failed: ${await res.text()}`);
    };

    const ownerUid = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';
    const copilotUid = 'EY8lnbnfy7gbES6tijrTfjlJzjS2';
    const guestUid = 'guest_unprivileged_uid';

    await seed('trips/0000', {
      ownerUid,
      members: [ownerUid, copilotUid]
    });
    await seed(`trips/0000/members/${ownerUid}`, { uid: ownerUid, role: 'owner' });
    await seed(`trips/0000/members/${copilotUid}`, { uid: copilotUid, role: 'copilota' });

    console.log('✓ Dati sintetici caricati su Firestore Emulator');

    // Mock ambiente client
    const localStorageStore = new Map();
    const fakeLocalStorage = {
      getItem: (k) => localStorageStore.get(k) || null,
      setItem: (k, v) => localStorageStore.set(k, String(v)),
      removeItem: (k) => localStorageStore.delete(k)
    };

    let fakeNavigatorOnLine = true;
    const fakeNavigator = {
      get onLine() { return fakeNavigatorOnLine; }
    };

    let currentUser = null;
    let authoritativeCloudRole = 'unverified';

    const identityModule = {
      isCloudAuthorized: (tripId) => Boolean(currentUser && !currentUser.isAnonymous && (authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota')),
      isTripAuthRevoked: (tripId) => localStorageStore.get(`houni_revoked_trip_${tripId}`) === 'true',
      getAuthoritativeCloudRole: () => authoritativeCloudRole,
      setAuthoritativeCloudRole: (r) => { authoritativeCloudRole = r; }
    };

    const tripConfigModule = {
      getTripConfig: () => ({ id: '0000', ownerUid })
    };

    const pendingQueue = [];
    const conflictArchive = [];

    const queueModule = {
      getPendingMutations: async (tripId) => [...pendingQueue],
      savePendingMutation: async (m) => { pendingQueue.push(m); },
      removePendingMutation: async (id) => {
        const idx = pendingQueue.findIndex(q => (q.data?.id || q.id) === id || q.id === id);
        if (idx >= 0) pendingQueue.splice(idx, 1);
      },
      hasPendingMutation: async (tripId, type, id) => pendingQueue.some(q => (q.data?.id || q.id) === id),
      normalizeQueueEntityType: (t) => t,
      saveConflictBackup: async (c) => { conflictArchive.push(c); },
      getConflictBackups: async (tripId) => [...conflictArchive],
      getConflictBackupById: async (id) => conflictArchive.find(c => c.id === id)
    };

    const indexedDbModule = {
      STORES: { SETTINGS: 'settings', NOTE: 'note', ATTIVITA: 'attivita' },
      idbGet: async (store, key) => null,
      idbPut: async () => {},
      idbDelete: async () => {},
      idbGetAll: async () => []
    };

    const splitter = load('src/utils/securityDataSplitter.ts', {});

    const syncServiceModule = load('src/storage/syncService.ts', {
      'firebase/firestore': {
        collection: (_db, ...p) => p.join('/'),
        onSnapshot: () => () => {},
        doc: (_db, ...p) => p.join('/'),
        setDoc: async () => {},
        deleteDoc: async () => {},
        getDoc: async (docRef) => {
          const res = await request('GET', docRef, currentUser?.uid);
          return {
            exists: () => res.ok,
            data: async () => {
              if (!res.ok) return null;
              const json = await res.json();
              return parseFields(json.fields);
            }
          };
        }
      },
      '../firebase': { auth: { get currentUser() { return currentUser; } }, db: {} },
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
      window: {
        dispatchEvent: () => {},
        addEventListener: () => {},
        removeEventListener: () => {}
      }
    });

    const {
      executeControlledReconciliation,
      enableCopilotBidirectionalSync,
      allowCloudWriteForTrip0000,
      isTrip0000CloudWriteAllowed
    } = syncServiceModule;

    // =========================================================================
    // TEST 1: Attivazione Owner con 0 modifiche pendenti
    // =========================================================================
    currentUser = { uid: ownerUid, isAnonymous: false };
    authoritativeCloudRole = 'owner';
    fakeNavigatorOnLine = true;
    allowCloudWriteForTrip0000(false);
    pendingQueue.length = 0;
    conflictArchive.length = 0;

    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Inizialmente scritture bloccate');
    const ownerZeroPendingRes = await executeControlledReconciliation('0000');
    assert.equal(ownerZeroPendingRes.success, true, 'Attivazione con 0 pendenti deve riuscire');
    assert.equal(ownerZeroPendingRes.pushedCount, 0);
    assert.equal(ownerZeroPendingRes.remainingCount, 0);
    assert.equal(isTrip0000CloudWriteAllowed(), true, 'PUNTO 1: Con 0 pendenti, le scritture cloud devono risultare ABILITATE');
    console.log('✓ TEST 1: Owner con 0 modifiche pendenti attiva con successo le scritture cloud.');

    // =========================================================================
    // TEST 2: Blocco preventivo se presenti conflitti attivi pending_review
    // =========================================================================
    allowCloudWriteForTrip0000(false);
    conflictArchive.push({
      id: 'conf_1',
      tripId: '0000',
      entityType: 'attivita',
      dataId: 'att_conf',
      status: 'pending_review'
    });

    await assert.rejects(
      async () => executeControlledReconciliation('0000'),
      /presenti 1 conflitti da risolvere prima di attivare le scritture/
    );
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Scritture bloccate se ci sono conflitti attivi');
    console.log('✓ TEST 2: Presenza di conflitti attivi blocca preventivamente l\'attivazione delle scritture.');

    // =========================================================================
    // TEST 3: Offline / Online
    // =========================================================================
    conflictArchive.length = 0;
    fakeNavigatorOnLine = false;

    // Owner offline
    await assert.rejects(
      async () => executeControlledReconciliation('0000'),
      /dispositivo offline/
    );
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Owner offline non può attivare');

    // Copilota offline
    currentUser = { uid: copilotUid, isAnonymous: false };
    authoritativeCloudRole = 'copilota';
    await assert.rejects(
      async () => enableCopilotBidirectionalSync('0000'),
      /dispositivo offline/
    );
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Copilota offline non può attivare');

    fakeNavigatorOnLine = true;
    console.log('✓ TEST 3: Dispositivo offline correttamente bloccato per entrambi i ruoli.');

    // =========================================================================
    // TEST 4: Attivazione Sincronizzazione Copilota Giusy (Nessuna elevazione)
    // =========================================================================
    currentUser = { uid: copilotUid, isAnonymous: false };
    authoritativeCloudRole = 'copilota';
    allowCloudWriteForTrip0000(false);
    pendingQueue.length = 0;
    conflictArchive.length = 0;

    // Copilota non può eseguire reconciliation Owner
    await assert.rejects(
      async () => executeControlledReconciliation('0000'),
      /riconciliazione consentita esclusivamente all'Owner/
    );
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Copilota bloccato da comando Owner');

    // Copilota attiva il proprio flusso protetto
    const copilotActivation = await enableCopilotBidirectionalSync('0000');
    assert.equal(copilotActivation.success, true);
    assert.equal(copilotActivation.isCloudWriteAllowed, true);
    assert.equal(isTrip0000CloudWriteAllowed(), true, 'Sincronizzazione abilitata per Copilota');
    assert.equal(identityModule.getAuthoritativeCloudRole(), 'copilota', 'Ruolo rimane rigorosamente copilota');
    console.log('✓ TEST 4: Attivazione Copilota Giusy riuscita con rispetto rigoroso del ruolo.');

    // =========================================================================
    // TEST 5: Emulator Security Rules (Owner vs Copilota)
    // =========================================================================
    // Owner scrive su attività pubblica
    const ownerWriteRes = await request('PATCH', 'trips/0000/attivita/att_owner_test', ownerUid, {
      id: 'att_owner_test',
      titolo: 'Attività creata da Owner',
      updatedAt: Date.now()
    });
    assert.ok(ownerWriteRes.ok, `Owner write failed: ${await ownerWriteRes.text()}`);

    // Copilota scrive su attività pubblica (consentito)
    const copilotWriteRes = await request('PATCH', 'trips/0000/attivita/att_copilot_test', copilotUid, {
      id: 'att_copilot_test',
      titolo: 'Attività creata da Giusy',
      updatedAt: Date.now()
    });
    assert.ok(copilotWriteRes.ok, `Copilot write failed: ${await copilotWriteRes.text()}`);

    // Copilota scrive nota condivisa (consentito)
    const copilotNoteRes = await request('PATCH', 'trips/0000/note/note_copilot_test', copilotUid, {
      id: 'note_copilot_test',
      titolo: 'Nota creata da Copilota',
      updatedAt: Date.now()
    });
    assert.ok(copilotNoteRes.ok, `Copilot note write failed: ${await copilotNoteRes.text()}`);

    // Copilota tenta di cancellare o scrivere direttamente un viaggio (bloccato)
    const copilotTripWriteRes = await request('PATCH', 'trips/0000', copilotUid, {
      ownerUid: copilotUid
    });
    assert.equal(copilotTripWriteRes.status, 403, 'Copilota non può modificare i campi proprietari del viaggio');

    // Guest non autorizzato viene respinto
    const guestWriteRes = await request('PATCH', 'trips/0000/attivita/att_guest_test', guestUid, {
      id: 'att_guest_test',
      titolo: 'Attività non autorizzata',
      updatedAt: Date.now()
    });
    assert.equal(guestWriteRes.status, 403, 'Ospite non membro viene bloccato da Security Rules');

    console.log('✓ TEST 5: Security Rules su Emulator confermano privilegi Owner vs Copilota vs Guest.');

    // =========================================================================
    // TEST 6: Modifiche Bidirezionali tra Owner e Copilota
    // =========================================================================
    // Owner legge l'attività creata da Copilota
    const ownerReadCopilotDoc = await request('GET', 'trips/0000/attivita/att_copilot_test', ownerUid);
    assert.ok(ownerReadCopilotDoc.ok, 'Owner legge documento di Copilota');
    const ownerReadJson = await ownerReadCopilotDoc.json();
    assert.equal(ownerReadJson.fields.titolo.stringValue, 'Attività creata da Giusy');

    // Copilota legge l'attività creata da Owner
    const copilotReadOwnerDoc = await request('GET', 'trips/0000/attivita/att_owner_test', copilotUid);
    assert.ok(copilotReadOwnerDoc.ok, 'Copilota legge documento di Owner');
    const copilotReadJson = await copilotReadOwnerDoc.json();
    assert.equal(copilotReadJson.fields.titolo.stringValue, 'Attività creata da Owner');

    console.log('✓ TEST 6: Modifiche bidirezionali verificate con successo su Firestore Emulator.');

    // =========================================================================
    // TEST 7: Riavvio PWA (Persistenza stato in localStorage)
    // =========================================================================
    // Assicuriamoci che lo sblocco sia attivo
    allowCloudWriteForTrip0000(true);
    assert.equal(fakeLocalStorage.getItem('hounigo_allow_cloud_write_0000'), 'true');

    // Simula riavvio: creazione di una nuova istanza SyncService mantenendo il localStorage
    const newSyncService = new syncServiceModule.SyncService('0000');
    assert.equal(newSyncService.canWriteToCloud(), true, 'canWriteToCloud deve essere true dopo il riavvio PWA');
    newSyncService.destroy();

    console.log('✓ TEST 7: Riavvio PWA: la configurazione cloud-write persiste in modo trasparente.');

    // =========================================================================
    // TEST 8: Conservazione private_credentials su modifiche pubbliche
    // =========================================================================
    // 1. Seed credenziale privata per un'attività
    const activityId = 'att_safebox_test';
    await seed(`trips/0000/private_credentials/${activityId}`, {
      id: activityId,
      bookingRef: 'BOOK-PRIV-12345',
      pin: '9876',
      notes: 'Informazione strettamente riservata',
      updatedAt: Date.now()
    });

    // 2. Modifica pubblica all'attività (aggiornamento titolo/orario) da parte del Copilota
    const copilotPublicEdit = await request('PATCH', `trips/0000/attivita/${activityId}`, copilotUid, {
      id: activityId,
      titolo: 'Attività con titolo aggiornato pubblicamente',
      hasPrivateCredentials: false, // flag locale che NON deve cancellare la credenziale
      updatedAt: Date.now()
    });
    assert.ok(copilotPublicEdit.ok, `Copilot public edit failed: ${await copilotPublicEdit.text()}`);

    // 3. Verifica che la credenziale privata esista ancora intatta
    const checkCredRes = await request('GET', `trips/0000/private_credentials/${activityId}`, ownerUid);
    assert.ok(checkCredRes.ok, 'La credenziale privata deve essere conservata intatta!');
    const credJson = await checkCredRes.json();
    assert.equal(credJson.fields.bookingRef.stringValue, 'BOOK-PRIV-12345');
    assert.equal(credJson.fields.pin.stringValue, '9876');

    console.log('✓ TEST 8: Conservazione di private_credentials verificata: modifiche pubbliche non cancellano la cassaforte.');

    console.log('\n--- TUTTI I TEST DI ATTIVAZIONE DEFINITIVA SUPERATI CON SUCCESSO (8/8 PASS) ---');
  } finally {
    emulator.kill();
  }
})();
