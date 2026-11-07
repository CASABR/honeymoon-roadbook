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
      saveConflictBackup: async (rec) => {
        const id = rec.id || `${rec.tripId}_${rec.entityType}_${rec.dataId}_${Date.now()}`;
        conflictArchive.push({ ...rec, id, savedAt: Date.now(), status: rec.status || 'pending_review' });
        return id;
      },
      getConflictBackups: async () => [...conflictArchive],
      getPendingConflictBackups: async () => conflictArchive.filter(c => c.status === 'pending_review'),
      getConflictBackupById: async (id) => conflictArchive.find(c => c.id === id) || null,
      updateConflictStatus: async (id, status, note) => {
        const c = conflictArchive.find(x => x.id === id);
        if (c) {
          c.status = status;
          c.resolvedAt = Date.now();
          if (note) c.resolutionNote = note;
        }
      }
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
      isTrip0000CloudWriteAllowed,
      resolveControlledConflict,
      getPreActivationSyncReport
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

    let recBlocked = false;
    try {
      await executeControlledReconciliation('0000');
    } catch (err) {
      recBlocked = true;
      assert.ok(err.message.includes('Conflitto bloccante'));
    }
    assert.equal(recBlocked, true, 'Non deve dare successo su dati discordanti');
    assert.equal(pendingQueue.length, 1, 'La mutazione DEVE rimanere preservata in coda');
    assert.equal(conflictArchive.length, 1, 'Il conflitto deve essere stato archiviato');
    assert.equal(isTrip0000CloudWriteAllowed(), false, 'Cloud-write re-locked');
    console.log('✓ TEST 3 SUPERATO: Dati discordanti rilevati, mutazione preservata in coda e conflitto archiviato.');

    // =========================================================================
    // TEST 4: Risoluzione Controllata del Conflitto Archiviato (mark_synced)
    // =========================================================================
    console.log('--- TEST 4: Risoluzione Controllata Conflitto Archiviato (mark_synced) ---');
    // Puliamo la coda e l'archivio per isolare il test
    pendingQueue.length = 0;
    conflictArchive.length = 0;

    // Reimpostiamo su Firestore il documento corrispondente alla mutazione reale Foto pre partenza
    await request('PATCH', `trips/0000/attivita/${fotoId}`, 'ADMIN_EMULATOR_ONLY', remoteFotoData);

    // Inseriamo nella coda la mutazione senza updatedAt esplicito in data (solo timestamp su item coda)
    const realQueueItem = {
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
        status: 'prenotato'
        // updatedAt è omesso/indefinito, simulando la condizione che ha scatenato l'incertezza
      }
    };
    pendingQueue.push(realQueueItem);

    // Archiviazione del conflitto esattamente come avvenuto sull'iPhone reale
    const conflictId = '0000_attivita_' + fotoId + '_1794057047456';
    conflictArchive.push({
      id: conflictId,
      tripId: '0000',
      entityType: 'attivita',
      dataId: fotoId,
      localData: realQueueItem.data,
      serverData: remoteFotoData,
      conflictType: 'unreliable_timestamp_conflict',
      serverUpdated: 1794057047456,
      localUpdated: 0,
      savedAt: 1794057047456,
      status: 'pending_review'
    });

    // Verifichiamo il report diagnostico: deve rilevare il conflitto e che il contenuto è equivalente
    const preReport = await getPreActivationSyncReport('0000');
    console.log('Pre-report conflictItems:', JSON.stringify(preReport.conflictItems, null, 2));
    assert.equal(preReport.conflictsCount, 1, 'Deve esserci 1 conflitto da risolvere');
    assert.equal(preReport.conflictItems.length, 1);
    assert.equal(preReport.conflictItems[0].isEquivalent, true, 'Il contenuto deve risultare equivalente a Firestore');

    // Eseguiamo la risoluzione controllata con 'mark_synced'
    console.log('Esecuzione resolveControlledConflict con mark_synced...');
    const resolveResult = await resolveControlledConflict('0000', conflictId, 'mark_synced');
    console.log('resolveResult:', resolveResult);
    assert.equal(resolveResult.success, true, 'Risoluzione deve avere successo');
    assert.equal(resolveResult.isEquivalent, true);

    // Verifichiamo che la coda locale sia stata svuotata
    assert.equal(pendingQueue.length, 0, 'La mutazione deve essere stata rimossa dalla coda locale');

    // Verifichiamo che il conflitto sia stato archiviato come resolved_already_synced
    const resolvedConflict = conflictArchive.find(c => c.id === conflictId);
    assert.ok(resolvedConflict);
    assert.equal(resolvedConflict.status, 'resolved_already_synced', 'Lo stato deve essere resolved_already_synced');

    // Verifichiamo che il nuovo report diagnostico abbia 0 conflitti bloccanti
    const postReport = await getPreActivationSyncReport('0000');
    assert.equal(postReport.conflictsCount, 0, 'Zero conflitti bloccanti dopo la risoluzione');
    assert.equal(postReport.pendingCount, 0, 'Zero mutazioni pendenti');

    // Verifichiamo che la cassaforte private_credentials sia ancora intatta al 100%
    const vaultFinalCheck = await request('GET', `trips/0000/private_credentials/${vaultId}`, ownerUid);
    assert.equal(vaultFinalCheck.status, 200);
    const vaultFinalData = parseFields(await vaultFinalCheck.json());
    assert.equal(vaultFinalData.paymentStatus, 'da_saldare', 'private_credentials NON toccata da mark_synced');
    console.log('✓ TEST 4 SUPERATO: Risoluzione controllata mark_synced eseguita, coda svuotata, conflitto risolto, cassaforte intatta.');

    // =========================================================================
    // TEST 5: Protezione mark_synced con dati discordanti (Requisito 5)
    // =========================================================================
    console.log('--- TEST 5: Tentativo mark_synced con dati discordanti viene bloccato ---');
    const conflictId2 = '0000_attivita_' + fotoId + '_discordante';
    conflictArchive.push({
      id: conflictId2,
      tripId: '0000',
      entityType: 'attivita',
      dataId: fotoId,
      localData: {
        id: fotoId,
        title: 'Foto pre partenza con titolo diverso',
        orario: '12:00'
      },
      serverData: remoteFotoData,
      conflictType: 'unreliable_timestamp_conflict',
      savedAt: Date.now(),
      status: 'pending_review'
    });

    // mark_synced deve fallire se i dati sono realmente discordanti
    let threwError = false;
    try {
      await resolveControlledConflict('0000', conflictId2, 'mark_synced');
    } catch (err) {
      threwError = true;
      console.log('Atteso rifiuto per dati discordanti:', err.message);
      assert.ok(err.message.includes('differiscono'));
    }
    assert.equal(threwError, true, 'mark_synced DEVE essere respinto se i dati non coincidono');

    // Risoluzione con 'keep_remote' invece deve essere accettata
    const keepRemoteRes = await resolveControlledConflict('0000', conflictId2, 'keep_remote');
    assert.equal(keepRemoteRes.success, true);
    const conflict2Record = conflictArchive.find(c => c.id === conflictId2);
    assert.equal(conflict2Record.status, 'resolved_keep_remote');
    console.log('✓ TEST 5 SUPERATO: Tentativo mark_synced discorde bloccato, keep_remote applicabile.');

    console.log('--- TUTTI I TEST FOTO PRE PARTENZA & RISOLUZIONE CONFLITTO SUPERATI CON SUCCESSO (5/5 PASS) ---');
  } finally {
    emulator.kill();
  }
})();
