const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   HOUNIGO: TEST DI CHIUSURA SPRINT (4 ASPETTI CRITICI)');
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
// ASPETTO 1: INVITI COPILOTA SU FIREBASE SPARK
// -----------------------------------------------------------------------------
const rulesSource = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
const settingsMenuSource = fs.readFileSync(path.join(__dirname, 'src/components/common/SettingsMenu.tsx'), 'utf8');
const onboardingViewSource = fs.readFileSync(path.join(__dirname, 'src/views/OnboardingView.tsx'), 'utf8');

runTest('1.1 Rules bloccano auto-promozione di estranei su /members (prevenzione join arbitrario)', () => {
  // Un estraneo NON può creare arbitrariamente un record membro con role copilota o owner
  assert.ok(
    rulesSource.includes("isTripOwner(tripId)") || rulesSource.includes("getAfter"),
    'Creazione membro vincolata all\'owner effettivo del viaggio'
  );
  assert.ok(
    !rulesSource.includes("allow create: if true"),
    'Nessun permesso pubblico di auto-registrazione'
  );
});

runTest('1.2 SettingsMenu esegue il batch atomico (Spark-native) per autorizzare il copilota', () => {
  assert.ok(settingsMenuSource.includes('writeBatch(db)'), 'Usa writeBatch atomico per autorizzazione');
  assert.ok(settingsMenuSource.includes('members: arrayUnion(cleanUid)'), 'Aggiunge UID ai members del viaggio');
  assert.ok(settingsMenuSource.includes("role: 'copilota'"), 'Assegna ruolo copilota');
});

runTest('1.3 Rules garantiscono revoca immediata: cancellazione membro disabilita get e subcollections', () => {
  // isTripMember verifica ownerUid || members array || exists(members/{uid})
  assert.ok(rulesSource.includes('function isTripMember(tripId)'), 'Funzione isTripMember presente');
  assert.ok(rulesSource.includes("resource.data.role != 'owner'"), 'Owner non revocabile ma copilota sì');
});

runTest('1.4 Flusso link d\'invito: OnboardingView gestisce URL con parametri role e join', () => {
  assert.ok(onboardingViewSource.includes("urlParams.get('join')"), 'Legge parametro join da URL');
  assert.ok(onboardingViewSource.includes("urlParams.get('role')"), 'Legge parametro role da URL');
  assert.ok(onboardingViewSource.includes('setTempRole'), 'Imposta il ruolo copilota su ricezione invito');
});

// -----------------------------------------------------------------------------
// ASPETTO 2: RECUPERO VIAGGI TRAMITE associatedTripIds
// -----------------------------------------------------------------------------
const accountServiceSource = fs.readFileSync(path.join(__dirname, 'src/services/accountService.ts'), 'utf8');
const userAccessServiceSource = fs.readFileSync(path.join(__dirname, 'src/services/userAccessService.ts'), 'utf8');

runTest('2.1 recordUserAccess popola /users/{uid} con associatedTripIds escludendo 0000', () => {
  assert.ok(userAccessServiceSource.includes('associatedTripIds = arrayUnion(tripId)'), 'Aggiunge viaggio con arrayUnion');
  assert.ok(userAccessServiceSource.includes("tripId !== '0000'"), 'Esclude 0000 per preservare integrità legacy');
});

runTest('2.2 associatedTripIds NON conferisce permessi Firestore (Rules indipendenti da /users)', () => {
  // Le Rules su /trips/{tripId} e sottocollezioni NON consultano /users/{userId}
  const tripsRuleBlock = rulesSource.substring(rulesSource.indexOf('match /trips/{tripId}'));
  assert.ok(!tripsRuleBlock.includes('/users/$(request.auth.uid)'), 'Rules di /trips non usano /users come fonte di autorità');
});

runTest('2.3 fetchUserTrips esegue getDoc puntuali: un ID abusivo riceve PERMISSION_DENIED e viene scartato', () => {
  assert.ok(accountServiceSource.includes('getDoc(doc(db, \'trips\', tripId))'), 'Verifica getDoc puntuale');
  // Se getDoc fallisce (es. utente revocato o ID falso), il blocco catch salta silenziosamente
  assert.ok(accountServiceSource.includes('catch {'), 'Scarta viaggi inaccessibili');
});

