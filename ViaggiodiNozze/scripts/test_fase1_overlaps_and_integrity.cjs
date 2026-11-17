/**
 * Test Suite Automatizzato FASE 1 — Affidabilità Dati & Sovrapposizioni HOUNIGO
 */

const assert = require('assert');

// Mock localStorage & sessionStorage in Node
class StorageMock {
  constructor() {
    this.store = new Map();
  }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

console.log('--- TEST FASE 1: AFFIDABILITÀ DATI & SOVRAPPOSIZIONI ---');

// --- 1. Parser orari e durate ---
function parseTimeMinutes(timeStr) {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().replace('.', ':');
  if (!clean || clean === '23:59' || clean === 'non specificato') return null;
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function parseDurationMinutes(dur) {
  if (dur === null || dur === undefined) return null;
  if (typeof dur === 'number') return dur > 0 && Number.isFinite(dur) ? dur : null;
  const str = String(dur).trim().toLowerCase();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const val = parseInt(str, 10);
    return val > 0 ? val : null;
  }
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m > 0 ? h * 60 + m : null;
  }
  let total = 0;
  let matched = false;
  const hMatch = str.match(/(\d+)\s*(?:h|ore|ora)/);
  if (hMatch) {
    total += parseInt(hMatch[1], 10) * 60;
    matched = true;
  }
  const mMatch = str.match(/(\d+)\s*(?:m|min|minuti)/);
  if (mMatch) {
    total += parseInt(mMatch[1], 10);
    matched = true;
  }
  if (!matched) {
    const compactMatch = str.match(/^(\d+)h(\d+)$/);
    if (compactMatch) {
      total = parseInt(compactMatch[1], 10) * 60 + parseInt(compactMatch[2], 10);
      matched = true;
    }
  }
  return matched && total > 0 ? total : null;
}

assert.strictEqual(parseTimeMinutes('10:30'), 630);
assert.strictEqual(parseTimeMinutes('09:15'), 555);
assert.strictEqual(parseTimeMinutes('23:59'), null, 'Placeholder 23:59 non deve essere orario certo');
assert.strictEqual(parseDurationMinutes(90), 90);
assert.strictEqual(parseDurationMinutes('1h 30m'), 90);
assert.strictEqual(parseDurationMinutes('2h'), 120);
assert.strictEqual(parseDurationMinutes('45 min'), 45);
assert.strictEqual(parseDurationMinutes('01:30'), 90);
console.log('✓ 1. Parser orari e durate: OK');

// --- 2. Estrazione intervalli e calcolo sovrapposizioni ---
function extractTimeInterval(entity, fallbackType = 'item') {
  const id = String(entity?.id || '');
  const type = String(entity?.type || fallbackType);
  let date = String(entity?.date || entity?.data || '').trim();
  if (!date && typeof entity?.dayId === 'string' && entity.dayId.startsWith('day_')) {
    date = entity.dayId.replace('day_', '');
  }
  const isIndicative = Boolean(
    entity?.timeIsDefault ||
    entity?.isIndicative ||
    entity?.timeStatus === 'indicativo' ||
    entity?.timeStatus === 'flessibile' ||
    entity?.orarioIndicativo
  );
  const rawStart = entity?.time || entity?.departureTime || entity?.orarioInizio || entity?.orario || entity?.orarioRitrovo || entity?.checkInTime;
  const startTimeMin = parseTimeMinutes(rawStart);
  const durationMin = parseDurationMinutes(entity?.duration || entity?.durata);
  const rawEnd = entity?.arrivalTime || entity?.endTime || entity?.orarioFine || entity?.checkOutTime;
  let endTimeMin = parseTimeMinutes(rawEnd);
  if (startTimeMin !== null && endTimeMin !== null && endTimeMin < startTimeMin) {
    endTimeMin += 24 * 60;
  }
  if (startTimeMin !== null && endTimeMin === null && durationMin !== null) {
    endTimeMin = startTimeMin + durationMin;
  }
  const signature = `${date}_${startTimeMin ?? 'none'}_${endTimeMin ?? 'none'}_${durationMin ?? 'none'}_${isIndicative ? 'ind' : 'exact'}`;
  return { id, type, date, startTimeMin, endTimeMin, durationMin, isIndicative, timeString: rawStart || '', signature };
}

