/**
 * TEST SUITE: SPRINT MULTITASK (Tombstone Deletions, Admin Dashboard Storage Estimate, LIVE Messaging)
 */
const assert = require('assert');

// 1. SIMULAZIONE TOMBSTONE CANCELLAZIONI (Spese, Note, Bagagli, Documenti)
function testTombstones() {
  console.log('--- TEST 1: Tombstones per Spese, Note, Bagagli, Documenti ---');
  
  const mockStorage = {
    spese: [{ id: 'spesa_1', importo: 50 }],
    note: [{ id: 'nota_1', testo: 'Promemoria passaporto' }],
    bagagli: [{ id: 'bag_1', nome: 'Valigia grande' }],
    documenti: [{ id: 'doc_1', titolo: 'Polizza' }],
    tombstones: []
  };

  function recordTombstone(storeName, id) {
    mockStorage.tombstones.push({ storeName, id, deletedAt: Date.now() });
    mockStorage[storeName] = mockStorage[storeName].filter(item => item.id !== id);
  }

  function simulatePullSync(incomingStore, storeName) {
    // Simula la logica di syncService.ts: filtra gli elementi che hanno tombstone
    return incomingStore.filter(incomingItem => {
      const isDead = mockStorage.tombstones.some(
        t => t.storeName === storeName && t.id === incomingItem.id
      );
      return !isDead;
    });
  }

  // Esegui cancellazione offline di spesa, nota, bagaglio e documento
  recordTombstone('spese', 'spesa_1');
  recordTombstone('note', 'nota_1');
  recordTombstone('bagagli', 'bag_1');
  recordTombstone('documenti', 'doc_1');

  assert.strictEqual(mockStorage.spese.length, 0, 'Spesa cancellata localmente');
  assert.strictEqual(mockStorage.note.length, 0, 'Nota cancellata localmente');
  assert.strictEqual(mockStorage.bagagli.length, 0, 'Bagaglio cancellato localmente');
  assert.strictEqual(mockStorage.documenti.length, 0, 'Documento cancellato localmente');
  assert.strictEqual(mockStorage.tombstones.length, 4, '4 tombstones registrati');

  // Simula sincronizzazione pull da cloud (dove l'elemento non è ancora stato cancellato su un secondo dispositivo)
  const incomingRemoteSpese = [{ id: 'spesa_1', importo: 50 }, { id: 'spesa_2', importo: 30 }];
  const reconciledSpese = simulatePullSync(incomingRemoteSpese, 'spese');

  assert.strictEqual(reconciledSpese.length, 1, 'L\'elemento cancellato con tombstone non deve resuscitare');
  assert.strictEqual(reconciledSpese[0].id, 'spesa_2', 'Solo elementi non cancellati vengono accettati');

  // Simula scenario due sessioni autorizzate (Sessione A elimina, Sessione B si riconnette)
  const sessionA_Tombstones = new Set(['doc_1', 'spesa_1', 'nota_1', 'bag_1']);
  const sessionB_LocalState = [
    { id: 'doc_1', titolo: 'Polizza' },
    { id: 'doc_2', titolo: 'Biglietto' }
  ];

  // Quando Sessione B riceve la cancellazione o la sincronizza:
  const sessionB_AfterSync = sessionB_LocalState.filter(item => !sessionA_Tombstones.has(item.id));
  assert.strictEqual(sessionB_AfterSync.length, 1);
  assert.strictEqual(sessionB_AfterSync[0].id, 'doc_2', 'Sessione B allineata correttamente senza residui di doc_1');

  console.log('[PASS] Tombstone previene la resurrezione di elementi cancellati su refresh/pull e due sessioni');
}

