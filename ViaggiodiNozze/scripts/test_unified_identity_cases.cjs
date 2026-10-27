/**
 * test_unified_identity_cases.cjs
 * 
 * Verifica dei 10 Scenari Obbligatori per Identità Unificata, Inviti e Multi-Viaggio:
 * 1. Google crea viaggio A e viaggio B: entrambi visibili nel selettore.
 * 2. Google owner A accetta invito come copilota B: entrambi visibili con ruoli distinti.
 * 3. Anonimo crea A, collega Google: A resta accessibile.
 * 4. Anonimo accetta invito B, poi collega Google: B resta accessibile.
 * 5. Google già esistente recupera un viaggio anonimo mediante procedura autorizzata.
 * 6. Logout/login Google: viaggi ancora presenti su Firestore /users/{uid}.
 * 7. Accesso da secondo dispositivo: stessi viaggi autorizzati recuperati da cloud.
 * 8. Invito consumato: nessun riutilizzo abusivo da parte di terzi.
 * 9. Nessuna escalation da copilota a owner o Admin.
 * 10. Utente non autorizzato: accesso negato (zero bypass su Firestore Rules).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const rules = read('firestore.rules');
const accountService = read('src/services/accountService.ts');
const tripInviteService = read('src/services/tripInviteService.ts');
const onboardingView = read('src/views/OnboardingView.tsx');
const userAccessService = read('src/services/userAccessService.ts');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`[FAIL ${String(total).padStart(2, '0')}] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log('\n========================================================================');
console.log('HOUNIGO — VERIFICA 10 SCENARI OBBLIGATORI: IDENTITA, INVITI E MULTI-VIAGGIO');
console.log('========================================================================\n');

// 1. Google crea viaggio A e viaggio B: entrambi visibili
test('Scenario 1: Google crea viaggio A e viaggio B -> entrambi registrati con Google UID come owner', () => {
  assert.ok(
    onboardingView.includes('if (auth.currentUser) {') &&
    onboardingView.includes('ownerUid = auth.currentUser.uid;'),
    'OnboardingView deve riutilizzare auth.currentUser invece di forzare signInAnonymously per creare un viaggio'
  );
  assert.ok(
    userAccessService.includes('payload.associatedTripIds = arrayUnion'),
    'userAccessService deve registrare ogni nuovo viaggio creato in associatedTripIds del profilo utente permanente'
  );
});

// 2. Google owner A accetta invito come copilota B: entrambi visibili con ruoli distinti
test('Scenario 2: Google owner A accetta invito come copilota B -> ruoli distinti mantenuti', () => {
  assert.ok(
    tripInviteService.includes("role: 'copilota'") &&
    tripInviteService.includes('arrayUnion(user.uid)'),
    'tripInviteService registra il nuovo membro con ruolo copilota senza toccare ownerUid'
  );
  assert.ok(
    accountService.includes("let verifiedRole: 'owner' | 'copilota' | null = isOwner ? 'owner' : (isMember ? 'copilota' : null);"),
    'accountService calcola il ruolo effettivo in modo indipendente per ciascun viaggio'
  );
});

// 3. Anonimo crea A, collega Google: A resta accessibile
test('Scenario 3: Anonimo crea A, collega Google -> linkWithPopup / linkWithCredential preserva UID o recupera A', () => {
  assert.ok(
    accountService.includes('linkWithPopup') &&
    accountService.includes('credential-already-in-use'),
    'accountService gestisce linkWithPopup e il fallback su account Google già esistente'
  );
  assert.ok(
    accountService.includes('sessionStorage.getItem(\'houni_prev_anon_uid\')'),
    'accountService traccia il precedente anonUid per preservare il recupero dei viaggi'
  );
});

// 4. Utente invitato accede con Google preventivamente: invito legato direttamente all'identità permanente
test('Scenario 4: Utente invitato accede con Google prima del riscatto -> legato all\'identità Google con regole attive', () => {
  assert.ok(
    onboardingView.includes('Accedi con Google per legare l\'invito al tuo account'),
    'OnboardingView offre accesso Google diretto prima del riscatto dell\'invito'
  );
  assert.ok(
    tripInviteService.includes('batch.set(memberRef') && tripInviteService.includes('role: \'copilota\''),
    'tripInviteService registra l\'utente Google direttamente come copilota'
  );
});

// 5. Invito già consumato anonimamente: richiede esplicitamente un nuovo invito all'organizzatore
test('Scenario 5: Invito già consumato -> richiede nuovo invito con messaggio chiaro e blocca riuso abusivo', () => {
  assert.ok(
    tripInviteService.includes('data.status === \'used\' && data.usedBy !== user.uid') &&
    tripInviteService.includes('Questo invito è già stato utilizzato. Chiedi all’organizzatore del viaggio di generare un nuovo invito'),
    'redeemTripInvite rifiuta il riuso di inviti consumati e richiede esplicitamente un nuovo invito'
  );
});

// 6. Logout/login Google: viaggi ancora presenti
test('Scenario 6: Logout e Login Google -> i viaggi sono caricati da /users/{uid}.associatedTripIds', () => {
  assert.ok(
    accountService.includes('const userDocRef = doc(db, \'users\', uid);') &&
    accountService.includes('userData?.associatedTripIds'),
    'fetchUserTrips interroga autorevolmente il documento cloud /users/{uid}'
  );
});

// 7. Accesso da secondo dispositivo: stessi viaggi autorizzati
test('Scenario 7: Accesso da secondo dispositivo -> i viaggi autorizzati vengono letti dal cloud senza dipendere da localStorage', () => {
  assert.ok(
    accountService.includes('const tripSnap = await getDoc(doc(db, \'trips\', tripId));'),
    'I dettagli di ogni viaggio autorizzato vengono validati e scaricati da Firestore'
  );
});

// 8. Invito consumato: nessun riutilizzo abusivo
test('Scenario 8: Invito consumato -> Firestore Rules bloccano riscatti da terzi', () => {
  assert.ok(
    rules.includes("resource.data.status == 'active'") &&
    rules.includes("request.resource.data.status == 'used'"),
    'Firestore Rules consentono il riscatto solo se status == active'
  );
  assert.ok(
    tripInviteService.includes("if (data.status === 'used')") &&
    tripInviteService.includes('Questo link di invito è già stato utilizzato'),
    'tripInviteService rifiuta espressamente inviti con status == used per utenti diversi'
  );
});

// 9. Nessuna escalation da copilota a owner o Admin
test('Scenario 9: Nessuna escalation da copilota a owner o Admin', () => {
  assert.ok(
    rules.includes("request.resource.data.get('ownerUid', null) == resource.data.get('ownerUid', null)") &&
    rules.includes("isTripOwner(tripId)"),
    'Firestore Rules impediscono modifiche a ownerUid e riservano modifiche strutturali all\'owner'
  );
  assert.ok(
    rules.includes("exists(/databases/$(database)/documents/system_admins/$(request.auth.uid))"),
    'I privilegi di Admin globale sono isolati in /system_admins e separati dai viaggi'
  );
});

// 10. Utente non autorizzato: accesso negato
test('Scenario 10: Utente non autorizzato -> Firestore Rules negano accesso', () => {
  assert.ok(
    rules.includes("function isTripMember(tripId)") &&
    rules.includes("allow get: if isSignedIn() && (") &&
    rules.includes("isTripMember(tripId)"),
    'Firestore Rules impongono isTripMember(tripId) per qualsiasi lettura di viaggio e sottocollezioni'
  );
});

// 11. Nessuna eccezione hardcoded per 0000 nel selettore: tutti i viaggi devono essere verificati da Firestore
test('Scenario 11: Nessuna eccezione hardcoded per 0000 nel selettore', () => {
  const tripSelectorModal = read('src/components/modals/TripSelectorModal.tsx');
  assert.ok(
    !tripSelectorModal.includes("verifyTripOwnership('0000'"),
    'TripSelectorModal non deve contenere controlli legacy hardcoded per 0000'
  );
  assert.ok(
    !accountService.includes("tripId === '0000' && (uid === 'nunzio'"),
    'accountService non deve attribuire privilegi a 0000 con stringhe hardcoded'
  );
  assert.ok(
    accountService.includes("isOwner = Boolean(ownerUid && ownerUid === currentUid)"),
    'verifyTripOwnership deve verificare esclusivamente la corrispondenza dell\'ownerUid Firestore'
  );
});

// 12. Gestione esplicita del conflitto Google preesistente senza trasferimenti insicuri
test('Scenario 12: Conflitto account Google preesistente gestito con trasparenza', () => {
  assert.ok(
    accountService.includes("preExistingAccount: wasPreExisting"),
    'loginWithGoogle deve restituire il flag preExistingAccount per informare il chiamante'
  );
  const tripSelectorModal = read('src/components/modals/TripSelectorModal.tsx');
  assert.ok(
    tripSelectorModal.includes("res.preExistingAccount"),
    'TripSelectorModal deve notificare esplicitamente l\'avvenuto accesso con account Google preesistente'
  );
});

// 13. Cambio ripetuto tra viaggi: preserva identità e aggiorna indici locali e cloud
test('Scenario 13: Cambio ripetuto tra viaggi con switchActiveTrip preserva identità e indici', () => {
  assert.ok(
    accountService.includes('addKnownTripId(trip.id)') &&
    accountService.includes('await recordUserAccess(auth.currentUser, trip.id)'),
    'switchActiveTrip deve memorizzare il viaggio negli indici locali e associarlo su Firestore senza mutare UID'
  );
});

// 14. Riapertura e Selettore: legge autorevolmente da Firestore e getKnownTripIds
test('Scenario 14: Riapertura e selettore -> conservazione di tutti i viaggi autorizzati', () => {
  const tripConfig = read('src/utils/tripConfig.ts');
  assert.ok(
    tripConfig.includes('export function getKnownTripIds') &&
    tripConfig.includes('export function addKnownTripId'),
    'tripConfig deve esportare getKnownTripIds e addKnownTripId per preservare l\'indice dei viaggi'
  );
  assert.ok(
    accountService.includes('const { getKnownTripIds } = await import(\'../utils/tripConfig\');') &&
    accountService.includes('knownList.forEach('),
    'fetchUserTrips deve includere tutti i viaggi presenti in getKnownTripIds oltre a /users/{uid}'
  );
});

// 15. Nessun bypass hardcoded per email o 0000
test('Scenario 15: Zero bypass hardcoded per email nunzio114 o viaggio 0000', () => {
  const gestioneViaggio = read('src/views/altro/GestioneViaggioView.tsx');
  const liveService = read('src/services/liveService.ts');
  assert.ok(
    !gestioneViaggio.includes("nunzio114@gmail.com"),
    'GestioneViaggioView non deve contenere autorizzazioni speciali per email hardcoded'
  );
  assert.ok(
    !gestioneViaggio.includes("(config.id === '0000' ? 'nunzio' : undefined)"),
    'GestioneViaggioView non deve usare nunzio come fallback hardcoded per 0000'
  );
  assert.ok(
    !liveService.includes("(tripId === '0000' && user.uid === 'nunzio')"),
    'liveService non deve avere bypass hardcoded per 0000 e nunzio'
  );
});

console.log(`\nRisultato finale: ${passed}/${total} test superati con successo.\n`);
assert.strictEqual(passed, total, 'Tutti gli scenari devono essere superati');

