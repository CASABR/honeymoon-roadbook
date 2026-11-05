import assert from 'node:assert/strict';
import { prepareDuplicateItem } from '../src/utils/cardDuplication.ts';

console.log('--- TEST STEP 3: DUPLICAZIONE SICURA DELLE CARD ---');

// 1. ALLOGGIO: verifica azzeramento PIN, codici prenotazione, acconto versato e cancellazione
const origAlloggio = {
  id: 'acc_original_1',
  name: 'Grand Hotel Tokyo',
  sottocategoria: 'Hotel',
  location: 'Tokyo',
  address: '1-1 Shibuya',
  checkIn: '2026-11-28',
  checkInTime: '15:00',
  checkOut: '2026-12-02',
  checkOutTime: '11:00',
  arrivalTime: '16:00',
  timeStatus: 'confermato',
  cost: '600.00 €',
  depositPaid: '200.00 €',
  deposit: '100.00',
  pinCode: '9944#',
  bookingCode: 'BKG-9921',
  status: 'completato',
  completed: true,
  paymentStatus: 'saldato',
  cancellazioneGratuitaEntro: '2026-11-20',
  attachments: [{ id: 'voucher_1', name: 'voucher.pdf', type: 'pdf', dataUrl: 'data:pdf' }],
  notes: 'Camera vista parco',
  noteCopilota: 'Chiave al concierge'
};

const dupAcc = prepareDuplicateItem({
  id: origAlloggio.id,
  type: 'alloggio',
  title: origAlloggio.name,
  location: origAlloggio.location,
  time: '16:00',
  categoryOrType: 'alloggio',
  originalData: origAlloggio
});

// Verifiche Alloggio
assert.notEqual(dupAcc.data.id, origAlloggio.id, 'FAIL: ID alloggio duplicato deve essere univoco');
assert.equal(dupAcc.data.name, 'Copia di Grand Hotel Tokyo', 'FAIL: Nome deve avere prefisso Copia');
assert.equal(dupAcc.data.pinCode, undefined, 'FAIL: PIN keybox NON deve essere ereditato');
assert.equal(dupAcc.data.bookingCode, undefined, 'FAIL: bookingCode NON deve essere ereditato');
assert.equal(dupAcc.data.status, 'da_prenotare', 'FAIL: status deve essere resettato a da_prenotare');
assert.equal(dupAcc.data.completed, undefined, 'FAIL: completed deve essere azzerato');
assert.equal(dupAcc.data.paymentStatus, 'da_saldare', 'FAIL: paymentStatus deve essere da_saldare');
assert.equal(dupAcc.data.depositPaid, undefined, 'FAIL: depositPaid NON deve essere ereditato');
assert.equal(dupAcc.data.acconto, undefined, 'FAIL: acconto NON deve essere ereditato');
assert.equal(dupAcc.data.cancellazioneGratuitaEntro, undefined, 'FAIL: cancellazione gratuita non deve essere ereditata');
assert.equal(dupAcc.data.attachments, undefined, 'FAIL: allegati/voucher NON devono essere ereditati');
// Dati descrittivi utili preservati
assert.equal(dupAcc.data.cost, '600.00 €', 'PASS: tariffa camera conservata come riferimento utile');
assert.equal(dupAcc.data.deposit, '100.00', 'PASS: cauzione prevista conservata come riferimento utile');
assert.equal(dupAcc.data.notes, 'Camera vista parco');
assert.equal(dupAcc.data.noteCopilota, 'Chiave al concierge');
// Integrità originale
assert.equal(origAlloggio.pinCode, '9944#', 'FAIL: Originale NON deve subire mutazioni');
assert.equal(origAlloggio.attachments?.length, 1, 'FAIL: Allegati originale intatti');
console.log('✓ 1. Alloggio: duplicazione sicura verificata (zero PIN, zero false prenotazioni)');

// 2. TRASPORTO (VOLO): verifica azzeramento PNR, posti assegnati, terminal e carte d'imbarco
const origVolo = {
  id: 'tr_volo_1',
  type: 'volo',
  carrier: 'ANA Airlines',
  departureLocation: 'Roma FCO',
  arrivalLocation: 'Tokyo HND',
  date: '2026-11-28',
  departureTime: '10:00',
  bookingCode: 'PNR776',
  posti: '12A, 12B',
  terminalGate: 'T3 · Gate 14',
  cost: '1200.00 €',
  depositPaid: '1200.00 €',
  status: 'prenotato',
  layover: { airport: 'PEK', duration: '2h' },
  attachments: [{ id: 'boarding_1', name: 'boarding.pdf', type: 'pdf', dataUrl: 'data:pdf' }],
  notes: 'Volo intercontinentale'
};

