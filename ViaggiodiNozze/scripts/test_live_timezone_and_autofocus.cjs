const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  const root = path.resolve(__dirname, '..');
  const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let clockMod;
  let focusMod;
  try {
    clockMod = await vite.ssrLoadModule('/src/utils/liveTimeClock.ts');
    focusMod = await vite.ssrLoadModule('/src/utils/dayFocusPriority.ts');
  } finally {
    await vite.close();
  }

  const { resolveLiveTravelTimeZone, buildLiveDualClockViewModel } = clockMod;
  const { resolveTripActiveCard } = focusMod;

  // 1. GPS vs Planned source distinction
  const gpsRes = resolveLiveTravelTimeZone({
    isExternal: false,
    realLocation: { lat: 39.9042, lng: 116.4074, city: 'Pechino', country: 'Cina' },
    plannedLocation: { title: 'Auckland', coords: { lat: -36.8485, lng: 174.7633 } },
  });
  assert.equal(gpsRes.source, 'gps');
  assert.equal(gpsRes.timeZone, 'Asia/Shanghai');

  const plannedRes = resolveLiveTravelTimeZone({
    isExternal: false,
    realLocation: null,
    plannedLocation: { title: 'Auckland', coords: { lat: -36.8485, lng: 174.7633 } },
  });
  assert.equal(plannedRes.source, 'planned');
  assert.equal(plannedRes.timeZone, 'Pacific/Auckland');

  const extNoGps = resolveLiveTravelTimeZone({
    isExternal: true,
    realLocation: null,
    plannedLocation: { title: 'Auckland', coords: { lat: -36.8485, lng: 174.7633 } },
  });
  assert.equal(extNoGps.source, 'unavailable');
  assert.equal(extNoGps.timeZone, null);

  // 2. Real itinerary timezone changes, midnight, and IDL (+1g / half-hour Adelaide)
  // 2026-12-01 12:30 UTC -> 13:30 Rome (Dec 1) vs 01:30 Auckland (Dec 2, +12h, +1g!)
  const aklMidnight = buildLiveDualClockViewModel(Date.UTC(2026, 11, 1, 12, 30), plannedRes);
  assert.equal(aklMidnight.italy.isoDate, '2026-12-01');
  assert.equal(aklMidnight.travel.isoDate, '2026-12-02');
  assert.equal(aklMidnight.dayDiff, 1);
  assert.equal(aklMidnight.isDifferentDate, true);
  assert.equal(aklMidnight.offsetLabel, '+12h');

  // Adelaide (+9h 30m)
  const adlRes = resolveLiveTravelTimeZone({
    isExternal: false,
    realLocation: { lat: -34.9285, lng: 138.6007, city: 'Adelaide', country: 'Australia' },
  });
  const adlClock = buildLiveDualClockViewModel(Date.UTC(2026, 11, 15, 10, 0), adlRes);
  assert.equal(adlClock.travel.timeZone, 'Australia/Adelaide');
  assert.equal(adlClock.offsetLabel, '+9h 30m');

  // Manila (+7h in winter)
  const mnlRes = resolveLiveTravelTimeZone({
    isExternal: false,
    realLocation: { lat: 14.5995, lng: 120.9842, city: 'Manila', country: 'Filippine' },
  });
  const mnlClock = buildLiveDualClockViewModel(Date.UTC(2026, 11, 29, 10, 0), mnlRes);
  assert.equal(mnlClock.travel.timeZone, 'Asia/Manila');
  assert.equal(mnlClock.offsetLabel, '+7h');

  // 3. Auto-focus: pre-trip (no jump), during trip (in-progress / next)
  const preTripFocus = resolveTripActiveCard([], '2026-11-28', {
    now: new Date(Date.UTC(2026, 10, 25, 10, 0)),
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    dayLocation: 'Roma',
  });
  assert.equal(preTripFocus.isDuringTrip, false, 'Pre-partenza non deve fare auto-focus');

  const duringTripFocus = resolveTripActiveCard([
    {
      id: 'act_1',
      type: 'attivita',
      title: 'Visita museo',
      time: '09:00',
      date: '2026-12-05',
      timeZone: 'Pacific/Auckland',
      originalData: { id: 'act_1', title: 'Visita museo', date: '2026-12-05', orarioInizio: '09:00', orarioFine: '11:00' },
    },
    {
      id: 'act_2',
      type: 'attivita',
      title: 'Pranzo',
      time: '12:30',
      date: '2026-12-05',
      timeZone: 'Pacific/Auckland',
      originalData: { id: 'act_2', title: 'Pranzo', date: '2026-12-05', orarioInizio: '12:30', orarioFine: '14:00' },
    },
  ], '2026-12-05', {
    // 2026-12-04 22:30 UTC = 2026-12-05 11:30 NZDT (between act_1 and act_2 -> next is act_2!)
    now: new Date(Date.UTC(2026, 11, 4, 22, 30)),
    tripStartDate: '2026-11-28',
    tripEndDate: '2027-01-10',
    dayLocation: 'Wellington',
    activeTimeZone: 'Pacific/Auckland',
  });
  assert.equal(duringTripFocus.isDuringTrip, true);
  assert.equal(duringTripFocus.isCurrentDay, true);
  assert.equal(duringTripFocus.scrollItemId, 'act_2');

  console.log('✓ [PASS] Simulazione fusi orari reali (PEK/AKL +12h +1g/ADL +9h30m/MNL), GPS vs Programma e pre-partenza');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
