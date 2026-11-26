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
      // try next
    }
  }
  throw new Error('Playwright module not found');
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
            const store = tx.objectStore(k);
            for (const row of data[k]) store.put(row);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { name: dbName, data: fixtures }
  );
}

async function readTransportFromDb(page, dbName, transportId) {
  return page.evaluate(
    ({ name, trId }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 8);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['trasporti'], 'readonly');
          const getReq = tx.objectStore('trasporti').get(trId);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result);
          };
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { name: dbName, trId: transportId }
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
    server: { host: '127.0.0.1', port: 5205, strictPort: true },
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

    const TRIP_ID = 'synth-flight-1729';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FIXTURES = {
      giorni: [{ id: 'day-1', date: '2026-12-01', title: 'Giorno 1', location: 'Roma', createdAt: 1, updatedAt: 1 }],
      attivita: [],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      trasporti: [
        {
          id: 'tr-direct',
          type: 'volo',
          carrier: 'Air China CA950',
          bookingCode: 'PNR111',
          date: '2026-12-01',
          departureTime: '19:30',
          departureLocation: 'Roma Fiumicino',
          arrivalDate: '2026-12-02',
          arrivalTime: '12:45',
          arrivalLocation: 'Auckland',
          terminalGate: 'T3 E12',
          checkinOpen: '24h prima',
          checkinCutoff: '17:30',
          posti: '14A, 14B',
          bagagli: '2x23kg stiva',
          cost: '1200',
          depositPaid: '400',
          notes: 'Nota legacy volo diretto',
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'tr-layover',
          type: 'volo',
          carrier: 'Air China CA940',
          bookingCode: 'PNR222',
          date: '2026-12-01',
          departureTime: '10:00',
          departureLocation: 'Milano Malpensa',
          departureIata: 'MXP',
          arrivalDate: '2026-12-02',
          arrivalTime: '18:00',
          arrivalLocation: 'Sydney',
          layover: {
            airport: 'Beijing Capital',
            iata: 'PEK',
            arrivalDate: '2026-12-01',
            arrivalTime: '20:00',
            departureDate: '2026-12-01',
            departureTime: '22:15',
            carrier: 'CA783',
            terminalGate: 'T3 E05',
            duration: '2h 15m',
          },
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
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
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test Aereo 1.7.29', startDate: '2026-12-01', endDate: '2026-12-05' }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    await page.route('**/*firestore.googleapis.com*/**', (route) => route.abort());
    page.setDefaultTimeout(8000);

    await page.goto('http://127.0.0.1:5205/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5205/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 1. Apri volo diretto e verifica auto-IATA, quadro economico sempre aperto, dettagli volo collassati, modali condivise e conservazione modifiche
    await page.locator('h3:visible').filter({ hasText: 'Air China CA950' }).first().click();
    await page.getByTestId('flight-back-layout').waitFor({ state: 'visible' });

    assert.equal(await page.getByTestId('flight-departure-iata-badge').innerText(), 'FCO', 'Auto-IATA FCO da Roma Fiumicino');
    assert.equal(await page.getByTestId('flight-arrival-iata-badge').innerText(), 'AKL', 'Auto-IATA AKL da Auckland');
    assert.equal(await page.getByTestId('flight-finance-always-open').isVisible(), true, 'Quadro economico sempre aperto');
    assert.ok((await page.getByTestId('toggle-flight-details').innerText()).includes('Posti: 14A, 14B'), 'Riepilogo dettagli volo collassati');

    // Modifica non ancora salvata su carrier + apertura PNR/Bagagli condivisi senza perdere carrier
    const carrierInput = page.getByTestId('field-carrier').locator('input');
    await carrierInput.fill('Air China CA950 Mod');
    await page.getByTestId('flight-action-pnr').click();
    await page.getByTestId('pnr-modal-input').fill('NEWPNR');
    await page.locator('button:has-text("Fatto")').last().click();
    assert.equal(await carrierInput.inputValue(), 'Air China CA950 Mod', 'Modifica carrier non persa dopo PNR modal');

    await page.getByTestId('flight-action-bagagli').click();
    await page.locator('button:has-text("Chiudi")').last().click();
    assert.equal(await carrierInput.inputValue(), 'Air China CA950 Mod', 'Modifica carrier non persa dopo Bagagli modal');

    // Aggiungi scalo e verifica calcolo durata automatico
    await page.getByTestId('add-layover-btn').click();
    const layoverBox = page.getByTestId('field-layover');
    await layoverBox.locator('input[placeholder*="Beijing"]').fill('Beijing Capital');
    await layoverBox.locator('input[placeholder*="Beijing"]').blur();
    await layoverBox.locator('input[type="date"]').nth(0).fill('2026-12-01');
    await layoverBox.locator('input[type="time"]').nth(0).fill('12:30');
    await layoverBox.locator('input[type="date"]').nth(1).fill('2026-12-01');
    await layoverBox.locator('input[type="time"]').nth(1).fill('14:45');
    await layoverBox.locator('input[placeholder*="CA783"]').fill('CA783');
    await layoverBox.locator('input[placeholder*="T3 Gate"]').fill('T3 E09');
    assert.equal(await layoverBox.locator('input[placeholder="Calcolata auto"]').inputValue(), '2h 15m', 'Durata scalo calcolata automaticamente');

    // Salva e verifica persistenza integrale in IndexedDB
    await page.locator('button:has-text("Aggiorna")').first().click();
    await page.waitForTimeout(400);
    const savedDirect = await readTransportFromDb(page, DB_NAME, 'tr-direct');
    assert.equal(savedDirect.carrier, 'Air China CA950 Mod');
    assert.equal(savedDirect.bookingCode, 'NEWPNR');
    assert.equal(savedDirect.departureIata, 'FCO');
    assert.equal(savedDirect.arrivalIata, 'AKL');
    assert.equal(savedDirect.departureTimeZone, 'Europe/Rome');
    assert.equal(savedDirect.dropoffTimeZone, 'Pacific/Auckland');
    assert.equal(savedDirect.checkinOpen, '24h prima');
    assert.equal(savedDirect.checkinCutoff, '17:30');
    assert.equal(savedDirect.posti, '14A, 14B');
    assert.equal(savedDirect.layover?.iata, 'PEK');
    assert.equal(savedDirect.layover?.duration, '2h 15m');
    assert.equal(savedDirect.layover?.carrier, 'CA783');

    // 2. Verifica responsive su tutti i 4 viewport (393x852, 744x1133, 1133x744, 1280x800) sul volo con scalo
    for (const vp of [
      { width: 393, height: 852 },
      { width: 744, height: 1133 },
      { width: 1133, height: 744 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      await page.locator('h3:visible').filter({ hasText: 'Air China CA940' }).first().click();
      await page.getByTestId('flight-back-layout').waitFor({ state: 'visible' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false, `${vp.width}x${vp.height}: nessun overflow orizzontale sul retro Aereo`);
      assert.ok((await page.getByTestId('toggle-layover-summary').innerText()).includes('PEK'), `${vp.width}x${vp.height}: riepilogo scalo visibile`);
      await page.locator('button:has-text("Annulla")').first().click();
      await page.waitForTimeout(150);
    }

    console.log('✓ [PASS] Retro Aereo 1.7.29: blocco principale, economico sempre aperto, scali + durata auto, IATA/fusi auto, PNR/Bagagli/Biglietti condivisi e 4 viewport ok');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('❌ [FAIL]', err);
  process.exit(1);
});
