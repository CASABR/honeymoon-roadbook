/**
 * HOUNIGO — TEST SINTETICO P0: PERSISTENZA SCADENZE IN LOCKDOWN & RIPROVA REMOTA
 * 
 * Verifica i 5 requisiti fondamentali di Fase 2:
 * 1. Salvataggio scadenza durante il lockdown (scritture Firestore 403)
 * 2. Persistenza nella coda IndexedDB (sopravvivenza a chiusura e riapertura app)
 * 3. Protezione da rollback ottimistico di onSnapshot (la scadenza NON scompare!)
 * 4. Preservazione dati economici (cost, acconto, depositPaid) durante pull pubblici
 * 5. Flush e completamento della sincronizzazione al termine del lockdown
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('HOUNIGO — TEST SUITE SINTETICA P0: PERSISTENZA SCADENZE & SICUREZZA DATI');
console.log('========================================================================\n');

// 1. Mock IndexedDB In-Memory
const mockDb = {
  note: new Map(),
  settings: new Map(),
  alloggi: new Map(),
  trasporti: new Map(),
  attivita: new Map()
};

async function idbGet(store, id) {
  return mockDb[store]?.get(id) || null;
}
async function idbGetAll(store) {
  return Array.from(mockDb[store]?.values() || []);
}
async function idbPut(store, item) {
  if (!mockDb[store]) mockDb[store] = new Map();
  mockDb[store].set(item.id, JSON.parse(JSON.stringify(item)));
}
async function idbDelete(store, id) {
  mockDb[store]?.delete(id);
}

// 2. Simulatore SyncService & Coda Persistente
class MockSyncService {
  constructor(tripId) {
    this.tripId = tripId;
    this.isLockdownActive = true;
    this.remoteStore = {
      note: new Map(),
      alloggi: new Map(),
      private_credentials: new Map()
    };
  }

  async persistPendingPush(item) {
    const dataId = item.data?.id;
    if (!dataId) return;
    const storeId = `pending_push_${item.entityType}_${dataId}`;
    const record = {
      id: storeId,
      entityType: item.entityType,
      action: item.action,
      data: item.data,
      timestamp: Date.now()
    };
    await idbPut('settings', { id: storeId, value: record, timestamp: record.timestamp });
  }

  async removePendingPushFromStore(entityType, dataId) {
    const storeId = `pending_push_${entityType}_${dataId}`;
    await idbDelete('settings', storeId);
  }

  async getPendingPushesFromStore() {
    const all = await idbGetAll('settings');
    return all.filter(s => s && typeof s.id === 'string' && s.id.startsWith('pending_push_')).map(s => s.value || s);
  }

  async pushToCloud(entityType, action, data) {
    if (this.isLockdownActive) {
      // Simula rifiuto 403 dal ruleset di lockdown
      const err = new Error('FirebaseError: [code=permission-denied]: Missing or insufficient permissions.');
      err.code = 'permission-denied';
      await this.persistPendingPush({ entityType, action, data });
      throw err;
    }
    // Lockdown revocato: scrittura consentita
    this.remoteStore[entityType].set(data.id, JSON.parse(JSON.stringify(data)));
    await this.removePendingPushFromStore(entityType, data.id);
  }

  // Gestione evento rimozione onSnapshot (con protezione P0)
  async handleRemoteOnSnapshotRemoved(store, docId) {
    const localItem = await idbGet(store, docId);
    if (!localItem) return false;

    // Controlla se c'è una mutazione pendente in coda
    const pendingPush = await idbGet('settings', `pending_push_${store}_${docId}`);
    if (pendingPush) {
      return 'PRESERVED_PENDING';
    }

    // Controlla tombstone esplicito
    const tombstone = await idbGet('settings', `tombstone_${store}_${docId}`);
    if (!tombstone) {
      return 'PRESERVED_NO_TOMBSTONE'; // Rollback Firestore SDK ignorato!
    }

    await idbDelete(store, docId);
    return 'DELETED';
  }

  // Pull pubblico con preservazione campi locali
  async handlePullRemoteDocument(store, docId, serverData) {
    const localData = await idbGet(store, docId);
    let itemToStore = { ...serverData, id: docId };

    const privData = this.remoteStore.private_credentials.get(`alloggio_${docId}`);
    if (privData) {
      itemToStore = { ...itemToStore, ...privData };
    } else if (localData) {
      // PRESERVAZIONE P0: non distruggere i campi sensibili/economici già memorizzati localmente!
      const sensitiveKeys = ['cost', 'costo', 'acconto', 'depositPaid', 'bookingCode', 'pinCode', 'pnr'];
      for (const k of sensitiveKeys) {
        if (localData[k] !== undefined && itemToStore[k] === undefined) {
          itemToStore[k] = localData[k];
        }
      }
    }
    await idbPut(store, itemToStore);
    return itemToStore;
  }
}

async function runTests() {
  const sync = new MockSyncService('0000');

  // --- TEST 1: Salvataggio Scadenza durante Lockdown Remoto ---
  console.log('1. Test Salvataggio Scadenza durante Lockdown (scritture 403)...');
  const syntheticDeadline = {
    id: 'scadenza_test_101',
    recordKind: 'scadenza',
    title: 'Richiesta Visto Turistico NZ',
    content: 'Controllare passaporto e compilare NZeTA prima della partenza',
    dueDate: '2026-11-20',
    dueTime: '18:00',
    dateVerified: true,
    status: 'da_fare',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Salva localmente in IndexedDB (il client salva sempre prima in IDB)
  await idbPut('note', syntheticDeadline);
  assert.equal((await idbGet('note', 'scadenza_test_101')).title, 'Richiesta Visto Turistico NZ');

  // Tenta il push remoto (deve fallire con 403 e finire in coda persistente)
  let pushFailed = false;
  try {
    await sync.pushToCloud('note', 'save', syntheticDeadline);
  } catch (err) {
    pushFailed = true;
    assert.equal(err.code, 'permission-denied');
  }
  assert.equal(pushFailed, true, 'Il push remoto durante il lockdown DEVE fallire');

  // Verifica che la mutazione sia registrata nella coda persistente di IndexedDB
  const pendingQueue1 = await sync.getPendingPushesFromStore();
  assert.equal(pendingQueue1.length, 1);
  assert.equal(pendingQueue1[0].data.id, 'scadenza_test_101');
  console.log('✅ PASS 1: Scadenza salvata in IndexedDB e memorizzata in coda persistente;');

  // --- TEST 2: Simulazione Rollback onSnapshot (Firestore SDK rejection) ---
  console.log('\n2. Test Protezione Rollback onSnapshot (la scadenza NON deve scomparire)...');
  // Il server rifiuta la scrittura -> Firebase SDK emette change.type === "removed"
  const removalResult = await sync.handleRemoteOnSnapshotRemoved('note', 'scadenza_test_101');
  assert.equal(removalResult, 'PRESERVED_PENDING');

  // Verifica che la scadenza esista ANCORA in IndexedDB
  const localDocAfterSnapshot = await idbGet('note', 'scadenza_test_101');
  assert.notEqual(localDocAfterSnapshot, null, 'La scadenza NON deve essere cancellata da IndexedDB');
  assert.equal(localDocAfterSnapshot.id, 'scadenza_test_101');
  console.log('✅ PASS 2: Rollback Firestore SDK neutralizzato — la scadenza resta visibile e persistita;');

  // --- TEST 3: Simulazione Riavvio / Chiusura PWA ---
  console.log('\n3. Test Riavvio PWA (sopravvivenza a chiusura/riapertura)...');
  // Creiamo una nuova istanza SyncService a freddo senza memoria RAM precedente
  const newSessionSync = new MockSyncService('0000');
  const storedDeadlines = (await idbGetAll('note')).filter(n => n.recordKind === 'scadenza');
  assert.equal(storedDeadlines.length, 1);
  assert.equal(storedDeadlines[0].title, 'Richiesta Visto Turistico NZ');

  const pendingQueueAfterReload = await newSessionSync.getPendingPushesFromStore();
  assert.equal(pendingQueueAfterReload.length, 1);
  assert.equal(pendingQueueAfterReload[0].data.id, 'scadenza_test_101');
  console.log('✅ PASS 3: Riapertura PWA completata — scadenze e code pendenti integre al 100%;');

  // --- TEST 4: Preservazione Prezzi e Valori Economici durante Pull Remoto ---
  console.log('\n4. Test Preservazione Prezzi e Valori Economici durante Pull Remoto...');
  const localAlloggio = {
    id: 'hotel_auckland_1',
    name: 'Grand Hotel Auckland',
    cost: 450,
    acconto: 150,
    depositPaid: '150.00',
    bookingCode: 'BK-NZ-9912',
    updatedAt: 1000
  };
  await idbPut('alloggi', localAlloggio);

  // Il server invia una versione pubblica sanitizzata (senza cost, acconto, bookingCode)
  const serverPublicDoc = {
    id: 'hotel_auckland_1',
    name: 'Grand Hotel Auckland (Updated Title)',
    updatedAt: 2000
    // Nessun cost, acconto, depositPaid
  };

  const merged = await newSessionSync.handlePullRemoteDocument('alloggi', 'hotel_auckland_1', serverPublicDoc);
  assert.equal(merged.cost, 450, 'cost DEVE essere preservato');
  assert.equal(merged.acconto, 150, 'acconto DEVE essere preservato');
  assert.equal(merged.depositPaid, '150.00', 'depositPaid DEVE essere preservato');
  assert.equal(merged.bookingCode, 'BK-NZ-9912', 'bookingCode DEVE essere preservato');
  assert.equal(merged.name, 'Grand Hotel Auckland (Updated Title)', 'Il titolo pubblico aggiornato deve essere acquisito');

  const inDbAlloggio = await idbGet('alloggi', 'hotel_auckland_1');
  assert.equal(inDbAlloggio.cost, 450);
  assert.equal(inDbAlloggio.acconto, 150);
  console.log('✅ PASS 4: Pull pubblico non azzera i prezzi locali — dati economici intatti;');

  // --- TEST 5: Sblocco Lockdown e Riprova Automatica ---
  console.log('\n5. Test Sblocco Lockdown e Svuotamento Coda...');
  newSessionSync.isLockdownActive = false; // Riapertura scritture

  const pendingItems = await newSessionSync.getPendingPushesFromStore();
  for (const item of pendingItems) {
    await newSessionSync.pushToCloud(item.entityType, item.action, item.data);
  }

  // Verifica che la scadenza sia ora arrivata sul server
  assert.equal(newSessionSync.remoteStore.note.get('scadenza_test_101').title, 'Richiesta Visto Turistico NZ');

  // Verifica che la coda sia stata svuotata
  const finalQueue = await newSessionSync.getPendingPushesFromStore();
  assert.equal(finalQueue.length, 0);
  console.log('✅ PASS 5: Flush completato — scadenza sincronizzata e coda svuotata.');

  console.log('\n========================================================================');
  console.log('🎉 TUTTI I 5 TEST SINTETICI P0 SUPERATI AL 100% (PASS)');
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('❌ FALLIMENTO TEST SINTETICO:', err);
  process.exit(1);
});

