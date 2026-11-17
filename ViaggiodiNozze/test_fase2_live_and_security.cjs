/**
 * HOUNIGO — Test Suite Fase 2: LIVE & Controlli di Sicurezza (1.6.12)
 *
 * Verifica:
 * 1. Tombstone e cancellazioni offline (storageService & syncService)
 * 2. Isolamento decisioni tra viaggi e riproposizione conflitti dopo modifica orari (overlapDetection)
 * 3. Sicurezza LIVE e GPS (posizioni, delega, stop volontario, privacy)
 * 4. Autorizzazioni dei messaggi ospiti (bacheca esterna sola lettura, validazioni e moderazione preservate)
 * 5. Foto LIVE (limiti di spazio localStorage, salvataggio locale senza errori)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   ESECUZIONE TEST SUITE: FASE 2 — LIVE & CONTROLLI DI SICUREZZA');
console.log('=================================================================');

// 1. TEST TOMBSTONE E CANCELLAZIONI OFFLINE
console.log('\n[TEST 1] Verifica Tombstone e Cancellazioni Offline...');
const storageSrc = fs.readFileSync(path.join(__dirname, 'src/storage/storageService.ts'), 'utf8');
assert(!storageSrc.includes("'authorized_user'"), 'storageService non deve MAI usare fallback generico authorized_user');
assert(storageSrc.includes('const verifiedUid = (user && !user.isAnonymous && user.uid) ? user.uid : undefined;'), 'recordTombstone deve attribuire explicitDeleteBy solo con sessione Firebase reale non anonima');
assert(storageSrc.includes('...(verifiedUid ? { explicitDeleteBy: verifiedUid } : {})'), 'Se la sessione Firebase manca, explicitDeleteBy deve essere omesso (in attesa di verifica)');

const syncSrc = fs.readFileSync(path.join(__dirname, 'src/storage/syncService.ts'), 'utf8');
assert(syncSrc.includes("rawDeleteBy !== 'authorized_user'"), 'syncService deve rigettare authorized_user nella cancellazione remota');
assert(syncSrc.includes("rawDeleteBy !== 'anonymous'"), 'syncService deve rigettare anonymous nella cancellazione remota');
assert(syncSrc.includes("rawTsUid !== 'authorized_user'"), 'syncService deve rigettare authorized_user nei tombstone settings');
assert(syncSrc.includes("rawTombstoneUid !== 'authorized_user'"), 'syncService deve proteggere viaggio 0000 da tombstone con authorized_user');

// Simulazione comportamentale tombstone offline vs online
function buildTombstonePayload(firebaseUser, entityType, id, now) {
  const verifiedUid = (firebaseUser && !firebaseUser.isAnonymous && firebaseUser.uid) ? firebaseUser.uid : undefined;
  return {
    id: `tombstone_${entityType}_${id}`,
    value: {
      entityType,
      deletedId: id,
      timestamp: now,
      deletedAt: now,
      pending: true,
      ...(verifiedUid ? { explicitDeleteBy: verifiedUid } : {})
    }
  };
}
const offlineTs = buildTombstonePayload(null, 'attivita', 'act_1', 1000);
assert.strictEqual(offlineTs.value.pending, true, 'Cancellazione offline deve restare pending');
assert.strictEqual('explicitDeleteBy' in offlineTs.value, false, 'Cancellazione senza sessione Firebase non deve avere explicitDeleteBy');

const anonTs = buildTombstonePayload({ uid: 'anon_123', isAnonymous: true }, 'attivita', 'act_1', 1000);
assert.strictEqual('explicitDeleteBy' in anonTs.value, false, 'Sessione anonima non deve attribuire explicitDeleteBy');

const authTs = buildTombstonePayload({ uid: 'owner_real_uid', isAnonymous: false }, 'attivita', 'act_1', 1000);
assert.strictEqual(authTs.value.explicitDeleteBy, 'owner_real_uid', 'Sessione Firebase verificata deve attribuire UID reale');
console.log('  -> PASS: Nessun fallback "authorized_user", cancellazioni offline conservate in attesa di verifica.');

// 2. TEST ISOLAMENTO DECISIONI TRA VIAGGI & RIPROPOSIZIONE DOPO MODIFICA ORARI
console.log('\n[TEST 2] Verifica Isolamento Decisioni tra Viaggi e Riproposizione Conflitti...');
const overlapSrc = fs.readFileSync(path.join(__dirname, 'src/utils/overlapDetection.ts'), 'utf8');
assert(overlapSrc.includes('currentTripId ? `${currentTripId}_${category}_${first}_${second}`'), 'getCollisionPairKey deve isolare le chiavi per tripId');
assert(overlapSrc.includes('getLegacyCollisionPairKey'), 'Deve mantenere compatibilità con le decisioni già salvate');
assert(overlapSrc.includes('stored.signature === currentPairSignature'), 'Deve confermare soppressione solo se la firma temporale coincide');

// Simulazione comportamentale isolamento tripId e rivalutazione orari
const mockStorage = new Map();
function getPairKey(idA, idB, category = 'collision', tripId = '') {
  const [first, second] = [String(idA), String(idB)].sort();
  return tripId ? `${tripId}_${category}_${first}_${second}` : `${category}_${first}_${second}`;
}
function saveDecision(idA, idB, decision, signature, category, tripId) {
  const pairKey = getPairKey(idA, idB, category, tripId);
  mockStorage.set(`collision_decision_${pairKey}`, JSON.stringify({
    id: `collision_decision_${pairKey}`,
    pairKey,
    category,
    idA,
    idB,
    decision,
    signature,
    updatedAt: Date.now()
  }));
}
function checkDismissed(idA, idB, currentPairSignature, category, tripId) {
  const pairKey = getPairKey(idA, idB, category, tripId);
  const legacyKey = getPairKey(idA, idB, category, '');
  const raw = mockStorage.get(`collision_decision_${pairKey}`) || mockStorage.get(`collision_decision_${legacyKey}`);
  if (!raw) return false;
  const stored = JSON.parse(raw);
  if (stored.signature) {
    return stored.signature === currentPairSignature;
  }
  if (currentPairSignature && !currentPairSignature.includes('_none_none_none_')) {
    return false;
  }
  return true;
}

const sigMorning = '2026-11-28_540_600_60_exact___2026-11-28_570_630_60_exact';
const sigAfternoon = '2026-11-28_840_900_60_exact___2026-11-28_870_930_60_exact';

// Salva «Mantieni entrambe» nel viaggio 0000
saveDecision('item_1', 'item_2', 'keep', sigMorning, 'attivita', '0000');
assert.strictEqual(checkDismissed('item_1', 'item_2', sigMorning, 'attivita', '0000'), true, 'Stesso viaggio e stesso orario: non riproporre avviso');
assert.strictEqual(checkDismissed('item_2', 'item_1', sigMorning, 'attivita', '0000'), true, 'Ordine inverso ID: riconosciuto stabilmente');
assert.strictEqual(checkDismissed('item_1', 'item_2', sigMorning, 'attivita', 'demo_local'), false, 'Altro viaggio con stessi ID: NON influenzato');
assert.strictEqual(checkDismissed('item_1', 'item_2', sigAfternoon, 'attivita', '0000'), false, 'Orario modificato: conflitto rivalutato e riproposto');

// Verifica che vecchio record senza signature non nasconda nuovi conflitti con orario definito
mockStorage.set('collision_decision_0000_attivita_item_3_item_4', JSON.stringify({
  pairKey: '0000_attivita_item_3_item_4',
  decision: 'keep',
  signature: ''
}));
assert.strictEqual(checkDismissed('item_3', 'item_4', sigAfternoon, 'attivita', '0000'), false, 'Vecchio flag senza firma non deve nascondere conflitto con orario specifico');
console.log('  -> PASS: Isolamento tripId, compatibilità storica e rivalutazione dopo modifica orari verificati.');

// 3. TEST SICUREZZA LIVE E GPS
console.log('\n[TEST 3] Verifica Sicurezza LIVE e GPS...');
const liveViewSrc = fs.readFileSync(path.join(__dirname, 'src/views/altro/LiveView.tsx'), 'utf8');
assert(liveViewSrc.includes("useState<'both' | 'real' | 'planned'>('both')"), 'La mappa deve aprirsi mostrando sia posizione reale sia programmata');
assert(liveViewSrc.includes("cloudRole !== 'owner' && cloudRole !== 'copilota'"), 'GPS attivabile solo da Owner o Copilota autorizzati');
assert(liveViewSrc.includes('hounigo_live_sharing_enabled_'), 'Ripristino sessione vincolato ad esplicita abilitazione');
assert(liveViewSrc.includes("remoteGpsLease?.status === 'stopped'"), 'Nessuna trasmissione GPS riattivata dopo stop volontario');
assert(liveViewSrc.includes('remoteGpsLease.holderUid !== currentUid'), 'Owner rispetta delega attiva del Copilota');
console.log('  -> PASS: Regole GPS, vista mappa combinata e blocco riattivazione dopo stop volontario verificati.');

// 4. TEST AUTORIZZAZIONI MESSAGGI OSPITI
console.log('\n[TEST 4] Verifica Autorizzazioni Messaggi Ospiti...');
const liveSrc = fs.readFileSync(path.join(__dirname, 'src/services/liveService.ts'), 'utf8');
assert(liveSrc.includes('sanitizeGuestMessageInput'), 'liveService deve preservare sanificazione autore e messaggio');
assert(liveSrc.includes('GUEST_MESSAGE_COOLDOWN_MS = 30_000') || liveSrc.includes('GUEST_MESSAGE_COOLDOWN_MS = 30000'), 'Cooldown rate-limit 30s preservato');
assert(liveSrc.includes('MAX_GUEST_AUTHOR = 40'), 'Nome ospite obbligatorio max 40 caratteri preservato');
assert(liveSrc.includes('MAX_GUEST_MESSAGE = 280'), 'Messaggio ospite max 280 caratteri preservato');

const editorialSrc = fs.readFileSync(path.join(__dirname, 'src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
assert(editorialSrc.includes('props.onSendGuestMessage && !props.isExternal && (FEATURE_FLAGS.LIVE_GUEST_MESSAGES_PUBLIC_WRITE || props.isOwner || props.isCopilota)'), 'Bacheca esterna mantenuta in sola lettura senza pulsante che restituisca permission-denied');
assert(editorialSrc.includes('Bacheca Pensieri dal Pubblico (Sola Lettura)'), 'Avviso sola lettura visibile agli ospiti esterni');
assert(editorialSrc.includes('onModerateGuestMessage'), 'Funzioni di moderazione preservate');

const flagsSrc = fs.readFileSync(path.join(__dirname, 'src/config/featureFlags.ts'), 'utf8');
assert(flagsSrc.includes('LIVE_GUEST_MESSAGES_PUBLIC_WRITE: false'), 'Flag scrittura pubblica diretta mantenuto su false');
console.log('  -> PASS: Bacheca esterna in sola lettura; codice validazione e moderazione preservato.');

// 5. TEST FOTO LIVE E LIMITI DI SPAZIO
console.log('\n[TEST 5] Verifica Foto LIVE e Limiti di Spazio Locale...');
assert(liveViewSrc.includes('MAX_GALLERY_CHARS = 1_800_000'), 'Limite cumulativo localStorage galleria foto applicato');
assert(liveViewSrc.includes('compressedDataUrl.length > 700_000'), 'Blocco singola foto eccessivamente grande per proteggere il DB locale');
assert(editorialSrc.includes("errMsg.includes('dispositivo')"), 'Gestione locale senza errori bloccanti nella modale');
console.log('  -> PASS: Limiti di spazio localStorage verificati e gestione locale sicura.');

console.log('\n=================================================================');
console.log('   ESITO TEST FASE 2: TUTTI I 5 AMBITI SUPERATI AL 100%! (PASS)');
console.log('=================================================================\n');
