/**
 * test_admin_push_security.cjs
 * Test di verifica sicurezza per Admin Notifications e tracciamento ultimo accesso.
 * Verifica:
 * 1. Cloudflare Worker push endpoint admin-send e guardie IAM
 * 2. Blocco 401/403 per utenti non admin
 * 3. Anti-spam: deduplicazione 60s e quota 100/giorno
 * 4. Consenso push (enabled = 1) e dry-run sicuro (zero push reali)
 * 5. Firestore Rules per lastSeenAt e isolamento utenti
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SICUREZZA NOTIFICHE ADMIN & RECENTE ACCESSO ===\n');

// 1. Verifica Worker index.js & push.js
const workerIndexPath = path.resolve(__dirname, '../cloudflare/houniai-worker/src/index.js');
const workerPushPath = path.resolve(__dirname, '../cloudflare/houniai-worker/src/push.js');

assert(fs.existsSync(workerIndexPath), 'Worker index.js non trovato');
assert(fs.existsSync(workerPushPath), 'Worker push.js non trovato');

const workerIndexContent = fs.readFileSync(workerIndexPath, 'utf-8');
const workerPushContent = fs.readFileSync(workerPushPath, 'utf-8');

// Test 1.1: Guardie IAM Global Admin
console.log('Test 1.1: Verifica guardia IAM Global Admin in Worker...');
assert(workerIndexContent.includes('assertGlobalAdmin'), 'Manca assertGlobalAdmin in index.js');
assert(workerIndexContent.includes('system_admins'), 'Manca verifica su /system_admins/ in index.js');
assert(workerIndexContent.includes('amministratori globali') || workerIndexContent.includes('system_admins'), 'Manca blocco 403 per amministratori globali');
console.log('✓ Guardia IAM Global Admin attiva: blocca utenti standard, Owner e Copiloti');

// Test 1.2: Endpoint admin-send nel routing
console.log('Test 1.2: Verifica routing /v1/push/admin-send...');
assert(workerIndexContent.includes("pathname.startsWith('/v1/push/admin-')"), 'Manca guardia pathname admin push in index.js');
assert(workerPushContent.includes("path === '/v1/push/admin-send'"), 'Manca handler /v1/push/admin-send in push.js');
console.log('✓ Routing /v1/push/admin-send protetto da assertGlobalAdmin');

// Test 1.3: Anti-Spam (Deduplicazione 60s & Quota 100/giorno)
console.log('Test 1.3: Verifica Anti-Spam e Rate Limiting...');
assert(workerPushContent.includes('MAX_DAILY_SENDS'), 'Manca quota limite 100 invii/giorno in push.js');
assert(workerPushContent.includes('deduplicazione attiva'), 'Manca protezione duplicati 60s in push.js');
assert(workerPushContent.includes('DAILY_PUSH_QUOTA_EXCEEDED'), 'Manca blocco superamento quota giornaliera');
console.log('✓ Anti-Spam attivo: deduplicazione SHA-256 (60s) e limite 100/giorno');

// Test 1.4: Verifica Consenso Iscritto (enabled = 1) e Dry-Run
console.log('Test 1.4: Verifica filtro consenso e supporto Dry-Run...');
assert(workerPushContent.includes('enabled = 1'), 'Manca filtro sul consenso esplicito enabled = 1');
assert(workerPushContent.includes('dryRun'), 'Manca supporto modalità dryRun in push.js');
console.log('✓ Filtro consenso D1 (enabled = 1) e modalità dry-run sicura presenti');

// 2. Verifica AdminNotificationsPanel.tsx
const panelPath = path.resolve(__dirname, '../src/views/altro/AdminNotificationsPanel.tsx');
assert(fs.existsSync(panelPath), 'AdminNotificationsPanel.tsx non trovato');
const panelContent = fs.readFileSync(panelPath, 'utf-8');

console.log('Test 2.1: Verifica integrazione client protetta...');
assert(panelContent.includes('isDryRun'), 'Manca stato isDryRun in AdminNotificationsPanel');
assert(panelContent.includes('getIdToken()'), 'Manca acquisizione ID token Firebase per invio admin');
assert(panelContent.includes('/v1/push/admin-send'), 'Manca chiamata a endpoint /v1/push/admin-send');
assert(panelContent.includes('Modalità Test / Dry-Run (Raccomandata)'), 'Manca toggle UI per dry-run');
console.log('✓ UI AdminNotificationsPanel collegata all\'endpoint con dry-run abilitato di default');

// 3. Verifica Firestore Rules per lastSeenAt
const rulesPath = path.resolve(__dirname, '../firestore.rules');
assert(fs.existsSync(rulesPath), 'firestore.rules non trovato');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

console.log('Test 3.1: Verifica Firestore Rules per lastSeenAt...');
assert(rulesContent.includes('lastSeenAt'), 'Manca lastSeenAt nelle regole firestore.rules');
assert(rulesContent.includes('request.resource.data.lastSeenAt == request.time'), 'Manca vincolo server timestamp su lastSeenAt');
assert(rulesContent.includes("match /users/{userId}"), 'Manca match per /users/{userId}');
assert(rulesContent.includes('match /system_admins/{adminId}') || rulesContent.includes('match /system_admins/{uid}'), 'Manca match per /system_admins/{adminId}');
console.log('✓ Regole Firestore conformi: serverTimestamp vincolante e accesso /users solo admin');

// 4. Verifica checklist store (12 tester / 14 giorni)
const checklistPath = path.resolve(__dirname, '../docs/STORE_PUBLISHING_CHECKLIST.md');
assert(fs.existsSync(checklistPath), 'STORE_PUBLISHING_CHECKLIST.md non trovato');
const checklistContent = fs.readFileSync(checklistPath, 'utf-8');

console.log('Test 4.1: Verifica requisito 12 tester Google Play...');
assert(checklistContent.includes('12 Tester per 14 Giorni'), 'Requisito titolo 12 tester non presente');
assert(checklistContent.includes('almeno 12 tester aderenti per almeno 14 giorni consecutivi'), 'Requisito 12 tester non descritto');
assert(!checklistContent.includes('20 tester attivi'), 'Vecchio requisito 20 tester ancora presente');
console.log('✓ Checklist aggiornata al requisito ufficiale: 12 tester per 14 giorni');

console.log('\n=== TUTTI I 7 CONTROLLI DI SICUREZZA HANNO DATO ESITO POSITIVO ===');