function areIntervalsOverlapping(intA, intB) {
  if (!intA.id || !intB.id || intA.id === intB.id) return false;
  if (!intA.date || !intB.date || intA.date !== intB.date) return false;
  if (intA.isIndicative || intB.isIndicative) return false;
  if (intA.startTimeMin === null || intB.startTimeMin === null) return false;

  const startA = intA.startTimeMin;
  const startB = intB.startTimeMin;
  const endA = intA.endTimeMin !== null && intA.endTimeMin > startA ? intA.endTimeMin : startA;
  const endB = intB.endTimeMin !== null && intB.endTimeMin > startB ? intB.endTimeMin : startB;

  const hasRangeA = endA > startA;
  const hasRangeB = endB > startB;

  if (!hasRangeA && !hasRangeB) {
    return startA === startB;
  }
  if (hasRangeA && !hasRangeB) {
    return startB >= startA && startB < endA;
  }
  if (!hasRangeA && hasRangeB) {
    return startA >= startB && startA < endB;
  }
  return startA < endB && startB < endA;
}

// Due attività stesso giorno ad orari diversi (10:00 vs 15:00) -> NESSUNA collisione!
const act1 = extractTimeInterval({ id: 'a1', date: '2026-11-28', time: '10:00', title: 'Tempio' }, 'attivita');
const act2 = extractTimeInterval({ id: 'a2', date: '2026-11-28', time: '15:00', title: 'Shopping' }, 'attivita');
assert.strictEqual(areIntervalsOverlapping(act1, act2), false, 'Attività alle 10:00 e alle 15:00 NON devono collidere');

// Due attività stesso giorno, stesso orario -> COLLIDONO
const act3 = extractTimeInterval({ id: 'a3', date: '2026-11-28', time: '10:00', title: 'Tour' }, 'attivita');
assert.strictEqual(areIntervalsOverlapping(act1, act3), true, 'Attività allo stesso orario (10:00) devono collidere');

// Attività con durata: 10:00 durata 2h (fino alle 12:00) vs attività alle 11:00 -> COLLIDONO
const actRange = extractTimeInterval({ id: 'ar', date: '2026-11-28', time: '10:00', duration: '2h', title: 'Museo' }, 'attivita');
const actMid = extractTimeInterval({ id: 'am', date: '2026-11-28', time: '11:00', title: 'Caffè' }, 'attivita');
assert.strictEqual(areIntervalsOverlapping(actRange, actMid), true, 'Attività alle 11:00 interna a 10:00-12:00 deve collidere');

// Attività con durata: 10:00 durata 1h (fino alle 11:00) vs attività alle 11:00 -> CONTIGUE, NON collidono
const act1h = extractTimeInterval({ id: 'a1h', date: '2026-11-28', time: '10:00', duration: '60 min', title: 'Visita' }, 'attivita');
assert.strictEqual(areIntervalsOverlapping(act1h, actMid), false, 'Attività contigue (fine 11:00 e inizio 11:00) NON collidono');

// Orario indicativo -> MAI inventare collisioni
const actInd = extractTimeInterval({ id: 'ai', date: '2026-11-28', time: '10:00', timeIsDefault: true, title: 'Checkin' }, 'attivita');
assert.strictEqual(areIntervalsOverlapping(act1, actInd), false, 'Orario indicativo non deve generare collisione');

console.log('✓ 2. Confronto intervalli e nessun falso conflitto su date uguali: OK');

// --- 3. Riconoscimento stabile e indipendente dall\'ordine ---
function getCollisionPairKey(idA, idB, category = 'collision') {
  const [first, second] = [String(idA), String(idB)].sort();
  return `${category}_${first}_${second}`;
}
function getPairSignature(sigA, sigB) {
  const [s1, s2] = [sigA, sigB].sort();
  return `${s1}___${s2}`;
}

const key1 = getCollisionPairKey('item_zebra', 'item_ant', 'attivita');
const key2 = getCollisionPairKey('item_ant', 'item_zebra', 'attivita');
assert.strictEqual(key1, key2, 'Le chiavi di coppia devono essere rigorosamente identiche indipendentemente dall\'ordine');
assert.strictEqual(key1, 'attivita_item_ant_item_zebra');
console.log('✓ 3. Riconoscimento stabile indipendente dall\'ordine: OK');