const dupVolo = prepareDuplicateItem({
  id: origVolo.id,
  type: 'trasporto',
  title: 'Volo',
  location: origVolo.departureLocation,
  time: '10:00',
  categoryOrType: 'volo',
  originalData: origVolo
});

assert.notEqual(dupVolo.data.id, origVolo.id);
assert.equal(dupVolo.data.carrier, 'Copia di ANA Airlines');
assert.equal(dupVolo.data.bookingCode, undefined, 'FAIL: PNR / bookingCode deve essere azzerato');
assert.equal(dupVolo.data.posti, undefined, 'FAIL: Posti a sedere devono essere azzerati');
assert.equal(dupVolo.data.terminalGate, undefined, 'FAIL: Terminal/Gate deve essere azzerato');
assert.equal(dupVolo.data.status, 'pianificato', 'FAIL: Stato deve essere pianificato');
assert.equal(dupVolo.data.depositPaid, undefined, 'FAIL: Pagamento effettuato deve essere azzerato');
assert.equal(dupVolo.data.attachments, undefined, 'FAIL: Carte imbarco azzerate');
assert.deepEqual(dupVolo.data.layover, { airport: 'PEK', duration: '2h' }, 'PASS: Scalo della rotta preservato');
assert.equal(origVolo.bookingCode, 'PNR776', 'FAIL: Originale integro');
console.log('✓ 2. Trasporto: duplicazione sicura verificata (zero PNR, zero posti ereditati)');

// 3. ATTIVITA: verifica azzeramento stato prenotato, biglietti e relazioni
const origAtt = {
  id: 'act_1',
  title: 'Tour Templi Kyoto',
  category: 'visita',
  sottocategoria: 'Tour Guidato',
  date: '2026-11-29',
  time: '09:00',
  bookingCode: 'KYOTO-TOUR-123',
  cost: '80.00 €',
  status: 'prenotato',
  paymentStatus: 'saldato',
  attachments: [{ id: 'att_ticket', name: 'ticket.pdf', type: 'pdf', dataUrl: 'data:pdf' }],
  childTappe: [{ id: 'child_1', titolo: 'Sub-tappa' }]
};

const dupAtt = prepareDuplicateItem({
  id: origAtt.id,
  type: 'attivita',
  title: origAtt.title,
  location: 'Kyoto',
  time: '09:00',
  categoryOrType: 'visita',
  originalData: origAtt
});

assert.notEqual(dupAtt.data.id, origAtt.id);
assert.equal(dupAtt.data.title, 'Copia di Tour Templi Kyoto');
assert.equal(dupAtt.data.bookingCode, undefined, 'FAIL: bookingCode azzerato');
assert.equal(dupAtt.data.status, 'da_valutare', 'FAIL: status reimpostato a da_valutare');
assert.equal(dupAtt.data.paymentStatus, 'da_saldare', 'FAIL: paymentStatus reimpostato a da_saldare');
assert.equal(dupAtt.data.attachments, undefined, 'FAIL: biglietti azzerati');
assert.equal(dupAtt.data.childTappe, undefined, 'FAIL: relazioni figlie non riutilizzate');
console.log('✓ 3. Attività: duplicazione sicura verificata (zero biglietti, zero relazioni corrotte)');

// 4. TAPPA: verifica azzeramento qrCode, ticketUrl e passeggiataId
const origTappa = {
  id: 'tappa_1',
  titolo: 'Fushimi Inari',
  sottocategoria: 'Spot fotografico',
  lightWindow: 'alba',
  photoSubject: 'Torii rossi',
  bookingCode: 'TAPPA-BOOK-99',
  qrCode: 'QR_DATA_CONFIRMED',
  ticketUrl: 'https://tickets.example.com/1',
  passeggiataId: 'walk_container_55',
  attachments: [{ id: 'photo_1', name: 'torii.jpg', type: 'image', dataUrl: 'data:img' }]
};

