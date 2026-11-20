const assert = require('node:assert/strict');
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
      // try next candidate
    }
  }
  throw new Error('Playwright non trovato');
}

const { chromium } = resolvePlaywright();
const projectRoot = path.resolve(__dirname, '..');

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
      await page.waitForTimeout(150);
    }
    const navBtn = page.getByRole('button', { name: /Live Tracking GPS/i }).first();
    if (await navBtn.isVisible().catch(() => false)) {
      await navBtn.click();
      await page.waitForTimeout(350);
      return;
    }
  }
  const altroBtn = page.locator('nav button').filter({ hasText: 'Altro' }).first();
  if (await altroBtn.isVisible().catch(() => false)) {
    await altroBtn.click();
    await page.waitForTimeout(200);
  }
  const liveTile = page.getByRole('button', { name: /Live & Posizione/i }).first();
  if (await liveTile.isVisible().catch(() => false)) {
    await liveTile.click();
    await page.waitForTimeout(350);
  }
}

async function runUnitTests() {
  console.log('--- 1. UNIT TEST P3 (GPS MINUTI) + P4 (ORARI/SOLE-LUNA) + P5 (MULTI-TRASPORTI) ---');
  const { createServer } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const nextMod = await vite.ssrLoadModule('/src/utils/liveNextTransport.ts');
    const clockMod = await vite.ssrLoadModule('/src/utils/liveTimeClock.ts');

    // P5: Lista multi-trasporti dal feed pubblico (esclusi minori/passati, ZERO PNR)
    const transports = [
      { id: 't1', type: 'treno', status: 'prenotato', date: '2026-11-28', departureTime: '11:05', departureTimeZone: 'Europe/Rome', carrier: 'Trenitalia Frecciarossa 9614', departureLocation: 'Roma Termini (PNR: PRIV_01)', arrivalLocation: 'Milano Centrale', createdAt: 1, updatedAt: 1 },
      { id: 't2', type: 'volo', status: 'prenotato', date: '2026-11-29', departureTime: '12:30', departureTimeZone: 'Europe/Rome', carrier: 'Air China CA950', departureLocation: 'Milano Malpensa', departureIata: 'MXP', arrivalLocation: 'Pechino Capital', arrivalIata: 'PEK', bookingCode: 'PNR_NO_SHOW', createdAt: 1, updatedAt: 1 },
      { id: 't3', type: 'volo', status: 'prenotato', date: '2027-01-09', departureTime: '23:25', departureTimeZone: 'Asia/Taipei', carrier: 'China Airlines CI 0075', departureLocation: 'Taipei Taoyuan', departureIata: 'TPE', arrivalLocation: 'Roma Fiumicino', arrivalIata: 'FCO', createdAt: 1, updatedAt: 1 },
    ];
    const upcoming = nextMod.deriveUpcomingImportantTransports(transports, new Date('2026-11-28T09:00:00Z'));
    const tokens = nextMod.toPublicUpcomingTransportTokens(upcoming);
    const publicList = nextMod.deriveUpcomingPublicTransportsFromFeedHeader(tokens, null, new Date('2026-11-28T09:00:00Z'));
    assert.equal(publicList.length, 3);
    assert.equal(publicList[0].type, 'treno');
    assert.equal(publicList[0].flightradarUrl, undefined);
    assert.equal(publicList[1].serviceNumber, 'CA950');
    assert.equal(publicList[1].flightradarUrl, 'https://www.flightradar24.com/data/flights/ca950');
    assert.equal(publicList[2].serviceNumber, 'CI0075');
    assert.equal(publicList[2].flightradarUrl, 'https://www.flightradar24.com/data/flights/ci75');
    assert.ok(!JSON.stringify(publicList).includes('PRIV_01'));
    assert.ok(!JSON.stringify(publicList).includes('PNR_NO_SHOW'));
    console.log('✓ [PASS UNIT P5] Multi-trasporti pubblici ordinati, Flightradar24 dinamico e zero PNR');

    // P3: Calcolo minuti reali GPS + divieto assoluto di inventare timestamp mancante
    const baseNowMs = Date.parse('2026-12-02T14:20:00Z');
    assert.equal(clockMod.formatGpsPositionAge(new Date(baseNowMs - 40_000), baseNowMs), 'Posizione aggiornata 0 min fa');
    assert.equal(clockMod.formatGpsPositionAge(new Date(baseNowMs - 7 * 60_000), baseNowMs), 'Posizione aggiornata 7 min fa');
    assert.equal(clockMod.formatGpsPositionAge(new Date(baseNowMs - 10 * 60_000), baseNowMs), 'Posizione aggiornata 10 min fa');
    assert.equal(clockMod.formatGpsPositionAge(new Date(baseNowMs - 75 * 60_000), baseNowMs), 'Posizione aggiornata 1 h 15 min fa');
    assert.equal(clockMod.formatGpsPositionAge(null, baseNowMs), null);
    assert.equal(clockMod.formatGpsPositionAge(undefined, baseNowMs), null);
    assert.equal(clockMod.formatGpsPositionAge(new Date(0), baseNowMs), null);
    assert.equal(clockMod.formatGpsPositionAge('not-a-date', baseNowMs), null);
    console.log('✓ [PASS UNIT P3] Timestamp GPS calcolato da updatedAt reale; nessun valore inventato se mancante');

    // P4: Orario Italia vs Viaggio + giorno/notte + cambio data + Adelaide +9h 30m + fallback ospiti
    const utcMorningDec = Date.parse('2026-12-01T14:15:00Z'); // Rome 15:15 mar 1 dic (☀️) | Auckland 03:15 mer 2 dic (🌙)
    const aklRes = clockMod.resolveLiveTravelTimeZone({
      isExternal: true,
      realLocation: { lat: -36.8485, lng: 174.7633, city: 'Auckland', country: 'Nuova Zelanda' },
    });
    assert.equal(aklRes.timeZone, 'Pacific/Auckland');
    assert.equal(aklRes.source, 'gps');
    const aklClock = clockMod.buildLiveDualClockViewModel(utcMorningDec, aklRes);
    assert.equal(aklClock.italy.timeStr, '15:15');
    assert.equal(aklClock.italy.isDay, true);
    assert.equal(aklClock.italy.dayNightIcon, '☀️');
    assert.equal(aklClock.travel?.timeStr, '03:15');
    assert.equal(aklClock.travel?.isDay, false);
    assert.equal(aklClock.travel?.dayNightIcon, '🌙');
    assert.equal(aklClock.offsetLabel, '+12h');
    assert.equal(aklClock.isDifferentDate, true);
    assert.equal(aklClock.dayDiff, 1);

    // Inversione giorno/notte: Rome 22:10 (🌙), Auckland 10:10 giorno dopo (☀️)
    const utcNightRome = Date.parse('2026-12-01T21:10:00Z');
    const aklDayClock = clockMod.buildLiveDualClockViewModel(utcNightRome, aklRes);
    assert.equal(aklDayClock.italy.timeStr, '22:10');
    assert.equal(aklDayClock.italy.dayNightIcon, '🌙');
    assert.equal(aklDayClock.travel?.timeStr, '10:10');
    assert.equal(aklDayClock.travel?.dayNightIcon, '☀️');

    // Adelaide / Kangaroo Island: fuso +10:30 vs CET +01:00 => +9h 30m esatti (nessun arrotondamento a +10h)
    const adlRes = clockMod.resolveLiveTravelTimeZone({
      isExternal: false,
      plannedLocation: { city: 'Kangaroo Island', coords: { lat: -35.8, lng: 137.2 } },
    });
    assert.equal(adlRes.timeZone, 'Australia/Adelaide');
    const adlClock = clockMod.buildLiveDualClockViewModel(utcMorningDec, adlRes);
    assert.equal(adlClock.offsetLabel, '+9h 30m');
    assert.equal(adlClock.travel?.timeStr, '00:45');
    assert.equal(adlClock.travel?.dayNightIcon, '🌙');
    assert.equal(adlClock.isDifferentDate, true);

    // Ospite esterno senza GPS né currentCity pubblica => fallback discreto, nessuna apertura privata
    const guestFallback = clockMod.resolveLiveTravelTimeZone({
      isExternal: true,
      realLocation: null,
      publicCurrentCity: null,
      plannedLocation: { title: 'Privato Auckland', coords: { lat: -36.8485, lng: 174.7633 } },
    });
    assert.equal(guestFallback.timeZone, null);
    assert.equal(guestFallback.source, 'unavailable');
    const guestModel = clockMod.buildLiveDualClockViewModel(utcMorningDec, guestFallback);
    assert.equal(guestModel.travel, null);
    assert.equal(guestModel.italy.timeStr, '15:15');

    // Ospite esterno con sola città pubblica in header => fuso corretto senza collezioni private
    const guestHeader = clockMod.resolveLiveTravelTimeZone({
      isExternal: true,
      realLocation: null,
      publicCurrentCity: 'Sydney',
    });
    assert.equal(guestHeader.timeZone, 'Australia/Sydney');
    assert.equal(guestHeader.source, 'header');
    console.log('✓ [PASS UNIT P4] Ora Italia + Locale, sole/luna, cambio data, Adelaide +9h 30m e privacy ospiti');
  } finally {
    await vite.close();
  }
}

