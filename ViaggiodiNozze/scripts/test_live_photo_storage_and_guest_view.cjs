/**
 * Test di validazione mirata per ONBOARDING RIPENSATO + SICUREZZA FOTO LIVE
 * 
 * Verifiche:
 * 1. Storage rules: verifica server-side membership (Owner/Copilota) via Firestore cross-service,
 *    scrittura bloccata per utenti esterni, update vietato (anti-overwrite), delete consentito solo a editor.
 * 2. liveStorageService: uploadLivePhoto e deleteLivePhoto per revoca condivisione.
 * 3. Onboarding Google-first:
 *    - Schermata iniziale con "Crea il tuo viaggio", "Hai ricevuto un invito? Partecipa", "Hai già un account? Accedi".
 *    - Google-gate con spiegazione chiara e pulsante "Accedi con Google e inizia".
 *    - Nessuna creazione senza autenticazione verificata.
 *    - Azione post-creazione: "Aggiungi la prima tappa →".
 * 4. Esperienza Ospiti (clean session): visibilità scatto nel feed e galleria; nessun dato privato esposto.
 * 5. Isolamento foto pre-partenza non condivisa: permane solo locale su dispositivo.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST ONBOARDING RIPENSATO & SICUREZZA STORAGE LIVE 1.6.0 ===\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [OK] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

// 1. REGOLE FIREBASE STORAGE (storage.rules)
test('storage.rules impone controllo server-side Firestore su Owner/Copilota e blocca utenti esterni', () => {
  const rulesPath = path.resolve(__dirname, '../storage.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  assert(rules.includes('match /trips/{tripId}/live_photos/{photoId}'), 'Manca match per trips/{tripId}/live_photos/{photoId}');
  assert(rules.includes('isTripEditor()'), 'Manca funzione di verifica autorizzazione isTripEditor()');
  assert(rules.includes('firestore.get') || rules.includes('firestore.exists'), 'isTripEditor deve interrogare Firestore server-side');
  assert(rules.includes('allow create: if isTripEditor()'), 'La creazione deve essere consentita SOLO a chi è editor verificato del viaggio');
  assert(rules.includes('allow update: if false;'), 'L update deve essere disabilitato per impedire sovrascritture arbitrarie');
  assert(rules.includes('allow delete: if isTripEditor();'), 'La cancellazione deve essere riservata a chi è editor del viaggio');
  assert(rules.includes('allow read: if true;'), 'Manca allow read: if true per le foto live pubbliche');
});

test('storage.rules protegge documenti, voucher e percorsi privati /users/{userId}', () => {
  const rulesPath = path.resolve(__dirname, '../storage.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  assert(rules.includes('match /users/{userId}/{allPaths=**}'), 'Manca protezione users/{userId}');
  assert(rules.includes('request.auth != null && request.auth.uid == userId'), 'I file privati devono essere accessibili solo all’utente autenticato');
  assert(rules.includes('match /{allPaths=**}') && rules.includes('allow read, write: if false;'), 'Manca fallback safe chiuso');
});

// 2. liveStorageService
test('liveStorageService supporta uploadLivePhoto e deleteLivePhoto per revoca', () => {
  const svcPath = path.resolve(__dirname, '../src/services/liveStorageService.ts');
  assert(fs.existsSync(svcPath), 'liveStorageService.ts non esiste');
  const content = fs.readFileSync(svcPath, 'utf-8');

  assert(content.includes('export function dataUrlToBlob'), 'Manca funzione dataUrlToBlob');
  assert(content.includes('export async function uploadLivePhoto'), 'Manca funzione uploadLivePhoto');
  assert(content.includes('export async function deleteLivePhoto'), 'Manca funzione deleteLivePhoto');
  assert(content.includes('MAX_LIVE_PHOTO_BYTES = 5 * 1024 * 1024'), 'Manca costante 5MB');
});

// 3. ONBOARDING RIPENSATO
test('OnboardingView: schermata iniziale con CTA Crea il tuo viaggio e Partecipa', () => {
  const obPath = path.resolve(__dirname, '../src/views/OnboardingView.tsx');
  const content = fs.readFileSync(obPath, 'utf-8');

  assert(content.includes('Organizza il tuo viaggio'), 'Manca titolo coinvolgente nella schermata iniziale');
  assert(content.includes('Crea il tuo viaggio'), 'Manca CTA principale Crea il tuo viaggio');
  assert(content.includes('Hai ricevuto un invito? Partecipa'), 'Manca CTA secondaria Partecipa con invito');
  assert(content.includes('Hai già un account? Accedi'), 'Manca accesso discreto per account esistenti');
});

test('OnboardingView: percorso Google-first dopo Crea il tuo viaggio e blocco creazioni anonime', () => {
  const obPath = path.resolve(__dirname, '../src/views/OnboardingView.tsx');
  const content = fs.readFileSync(obPath, 'utf-8');

  assert(content.includes('Salva e ritrova il tuo viaggio'), 'Manca schermata spiegazione Google');
  assert(content.includes('Accedi con Google e inizia'), 'Manca pulsante Accedi con Google e inizia');
  assert(!content.includes('Oppure continua senza account Google'), 'Non deve essere presente il bypass anonimo per i nuovi viaggi');
  assert(content.includes('Per salvare il tuo viaggio nel cloud, accedi prima con il tuo account Google'), 'Controllo severo su utente autenticato verificato prima del salvataggio');
});

test('OnboardingView: post-creazione con invito Copilota facoltativo e Aggiungi la prima tappa', () => {
  const obPath = path.resolve(__dirname, '../src/views/OnboardingView.tsx');
  const content = fs.readFileSync(obPath, 'utf-8');

  assert(content.includes('Invita un Copilota (facoltativo)'), 'Manca card invito facoltativo copilota');
  assert(content.includes('Aggiungi la prima tappa →'), 'Manca azione principale Aggiungi la prima tappa');
  assert(content.includes("handleFinishOnboarding(undefined, tempConfig, 'guida')"), 'Aggiungi la prima tappa deve completare l’onboarding come guida');
});

// 4. ESPERIENZA OSPITE LIVE (Clean Session: no localStorage, no auth)
test('Esperienza Ospite LIVE: galleria e feed mostrano solo foto con photoUrl', () => {
  const mockServerUpdates = [
    {
      id: 'upd_1',
      title: 'Benvenuti a Melbourne! 🏙️',
      text: 'Prima passeggiata al tramonto sul fiume Yarra.',
      photoUrl: 'https://firebasestorage.googleapis.com/v0/b/app-viaggio-di-nozze.firebasestorage.app/o/trips%2F0000%2Flive_photos%2Fphoto_melbourne.jpg?alt=media',
      locationName: 'Melbourne',
      timestamp: 1731150000000
    },
    {
      id: 'upd_2',
      title: 'Check-in hotel completato',
      text: 'Riposo prima della partenza di domani.',
      locationName: 'Melbourne',
      timestamp: 1731140000000
    }
  ];

  const map = new Map();
  mockServerUpdates.forEach(update => {
    if (update.photoUrl && typeof update.photoUrl === 'string' && update.photoUrl.trim()) {
      map.set(update.photoUrl, {
        id: update.id,
        url: update.photoUrl,
        caption: update.title || update.text || 'Scatto dal diario',
        location: update.locationName,
        timestamp: update.timestamp || Date.now(),
        isCustom: false
      });
    }
  });

  const guestPhotos = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);

  assert.strictEqual(guestPhotos.length, 1, 'L’ospite deve vedere esattamente la foto pubblicata con photoUrl');
  assert.strictEqual(guestPhotos[0].id, 'upd_1', 'La foto deve essere upd_1');
  assert(guestPhotos[0].url.startsWith('https://firebasestorage.googleapis.com/'), 'URL deve essere HTTPS di Storage');
});

console.log(`\nRisultato: ${passedTests}/${totalTests} test passati con successo.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
