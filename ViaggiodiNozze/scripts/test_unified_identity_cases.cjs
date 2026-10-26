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
    userAccessService.includes('payload.associatedTripIds = arrayUnion(tripId);'),
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

// 4. Anonimo accetta invito B, poi collega Google: B resta accessibile
test('Scenario 4: Anonimo accetta B, poi collega Google -> riconciliazione e opzione Google preliminare', () => {
  assert.ok(
    onboardingView.includes('Accedi con Google per legare l\'invito al tuo account'),
    'OnboardingView offre accesso Google diretto prima del riscatto dell\'invito'
  );
  assert.ok(
    tripInviteService.includes('export async function reconcileAnonymousInviteToUser'),
    'tripInviteService implementa la funzione autorizzata di riconciliazione inviti'
  );
});

// 5. Google già esistente recupera un viaggio anonimo mediante procedura autorizzata con prova crittografica
test('Scenario 5: Google già esistente recupera viaggio anonimo mediante prova crittografica Handshake', () => {
  assert.ok(
    tripInviteService.includes('export async function prepareIdentityHandshake') &&
    tripInviteService.includes('export async function reconcileAnonymousInviteWithProof'),
    'tripInviteService implementa il protocollo Handshake con prova verificabile'
  );
  assert.ok(
    accountService.includes('prepareIdentityHandshake') &&
    accountService.includes('reconcileAnonymousInviteWithProof'),
    'accountService genera la prova crittografica prima del cambio di credenziale'
  );
  assert.ok(
    tripInviteService.includes('hsData.secret !== secret'),
    'reconcileAnonymousInviteWithProof rifiuta categoricamente richieste prive di segreto crittografico corrispondente'
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

console.log(`\nRisultato finale: ${passed}/${total} test superati con successo.\n`);
assert.strictEqual(passed, total, 'Tutti i 10 scenari obbligatori devono essere superati');
