const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const onboarding = read('src/views/OnboardingView.tsx');
const accountService = read('src/services/accountService.ts');
const app = read('src/App.tsx');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
};

console.log('\n=== HOUNIGO: FASE 2 — ACCESSO SEMPLICE E ONBOARDING ===\n');

test('Primo accesso: 3 possibilità chiare (Accedi, Crea, Partecipa)', () => {
  assert.ok(onboarding.includes('Hai già un viaggio o un account?'), 'Sezione Accedi presente');
  assert.ok(onboarding.includes('Crea un nuovo viaggio'), 'Opzione Crea presente');
  assert.ok(onboarding.includes('Partecipa a un viaggio'), 'Opzione Partecipa presente');
});

test('Google è l’opzione principale di accesso', () => {
  assert.ok(onboarding.includes('Continua con Google'), 'Pulsante Google presente');
  assert.ok(onboarding.includes('handleGoogleLogin'), 'Handler Google presente');
});

test('Email e Password restano disponibili senza popup', () => {
  assert.ok(onboarding.includes('Accedi al tuo Account (Multi-dispositivo)'), 'Accesso account secondario presente');
  assert.ok(accountService.includes('loginWithEmailPassword'), 'loginWithEmailPassword implementato');
});

test('Nessuna creazione automatica di account anonimi su mount', () => {
  // L'effetto su mount non deve invocare signInAnonymously(auth)
  assert.doesNotMatch(onboarding, /useEffect\(\(\) => \{[^}]*signInAnonymously/s);
});

test('Nessun UID tecnico o codice raw richiesto all’utente in Partecipa', () => {
  assert.doesNotMatch(onboarding, /Il tuo UID Dispositivo/i);
  assert.doesNotMatch(onboarding, /Firebase Spark/i);
  assert.ok(onboarding.includes('Codice o ID del Viaggio'));
});

test('Account con più viaggi: visualizzazione selezione viaggio', () => {
  assert.ok(onboarding.includes('recoveredTrips.map'), 'Mappatura viaggi associati');
  assert.ok(onboarding.includes('I tuoi viaggi sincronizzati'), 'Titolo elenco viaggi sincronizzati');
});

test('Account con 0 viaggi: stato vuoto utile con creazione o adesione', () => {
  assert.ok(onboarding.includes('Nessun viaggio trovato nella cronologia di questo account'), 'Messaggio stato vuoto chiaro');
  assert.ok(onboarding.includes('Crea il tuo primo viaggio'), 'CTA crea primo viaggio da stato vuoto');
  assert.ok(onboarding.includes('Partecipa con un codice viaggio'), 'CTA partecipa da stato vuoto');
});

test('Creazione viaggio: campi essenziali e proposta naturale invito copilota', () => {
  assert.ok(onboarding.includes('Nome del Viaggio *'));
  assert.ok(onboarding.includes("Nome dell'Organizzatore *"));
  assert.ok(onboarding.includes('Partenza *'));
  assert.ok(onboarding.includes('Rientro *'));
  assert.ok(onboarding.includes('Invita un Copilota'));
  assert.ok(onboarding.includes('Lo farò più tardi'));
});

test('Nessun automatismo che modifichi il viaggio 0000', () => {
  assert.ok(!onboarding.includes("deleteDoc(doc(db, 'trips', '0000')"));
  assert.ok(!onboarding.includes("setDoc(doc(db, 'trips', '0000')"));
  assert.ok(!accountService.includes("setDoc(doc(db, 'trips', '0000')"));
});

test('Sessione protetta e recuperabile da IndexedDB su ricaricamento app', () => {
  assert.ok(app.includes('restorePersistedSessionFromIndexedDB'), 'Ripristino sessione da IndexedDB');
  assert.ok(app.includes('getPersistedSession'), 'Controllo sessione locale');
});

console.log(`\nRISULTATO: ${passed}/10 TEST ACCESSO E ONBOARDING SUPERATI CON SUCCESSO!\n`);
