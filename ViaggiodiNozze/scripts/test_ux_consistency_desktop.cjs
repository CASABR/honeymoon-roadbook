const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const oggi = read('src/views/OggiView.tsx');
const modal = read('src/components/common/Modal.tsx');
const smartInsert = read('src/components/modals/SmartInsertModal.tsx');
const noteView = read('src/views/altro/NoteViaggioView.tsx');
const storage = read('src/storage/storageService.ts');
const types = read('src/types/index.ts');
const cards = [
  'AttivitaCard',
  'RistoranteCard',
  'ShoppingCard',
  'TappaCard',
  'AlloggioCard',
  'TrasportoCard'
].map(name => read(`src/components/cards/${name}.tsx`));
const forms = [
  'AttivitaForm',
  'RistoranteForm',
  'ShoppingForm',
  'TappaForm',
  'AlloggioForm',
  'TrasportoForm'
].map(name => read(`src/components/forms/${name}.tsx`));
const insertionCategories = oggi.slice(
  oggi.indexOf('const INSERT_CATEGORIES'),
  oggi.indexOf('function suggestTimeBetween')
);

let passed = 0;
function test(name, condition) {
  if (!condition) throw new Error(`[FAIL] ${name}`);
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('Le sei card mantengono campi comuni e accesso Copilota',
  cards.every(source => source.includes('UniversalCopilotaModal')) &&
  cards.every(source => /location|address|indirizzo|departureLocation/.test(source)) &&
  cards.every(source => /time|orario|checkInTime|departureTime/.test(source)));

test('Il Trekking conserva la variante e i dati editoriali specifici',
  cards[0].includes('isTrekkingActivity') &&
  cards[0].includes('distanceKm') &&
  cards[0].includes('elevationGainM') &&
  cards[0].includes('hikingDurationMinutes'));

test('La sosta fotografica espone orario nei percorsi rapido e completo',
  smartInsert.includes("value=\"Sosta fotografica\"") &&
  smartInsert.includes("type=\"time\"") &&
  forms[3].includes('defaultTime') &&
  cards[3].includes('Orario libero'));

test('Il riordino note persiste senza modificare gli ID',
  types.includes('order?: number') &&
  storage.includes('async reorderNote(noteIds: string[])') &&
  storage.includes("notifyDataChanged('note', 'save', updated)") &&
  noteView.includes('draggable') &&
  noteView.includes('{canManageNotes && (') &&
  noteView.includes('Sposta nota prima') &&
  noteView.includes('Sposta nota dopo'));

test('L inserimento desktop offre esattamente le sei categorie',
  (insertionCategories.match(/type: '(tappa|attivita|ristorante|alloggio|trasporto|shopping)'/g) || []).length === 6 &&
  oggi.includes('INSERT_CATEGORIES.map') &&
  oggi.includes('{canEdit && nextItem && (') &&
  oggi.includes('hidden min-h-7 items-center justify-center lg:flex'));

test('L orario intermedio usa solo valori reali e richiede conferma quando non sicuro',
  oggi.includes('previous.timeIsDefault || next.timeIsDefault') &&
  oggi.includes('end - start < 2') &&
  oggi.includes('disabled={!insertDraftTime}') &&
  forms.every(source => source.includes('defaultTime')));

test('La nuova card nasce solo dal submit del form esistente',
  oggi.includes("setCreatingCategory(category.type)") &&
  !oggi.slice(oggi.indexOf('INSERT_CATEGORIES.map'), oggi.indexOf('ROUTEBADGE SEQUENZIALE')).includes('storageService.save'));

test('L header desktop usa il giorno selezionato senza nuove letture',
  oggi.includes('hidden lg:flex sticky top-0') &&
  oggi.includes('formatDateHuman(selectedDate)') &&
  oggi.includes('currentDayData?.location') &&
  !oggi.slice(oggi.indexOf('hidden lg:flex sticky top-0'), oggi.indexOf('hidden lg:flex sticky top-0') + 3500).includes('storageService.'));

test('Le modali condivise sono nel body, centrate e accessibili',
  modal.includes('createPortal(modalNode, document.body)') &&
  modal.includes('aria-modal="true"') &&
  modal.includes("event.key === 'Escape'") &&
  modal.includes('previousFocus?.focus()') &&
  modal.includes('max-h-[90dvh]'));

test('I popup custom di Oggi restano nel viewport e bloccano lo sfondo',
  (oggi.match(/createPortal\(/g) || []).length >= 2 &&
  oggi.includes('copilotModalRef') &&
  oggi.includes("document.body.style.overflow = 'hidden'") &&
  oggi.includes('max-h-[90dvh] overflow-y-auto'));

console.log(`\n${passed}/${passed} verifiche UX desktop mirate superate.`);
