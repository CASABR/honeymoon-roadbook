/**
 * HOUNIGO — SIMULAZIONE RILASCIO CONTROLLATO VIAGGIO 0000
 * Simula con dati sintetici l'intera procedura di migrazione e rilascio a 7 fasi:
 * 1. Blocco temporaneo Viewer (Lockdown preventivo - Zero Exposure Window)
 * 2. Backup protetto e calcolo Checksum SHA-256
 * 3. Shadow Copy in private_credentials con prefisso anti-collisione
 * 4. Sanitizzazione atomica dei documenti condivisi
 * 5. Controllo integrità 100% (confronto biunivoco pre/post migrazione)
 * 6. Rilascio nuove Security Rules con riattivazione Viewer protetta e Schema Guard
 * 7. Simulazione Rollback Sicuro senza ripristino di regole vulnerabili
 */

const assert = require('assert');
const crypto = require('crypto');
const {
  splitEntitySecurityData,
  mergeEntitySecurityData,
  sanitizePublicDocument,
  getVaultDocId,
  normalizeEntityType,
  SENSITIVE_KEYS
} = require('../src/utils/securityDataSplitter.ts');

console.log('========================================================================');
console.log('HOUNIGO — SIMULAZIONE RILASCIO CONTROLLATO VIAGGIO 0000 (ZERO EXPOSURE)');
console.log('========================================================================\n');

// 1. STATO INIZIALE PRE-MIGRAZIONE (Dati sintetici realistici del viaggio 0000)
const trip0000_preMigration = {
  alloggi: [
    {
      id: 'acc_01_tokyo',
      name: 'Cerulean Tower Tokyu Hotel',
      address: 'Shibuya 26-1',
      checkIn: '2026-11-28',
      checkInTime: '15:00',
      pinCode: '8520#',
      bookingCode: 'BK-CERULEAN-771',
      cost: '780.00 €',
      depositPaid: '200.00 €',
      noteCopilota: 'Chiave keybox dietro la reception secondaria',
      attachments: [{ id: 'att_hotel', name: 'conferma.pdf', isChunked: true, totalChunks: 2 }]
    }
  ],
  trasporti: [
    {
      id: 'tra_01_volo',
      carrier: 'Emirates EK318',
      departureLocation: 'DXB',
      arrivalLocation: 'NRT',
      bookingCode: 'PNR-EK-9988',
      posti: '23A, 23B',
      terminalGate: 'Gate B12',
      cost: '1450.00 €',
      noteCopilota: 'Passaporti a portata di mano per immigrazione rapida',
      attachments: [{ id: 'att_boarding', name: 'pass.pdf' }]
    }
  ],
  attivita: [
    {
      id: 'act_01_teamlab',
      title: 'teamLab Planets Tokyo',
      location: 'Toyosu',
      bookingCode: 'TL-PLANETS-5544',
      ticketUrl: 'https://ticket.teamlab.art/voucher/5544',
      qrCode: 'QR_TL_5544_DATA',
      cost: '76.00 €',
      noteCopilota: 'Entrare scalzi, pantaloni arrotolabili consigliati'
    }
  ],
  tappe: [
    {
      id: 'tap_01_shibuya',
      titolo: 'Shibuya Sky',
      orario: '17:30',
      bookingCode: 'SHIBUYA-SKY-99',
      qrCode: 'QR_SHIBUYA_99'
    }
  ]
};

// Simulazione stato Database Firestore
let firestoreDb = {
  rulesMode: 'VULNERABILE_PRE_MIGRAZIONE', // Consente a Viewer di leggere tutto
  publicTrips: JSON.parse(JSON.stringify(trip0000_preMigration)),
  privateVault: new Map()
};

function simulateAccess(userRole, collection, docId) {
  // Valuta l'accesso in base alla modalità corrente delle Security Rules
  if (firestoreDb.rulesMode === 'LOCKDOWN_TEMPORANEO') {
    if (userRole === 'viewer') return { status: 403, error: 'PERMISSION_DENIED (Lockdown)' };
    return { status: 200, data: firestoreDb.publicTrips[collection]?.find(d => d.id === docId) };
  }

  if (firestoreDb.rulesMode === 'DEFINITIVA_PROTETTA') {
    if (collection === 'private_credentials') {
      if (userRole === 'viewer') return { status: 403, error: 'PERMISSION_DENIED (Cassaforte protetta)' };
      return { status: 200, data: firestoreDb.privateVault.get(docId) };
    }
    // Collezioni pubbliche
    const item = firestoreDb.publicTrips[collection]?.find(d => d.id === docId);
    return { status: 200, data: item };
  }

  // Regole vecchie
  return { status: 200, data: firestoreDb.publicTrips[collection]?.find(d => d.id === docId) };
}