const dupTappa = prepareDuplicateItem({
  id: origTappa.id,
  type: 'tappa',
  title: origTappa.titolo,
  location: 'Kyoto',
  time: '',
  categoryOrType: 'tappa',
  originalData: origTappa
});

assert.notEqual(dupTappa.data.id, origTappa.id);
assert.equal(dupTappa.data.titolo, 'Copia di Fushimi Inari');
assert.equal(dupTappa.data.lightWindow, 'alba', 'PASS: Metadati fotografici preservati');
assert.equal(dupTappa.data.photoSubject, 'Torii rossi');
assert.equal(dupTappa.data.bookingCode, undefined, 'FAIL: bookingCode azzerato');
assert.equal(dupTappa.data.qrCode, undefined, 'FAIL: qrCode azzerato');
assert.equal(dupTappa.data.ticketUrl, undefined, 'FAIL: ticketUrl azzerato');
assert.equal(dupTappa.data.passeggiataId, undefined, 'FAIL: passeggiataId contenitore azzerato per indipendenza');
assert.equal(dupTappa.data.attachments, undefined, 'FAIL: allegati non condivisi per reference');
assert.equal(origTappa.attachments?.length, 1, 'PASS: Originale preservato');
console.log('✓ 4. Tappa: duplicazione sicura verificata (zero QR, indipendenza relazionale)');

// 5. RISTORANTE: verifica azzeramento tavolo riservato e codice prenotazione
const origRist = {
  id: 'rist_1',
  nome: 'Sushi Dai',
  sottocategoria: 'Pranzo',
  bookingCode: 'TBL-554',
  tavolo: 'Tavolo 4 Bancone',
  budget: '90.00 €',
  status: 'saldato'
};

const dupRist = prepareDuplicateItem({
  id: origRist.id,
  type: 'ristorante',
  title: origRist.nome,
  location: 'Tokyo',
  time: '12:00',
  categoryOrType: 'ristorante',
  originalData: origRist
});

assert.notEqual(dupRist.data.id, origRist.id);
assert.equal(dupRist.data.nome, 'Copia di Sushi Dai');
assert.equal(dupRist.data.bookingCode, undefined, 'FAIL: Codice tavolo/prenotazione azzerato');
assert.equal(dupRist.data.tavolo, undefined, 'FAIL: Tavolo assegnato azzerato');
assert.equal(dupRist.data.status, 'da_saldare', 'FAIL: Stato saldato azzerato');
assert.equal(dupRist.data.budget, '90.00 €', 'PASS: Budget conservato');
console.log('✓ 5. Ristorante: duplicazione sicura verificata (zero tavolo riservato, stato da_saldare)');

// 6. SHOPPING: verifica separazione budget (mantenuto) vs costo spesa già sostenuta (azzerato)
const origShop = {
  id: 'shop_1',
  nome: 'Pokemon Center Mega Tokyo',
  budget: '100.00 €',
  cost: '85.00 €',
  costo: 85.00,
  depositPaid: '85.00 €',
  status: 'saldato'
};

const dupShop = prepareDuplicateItem({
  id: origShop.id,
  type: 'shopping',
  title: origShop.nome,
  location: 'Ikebukuro',
  time: '',
  categoryOrType: 'shopping',
  originalData: origShop
});

assert.notEqual(dupShop.data.id, origShop.id);
assert.equal(dupShop.data.nome, 'Copia di Pokemon Center Mega Tokyo');
assert.equal(dupShop.data.budget, '100.00 €', 'PASS: Budget previsto di spesa conservato');
assert.equal(dupShop.data.cost, undefined, 'FAIL: Spesa effettiva cost azzerata');
assert.equal(dupShop.data.costo, undefined, 'FAIL: Spesa effettiva costo azzerata');
assert.equal(dupShop.data.depositPaid, undefined, 'FAIL: Saldo versato azzerato');
assert.equal(dupShop.data.paymentStatus, 'da_saldare', 'FAIL: Stato impostato a da_saldare');
console.log('✓ 6. Shopping: duplicazione sicura verificata (budget stimato preservato, spesa effettiva azzerata)');

console.log('TUTTI I 6 TEST DI DUPLICAZIONE SICURA DELLE CARD SUPERATI CON SUCCESSO!');