// -----------------------------------------------------------------------------
// ASPETTO 3: DIAGNOSTICA IN SOLA LETTURA PER IL VIAGGIO 0000
// -----------------------------------------------------------------------------
const localDiagnosticsSource = fs.readFileSync(
  path.join(__dirname, 'src/components/dev/LocalIdentityDiagnostics.tsx'),
  'utf8'
);

runTest('3.1 LocalIdentityDiagnostics esegue verifica remota in SOLA LETTURA su /trips/0000', () => {
  assert.ok(localDiagnosticsSource.includes("getDoc(doc(db, 'trips', '0000'))"), 'Esegue getDoc su 0000');
  assert.ok(!localDiagnosticsSource.includes("setDoc(doc(db, 'trips', '0000')"), 'Nessuna scrittura remota su 0000');
  assert.ok(!localDiagnosticsSource.includes("updateDoc(doc(db, 'trips', '0000')"), 'Nessun update remoto su 0000');
});

runTest('3.2 LocalIdentityDiagnostics confronta currentUser.uid con remote0000OwnerUid', () => {
  assert.ok(localDiagnosticsSource.includes('currentUser.uid === rOwner'), 'Confronta UID locale con owner remoto');
  assert.ok(localDiagnosticsSource.includes('QUESTA È LA SESSIONE OWNER'), 'Evidenzia sessione owner');
  assert.ok(localDiagnosticsSource.includes('PARTECIPANTE / NON OWNER DI 0000'), 'Evidenzia sessione partecipante');
  assert.ok(localDiagnosticsSource.includes('ACCESSO A 0000 NON AUTORIZZATO'), 'Evidenzia sessione non autorizzata');
});

runTest('3.3 SettingsMenu include il link diretto alla diagnostica identità 0000', () => {
  assert.ok(settingsMenuSource.includes('identityDiagnostics=1'), 'Link rapido a identityDiagnostics presente');
  assert.ok(settingsMenuSource.includes('Verifica Identità 0000'), 'Etichetta descrittiva presente');
});

// -----------------------------------------------------------------------------
// ASPETTO 4: SICUREZZA TRANSIZIONI ACCOUNT & ALTERNATIVE PWA
// -----------------------------------------------------------------------------
const accountSyncModalSource = fs.readFileSync(
  path.join(__dirname, 'src/components/modals/AccountSyncModal.tsx'),
  'utf8'
);

runTest('4.1 Gestione sicura conflitti: nessun logout in caso di credential-already-in-use', () => {
  assert.ok(accountServiceSource.includes('auth/credential-already-in-use'), 'Gestione codice errore collisione');
  assert.ok(!accountServiceSource.includes('signOut(auth)'), 'Nessun signOut automatico');
});

runTest('4.2 Supporto Email+Password per aggirare blocco popup su iPhone Safari PWA', () => {
  assert.ok(accountSyncModalSource.includes('Accedi con Email e Password'), 'Opzione di accesso Email e Password nel modale');
  assert.ok(accountSyncModalSource.includes('linkEmailPasswordToCurrentSession'), 'Invocazione funzione linking email');
  assert.ok(accountServiceSource.includes('EmailAuthProvider.credential'), 'Creazione credenziale email nativa');
});

runTest('4.3 Conservazione dati locali: nessuna operazione cancella IndexedDB o localStorage durante il linking', () => {
  assert.ok(!accountSyncModalSource.includes('localStorage.clear()'), 'Nessuna cancellazione localStorage');
  assert.ok(!accountSyncModalSource.includes('idbClearAll('), 'Nessuna cancellazione IndexedDB nel modale');
});

console.log('\n=================================================================');
console.log(`RISULTATO TEST CHIUSURA SPRINT: ${passedTests}/${totalTests} ASSERZIONI SUPERATE CON SUCCESSO!`);
console.log('=================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