// --- 4. Memorizzazione persistente «Mantieni entrambe» e ricalcolo solo al cambio orari ---
function persistCollisionDecision(idA, idB, decision, pairSignature, category = 'collision') {
  const pairKey = getCollisionPairKey(idA, idB, category);
  const settingKey = `collision_decision_${pairKey}`;
  const record = { id: settingKey, pairKey, decision, signature: pairSignature, updatedAt: Date.now() };
  localStorage.setItem(settingKey, JSON.stringify(record));
}

function isCollisionDismissedOrResolved(idA, idB, currentPairSignature, category = 'collision') {
  const pairKey = getCollisionPairKey(idA, idB, category);
  const settingKey = `collision_decision_${pairKey}`;
  const raw = localStorage.getItem(settingKey);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  if (parsed.signature && parsed.signature === currentPairSignature) return true;
  return false;
}

const sigA = actRange.signature;
const sigB = actMid.signature;
const combinedSig = getPairSignature(sigA, sigB);

// Utente sceglie «Mantieni entrambe»
persistCollisionDecision('ar', 'am', 'keep', combinedSig, 'attivita');

// Al riavvio dell'app (verifica con stessa firma):
assert.strictEqual(
  isCollisionDismissedOrResolved('ar', 'am', combinedSig, 'attivita'),
  true,
  'La scelta «Mantieni entrambe» deve persistere e sopprimere l\'avviso'
);

// L'ordine invertito dei parametri non deve alterare la soppressione
assert.strictEqual(
  isCollisionDismissedOrResolved('am', 'ar', combinedSig, 'attivita'),
  true,
  'La verifica deve funzionare anche invertendo i parametri'
);

// Se l'utente sposta l'orario di actMid alle 14:00 (nuova firma):
const actMidMoved = extractTimeInterval({ id: 'am', date: '2026-11-28', time: '14:00', title: 'Caffè' }, 'attivita');
const newCombinedSig = getPairSignature(actRange.signature, actMidMoved.signature);
assert.strictEqual(
  isCollisionDismissedOrResolved('ar', 'am', newCombinedSig, 'attivita'),
  false,
  'Al cambio di orario la vecchia soppressione deve scadere per rivalutazione'
);
assert.strictEqual(
  areIntervalsOverlapping(actRange, actMidMoved),
  false,
  'Con il nuovo orario (14:00) non vi è alcuna sovrapposizione'
);

console.log('✓ 4. Persistenza «Mantieni entrambe» e invalidazione mirata su cambio orari: OK');

// --- 5. Integrità Tombstone e protezione da resurrezione ---
function isTombstoneActiveSync(entityType, id) {
  return localStorage.getItem(`tombstone_${entityType}_${id}`) === 'true';
}

function recordTombstone(entityType, id, currentUid = 'user_123') {
  const tombstoneKey = `tombstone_${entityType}_${id}`;
  localStorage.setItem(tombstoneKey, 'true');
  return {
    id: tombstoneKey,
    value: {
      entityType,
      deletedId: id,
      deletedAt: Date.now(),
      explicitDeleteBy: currentUid
    }
  };
}

const tomb = recordTombstone('attivita', 'del_999', 'owner_test_uid');
assert.strictEqual(tomb.value.explicitDeleteBy, 'owner_test_uid', 'Tombstone deve avere explicitDeleteBy');
assert.strictEqual(isTombstoneActiveSync('attivita', 'del_999'), true, 'Tombstone deve essere attivo');

// Simulazione getter con filtro tombstone
const mockItems = [
  { id: 'del_999', title: 'Eliminato' },
  { id: 'ok_111', title: 'Attivo' }
];
const filteredItems = mockItems.filter(i => !isTombstoneActiveSync('attivita', i.id));
assert.strictEqual(filteredItems.length, 1);
assert.strictEqual(filteredItems[0].id, 'ok_111', 'Gli elementi eliminati con tombstone non devono MAI riaffiorare nei getter');

console.log('✓ 5. Integrità Tombstone e protezione da resurrezione: OK');
console.log('====================================================');
console.log('TUTTI I TEST AUTOMATIZZATI FASE 1 HANNO AVUTO SUCCESSO!');
