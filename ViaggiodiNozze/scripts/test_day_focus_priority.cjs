const assert = require('assert');

// Simple TypeScript to JS transpilation simulation or direct test
const { getEventPriorityTier, computeDayFocalEvent } = (() => {
  function timelineMinutes(value) {
    if (!value) return null;
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function getEventPriorityTier(item) {
    if (item.type === 'trasporto') {
      const tr = item.originalData || {};
      const cat = item.categoryOrType || tr.type;
      const isBinding = ['volo', 'treno', 'traghetto', 'transfer'].includes(cat);
      const hasFixedTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');
      if (isBinding && hasFixedTime) return 1;
      if ((item.id.endsWith('_pickup') || item.id.endsWith('_dropoff')) && hasFixedTime) return 1;
    }
    if (item.type === 'scadenza' || (item.originalData && item.originalData.isCriticalDeadline)) return 2;
    const isBooked = item.status === 'prenotato' || (item.originalData && item.originalData.status === 'prenotato');
    const hasStrictTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');
    if (isBooked && hasStrictTime) return 3;
    if (item.type === 'attivita' || item.type === 'ristorante') return 4;
    if (item.type === 'tappa') return 5;
    return 6;
  }

  function computeDayFocalEvent(timeline, selectedDate, now = new Date()) {
    if (!timeline || timeline.length === 0) return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
    const candidates = timeline.filter(item => item.displayMode !== 'state' && !item.informational && item.type !== 'alloggio' && !item.id.endsWith('_state'));
    if (candidates.length === 0) return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
    
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isCurrentDay = selectedDate === todayStr;

    if (isCurrentDay) {
      const curM = now.getHours() * 60 + now.getMinutes();
      const active = candidates.filter(item => {
        if (item.completed) return false;
        const tm = timelineMinutes(item.time);
        if (tm === null) return true;
        return tm >= curM - 15;
      });
      if (active.length === 0) return { focalItem: null, tier: null, isConcluded: true, allCompleted: true };
      const sorted = [...active].sort((a, b) => {
        const tA = getEventPriorityTier(a);
        const tB = getEventPriorityTier(b);
        if (tA !== tB) return tA - tB;
        return (timelineMinutes(a.time) ?? 9999) - (timelineMinutes(b.time) ?? 9999);
      });
      const chosen = sorted[0];
      return { focalItem: chosen, tier: getEventPriorityTier(chosen), isConcluded: false, allCompleted: false };
    } else {
      const sorted = [...candidates].sort((a, b) => {
        const tA = getEventPriorityTier(a);
        const tB = getEventPriorityTier(b);
        if (tA !== tB) return tA - tB;
        return (timelineMinutes(a.time) ?? 9999) - (timelineMinutes(b.time) ?? 9999);
      });
      const chosen = sorted[0];
      return { focalItem: chosen, tier: getEventPriorityTier(chosen), isConcluded: false, allCompleted: false };
    }
  }

  return { getEventPriorityTier, computeDayFocalEvent };
})();

console.log('=== TEST DETERMINISTIC FOCUS PRIORITY (FASE 1) ===\n');

// 1. Test 28 Novembre: Frecciarossa vs Museo del Novecento vs Foto
const mockTimeline28Nov = [
  {
    id: 'att_01',
    type: 'attivita',
    title: 'Museo del Novecento',
    time: '14:00',
    categoryOrType: 'altro',
    status: 'prenotato',
    location: 'Piazza del Duomo 8, Milano'
  },
  {
    id: 'trn_01_frecciarossa',
    type: 'trasporto',
    title: 'Frecciarossa 9624',
    time: '11:05',
    categoryOrType: 'treno',
    location: 'Roma Termini ➔ Milano Centrale',
    originalData: { type: 'treno', departureLocation: 'Roma Termini', arrivalLocation: 'Milano Centrale' }
  },
  {
    id: 'tappa_duomo',
    type: 'tappa',
    title: 'Duomo di Milano',
    time: '16:00'
  }
];

const result28Nov = computeDayFocalEvent(mockTimeline28Nov, '2026-11-28', new Date('2026-11-03T10:00:00Z'));
console.log('Test 1 (Giorno Futuro 28 Nov) - Focal Item:', result28Nov.focalItem?.title, '| Tier:', result28Nov.tier);
assert.strictEqual(result28Nov.focalItem?.id, 'trn_01_frecciarossa', 'Frecciarossa MUST be the focal event on 28 Nov!');
assert.strictEqual(result28Nov.tier, 1, 'Frecciarossa tier must be 1!');

// 2. Test Time-Aware: Giorno corrente con evento delle 11:05 già concluso alle 13:00
const resultCurrentDayConcluded = computeDayFocalEvent(
  mockTimeline28Nov,
  '2026-11-28',
  new Date('2026-11-28T13:00:00') // Alle 13:00 il treno delle 11:05 è partito
);
console.log('Test 2 (Giorno Corrente ore 13:00) - Prossimo evento attivo:', resultCurrentDayConcluded.focalItem?.title);
assert.strictEqual(resultCurrentDayConcluded.focalItem?.id, 'att_01', 'Alle 13:00 il focus deve avanzare al Museo del Novecento!');

// 3. Test Fine Giornata: tutte le attività concluse
const resultAllDone = computeDayFocalEvent(
  mockTimeline28Nov,
  '2026-11-28',
  new Date('2026-11-28T22:00:00')
);
console.log('Test 3 (Fine Giornata ore 22:00) - All Completed:', resultAllDone.allCompleted);
assert.strictEqual(resultAllDone.allCompleted, true, 'A fine giornata allCompleted deve essere true!');
assert.strictEqual(resultAllDone.focalItem, null, 'Nessun evento focale diurno a giornata conclusa!');

console.log('\n✓ TUTTI I TEST DI PRIORITÀ DETERMINISTICA SUPERATI CON SUCCESSO!');
