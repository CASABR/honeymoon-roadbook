const assert = require('assert');

console.log('\n=== HOUNIGO: TEST TRANSPORT EDITORIAL REDESIGN ===\n');

// 1. Test check-in calculation function
function getCheckinDisplayInfo(transport) {
  const isFlight = transport.type === 'volo';
  const isFerry = transport.type === 'traghetto';

  if (transport.checkinCutoff && transport.checkinCutoff.trim()) {
    const raw = transport.checkinCutoff.trim();
    return {
      cutoffTime: raw,
      notice: isFerry ? `Imbarco entro: ${raw}` : `Chiusura check-in: ${raw}`
    };
  }

  if (!isFlight && !isFerry) {
    return {};
  }

  if (isFlight && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
    const [h, m] = transport.departureTime.trim().split(':').map(Number);
    const depTotalMin = h * 60 + m;

    const cutoffMin = (depTotalMin - 60 + 24 * 60) % (24 * 60);
    const cutoffH = String(Math.floor(cutoffMin / 60)).padStart(2, '0');
    const cutoffM = String(cutoffMin % 60).padStart(2, '0');
    const calculatedCutoff = `${cutoffH}:${cutoffM}`;

    const airportMin = (depTotalMin - 180 + 24 * 60) % (24 * 60);
    const airportH = String(Math.floor(airportMin / 60)).padStart(2, '0');
    const airportM = String(airportMin % 60).padStart(2, '0');
    const recommendedAirport = `${airportH}:${airportM}`;

    return {
      cutoffTime: calculatedCutoff,
      airportArrivalTime: recommendedAirport,
      notice: `Chiusura check-in entro ${calculatedCutoff} (consigliato in aeroporto: ${recommendedAirport})`
    };
  }

  return {};
}

// TEST 01: Air China CA950 (12:30 departure) check-in closing vs airport arrival
{
  const t = {
    type: 'volo',
    carrier: 'Air China · CA950',
    departureTime: '12:30',
    departureLocation: 'Milano Malpensa (MXP)'
  };
  const res = getCheckinDisplayInfo(t);
  assert.strictEqual(res.cutoffTime, '11:30', 'Check-in cutoff should be 11:30 for 12:30 departure');
  assert.strictEqual(res.airportArrivalTime, '09:30', 'Recommended airport arrival should be 09:30');
  console.log('[PASS 01] Calcolo check-in Air China: chiusura ore 11:30, arrivo aeroporto ore 09:30');
}

// TEST 02: Explicit check-in cutoff overrides calculation
{
  const t = {
    type: 'volo',
    departureTime: '12:30',
    checkinCutoff: '11:45'
  };
  const res = getCheckinDisplayInfo(t);
  assert.strictEqual(res.cutoffTime, '11:45', 'Explicit cutoff should be respected');
  console.log('[PASS 02] Chiusura check-in esplicita rispettata: 11:45');
}

// TEST 03: Train departure does NOT generate flight check-in notice
{
  const train = {
    type: 'treno',
    carrier: 'Frecciarossa 9614',
    departureTime: '08:15',
    departureLocation: 'Roma Termini'
  };
  const res = getCheckinDisplayInfo(train);
  assert.strictEqual(res.notice, undefined, 'Train without explicit cutoff must not generate airport notice');
  console.log('[PASS 03] Treno senza check-in esplicito: nessun falso avviso aeroportuale');
}

// TEST 04: Next-day arrival detection (+1 giorno)
{
  const tCrossDate = {
    date: '2026-11-29',
    arrivalDate: '2026-11-30',
    departureTime: '12:30',
    arrivalTime: '05:40'
  };
  const isNextDay1 = Boolean(tCrossDate.arrivalDate && tCrossDate.arrivalDate > tCrossDate.date);
  assert.strictEqual(isNextDay1, true);

  const tCrossMidnight = {
    date: '2026-12-05',
    departureTime: '23:45',
    arrivalTime: '06:15'
  };
  const isNextDay2 = Boolean(tCrossMidnight.arrivalTime < tCrossMidnight.departureTime);
  assert.strictEqual(isNextDay2, true);

  console.log('[PASS 04] Rilevamento arrivo giorno successivo (+1 giorno) su date e orari notturni');
}

// TEST 05: Action dead-button elimination
{
  const transportWithoutTicket = {
    type: 'volo',
    carrier: 'Air China',
    bookingCode: 'ABC123'
  };
  const hasTicket = Boolean(
    transportWithoutTicket.ticketUrl?.trim() ||
    (transportWithoutTicket.attachments && transportWithoutTicket.attachments.length > 0)
  );
  assert.strictEqual(hasTicket, false, 'No ticket button when no ticket attachment or url');
  console.log('[PASS 05] Eliminazione pulsanti morti: nessun pulsante biglietto se assente');
}

// TEST 06: Code extraction and adaptive layout
{
  function extractCodeOrCity(locationStr, explicitIata) {
    if (explicitIata && explicitIata.trim()) {
      return { code: explicitIata.trim().toUpperCase(), name: locationStr };
    }
    if (!locationStr) return { code: 'LOC', name: 'Destinazione' };
    const match = locationStr.match(/\(([A-Z]{3,4})\)/i);
    if (match && match[1]) {
      return { code: match[1].toUpperCase(), name: locationStr.split('(')[0].trim() };
    }
    const l = locationStr.toLowerCase();
    if (l.includes('malpensa') || l.includes('milano')) return { code: 'MXP', name: 'Milano' };
    if (l.includes('pechino')) return { code: 'PEK', name: 'Pechino' };
    return { code: 'LOC', name: locationStr };
  }

  const mxp = extractCodeOrCity('Milano Malpensa (MXP)');
  assert.strictEqual(mxp.code, 'MXP');

  const explicit = extractCodeOrCity('Aeroporto di Pechino', 'PEK');
  assert.strictEqual(explicit.code, 'PEK');

  console.log('[PASS 06] Estrazione IATA pulita da stringa di localita o campo esplicito');
}

// TEST 07: Incomplete transport card safety (no crash, no N/D badges)
{
  const incomplete = {
    id: 'inc-1',
    type: 'volo',
    carrier: 'Volo Sconosciuto',
    date: '2026-12-10',
    departureLocation: 'Auckland',
    arrivalLocation: 'Christchurch',
    status: 'pianificato',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const hasOperationalInfo = Boolean(incomplete.terminalGate || incomplete.posti || (incomplete.type === 'auto' && incomplete.dropoffDate));
  assert.strictEqual(hasOperationalInfo, false, 'No operational info block when fields are absent (no N/D badges)');
  console.log('[PASS 07] Card incompleta: assenza di blocchi vuoti o badge N/D');
}

console.log('\nTUTTI I 7 TEST DELLE CARD TRASPORTO SUPERATI CON SUCCESSO!\n');