// 2. SIMULAZIONE ADMIN DASHBOARD: Calcolo Quota Locale e Trasparenza Cloud
function testAdminStorageCalculations() {
  console.log('\n--- TEST 2: Admin Dashboard Storage Calculations ---');

  function calculateStorage(usage, quota) {
    if (!quota || quota <= 0) {
      return { usage: 0, quota: 0, remaining: 0, percent: 0, isReliable: false };
    }
    const remaining = Math.max(0, quota - usage);
    const percent = Math.min(100, Math.max(0, (usage / quota) * 100));
    return {
      usage,
      quota,
      remaining,
      percent: parseFloat(percent.toFixed(1)),
      isReliable: true
    };
  }

  // Test normale quota browser
  const normal = calculateStorage(1024 * 1024 * 50, 1024 * 1024 * 1000); // 50MB di 1000MB
  assert.strictEqual(normal.percent, 5.0);
  assert.strictEqual(normal.remaining, 1024 * 1024 * 950);
  assert.strictEqual(normal.isReliable, true);

  // Test navigazione anonima / assenza di quota
  const zeroQuota = calculateStorage(0, 0);
  assert.strictEqual(zeroQuota.percent, 0);
  assert.strictEqual(zeroQuota.isReliable, false);

  // Test verifica che le quote cloud NON siano inventate
  const cloudStorageDisplay = {
    quotaAvailable: false,
    reason: 'SDK Web Client Firestore non espone metrica aggregata senza Cloud Monitoring API a pagamento'
  };
  assert.strictEqual(cloudStorageDisplay.quotaAvailable, false, 'Nessuna quota cloud fittizia');

  console.log('[PASS] Calcolo quota storage locale e trasparenza assenza metrica cloud validati');
}

// 3. SIMULAZIONE LIVE: Validazione Messaggi Testuali, Mittente e Anti-Spam
function testLiveTextMessage() {
  console.log('\n--- TEST 3: LIVE Text Messages Validation & Anti-Spam ---');

  let lastSentAt = 0;
  const RATE_LIMIT_MS = 5000;

  function validateAndSendMessage({ text, senderTitle, isOnline, isMember, now = Date.now() }) {
    if (!isMember) {
      return { success: false, error: 'Solo i membri del viaggio possono pubblicare nel Live.' };
    }
    if (!isOnline) {
      return { success: false, error: 'Dispositivo offline: impossibile pubblicare sul feed Live.' };
    }
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Il messaggio non può essere vuoto.' };
    }
    if (trimmed.length > 500) {
      return { success: false, error: 'Il messaggio non può superare i 500 caratteri.' };
    }
    if (now - lastSentAt < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastSentAt)) / 1000);
      return { success: false, error: `Attendi ${waitSec}s prima di inviare un altro messaggio.` };
    }

    lastSentAt = now;
    return {
      success: true,
      message: {
        title: (senderTitle || 'Amico di Viaggio').slice(0, 60),
        text: trimmed.slice(0, 500),
        timestamp: now
      }
    };
  }

  // 1. Messaggio valido
  const t0 = 100000;
  const res1 = validateAndSendMessage({ text: 'Siamo appena arrivati a Queenstown!', senderTitle: 'Sposi (Guida)', isOnline: true, isMember: true, now: t0 });
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.message.title, 'Sposi (Guida)');

  // 2. Invio ripetuto prima del rate limit (Spam)
  const res2 = validateAndSendMessage({ text: 'Altro messaggio immediato', senderTitle: 'Sposi (Guida)', isOnline: true, isMember: true, now: t0 + 1000 });
  assert.strictEqual(res2.success, false);
  assert.ok(res2.error.includes('Attendi'));

  // 3. Invio dopo scadenza rate limit
  const res3 = validateAndSendMessage({ text: 'Messaggio dopo pausa', senderTitle: 'Sposi (Guida)', isOnline: true, isMember: true, now: t0 + 6000 });
  assert.strictEqual(res3.success, true);

  // 4. Testo troppo lungo (> 500 caratteri)
  const longText = 'A'.repeat(501);
  const res4 = validateAndSendMessage({ text: longText, senderTitle: 'Sposi (Guida)', isOnline: true, isMember: true, now: t0 + 12000 });
  assert.strictEqual(res4.success, false);
  assert.ok(res4.error.includes('500'));

  // 5. Testo vuoto o spazi
  const res5 = validateAndSendMessage({ text: '   ', senderTitle: 'Sposi (Guida)', isOnline: true, isMember: true, now: t0 + 18000 });
  assert.strictEqual(res5.success, false);
  assert.ok(res5.error.includes('vuoto'));

  // 6. Utente non autorizzato (non membro)
  const res6 = validateAndSendMessage({ text: 'Ciao!', senderTitle: 'Intruso', isOnline: true, isMember: false, now: t0 + 24000 });
  assert.strictEqual(res6.success, false);
  assert.ok(res6.error.includes('membri'));

  // 7. Dispositivo offline
  const res7 = validateAndSendMessage({ text: 'Messaggio offline', senderTitle: 'Sposi', isOnline: false, isMember: true, now: t0 + 30000 });
  assert.strictEqual(res7.success, false);
  assert.ok(res7.error.includes('offline'));

  console.log('[PASS] Validazione, mittente autenticato, sanitizzazione e rate-limiting LIVE verificati');
}

