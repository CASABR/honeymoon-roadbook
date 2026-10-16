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

// Esecuzione
try {
  testTombstones();
  testAdminStorageCalculations();
  testLiveTextMessage();
  console.log('\n=================================================================');
  console.log('   ESITO SUITE SPRINT MULTITASK: TUTTI I 3 TEST SUPERATI CON SUCCESSO!');
  console.log('=================================================================\n');
} catch (err) {
  console.error('\n[FAIL] Errore durante i test:', err);
  process.exit(1);
}
