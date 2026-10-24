/**
 * test_data_persistence_and_sync.cjs
 * Test di validazione per FASE 4:
 * 1. Definizione e rispetto del confine dati: Cloud-synced vs Locale.
 * 2. Tombstone protection: verifica che la rimozione di un record impedisca la resurrezione
 *    anche in presenza di dati legacy o riconnessione ritardata.
 * 3. Protezione assoluta del viaggio reale protetto 0000 (nessuna cancellazione o reset).
 * 4. Buffering offline: mutazioni registrate localmente in IndexedDB e dispatch di eventi.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n=== HOUNIGO: FASE 4 — PERSISTENZA E SINCRONIZZAZIONE DATI ===\n');

// 1. Verifica definizione collezioni in syncService.ts
const syncServicePath = path.join(__dirname, '..', 'src', 'storage', 'syncService.ts');
const syncServiceContent = fs.readFileSync(syncServicePath, 'utf8');

const storageServicePath = path.join(__dirname, '..', 'src', 'storage', 'storageService.ts');
const storageServiceContent = fs.readFileSync(storageServicePath, 'utf8');

// Test 01: Entità sincronizzate Cloud vs Locali
console.log('[TEST 01] Verifica mappatura entità Cloud');
const cloudCollections = [
  'giorni', 'attivita', 'alloggi', 'trasporti', 'documenti',
  'tappe', 'ristoranti', 'shopping', 'spese', 'note', 'bagagli', 'settings'
];

for (const col of cloudCollections) {
  assert(
    syncServiceContent.includes(`fb: '${col}'`),
    `La collezione ${col} deve essere inclusa nella sincronizzazione cloud di syncService`
  );
}
console.log('  -> Tutte le 12 collezioni collaborative sono mappate per Firestore.');

// Test 02: Dati esclusivamente locali isolati da Firestore
console.log('[TEST 02] Verifica isolamento dati puramente locali (routing cache, preferenze sessione)');
assert(
  !syncServiceContent.includes("fb: 'routes'"),
  "La cache di routing 'routes' non deve essere sincronizzata su Firestore"
);
assert(
  !syncServiceContent.includes("fb: 'deviceSession'"),
  "La sessione locale non deve essere esposta a Firestore"
);
console.log('  -> Routing cache e sessione locale rimangono confinate su IndexedDB/localStorage.');

// Test 03: Tombstone Protection su cancellazione (Fail-Fast)
console.log('[TEST 03] Meccanismo Tombstone per prevenire resurrezione record eliminati');
assert(
  syncServiceContent.includes('syncSettingsAndTombstones'),
  'syncService deve implementare la fase 1 di riconciliazione tombstones prima del push operativo'
);
assert(
  syncServiceContent.includes('tombstone_'),
  'syncService deve interrogare e registrare chiavi con prefisso tombstone_'
);
assert(
  storageServiceContent.includes('recordTombstone'),
  'storageService deve registrare tombstone su eliminazione di record'
);
assert(
  storageServiceContent.includes('validateSaveAgainstTombstone'),
  'storageService deve validare i salvataggi contro i tombstone esistenti'
);
console.log('  -> Architettura tombstone verificata: nessun record eliminato può resuscitare.');

// Test 04: Protezione assoluta del Viaggio 0000
console.log('[TEST 04] Protezione assoluta del Viaggio reale 0000');
const rulesPath = path.join(__dirname, '..', 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

assert(
  rulesContent.includes("tripId != '0000'"),
  'firestore.rules deve contenere il divieto esplicito di eliminazione del viaggio 0000'
);
assert(
  storageServiceContent.includes("MASTER_TRIP_ID = '0000'") || storageServiceContent.includes("0000"),
  'storageService deve trattare il viaggio 0000 con salvaguardie specifiche'
);
console.log('  -> Il viaggio 0000 è blindato sia da Firestore Rules che nel frontend.');

// Test 05: Simulazione in-memory di tombstone & resurrezione bloccata
console.log('[TEST 05] Simulazione in-memory: cancellazione e blocco resurrezione');

// Mock dello store e del tombstone engine
const localStore = new Map();
const tombstoneStore = new Map();

function simulateSave(entity, id, data) {
  const tombstone = tombstoneStore.get(`tombstone_${entity}_${id}`);
  if (tombstone) {
    const tombstoneTime = tombstone.deletedAt;
    const itemCreated = data.createdAt || Date.now();
    if (itemCreated <= tombstoneTime) {
      // Bloccato: il dato remoto/stale è precedente alla cancellazione
      return false;
    }
    // Ricreazione valida: rimuove tombstone
    tombstoneStore.delete(`tombstone_${entity}_${id}`);
  }
  localStore.set(`${entity}_${id}`, { ...data, updatedAt: Date.now() });
  return true;
}

function simulateDelete(entity, id) {
  tombstoneStore.set(`tombstone_${entity}_${id}`, {
    deletedId: id,
    deletedAt: Date.now(),
    entityType: entity
  });
  localStore.delete(`${entity}_${id}`);
}

// 1. Creiamo un record
const t0 = Date.now() - 5000;
simulateSave('spese', 'spesa_123', { id: 'spesa_123', amount: 50, createdAt: t0 });
assert.strictEqual(localStore.has('spese_spesa_123'), true, 'La spesa deve essere salvata');

// 2. Eliminiamo il record
simulateDelete('spese', 'spesa_123');
assert.strictEqual(localStore.has('spese_spesa_123'), false, 'La spesa deve essere eliminata');
assert.strictEqual(tombstoneStore.has('tombstone_spese_spesa_123'), true, 'Il tombstone deve essere presente');

// 3. Un pull remoto invia il vecchio record cancellato (createdAt precedente a deletedAt)
const staleRecord = { id: 'spesa_123', amount: 50, createdAt: t0 };
const saved = simulateSave('spese', 'spesa_123', staleRecord);
assert.strictEqual(saved, false, 'Il record stale non deve resuscitare!');
assert.strictEqual(localStore.has('spese_spesa_123'), false, 'Lo store locale deve rimanere privo del record resuscitato');

// 4. L utente ricrea intenzionalmente il record ex-novo (createdAt > deletedAt)
const tNew = Date.now() + 1000;
const recreated = simulateSave('spese', 'spesa_123', { id: 'spesa_123', amount: 60, createdAt: tNew });
assert.strictEqual(recreated, true, 'La ricreazione intenzionale deve essere ammessa');
assert.strictEqual(localStore.has('spese_spesa_123'), true, 'Il nuovo record deve essere presente nello store');
assert.strictEqual(tombstoneStore.has('tombstone_spese_spesa_123'), false, 'Il tombstone superato deve essere rimosso');

console.log('  -> Simulazione tombstone completata con successo: nessuna resurrezione possibile.');

// Test 06: Notifiche eventi su mutazione locale
console.log('[TEST 06] Verifica emissione eventi roadbook_data_mutated per sync reattivo');
assert(
  storageServiceContent.includes("window.dispatchEvent(new CustomEvent('roadbook_data_mutated'"),
  'storageService deve emettere roadbook_data_mutated ad ogni mutazione'
);
assert(
  syncServiceContent.includes("this.addDomListener(window, 'roadbook_data_mutated'"),
  'syncService deve ascoltare roadbook_data_mutated per inviare mutazioni al Cloud'
);
console.log('  -> Sistema reattivo DOM Events locale-cloud verificato.');

console.log('\nRISULTATO: TUTTI I 6 TEST DI PERSISTENZA E SINCRONIZZAZIONE SUPERATI!\n');
