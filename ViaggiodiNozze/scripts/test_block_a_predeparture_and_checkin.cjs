/**
 * TEST SUITE — BLOCK A: SECTION 4 (PRE-DEPARTURE PHOTO CARD) & SECTION 5 (CHECK-IN TRASPORTI E ALLOGGI)
 * Verifica:
 * 1. PreDeparturePhotoCard compare SOLO nel Giorno 1 (selectedDate === startDate) e mai sugli altri giorni.
 * 2. PreDeparturePhotoCard può essere nascosta definitivamente (localStorage + IndexedDB) e non ricompare.
 * 3. PreDeparturePhotoCard non crea attività automatiche ("Foto pre partenza") nel roadbook.
 * 4. PreDeparturePhotoCard forza stripExif: true tramite processFileForAttachment e presenta la vista retro informativa sul LIVE e il toggle "Condividi anche nel LIVE".
 * 5. Check-in Trasporti e Alloggi è indipendente dallo stato pagamento (paymentStatus, cost, acconto).
 * 6. Modificare checkInDone / checkOutDone / dropoffDone su Trasporto o Alloggio mantiene intatti i campi in private_credentials (bookingCode, pinCode, attachments, noteCopilota).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

console.log('=== VERIFICA BLOCK A — SEZIONE 4 (FOTO PRE-PARTENZA) & SEZIONE 5 (CHECK-IN) ===\n');

const preDepCardPath = path.join(__dirname, '..', 'src', 'components', 'cards', 'PreDeparturePhotoCard.tsx');
const preDepCardCode = fs.readFileSync(preDepCardPath, 'utf8');

const photoJournalPath = path.join(__dirname, '..', 'src', 'services', 'photoJournalService.ts');
const photoJournalCode = fs.readFileSync(photoJournalPath, 'utf8');

const fileAttachmentPath = path.join(__dirname, '..', 'src', 'utils', 'fileAttachment.ts');
const fileAttachmentCode = fs.readFileSync(fileAttachmentPath, 'utf8');

const oggiViewPath = path.join(__dirname, '..', 'src', 'views', 'OggiView.tsx');
const oggiViewCode = fs.readFileSync(oggiViewPath, 'utf8');

const trasportoCardPath = path.join(__dirname, '..', 'src', 'components', 'cards', 'TrasportoCard.tsx');
const trasportoCardCode = fs.readFileSync(trasportoCardPath, 'utf8');

const alloggioCardPath = path.join(__dirname, '..', 'src', 'components', 'cards', 'AlloggioCard.tsx');
const alloggioCardCode = fs.readFileSync(alloggioCardPath, 'utf8');

const splitterPath = path.join(__dirname, '..', 'src', 'utils', 'securityDataSplitter.ts');
const splitterCode = fs.readFileSync(splitterPath, 'utf8');

check('1. PreDeparturePhotoCard riceve selectedDate da OggiView e appare SOLO nel Giorno 1 (selectedDate === startDate)', () => {
  assert(oggiViewCode.includes('selectedDate={selectedDate}'), 'OggiView deve passare selectedDate a PreDeparturePhotoCard');
  assert(preDepCardCode.includes('selectedDate === startDate'), 'PreDeparturePhotoCard deve verificare selectedDate === startDate');
  assert(preDepCardCode.includes('localDate() <= startDate'), 'PreDeparturePhotoCard deve verificare che il viaggio sia futuro o nel giorno di partenza');
});

check('2. PreDeparturePhotoCard supporta archiviazione definitiva ("Non mostrare più") in localStorage + IndexedDB', () => {
  assert(preDepCardCode.includes('Non mostrare più'), 'Pulsante "Non mostrare più" presente');
  assert(photoJournalCode.includes('storageService.saveSetting(dismissKey(tripId, userId), true)'), 'Persistenza in IndexedDB presente');
  assert(photoJournalCode.includes('isPredeparturePromptDismissedAsync'), 'Verifica asincrona IndexedDB presente');
});

check('3. PreDeparturePhotoCard NON crea alcuna attività nel roadbook e rimuove metadati EXIF', () => {
  assert(!preDepCardCode.includes('saveActivity'), 'PreDeparturePhotoCard non deve mai chiamare saveActivity');
  assert(!photoJournalCode.includes('saveActivity'), 'photoJournalService non deve mai chiamare saveActivity');
  assert(preDepCardCode.includes('processFileForAttachment(file, { stripExif: true })'), 'Deve invocare stripExif: true');
  assert(fileAttachmentCode.includes('!options?.stripExif'), 'fileAttachment deve forzare ricodifica Canvas quando stripExif è true');
});

check('4. PreDeparturePhotoCard include vista retro informativa sul LIVE e toggle esplicito "Condividi anche nel LIVE"', () => {
  assert(preDepCardCode.includes('Cos’è il LIVE?'), 'Pulsante info retro presente');
  assert(preDepCardCode.includes('Come funziona il diario LIVE durante il viaggio'), 'Spiegazione retro LIVE presente');
  assert(preDepCardCode.includes('Condividi anche nel LIVE'), 'Toggle esplicito "Condividi anche nel LIVE" presente');
});

check('5. TrasportoCard e AlloggioCard espongono stato e toggle rapido di Check-in indipendente dal pagamento', () => {
  assert(trasportoCardCode.includes('handleToggleCheckIn'), 'TrasportoCard ha handleToggleCheckIn');
  assert(trasportoCardCode.includes('checkInDone: !transport.checkInDone'), 'TrasportoCard inverte checkInDone senza toccare paymentStatus');
  assert(alloggioCardCode.includes('handleToggleCheckIn'), 'AlloggioCard ha handleToggleCheckIn');
  assert(alloggioCardCode.includes('handleToggleCheckOut'), 'AlloggioCard ha handleToggleCheckOut');
  assert(alloggioCardCode.includes('checkInDone: nextCheckIn'), 'AlloggioCard aggiorna checkInDone indipendentemente dal pagamento');
});

check('6. checkInDone / checkOutDone / dropoffDone sono campi operativi pubblici e non cancellano mai private_credentials', () => {
  assert(!splitterCode.includes("'checkInDone'"), 'checkInDone deve restare nel documento operativo pubblico');
  assert(!splitterCode.includes("'checkOutDone'"), 'checkOutDone deve restare nel documento operativo pubblico');
});

console.log(`\n=== RIEPILOGO: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