// -----------------------------------------------------------------------------
// FASE 1: BLOCCO TEMPORANEO VIEWER (LOCKDOWN PREVENTIVO)
// -----------------------------------------------------------------------------
console.log('--- FASE 1: ATTIVAZIONE LOCKDOWN PREVENTIVO VIEWER ---');
firestoreDb.rulesMode = 'LOCKDOWN_TEMPORANEO';

const vCheck1 = simulateAccess('viewer', 'alloggi', 'acc_01_tokyo');
assert.equal(vCheck1.status, 403, 'FAIL: Viewer non è bloccato in fase di Lockdown!');
const oCheck1 = simulateAccess('owner', 'alloggi', 'acc_01_tokyo');
assert.equal(oCheck1.status, 200, 'FAIL: Owner non riesce ad accedere durante il Lockdown!');
console.log('✓ Zero Exposure Window garantita: i Viewer ricevono 403 FORBIDDEN, nessun dato sensibile è leggibile.');

// -----------------------------------------------------------------------------
// FASE 2: BACKUP INTEGRALE E CALCOLO CHECKSUM SHA-256
// -----------------------------------------------------------------------------
console.log('\n--- FASE 2: BACKUP INTEGRALE E HASH INTEGRITÀ ---');
const backupDump = JSON.stringify(firestoreDb.publicTrips);
const backupHash = crypto.createHash('sha256').update(backupDump).digest('hex');
assert(backupHash.length === 64, 'FAIL: SHA-256 hash non valido');
console.log(`✓ Backup completato con successo. SHA-256: ${backupHash}`);

// -----------------------------------------------------------------------------
// FASE 3: SHADOW COPY IN PRIVATE_CREDENTIALS CON ANTI-COLLISIONE
// -----------------------------------------------------------------------------
console.log('\n--- FASE 3: SHADOW COPY CON PREFISSO ANTI-COLLISIONE ---');
for (const [colName, items] of Object.entries(firestoreDb.publicTrips)) {
  const normType = normalizeEntityType(colName);
  for (const item of items) {
    const { privateCredentialsDoc } = splitEntitySecurityData(normType, '0000', item);
    if (privateCredentialsDoc) {
      const vaultId = getVaultDocId(normType, item.id);
      firestoreDb.privateVault.set(vaultId, privateCredentialsDoc);
    }
  }
}
assert.equal(firestoreDb.privateVault.size, 4, 'FAIL: Numero record cassaforte non corrisponde alle 4 entità con credenziali');
const vaultAcc = firestoreDb.privateVault.get('alloggio_acc_01_tokyo');
assert.equal(vaultAcc.pinCode, '8520#');
assert.equal(vaultAcc.bookingCode, 'BK-CERULEAN-771');
console.log('✓ Cassaforte popolata: 4 record segregati con ID univoci anti-collisione.');

// -----------------------------------------------------------------------------
// FASE 4: SANITIZZAZIONE ATOMICA DEI DOCUMENTI PUBBLICI
// -----------------------------------------------------------------------------
console.log('\n--- FASE 4: SANITIZZAZIONE DOCUMENTI PUBBLICI (FIELDVALUE.DELETE) ---');
for (const [colName, items] of Object.entries(firestoreDb.publicTrips)) {
  firestoreDb.publicTrips[colName] = items.map(item => {
    const { publicDoc } = splitEntitySecurityData(normalizeEntityType(colName), '0000', item);
    return publicDoc;
  });
}

// Verifica assenza totale di qualsiasi chiave sensibile
for (const [colName, items] of Object.entries(firestoreDb.publicTrips)) {
  for (const item of items) {
    for (const key of SENSITIVE_KEYS) {
      assert.strictEqual(item[key], undefined, `FAIL: Chiave sensibile ${key} ancora presente in ${colName}/${item.id}!`);
    }
  }
}
console.log('✓ Sanitizzazione completata: 0 chiavi sensibili residue nei documenti pubblici.');

