/**
 * test_foto_pre_partenza_real_case.cjs
 * Test sintetico su Firestore Emulator per la convalida rigorosa di:
 * 1. Caso reale "Foto pre partenza":
 *    - Documento pubblico già scritto su Firestore (1794057047456, orario 10:25)
 *    - Cassaforte con credenziali private storiche intatte (paymentStatus: 'da_saldare')
 *    - Riconoscimento idempotente come già sincronizzato: rimozione da coda locale senza riscritture
 * 2. Conservazione assoluta delle credenziali private:
 *    - Una modifica solo pubblica non cancella né svuota private_credentials
 * 3. Preservazione mutazione in coda:
 *    - Se i dati non coincidono o la verifica fallisce, la mutazione non viene eliminata
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');

console.log('--- TEST FOTO PRE PARTENZA E SICUREZZA CASSAFORTE: AVVIO ---');

const root = path.resolve(__dirname, '..');
const project = 'demo-foto-pre-partenza';
const host = 'http://127.0.0.1:8193';
const base = `${host}/v1/projects/${project}/databases/(default)/documents`;
const rulesPath = path.join(root, 'firestore.rules');
const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');

function fields(data) {
  const value = item => Array.isArray(item) ? { arrayValue: { values: item.map(value) } }
    : typeof item === 'string' ? { stringValue: item }
      : typeof item === 'boolean' ? { booleanValue: item }
        : typeof item === 'number' ? { integerValue: String(item) }
          : { mapValue: { fields: fields(item) } };
  return Object.fromEntries(Object.entries(data).filter(([,v])=>v !== undefined).map(([k,v])=>[k,value(v)]));
}

function parseFields(doc) {
  if (!doc || !doc.fields) return null;
  const parseVal = f => {
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('booleanValue' in f) return f.booleanValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(parseVal);
    if ('mapValue' in f) return parseFields({ fields: f.mapValue.fields });
    return null;
  };
  return Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, parseVal(v)]));
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

  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (emulator.exitCode !== null) throw new Error('Emulator exited');
      try {
        await fetch(host, { signal: AbortSignal.timeout(500) });
        ready = true;
        break;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Emulator not ready on 8193');
    console.log('✓ Firestore Emulator avviato per test Foto pre partenza');

    const ownerUid = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';

    // 1. Seed trip 0000 and owner member
    await request('PATCH', 'trips/0000', 'ADMIN_EMULATOR_ONLY', {
      ownerUid,
      members: [ownerUid]
    });
    await request('PATCH', `trips/0000/members/${ownerUid}`, 'ADMIN_EMULATOR_ONLY', {
      uid: ownerUid,
      role: 'owner'
    });

    // 2. Setup mock client environment
    let allowCloudWrite = false;
    let currentUser = { uid: ownerUid, isAnonymous: false };
    const pendingQueue = [];
    const conflictArchive = [];

    const mockIdb = {
      STORES: { SETTINGS: 'settings', ATTIVITA: 'attivita' },
      idbGet: async () => null,
      idbPut: async () => {},
      idbDelete: async () => {},
      idbGetAll: async () => []
    };

    const mockLocalMutationQueue = {
      savePendingMutation: async (m) => {
        const id = JSON.stringify([m.tripId, m.entityType, m.data.id]);
        const rec = { ...m, id, timestamp: m.timestamp || Date.now() };
        const idx = pendingQueue.findIndex(q => q.id === id);
        if (idx >= 0) pendingQueue[idx] = rec; else pendingQueue.push(rec);
      },
      removePendingMutation: async (tripId, entityType, dataId) => {
        const id = JSON.stringify([tripId, entityType, dataId]);
        const idx = pendingQueue.findIndex(q => q.id === id);
        if (idx >= 0) pendingQueue.splice(idx, 1);
      },
      getPendingMutations: async () => [...pendingQueue],
      hasPendingMutation: async (tripId, entityType, dataId) => {
        const id = JSON.stringify([tripId, entityType, dataId]);
        return pendingQueue.some(q => q.id === id);
      },
      normalizeQueueEntityType: (t) => t === 'note' || t === 'nota' ? 'note' : (t === 'attivita' ? 'attivita' : t),
      saveConflictBackup: async (rec) => { conflictArchive.push(rec); },
      getConflictBackups: async () => [...conflictArchive],
      getConflictBackupById: async (id) => conflictArchive.find(c => c.id === id) || null
    };

    const mockFirestore = {
      collection: () => ({}),
      doc: (_db, ...segments) => {
        const docPath = segments.join('/');
        return { docPath, id: segments[segments.length - 1] };
      },
      getDoc: async (ref) => {
        const res = await request('GET', ref.docPath, currentUser?.uid);
        if (!res.ok) return { exists: () => false, data: () => null };
        const json = await res.json();
        return { exists: () => true, data: () => parseFields(json) };
      },
      setDoc: async (ref, data, opts) => {
        const res = await request('PATCH', ref.docPath, currentUser?.uid, data);
        if (!res.ok) throw new Error(`setDoc failed: ${res.status} ${await res.text()}`);
      },
      deleteDoc: async (ref) => {
        const res = await request('DELETE', ref.docPath, currentUser?.uid);
        if (!res.ok && res.status !== 404) throw new Error(`deleteDoc failed: ${res.status}`);
      },
      getDocs: async () => ({ docs: [], empty: true, size: 0, forEach: () => {} }),
      onSnapshot: () => () => {}
    };

    const mockFirebase = {
      auth: { get currentUser() { return currentUser; } },
      db: {}
    };

    const mockIdentity = {
      isCloudAuthorized: () => Boolean(currentUser && !currentUser.isAnonymous),
      isTripAuthRevoked: () => false,
      getAuthoritativeCloudRole: () => 'owner'
    };

    const mockTripConfig = {
      getTripConfig: () => ({ id: '0000', ownerUid })
    };

    const mockSecuritySplitter = load('src/utils/securityDataSplitter.ts', {
      '../types': {}
    });

    const mockTripDates = {
      normalizeTimestamp: (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        const parsed = Date.parse(ts);
        return isNaN(parsed) ? 0 : parsed;
      }
    };

    const mockWindow = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      CustomEvent: class { constructor(type, dict) { this.type = type; this.detail = dict?.detail; } }
    };

    const localStorageMap = new Map();
    const fakeLocalStorage = {
      getItem: (k) => localStorageMap.get(k) || null,
      setItem: (k, v) => localStorageMap.set(k, String(v)),
      removeItem: (k) => localStorageMap.delete(k)
    };

    const syncServiceModule = load('src/storage/syncService.ts', {
      'firebase/firestore': mockFirestore,
      '../firebase': mockFirebase,
      './indexedDB': mockIdb,
      './storageService': { notifyDataChanged: () => {} },
      '../utils/tripDates': mockTripDates,
      '../utils/useAuthIdentity': mockIdentity,
      '../utils/tripConfig': mockTripConfig,
      '../services/pushNotificationService': { recordPushMutation: async () => {} },
      '../utils/securityDataSplitter': mockSecuritySplitter,
      './localMutationQueue': mockLocalMutationQueue
    }, {
      window: mockWindow,
      navigator: { onLine: true },
      localStorage: fakeLocalStorage,
      CustomEvent: mockWindow.CustomEvent
    });

    const {
      executeControlledReconciliation,
      allowCloudWriteForTrip0000,
      isTrip0000CloudWriteAllowed
    } = syncServiceModule;

    // =========================================================================
    // TEST 1: Caso Reale "Foto pre partenza"
    // =========================================================================
    console.log('--- TEST 1: Caso Reale Foto pre partenza (Riconoscimento idempotente) ---');
    const fotoId = 'fc8395a0-a15b-4f6d-96f7-cb448ed74884';
    const remoteFotoData = {
      id: fotoId,
      date: '2026-11-28',
      title: 'Foto pre partenza',
      orario: '10:25',
      time: '10:25',
      notes: 'Foto pre partenza',
      status: 'prenotato',
      hasPrivateCredentials: true,
      lastSanitizedAt: '2026-11-05T19:45:11.322Z',
      updatedAt: 1794057047456
    };

    // Seed public doc on Firestore
    await request('PATCH', `trips/0000/attivita/${fotoId}`, 'ADMIN_EMULATOR_ONLY', remoteFotoData);

    // Seed private credentials on Firestore (historical migration)
    const vaultId = `attivita_${fotoId}`;
    const initialVaultData = {
      entityType: 'attivita',
      entityId: fotoId,
      tripId: '0000',
      id: vaultId,
      paymentStatus: 'da_saldare',
      lastMigratedAt: '2026-11-05T19:45:11.322Z',
      updatedAt: '2026-11-05T19:45:11.322Z'
    };
    await request('PATCH', `trips/0000/private_credentials/${vaultId}`, 'ADMIN_EMULATOR_ONLY', initialVaultData);

    // Seed local pending queue with the Owner's modification
    pendingQueue.push({
      id: JSON.stringify(['0000', 'attivita', fotoId]),
      tripId: '0000',
      entityType: 'attivita',
      action: 'save',
      timestamp: 1794057047456,
      data: {
        id: fotoId,
        date: '2026-11-28',
        title: 'Foto pre partenza',
        orario: '10:25',
        time: '10:25',
        notes: 'Foto pre partenza',
        status: 'prenotato',
        updatedAt: 1794057047456
      }
    });

    assert.equal(pendingQueue.length, 1, 'Coda locale deve avere 1 elemento pendente');

    // Run reconciliation
    console.log('Avvio executeControlledReconciliation...');
    const recResult = await executeControlledReconciliation('0000');
    console.log('recResult:', JSON.stringify(recResult, null, 2));
    console.log('pendingQueue remaining:', pendingQueue.length);
    assert.equal(recResult.success, true, 'Riconciliazione deve avere esito positivo');
    assert.equal(recResult.remainingCount, 0, 'La coda locale deve essere stata svuotata');
    assert.equal(pendingQueue.length, 0, 'Coda locale svuotata');
    assert.equal(isTrip0000CloudWriteAllowed(), true, 'Scritture abilitate per Owner');

    // Verify Firestore vault document was NOT deleted and is strictly intact!
    const vaultCheck = await request('GET', `trips/0000/private_credentials/${vaultId}`, ownerUid);
    assert.equal(vaultCheck.status, 200, 'Il documento in private_credentials DEVE ancora esistere');
    const vaultDataCheck = parseFields(await vaultCheck.json());
    assert.equal(vaultDataCheck.paymentStatus, 'da_saldare', 'paymentStatus deve essere conservato intatto');
    console.log('✓ TEST 1 SUPERATO: Foto pre partenza riconosciuta sincronizzata, coda svuotata, cassaforte intatta.');

    // =========================================================================
    // TEST 2: Modifica solo pubblica non cancella MAI la cassaforte (Requisito 1)
    // =========================================================================
    console.log('--- TEST 2: Modifica solo pubblica non tocca private_credentials ---');
    allowCloudWriteForTrip0000(true);
    
    // Inseriamo una nuova mutazione solo pubblica (es. modifica orario a 10:30)
    pendingQueue.push({
      id: JSON.stringify(['0000', 'attivita', fotoId]),
      tripId: '0000',
      entityType: 'attivita',
      action: 'save',
      timestamp: 1794057050000,
      data: {
        id: fotoId,
        date: '2026-11-28',
        title: 'Foto pre partenza',
        orario: '10:30',
        time: '10:30',
        notes: 'Foto pre partenza aggiornata',
        status: 'prenotato',
        hasPrivateCredentials: false, // Il client non ha campi sensibili nel form
        updatedAt: 1794057050000
      }
    });

    const recResult2 = await executeControlledReconciliation('0000');
    assert.equal(recResult2.success, true);
    assert.equal(pendingQueue.length, 0);

    // Verifichiamo che il documento pubblico sia aggiornato
    const pubCheck = await request('GET', `trips/0000/attivita/${fotoId}`, ownerUid);
    const pubDataCheck = parseFields(await pubCheck.json());
    assert.equal(pubDataCheck.orario, '10:30', 'Orario pubblico aggiornato su Firestore');

    // Verifichiamo che la cassaforte NON sia stata toccata o cancellata
    const vaultCheck2 = await request('GET', `trips/0000/private_credentials/${vaultId}`, ownerUid);
    assert.equal(vaultCheck2.status, 200, 'La cassaforte NON deve essere stata cancellata');
    const vaultDataCheck2 = parseFields(await vaultCheck2.json());
    assert.equal(vaultDataCheck2.paymentStatus, 'da_saldare', 'Le credenziali private sono intatte');
    console.log('✓ TEST 2 SUPERATO: Modifica pubblica applicata, private_credentials assolutamente preservata.');

    // =========================================================================
    // TEST 3: Preservazione mutazione in coda se i dati differiscono (Requisito 3)
    // =========================================================================
    console.log('--- TEST 3: Preservazione mutazione in coda se dati discordanti ---');
    allowCloudWriteForTrip0000(false);

    // Inseriamo mutazione locale con lo stesso timestamp del server (1794057050000) ma dati diversi
    pendingQueue.push({
      id: JSON.stringify(['0000', 'attivita', fotoId]),
      tripId: '0000',
      entityType: 'attivita',
      action: 'save',
      timestamp: 1794057050000,
      data: {
        id: fotoId,
        date: '2026-11-28',
        title: 'Foto pre partenza (Diverso)',
        orario: '11:00', // Server ha 10:30!
        time: '11:00',
        notes: 'Contenuto discorde',
        status: 'prenotato',
        updatedAt: 1794057050000
      }
    });

    const recResult3 = await executeControlledReconciliation('0000');
    assert.equal(recResult3.success, false, 'Non deve dare successo su dati discordanti');
    assert.equal(pendingQueue.length, 1, 'La mutazione DEVE rimanere preservata in coda');
    assert.equal(conflictArchive.length, 1, 'Il conflitto deve essere stato archiviato');
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Cloud-write re-locked');
    console.log('✓ TEST 3 SUPERATO: Dati discordanti rilevati, mutazione preservata in coda e conflitto archiviato.');

    console.log('--- TUTTI I TEST FOTO PRE PARTENZA & CASSAFORTE SUPERATI CON SUCCESSO (3/3 PASS) ---');
  } finally {
    emulator.kill();
  }
})();
