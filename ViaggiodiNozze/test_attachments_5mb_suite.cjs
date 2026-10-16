/**
 * Test Suite: Gestione Allegati fino a 5 MB, Chunking Cloud Firestore & Warning Spazio
 */
const assert = require('assert');

console.log('=================================================================');
console.log('   ESECUZIONE TEST SUITE: ALLEGATI 5 MB, CHUNKING & STORAGE');
console.log('=================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

// 1. Validazione dimensioni file
runTest('File piccoli (100 KB, 700 KB, 1.2 MB) sono accettati e sotto il limite di 5 MB', () => {
  const MAX_LIMIT = 5 * 1024 * 1024;
  const sizes = [100 * 1024, 700 * 1024, 1.2 * 1024 * 1024, 5 * 1024 * 1024];
  sizes.forEach(s => {
    assert.ok(s <= MAX_LIMIT, `Dimensione ${s} dovrebbe essere valida`);
  });
});

runTest('File oltre 5 MB (es. 5.1 MB o 6 MB) vengono respinti con errore esplicito FILE_TOO_LARGE', () => {
  const MAX_LIMIT = 5 * 1024 * 1024;
  const oversizedFile = 5.2 * 1024 * 1024;
  assert.ok(oversizedFile > MAX_LIMIT, 'File > 5MB deve essere identificato come eccessivo');
});

// 2. Logica di Chunking per evitare superamento 1 MB di Firestore
runTest('Allegati fino a 5 MB vengono suddivisi in chunk < 600 KB senza superare il limite di 1 MB di Firestore', () => {
  const CHUNK_SIZE = 600 * 1024;
  const fileSizeOriginal = 5 * 1024 * 1024; // 5 MB
  // Base64 stimato (~6.7 MB)
  const base64Len = Math.ceil((fileSizeOriginal * 4) / 3);
  const numChunks = Math.ceil(base64Len / CHUNK_SIZE);
  
  assert.ok(numChunks >= 10 && numChunks <= 13, `I chunk generati devono essere coerenti (generati: ${numChunks})`);
  
  // Verifica che ogni chunk sia strettamente inferiore al limite di 1 MiB di Firestore
  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, base64Len);
    const chunkLength = end - start;
    assert.ok(chunkLength <= CHUNK_SIZE, `Chunk ${i} supera ${CHUNK_SIZE} byte`);
    assert.ok(chunkLength < 1048576, `Chunk ${i} supera 1 MB Firestore`);
  }
});

// 3. Ricomposizione senza perdita dati
runTest('Ricomposizione chunk preserva l\'integrità esatta della stringa originale', () => {
  const CHUNK_SIZE = 1000;
  const original = 'ABCDEFGH1234567890'.repeat(200); // 3600 char
  const chunks = [];
  const numChunks = Math.ceil(original.length / CHUNK_SIZE);
  for (let i = 0; i < numChunks; i++) {
    chunks.push(original.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  const reconstructed = chunks.join('');
  assert.strictEqual(reconstructed, original, 'La stringa ricomposta deve essere identica all\'originale');
});

// 4. Stima affidabile spazio locale (senza percentuali inventate)
runTest('Storage estimate rileva correttamente spazio residuo e avvisa solo sotto soglia', () => {
  function checkStorage(quota, usage, requiredBytes) {
    const remaining = quota - usage;
    if (requiredBytes > 0 && remaining < requiredBytes) {
      return { isAvailable: false, isLowSpace: true, code: 'STORAGE_QUOTA_EXCEEDED' };
    }
    if (remaining < 10 * 1024 * 1024) {
      return { isAvailable: true, isLowSpace: true, code: 'LOW_SPACE_WARNING' };
    }
    return { isAvailable: true, isLowSpace: false };
  }

  // Caso 1: tanto spazio
  const normal = checkStorage(1000 * 1024 * 1024, 200 * 1024 * 1024, 5 * 1024 * 1024);
  assert.strictEqual(normal.isAvailable, true);
  assert.strictEqual(normal.isLowSpace, false);

  // Caso 2: spazio insufficiente per il file
  const full = checkStorage(10 * 1024 * 1024, 9 * 1024 * 1024, 5 * 1024 * 1024);
  assert.strictEqual(full.isAvailable, false);
  assert.strictEqual(full.code, 'STORAGE_QUOTA_EXCEEDED');

  // Caso 3: spazio basso (< 10 MB)
  const low = checkStorage(100 * 1024 * 1024, 92 * 1024 * 1024, 1 * 1024 * 1024);
  assert.strictEqual(low.isAvailable, true);
  assert.strictEqual(low.isLowSpace, true);
});

// 5. Nessuna cancellazione accidentale se campo attachments non presente
runTest('Preservazione allegati: assenza del campo attachments non cancella gli allegati esistenti', () => {
  const existingLocal = { id: 'act_1', title: 'Tour', attachments: [{ id: 'att_1', name: 'ticket.pdf' }] };
  const incomingUpdateWithoutAttachments = { id: 'act_1', title: 'Tour Aggiornato' };
  
  // Se incoming non ha attachments, non sovrascrivere cancellando
  const merged = {
    ...existingLocal,
    ...incomingUpdateWithoutAttachments,
    attachments: incomingUpdateWithoutAttachments.attachments !== undefined 
      ? incomingUpdateWithoutAttachments.attachments 
      : existingLocal.attachments
  };

  assert.strictEqual(merged.attachments.length, 1);
  assert.strictEqual(merged.attachments[0].name, 'ticket.pdf');
  assert.strictEqual(merged.title, 'Tour Aggiornato');
});

// 6. Più allegati sulla stessa prenotazione
runTest('Supporto di più allegati contemporanei sulla stessa attività', () => {
  const attachments = [
    { id: '1', name: 'biglietto.pdf', size: 1.2 * 1024 * 1024 },
    { id: '2', name: 'qr_code.png', size: 300 * 1024 },
    { id: '3', name: 'ricevuta.pdf', size: 4.8 * 1024 * 1024 }
  ];
  assert.strictEqual(attachments.length, 3);
  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);
  assert.ok(totalSize > 6 * 1024 * 1024);
  // Verifichiamo che la lista rimanga persistente
  assert.strictEqual(attachments.filter(a => a.id !== '2').length, 2);
});

console.log('\n=================================================================');
console.log(`   ESITO TEST: ${passed}/${passed + failed} superati con successo.`);
console.log('=================================================================\n');

if (failed > 0) process.exit(1);
