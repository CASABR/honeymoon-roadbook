const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST UNITARIO: SEMPLIFICAZIONE DEFINITIVA COLLEGAMENTO E ACCESSO GOOGLE ===');

const accountServiceCode = fs.readFileSync(path.join(__dirname, 'src', 'services', 'accountService.ts'), 'utf8');
const accountSyncModalCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'modals', 'AccountSyncModal.tsx'), 'utf8');
const onboardingViewCode = fs.readFileSync(path.join(__dirname, 'src', 'views', 'OnboardingView.tsx'), 'utf8');

// 1. Conservazione rigorosa dell'UID nel linking Google
assert(accountServiceCode.includes('userCredential.user.uid !== originalUid'), 'Il linking deve verificare che l\'UID rimanga identico');
assert(accountServiceCode.includes('auth/credential-already-in-use'), 'Deve intercettare account già in uso');
assert(accountServiceCode.includes('auth/provider-already-linked'), 'Deve gestire account già collegato');
console.log('[PASS 01] Conservazione assoluta UID e gestione conflitti verificata in accountService.');

// 2. Distinzione chiara delle etichette UI
assert(onboardingViewCode.includes('Continua con Google'), 'OnboardingView deve usare la dicitura «Continua con Google»');
assert(accountSyncModalCode.includes('Collega Google'), 'AccountSyncModal deve usare la dicitura «Collega Google»');
console.log('[PASS 02] Distinzione UI: «Continua con Google» (login) vs «Collega Google» (collegamento).');

// 3. Offerta di «Collega Google» anche per utenti autenticati con Email/Password
assert(accountSyncModalCode.includes("status.providers.includes('google.com')"), 'Deve controllare se Google è già tra i provider');
assert(accountSyncModalCode.includes('Vuoi accedere con Google con un solo clic'), 'Deve proporre Collega Google ad account email/password');
console.log('[PASS 03] Supporto «Collega Google» per utenti già loggati con Email/Password verificato.');

// 4. Assenza di termini tecnici nei testi utente
const userFacingTexts = [
  'UID Identità Attuale',
  'credential-already-in-use',
  'provider-already-linked'
];
for (const term of userFacingTexts) {
  assert(!accountSyncModalCode.includes(`>${term}<`) && !accountSyncModalCode.includes(`"${term}"`), `Termine tecnico ${term} rimosso dalla UI utente`);
}
console.log('[PASS 04] Assenza di termini tecnici (UID, provider, credential-already-in-use) nei testi per l\'utente.');

// 5. Recupero automatico viaggi
assert(onboardingViewCode.includes('if (trips.length === 1)'), 'Se c\'è un viaggio associato deve selezionarlo automaticamente');
assert(onboardingViewCode.includes('selectRecoveredTrip(trips[0])'), 'Deve chiamare direttamente selectRecoveredTrip senza chiedere ID');
console.log('[PASS 05] Recupero e apertura automatica viaggi confermata.');

console.log('TUTTI I 5 TEST DI VERIFICA SUPERATI CON SUCCESSO.');
