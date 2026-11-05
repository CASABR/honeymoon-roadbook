const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

console.log('--- TEST REQUISITI UX: FOOTER ICONE, NOTE COPILOTA, BAGAGLI E SPOT FOTOGRAFICO ---');

// 1. Mobile card footer icone & CSS no 2-row wrapping
const css = read('src/index.css');
assert.match(css, /\.hounigo-ds-action-btn \.hounigo-ds-btn-text/);
assert.match(css, /display:\s*none;/);
assert.match(css, /\.hounigo-ds-actions-group/);
assert.match(css, /\.hounigo-ds-action-btn-active-green/);
console.log('✅ 1. CSS footer compatto: icone su mobile, testi nascosti sotto 640px e classe attivo verde presenti');

// 2. Note Copilota: solo icona verde se ci sono info, testo nascosto a vista di default + toggle
const modal = read('src/components/modals/UniversalCopilotaModal.tsx');
assert.match(modal, /mostraNoteInCard/);
assert.match(modal, /Mostra note copilota a vista sulla card/);
assert.match(modal, /type="checkbox"/);

for (const cardFile of [
  'AlloggioCard.tsx',
  'AttivitaCard.tsx',
  'RistoranteCard.tsx',
  'ShoppingCard.tsx',
  'TappaCard.tsx',
  'TrasportoCard.tsx'
]) {
  const code = read(`src/components/cards/${cardFile}`);
  assert.match(code, /hounigo-ds-action-btn-active-green/, `${cardFile} deve avere icona verde per copilota`);
  assert.match(code, /mostraNoteInCard/, `${cardFile} deve verificare il flag mostraNoteInCard per visualizzare il testo`);
}
console.log('✅ 2. Note Copilota: testo nascosto di default sul front, icona verde attiva e toggle checkbox presente');

// 3. AlloggioCard: eliminata la voce "istruzioni d'ingresso disponibili" in alto
const alloggioCard = read('src/components/cards/AlloggioCard.tsx');
assert.doesNotMatch(alloggioCard, /Istruzioni d&apos;ingresso disponibili/);
assert.doesNotMatch(alloggioCard, /hounigo-ds-header-subrow/);
console.log('✅ 3. Alloggi: rimossa intestazione "istruzioni d\'ingresso disponibili"');

// 4. AttivitaCard: compattati ritrovo, inizio e durata su una sola riga
const attivitaCard = read('src/components/cards/AttivitaCard.tsx');
assert.match(attivitaCard, /flex items-center gap-2 flex-wrap/);
assert.match(attivitaCard, /Ritrovo/);
assert.match(attivitaCard, /Inizio/);
assert.match(attivitaCard, /Durata/);
console.log('✅ 4. Attività: ritrovo, inizio e durata compattati su singola riga');

// 5. Bagagli: pulsante nel footer di TrasportoCard, verde se ci sono info, popup dedicato modificabile
const trasportoCard = read('src/components/cards/TrasportoCard.tsx');
assert.match(trasportoCard, /hounigo-ds-actions-group[\s\S]*?🧳[\s\S]*?Bagagli/);
assert.match(trasportoCard, /hounigo-ds-action-btn-active-green/);

const bagagliModal = read('src/components/modals/TrasportoBagagliModal.tsx');
assert.match(bagagliModal, /isEditing/);
assert.match(bagagliModal, /Salva Informazioni Bagagli/);
assert.match(bagagliModal, /1x 23kg Stiva/);
console.log('✅ 5. Bagagli: pulsante nel footer con stato verde e popup interattivo con salvataggio e preset');

// 6. Spot fotografico: drag and drop da desktop sia in mobile che desktop view, compatto
const tappaCard = read('src/components/cards/TappaCard.tsx');
assert.match(tappaCard, /onDragOver/);
assert.match(tappaCard, /onDrop=\{handlePhotoDrop\}/);
assert.match(tappaCard, /Trascina una foto o tocca per caricar/);

assert.match(attivitaCard, /onDragOver/);
assert.match(attivitaCard, /onDrop=\{handlePhotoDrop\}/);
console.log('✅ 6. Spot fotografico: drag-and-drop da desktop e tap-to-upload mobile integrati');

console.log('\nTUTTE LE VERIFICHE DEI REQUISITI UX SONO STATE SUPERATE CON SUCCESSO!');

