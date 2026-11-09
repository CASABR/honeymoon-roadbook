const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================');
console.log('AVVIO TEST RAPIDI: RATE-LIMIT, COUNTDOWN, ADMIN & PICKER');
console.log('======================================================\n');

// ──────────────────────────────────────────────────────────
// 1. TEST RATE-LIMIT A 0, 29 e 31 SECONDI CON CLOCK SIMULATO
// ──────────────────────────────────────────────────────────
console.log('[TEST 1] Verifica rate-limit push a 0, 29 e 31 secondi (clock simulato)...');

function simulateWorkerPushTestRateLimit(dispatchesMap, subscriberId, currentTime) {
  const rateKey = `test:${subscriberId}`;
  const previous = dispatchesMap.get(rateKey);
  const elapsed = previous ? currentTime - previous.created_at : Infinity;

  if (elapsed < 30_000) {
    const waitSeconds = Math.max(1, Math.ceil((30_000 - elapsed) / 1000));
    const err = new Error('PUSH_RATE_LIMITED');
    err.retryAfter = waitSeconds;
    throw err;
  }

  // Simula invio riuscito
  dispatchesMap.set(rateKey, { created_at: currentTime });
  return { accepted: true, deliveryConfirmed: false, status: 'accepted' };
}

const mockDispatches = new Map();
const subId = 'sub_tester_123';
const t0 = 100000;

// Chiamata 1 a t = 0
const res0 = simulateWorkerPushTestRateLimit(mockDispatches, subId, t0);
assert.strictEqual(res0.accepted, true, 'Prima chiamata a t0 deve essere accettata');
assert.strictEqual(mockDispatches.get(`test:${subId}`).created_at, t0, 'Timestamp registrato a t0');

// Chiamata 2 a t = 29s (29.000 ms dopo)
let caught29 = null;
try {
  simulateWorkerPushTestRateLimit(mockDispatches, subId, t0 + 29_000);
} catch (err) {
  caught29 = err;
}
assert.ok(caught29, 'Chiamata a 29s deve sollevare errore di rate-limit');
assert.strictEqual(caught29.message, 'PUSH_RATE_LIMITED', 'Messaggio di errore rate-limit corretto');
assert.strictEqual(caught29.retryAfter, 1, 'A 29s mancano esattamente 1s prima del reset');

// Chiamata 3 a t = 31s (31.000 ms dopo t0)
const res31 = simulateWorkerPushTestRateLimit(mockDispatches, subId, t0 + 31_000);
assert.strictEqual(res31.accepted, true, 'Chiamata a 31s deve essere accettata dopo scadenza 30s');
assert.strictEqual(mockDispatches.get(`test:${subId}`).created_at, t0 + 31_000, 'Timestamp aggiornato a t0 + 31s');

console.log('✓ TEST 1 Superato: Rate-limit blocca a 29s con retryAfter=1s e si sblocca puntualmente a 31s.');

// ──────────────────────────────────────────────────────────
// 2. TEST UI DEL CONTO ALLA ROVESCIA (COUNTDOWN HELPER)
// ──────────────────────────────────────────────────────────
console.log('\n[TEST 2] Verifica logica conto alla rovescia UI (sessionStorage simulation)...');

class MockSessionStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.get(k) || null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

const mockSession = new MockSessionStorage();
const PUSH_TEST_COOLDOWN_MS = 30_000;
const PUSH_TEST_STORAGE_KEY = 'hounigo_push_test_last_sent';

function getRemaining(now) {
  const raw = mockSession.getItem(PUSH_TEST_STORAGE_KEY);
  if (!raw) return 0;
  const elapsed = now - Number(raw);
  if (elapsed >= PUSH_TEST_COOLDOWN_MS || isNaN(elapsed)) {
    mockSession.removeItem(PUSH_TEST_STORAGE_KEY);
    return 0;
  }
  return Math.max(1, Math.ceil((PUSH_TEST_COOLDOWN_MS - elapsed) / 1000));
}

function recordSent(now, remainingSeconds) {
  const targetMs = (typeof remainingSeconds === 'number' && remainingSeconds > 0)
    ? remainingSeconds * 1000
    : PUSH_TEST_COOLDOWN_MS;
  const effectiveTimestamp = now - (PUSH_TEST_COOLDOWN_MS - targetMs);
  mockSession.setItem(PUSH_TEST_STORAGE_KEY, String(effectiveTimestamp));
}

