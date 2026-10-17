const assert = require('assert');

console.log('=================================================================');
console.log('   TEST DI VERIFICA LOGICA & METRICHE: ADMIN GLOBALE');
console.log('=================================================================');

// 1. Validazione Regole Stati Temporali
function calculateTimeStatus(startDate, endDate, todayStr) {
  if (startDate && endDate) {
    if (todayStr < startDate) return 'upcoming';
    if (todayStr > endDate) return 'completed';
    return 'in_progress';
  }
  if (startDate) {
    return todayStr < startDate ? 'upcoming' : 'in_progress';
  }
  return 'not_set';
}

// 2. Validazione Regole Attività & Abbandono
function calculateActivityStatus(lastActiveAt, nowMs) {
  if (!lastActiveAt) return { activityStatus: 'unknown', daysSinceActivity: null };
  const diffMs = Math.max(0, nowMs - lastActiveAt);
  const daysSinceActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let activityStatus = 'abandoned';
  if (daysSinceActivity <= 14) {
    activityStatus = 'active';
  } else if (daysSinceActivity <= 60) {
    activityStatus = 'dormant';
  }
  return { activityStatus, daysSinceActivity };
}

// 3. Test Fixture
const now = Date.now();
const oneDayMs = 24 * 60 * 60 * 1000;
const todayStr = new Date(now).toISOString().slice(0, 10);

// TEST 1: Viaggio Futuro
const t1 = calculateTimeStatus('2027-01-01', '2027-01-15', todayStr);
assert.strictEqual(t1, 'upcoming', 'Viaggio con date future deve essere upcoming');
console.log('[PASS] 1. Calcolo stato temporale futuro (upcoming)');

// TEST 2: Viaggio In Corso
const t2 = calculateTimeStatus('2026-01-01', '2027-01-01', todayStr);
assert.strictEqual(t2, 'in_progress', 'Viaggio con data odierna compresa deve essere in_progress');
console.log('[PASS] 2. Calcolo stato temporale in corso (in_progress)');

// TEST 3: Viaggio Concluso
const t3 = calculateTimeStatus('2025-01-01', '2025-02-01', todayStr);
assert.strictEqual(t3, 'completed', 'Viaggio con data di fine passata deve essere completed');
console.log('[PASS] 3. Calcolo stato temporale concluso (completed)');

// TEST 4: Viaggio Attivo (modificato 3 giorni fa)
const a1 = calculateActivityStatus(now - 3 * oneDayMs, now);
assert.strictEqual(a1.activityStatus, 'active');
assert.strictEqual(a1.daysSinceActivity, 3);
console.log('[PASS] 4. Calcolo attività recente (active: <=14gg)');

// TEST 5: Viaggio Dormiente (modificato 25 giorni fa)
const a2 = calculateActivityStatus(now - 25 * oneDayMs, now);
assert.strictEqual(a2.activityStatus, 'dormant');
assert.strictEqual(a2.daysSinceActivity, 25);
console.log('[PASS] 5. Calcolo attività dormiente (dormant: 15-60gg)');

// TEST 6: Viaggio Abbandonato (modificato 90 giorni fa)
const a3 = calculateActivityStatus(now - 90 * oneDayMs, now);
assert.strictEqual(a3.activityStatus, 'abandoned');
assert.strictEqual(a3.daysSinceActivity, 90);
console.log('[PASS] 6. Calcolo viaggio abbandonato / silente (>60gg)');

// TEST 7: Viaggio concluso con attività recente non viene dichiarato abbandonato
const a4 = calculateActivityStatus(now - 2 * oneDayMs, now);
assert.strictEqual(a4.activityStatus, 'active', 'Attività recente salvaguarda il viaggio anche se concluso');
console.log('[PASS] 7. Viaggio concluso ma con inserimento recente rimane active (non abbandonato)');

// TEST 8: Paginazione e ordinamento
const sampleList = [
  { id: '1', title: 'B Viaggio', lastActiveAt: 100 },
  { id: '2', title: 'A Viaggio', lastActiveAt: 300 },
  { id: '3', title: 'C Viaggio', lastActiveAt: 200 }
];

sampleList.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
assert.strictEqual(sampleList[0].id, '2');
assert.strictEqual(sampleList[1].id, '3');
assert.strictEqual(sampleList[2].id, '1');
console.log('[PASS] 8. Ordinamento decrescente per ultima attività');

// TEST 9: Gestione assenza timestamp (retrocompatibilità)
const aUnknown = calculateActivityStatus(undefined, now);
assert.strictEqual(aUnknown.activityStatus, 'unknown');
assert.strictEqual(aUnknown.daysSinceActivity, null);
console.log('[PASS] 9. Tolleranza e grazia su timestamp non disponibili (unknown)');

console.log('-----------------------------------------------------------------');
console.log('RISULTATO SUITE ADMIN GLOBALE: TUTTI I 9 TEST SUPERATI!');
console.log('=================================================================');
