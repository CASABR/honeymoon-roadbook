/**
 * Test: Tappe dell'itinerario (Mount Eden), orari di apertura, selettore orario 5 minuti.
 * Logica pura (openingHours.ts) transpilata con TypeScript e verificata; wiring verificato sui sorgenti.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
const test = (name, fn) => { try { fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

const js = ts.transpileModule(read('src/utils/openingHours.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function('module', 'exports', 'require', js)(m, m.exports, require);
const { assessOpeningHours, getOpeningHoursDay, openingHoursMessage } = m.exports;

console.log('--- TEST: TAPPE ITINERARIO, ORARI DI APERTURA, SELETTORE ORARIO ---');

const verified = (extra = {}) => ({ status: 'verified', accessType: 'attraction', verifiedAt: '2026-11-01', weekly: { wed: '09:00-17:00' }, ...extra });

test('Giorno della settimana corretto (2 dic 2026 = martedì)', () => assert.strictEqual(getOpeningHoursDay('2026-12-02'), 'wed'));
test('Senza dati: "Orari non verificati", mai "aperto"', () => {
  assert.strictEqual(assessOpeningHours(undefined, '2026-12-02', '10:00'), 'unverified');
  assert.strictEqual(openingHoursMessage(undefined, '2026-12-02', '10:00').text, 'Orari non verificati.');
});
test('Stato non verificato o senza data di verifica resta non verificato', () => {
  assert.strictEqual(assessOpeningHours({ status: 'unverified', accessType: 'attraction', weekly: { wed: '09:00-17:00' } }, '2026-12-02', '10:00'), 'unverified');
  assert.strictEqual(assessOpeningHours({ status: 'manual', accessType: 'attraction', weekly: { wed: '09:00-17:00' } }, '2026-12-02', '10:00'), 'unverified');
});
test('Orario dentro apertura = compatibile; fuori = possibile chiusura (avviso)', () => {
  assert.strictEqual(assessOpeningHours(verified(), '2026-12-02', '10:00'), 'compatible');
  assert.strictEqual(assessOpeningHours(verified(), '2026-12-02', '18:30'), 'closed');
  assert.strictEqual(openingHoursMessage(verified(), '2026-12-02', '18:30').tone, 'warning');
});
test('Eccezioni (festività) prevalgono sul giorno e "chiuso" è riconosciuto', () => {
  assert.strictEqual(assessOpeningHours(verified({ exceptions: { '2026-12-02': 'chiuso' } }), '2026-12-02', '10:00'), 'closed');
  assert.strictEqual(assessOpeningHours(verified({ exceptions: { '2026-12-02': '12:00-14:00' } }), '2026-12-02', '10:00'), 'closed');
});
test('Più intervalli e passaggio della mezzanotte', () => {
  const info = verified({ weekly: { wed: '09:00-12:00, 14:00-18:00' } });
  assert.strictEqual(assessOpeningHours(info, '2026-12-02', '13:00'), 'closed');
  assert.strictEqual(assessOpeningHours(info, '2026-12-02', '15:00'), 'compatible');
  assert.strictEqual(assessOpeningHours(verified({ weekly: { wed: '20:00-02:00' } }), '2026-12-02', '01:00'), 'compatible');
});
test('Luogo all\'aperto non è confuso con un\'attrazione a pagamento', () => {
  assert.strictEqual(assessOpeningHours(verified({ accessType: 'outdoor' }), '2026-12-02', '23:00'), 'outdoor');
});
test('Giorno senza orari noti = sconosciuto (nessuna supposizione); formato errato segnalato', () => {
  assert.strictEqual(assessOpeningHours(verified(), '2026-12-03', '10:00'), 'unknown');
  assert.strictEqual(assessOpeningHours(verified({ weekly: { wed: 'su prenotazione' } }), '2026-12-02', '10:00'), 'invalid');
});
test('Nessuna modifica automatica dell\'orario programmato', () => {
  const src = read('src/components/common/OpeningHoursFields.tsx');
  assert.ok(src.includes('non modifica automaticamente'));
  assert.ok(!/onTimeChange|setOrario|departureTime/.test(src));
});
test('Nessuna richiesta di rete/API a pagamento per gli orari (solo dati manuali offline)', () => {
  for (const f of ['src/utils/openingHours.ts', 'src/components/common/OpeningHoursFields.tsx', 'src/components/common/OpeningHoursBadge.tsx'])
    assert.ok(!/fetch\(|XMLHttpRequest|googleapis|places/i.test(read(f)), f);
});
test('Campi orari di apertura salvati in Tappe e Attività (offline, con fonte e data)', () => {
  assert.ok(/openingHours\?: OpeningHoursInfo/.test(read('src/types/index.ts')));
  for (const f of ['src/components/forms/TappaForm.tsx', 'src/components/forms/AttivitaForm.tsx']) assert.ok(/\n\s+openingHours\r?\n/.test(read(f)), f + ' salva openingHours');
  assert.ok(read('src/components/cards/TappaCard.tsx').includes('OpeningHoursBadge'));
  assert.ok(read('src/components/cards/AttivitaCard.tsx').includes('OpeningHoursBadge'));
});

// Selettore orario
const picker = read('src/components/common/TimePickerInput.tsx');
test('Selettore: 288 opzioni a 5 minuti, digitazione diretta HH:mm, nessuna normalizzazione retroattiva', () => {
  assert.ok(picker.includes('length: 24 * 12') && picker.includes('% 12) * 5'));
  assert.ok(picker.includes('type="text"') && picker.includes('inputMode="numeric"') && picker.includes('placeholder="HH:mm"'));
  assert.ok(picker.includes("TIME_OPTIONS.includes(value) ? value : ''"), 'valori non multipli di 5 restano invariati');
  assert.ok(picker.includes('aria-label'));
});
test('Selettore: nessun type="time" residuo; usato in form, modali, Oggi e Scadenze', () => {
  const files = ['AlloggioForm', 'AttivitaForm', 'RistoranteForm', 'ShoppingForm', 'TappaForm', 'TrasportoForm'].map(n => `src/components/forms/${n}.tsx`)
    .concat(['src/components/modals/SmartInsertModal.tsx', 'src/components/modals/TimeCollisionModal.tsx', 'src/components/modals/UnifiedBookingModal.tsx', 'src/views/OggiView.tsx', 'src/views/altro/ScadenzeView.tsx']);
  for (const f of files) { const s = read(f); assert.ok(s.includes('TimePickerInput'), f); assert.ok(!s.includes('type="time"'), f + ' type=time'); }
});
test('Campi orario distinti preservati (partenza, arrivo, ritrovo, check-in, riconsegna)', () => {
  const s = read('src/components/forms/TrasportoForm.tsx') + read('src/components/forms/AlloggioForm.tsx') + read('src/components/forms/AttivitaForm.tsx');
  for (const k of ['departureTime', 'arrivalTime', 'checkInTime', 'checkOutTime', 'orarioRitrovo']) assert.ok(s.includes(k), k);
});

// Mount Eden / Tappe itinerario
const ws = read('src/views/desktop/PrenotazioniWorkspaceView.tsx');
test('Sezione "Tappe dell\'itinerario" con tutte le tappe, ricerca e card modificabile', () => {
  assert.ok(ws.includes("workspaceSection === 'tappe'") && ws.includes('storageService.getTappe()'));
  assert.ok(ws.includes('tappaSearchQuery') && ws.includes('<TappaCard') && ws.includes('canEdit'));
  assert.ok(!/filteredTappe[^;]*(filter\([^)]*(attachments|qr|linkedDocument))/.test(ws), 'nessun filtro che escluda tappe senza biglietto');
});
test('Tappe senza prenotazione non contate tra i voucher mancanti; nessuna scrittura sui record', () => {
  assert.ok(ws.includes('Non vengono conteggiate come voucher mancanti'));
  const section = ws.slice(ws.indexOf('const filteredTappe'), ws.indexOf('const handleOpenAddWithCategory'));
  assert.ok(!/save|delete|update/i.test(section), 'sezione sola lettura');
  assert.ok(ws.includes('bookedTappaIds') && ws.includes('Prenotazione collegata'));
});

console.log(`\n${passed} test superati`);
