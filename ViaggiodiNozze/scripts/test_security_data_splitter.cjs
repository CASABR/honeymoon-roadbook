const assert = require('assert');

// Test runner per securityDataSplitter in ambiente CommonJS
const {
  SENSITIVE_KEYS,
  isSensitiveKey,
  splitEntitySecurityData,
  mergeEntitySecurityData,
  sanitizePublicDocument
} = require('../src/utils/securityDataSplitter.ts');

console.log('--- TEST UNITARIO: SEGREGAZIONE E MERGE DEI DATI SENSIBILI ---');

// 1. Alloggio completo di test
const fullAlloggio = {
  id: 'acc_tokyo_shinjuku',
  name: 'Hotel Gracery Shinjuku',
  address: '1-19-1 Kabukicho',
  checkIn: '2026-11-28',
  checkOut: '2026-12-02',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  notes: 'Vicino alla statua di Godzilla',
  pinCode: '7492#',
  bookingCode: 'H-GRACERY-9988',
  bookingUrl: 'https://hotels.example.com/booking/9988',
  cost: '640.00 €',
  deposit: '100.00 €',
  depositPaid: '100.00 €',
  paymentStatus: 'saldato',
  noteCopilota: 'Chiave alternativa con concierge dopo le 23:00',
  cancellazioneGratuitaEntro: '2026-11-20',
  attachments: [{ id: 'voucher_pdf', name: 'voucher.pdf', type: 'pdf', dataUrl: 'data:pdf' }],
  updatedAt: 1700000000000
};

const splitAcc = splitEntitySecurityData('alloggio', 'trip_001', fullAlloggio);

// Verifiche sul documento pubblico (destinato ai Viewer)
assert.equal(splitAcc.publicDoc.name, 'Hotel Gracery Shinjuku');
assert.equal(splitAcc.publicDoc.address, '1-19-1 Kabukicho');
assert.equal(splitAcc.publicDoc.checkIn, '2026-11-28');
assert.equal(splitAcc.publicDoc.notes, 'Vicino alla statua di Godzilla');
assert.equal(splitAcc.publicDoc.hasPrivateCredentials, true);

// Verifica assenza assoluta di dati sensibili nel documento pubblico
assert.strictEqual(splitAcc.publicDoc.pinCode, undefined, 'FAIL: pinCode presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.bookingCode, undefined, 'FAIL: bookingCode presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.bookingUrl, undefined, 'FAIL: bookingUrl presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.cost, undefined, 'FAIL: cost presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.depositPaid, undefined, 'FAIL: depositPaid presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.noteCopilota, undefined, 'FAIL: noteCopilota presente nel documento pubblico');
assert.strictEqual(splitAcc.publicDoc.attachments, undefined, 'FAIL: attachments presente nel documento pubblico');
console.log('✓ 1. Documento pubblico Alloggio: 100% privo di credenziali e dati sensibili.');

// Verifiche sulla cassaforte privata (private_credentials)
assert.equal(splitAcc.privateCredentialsDoc.id, 'acc_tokyo_shinjuku');
assert.equal(splitAcc.privateCredentialsDoc.tripId, 'trip_001');
assert.equal(splitAcc.privateCredentialsDoc.pinCode, '7492#');
assert.equal(splitAcc.privateCredentialsDoc.bookingCode, 'H-GRACERY-9988');
assert.equal(splitAcc.privateCredentialsDoc.cost, '640.00 €');
assert.equal(splitAcc.privateCredentialsDoc.noteCopilota, 'Chiave alternativa con concierge dopo le 23:00');
assert.equal(splitAcc.privateCredentialsDoc.attachments.length, 1);
console.log('✓ 2. Record PrivateCredentials: tutti i campi privati conservati fedelmente.');

// Verifica merge per Owner / Copilota
const reconstructed = mergeEntitySecurityData(splitAcc.publicDoc, splitAcc.privateCredentialsDoc);
assert.deepStrictEqual(reconstructed.pinCode, fullAlloggio.pinCode);
assert.deepStrictEqual(reconstructed.bookingCode, fullAlloggio.bookingCode);
assert.deepStrictEqual(reconstructed.cost, fullAlloggio.cost);
assert.deepStrictEqual(reconstructed.noteCopilota, fullAlloggio.noteCopilota);
assert.deepStrictEqual(reconstructed.attachments, fullAlloggio.attachments);
console.log('✓ 3. Merge trasparente: oggetto originale ricostruito al 100% per Owner/Copilota.');

// 2. Trasporto (Volo con PNR e carta imbarco)
const fullTrasporto = {
  id: 'tr_volo_ana_nh216',
  carrier: 'ANA Airlines',
  departureLocation: 'HND',
  arrivalLocation: 'ITM',
  date: '2026-11-29',
  departureTime: '10:00',
  bookingCode: 'PNR776',
  posti: '14A, 14B',
  terminalGate: 'Gate 58',
  cost: '220.00 €',
  noteCopilota: 'Passaporto necessario al gate',
  attachments: [{ id: 'boarding_pass', name: 'pass.pdf' }]
};

const splitTr = splitEntitySecurityData('trasporto', 'trip_001', fullTrasporto);
assert.strictEqual(splitTr.publicDoc.bookingCode, undefined);
assert.strictEqual(splitTr.publicDoc.posti, undefined);
assert.strictEqual(splitTr.publicDoc.terminalGate, undefined);
assert.strictEqual(splitTr.publicDoc.cost, undefined);
assert.strictEqual(splitTr.publicDoc.attachments, undefined);
assert.equal(splitTr.publicDoc.carrier, 'ANA Airlines');
assert.equal(splitTr.privateCredentialsDoc.bookingCode, 'PNR776');
assert.equal(splitTr.privateCredentialsDoc.posti, '14A, 14B');
console.log('✓ 4. Trasporto: PNR, posti e carte imbarco segregati con successo.');

// 3. Sanitizzazione documento condiviso (anti-injection da client vecchi)
const rogueDoc = {
  id: 'tappa_99',
  titolo: 'Tempio',
  pinCode: 'MALICIOUS_PIN',
  pnr: 'MALICIOUS_PNR',
  noteCopilota: 'SECRET'
};
const clean = sanitizePublicDocument(rogueDoc);
assert.strictEqual(clean.pinCode, undefined);
assert.strictEqual(clean.pnr, undefined);
assert.strictEqual(clean.noteCopilota, undefined);
assert.equal(clean.titolo, 'Tempio');
console.log('✓ 5. Sanitizzazione anti-injection: nessun campo sensibile può transitare nel doc pubblico.');

console.log('TUTTI I 5 TEST DI SEGREGAZIONE DATI SUPERATI CON SUCCESSO!');
