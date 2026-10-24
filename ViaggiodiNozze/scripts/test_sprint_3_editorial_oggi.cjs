/**
 * Test di Verifica Sprint 3/4 — Travel Editorial, Schermata Oggi
 * Esegue verifiche strutturali, gerarchia a 3 livelli, coerenza Light/Dark e gestione stati
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST SUITE SPRINT 3: TRAVEL EDITORIAL, SCHERMATA OGGI ---');

const oggiViewPath = path.join(__dirname, '..', 'src', 'views', 'OggiView.tsx');
assert.ok(fs.existsSync(oggiViewPath), 'OggiView.tsx deve esistere');
const content = fs.readFileSync(oggiViewPath, 'utf8');

let passedTests = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. LIVELLO 1: FOCUS IMMEDIATO & MASTHEAD EDITORIALE
test('Livello 1: Masthead editoriale cartografico con kicker e status', () => {
  assert.ok(content.includes('LIVELLO 1: MASTHEAD EDITORIALE CARTOGRAFICO & FOCUS IMMEDIATO'), 'Intestazione Livello 1 presente');
  assert.ok(content.includes('currentDayMeta.dayNum > 0'), 'Presenza numerazione progressiva giorno');
  assert.ok(content.includes('formatDateHuman(selectedDate)'), 'Presenza data umana nel masthead');
});

test('Livello 1: Calcolo prossimo evento focale e orario', () => {
  assert.ok(content.includes('nextEventItem = useMemo('), 'Calcolo nextEventItem presente');
  assert.ok(content.includes('nextEventBookingCode = useMemo('), 'Calcolo codice prenotazione critico presente');
  assert.ok(content.includes('nextEventItem.time'), 'Visualizzazione orario evento focale');
});

test('Livello 1: Azioni immediate per il viaggiatore (Copia codice PNR & Navigazione Mappa)', () => {
  assert.ok(content.includes('bookingCodeCopied'), 'Stato feedback copia codice PNR presente');
  assert.ok(content.includes('navigator.clipboard.writeText(nextEventBookingCode)'), 'Copia rapida codice negli appunti presente');
  assert.ok(content.includes('Naviga su Mappa ↗'), 'Pulsante navigazione coordinate su Google Maps');
});

// 2. LIVELLO 2: TIMELINE CRONOLOGICA DELLA GIORNATA
test('Livello 2: Day scrubber del calendario tappe con contrasto Light e Dark', () => {
  assert.ok(content.includes('Calendario Tappe'), 'Sezione calendario tappe presente');
  assert.ok(content.includes('bg-[#172033] text-white dark:bg-white dark:text-[#172033]'), 'Pulsante giorno selezionato con contrasto pieno in entrambi i temi');
  assert.ok(content.includes('dark:bg-slate-900 text-slate-700 dark:text-slate-300'), 'Pulsante giorno non selezionato con supporto dark mode');
});

test('Livello 2: Collegamento itinerario Google Maps di giornata', () => {
  assert.ok(content.includes('Itinerario su Maps'), 'Card itinerario Google Maps presente');
  assert.ok(content.includes('dayMapLink'), 'Gestione link mappa di giornata');
  assert.ok(content.includes('dark:border-slate-800 bg-white dark:bg-slate-900'), 'Card mappa con styling dark mode');
});

test('Livello 2: Timeline delle attività e card alloggio per stanotte', () => {
  assert.ok(content.includes('Itinerario & Tappe di Giornata') || content.includes('Itinerario &amp; Tappe di Giornata'), 'Sezione eventi di giornata presente');
  assert.ok(content.includes('Alloggio per Stanotte'), 'Alloggio notturno posizionato a conclusione di giornata');
  assert.ok(content.includes('tonightsAccommodation'), 'Gestione alloggio della notte');
});

// 3. LIVELLO 3: INFORMAZIONI PROGRESSIVE & ON-DEMAND
test('Livello 3: Quick Action Nuova Spesa con supporto multivaluta e dark mode', () => {
  assert.ok(content.includes('Nuova Spesa'), 'Azione rapida Nuova Spesa presente');
  assert.ok(content.includes('setIsQuickExpenseOpen(true)'), 'Apertura modale spesa rapida presente');
  assert.ok(content.includes('QUICK_RATES'), 'Tassi di cambio stimati presenti');
  assert.ok(content.includes('dark:bg-slate-800'), 'Modale spesa con token dark mode');
});

test('Livello 3: Emergenze e SOS rapido', () => {
  assert.ok(content.includes('Emergenze'), 'Pulsante emergenze presente');
  assert.ok(content.includes('assicurazione'), 'Collegamento tab emergenze/assicurazione');
});

test('Livello 3: Carosello anteprima "Cosa farai domani" con navigazione', () => {
  assert.ok(content.includes('Cosa farai domani'), 'Sezione anteprima domani presente');
  assert.ok(content.includes('tomorrowTimeline'), 'Timeline di domani collegata');
  assert.ok(content.includes('Vedi giornata ➔'), 'Pulsante shortcut per passare al giorno successivo');
  assert.ok(content.includes('dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800'), 'Sezione domani con styling dark mode');
});

// 4. STATI DA CURARE
test('Stati da curare: Viaggio futuro e in corso', () => {
  assert.ok(content.includes('OGGI IN CORSO'), 'Stato viaggio in corso presente');
  assert.ok(content.includes('calculateCountdown()'), 'Stato viaggio futuro con countdown presente');
});

test('Stati da curare: Giornata libera senza attività', () => {
  assert.ok(content.includes('Giornata libera senza trasferimenti programmati') || content.includes('Nessuna attività programmata per oggi'), 'Stato giornata libera gestito');
});

test('Stati da curare: Rilevamento offline e roadbook locale', () => {
  assert.ok(content.includes('isOnline'), 'Stato isOnline tracciato');
  assert.ok(content.includes('OFFLINE • ROADBOOK LOCALE'), 'Badge di stato offline presente');
});

test('Stati da curare: Permessi ruolo (Viewer / Copilota vs canEdit)', () => {
  assert.ok(content.includes('canEdit'), 'Protezione canEdit presente');
  assert.ok(content.includes('{canEdit && ('), 'Elementi di modifica protetti per i ruoli di sola lettura');
});

console.log(`\nRisultato: ${passedTests} test superati con successo.`);
if (process.exitCode) {
  console.error('ALCUNI TEST SONO FALLITI!');
  process.exit(1);
} else {
  console.log('TUTTI I TEST DELLO SPRINT 3 SONO SUPERATI!');
}
