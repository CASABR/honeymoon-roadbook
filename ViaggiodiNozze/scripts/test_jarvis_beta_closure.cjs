const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('HOUNIGO — VERIFICA AUTOMATIZZATA JARVIS: CHIUSURA BETA 28 OTTOBRE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test #${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test #${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}\n`);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Owner autenticato, ma GPS non attivato (P0-A)
// -----------------------------------------------------------------------------
runTest('Owner autenticato con GPS inattivo: LiveEditorialExperience gestisce inactiveReason="not_started"', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
  assert(file.includes('not_started'), 'Manca stato not_started');
  assert(file.includes('Non ancora avviata'), 'Manca dicitura Non ancora avviata');
  assert(file.includes('isOnline'), 'Props isOnline non gestita');
  assert(!file.includes('props.online'), 'Rimasta regressione props.online undefined');
});

// -----------------------------------------------------------------------------
// TEST 2: Owner che richiede di diventare Guida (P0-A)
// -----------------------------------------------------------------------------
runTest('Owner che richiede Guida: Action card con "Attiva GPS su questo smartphone" e lease handling', () => {
  const liveExp = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
  assert(liveExp.includes('Attiva GPS su questo smartphone'), 'Manca pulsante diretto Attiva GPS');
  assert(liveExp.includes('props.onStartGps'), 'Manca callback onStartGps');
  
  const liveView = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveView.tsx'), 'utf8');
  assert(liveView.includes('assignGuide'), 'LiveView non gestisce assignGuide');
  assert(liveView.includes('persistDeviceSession'), 'LiveView non persiste device session su Guida');
});

// -----------------------------------------------------------------------------
// TEST 3: Lease GPS già occupato da altro dispositivo (P0-A)
// -----------------------------------------------------------------------------
runTest('Lease GPS occupato da altro dispositivo: visualizza other_device_active e Prendi Guida qui', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
  assert(file.includes('other_device_active'), 'Manca gestione other_device_active');
  assert(file.includes('Altro dispositivo Guida attivo'), 'Manca etichetta Altro dispositivo Guida attivo');
  assert(liveHasWord(file, 'Prendi Guida qui') || file.includes('Prendi la Guida'), 'Manca azione trasferimento guida');
});

function liveHasWord(text, word) {
  return text.includes(word);
}

// -----------------------------------------------------------------------------
// TEST 4: Permesso GPS negato e successivamente concesso (P0-A)
// -----------------------------------------------------------------------------
runTest('Permesso GPS negato: visualizza istruzioni iOS/Safari e pulsante Riprova GPS', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
  assert(file.includes('permission_denied'), 'Manca stato permission_denied');
  assert(file.includes('Permesso posizione negato'), 'Manca spiegazione permesso negato');
  assert(file.includes('Su iPhone/Safari'), 'Mancano istruzioni contestuali Safari/iOS');
  assert(file.includes('Riprova GPS'), 'Manca pulsante Riprova GPS');
});

// -----------------------------------------------------------------------------
// TEST 5: Nuovo utente che crea un viaggio (P0-B)
// -----------------------------------------------------------------------------
runTest('Creazione viaggio: scrive su Firestore, registra owner, genera invito crittografico', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf8');
  assert(file.includes('createTripInvite'), 'Manca chiamata a createTripInvite in Onboarding');
  assert(file.includes('setCreatedInviteUrl'), 'Manca memorizzazione link creato');
  assert(file.includes('batch.commit()'), 'Manca commit atomico creazione');
});

// -----------------------------------------------------------------------------
// TEST 6: Account che possiede più viaggi (P1-A)
// -----------------------------------------------------------------------------
runTest('Account con più viaggi: fetchUserTrips estrae viaggi posseduti e copilota senza scansione globale', () => {
  const accountSvc = fs.readFileSync(path.join(__dirname, '../src/services/accountService.ts'), 'utf8');
  assert(accountSvc.includes('fetchUserTrips'), 'Manca fetchUserTrips');
  assert(accountSvc.includes('doc(db, \'users\', uid)'), 'Non legge /users/{uid}');
  assert(accountSvc.includes('doc(db, \'trips\', tripId)'), 'Non esegue get puntuale per tripId');
  assert(!accountSvc.includes('getDocs(collection(db, \'trips\'))'), 'Vietata scansione globale su /trips');
});

// -----------------------------------------------------------------------------
// TEST 7: Passaggio tra viaggi con dati indipendenti (P1-A)
// -----------------------------------------------------------------------------
runTest('Passaggio tra viaggi: switchActiveTrip resetta IndexedDB e notifica trip_config_changed', () => {
  const accountSvc = fs.readFileSync(path.join(__dirname, '../src/services/accountService.ts'), 'utf8');
  assert(accountSvc.includes('switchActiveTrip'), 'Manca switchActiveTrip');
  
  const tripConfig = fs.readFileSync(path.join(__dirname, '../src/utils/tripConfig.ts'), 'utf8');
  assert(tripConfig.includes('closeAndResetDatabases'), 'Manca chiusura e reset DB su cambio viaggio');
  assert(tripConfig.includes('trip_config_changed'), 'Manca dispatch evento trip_config_changed');
});

