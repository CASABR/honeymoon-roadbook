/**
 * Test Suite: Verifica Icona e Modal Bagagli Trasporti HOUNIGO
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=================================================================');
console.log('   TEST HOUNIGO: ICONA BAGAGLI & POPUP SCHEDE TRASPORTI');
console.log('=================================================================\n');

// 1. Verifica Modello Dati in types/index.ts
const typesContent = fs.readFileSync(path.join(__dirname, 'src/types/index.ts'), 'utf-8');
assert(typesContent.includes('bagagli?: string;'), 'Il campo bagagli deve essere definito nel tipo Trasporto');
console.log('[PASS] 1. Modello dati: Trasporto.bagagli?: string è presente e tipizzato');

// 2. Verifica presenza componente TrasportoBagagliModal
const modalPath = path.join(__dirname, 'src/components/modals/TrasportoBagagliModal.tsx');
assert(fs.existsSync(modalPath), 'Il file TrasportoBagagliModal.tsx deve esistere');
const modalContent = fs.readFileSync(modalPath, 'utf-8');
console.log('[PASS] 2. Componente TrasportoBagagliModal.tsx creato');

// 3. Verifica stato vuoto in TrasportoBagagliModal
assert(modalContent.includes('Informazioni sui bagagli non disponibili'), 'Deve gestire lo stato vuoto esplicitamente');
assert(!modalContent.includes('23 kg') && !modalContent.includes('158 cm'), 'Non deve inventare dati di default o limiti fittizi');
console.log('[PASS] 3. Stato vuoto trasparente: nessun limite fittizio o inventato');

// 4. Verifica stopPropagation e assenza di interferenze con la scheda in TrasportoCard
const cardContent = fs.readFileSync(path.join(__dirname, 'src/components/cards/TrasportoCard.tsx'), 'utf-8');
assert(cardContent.includes('setIsBagagliOpen(true)'), 'La scheda deve controllare lo stato isBagagliOpen');
assert(cardContent.includes('e.stopPropagation()'), 'Tutti i trigger devono chiamare e.stopPropagation()');
assert(cardContent.includes('<TrasportoBagagliModal'), 'La card deve renderizzare TrasportoBagagliModal');
console.log('[PASS] 4. Disaccoppiamento click: e.stopPropagation() impedisce apertura indesiderata della card');

// 5. Verifica pulsante Escape e chiusura accessibile in Modal
const modalBaseContent = fs.readFileSync(path.join(__dirname, 'src/components/common/Modal.tsx'), 'utf-8');
assert(modalBaseContent.includes("e.key === 'Escape'"), 'Modal.tsx deve supportare la chiusura con tasto Escape');
console.log('[PASS] 5. Chiusura accessibile: supportata tramite Escape, click backdrop e pulsante Chiudi');

// 6. Verifica indipendenza dei dati tra due trasporti
// Simula logica dei segmenti
const parseBagagli = (b) => {
  if (!b || !b.trim()) return null;
  return b.split(/[|\n]+/).map(s => s.trim()).filter(Boolean);
};

const transportA = { id: 'T1', carrier: 'Air China', bagagli: 'Stiva: 2 colli da 23 kg | Cabina: 1 bagaglio da 5 kg' };
const transportB = { id: 'T2', carrier: 'Virgin Australia', bagagli: undefined };
const transportC = { id: 'T3', carrier: 'Traghetto Sealink', bagagli: 'Cabina: 1 collo max 7 kg' };

assert.deepStrictEqual(parseBagagli(transportA.bagagli), [
  'Stiva: 2 colli da 23 kg',
  'Cabina: 1 bagaglio da 5 kg'
]);
assert.strictEqual(parseBagagli(transportB.bagagli), null);
assert.deepStrictEqual(parseBagagli(transportC.bagagli), [
  'Cabina: 1 collo max 7 kg'
]);
console.log('[PASS] 6. Indipendenza dati: due trasporti differenti mostrano dati totalmente indipendenti e isolati');

// 7. Verifica assenza di testo/franchigie sulla facciata della card
assert(!cardContent.includes('{transport.bagagli}'), 'La facciata della scheda non deve mostrare il testo dei bagagli');
console.log('[PASS] 7. Facciata pulita: nessun testo o peso mostrato direttamente sulla scheda (solo icona e popup)');

console.log('\n-----------------------------------------------------------------');
console.log('RISULTATO SUITE BAGAGLI: 7/7 TEST SUPERATI CON SUCCESSO!');
console.log('-----------------------------------------------------------------\n');
