/**
 * Test di Verifica Sprint 4/4 — Console Admin Globale & Sicurezza Firestore
 * Verifica regole di sicurezza, gestione dei 4 stati (autorizzato, non autorizzato, errore rete, db vuoto),
 * assenza di conteggi fittizi (zero viaggi fittizio) e distinzione tra ruoli locali e globali.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST SUITE SPRINT 4: CONSOLE ADMIN GLOBALE & SICUREZZA ---');

const rulesPath = path.join(__dirname, '..', 'firestore.rules');
assert.ok(fs.existsSync(rulesPath), 'firestore.rules deve esistere');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const adminViewPath = path.join(__dirname, '..', 'src', 'views', 'altro', 'AdminDashboardView.tsx');
assert.ok(fs.existsSync(adminViewPath), 'AdminDashboardView.tsx deve esistere');
const adminContent = fs.readFileSync(adminViewPath, 'utf8');

let passedTests = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. REGOLE FIRESTORE LOCALI
test('Firestore Rules: isGlobalAdmin verifica /system_admins/{uid} o claim admin', () => {
  assert.ok(rulesContent.includes('function isGlobalAdmin()'), 'Funzione isGlobalAdmin definita');
  assert.ok(
    rulesContent.includes('exists(/databases/$(database)/documents/system_admins/$(request.auth.uid))'),
    'Controllo exists in system_admins presente'
  );
  assert.ok(
    rulesContent.includes("request.auth.token.get('admin', false) == true"),
    'Controllo token custom claim admin presente'
  );
});

test('Firestore Rules: Scansione globale /trips (list) riservata esclusivamente a isGlobalAdmin', () => {
  assert.ok(rulesContent.includes('match /trips/{tripId}'), 'Match trips presente');
  assert.ok(rulesContent.includes('allow list: if isGlobalAdmin();'), 'allow list protetto da isGlobalAdmin');
  // Membri ordinari e proprietari di singoli viaggi possono leggere solo il proprio viaggio tramite get
  assert.ok(rulesContent.includes('allow get: if isSignedIn() && ('), 'allow get protetto per membri o admin');
});

test('Firestore Rules: Collezione /system_admins totalmente inaccessibile ai client SDK', () => {
  assert.ok(rulesContent.includes('match /system_admins/{adminId}'), 'Match system_admins presente');
  assert.ok(rulesContent.includes('allow read, write: if false;'), 'system_admins immutabile e non leggibile da client');
});

test('Firestore Rules: Lettura globale /users protetta da isGlobalAdmin', () => {
  assert.ok(rulesContent.includes('match /users/{userId}'), 'Match users presente');
  assert.ok(
    rulesContent.includes('allow read: if isSignedIn() && (request.auth.uid == userId || isGlobalAdmin());'),
    'Elenco utenti protetto da isGlobalAdmin'
  );
});

// 2. GESTIONE DEI 4 STATI NEL FRONTEND (AdminDashboardView)
test('Frontend: Definizione tipo GlobalAdminAccessStatus con 4 stati fondamentali', () => {
  assert.ok(adminContent.includes('export type GlobalAdminAccessStatus ='), 'Tipo GlobalAdminAccessStatus esportato');
  assert.ok(adminContent.includes("'authorized'"), 'Stato authorized presente');
  assert.ok(adminContent.includes("'unauthorized'"), 'Stato unauthorized presente');
  assert.ok(adminContent.includes("'network_error'"), 'Stato network_error presente');
  assert.ok(adminContent.includes("'empty_database'"), 'Stato empty_database presente');
  assert.ok(adminContent.includes("'checking'"), 'Stato checking presente');
});

test('Frontend: fetchGlobalTrips gestisce offline preventivo e fallimenti di rete', () => {
  assert.ok(adminContent.includes("!navigator.onLine"), 'Controllo offline in fetchGlobalTrips');
  assert.ok(adminContent.includes("setAccessStatus('network_error')"), 'Stato network_error impostato');
});

test('Frontend: Distinzione tra assenza reale di viaggi ed errore di autorizzazione', () => {
  // Se la query ha successo ma snap.empty è true -> empty_database
  assert.ok(adminContent.includes("snap.empty"), 'Controllo snap.empty presente');
  assert.ok(adminContent.includes("setAccessStatus('empty_database')"), 'Stato empty_database impostato');
  // Se getDocs fallisce con permission-denied -> unauthorized
  assert.ok(adminContent.includes("err?.code === 'permission-denied'"), 'Gestione permission-denied presente');
  assert.ok(adminContent.includes("setAccessStatus('unauthorized')"), 'Stato unauthorized impostato');
});

// 3. NESSUN FALSO ZERO NEL CONTEGGIO METRICHE
test('Frontend: Metriche KPI non mostrano zero quando la query è bloccata o offline', () => {
  // Totale Viaggi
  assert.ok(
    adminContent.includes("accessStatus === 'authorized'"),
    'Condizione accessStatus === authorized presente'
  );
  assert.ok(
    adminContent.includes("accessStatus === 'empty_database'"),
    'Condizione accessStatus === empty_database presente'
  );
  assert.ok(
    adminContent.includes("? metrics.total"),
    'Conteggio reale mostrato solo per authorized'
  );
  assert.ok(
    adminContent.includes(": '—'"),
    'Trattino em-dash visualizzato quando la query non è autorizzata o offline'
  );
});

test('Frontend: Tab Viaggi riflette lo stato senza falsi conteggi a zero', () => {
  assert.ok(
    adminContent.includes("accessStatus === 'unauthorized' ? '(Non autorizzato)'"),
    'Indicazione esplicita non autorizzato nel tab'
  );
  assert.ok(
    adminContent.includes("accessStatus === 'network_error' ? '(Offline)'"),
    'Indicazione offline nel tab'
  );
});

// 4. DISTINZIONE RUOLI: TRIP OWNER vs GLOBAL ADMIN
test('Frontend: Distinzione visibile tra Owner Viaggio Locale e Amministratore Globale', () => {
  assert.ok(adminContent.includes('Ruolo Viaggio Locale'), 'Sezione Ruolo Viaggio Locale presente');
  assert.ok(adminContent.includes('Console Admin Globale'), 'Sezione Console Admin Globale presente');
  assert.ok(
    adminContent.includes('I permessi locali sono isolati e non autorizzano l\'accesso al database globale'),
    'Spiegazione isolamento ruoli presente'
  );
});

test('Frontend: Header badge dinamico (non più hardcoded PROPRIETARIO)', () => {
  assert.ok(
    !adminContent.includes('<span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">\n                PROPRIETARIO\n              </span>'),
    'Badge PROPRIETARIO non è più hardcoded'
  );
  assert.ok(adminContent.includes("'ADMIN GLOBALE'"), 'Badge dinamico per Admin Globale');
  assert.ok(adminContent.includes("'ACCESSO NON AUTORIZZATO'"), 'Badge dinamico per Non Autorizzato');
});

// 5. USABILITÀ & DESIGN SYSTEM: NESSUNA ISTRUZIONE TECNICA RAW ESPOSTA
test('Frontend: Rimozione istruzioni raw Firebase Console per utenti ordinari', () => {
  assert.ok(
    !adminContent.includes('Nella Firebase Console > Firestore, crea il documento'),
    'Nessuna istruzione DIY database per utenti ordinari'
  );
  assert.ok(
    adminContent.includes('Per richiedere l\'abilitazione, fornisci il tuo UID all\'amministratore dell\'infrastruttura'),
    'Messaggio istituzionale chiaro per richiesta privilegi'
  );
  assert.ok(adminContent.includes('Copia UID'), 'Pulsante rapido copia UID presente');
});

// 6. SICUREZZA: NESSUN UID HARDCODED COME BYPASS CLIENT
test('Sicurezza: Nessun UID amministrativo hardcoded nel client per scavalcare Firestore', () => {
  const finalUid = '6Fpp2';
  // L'UID finale non deve essere usato come `if (uid === '...6Fpp2') isGlobalAdmin = true`
  assert.ok(
    !adminContent.includes("=== 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2'"),
    'Nessun hardcoding di UID per autorizzazione client'
  );
  assert.ok(
    !adminContent.includes("6Fpp2' ? true : false"),
    'Nessun bypass fittizio su UID parziale'
  );
});

// 7. RIGORE TABELLA: 4 STATI NELLA TABELLA VIAGGI
test('Frontend: Righe tabella gestiscono esplicitamente i 4 stati', () => {
  assert.ok(adminContent.includes("accessStatus === 'unauthorized'"), 'Riga unauthorized dedicata');
  assert.ok(adminContent.includes("accessStatus === 'network_error'"), 'Riga network_error dedicata');
  assert.ok(adminContent.includes("accessStatus === 'empty_database'"), 'Riga empty_database dedicata');
  assert.ok(
    adminContent.includes('Questo account non dispone dei privilegi di amministratore globale'),
    'Messaggio privacy esplicito'
  );
});

console.log(`\nRisultato: ${passedTests} test superati con successo.\n`);
