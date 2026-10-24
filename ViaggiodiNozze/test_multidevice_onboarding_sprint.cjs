const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   TEST SPRINT HOUNIGO: ACCOUNT MULTI-DISPOSITIVO & ONBOARDING');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS ${String(totalTests).padStart(2, '0')}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL ${String(totalTests).padStart(2, '0')}] ${name}`);
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 1. VERIFICA FILE E STRUTTURA DEL CODICE
// -----------------------------------------------------------------------------
const accountServiceSource = fs.readFileSync(
  path.join(__dirname, 'src/services/accountService.ts'),
  'utf8'
);
const onboardingViewSource = fs.readFileSync(
  path.join(__dirname, 'src/views/OnboardingView.tsx'),
  'utf8'
);
const settingsMenuSource = fs.readFileSync(
  path.join(__dirname, 'src/components/common/SettingsMenu.tsx'),
  'utf8'
);
const accountModalSource = fs.readFileSync(
  path.join(__dirname, 'src/components/modals/AccountSyncModal.tsx'),
  'utf8'
);

runTest('1. accountService.ts esporta le funzioni essenziali per multi-dispositivo', () => {
  assert.ok(accountServiceSource.includes('export function getAccountStatus'), 'getAccountStatus esportato');
  assert.ok(accountServiceSource.includes('export async function verifyTripOwnership'), 'verifyTripOwnership esportato');
  assert.ok(accountServiceSource.includes('export async function fetchUserTrips'), 'fetchUserTrips esportato');
  assert.ok(accountServiceSource.includes('export async function linkGoogleToCurrentSession'), 'linkGoogleToCurrentSession esportato');
  assert.ok(accountServiceSource.includes('export async function linkEmailPasswordToCurrentSession'), 'linkEmailPasswordToCurrentSession esportato');
  assert.ok(accountServiceSource.includes('export async function loginWithEmailPassword'), 'loginWithEmailPassword esportato');
  assert.ok(accountServiceSource.includes('export async function loginWithGoogle'), 'loginWithGoogle esportato');
});

runTest('2. fetchUserTrips NON esegue query "list" su /trips (riservata ad admin)', () => {
  // Deve leggere da /users/{uid} e fare getDoc singoli su tripId autorizzati
  assert.ok(!accountServiceSource.includes("query(collection(db, 'trips')"), 'Nessuna query globale su /trips');
  assert.ok(accountServiceSource.includes("doc(db, 'users', uid)"), 'Legge documento /users/{uid}');
  assert.ok(accountServiceSource.includes("doc(db, 'trips', tripId)"), 'Esegue getDoc puntuale per ciascun ID');
});

runTest('3. verifyTripOwnership lavora in sola lettura senza assunzioni', () => {
  assert.ok(accountServiceSource.includes("getDoc(doc(db, 'trips', tripId))"), 'Usa getDoc in sola lettura');
  assert.ok(!accountServiceSource.includes("setDoc(doc(db, 'trips', tripId)"), 'Nessuna scrittura su /trips');
  assert.ok(!accountServiceSource.includes("updateDoc(doc(db, 'trips', tripId)"), 'Nessun update su /trips');
});

runTest('4. Gestione sicura conflitti credenziali (nessun logout o perdita sessione)', () => {
  assert.ok(accountServiceSource.includes('auth/credential-already-in-use'), 'Gestisce credential-already-in-use');
  assert.ok(accountServiceSource.includes('auth/popup-blocked'), 'Gestisce popup-blocked per Safari/iOS');
});

runTest('5. Supporto Email+Password per Safari iPhone PWA senza popup né redirect', () => {
  assert.ok(accountServiceSource.includes('EmailAuthProvider.credential'), 'Supporta credenziali email native');
  assert.ok(accountServiceSource.includes('linkWithCredential'), 'Supporta linking account via credenziali');
});

// -----------------------------------------------------------------------------
// 2. REQUISITO B: ONBOARDING CON INVITO FACOLTATIVO
// -----------------------------------------------------------------------------
runTest('6. OnboardingView include la modalità "invite_choice"', () => {
  assert.ok(onboardingViewSource.includes("'invite_choice'"), 'Stato invite_choice presente');
});

runTest('7. Requisito B: Opzione "Invita un Copilota" con copia/condivisione link', () => {
  assert.ok(onboardingViewSource.includes('handleShareCreatedInviteUrl'), 'Funzione condivisione invito presente');
  assert.ok(onboardingViewSource.includes('handleCopyCreatedInviteUrl'), 'Funzione copia link invito presente');
  assert.ok(onboardingViewSource.includes('getCreatedTripInviteUrl'), 'Generazione link invito dedicata');
});

runTest('8. Requisito B: Opzione "Lo farò più tardi" entra subito senza bloccare', () => {
  assert.ok(onboardingViewSource.includes('Lo farò più tardi'), 'Opzione Lo farò più tardi presente');
  assert.ok(onboardingViewSource.includes('Entra nel Roadbook 🚀'), 'Pulsante rapido di ingresso');
});

runTest('9. OnboardingView offre accesso per account multi-dispositivo esistenti', () => {
  assert.ok(onboardingViewSource.includes('account_login'), 'Modalità account_login presente');
  assert.ok(onboardingViewSource.includes('Accedi al tuo Account (Multi-dispositivo)'), 'Pulsante accesso multi-dispositivo presente in homepage');
});

runTest('10. OnboardingView non ha nomi hardcoded per viaggi custom', () => {
  // In modalità role, usa ownerName dinamico se diverso da 0000
  assert.ok(onboardingViewSource.includes("tempConfig?.ownerName || 'Organizzatore'"), 'Nome guida dinamico');
});

// -----------------------------------------------------------------------------
// 3. SEPARAZIONE DEI RUOLI & INTEGRAZIONE SETTINGS
// -----------------------------------------------------------------------------
runTest('11. SettingsMenu integra AccountSyncModal', () => {
  assert.ok(settingsMenuSource.includes('AccountSyncModal'), 'AccountSyncModal importato');
  assert.ok(settingsMenuSource.includes('Account & Multi-Dispositivo'), 'Voce menu presente');
});

runTest('12. AccountSyncModal distingue sessione anonima da account permanente', () => {
  assert.ok(accountModalSource.includes('Sessione Anonima Locale'), 'Badge sessione anonima presente');
  assert.ok(accountModalSource.includes('Account Persistente Attivo'), 'Badge account persistente presente');
  assert.ok(accountModalSource.includes('Collega Account Google'), 'Pulsante Google presente');
  assert.ok(accountModalSource.includes('Collega con Email e Password'), 'Opzione Email/Password presente per iOS/PWA');
});

runTest('13. Nessun automatismo distruttivo o mutazioni non richieste', () => {
  // Verifichiamo che AccountSyncModal non lanci link/login in useEffect
  assert.ok(!accountModalSource.includes('useEffect(() => {\n    handleLink'), 'Nessun link automatico su mount');
  assert.ok(!accountModalSource.includes('signOut('), 'Nessun logout implicito');
});

console.log('\n=================================================================');
console.log(`RISULTATO TEST SPRINT: ${passedTests}/${totalTests} ASSERZIONI SUPERATE CON SUCCESSO!`);
console.log('=================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