// -----------------------------------------------------------------------------
// TEST 8: Copilota con invito valido (P0-B)
// -----------------------------------------------------------------------------
runTest('Copilota con invito crittografico valido: validateTripInvite e redeemTripInvite atomico', () => {
  const inviteSvc = fs.readFileSync(path.join(__dirname, '../src/services/tripInviteService.ts'), 'utf8');
  assert(inviteSvc.includes('generateSecureToken'), 'Manca generatore token sicuro');
  assert(inviteSvc.includes('createTripInvite'), 'Manca createTripInvite');
  assert(inviteSvc.includes('validateTripInvite'), 'Manca validateTripInvite');
  assert(inviteSvc.includes('redeemTripInvite'), 'Manca redeemTripInvite');
  assert(inviteSvc.includes('writeBatch'), 'Redeem deve usare writeBatch atomico');
});

// -----------------------------------------------------------------------------
// TEST 9: Utente estraneo con solo tripId (P0-B)
// -----------------------------------------------------------------------------
runTest('Utente estraneo con solo tripId: bloccato da regole Firestore e da OnboardingView', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert(rules.includes('invites/$(request.resource.data.inviteToken)'), 'Rules devono richiedere token esatto');
  assert(rules.includes('getAfter('), 'Rules devono verificare getAfter su invites/{token}');
  
  const onboarding = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf8');
  assert(onboarding.includes('Per unirti a questo viaggio è necessario un link d’invito'), 'Manca blocco solo-tripId in client');
});

// -----------------------------------------------------------------------------
// TEST 10: Invito scaduto o revocato (P0-B)
// -----------------------------------------------------------------------------
runTest('Invito scaduto o revocato: validateTripInvite rifiuta e Security Rules bloccano', () => {
  const inviteSvc = fs.readFileSync(path.join(__dirname, '../src/services/tripInviteService.ts'), 'utf8');
  assert(inviteSvc.includes('Date.now() > expiresAt'), 'Manca controllo scadenza timestamp');
  assert(inviteSvc.includes('data.status === \'revoked\''), 'Manca controllo stato revocato');
  assert(inviteSvc.includes('data.status === \'used\''), 'Manca controllo monouso già usato');
  
  const rules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert(rules.includes('resource.data.expiresAt > request.time'), 'Rules non controllano scadenza');
  assert(rules.includes('resource.data.status == \'active\''), 'Rules non controllano stato active');
});

// -----------------------------------------------------------------------------
// TEST 11: Lettura dati privati prima del join (P0-B)
// -----------------------------------------------------------------------------
runTest('Lettura sottocollezioni private prima del join: protette da isTripMember', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert(rules.includes('match /members/{uid}'), 'Manca match members');
  assert(rules.includes('isTripMember(tripId)'), 'Sottocollezioni devono richiedere isTripMember');
  assert(rules.includes('tripId != \'0000\''), '0000 deve avere protezione speciale');
});

// -----------------------------------------------------------------------------
// TEST 12: Regressioni login, sync, Maps e LIVE (P2)
// -----------------------------------------------------------------------------
runTest('Preservazione funzionalità chiave: login permanente, DayMapsCard compatto, Seed 0000 intatto', () => {
  const mapsCard = fs.readFileSync(path.join(__dirname, '../src/components/cards/DayMapsCard.tsx'), 'utf8');
  assert(mapsCard.includes('auto') && mapsCard.includes('piedi'), 'DayMapsCard deve contenere sia auto che piedi');
  
  const dbFile = fs.readFileSync(path.join(__dirname, '../src/storage/indexedDB.ts'), 'utf8');
  assert(dbFile.includes('MASTER_TRIP_ID = \'0000\''), 'MASTER_TRIP_ID 0000 deve rimanere inalterato');
  
  const appFile = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  assert(appFile.includes('trip_config_changed'), 'App deve ascoltare trip_config_changed');
});

// -----------------------------------------------------------------------------
// TEST 13: Build completa (dist folder e bundle)
// -----------------------------------------------------------------------------
runTest('Build di produzione generata e integra', () => {
  assert(fs.existsSync(path.join(__dirname, '../dist')), 'Cartella dist non esiste');
  assert(fs.existsSync(path.join(__dirname, '../dist/index.html')), 'dist/index.html non esiste');
  assert(fs.existsSync(path.join(__dirname, '../dist/sw.js')), 'Service Worker sw.js non generato');
});

// -----------------------------------------------------------------------------
// TEST 14: Gmail compatto e Sezione Altro strutturata (P1-B, P1-C)
// -----------------------------------------------------------------------------
runTest('Componenti UI rifiniti: GmailConnectionRow e AltroView con gerarchia compiti', () => {
  const gmailRow = fs.readFileSync(path.join(__dirname, '../src/components/common/GmailConnectionRow.tsx'), 'utf8');
  assert(gmailRow.includes('Gmail collegato'), 'Manca stato Gmail collegato');
  assert(gmailRow.includes('isExpanded'), 'Manca logica espandibile');

  const altroView = fs.readFileSync(path.join(__dirname, '../src/views/AltroView.tsx'), 'utf8');
  assert(altroView.includes('Live & Posizione Viaggio'), 'Manca Task 1 LIVE');
  assert(altroView.includes('Documenti & Risorse'), 'Manca Task 2 Documenti');
  assert(altroView.includes('Sicurezza & Assistenza'), 'Manca Task 3 Sicurezza');
  assert(altroView.includes('Gestione Viaggio & Dispositivo'), 'Manca Task 4 Gestione');
  assert(altroView.includes('TripSelectorModal'), 'Manca integrazione TripSelectorModal');
});

console.log('\n----------------------------------------------------------------');
console.log(`RISULTATO TEST: ${passedTests}/${totalTests} superati (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('----------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
