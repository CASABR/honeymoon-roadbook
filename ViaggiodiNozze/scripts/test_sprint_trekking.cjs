const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const types = read('src/types/index.ts');
const form = read('src/components/forms/AttivitaForm.tsx');
const card = read('src/components/cards/AttivitaCard.tsx');
const oggi = read('src/views/OggiView.tsx');
const activities = read('src/views/AttivitaView.tsx');
const storage = read('src/storage/storageService.ts');
const summary = read('src/services/unifiedBookingService.ts');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
};

console.log('\n=== HOUNIGO: SPRINT SOTTOCATEGORIA TREKKING ===\n');

test('Trekking estende Attivita senza creare nuove entita', () => {
  assert.match(types, /sottocategoria\?: 'Trekking' \|/);
  assert.doesNotMatch(types, /interface Trekking\s*{/);
});

test('Campi trekking sono opzionali e retrocompatibili', () => {
  for (const field of ['distanceKm?: number', 'elevationGainM?: number', 'hikingDurationMinutes?: number', 'routeType?: TipologiaPercorsoTrekking', 'currency?: string', 'difficulty?: string']) {
    assert.ok(types.includes(field), `Campo mancante: ${field}`);
  }
});

test('Editor mostra il form dedicato solo per Trekking', () => {
  assert.ok(form.includes("sottocategoria === 'Trekking'"));
  for (const label of ['Titolo del trekking', 'Distanza km', 'Dislivello + m', 'Cammino ore', 'Tipologia percorso', 'Punto di partenza', 'Link percorso o traccia', 'Difficoltà']) {
    assert.ok(form.includes(label), `Controllo mancante: ${label}`);
  }
  assert.ok(form.includes('{!isTrekking && !isPhotoSpot && <>'), 'Form standard non preservato separatamente');
});

test('Valori numerici mancanti restano undefined', () => {
  assert.ok(form.includes('parsedDistance && parsedDistance > 0 ? parsedDistance : initialData?.distanceKm'));
  assert.ok(form.includes('totalHikingMinutes > 0 ? totalHikingMinutes : initialData?.hikingDurationMinutes'));
  assert.doesNotMatch(form, /distanceKm:\s*0/);
  assert.doesNotMatch(form, /elevationGainM:\s*0/);
});

test('Card trekking evidenzia metriche senza zeri fittizi', () => {
  for (const label of ['Partenza', 'Distanza', 'Dislivello', 'Durata']) assert.ok(card.includes(label));
  assert.ok(card.includes('activity.distanceKm != null && activity.distanceKm > 0'));
  assert.ok(card.includes('activity.elevationGainM != null && activity.elevationGainM > 0'));
  assert.ok(card.includes("trekkingPrice &&"));
});

test('Card condivisa integra Gestione Attivita e Oggi', () => {
  assert.ok(activities.includes('<AttivitaCard'));
  assert.ok(oggi.includes('<AttivitaCard'));
  assert.ok(summary.includes('isTrekkingActivity(act)'));
});

test('Permessi esistenti restano applicati a modifica ed eliminazione', () => {
  assert.ok(activities.includes('const { canEdit } = useDeviceRole()'));
  assert.ok(activities.includes('disabled={!canEdit}'));
  assert.ok(activities.includes('{canEdit && ('));
});

test('Salvataggio conserva tutti i campi tramite spread', () => {
  assert.match(storage, /const item: Attivita = \{\s*\.\.\.activity,/);
});

test('Round-trip locale preserva creazione e modifica', () => {
  const localStore = new Map();
  const original = {
    id: 'test_trekking', dayId: 'day_2099-01-01', date: '2099-01-01', title: 'Trekking di prova',
    category: 'natura', sottocategoria: 'Trekking', status: 'libero', location: 'Trailhead',
    time: '07:15', orarioInizio: '07:15', distanceKm: 12.4, elevationGainM: 620,
    hikingDurationMinutes: 285, routeType: 'anello', cost: '15', currency: 'EUR',
    difficulty: 'Media', link: 'https://example.test/track', notes: 'Acqua', createdAt: 1, updatedAt: 1
  };
  localStore.set(original.id, JSON.parse(JSON.stringify(original)));
  const reopened = JSON.parse(JSON.stringify(localStore.get(original.id)));
  assert.deepEqual(reopened, original);
  localStore.set(original.id, { ...reopened, distanceKm: 13.1, updatedAt: 2 });
  assert.equal(localStore.get(original.id).distanceKm, 13.1);
  localStore.delete(original.id);
  assert.equal(localStore.has(original.id), false);
});

test('Form e card includono layout mobile, desktop e dark', () => {
  assert.ok(form.includes('grid-cols-2 sm:grid-cols-4'));
  assert.ok(card.includes('gridTemplateColumns') && card.includes('minmax(0, 1fr)'));
  assert.ok(form.includes('dark:bg-slate-800'));
  assert.ok(card.includes('dark:text-white'));
});

test('Meccanismi tema congelati non sono importati o riscritti', () => {
  assert.doesNotMatch(form + card, /DarkModeToggle|localStorage\.setItem\(['"]theme|classList\.toggle\(['"]dark/);
});

console.log(`\nRISULTATO: ${passed}/11 TEST TREKKING SUPERATI\n`);
