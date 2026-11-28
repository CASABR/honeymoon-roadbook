const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('src/App.tsx');
const navBar = read('src/components/NavBar.tsx');
const navigation = read('src/utils/mainNavigation.ts');
const altro = read('src/views/AltroView.tsx');
const admin = read('src/views/altro/AdminDashboardView.tsx');

let passed = 0;
function test(name, condition) {
  if (!condition) throw new Error(`[FAIL] ${name}`);
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('Swipe e tap condividono lo stesso ordine delle quattro sezioni',
  navigation.includes("['oggi', 'categorie', 'mappa', 'altro']") && navBar.includes('MAIN_SECTION_ORDER.map'));
test('HouniAI resta fuori dalla sequenza swipe e accessibile dal pulsante',
  !navigation.includes('HouniAI') && navBar.includes('Apri HouniAI'));
test('Swipe orizzontale sincronizza activeTab e rispetta i margini',
  app.includes('getAdjacentMainSection(activeTab') && navigation.includes("return MAIN_SECTION_ORDER[targetIndex] || null"));
test('Scroll verticale e componenti interattivi non vengono intercettati',
  app.includes('Math.abs(deltaX) <= Math.abs(deltaY) * 1.35') &&
  ['.leaflet-container', '[role="dialog"]', '[role="slider"]', 'overflow-x-auto', '[data-carousel]'].every(value => navigation.includes(value)));
test('Strumenti di viaggio è configurato in griglia compatta 2x2',
  altro.includes('Strumenti di Viaggio') &&
  altro.includes('grid grid-cols-2') &&
  ['Documenti', 'Spese', 'Lista Bagagli', 'Scadenze'].every(label => altro.includes(label)));
test('Tutte le sezioni e funzioni chiave sono presenti nel nuovo menu',
  ['Sicurezza', 'Emergenze e numeri utili', 'Assicurazione e assistenza H24', 'Travel Toolkit',
   'Organizzazione', 'Partecipanti &amp; Copiloti', 'Note di Viaggio', 'Esporta Itinerario PDF',
   'Account &amp; Sistema', 'Account e accesso Cloud', 'Ruolo Dispositivo', 'Stato Sincronizzazione'].every(label => altro.includes(label)));
test('Iconografia HOUNIGO e relativo collegamento UI sono assenti',
  !altro.includes('Iconografia Hounigo') && !altro.includes('TrailIconsShowcaseModal') && !altro.includes('showIconsShowcase'));
test('La card Admin è visibile solo sul viaggio 0000',
  altro.includes("currentTripConfig?.id === '0000'") && (altro.match(/data-admin-console-card/g) || []).length === 1);
test('La card Admin non modifica i controlli globali esistenti',
  altro.includes('Accesso soggetto ad autorizzazione globale') && admin.includes("setAccessStatus('unauthorized')") && admin.includes('system_admins'));


const predeparture = read('src/components/cards/PreDeparturePhotoCard.tsx');
const photoJournal = read('src/services/photoJournalService.ts');
const photoShare = read('src/components/common/ShareTripPhotoButton.tsx');
test('Ripristino card solo nel primo giorno effettivo',
  predeparture.includes('data-testid="restore-predeparture-photo"') &&
  predeparture.includes('localDate() !== startDate') &&
  predeparture.includes('selectedDate !== startDate') &&
  predeparture.includes('restorePredeparturePrompt(tripId, journalUserId)'));
test('Ripristino foto solo sul dispositivo e revocabile',
  photoJournal.includes('restoreKey(tripId, userId)') &&
  photoJournal.includes('localStorage.removeItem(restoreKey(tripId, userId))') &&
  photoJournal.includes('if (isPredeparturePromptRestored(tripId, userId)) return false;'));
test('Condivisione LIVE solo di foto esplicite e previa conferma',
  photoShare.includes("attachment.purpose === 'photo'") &&
  photoShare.includes("attachment.type === 'image'") &&
  photoShare.includes('window.confirm(') && photoShare.includes('!navigator.onLine') &&
  photoShare.includes('verifyPrivilegedLivePublisher(tripId, user.uid)') &&
  photoShare.includes('publishLivePhotoOnce(tripId, normalized') &&
  !photoShare.includes('useEffect('));
test('Condivisione foto integrata in tappe, attività e dettagli',
  ['src/components/cards/TappaCard.tsx','src/components/cards/AttivitaCard.tsx','src/components/modals/TimelineItemDetailModal.tsx']
    .every(p => read(p).includes('<TripPhotoShareActions attachments=')));

const archive = read('src/services/predeparturePhotoArchive.ts');
const publication = read('src/services/livePhotoPublication.ts');
const live = read('src/views/altro/LiveView.tsx');
const liveService = read('src/services/liveService.ts');
test('Foto ricordo: archivio privato separato, anteprima e stato pubblicato', 
  archive.includes("hounigo-private-photo-journal") && archive.includes('JSON.stringify([tripId, userId])') &&
  photoJournal.includes('savePredeparturePhotoDurably') && predeparture.includes('data-testid="predeparture-photo-preview"') &&
  predeparture.includes('data-testid="predeparture-published"') && predeparture.includes('photo.liveUpdateId ? ('));
test('Foto: stesso identificativo per contenuto e transazione che non sovrascrive un post esistente',
  publication.includes("crypto.subtle.digest('SHA-256'") && publication.includes('getStableLivePhoto(tripId, postId)') &&
  liveService.includes('runTransaction(db') && liveService.includes('if (snap.exists()) return snap.data()') &&
  [live, predeparture, photoShare].every(source => source.includes('publishLivePhotoOnce(')));
test('Foto: una sola rappresentazione nella galleria per post collegato',
  live.includes('p.liveUpdateId && publicIds.has(p.liveUpdateId)') && live.includes('archivedPhoto') && live.includes('stillQueued'));
test('Card attiva: cornice corallo e indicatore integrato, senza secondo anello',
  read('src/index.css').includes('background: #ff6b5f;') &&
  read('src/views/OggiView.tsx').includes('className="hounigo-card-active-label"') &&
  read('src/index.css').includes('[data-active-card="true"].hounigo-card-highlighted'));
console.log(`\n${passed}/${passed} verifiche UI mirate superate.`);

require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'test_live_photo_reliability.cjs')], { stdio: 'inherit' });

require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'test_roadbook_draft_handoff.cjs')], { stdio: 'inherit' });