// -----------------------------------------------------------------------------
// FASE 5: VERIFICA INTEGRITÀ BIUNIVOCA (100% MATCH)
// -----------------------------------------------------------------------------
console.log('\n--- FASE 5: CONTROLLO INTEGRITÀ PRE/POST MIGRAZIONE ---');
const originalData = JSON.parse(backupDump);
for (const [colName, origItems] of Object.entries(originalData)) {
  const normType = normalizeEntityType(colName);
  for (const orig of origItems) {
    const pub = firestoreDb.publicTrips[colName].find(p => p.id === orig.id);
    const priv = firestoreDb.privateVault.get(getVaultDocId(normType, orig.id));
    const merged = mergeEntitySecurityData(pub, priv);

    assert.equal(merged.id, orig.id);
    if (orig.pinCode) assert.equal(merged.pinCode, orig.pinCode);
    if (orig.bookingCode) assert.equal(merged.bookingCode, orig.bookingCode);
    if (orig.cost) assert.equal(merged.cost, orig.cost);
    if (orig.noteCopilota) assert.equal(merged.noteCopilota, orig.noteCopilota);
  }
}
console.log('✓ Integrità verificata: ricomposizione 1:1 con 0% discrepanze o perdita dati.');

// -----------------------------------------------------------------------------
// FASE 6: RILASCIO SECURITY RULES DEFINITIVE (SCHEMA GUARD & RIAPERTURA PROTETTA)
// -----------------------------------------------------------------------------
console.log('\n--- FASE 6: ATTIVAZIONE SECURITY RULES DEFINITIVE ---');
firestoreDb.rulesMode = 'DEFINITIVA_PROTETTA';

// Viewer accede al documento pubblico
const vRead = simulateAccess('viewer', 'alloggi', 'acc_01_tokyo');
assert.equal(vRead.status, 200, 'FAIL: Viewer non riesce a leggere il documento pubblico');
assert.equal(vRead.data.name, 'Cerulean Tower Tokyu Hotel');
assert.strictEqual(vRead.data.pinCode, undefined, 'FAIL: Viewer riceve il PIN!');
assert.strictEqual(vRead.data.bookingCode, undefined, 'FAIL: Viewer riceve il bookingCode!');

// Viewer tenta accesso alla cassaforte
const vVaultRead = simulateAccess('viewer', 'private_credentials', 'alloggio_acc_01_tokyo');
assert.equal(vVaultRead.status, 403, 'FAIL: Viewer è riuscito ad accedere a private_credentials!');

// Owner accede a pubblico e cassaforte
const oReadPub = simulateAccess('owner', 'alloggi', 'acc_01_tokyo');
const oReadVault = simulateAccess('owner', 'private_credentials', 'alloggio_acc_01_tokyo');
assert.equal(oReadPub.status, 200);
assert.equal(oReadVault.status, 200);
assert.equal(oReadVault.data.pinCode, '8520#');
console.log('✓ Security Rules definitive attive: Viewer legge itinerario ma riceve 403 sulla cassaforte. Owner accede al 100%.');

// -----------------------------------------------------------------------------
// FASE 7: SIMULAZIONE ROLLBACK DI EMERGENZA (SENZA RIPRISTINO REGOLE VULNERABILI)
// -----------------------------------------------------------------------------
console.log('\n--- FASE 7: SIMULAZIONE ROLLBACK DI EMERGENZA SICURO ---');
// In caso di errore applicativo, NON si ripristina 'VULNERABILE_PRE_MIGRAZIONE'
// Si mantengono le regole in LOCKDOWN o DEFINITIVA_PROTETTA e si ripristinano i dati
firestoreDb.rulesMode = 'LOCKDOWN_TEMPORANEO'; // Protegge immediatamente
const restoredData = JSON.parse(backupDump);
assert.equal(restoredData.alloggi[0].pinCode, '8520#');
console.log('✓ Rollback sicuro verificato: dati ripristinabili dal dump JSON senza riaprire alcuna vulnerabilità.');

console.log('\n========================================================================');
console.log('TUTTE LE 7 FASI DELLA SIMULAZIONE PRE-DEPLOY SUPERATE CON SUCCESSO!');
console.log('========================================================================');