async function runE2eTests() {
  console.log('\n--- 2. E2E PLAYWRIGHT RESPONSIVE (iPhone SE/15, iPad mini Portrait/Landscape, Desktop) ---');
  const { preview } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await preview({
    root: projectRoot,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5203, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'synthetic-live-p3-p6';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const eightMinsAgoIso = new Date(Date.now() - 8 * 60_000).toISOString();

    const MULTI_FIXTURES = {
      giorni: [{ id: 'd1', date: '2099-05-10', title: 'Milano → Auckland', location: 'Auckland', createdAt: 1, updatedAt: 1 }],
      attivita: [],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      trasporti: [
        {
          id: 'tr-train',
          type: 'treno',
          status: 'prenotato',
          date: '2099-05-10',
          departureTime: '08:15',
          departureTimeZone: 'Europe/Rome',
          carrier: 'Trenitalia Frecciarossa 9614',
          departureLocation: 'Roma Termini (PNR: SECRET_TR)',
          arrivalLocation: 'Milano Centrale',
          bookingCode: 'SECRET_TR_01',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'tr-flight-1',
          type: 'volo',
          status: 'prenotato',
          date: '2099-05-11',
          departureTime: '12:30',
          departureTimeZone: 'Europe/Rome',
          carrier: 'Air China CA950',
          departureLocation: 'Milano Malpensa',
          departureIata: 'MXP',
          arrivalLocation: 'Pechino Capital',
          arrivalIata: 'PEK',
          bookingCode: 'SECRET_CA950',
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'tr-flight-2',
          type: 'volo',
          status: 'prenotato',
          date: '2099-05-12',
          departureTime: '23:25',
          departureTimeZone: 'Asia/Taipei',
          carrier: 'China Airlines CI 0075',
          departureLocation: 'Taipei Taoyuan',
          departureIata: 'TPE',
          arrivalLocation: 'Roma Fiumicino',
          arrivalIata: 'FCO',
          bookingCode: 'SECRET_CI75',
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    };

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    await ctx.addInitScript(({ tripId, gpsIso }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test Sprint LIVE P3-P6', startDate: '2099-05-10', endDate: '2099-05-20' }));
      if (!sessionStorage.getItem('__synth_gps_seeded')) {
        sessionStorage.setItem('__synth_gps_seeded', '1');
        localStorage.setItem(`hounigo_live_last_known_loc_${tripId}`, JSON.stringify({
          lat: -36.8485,
          lng: 174.7633,
          accuracy: 12,
          city: 'Auckland',
          country: 'Nuova Zelanda',
          updatedAt: gpsIso,
          publisherDeviceId: 'synth-device',
          status: 'active',
        }));
      }
    }, { tripId: TRIP_ID, gpsIso: eightMinsAgoIso });

    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('http://127.0.0.1:5203/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, MULTI_FIXTURES);
    await page.goto('http://127.0.0.1:5203/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);

    const viewports = [
      { name: 'iphone-se-320', width: 320, height: 568 },
      { name: 'iphone-393', width: 393, height: 852 },
      { name: 'ipad-mini-portrait-744', width: 744, height: 1133 },
      { name: 'ipad-mini-landscape-1024', width: 1024, height: 768 },
      { name: 'desktop-1280', width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);
      await openLive(page, vp.width);
      await page.waitForSelector('[data-testid="live-next-transport-card"]', { timeout: 6000 });

      const ui = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="live-next-transport-card"]');
        const route = document.querySelector('[data-testid="live-next-transport-route"]');
        const meta = document.querySelector('[data-testid="live-next-transport-meta"]');
        const prevBtn = document.querySelector('[data-testid="live-next-transport-prev"]');
        const nextBtn = document.querySelector('[data-testid="live-next-transport-next"]');
        const counter = document.querySelector('[data-testid="live-next-transport-counter"]');
        const clock = document.querySelector('[data-testid="live-dual-clock"]');
        const travelPeriod = document.querySelector('[data-testid="live-clock-travel-period"]');
        const italyPeriod = document.querySelector('[data-testid="live-clock-italy-period"]');
        const gpsAgoHeader = document.querySelector('[data-testid="live-gps-updated-ago"]');
        const gpsAgoCard = document.querySelector('[data-testid="live-gps-card-age"]');
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cardOverflow: card ? card.scrollWidth > card.clientWidth + 1 : false,
          clockOverflow: clock ? clock.scrollWidth > clock.clientWidth + 1 : false,
          cardHeight: card?.getBoundingClientRect().height ?? 0,
          routeHeight: route?.getBoundingClientRect().height ?? 0,
          metaHeight: meta?.getBoundingClientRect().height ?? 0,
          counterText: counter?.textContent?.trim(),
          hasPrev: Boolean(prevBtn),
          hasNext: Boolean(nextBtn),
          prevDisabled: prevBtn?.hasAttribute('disabled') ?? false,
          hasFlightLink: Boolean(document.querySelector('[data-testid="live-next-transport-flight-link"]')),
          travelText: document.querySelector('[data-testid="live-clock-travel"]')?.textContent || '',
          italyText: document.querySelector('[data-testid="live-clock-italy"]')?.textContent || '',
          travelPeriodText: travelPeriod?.textContent || '',
          italyPeriodText: italyPeriod?.textContent || '',
          gpsAgoHeaderText: gpsAgoHeader?.textContent || '',
          gpsAgoCardText: gpsAgoCard?.textContent || '',
          cardText: card?.textContent || '',
        };
      });

      assert.equal(ui.overflow, false, `${vp.name}: horizontal page overflow`);
      assert.equal(ui.cardOverflow, false, `${vp.name}: transport card overflow`);
      assert.equal(ui.clockOverflow, false, `${vp.name}: dual clock overflow`);
      assert.ok(ui.cardHeight <= 82, `${vp.name}: mini-card height ${ui.cardHeight} > 82`);
      assert.ok(ui.routeHeight <= 24, `${vp.name}: route wrapped (${ui.routeHeight}px)`);
      assert.ok(ui.metaHeight <= 20, `${vp.name}: meta wrapped (${ui.metaHeight}px)`);
      assert.equal(ui.hasPrev, true);
      assert.equal(ui.hasNext, true);
      assert.equal(ui.prevDisabled, true);
      assert.equal(ui.counterText, '1/3');
      assert.equal(ui.hasFlightLink, false, `${vp.name}: train #1 must not have Flightradar24 link`);
      assert.ok(ui.gpsAgoHeaderText.includes('Posizione aggiornata 8 min fa'), `${vp.name}: wrong header GPS age: ${ui.gpsAgoHeaderText}`);
      assert.ok(ui.gpsAgoCardText.includes('Posizione aggiornata 8 min fa'), `${vp.name}: wrong card GPS age: ${ui.gpsAgoCardText}`);
      assert.ok(ui.travelText.includes('Auckland'), `${vp.name}: clock must label Auckland`);
      assert.ok(ui.italyText.includes('Italia'), `${vp.name}: clock must label Italia`);
      assert.ok(/☀️|🌙/.test(ui.travelPeriodText), `${vp.name}: missing sun/moon on travel clock`);
      assert.ok(/☀️|🌙/.test(ui.italyPeriodText), `${vp.name}: missing sun/moon on Italy clock`);
      assert.ok(!ui.cardText.includes('SECRET_TR') && !ui.cardText.includes('SECRET_CA950') && !ui.cardText.includes('SECRET_CI75'));
    }

    // Step con frecce ‹ › e aggiornamento dinamico di Stato volo (su 393px)
    await page.setViewportSize({ width: 393, height: 852 });
    await page.waitForSelector('[data-testid="live-next-transport-next"]');
    await page.click('[data-testid="live-next-transport-next"]');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="live-next-transport-counter"]').textContent(), '2/3');
    assert.equal(
      await page.locator('[data-testid="live-next-transport-flight-link"]').getAttribute('href'),
      'https://www.flightradar24.com/data/flights/ca950'
    );

    await page.click('[data-testid="live-next-transport-next"]');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="live-next-transport-counter"]').textContent(), '3/3');
    assert.equal(
      await page.locator('[data-testid="live-next-transport-flight-link"]').getAttribute('href'),
      'https://www.flightradar24.com/data/flights/ci75'
    );

    await page.click('[data-testid="live-next-transport-prev"]');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="live-next-transport-counter"]').textContent(), '2/3');
    assert.equal(
      await page.locator('[data-testid="live-next-transport-flight-link"]').getAttribute('href'),
      'https://www.flightradar24.com/data/flights/ca950'
    );

    // Singolo trasporto: frecce nascoste + GPS senza timestamp NON inventato
    await seedIndexedDB(page, DB_NAME, { ...MULTI_FIXTURES, trasporti: [MULTI_FIXTURES.trasporti[1]] });
    await page.evaluate(({ tripId }) => {
      localStorage.setItem(`hounigo_live_last_known_loc_${tripId}`, JSON.stringify({
        lat: -36.8485,
        lng: 174.7633,
        accuracy: 10,
        city: 'Auckland',
        country: 'Nuova Zelanda',
        updatedAt: null,
        status: 'active',
      }));
    }, { tripId: TRIP_ID });
    await page.goto('http://127.0.0.1:5203/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await openLive(page, 393);
    await page.waitForSelector('[data-testid="live-next-transport-card"]');
    assert.equal(await page.locator('[data-testid="live-next-transport-pager"]').count(), 0, 'Con 1 solo trasporto le frecce devono sparire');
    assert.equal(await page.locator('[data-testid="live-gps-updated-ago"]').count(), 0, 'Con timestamp GPS mancante non deve mostrare minuti inventati');
    assert.ok(!(await page.locator('[data-testid="live-gps-card-age"]').textContent() || '').includes('min fa'));

    // Vista pubblica esterna ospite su iPad mini e desktop: fallback discreto orario locale senza leak
    const guestCtx = await browser.newContext({ viewport: { width: 744, height: 1133 }, serviceWorkers: 'block' });
    await guestCtx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const guestPage = await guestCtx.newPage();
    await guestPage.goto('http://127.0.0.1:5203/honeymoon-roadbook/?live=1&tripId=0000&view=live', { waitUntil: 'domcontentloaded' });
    await guestPage.waitForSelector('[data-testid="live-dual-clock"]', { timeout: 6000 });
    assert.ok((await guestPage.locator('[data-testid="live-clock-italy-time"]').textContent() || '').match(/^\d{2}:\d{2}$/));
    assert.equal(await guestPage.locator('[data-testid="live-clock-travel-fallback"]').isVisible(), true);
    assert.equal(await guestPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await guestCtx.close();

    console.log('✓ [PASS E2E] Responsive (320/393/744/1024/1280), frecce ‹ ›, Flightradar24, GPS X min fa / null-safe e orari superati!');
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
    console.error('TIMEOUT: test_live_p3_p4_p5_p6 exceeded 90s');
    process.exit(2);
  }, 90_000);
  killer.unref();

  await runUnitTests();
  await runE2eTests();
  clearTimeout(killer);
  console.log('\n✅ TEST SUITE LIVE P3/P4/P5/P6 COMPLETATA CON SUCCESSO!');
  process.exit(0);
})();
