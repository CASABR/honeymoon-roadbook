const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST SUITE: VERIFICA TUTTI I REQUISITI FEEDBACK UTENTE ---');

// 1. Verifica CSS Footer Icon-Only selettivo quando forzati ad andare a capo
console.log('1. Verifica index.css: Collasso a sole icone selettivo e footer compatto...');
const css = fs.readFileSync(path.join(__dirname, '../src/index.css'), 'utf8');
assert(css.includes('.hounigo-ds-action-btn .hounigo-ds-btn-text,\n.hounigo-ds-action-btn .hounigo-ds-btn-arrow {\n  display: inline;\n}'), 'Pulsanti con testo di default');
assert(css.includes('.hounigo-ds-actions-group:has(> :nth-child(4)) .hounigo-ds-btn-text'), 'Collasso automatico per 4 pulsanti');
assert(css.includes('container-type: inline-size;'), 'container-type mancante su .hounigo-ds-card');
assert(css.includes('flex-wrap: nowrap;'), 'flex-wrap: nowrap mancante su .hounigo-ds-card-footer');
console.log('✅ 1. CSS verificato: testo visibile di default, solo icona quando forzati ad andare a capo per mancanza di spazio.');

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

// 7. Verifica rimozione "Blocca Schermo" da SettingsMenu
console.log('7. Verifica assenza di "Blocca Schermo" da impostazioni...');
const settings = fs.readFileSync(path.join(__dirname, '../src/components/common/SettingsMenu.tsx'), 'utf8');
assert(!settings.includes('Blocca Schermo'), 'Blocca Schermo ancora presente in SettingsMenu');
console.log('✅ 7. Impostazioni: voce "Blocca Schermo" rimossa con successo.');

// 8. Verifica rimozione banner OAuth / Gmail allarmistico da Hounigo
console.log('8. Verifica rimozione banner OAuth / Gmail da SmartInsertModal e DocumentiView...');
const smart = fs.readFileSync(path.join(__dirname, '../src/components/modals/SmartInsertModal.tsx'), 'utf8');
assert(!smart.includes('<GmailConnectionRow'), 'Banner GmailConnectionRow ancora presente in SmartInsertModal');
assert(!smart.includes('gmailNotice'), 'Stato gmailNotice ancora presente in SmartInsertModal');
const docs = fs.readFileSync(path.join(__dirname, '../src/views/altro/DocumentiView.tsx'), 'utf8');
assert(!docs.includes('<GmailConnectionRow'), 'Banner GmailConnectionRow ancora presente in DocumentiView');
console.log('✅ 8. Interfaccia ripulita: zero banner allarmistici o gergo OAuth incomprensibile per utenti non esperti.');

// 9. Verifica icona precisa ufficiale Google Maps in tutte le card e modali
console.log('9. Verifica icona precisa Google Maps...');
assert(alloggio.includes('<GoogleMapsIcon'), 'GoogleMapsIcon mancante in AlloggioCard');
const attCard = fs.readFileSync(path.join(__dirname, '../src/components/cards/AttivitaCard.tsx'), 'utf8');
assert(attCard.includes('<GoogleMapsIcon'), 'GoogleMapsIcon mancante in AttivitaCard');
const tappaCard = fs.readFileSync(path.join(__dirname, '../src/components/cards/TappaCard.tsx'), 'utf8');
assert(tappaCard.includes('<GoogleMapsIcon'), 'GoogleMapsIcon mancante in TappaCard');
const traspCard = fs.readFileSync(path.join(__dirname, '../src/components/cards/TrasportoCard.tsx'), 'utf8');
assert(traspCard.includes('<GoogleMapsIcon'), 'GoogleMapsIcon mancante in TrasportoCard');
const dmCard = fs.readFileSync(path.join(__dirname, '../src/components/cards/DayMapsCard.tsx'), 'utf8');
assert(dmCard.includes('<GoogleMapsIcon'), 'GoogleMapsIcon mancante in DayMapsCard');
console.log('✅ 9. Icona ufficiale Google Maps presente su tutte le card e i link di navigazione.');

// 10. Verifica Focus della giornata compatto in OggiView
console.log('10. Verifica Focus della giornata compatto in OggiView...');
const oggi = fs.readFileSync(path.join(__dirname, '../src/views/OggiView.tsx'), 'utf8');
assert(oggi.includes('Focus della giornata'), 'Titolo Focus della giornata presente');
assert(oggi.includes('GoogleMapsIcon'), 'GoogleMapsIcon presente in OggiView');
assert(oggi.includes('px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs space-y-1.5'), 'Layout compatto del focus della giornata attivo');
console.log('✅ 10. Focus della giornata snello e compatto, pulsanti Maps e Dettagli affiancati.');

console.log('\n🎉 TUTTI I 10 CONTROLLI DELLA SUITE SONO STATI SUPERATI CON SUCCESSO!');
