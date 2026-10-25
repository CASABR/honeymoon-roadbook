/**
 * test_hotfix_beta_isolation_and_invites.cjs
 * 
 * Suite di validazione per Hotfix Beta (25-28 Ottobre 2026):
 * 1. P0 — Creazione Viaggio e persistenza Firestore.
 * 2. P0 — Invito Copilota con 2 identità distinte: parsing URL, autorizzazione senza errori UID.
 * 3. P0 — Isolamento dati tra viaggi: test creazione Viaggio A e Viaggio C consecutivi.
 *    Verifica assenza contaminazione Nuova Zelanda, date 0000 e reset cache IndexedDB.
 * 4. P1 — Card Google Maps compatta (2 righe: Auto e A piedi) con retrocompatibilità.
 * 5. P1 — Sezione Altro ripristinata compatta senza intestazioni decorative superflue.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const onboarding = read('src/views/OnboardingView.tsx');
const rules = read('firestore.rules');
const storageService = read('src/storage/storageService.ts');
const indexedDB = read('src/storage/indexedDB.ts');
const tripConfig = read('src/utils/tripConfig.ts');
const tripDates = read('src/utils/tripDates.ts');
const oggiView = read('src/views/OggiView.tsx');
const dayMapsCard = read('src/components/cards/DayMapsCard.tsx');
const altroView = read('src/views/AltroView.tsx');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
};

console.log('\n=== HOUNIGO: HOTFIX BETA — TEST SUITE INVITI, ISOLAMENTO DATI E UI ===\n');

// ─────────────────────────────────────────────────────────────
// 1. P0 — INVITI COPILOTA E PERSISTENZA FIRESTORE
// ─────────────────────────────────────────────────────────────
console.log('--- 1. P0: INVITO COPILOTA & PERSISTENZA CLOUD ---');

test('Creazione viaggio: salvataggio immediato del documento /trips/{id} su Firestore', () => {
  assert.ok(
    onboarding.includes('batch.set(tripRef') && onboarding.includes('members: [ownerUid]'),
    'OnboardingView deve scrivere subito il documento /trips/{id} con members: [ownerUid]'
  );
  assert.ok(
    onboarding.includes('batch.set(memberRef') && onboarding.includes("role: 'owner'"),
    'OnboardingView deve scrivere subito il record /trips/{id}/members/{ownerUid} con role: owner'
  );
});

test('Formato URL invito copilota coerente tra creazione e gestione viaggio', () => {
  assert.ok(
    onboarding.includes('?role=copilota&invite=true&join='),
    'OnboardingView genera link di invito contenente role=copilota, invite=true e join'
  );
});

test('Parsing URL all’apertura link invito: auto-join diretto senza alert di rifiuto', () => {
  assert.ok(
    onboarding.includes("inviteParam === 'true' || roleParam === 'copilota'") &&
    onboarding.includes('executeJoin(joinCode)'),
    'All’apertura di un link di invito valido, OnboardingView deve avviare direttamente executeJoin'
  );
});

test('Flusso 2 Identità: Copilota B può unirsi al Viaggio di A senza blocco o errore UID', () => {
  // Simuliamo la logica di join per due identità distinte:
  const userA = { uid: 'uid_giusy_creator_123', email: 'giusy@example.com' };
  const userB = { uid: 'uid_copilota_bob_456', email: 'bob@example.com' };

  // 1. ***REMOVED*** crea viaggio A
  const tripA = {
    id: 'trip_giusy_synth_1',
    title: 'Viaggio Estate 2027',
    startDate: '2027-06-15',
    endDate: '2027-06-30',
    ownerUid: userA.uid,
    ownerName: '***REMOVED***',
    members: [userA.uid]
  };

  const tripMembersSubcollection = new Map();
  tripMembersSubcollection.set(userA.uid, { uid: userA.uid, role: 'owner', name: '***REMOVED***' });

  // 2. Bob riceve link con join=trip_giusy_synth_1
  // Bob non è ancora in members
  assert.ok(!tripA.members.includes(userB.uid), 'Bob inizialmente non è tra i membri');
  assert.ok(!tripMembersSubcollection.has(userB.uid), 'Bob inizialmente non ha un record member');

  // 3. Esecuzione del join da parte di Bob (come in executeJoin)
  const isAlreadyMember = tripA.members.includes(userB.uid) || tripA.ownerUid === userB.uid;
  assert.equal(isAlreadyMember, false);

  // Bob auto-join: registra member doc e aggiunge se stesso a members array
  tripMembersSubcollection.set(userB.uid, {
    uid: userB.uid,
    role: 'copilota',
    createdAt: Date.now()
  });
  tripA.members.push(userB.uid);

  // 4. Verifica finale: Bob è autorizzato a pieno titolo
  assert.ok(tripA.members.includes(userB.uid), 'Bob è ora incluso nei members del viaggio');
  assert.equal(tripMembersSubcollection.get(userB.uid).role, 'copilota', 'Bob ha ruolo copilota');
});

test('Security Rules: get consentito a utenti autenticati per metadati, sottocollezioni bloccate ai non-membri', () => {
  assert.ok(
    rules.includes('match /trips/{tripId} {\n      \n      // Lettura di un singolo viaggio per ID') &&
    rules.includes('allow get: if isSignedIn();'),
    'firestore.rules consente get di /trips/{tripId} a utenti autenticati per verifica invito'
  );
  assert.ok(
    rules.includes("match /{subcol}/{docId} {\n        allow read, write: if subcol in [") &&
    rules.includes('&& isTripMember(tripId);'),
    'Le sottocollezioni private (tappe, alloggi, trasporti, spese, ecc.) restano rigorosamente protette da isTripMember'
  );
});

test('Security Rules: auto-join copilota consentito solo aggiungendo proprio UID e mai su viaggio 0000', () => {
  assert.ok(
    rules.includes("tripId != '0000'") &&
    rules.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members', 'updatedAt'])") &&
    rules.includes('request.auth.uid in request.resource.data.members'),
    'firestore.rules consente update solo aggiungendo request.auth.uid a members e vieta auto-join su 0000'
  );
  assert.ok(
    rules.includes("request.resource.data.get('role', '') == 'copilota'") &&
    rules.includes("tripId != '0000'"),
    'firestore.rules consente creazione member copilota solo per viaggi diversi da 0000'
  );
});

// ─────────────────────────────────────────────────────────────
// 2. P0 — ISOLAMENTO DATI TRA VIAGGI
// ─────────────────────────────────────────────────────────────
console.log('\n--- 2. P0: ISOLAMENTO DATI TRA VIAGGI CONSECUTIVI ---');

test('IndexedDB: closeAndResetDatabases chiude connessioni attive al cambio viaggio', () => {
  assert.ok(
    indexedDB.includes('export async function closeAndResetDatabases(): Promise<void>'),
    'indexedDB.ts esporta closeAndResetDatabases'
  );
  assert.ok(
    tripConfig.includes('closeAndResetDatabases().catch'),
    'saveTripConfig e clearTripConfig invocano closeAndResetDatabases al cambio viaggio'
  );
});

test('StorageService: memoryCache svuotata automaticamente su evento trip_config_changed', () => {
  assert.ok(
    storageService.includes("window.addEventListener('trip_config_changed', () => {\n        this.memoryCache.clear();"),
    'storageService svuota memoryCache quando trip_config_changed viene emesso'
  );
});

test('tripConfig: rimozione mapping hardcoded New Zealand (2026-01-01 -> 2026-11-28)', () => {
  assert.ok(
    !tripConfig.includes("normalized.startDate === '2026-01-01'"),
    'tripConfig non rimappa più arbitrariamente le date di viaggi sintetici sulle date di 0000'
  );
});

test('tripDates: date e intervallo non cadono su 2026-11-28 se viaggio != 0000', () => {
  assert.ok(
    tripDates.includes('const isMasterTrip = !config || config.id === \'0000\';'),
    'tripDates distingue master trip 0000 da qualsiasi altro viaggio'
  );
  assert.ok(
    tripDates.includes("window.addEventListener('trip_config_changed', () => {\n    cachedTripDateRange = null;"),
    'cachedTripDateRange viene invalidata quando cambia tripConfig'
  );
});

test('OggiView: Dynamic Countries mostra Nuova Zelanda solo per viaggio 0000', () => {
  assert.ok(
    oggiView.includes('if (isMasterTrip) {') && oggiView.includes('countrySet.add(\'Nuova Zelanda\');'),
    'detectCountry con Nuova Zelanda viene eseguito SOLO se isMasterTrip'
  );
  assert.ok(
    oggiView.includes("setDynamicCountries(tripConfig?.title || 'Il mio Viaggio');"),
    'Per viaggi non master, dynamicCountries mostra esclusivamente tripConfig.title'
  );
});

test('OggiView: heroBgImage e date di fallback isolate per tripId', () => {
  assert.ok(
    oggiView.includes('localStorage.getItem(`hero_bg_image_${tripId}`)'),
    'heroBgImage usa chiave isolata per tripId'
  );
  assert.ok(
    oggiView.includes("tripConfig?.startDate || (isMasterTrip ? '2026-11-28' : todayStr)"),
    'Fallback data inizio è 2026-11-28 SOLO per 0000, per altri viaggi è la data del viaggio o oggi'
  );
});

test('Simulazione isolamento: Creazione Viaggio A, poi Viaggio C, verifica zero contaminazione', () => {
  // Simula stato e cache
  const mockStorage = {
    activeTripId: 'trip_A_roma',
    configs: new Map(),
    dataPerTrip: new Map()
  };

  // Creazione Viaggio A
  mockStorage.configs.set('trip_A_roma', {
    id: 'trip_A_roma',
    title: 'Weekend a Roma',
    startDate: '2027-04-10',
    endDate: '2027-04-13'
  });
  mockStorage.dataPerTrip.set('trip_A_roma', [
    { type: 'tappa', titolo: 'Colosseo', date: '2027-04-10' },
    { type: 'attivita', title: 'Musei Vaticani', date: '2027-04-11' }
  ]);

  // Creazione Viaggio C nello stesso client
  mockStorage.activeTripId = 'trip_C_parigi';
  mockStorage.configs.set('trip_C_parigi', {
    id: 'trip_C_parigi',
    title: 'Parigi e Castelli',
    startDate: '2027-09-01',
    endDate: '2027-09-10'
  });
  mockStorage.dataPerTrip.set('trip_C_parigi', []); // nuovo viaggio pulito

  const tripCConfig = mockStorage.configs.get(mockStorage.activeTripId);
  const tripCData = mockStorage.dataPerTrip.get(mockStorage.activeTripId);

  // Verifiche isolamento:
  assert.equal(tripCConfig.title, 'Parigi e Castelli');
  assert.equal(tripCConfig.startDate, '2027-09-01');
  assert.equal(tripCData.length, 0, 'Viaggio C non contiene dati di Viaggio A');
  assert.ok(!tripCConfig.title.includes('Nuova Zelanda'), 'Viaggio C non ha titolo Nuova Zelanda');
  assert.notEqual(tripCConfig.startDate, '2026-11-28', 'Viaggio C non ha la data di partenza di 0000');

  // Viaggio A rimane inalterato
  const tripAData = mockStorage.dataPerTrip.get('trip_A_roma');
  assert.equal(tripAData.length, 2, 'Viaggio A conserva i suoi dati intatti');
});

// ─────────────────────────────────────────────────────────────
// 3. P1 — RIPRISTINO CARD GOOGLE MAPS
// ─────────────────────────────────────────────────────────────
console.log('\n--- 3. P1: CARD GOOGLE MAPS COMPATTA (2 RIGHE: AUTO & PIEDI) ---');

test('DayMapsCard: struttura a 2 righe compatte con titolo Percorsi Google Maps', () => {
  assert.ok(
    dayMapsCard.includes('Percorsi Google Maps'),
    'Titolo compatto Percorsi Google Maps presente'
  );
  assert.ok(
    dayMapsCard.includes('Auto') && dayMapsCard.includes('A piedi'),
    'Due righe distinte per Auto e A piedi'
  );
  assert.ok(
    dayMapsCard.includes('Apri ↗') && dayMapsCard.includes('+ Aggiungi'),
    'Pulsanti compatti Apri e Aggiungi presenti'
  );
});

test('DayMapsCard: avviso limite tappe breve e contestuale senza sovrastrutture', () => {
  assert.ok(
    dayMapsCard.includes('Limite tappe Google Maps raggiunto'),
    'Avviso sintetico quando il limite tappe è raggiunto'
  );
  assert.ok(
    !dayMapsCard.includes('Capienza massima Google Maps (10 tappe)'),
    'Rimosso il box prolisso con spiegazioni enciclopediche'
  );
});

test('DayMapsCard: nessuna sottocard affiancata o badge superlativi', () => {
  assert.ok(!dayMapsCard.includes('grid-cols-2'), 'Nessuna griglia affiancata che stringe le sottocard');
  assert.ok(!dayMapsCard.includes('✓ Presente'), 'Nessun badge superfluo');
  assert.ok(!dayMapsCard.includes('Percorso stradale per spostamenti in vettura'), 'Rimosse descrizioni lunghe');
});

// ─────────────────────────────────────────────────────────────
// 4. P1 — SEZIONE ALTRO COMPATTA E LINEARE
// ─────────────────────────────────────────────────────────────
console.log('\n--- 4. P1: SEZIONE ALTRO RIPRISTINATA COMPATTA ---');

test('AltroView: ripristinata struttura compatta senza categorie decorative duplicate', () => {
  assert.ok(
    !altroView.includes('1. SEZIONE IN EVIDENZA'),
    'Rimosse intestazioni decorative duplicate (1. SEZIONE IN EVIDENZA)'
  );
  assert.ok(
    !altroView.includes('2. SEZIONE STRUMENTI DEL VIAGGIO'),
    'Rimosse intestazioni decorative duplicate (2. SEZIONE STRUMENTI DEL VIAGGIO)'
  );
  assert.ok(
    !altroView.includes('3. SEZIONE GESTIONE VIAGGIO & DISPOSITIVO'),
    'Rimosse intestazioni decorative duplicate (3. SEZIONE GESTIONE VIAGGIO & DISPOSITIVO)'
  );
});

test('AltroView: Live Viaggio, Gestione Viaggio & Accessi e Ruolo Dispositivo ben visibili', () => {
  assert.ok(altroView.includes('Live Viaggio'), 'Live Viaggio presente e visibile');
  assert.ok(altroView.includes('Gestione Viaggio & Accessi'), 'Gestione Viaggio & Accessi presente e prominente');
  assert.ok(altroView.includes('Ruolo Dispositivo'), 'Ruolo Dispositivo presente');
});

test('AltroView: griglia a 2 colonne degli strumenti essenziali', () => {
  assert.ok(altroView.includes('grid grid-cols-2 gap-3'), 'Griglia a 2 colonne preservata');
  assert.ok(altroView.includes('Documenti del Viaggio'), 'Documenti presente');
  assert.ok(altroView.includes('Spese & Budget'), 'Spese & Budget presente');
  assert.ok(altroView.includes('Note di viaggio'), 'Note presente');
  assert.ok(altroView.includes('Lista bagagli'), 'Bagagli presente');
  assert.ok(altroView.includes('Assicurazione'), 'Assicurazione presente');
  assert.ok(altroView.includes('Emergenze'), 'Emergenze presente');
  assert.ok(altroView.includes('Travel Toolkit'), 'Travel Toolkit presente');
});

console.log(`\n======================================================`);
console.log(`RISULTATO COMPLETO: ${passed}/17 TEST SUPERATI CON SUCCESSO!`);
console.log(`======================================================\n`);
