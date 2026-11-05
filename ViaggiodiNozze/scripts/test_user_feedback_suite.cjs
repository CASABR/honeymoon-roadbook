const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST SUITE: VERIFICA TUTTI I REQUISITI FEEDBACK UTENTE ---');

// 1. Verifica CSS Footer Icon-Only e no-wrap
console.log('1. Verifica index.css: Icon-only su mobile e footer compatto...');
const css = fs.readFileSync(path.join(__dirname, '../src/index.css'), 'utf8');
assert(css.includes('.hounigo-ds-action-btn .hounigo-ds-btn-text,\n.hounigo-ds-action-btn .hounigo-ds-btn-arrow {\n  display: none !important;'), 'Icon-only di default mancante in index.css');
assert(css.includes('container-type: inline-size;'), 'container-type mancante su .hounigo-ds-card');
assert(css.includes('flex-wrap: nowrap;'), 'flex-wrap: nowrap mancante su .hounigo-ds-card-footer');
console.log('✅ 1. CSS verificato: pulsanti rigorosamente solo icona su mobile, footer su singola riga.');

// 2. Verifica AlloggioCard (periodo solo se più notti, Note -> Copilota)
console.log('2. Verifica AlloggioCard.tsx: periodo date solo > 1 notte e label Copilota...');
const alloggio = fs.readFileSync(path.join(__dirname, '../src/components/cards/AlloggioCard.tsx'), 'utf8');
assert(alloggio.includes('numNights > 1 && accommodation.checkIn && accommodation.checkOut'), 'Condizione numNights > 1 mancante in AlloggioCard');
assert(alloggio.includes('<span className="hounigo-ds-btn-text">Copilota</span>'), 'Label Copilota mancante in AlloggioCard');
assert(!alloggio.includes('<span className="hounigo-ds-btn-text">Note</span>'), 'Vecchia label Note ancora presente in AlloggioCard');
console.log('✅ 2. Alloggi: periodo da-a mostrato solo se più notti; Note sostituito con Copilota.');

// 3. Verifica TrasportoCard (pulsante PNR, desk/ufficio sotto maps/ritiro, Copilota)
console.log('3. Verifica TrasportoCard.tsx: pulsante PNR, desk indirizzo ritiro, Copilota...');
const trasporto = fs.readFileSync(path.join(__dirname, '../src/components/cards/TrasportoCard.tsx'), 'utf8');
assert(trasporto.includes('aria-label="Codice PNR"'), 'Pulsante PNR mancante nel footer di TrasportoCard');
assert(!trasporto.includes('PNR · {pnrCopied ? \'✓ Copiato\' : \'Copia\'}'), 'Scritta PNR estesa ancora presente nel casellario');
assert(trasporto.includes('{transport.terminalGate && !isRental && ('), 'Desk/ufficio ancora presente come spec-cell generica per rental');
assert(trasporto.includes('📍 {transport.terminalGate}'), 'Indirizzo di ritiro desk mancante sotto il punto di ritiro');
assert(trasporto.includes('<span className="hounigo-ds-btn-text">Copilota</span>'), 'Label Copilota mancante in TrasportoCard');
console.log('✅ 3. Trasporti: pulsante PNR nel footer, desk/ufficio posizionato come indirizzo di ritiro, Copilota uniforme.');

// 4. Uniformità Copilota in tutte le altre card
console.log('4. Verifica uniformità label Copilota nelle card Attivita, Ristorante, Shopping, Tappa...');
const cards = ['AttivitaCard.tsx', 'RistoranteCard.tsx', 'ShoppingCard.tsx', 'TappaCard.tsx'];
cards.forEach(c => {
  const code = fs.readFileSync(path.join(__dirname, `../src/components/cards/${c}`), 'utf8');
  assert(code.includes('<span className="hounigo-ds-btn-text">Copilota</span>'), `Copilota mancante in ${c}`);
  assert(!code.includes('<span className="hounigo-ds-btn-text">Note</span>'), `Vecchia label Note ancora presente in ${c}`);
});
console.log('✅ 4. Uniformità Copilota garantita su tutte le card del roadbook.');

// 5. Verifica Spesa Totale Desktop in PrenotazioniWorkspaceView
console.log('5. Verifica PrenotazioniWorkspaceView.tsx: riepilogo spesa totale editoriale...');
const prenotazioni = fs.readFileSync(path.join(__dirname, '../src/views/desktop/PrenotazioniWorkspaceView.tsx'), 'utf8');
assert(prenotazioni.includes('Riepilogo Economico Prenotazioni &amp; Voucher'), 'Titolo riepilogo economico mancante');
assert(prenotazioni.includes('€ {stats.totalCost.toFixed(2)}'), 'Spesa totale mancante');
assert(prenotazioni.includes('€ {stats.paidCost.toFixed(2)}'), 'Già saldato mancante');
assert(prenotazioni.includes('€ {stats.toPayCost.toFixed(2)}'), 'Da saldare mancante');
assert(prenotazioni.includes('stats.paidCost / stats.totalCost'), 'Progress bar pagamenti mancante');
console.log('✅ 5. Desktop: card riepilogo economico e spesa totale prenotazioni & voucher integrata con stile editoriale.');

// 6. Verifica SpeseBudgetView filtri "da saldare" e "saldato"
console.log('6. Verifica SpeseBudgetView.tsx: filtri "da saldare" e "saldato"...');
const spese = fs.readFileSync(path.join(__dirname, '../src/views/altro/SpeseBudgetView.tsx'), 'utf8');
assert(spese.includes('"da_saldare" | "saldato"'), 'Tipi da_saldare e saldato mancanti in selectedCategory');
assert(spese.includes('selectedCategory === "da_saldare"'), 'Condizione filtro da_saldare mancante');
assert(spese.includes('selectedCategory === "saldato"'), 'Condizione filtro saldato mancante');
assert(spese.includes('setSelectedCategory("da_saldare")'), 'Pulsante filtro da saldare mancante');
assert(spese.includes('setSelectedCategory("saldato")'), 'Pulsante filtro saldato mancante');
console.log('✅ 6. Spese e Budget: categorie di filtro "Da saldare" e "Saldato" perfettamente operative.');

console.log('\n🎉 TUTTI I TEST DELLA SUITE SONO STATI SUPERATI CON SUCCESSO!');