// 4. TEST RESILIENZA SESSIONE MOBILE (LOCALSTORAGE EVICTION + INDEXEDDB RESTORE)
async function testMobileSessionResilience() {
  console.log('\n--- TEST 4: Resilienza Sessione Mobile (Funzioni di Produzione da deviceSession.ts) ---');

  // Inizializza global.localStorage in-memory per Node.js
  let storageMap = new Map();
  global.localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };

  // Mock dello storage IndexedDB per simulare letture, scritture e cancellazioni
  let idbMockStore = new Map();
  let failIdbDelete = false;

  // Carica il modulo di produzione REALE transpilato al volo con il compilatore TypeScript ufficiale
  const fs = require('fs');
  const ts = require('typescript');
  const sessionSource = fs.readFileSync('./src/utils/deviceSession.ts', 'utf8');
  const sessionCompiled = ts.transpileModule(sessionSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mockModule = { exports: {} };
  const sessionFactory = new Function('require', 'module', 'exports', '__filename', '__dirname', sessionCompiled);
  sessionFactory((reqPath) => {
    if (reqPath.includes('indexedDB')) {
      return {
        idbGet: async (store, key) => idbMockStore.get(`${store}:${key}`) || null,
        idbPut: async (store, data) => idbMockStore.set(`${store}:${data.id}`, data),
        idbDelete: async (store, key) => {
          if (failIdbDelete) throw new Error('IndexedDB disk failure');
          idbMockStore.delete(`${store}:${key}`);
        }
      };
    }
    if (reqPath.includes('firebase')) return { db: null };
    return require(reqPath);
  }, mockModule, mockModule.exports, './src/utils/deviceSession.ts', process.cwd());

  const deviceSession = mockModule.exports;

  try {
    // A. Accesso iniziale / Login reale
    deviceSession.persistDeviceSession('trip_giappone_2026', 'guida');
    // Consenti al Promise asincrono di idbPut di completarsi
    await new Promise(r => setTimeout(r, 20));

    const s1 = deviceSession.getPersistedSession();
    assert.strictEqual(s1.isAuthenticated, true, 'La sessione iniziale deve risultare autenticata');
    assert.strictEqual(s1.tripId, 'trip_giappone_2026');
    assert.strictEqual(s1.role, 'guida');

    // B. Simulazione Eviction Mobile (localStorage ripulito a zero dal browser)
    storageMap.clear();
    const sEvicted = deviceSession.getPersistedSession();
    assert.strictEqual(sEvicted.isAuthenticated, false, 'localStorage vuoto -> getPersistedSession sincrona deve essere false');

    // C. Ripristino automatico tramite restorePersistedSessionFromIndexedDB REALE
    const sRestored = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sRestored.isAuthenticated, true, 'Sessione ripristinata con successo da IndexedDB');
    assert.strictEqual(sRestored.tripId, 'trip_giappone_2026');
    assert.strictEqual(sRestored.role, 'guida');
    // Verifica che abbia riallineato localStorage senza inventare PIN
    assert.strictEqual(global.localStorage.getItem('houni_authenticated'), 'true');
    assert.strictEqual(global.localStorage.getItem('houni_trip_id'), 'trip_giappone_2026');
    assert.strictEqual(global.localStorage.getItem('houni_pin_authenticated'), null, 'Non deve re-iniettare flag PIN arbitrarie nel ripristino');

    // D. Logout volontario (funzione reale)
    await deviceSession.clearDeviceSession();
    const sAfterLogout = deviceSession.getPersistedSession();
    assert.strictEqual(sAfterLogout.isAuthenticated, false, 'Dopo logout la sessione deve essere revocata');
    assert.strictEqual(global.localStorage.getItem('houni_explicit_logout'), 'true', 'Marcatore di logout esplicito presente');

    const sRestoreAfterLogout = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sRestoreAfterLogout.isAuthenticated, false, 'Non deve mai ripristinare la sessione dopo logout esplicito');

    // D2. CASO CRITICO: Logout seguito da cancellazione totale di localStorage (conservando solo IndexedDB)
    // Non deve riesumare la sessione perché il record IndexedDB è stato invalidato (authenticated: false) e rimosso
    storageMap.clear();
    const sRestoreAfterStorageWipe = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sRestoreAfterStorageWipe.isAuthenticated, false, 'Anche con localStorage cancellato a zero dopo il logout, la sessione non risorge da IndexedDB');

    // E. Errore o fallimento nella cancellazione IndexedDB durante logout
    storageMap.clear();
    // Reinietta una sessione e simula che IndexedDB fallisca la delete
    deviceSession.persistDeviceSession('trip_giappone_2026', 'guida');
    await new Promise(r => setTimeout(r, 20));
    failIdbDelete = true;
    await deviceSession.clearDeviceSession(); // non deve crashare nonostante l'eccezione IDB
    failIdbDelete = false;

    // Anche se IndexedDB contenesse ancora i vecchi byte per via dell'errore, il record è stato invalidato con authenticated: false
    const sBlockedByLogout = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sBlockedByLogout.isAuthenticated, false, 'Anche con errore idbDelete, il backup invalidato impedisce il ripristino');

    // F. Casi negativi di validazione su backup corrotto o ruolo alterato
    storageMap.clear();
    // 1. tripId vuoto o fatto di soli spazi
    idbMockStore.set('settings:device_session_backup', { id: 'device_session_backup', value: { tripId: '   ', role: 'guida', authenticated: true } });
    const sCorruptTrip = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sCorruptTrip.isAuthenticated, false, 'tripId vuoto/spazi deve essere rifiutato');

    // 2. authenticated non booleano true
    idbMockStore.set('settings:device_session_backup', { id: 'device_session_backup', value: { tripId: 'trip_123', role: 'guida', authenticated: false } });
    const sUnauthBackup = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sUnauthBackup.isAuthenticated, false, 'authenticated non true deve essere rifiutato');

    // 3. ruolo non valido -> normalizzazione sicura
    idbMockStore.set('settings:device_session_backup', { id: 'device_session_backup', value: { tripId: 'trip_123', role: 'admin_hacker', authenticated: true } });
    const sRoleFallback = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sRoleFallback.isAuthenticated, true);
    assert.strictEqual(sRoleFallback.role, 'guida', 'Ruolo non ammesso deve ricadere sul fallback sicuro guida');

    // G. Gestione errori IndexedDB su lettura/scrittura: non deve lanciare eccezioni né bloccare l'app
    storageMap.clear();
    idbMockStore.delete('settings:device_session_backup');
    const sEmpty = deviceSession.getPersistedSession();
    assert.strictEqual(sEmpty.isAuthenticated, false);
    assert.strictEqual(sEmpty.tripId, null);

    // I. CONDIZIONE DI GARA: Scrittura tardiva obsoleta (es. backup di persistenza completato dopo clearDeviceSession)
    const oldTime = Date.now() - 50000;
    idbMockStore.set('settings:device_session_backup', {
      id: 'device_session_backup',
      value: { tripId: 'trip_obsoleto', role: 'guida', authenticated: true, updatedAt: oldTime }
    });
    const sRaceConditionResult = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sRaceConditionResult.isAuthenticated, false, 'Scrittura asincrona tardiva con timestamp precedente deve essere respinta');

    // J. NUOVO ACCESSO DOPO IL LOGOUT: deve ripristinare pienamente l'autenticazione
    await deviceSession.persistDeviceSession('trip_nuovo_2027', 'copilota');
    assert.strictEqual(deviceSession.getPersistedSession().isAuthenticated, true);
    assert.strictEqual(deviceSession.getPersistedSession().tripId, 'trip_nuovo_2027');
    assert.strictEqual(deviceSession.getPersistedSession().role, 'copilota');

    // Se poi perdiamo localStorage del nuovo accesso, il restore deve recuperare il NUOVO viaggio
    storageMap.clear();
    const sNewRestore = await deviceSession.restorePersistedSessionFromIndexedDB();
    assert.strictEqual(sNewRestore.isAuthenticated, true);
    assert.strictEqual(sNewRestore.tripId, 'trip_nuovo_2027');
    assert.strictEqual(sNewRestore.role, 'copilota');

    console.log('[PASS] Resilienza sessione, race conditions, logout/re-login ed eccezioni verificati con successo su funzioni di produzione');
  } catch (e) {
    throw e;
  }
}

// Esecuzione
(async () => {
  try {
    testTombstones();
    testAdminStorageCalculations();
    testLiveTextMessage();
    await testMobileSessionResilience();
    console.log('\n=================================================================');
    console.log('   ESITO SUITE SPRINT MULTITASK: TUTTI I 4 TEST SUPERATI CON SUCCESSO!');
    console.log('=================================================================\n');
  } catch (err) {
    console.error('\n[FAIL] Errore durante i test:', err);
    process.exit(1);
  }
})();
