const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolvePlaywright() {
  const candidates = [
    'playwright',
    path.resolve(__dirname, '../node_modules/playwright'),
    path.resolve(__dirname, '../../node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next location
    }
  }
  throw new Error('Playwright module not found');
}

const { chromium } = resolvePlaywright();

const projectRoot = path.resolve(__dirname, '..');
const screenshotDir = process.env.HOUNIGO_LIVE_NEXT_SHOT_DIR || '';
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

async function seedIndexedDB(page, dbName, fixtures) {
  await page.evaluate(
    ({ name, data }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 8);
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result;
          for (const [storeName, indexes] of [
            ['giorni', ['date']],
            ['attivita', ['dayId', 'status']],
            ['alloggi', ['checkIn']],
            ['trasporti', ['date']],
            ['documenti', ['category']],
            ['routes', []],
            ['tappe', ['data']],
            ['ristoranti', ['data']],
            ['shopping', ['data']],
            ['spese', ['date', 'category', 'status']],
            ['note', ['updatedAt']],
            ['bagagli', ['updatedAt']],
            ['settings', []],
          ]) {
            if (!db.objectStoreNames.contains(storeName)) {
              const st = db.createObjectStore(storeName, { keyPath: 'id' });
              for (const idx of indexes) st.createIndex(idx, idx, { unique: false });
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const keys = Object.keys(data);
          const tx = db.transaction(keys, 'readwrite');
          for (const k of keys) {
            const st = tx.objectStore(k);
            st.clear();
            for (const item of data[k]) st.put(item);
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { name: dbName, data: fixtures }
  );
}

async function openLive(page, width) {
  if (width >= 768) {
    const cueBtn = page.locator('[data-testid="desktop-nav-scroll-cue"]');
    if (await cueBtn.isVisible().catch(() => false)) {
      await cueBtn.click();
      await page.waitForTimeout(200);
    }
    const navBtn = page.getByRole('button', { name: /Live Tracking GPS/i }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
      await page.waitForTimeout(400);
      return;
    }
  }
  const altroBtn = page.locator('nav button').filter({ hasText: 'Altro' }).first();
  if (await altroBtn.isVisible().catch(() => false)) {
    await altroBtn.click();
    await page.waitForTimeout(250);
  }
  const liveTile = page.getByRole('button', { name: /Live & Posizione/i }).first();
  if (await liveTile.isVisible().catch(() => false)) {
    await liveTile.click();
    await page.waitForTimeout(400);
  }
}

async function runLogicUnitTests(mod) {
  console.log('--- 1. TEST LOGICA, FILTRI, FUSI ORARI E PRIVACY ---');
  const {
    deriveNextImportantTransport,
    deriveUpcomingImportantTransports,
    deriveNextPublicTransportFromFeedHeader,
    isImportantTransport,
    extractPublicServiceNumber,
    buildFlightradarUrl,
    resolveTransportDepartureTimeZone,
    toPublicNextTransportFeedProjection,
    toPublicUpcomingTransportsFeedProjection,
    toPublicUpcomingTransportTokens,
    serializePublicNextTransportProjection,
    hydratePublicNextTransportFromFeed,
  } = mod;

  const syntheticMix = [
    // Esclusi: taxi, metro, bus, transfer minori, placeholder, traghetto urbano, cancellato
    { id: 't-taxi', type: 'taxi', status: 'prenotato', date: '2026-11-28', departureTime: '08:00', departureTimeZone: 'Europe/Rome', departureLocation: 'Casa', arrivalLocation: 'Roma Termini', createdAt: 1, updatedAt: 1 },
    { id: 't-transfer', type: 'transfer', status: 'prenotato', date: '2026-11-28', departureTime: '08:30', departureTimeZone: 'Europe/Rome', carrier: 'SkyDrive Express Bus', departureLocation: 'MXP', arrivalLocation: 'Milano Centro', createdAt: 1, updatedAt: 1 },
    { id: 't-metro', type: 'metro', status: 'pianificato', date: '2026-11-28', departureTime: '09:00', departureTimeZone: 'Europe/Rome', carrier: 'Metro M3', departureLocation: 'Duomo', arrivalLocation: 'Centrale', createdAt: 1, updatedAt: 1 },
    { id: 't-suburban', type: 'treno', status: 'prenotato', date: '2026-11-28', departureTime: '09:30', departureLocation: 'st leonards', arrivalLocation: 'circular quay', createdAt: 1, updatedAt: 1 },
    { id: 't-mrt', type: 'treno', status: 'pianificato', date: '2026-11-28', departureTime: '09:45', departureTimeZone: 'Asia/Taipei', carrier: 'Taoyuan Airport MRT Express', departureLocation: 'TPE', arrivalLocation: 'Taipei Main', createdAt: 1, updatedAt: 1 },
    { id: 't-placeholder', type: 'treno', status: 'prenotato', date: '2026-11-28', departureTime: '10:00', departureLocation: 'Da trovare', arrivalLocation: 'Da trovare', createdAt: 1, updatedAt: 1 },
    { id: 't-urban-ferry', type: 'traghetto', status: 'da_prenotare', date: '2026-11-28', departureTime: '10:15', carrier: 'Sydney Ferries (Manly Fast Ferry / F1)', departureLocation: 'Circular Quay', arrivalLocation: 'Manly Wharf', createdAt: 1, updatedAt: 1 },
    { id: 't-boracay-multi', type: 'traghetto', status: 'da_prenotare', date: '2026-11-28', departureTime: '10:30', departureTimeZone: 'Asia/Manila', carrier: 'Transfer multimodale (Tricycle/Van + Barca)', departureLocation: 'MPH', arrivalLocation: 'Hotel Boracay', createdAt: 1, updatedAt: 1 },
    { id: 't-cancelled', type: 'volo', status: 'annullato', date: '2026-11-28', departureTime: '10:45', departureTimeZone: 'Europe/Rome', carrier: 'Air China CA000', departureLocation: 'Roma', arrivalLocation: 'Pechino', createdAt: 1, updatedAt: 1 },

    // Inclusi con dati sensibili sporchi per testare la sanificazione pubblica
    {
      id: 't-train-ld',
      type: 'treno',
      status: 'prenotato',
      date: '2026-11-28',
      departureTime: '11:05',
      carrier: 'Trenitalia Frecciarossa 9614',
      departureLocation: 'Roma Termini (PNR: SECRET_PNR)',
      arrivalLocation: 'Milano Centrale',
      bookingCode: 'SECRET_PNR_999',
      cost: '180 EUR',
      posti: 'Carrozza 3 Posto 14A',
      notes: 'Mario Rossi tel +39 333 1234567',
      noteCopilota: 'Codice segreto 4321',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-flight-mxp',
      type: 'volo',
      status: 'prenotato',
      date: '2026-11-29',
      departureTime: '12:30',
      departureTimeZone: 'Europe/Rome',
      carrier: 'Air China CA950',
      departureLocation: 'Milano Malpensa',
      departureIata: 'MXP',
      arrivalLocation: 'Pechino Capital',
      arrivalIata: 'PEK',
      bookingCode: 'FLIGHT_PNR_888',
      notes: 'Documento passaporto Mario Rossi',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-flight-pek-akl',
      type: 'volo',
      status: 'prenotato',
      date: '2026-12-01',
      departureTime: '00:25',
      departureTimeZone: 'Asia/Shanghai',
      carrier: 'Air China CA783 (Prosecuzione CA950)',
      departureLocation: 'Pechino Capital (PEK) T3',
      departureIata: 'PEK',
      arrivalLocation: 'Auckland Airport (AKL)',
      arrivalIata: 'AKL',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-ferry-nz',
      type: 'traghetto',
      status: 'prenotato',
      date: '2026-12-06',
      departureTime: '13:30',
      // Intentionally omit departureTimeZone to verify Wellington -> Pacific/Auckland fallback!
      carrier: 'Bluebridge Cook Strait Ferries — Nave Livia',
      departureLocation: 'Wellington Ferry Terminal',
      arrivalLocation: 'Picton Ferry Terminal',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-ferry-au',
      type: 'traghetto',
      status: 'completato',
      date: '2026-12-16',
      departureTime: '07:40',
      carrier: 'SeaLink Ferry',
      departureLocation: 'Cape Jervis Ferry Terminal',
      arrivalLocation: 'Penneshaw Ferry Terminal (Kangaroo Island)',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-flight-syd-mnl',
      type: 'volo',
      status: 'prenotato',
      date: '2026-12-28',
      departureTime: '12:15',
      departureTimeZone: 'Australia/Sydney',
      carrier: 'Cebu Pacific 5J040 (Airbus A330-900)',
      departureLocation: 'Sydney Kingsford Smith',
      departureIata: 'SYD',
      arrivalLocation: 'Manila Ninoy Aquino',
      arrivalIata: 'MNL',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 't-flight-tpe-fco',
      type: 'volo',
      status: 'prenotato',
      date: '2027-01-09',
      departureTime: '23:25',
      departureTimeZone: 'Asia/Taipei',
      carrier: 'China Airlines CI 0075 (Airbus A350-900)',
      departureLocation: 'Taipei Taoyuan International',
      departureIata: 'TPE',
      arrivalLocation: 'Roma Fiumicino',
      arrivalIata: 'FCO',
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  // Verifica filtri inclusione/esclusione
  const includedIds = syntheticMix.filter(isImportantTransport).map((t) => t.id);
  assert.deepEqual(includedIds, [
    't-train-ld',
    't-flight-mxp',
    't-flight-pek-akl',
    't-ferry-nz',
    't-ferry-au',
    't-flight-syd-mnl',
    't-flight-tpe-fco',
  ]);

  // Verifica estrazione numeri e Flightradar24
  assert.equal(extractPublicServiceNumber('volo', 'Air China CA783 (Prosecuzione CA950)'), 'CA783');
  assert.equal(extractPublicServiceNumber('volo', 'Cebu Pacific 5J040 (Airbus A330-900)'), '5J040');
  assert.equal(extractPublicServiceNumber('volo', 'China Airlines CI 0075 (Airbus A350-900)'), 'CI0075');
  assert.equal(extractPublicServiceNumber('volo', 'Charter Airbus A330-900'), undefined);
  assert.equal(extractPublicServiceNumber('volo', 'Compagnia PNR AB123'), undefined);
  assert.equal(buildFlightradarUrl('CA783'), 'https://www.flightradar24.com/data/flights/ca783');
  assert.equal(buildFlightradarUrl('5J040'), 'https://www.flightradar24.com/data/flights/5j40');
  assert.equal(buildFlightradarUrl('CI0075'), 'https://www.flightradar24.com/data/flights/ci75');
  assert.equal(buildFlightradarUrl(undefined), undefined);
  assert.equal(extractPublicServiceNumber('treno', 'Trenitalia Frecciarossa 9614'), 'Frecciarossa 9614');
  assert.equal(extractPublicServiceNumber('traghetto', 'Bluebridge Cook Strait Ferries — Nave Livia'), undefined);

  // Verifica risoluzione fusi orari mancanti
  assert.equal(resolveTransportDepartureTimeZone(syntheticMix.find((x) => x.id === 't-ferry-nz')), 'Pacific/Auckland');
  assert.equal(resolveTransportDepartureTimeZone(syntheticMix.find((x) => x.id === 't-ferry-au')), 'Australia/Adelaide');
  assert.equal(resolveTransportDepartureTimeZone(syntheticMix.find((x) => x.id === 't-train-ld')), 'Europe/Rome');

  // Passo temporale 1: 10:50 Rome (09:50 UTC) -> Treno 11:05
  const s1 = deriveNextImportantTransport(syntheticMix, new Date('2026-11-28T09:50:00Z'));
  assert.equal(s1?.id, 't-train-ld');
  assert.equal(s1?.icon, '🚆');
  assert.equal(s1?.departureTime, '11:05');
  assert.equal(s1?.serviceNumber, 'Frecciarossa 9614');
  assert.equal(s1?.flightradarUrl, undefined);

  // Controllo privacy stretto sullo snapshot serializzato
  const rawSerialized = JSON.stringify(s1);
  for (const forbidden of ['SECRET_PNR', '180 EUR', '14A', 'Mario Rossi', '4321', '333', 'bookingCode']) {
    assert.ok(!rawSerialized.includes(forbidden), `Leaked private field in output: ${forbidden}`);
  }

  // Passo temporale 2: 11:10 Rome (10:10 UTC) -> avanza automaticamente al volo CA950
  const s2 = deriveNextImportantTransport(syntheticMix, new Date('2026-11-28T10:10:00Z'));
  assert.equal(s2?.id, 't-flight-mxp');
  assert.equal(s2?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ca950');

  // Passo temporale 3: 12:31 Rome (11:31 UTC) -> avanza a CA783 (00:25 Asia/Shanghai)
  const s3 = deriveNextImportantTransport(syntheticMix, new Date('2026-11-29T11:31:00Z'));
  assert.equal(s3?.id, 't-flight-pek-akl');
  assert.equal(s3?.serviceNumber, 'CA783');
  assert.equal(s3?.departureTime, '00:25');
  assert.equal(s3?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ca783');

  // Passo temporale 4: NZDT 13:20 (00:20 UTC del 06/12 = 01:20 CET!) -> ancora Bluebridge 13:30 NZDT
  const s4 = deriveNextImportantTransport(syntheticMix, new Date('2026-12-06T00:20:00Z'));
  assert.equal(s4?.id, 't-ferry-nz');
  assert.equal(s4?.icon, '⛴️');
  assert.equal(s4?.flightradarUrl, undefined);

  // Passo temporale 5: NZDT 13:35 (00:35 UTC del 06/12 = 01:35 CET!) -> deve aver già superato Bluebridge!
  const s5 = deriveNextImportantTransport(syntheticMix, new Date('2026-12-06T00:35:00Z'));
  assert.equal(s5?.id, 't-ferry-au');

  // Passo temporale 6: Volo CI0075 con zero iniziali
  const s6 = deriveNextImportantTransport(syntheticMix, new Date('2027-01-09T14:00:00Z'));
  assert.equal(s6?.id, 't-flight-tpe-fco');
  assert.equal(s6?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ci75');

  // Passo temporale 7: Nessuno spostamento futuro
  const s7 = deriveNextImportantTransport(syntheticMix, new Date('2027-01-09T16:00:00Z'));
  assert.equal(s7, null);
  assert.equal(deriveNextImportantTransport([], new Date()), null);

  // Proiezione pubblica su live_feeds + idratazione ospite esterno (zero PNR/dati privati)
  const projFlight = toPublicNextTransportFeedProjection(s3);
  assert.deepEqual(Object.keys(projFlight).sort(), [
    'date',
    'departureTime',
    'departureUtcMs',
    'fromLabel',
    'serviceNumber',
    'timeZone',
    'toLabel',
    'type',
  ]);
  const hydratedGuestFlight = hydratePublicNextTransportFromFeed(projFlight, new Date('2026-11-29T11:31:00Z'));
  assert.equal(hydratedGuestFlight?.type, 'volo');
  assert.equal(hydratedGuestFlight?.serviceNumber, 'CA783');
  assert.equal(hydratedGuestFlight?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ca783');
  assert.equal(hydratedGuestFlight?.departureTime, '00:25');
  assert.equal(serializePublicNextTransportProjection(projFlight) === serializePublicNextTransportProjection(null), false);

  // Scadenza automatica anche sul client ospite esterno dopo partenza
  assert.equal(hydratePublicNextTransportFromFeed(projFlight, new Date(projFlight.departureUtcMs + 1000)), null);

  // Traghetto proiettato: nessun serviceNumber né link inventati
  const projFerry = toPublicNextTransportFeedProjection(s4);
  const hydratedGuestFerry = hydratePublicNextTransportFromFeed(projFerry, new Date('2026-12-06T00:20:00Z'));
  assert.equal(hydratedGuestFerry?.type, 'traghetto');
  assert.equal(hydratedGuestFerry?.flightradarUrl, undefined);

  // Difesa in lettura da payload corrotto con PNR
  const polluted = { ...projFlight, fromLabel: 'Roma Termini (PNR: XYZ123)', serviceNumber: 'PNR: ABC999' };
  const cleanedGuest = hydratePublicNextTransportFromFeed(polluted, new Date('2026-11-29T11:31:00Z'));
  assert.equal(cleanedGuest?.fromLabel, 'Roma Termini');
  assert.equal(cleanedGuest?.serviceNumber, undefined);
  assert.equal(cleanedGuest?.flightradarUrl, undefined);

  // Rollover automatico lato ospite esterno anche a PWA Owner chiusa (upcomingTransports token + fallback)
  const upcomingBeforeTrip = deriveUpcomingImportantTransports(syntheticMix, new Date('2026-11-28T09:50:00Z'));
  assert.equal(upcomingBeforeTrip.length, 7);
  const projectedList = toPublicUpcomingTransportsFeedProjection(upcomingBeforeTrip);
  const projectedTokens = toPublicUpcomingTransportTokens(upcomingBeforeTrip);
  assert.equal(projectedList.length, 7);
  assert.equal(projectedTokens.length, 7);
  const firstFallback = projectedList[0]; // Treno 11:05

  // Dopo la partenza del Treno 11:05 (Owner chiusa, nessuna nuova scrittura Firestore) -> avanza a CA950
  const autoAfterTrain = deriveNextPublicTransportFromFeedHeader(projectedTokens, firstFallback, new Date('2026-11-28T10:10:00Z'));
  assert.equal(autoAfterTrain?.serviceNumber, 'CA950');
  assert.equal(autoAfterTrain?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ca950');

  // Dopo la partenza di CA950 (Owner chiusa) -> avanza a CA783 (mai mostrare volo già passato)
  const autoAfterCa950 = deriveNextPublicTransportFromFeedHeader(projectedTokens, firstFallback, new Date('2026-11-29T11:31:00Z'));
  assert.equal(autoAfterCa950?.serviceNumber, 'CA783');
  assert.equal(autoAfterCa950?.flightradarUrl, 'https://www.flightradar24.com/data/flights/ca783');

  // Dopo la partenza dell'ultimo volo del viaggio -> nascosto (null)
  assert.equal(
    deriveNextPublicTransportFromFeedHeader(projectedTokens, firstFallback, new Date('2027-01-09T16:00:00Z')),
    null
  );

  console.log('✓ [PASS] Tutti i controlli unitari su filtri, fusi orari, Flightradar24, proiezione LIVE e privacy superati!');
}

async function runPlaywrightUiTests() {
  console.log('\n--- 2. TEST E2E PLAYWRIGHT RESPONSIVE, LAYOUT E PRIVACY LIVE ---');
  const { preview } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await preview({
    root: projectRoot,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5201, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'synthetic-live-next-transport';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FLIGHT_FIXTURES = {
      giorni: [{ id: 'd1', date: '2099-05-10', title: 'Milano → Pechino', location: 'Milano', createdAt: 1, updatedAt: 1 }],
      attivita: [],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      trasporti: [
        {
          id: 'past-flight',
          type: 'volo',
          status: 'prenotato',
          date: '2020-01-01',
          departureTime: '08:00',
          departureTimeZone: 'Europe/Rome',
          carrier: 'Air Old AO100',
          departureLocation: 'Roma FCO',
          arrivalLocation: 'Milano LIN',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'minor-taxi',
          type: 'taxi',
          status: 'prenotato',
          date: '2099-05-09',
          departureTime: '09:00',
          departureTimeZone: 'Europe/Rome',
          departureLocation: 'Centro',
          arrivalLocation: 'Stazione',
          bookingCode: 'TAXI_SECRET_00',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'next-flight',
          type: 'volo',
          status: 'prenotato',
          date: '2099-05-10',
          departureTime: '12:30',
          departureTimeZone: 'Europe/Rome',
          carrier: 'China Airlines CI 0075 (Airbus A350-900)',
          departureLocation: 'Taipei Taoyuan International',
          departureIata: 'TPE',
          arrivalLocation: 'Roma Fiumicino',
          arrivalIata: 'FCO',
          bookingCode: 'SECRET_PNR_CI75',
          cost: '1999 EUR',
          posti: '50A-50B',
          notes: 'Dato privato Mario Rossi',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    };

    const ctx = await browser.newContext({ viewport: { width: 1133, height: 744 }, serviceWorkers: 'block' });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    await ctx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test LIVE Prossimo Spostamento', startDate: '2099-05-10', endDate: '2099-05-20' }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('http://127.0.0.1:5201/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FLIGHT_FIXTURES);
    await page.goto('http://127.0.0.1:5201/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const viewports = [
      { name: '320x568-iphone-se', width: 320, height: 568 },
      { name: '393x852-iphone', width: 393, height: 852 },
      { name: '744x1133-ipad-portrait', width: 744, height: 1133 },
      { name: '1133x744-ipad-landscape', width: 1133, height: 744 },
      { name: '1280x800-desktop', width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await openLive(page, vp.width);
      await page.waitForSelector('[data-testid="live-next-transport-card"]', { timeout: 6000 });

      const ui = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="live-next-transport-card"]');
        const header = document.querySelector('.hounigo-live-entry > header');
        const nav = document.querySelector('nav[aria-label="Sezioni LIVE"]');
        const route = document.querySelector('[data-testid="live-next-transport-route"]');
        const meta = document.querySelector('[data-testid="live-next-transport-meta"]');
        const links = card ? Array.from(card.querySelectorAll('a')) : [];
        const cr = card?.getBoundingClientRect();
        const hr = header?.getBoundingClientRect();
        const nr = nav?.getBoundingClientRect();
        const rr = route?.getBoundingClientRect();
        const mr = meta?.getBoundingClientRect();
        return {
          docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cardOverflow: card ? card.scrollWidth > card.clientWidth + 1 : false,
          cardTop: cr?.top ?? -1,
          cardHeight: cr?.height ?? 0,
          headerBottom: hr?.bottom ?? -1,
          navTop: nr?.top ?? -1,
          routeHeight: rr?.height ?? 0,
          metaHeight: mr?.height ?? 0,
          routeText: route?.textContent || '',
          metaText: meta?.textContent || '',
          links: links.map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href'), target: a.getAttribute('target') })),
          bodyText: document.body.innerText || '',
        };
      });

      assert.equal(ui.docOverflow, false, `${vp.name}: horizontal overflow`);
      assert.equal(ui.cardOverflow, false, `${vp.name}: card internal overflow`);
      assert.ok(ui.cardTop >= ui.headerBottom - 2, `${vp.name}: card must be below header`);
      assert.ok(ui.cardTop < ui.navTop, `${vp.name}: card must be above LIVE subheader nav`);
      assert.ok(ui.cardHeight <= 82, `${vp.name}: mini-card too tall (${ui.cardHeight}px)`);
      assert.ok(ui.routeHeight <= 24, `${vp.name}: route wrapped (${ui.routeHeight}px)`);
      assert.ok(ui.metaHeight <= 20, `${vp.name}: meta wrapped (${ui.metaHeight}px)`);
      assert.ok(ui.routeText.includes('TPE') && ui.routeText.includes('FCO'), `${vp.name}: missing TPE/FCO route`);
      assert.ok(ui.metaText.includes('10 mag') && ui.metaText.includes('12:30 ora locale') && ui.metaText.includes('CI0075'), `${vp.name}: meta mismatch: ${ui.metaText}`);
      assert.equal(ui.links.length, 1, `${vp.name}: expected 1 Flightradar24 link`);
      assert.equal(ui.links[0].href, 'https://www.flightradar24.com/data/flights/ci75');
      assert.equal(ui.links[0].target, '_blank');
      assert.ok(!ui.bodyText.includes('SECRET_PNR_CI75'), `${vp.name}: PNR leaked`);
      assert.ok(!ui.bodyText.includes('50A-50B'), `${vp.name}: seats leaked`);
      assert.ok(!ui.bodyText.includes('Mario Rossi'), `${vp.name}: personal data leaked`);

      if (screenshotDir && ['393x852-iphone', '744x1133-ipad-portrait', '1133x744-ipad-landscape', '1280x800-desktop'].includes(vp.name)) {
        await page.screenshot({ path: path.join(screenshotDir, `${vp.name}-flight.png`), fullPage: false });
      }
    }

    // Caso B: Traghetto senza link inventati
    const FERRY_FIXTURES = {
      ...FLIGHT_FIXTURES,
      trasporti: [
        {
          id: 'next-ferry',
          type: 'traghetto',
          status: 'prenotato',
          date: '2099-05-12',
          departureTime: '13:30',
          carrier: 'Bluebridge Cook Strait Ferries — Nave Livia',
          departureLocation: 'Wellington Ferry Terminal',
          arrivalLocation: 'Picton Ferry Terminal',
          bookingCode: 'FERRY_SECRET_11',
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    };
    await seedIndexedDB(page, DB_NAME, FERRY_FIXTURES);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('http://127.0.0.1:5201/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    await openLive(page, 393);
    await page.waitForSelector('[data-testid="live-next-transport-card"]', { timeout: 6000 });
    const ferryUi = await page.evaluate(() => ({
      route: document.querySelector('[data-testid="live-next-transport-route"]')?.textContent || '',
      meta: document.querySelector('[data-testid="live-next-transport-meta"]')?.textContent || '',
      linkCount: document.querySelectorAll('[data-testid="live-next-transport-card"] a').length,
      bodyText: document.body.innerText || '',
    }));
    assert.ok(ferryUi.route.includes('Wellington') && ferryUi.route.includes('Picton'));
    assert.ok(ferryUi.meta.includes('Traghetto') && ferryUi.meta.includes('13:30 ora locale'));
    assert.equal(ferryUi.linkCount, 0, 'Ferry must NOT render invented external links');
    assert.ok(!ferryUi.bodyText.includes('FERRY_SECRET_11'));

    // Caso C: Nessuno spostamento futuro -> card nascosta
    await seedIndexedDB(page, DB_NAME, { ...FLIGHT_FIXTURES, trasporti: [FLIGHT_FIXTURES.trasporti[0]] });
    await page.goto('http://127.0.0.1:5201/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    await openLive(page, 393);
    await page.waitForTimeout(350);
    const hiddenCount = await page.locator('[data-testid="live-next-transport-card"]').count();
    assert.equal(hiddenCount, 0, 'Mini-card must be hidden when no future important transports exist');

    // Caso D: LIVE pubblica esterna ospite -> 0 leak e card nascosta se assenti trasporti pubblici
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await guestCtx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const guestPage = await guestCtx.newPage();
    await guestPage.goto('http://127.0.0.1:5201/honeymoon-roadbook/?tripId=0000&view=live', { waitUntil: 'domcontentloaded' });
    await guestPage.waitForSelector('.hounigo-live-entry', { timeout: 6000 });
    assert.equal(await guestPage.locator('[data-testid="live-next-transport-card"]').count(), 0);
    const guestBody = await guestPage.evaluate(() => document.body.innerText || '');
    assert.ok(!guestBody.includes('Codice PNR') && !guestBody.includes('private_credentials'));
    await guestCtx.close();

    console.log('✓ [PASS] Tutti i test E2E Playwright (320, 393, 744, 1133, 1280, privacy, link Flightradar24) superati!');
    await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
  } finally {
    if (browser) await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
    server.httpServer.closeAllConnections?.();
    await Promise.race([
      typeof server.close === 'function' ? server.close().catch(() => {}) : Promise.resolve(),
      new Promise((resolve) => {
        server.httpServer.close(() => resolve());
        setTimeout(resolve, 1000);
      }),
    ]);
  }
}

(async () => {
  const killer = setTimeout(() => {
    console.error('TIMEOUT: test_live_next_transport exceeded 90s');
    process.exit(2);
  }, 90000);
  killer.unref();

  const { createServer } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const mod = await vite.ssrLoadModule('/src/utils/liveNextTransport.ts');
    await runLogicUnitTests(mod);
  } finally {
    await vite.close();
  }

  await runPlaywrightUiTests();
  clearTimeout(killer);
  console.log('\n✅ TEST SUITE LIVE MINI-CARD PROSSIMO SPOSTAMENTO COMPLETATA CON SUCCESSO!');
  process.exit(0);
})();