let simulatedNow = 1000000;
recordSent(simulatedNow, 30);
assert.strictEqual(getRemaining(simulatedNow), 30, 'All avvio il countdown è esattamente 30s');

// Dopo 15 secondi
assert.strictEqual(getRemaining(simulatedNow + 15_000), 15, 'Dopo 15s rimangono 15s');

// Dopo 29.5 secondi
assert.strictEqual(getRemaining(simulatedNow + 29_500), 1, 'Dopo 29.5s rimane 1s');

// Dopo 30.1 secondi
assert.strictEqual(getRemaining(simulatedNow + 30_100), 0, 'Dopo 30s il cooldown torna a 0 e si ripulisce');
assert.strictEqual(mockSession.getItem(PUSH_TEST_STORAGE_KEY), null, 'Storage ripulito dopo scadenza');

console.log('✓ TEST 2 Superato: Conto alla rovescia UI calcola i secondi residui in modo accurato e si azzera a 30s.');

// ──────────────────────────────────────────────────────────
// 3. TEST DISTINZIONE DRY-RUN / INVIO EFFETTIVO NELL'ADMIN
// ──────────────────────────────────────────────────────────
console.log('\n[TEST 3] Verifica distinzione dry-run / invio effettivo in Admin e Modale...');

const adminPanelSrc = fs.readFileSync(path.resolve(__dirname, '../src/views/altro/AdminNotificationsPanel.tsx'), 'utf8');
const pushModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/modals/PushNotificationModal.tsx'), 'utf8');

// Verifica presenza della dicitura "Simula invio (nessuna notifica)"
assert.ok(
  adminPanelSrc.includes('Simula invio (nessuna notifica)'),
  'Admin deve contenere "Simula invio (nessuna notifica)" per il pulsante dry-run'
);

// Verifica messaggio esplicito nel modale di conferma
assert.ok(
  adminPanelSrc.includes('Esegui simulazione (nessuna notifica)'),
  'Modale di conferma Admin deve distinguere l azione di simulazione senza invio push reale'
);

// Verifica feedback della simulazione
assert.ok(
  adminPanelSrc.includes('[Simulazione completata] Verificati'),
  'Feedback Admin deve dichiarare esplicitamente "Nessuna notifica reale inviata"'
);

// Verifica che il pulsante reale esista ancora
assert.ok(
  adminPanelSrc.includes('⚡ Invia Subito'),
  'Pulsante "⚡ Invia Subito" per invio effettivo deve essere preservato ed operativo'
);

// Verifica in PushNotificationModal distinzione "Invio accettato"
assert.ok(
  pushModalSrc.includes('Invio accettato dal server'),
  'PushNotificationModal deve distinguere "Invio accettato" da ricezione garantita'
);
assert.ok(
  pushModalSrc.includes('Invia notifica di prova'),
  'PushNotificationModal deve includere "Invia notifica di prova"'
);

console.log('✓ TEST 3 Superato: Distinzione dry-run/invio effettivo e chiarezza semantica verificate in Admin e Modale.');

// ──────────────────────────────────────────────────────────
// 4. TEST STATO CONFIGURAZIONE GOOGLE PICKER
// ──────────────────────────────────────────────────────────
console.log('\n[TEST 4] Verifica stato configurazione e validazione Google Picker / Drive...');

const pickerSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/googlePickerService.ts'), 'utf8');

// Verifica che il codice richieda esplicitamente OAuth Client ID e che non inventi credenziali
assert.ok(pickerSrc.includes('VITE_GOOGLE_CLIENT_ID'), 'Picker richiede VITE_GOOGLE_CLIENT_ID');
assert.ok(pickerSrc.includes('drive.file'), 'Picker usa lo scope minimo drive.file');

// Test validazione URL Google Drive (collegamento manuale)
const { parseGoogleDriveUrl } = require('./parse_drive_stub.cjs');
const fileUrl = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y/view';
const parsed = parseGoogleDriveUrl(fileUrl);
assert.strictEqual(parsed.isValid, true, 'Link Google Drive valido');
assert.strictEqual(parsed.fileId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up0Y', 'File ID estratto correttamente');

console.log('✓ TEST 4 Superato: Google Picker configurato per scope minimo drive.file e validazione URL manuale operativa.');

console.log('\n======================================================');
console.log('TUTTI I 4 TEST RAPIDI SUPERATI CON SUCCESSO!');
console.log('======================================================\n');

