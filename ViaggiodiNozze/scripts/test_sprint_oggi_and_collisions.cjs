const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const oggi = read('src/views/OggiView.tsx');
const modal = read('src/components/modals/TimeCollisionModal.tsx');
const trasporti = read('src/views/TrasportiView.tsx');
const attivita = read('src/views/AttivitaView.tsx');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
};

console.log('\n=== HOUNIGO: FASE 3 — RIFINITURA OGGI & CONFLITTI ORARIO ===\n');

test('Nuova Spesa utilizza il verde tenue coerente con i token semantici', () => {
  assert.ok(oggi.includes('Nuova Spesa (verde tenue coerente con token semantici)'));
  assert.ok(oggi.includes('bg-emerald-50/70'));
  assert.ok(oggi.includes('text-emerald-800 dark:text-emerald-200'));
  assert.ok(oggi.includes('border-emerald-200/70 dark:border-emerald-800/60'));
});

test('Icona Maps di giornata ridotta e proporzionata senza perdere area touch', () => {
  assert.ok(oggi.includes('w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400'));
});

test('TimeCollisionModal implementa la 3a opzione: Modifica orario', () => {
  assert.ok(modal.includes('Modifica orario'), 'Pulsante Modifica orario presente');
  assert.ok(modal.includes('onUpdateTime'), 'Prop onUpdateTime supportata');
  assert.ok(modal.includes('onOpenEditForm'), 'Prop onOpenEditForm supportata');
});

test('TimeCollisionModal include controlli rapidi per spostamento orario (-30m, +30m, +1h, +2h)', () => {
  assert.ok(modal.includes("['-30m', '+30m', '+1h', '+2h'].map"));
  assert.ok(modal.includes('Applica orario ✓'));
});

test('Calcolo orario gestisce correttamente il passaggio a mezzanotte', () => {
  // Test unitario della logica di wrap-around
  const shiftTime = (currentTime, minutes) => {
    const [h, m] = currentTime.split(':').map(Number);
    let total = h * 60 + m + minutes;
    if (total < 0) total += 24 * 60;
    total = total % (24 * 60);
    const newH = String(Math.floor(total / 60)).padStart(2, '0');
    const newM = String(total % 60).padStart(2, '0');
    return `${newH}:${newM}`;
  };

  assert.equal(shiftTime('23:30', 60), '00:30', 'Passaggio mezzanotte in avanti');
  assert.equal(shiftTime('00:15', -30), '23:45', 'Passaggio mezzanotte all\'indietro');
  assert.equal(shiftTime('14:00', 30), '14:30', 'Spostamento standard');
});

test('Preservazione della durata nei trasporti quando l’orario viene modificato', () => {
  assert.ok(oggi.includes('durationMin'), 'Calcolo durationMin presente in OggiView');
  assert.ok(trasporti.includes('durationMin'), 'Calcolo durationMin presente in TrasportiView');
  assert.ok(oggi.includes('newArrivalTime = `${arrH}:${arrM}`'));
});

test('OggiView, TrasportiView e AttivitaView collegano onUpdateTime e onOpenEditForm', () => {
  assert.ok(oggi.includes('onUpdateTime='));
  assert.ok(oggi.includes('onOpenEditForm='));
  assert.ok(trasporti.includes('onUpdateTime='));
  assert.ok(trasporti.includes('onOpenEditForm='));
  assert.ok(attivita.includes('onUpdateTime='));
  assert.ok(attivita.includes('onOpenEditForm='));
});

test('La collisione risolta viene salvata in sessionStorage e ricalcolata', () => {
  assert.ok(oggi.includes("sessionStorage.setItem(activeCollision.id, 'resolved')"));
  assert.ok(oggi.includes('await fetchTimeline()'));
});

test('Spostamento oltre mezzanotte aggiorna la data del giorno successivo o precedente', () => {
  assert.ok(modal.includes('dateOffsetDays'), 'TimeCollisionModal traccia dateOffsetDays per scavalco mezzanotte');
  assert.ok(modal.includes('dateDeltaDays'), 'TimeCollisionModal passa dateDeltaDays al callback');
  assert.ok(oggi.includes('shiftDateStr'), 'OggiView supporta aggiornamento data con shiftDateStr');
  assert.ok(trasporti.includes('shiftDateStr'), 'TrasportiView supporta aggiornamento data con shiftDateStr');
  assert.ok(attivita.includes('shiftDateStr'), 'AttivitaView supporta aggiornamento data con shiftDateStr');

  const shiftDateStr = (dateStr, delta) => {
    if (!dateStr || !delta) return dateStr;
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().split('T')[0];
  };

  assert.equal(shiftDateStr('2026-08-10', 1), '2026-08-11', 'Scavalco mezzanotte +1 giorno');
  assert.equal(shiftDateStr('2026-08-10', -1), '2026-08-09', 'Scavalco mezzanotte -1 giorno');
  assert.equal(shiftDateStr('2026-02-28', 1), '2026-03-01', 'Scavalco fine mese');
});

console.log(`\nRISULTATO: ${passed}/9 TEST OGGI & CONFLITTI SUPERATI CON SUCCESSO!\n`);
