const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

let passed = 0;
const test = (name, condition) => {
  if (!condition) throw new Error(`[FAIL] ${name}`);
  passed += 1;
  console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
};

const attachments = read('src/utils/fileAttachment.ts');
const smartInsert = read('src/components/modals/SmartInsertModal.tsx');
const liveEditorial = read('src/views/altro/LiveEditorialExperience.tsx');
const liveView = read('src/views/altro/LiveView.tsx');
const liveIntelligence = read('src/utils/liveIntelligenceHelper.ts');
const altroView = read('src/views/AltroView.tsx');
const indexCss = read('src/index.css');
const pdfModal = read('src/components/modals/PdfExportModal.tsx');
const pdfService = read('src/services/pdfExportService.ts');
const viteConfig = read('vite.config.ts');

test('Il selettore immagini accetta la libreria iOS e HEIC/HEIF', attachments.includes("IMAGE_FILE_ACCEPT = 'image/*,.heic,.heif'"));
test('HEIC e HEIF sono riconosciuti anche con MIME vuoto', attachments.includes("'.heic': 'image/heic'") && attachments.includes("'.heif': 'image/heif'"));
test('Il MIME generico iOS viene corretto usando l’estensione', attachments.includes("normalizedType !== 'application/octet-stream'") && attachments.includes('IMAGE_MIME_BY_EXTENSION[extension]'));
test('Le foto grandi vengono ottimizzate prima del limite finale', attachments.includes('MAX_IMAGE_SOURCE_SIZE_BYTES = 20 * 1024 * 1024') && attachments.includes('optimized.size > MAX_ATTACHMENT_SIZE_BYTES'));
test('Gli originali piccoli restano invariati', attachments.includes('file.size < 600 * 1024') && attachments.includes('readFileAsDataUrl(file)'));
test('HouniAI usa il selettore foto/PDF condiviso', smartInsert.includes('accept={IMAGE_OR_PDF_FILE_ACCEPT}'));
test('Il LIVE non forza più la fotocamera', !liveEditorial.includes('capture=') && !liveView.includes('capture='));
test('Il LIVE mostra anteprima prima della conferma', liveEditorial.includes('pendingUploadPreview') && liveEditorial.includes('handleConfirmPhotoUpload'));
test('Il LIVE valida PNG/JPEG/HEIC tramite helper condiviso', liveEditorial.includes('isSupportedImageFile(file)') && liveEditorial.includes('HEIC o HEIF'));
test('La disclosure GPS usa details/summary accessibili', liveEditorial.includes('<details') && liveEditorial.includes('<summary'));
test('La disclosure GPS distingue Guida, Copilota e Viewer', ['<strong>Guida:</strong>', '<strong>Copilota:</strong>', '<strong>Viewer:</strong>'].every(value => liveEditorial.includes(value)));
test('La mappa parte dalla posizione reale', liveView.includes("useState<'both' | 'real' | 'planned'>('real')"));
test('I due controlli viewer sono visibili e nominati chiaramente', liveEditorial.includes('Dove siamo adesso') && liveEditorial.includes('Dove dovremmo essere'));
test('La modalità reale non usa una posizione pianificata come fallback', liveView.includes("if (mapCenterMode === 'real') return realCoords || { lat: 20, lng: 0 }"));
test('Il link Maps reale usa le coordinate GPS selezionate', liveView.includes("mapCenterMode === 'real' && realCoords") && liveView.includes('query=${realCoords.lat},${realCoords.lng}'));
test('La modalità prevista mostra solo il marker itinerario', liveEditorial.includes('isPlannedMode && plannedLocation?.coords') && liveEditorial.includes('!isPlannedMode && hasRealLocation'));
test('Gli ospiti esterni non ricevono l’itinerario privato', liveIntelligence.includes('if (isExternalGuest)') && liveIntelligence.includes('plannedLocation: null'));
test('Il calcolo previsto accetta un fuso IANA', liveIntelligence.includes('timeZone?: string') && liveIntelligence.includes('toWallClockMs(currentDateTime, timeZone)'));
test('Altro usa la traccia grafica HOUNIGO', altroView.includes('hounigo-route-group') && indexCss.includes('.hounigo-route-group::before'));
test('LIVE e PDF sono le sole evidenze Coral principali', altroView.includes('Posizione LIVE, programma previsto e cartoline') && altroView.includes('Roadbook A4 personalizzato, anche offline'));
test('Le microinterazioni rispettano reduced motion globale', altroView.includes('hounigo-touch-feedback') && indexCss.includes('@media (prefers-reduced-motion: reduce)'));
test('I riferimenti prenotazione sono esclusi per default', pdfModal.includes('useState(false)') && pdfModal.includes('Disattivati per privacy'));
test('Il servizio PDF include i riferimenti solo su scelta esplicita', pdfService.includes('options.includeBookingRefs ?') && pdfService.includes('if (options.includeBookingRefs && day.accommodation.bookingCode)'));
test('Tutti i chunk JS dinamici rientrano nel precache PWA', viteConfig.includes('**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico}'));
test('La privacy AI non promette conservazione zero o assenza di training', !smartInsert.includes('Non vengono salvati su server esterni') && !smartInsert.includes('né utilizzati per addestrare modelli'));
test('La privacy AI segnala piano, impostazioni e log di sicurezza', smartInsert.includes('dipendono dal piano e dalle impostazioni') && smartInsert.includes('log per sicurezza e prevenzione abusi'));

const serviceWorkerPath = path.join(root, 'dist', 'sw.js');
if (fs.existsSync(serviceWorkerPath)) {
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  test('Il build corrente precache il chunk jsPDF', /assets\/jspdf[^"']+\.js/.test(serviceWorker));
}

console.log(`\n${passed}/${passed} verifiche pre-beta superate.`);
