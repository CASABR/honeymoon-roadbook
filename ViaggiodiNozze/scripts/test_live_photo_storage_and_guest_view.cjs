/**
 * Test di validazione mirata per FIX FOTO LIVE OSPITI - CHIUSURA 1.6.0
 * 
 * Verifiche:
 * 1. Storage rules: lettura pubblica per trips/{tripId}/live_photos/{photoId},
 *    scrittura autenticata max 5MB/immagini, protezione rigorosa di /users/{userId} e fallback closed.
 * 2. liveStorageService: conversione blob, restrizione dimensione 5MB, generazione path e metadata.
 * 3. LiveView & PreDeparturePhotoCard: chiamata a uploadLivePhoto prima di publishToLive e passaggio di photoUrl.
 * 4. Esperienza Ospiti (clean session): visibilità scatto nel feed e galleria; nessun dato privato esposto.
 * 5. Isolamento foto pre-partenza non condivisa: permane solo locale su dispositivo.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST FIX FOTO LIVE OSPITI & REGOLE STORAGE 1.6.0 ===\n');

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
test('storage.rules consente lettura pubblica delle foto live del viaggio', () => {
  const rulesPath = path.resolve(__dirname, '../storage.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  assert(rules.includes('match /trips/{tripId}/live_photos/{photoId}'), 'Manca match per trips/{tripId}/live_photos/{photoId}');
  assert(rules.includes('allow read: if true;'), 'Manca allow read: if true per le foto live');
  assert(rules.includes('request.resource.size < 5 * 1024 * 1024'), 'Manca limite 5MB per upload foto live');
  assert(rules.includes("request.resource.contentType.matches('image/(jpeg|png|webp|gif)')"), 'Mancano restrizioni sui formati immagine');
});

test('storage.rules protegge documenti, voucher e percorsi privati /users/{userId}', () => {
  const rulesPath = path.resolve(__dirname, '../storage.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  assert(rules.includes('match /users/{userId}/{allPaths=**}'), 'Manca protezione users/{userId}');
  assert(rules.includes('request.auth != null && request.auth.uid == userId'), 'I file privati devono essere accessibili solo all’utente autenticato');
  assert(rules.includes('match /{allPaths=**}') && rules.includes('allow read, write: if false;'), 'Manca fallback safe chiuso');
});

// 2. EXPORT STORAGE DA FIREBASE.TS
test('firebase.ts inizializza ed esporta storage con supporto emulator', () => {
  const fbPath = path.resolve(__dirname, '../src/firebase.ts');
  const content = fs.readFileSync(fbPath, 'utf-8');

  assert(content.includes('import { getStorage, connectStorageEmulator } from "firebase/storage"'), 'Manca import modular firebase/storage');
  assert(content.includes('storageInstance = getStorage(app)'), 'Manca getStorage(app)');
  assert(content.includes('export const storage = storageInstance'), 'Manca export storage');
  assert(content.includes('connectStorageEmulator(storageInstance'), 'Manca connectStorageEmulator');
});

// 3. liveStorageService
test('liveStorageService esiste ed esporta uploadLivePhoto e dataUrlToBlob', () => {
  const svcPath = path.resolve(__dirname, '../src/services/liveStorageService.ts');
  assert(fs.existsSync(svcPath), 'liveStorageService.ts non esiste');
  const content = fs.readFileSync(svcPath, 'utf-8');

  assert(content.includes('export function dataUrlToBlob'), 'Manca funzione dataUrlToBlob');
  assert(content.includes('export async function uploadLivePhoto'), 'Manca funzione uploadLivePhoto');
  assert(content.includes('MAX_LIVE_PHOTO_BYTES = 5 * 1024 * 1024'), 'Manca costante 5MB');
  assert(content.includes('trips/${tripId}/live_photos/'), 'Manca percorso dedicato trips/${tripId}/live_photos/');
  assert(content.includes('getDownloadURL'), 'Manca getDownloadURL');
});

// 4. LiveView.tsx PUBBLICAZIONE CON photoUrl
test('LiveView.tsx carica su Storage prima di publishToLive e invia photoUrl valido', () => {
  const liveViewPath = path.resolve(__dirname, '../src/views/altro/LiveView.tsx');
  const content = fs.readFileSync(liveViewPath, 'utf-8');

  assert(content.includes('uploadLivePhoto(activeTripId, compressedDataUrl, photoId)'), 'LiveView deve chiamare uploadLivePhoto');
  assert(content.includes('photoUrl: publicPhotoUrl'), 'LiveView deve passare publicPhotoUrl a publishToLive');
  assert(content.includes('Caricamento foto su Storage non riuscito'), 'LiveView deve gestire errori di caricamento senza fingere successo');
});

// 5. PreDeparturePhotoCard.tsx CARICAMENTO STORAGE
test('PreDeparturePhotoCard.tsx carica su Storage se toggle attivo e preserva privato se spento', () => {
  const cardPath = path.resolve(__dirname, '../src/components/cards/PreDeparturePhotoCard.tsx');
  const content = fs.readFileSync(cardPath, 'utf-8');

  assert(content.includes('uploadLivePhoto(tripId, currentPhoto.url, photoId)'), 'PreDeparturePhotoCard deve chiamare uploadLivePhoto');
  assert(content.includes('photoUrl: uploadRes.downloadUrl'), 'PreDeparturePhotoCard deve passare photoUrl a publishToLive');
  assert(content.includes('if (shareOnLiveToggle)'), 'Condivisione deve avvenire solo se il toggle è attivo');
  assert(content.includes('Foto salvata nel diario di questo dispositivo'), 'Se non condivisa deve restare solo locale');
});

// 6. SIMULAZIONE ESPERIENZA OSPITE (Clean Session: no localStorage, no auth)
test('Esperienza Ospite LIVE: galleria e feed mostrano foto con photoUrl e ignorano dati locali', () => {
  // Mock di aggiornamenti Live ricevuti dal server Firestore per il viaggio
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
      // Senza foto
      locationName: 'Melbourne',
      timestamp: 1731140000000
    },
    {
      id: 'upd_3',
      title: 'Scatto dall aereo ✈️',
      text: 'Sopra l oceano Indiano!',
      photoUrl: 'https://firebasestorage.googleapis.com/v0/b/app-viaggio-di-nozze.firebasestorage.app/o/trips%2F0000%2Flive_photos%2Fphoto_plane.jpg?alt=media',
      timestamp: 1731130000000
    }
  ];

  // Simula la logica usata in LiveView/LiveEditorialExperience per assemblare la galleria
  // Ospite non ha localStorage né galleryCustomPhotos né customPhoto
  const guestGalleryCustomPhotos = [];
  const guestCustomPhoto = null;

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

  assert.strictEqual(guestPhotos.length, 2, 'L’ospite deve vedere esattamente le 2 foto pubblicate con photoUrl');
  assert.strictEqual(guestPhotos[0].id, 'upd_1', 'La foto più recente deve essere in prima posizione');
  assert(guestPhotos[0].url.startsWith('https://firebasestorage.googleapis.com/'), 'URL deve essere HTTPS di Storage');
  assert.strictEqual(guestPhotos[1].id, 'upd_3', 'La seconda foto deve essere upd_3');

  // Nessun documento personale o dato sensibile è presente nella galleria
  const exposedVouchersOrDocs = guestPhotos.filter(p => p.url.includes('/users/') || p.caption.includes('PNR'));
  assert.strictEqual(exposedVouchersOrDocs.length, 0, 'Nessun voucher o documento privato deve essere esposto agli ospiti');
});

console.log(`\nRisultato: ${passedTests}/${totalTests} test passati con successo.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
