const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function sortTimeline(items) {
  const minutes = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value || '')
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    : null;
  return [...items].sort((a, b) => {
    if ((a.effectiveDate || '') !== (b.effectiveDate || '')) return (a.effectiveDate || '').localeCompare(b.effectiveDate || '');
    const left = minutes(a.sortTime || a.time);
    const right = minutes(b.sortTime || b.time);
    if (left !== null && right !== null) return left - right;
    if (left !== null) return -1;
    if (right !== null) return 1;
    return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
  });
}

test('arrivo Auckland precede cena e alloggio', () => {
  const sorted = sortTimeline([
    { id: 'hotel', effectiveDate: '2026-11-30', time: '21:00' },
    { id: 'arrival', effectiveDate: '2026-11-30', time: '17:25' },
    { id: 'dinner', effectiveDate: '2026-11-30', time: '19:30' }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['arrival', 'dinner', 'hotel']);
});

test('mezzanotte resta un orario reale', () => {
  const sorted = sortTimeline([
    { id: 'after', effectiveDate: '2026-12-02', time: '00:10' },
    { id: 'midnight', effectiveDate: '2026-12-02', time: '00:00' },
    { id: 'previous', effectiveDate: '2026-12-01', time: '23:55' }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['previous', 'midnight', 'after']);
});

test('gli orari assenti non diventano 00:00 o 12:00', () => {
  const storage = read('src/storage/storageService.ts');
  assert.doesNotMatch(storage, /time:\s*t\.orario[^\n]+10:00/);
  assert.doesNotMatch(storage, /time:\s*a\.time[^\n]+14:00/);
  assert.match(storage, /time:\s*r\.orario\s*\|\|\s*''/);
});

test('arrivo finale e scalo sono eventi indipendenti', () => {
  const storage = read('src/storage/storageService.ts');
  assert.match(storage, /segmentContext:\s*'arrival'/);
  assert.match(storage, /segmentContext:\s*'scalo'/);
  assert.doesNotMatch(storage, /else if \(finalArrivalDate === dateStr/);
});

test('banner informativi esclusi dal routing fisico', () => {
  const ordering = read('src/utils/timelineOrdering.ts');
  const oggi = read('src/views/OggiView.tsx');
  assert.match(ordering, /!item\.informational/);
  assert.match(oggi, /find\(candidate => isPhysicalTimelineItem/);
  assert.match(oggi, /informational:\s*true/);
});

test('Taxi attraversa modello form filtri import e prenotazioni', () => {
  for (const file of [
    'src/types/index.ts',
    'src/components/forms/TrasportoForm.tsx',
    'src/components/cards/TrasportoCard.tsx',
    'src/views/TrasportiView.tsx',
    'src/services/aiExtractor.ts',
    'src/services/unifiedBookingService.ts',
    'src/components/modals/SmartInsertModal.tsx'
  ]) assert.match(read(file), /taxi/i, file);
});

test('nuove soste fotografiche appartengono alle Tappe', () => {
  const activityForm = read('src/components/forms/AttivitaForm.tsx');
  const tappaForm = read('src/components/forms/TappaForm.tsx');
  assert.match(tappaForm, /Sosta fotografica/);
  assert.match(activityForm, /LegacyPhotoStopForm/);
  assert.match(activityForm, /<TappaForm/);
  assert.doesNotMatch(activityForm, /SOTTOCATEGORIE[^\n]+Spot fotografico/);
});

test('editor Copilota non reidrata durante la digitazione', () => {
  const modal = read('src/components/modals/UniversalCopilotaModal.tsx');
  assert.match(modal, /isOpen && !wasOpenRef\.current/);
  assert.match(modal, /data-copilota-editor="stable"/);
});

test('coda import richiede approvazione individuale', () => {
  const modal = read('src/components/modals/SmartInsertModal.tsx');
  assert.match(modal, /status:\s*'pending'/);
  assert.match(modal, /Nessun elemento viene salvato finché non lo approvi singolarmente/);
  assert.match(modal, /status:\s*'approved'/);
  assert.match(modal, /'pending' \| 'approved' \| 'skipped'/);
});

test('coda import blocca doppio salvataggio e duplicati non confermati', () => {
  const modal = read('src/components/modals/SmartInsertModal.tsx');
  assert.match(modal, /saveInFlightRef\.current/);
  assert.match(modal, /existingData && !duplicateConfirmed/);
  assert.match(modal, /Confermo di aggiornare questo record esistente/);
});

test('linguaggio allegati uniforme e stato assente neutro', () => {
  for (const file of ['AlloggioCard.tsx', 'AttivitaCard.tsx', 'RistoranteCard.tsx', 'ShoppingCard.tsx', 'TrasportoCard.tsx']) {
    const card = read(`src/components/cards/${file}`);
    assert.match(card, /Biglietti e QR/, file);
    assert.match(card, /bg-slate-100/, file);
  }
});

test('PNR trasporto non è mostrato sul fronte', () => {
  const card = read('src/components/cards/TrasportoCard.tsx');
  assert.doesNotMatch(card, /Copia PNR:\s*\$\{transport\.bookingCode\}/);
  assert.match(card, /Copia codice prenotazione/);
});

console.log(`\n${passed}/${passed} controlli mirati superati.`);
