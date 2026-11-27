const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolvePlaywright() {
  for (const c of ['playwright', path.resolve(__dirname, '../node_modules/playwright'), path.resolve(__dirname, '../../node_modules/playwright')]) {
    try { return require(c); } catch {}
  }
  throw new Error('Playwright not found');
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
            ['giorni', ['date']], ['attivita', ['dayId', 'status']], ['alloggi', ['checkIn']],
            ['trasporti', ['date']], ['documenti', ['category']], ['routes', []],
            ['tappe', ['data']], ['ristoranti', ['data']], ['shopping', ['data']],
            ['spese', ['date', 'category', 'status']], ['note', ['updatedAt']], ['bagagli', ['updatedAt']], ['settings', []],
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
            const store = tx.objectStore(k);
            for (const row of data[k]) store.put(row);
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { name: dbName, data: fixtures }
  );
}

async function run() {
  const { createServer } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({
    root: projectRoot,
    define: {
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('demo-hounigo-test'),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('demo-key'),
    },
    server: { host: '127.0.0.1', port: 5206, strictPort: true },
  });
  await server.listen();

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'synth-geo-1731';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FIXTURES = {
      giorni: [{ id: 'day-1', date: '2026-12-06', title: 'Wellington', location: 'Wellington', createdAt: 1, updatedAt: 1 }],
      alloggi: [{
        id: 'acc-wlg',
        name: 'Wellington Hotel',
        checkIn: '2026-12-06',
        checkOut: '2026-12-07',
        address: 'Wellington, New Zealand',
        coordinate: { lat: -41.2865, lng: 174.7762 },
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      }],
      attivita: [],
      tappe: [{
        id: 'tap-mtvic',
        data: '2026-12-06',
        date: '2026-12-06',
        titolo: 'Mount Victoria Lookout',
        indirizzo: 'Mount Victoria Lookout, Wellington 6141, NZ',
        coordinate: { lat: -41.2960371, lng: 174.7943249 },
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'tp-homonym',
        data: '2026-12-07',
        date: '2026-12-07',
        titolo: 'Cuba Street Market',
        indirizzo: 'Omonimo locale senza coordinate',
        createdAt: 1,
        updatedAt: 1,
      }],
      ristoranti: [],
      shopping: [{
        id: 'shop-1',
        nome: 'Four Square National Park',
        data: '2026-12-06',
        date: '2026-12-06',
        indirizzo: '15 Carroll St, National Park, NZ',
        coordinate: { lat: -39.1769, lng: 175.4021 },
        createdAt: 1,
        updatedAt: 1,
      }],
      trasporti: [{
        id: 'tr-1',
        type: 'transfer',
        carrier: 'Taxi Wellington',
        date: '2026-12-06',
        departureTime: '10:00',
        departureLocation: 'Wellington Station',
        arrivalLocation: 'Wellington Airport',
        coordinate: { lat: -41.279, lng: 174.78 },
        dropoffCoordinate: { lat: -41.327, lng: 174.805 },
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'tr-flight',
        type: 'volo',
        carrier: 'Air NZ',
        flightNumber: 'NZ1',
        date: '2026-12-06',
        departureTime: '14:00',
        arrivalTime: '22:00',
        departureLocation: 'Auckland Airport (AKL)',
        arrivalLocation: 'Wellington Airport (WLG)',
        coordinate: { lat: -37.0082, lng: 174.785 },
        dropoffCoordinate: { lat: -41.3272, lng: 174.8052 },
        layover: {
          airport: 'Singapore Changi (SIN)',
          city: 'Singapore',
          coordinate: { lat: 1.3644, lng: 103.9915 },
        },
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      }],
    };

    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
    await ctx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test Geo Resolver', startDate: '2026-12-06', endDate: '2026-12-07' }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    await page.route('**/*firestore.googleapis.com*/**', (r) => r.abort());
    const photonRequests = [];
    await page.route('https://photon.komoot.io/**', (route) => {
      photonRequests.push(route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{
            geometry: { coordinates: [174.777, -41.288] },
            properties: { name: 'Cuba Street Market', street: 'Cuba Street', city: 'Wellington', country: 'New Zealand', type: 'mall' },
          }],
        }),
      });
    });
    page.setDefaultTimeout(8000);

    await page.goto('http://127.0.0.1:5206/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5206/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 1. Verifica che i fronti delle card aprano le coordinate reali (non solo il testo!)
    const mapHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="google.com/maps"]')).map((a) => a.getAttribute('href'))
    );
    assert.ok(mapHrefs.some((h) => h.includes('-41.2960371,174.7943249')), `Tappa fronte usa coordinate: ${JSON.stringify(mapHrefs)}`);
    assert.ok(mapHrefs.some((h) => h.includes('-39.1769,175.4021')), `Shopping fronte usa coordinate: ${JSON.stringify(mapHrefs)}`);
    assert.ok(mapHrefs.some((h) => h.includes('-41.279,174.78')), `Trasporto fronte usa coordinate partenza: ${JSON.stringify(mapHrefs)}`);
    assert.ok(mapHrefs.some((h) => h.includes('-37.0082,174.785')), `Volo fronte usa coordinate partenza: ${JSON.stringify(mapHrefs)}`);

    // 1b. Verifica separata di partenza, arrivo, scalo e ritiro/riconsegna tramite getTransportMapTargets
    const transportTargets = await page.evaluate(async () => {
      const { getTransportMapTargets } = await import('/src/utils/mapsHelper.ts');
      const flightTargets = getTransportMapTargets({
        id: 'tr-flight',
        type: 'volo',
        carrier: 'Air NZ',
        date: '2026-12-06',
        departureTime: '14:00',
        departureLocation: 'Auckland Airport (AKL)',
        arrivalLocation: 'Wellington Airport (WLG)',
        coordinate: { lat: -37.0082, lng: 174.785 },
        dropoffCoordinate: { lat: -41.3272, lng: 174.8052 },
        layover: { airport: 'Singapore Changi (SIN)', city: 'Singapore', coordinate: { lat: 1.3644, lng: 103.9915 } },
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      });
      const rentalTargets = getTransportMapTargets({
        id: 'tr-car',
        type: 'auto',
        carrier: 'Apex',
        date: '2026-12-06',
        departureTime: '09:00',
        departureLocation: 'Auckland City',
        pickupLocation: 'Auckland City Depot',
        dropoffLocation: 'Wellington Ferry Terminal',
        coordinate: { lat: -36.8485, lng: 174.7633 },
        dropoffCoordinate: { lat: -41.2788, lng: 174.7834 },
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      });
      return { flightTargets, rentalTargets };
    });
    assert.ok(transportTargets.flightTargets.departureUrl?.includes('-37.0082,174.785'), `Volo departureUrl: ${transportTargets.flightTargets.departureUrl}`);
    assert.ok(transportTargets.flightTargets.arrivalUrl?.includes('-41.3272,174.8052'), `Volo arrivalUrl: ${transportTargets.flightTargets.arrivalUrl}`);
    assert.ok(transportTargets.flightTargets.layoverUrl?.includes('1.3644,103.9915'), `Volo layoverUrl: ${transportTargets.flightTargets.layoverUrl}`);
    assert.ok(transportTargets.rentalTargets.pickupUrl?.includes('-36.8485,174.7633'), `Auto pickupUrl: ${transportTargets.rentalTargets.pickupUrl}`);
    assert.ok(transportTargets.rentalTargets.dropoffUrl?.includes('-41.2788,174.7834'), `Auto dropoffUrl: ${transportTargets.rentalTargets.dropoffUrl}`);

    // 2. Verifica bias geografico per data su ShoppingForm + omonimo locale non nasconde Photon + persistenza offline
    await page.locator('h3:visible').filter({ hasText: 'Four Square National Park' }).first().click();
    await page.waitForTimeout(250);
    const nomeInput = page.locator('input[placeholder*="Queenstown Mall"]');
    await nomeInput.fill('Cuba Street');
    await page.waitForTimeout(450);
    assert.ok(photonRequests.some((u) => u.includes('lat=-41.2865') && u.includes('lon=174.7762')), `Photon usa biasCoord della data (Wellington): ${JSON.stringify(photonRequests)}`);

    // Verifica che l'omonimo locale senza coordinate NON nasconda il risultato Photon corretto (Wellington)
    const photonOption = page.locator('button:visible').filter({ hasText: 'Wellington, New Zealand' }).first();
    await photonOption.waitFor({ state: 'visible', timeout: 3000 });
    await photonOption.click();
    await page.waitForTimeout(200);

    // Salva la card e verifica persistenza dopo reload offline
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForTimeout(350);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const persistedShop = await page.evaluate(
      ({ dbName }) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open(dbName, 8);
          req.onsuccess = (ev) => {
            const db = ev.target.result;
            const tx = db.transaction('shopping', 'readonly');
            const g = tx.objectStore('shopping').get('shop-1');
            g.onsuccess = () => resolve(g.result);
            g.onerror = () => reject(g.error);
          };
          req.onerror = () => reject(req.error);
        }),
      { dbName: DB_NAME }
    );
    assert.ok(
      persistedShop && persistedShop.coordinate && Math.abs(persistedShop.coordinate.lat - (-41.288)) < 0.001 && Math.abs(persistedShop.coordinate.lng - 174.777) < 0.001,
      `Coordinate salvate e persistenti offline: ${JSON.stringify(persistedShop)}`
    );

    const mapHrefsAfterReload = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="google.com/maps"]')).map((a) => a.getAttribute('href'))
    );
    assert.ok(mapHrefsAfterReload.some((h) => h.includes('-41.288,174.777')), `Dopo reload offline la card apre le nuove coordinate: ${JSON.stringify(mapHrefsAfterReload)}`);

    console.log('✓ [PASS] Resolver geografico condiviso fronte/dettaglio, trasporto (partenza/arrivo/scalo), omonimi locali, Photon bias per data e persistenza offline');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('❌ [FAIL]', err);
  process.exit(1);
});
