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
    server: { host: '127.0.0.1', port: 5202, strictPort: true },
  });
  await server.listen();

  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}),
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'synth-transport-1726';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FIXTURES = {
      giorni: [{ id: 'day-1', date: '2026-12-01', title: 'Giorno 1', location: 'Roma', createdAt: 1, updatedAt: 1 }],
      attivita: [],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      trasporti: [
        ...['traghetto','auto','camper','transfer','taxi','metro'].map((type, n) => ({
          id: 'tr-compact-' + type, type, carrier: 'Test compatto ' + type,
          date: '2026-12-01', departureTime: '11:00', departureLocation: 'Roma',
          arrivalDate: '2026-12-01', arrivalTime: '12:00', arrivalLocation: 'Milano',
          ...(['auto','camper'].includes(type) ? {dropoffLocation:'Milano',dropoffDate:'2026-12-03',dropoffTime:'12:00'} : {}),
          terminalGate: 'Punto 7', posti: 'Valore posti/modello', bookingCode: 'REF-' + n,
          checkinOpen: 'Info orario', checkinCutoff: '10:30', bagagli: 'Due valigie',
          veicolo: 'Veicolo legacy', assicurazione: 'Copertura legacy', cauzione: '100 EUR',
          noteCopilota:'Nota legacy '+type, ticketUrl:'https://example.com/test-ticket',
          departureIata:'FCO', arrivalIata:'MXP', departureTimeZone:'Europe/Rome', dropoffTimeZone:'Europe/Rome',
          layover:{airport:'Bologna',iata:'BLQ',arrivalDate:'2026-12-01',arrivalTime:'11:30',departureDate:'2026-12-01',departureTime:'11:40',carrier:'Mezzo successivo',terminalGate:'Punto 2',duration:'10m',notes:'Nota sosta'},
          status:'prenotato', createdAt:1, updatedAt:1
        })),
        {
          id: 'tr-empty',
          type: 'volo',
          carrier: 'Test Vettore Vuoto',
          date: '2026-12-01',
          departureTime: '09:00',
          departureLocation: 'Roma',
          arrivalLocation: 'Milano',
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'tr-train-legacy',
          type: 'treno',
          carrier: 'Treno sintetico 9612',
          date: '2026-12-01',
          departureTime: '10:00',
          departureLocation: 'Roma Termini',
          arrivalDate: '2026-12-01',
          arrivalTime: '13:00',
          arrivalLocation: 'Milano Centrale',
          terminalGate: '4',
          posti: 'Car. 5 · 12A, 12B',
          bookingCode: 'TEST-TRAIN',
          noteCopilota: 'Nota treno sintetica',
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'tr-flight-full',
          type: 'volo',
          carrier: 'Air China CA950',
          bookingCode: 'PNR999',
          date: '2026-12-01',
          departureTime: '19:30',
          departureLocation: 'Roma Fiumicino',
          departureIata: 'FCO',
          arrivalDate: '2026-12-02',
          arrivalTime: '12:45',
          arrivalLocation: 'Auckland',
          arrivalIata: 'AKL',
          terminalGate: 'T3 Gate E12',
          checkinCutoff: '17:30',
          posti: '14A, 14B',
          bagagli: '2x23kg stiva',
          layover: { airport: 'PEK', duration: '2h 15m' },
          cost: '1200',
          ticketUrl: 'https://example.com/boarding-pass',
          noteCopilota: 'Check-in online 24h prima',
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const ctx = await browser.newContext({ viewport: { width: Number(process.env.TRANSPORT_TEST_WIDTH || 1280), height: Number(process.env.TRANSPORT_TEST_HEIGHT || 800) }, serviceWorkers: 'block' });
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
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test Trasporti', startDate: '2026-12-01', endDate: '2026-12-10' }));
      localStorage.setItem('houni_verified_trip_auth', JSON.stringify({ tripId, role: 'owner', verifiedAt: Date.now() }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    page.setDefaultTimeout(8000);
    await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 1. Apri il retro della card vuota (Test Vettore Vuoto) direttamente da OggiView e verifica tutte le sottocategorie
    await page.locator('h3:visible').filter({ hasText: 'Test Vettore Vuoto' }).first().click();

    const form = page.getByTestId('trasporto-form');
    await form.waitFor({ state: 'visible' });

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Nessun overflow orizzontale nel retro card');
    // Aereo (default 1.7.29: blocco principale compatto + dettagli volo collassati + quadro economico sempre aperto + icone condivise)
    assert.equal(await page.getByTestId('flight-back-layout').isVisible(), true, 'Aereo: layout dedicato visibile');
    assert.equal(await page.getByTestId('flight-finance-always-open').isVisible(), true, 'Aereo: quadro economico sempre aperto');
    assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, 'Aereo: terminalGate visibile');
    assert.equal(await page.getByTestId('add-layover-btn').isVisible(), true, 'Aereo: + Aggiungi scalo visibile');
    assert.equal(await page.getByTestId('flight-action-pnr').isVisible(), true, 'Aereo: icona PNR condivisa visibile');
    assert.equal(await page.getByTestId('flight-action-bagagli').isVisible(), true, 'Aereo: icona Bagagli condivisa visibile');
    assert.equal(await page.getByTestId('flight-action-tickets').isVisible(), true, 'Aereo: icona Biglietti condivisa visibile');
    await page.getByTestId('toggle-flight-details').click();
    assert.equal(await page.getByTestId('field-checkinOpen').isVisible(), true, 'Aereo: checkinOpen nei dettagli espandibili');
    assert.equal(await page.getByTestId('field-checkinCutoff').isVisible(), true, 'Aereo: checkinCutoff nei dettagli espandibili');
    assert.equal(await page.getByTestId('field-posti').isVisible(), true, 'Aereo: posti nei dettagli espandibili');
    await page.getByTestId('toggle-flight-details').click();
    const flightHeight = (await form.boundingBox()).height;

    // Treno (su Aereo il selettore sottocategoria è compatto accanto a Compagnia)
    await page.getByTestId('flight-subcategory-select').selectOption('treno');
    assert.equal(await page.getByTestId('field-departureIata').count(), 0, 'Treno: IATA nascosto se vuoto');
    assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, 'Treno: Binario visibile');
    assert.equal(await page.getByTestId('field-posti').isVisible(), true, 'Treno: posti visibili');
    assert.equal(await page.getByTestId('field-carrozza').isVisible(), true, 'Treno: carrozza separata');
    assert.equal(await page.getByTestId('train-finance-always-open').isVisible(), true);
    assert.equal(await page.getByTestId('toggle-train-notes').getAttribute('aria-expanded'), 'false');
    const coach = page.getByRole('textbox', {name:'Carrozza', exact:true});
    const seats = page.getByRole('textbox', {name:'Posti', exact:true});
    await coach.fill('5');
    await seats.fill('12A, 12B');
    assert.equal(await coach.inputValue(), '5');
    assert.equal(await seats.inputValue(), '12A, 12B');
    await coach.fill('');
    await seats.fill('');
    assert.equal(await coach.inputValue(), '');
    assert.equal(await seats.inputValue(), '');
    assert.equal(await page.getByTestId('field-bagagli').count(), 0, 'Treno: bagagli nascosto se vuoto');
    assert.equal(await page.getByTestId('field-layover').count(), 0, 'Treno: layover nascosto se vuoto');
    const trainHeight = (await form.boundingBox()).height;
    assert.ok(trainHeight > 0, `Treno (${trainHeight}px) renderizzato correttamente`);

    // Traghetto
    await page.getByTestId('train-subcategory-select').selectOption('traghetto');
    assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, 'Traghetto: Molo/Imbarco visibile');
    assert.equal(await page.getByTestId('field-checkinCutoff').isVisible(), true, 'Traghetto: Imbarco entro visibile');
    assert.equal(await page.getByTestId('field-posti').isVisible(), true, 'Traghetto: Cabina/Posto visibile');
    assert.equal(await page.getByTestId('field-veicolo').isVisible(), true, 'Traghetto: Veicolo a bordo visibile');

    // Auto & Camper
    for (const rentalType of ['auto', 'camper']) {
      await page.getByTestId('transport-subcategory-select').selectOption(rentalType);
      assert.equal(await page.getByTestId('field-posti').isVisible(), true, `${rentalType}: Modello/Veicolo visibile`);
      assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, `${rentalType}: Desk/Ufficio visibile`);
      assert.equal(await page.getByTestId('field-assicurazione').isVisible(), true, `${rentalType}: Assicurazione visibile`);
      assert.equal(await page.getByTestId('field-cauzione').isVisible(), true, `${rentalType}: Deposito/Cauzione visibile`);
    }

    // Transfer / Bus
    await page.getByTestId('transport-subcategory-select').selectOption('transfer');
    assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, 'Transfer: Fermata visibile');
    assert.equal(await page.getByTestId('transport-action-bagagli').isVisible(), true, 'Transfer: Bagagli accessibili');
    assert.equal(await page.getByTestId('field-posti').isVisible(), true, 'Transfer: Posti visibili');

    // Taxi & Metro (compatti senza campi operativi vuoti)
    for (const compactType of ['taxi', 'metro']) {
      await page.getByTestId('transport-subcategory-select').selectOption(compactType);
      assert.equal(await page.getByTestId('transport-primary-fields').count(), compactType === 'metro' ? 1 : 0, `${compactType}: soli campi operativi pertinenti`);
      assert.equal(await page.getByTestId('field-bookingCode').count(), 0, `${compactType}: bookingCode nascosto se vuoto`);
      const compactHeight = (await form.boundingBox()).height;
      assert.ok(compactHeight < trainHeight, `${compactType} (${compactHeight}px) più compatto di Treno (${trainHeight}px)`);
    }

    // Verifica apertura sezioni espandibili
    await page.getByTestId('toggle-secondary-details').click();
    assert.equal(await page.getByTestId('field-checkinCutoff').isVisible(), true, 'Dettagli secondari espandibili');
    assert.equal(await page.getByTestId('transport-finance-always-open').isVisible(), true, 'Quadro economico sempre aperto');
    assert.equal(await page.getByTestId('toggle-transport-notes').getAttribute('aria-expanded'), 'false');

    // Chiudi nuovo form
    await page.locator('button:has-text("Annulla")').first().click();
    await page.waitForTimeout(250);

    // 2. Apri la card volo precompilata e cambia sottocategoria in Taxi: zero campi persi!
    await page.locator('h3:visible').filter({ hasText: 'Air China CA950' }).first().click();
    await form.waitFor({ state: 'visible' });
    await page.getByTestId('flight-subcategory-select').selectOption('taxi');

    await page.getByTestId('toggle-secondary-details').click();
    assert.equal(await page.getByTestId('field-departureIata').isVisible(), true, 'IATA partenza già compilato accessibile su Taxi');
    assert.equal(await page.getByTestId('transport-action-bagagli').isVisible(), true, 'Bagagli già compilati accessibili su Taxi');
    assert.equal(await page.getByTestId('field-layover').isVisible(), true, 'Scalo già compilato resta visibile su Taxi');
    assert.equal(await page.getByTestId('field-posti').isVisible(), true, 'Posti già compilati restano visibili su Taxi');
    assert.equal(await page.getByTestId('field-terminalGate').isVisible(), true, 'Terminal già compilato resta visibile su Taxi');
    assert.equal(await page.getByTestId('field-checkinCutoff').isVisible(), true, 'Check-in già compilato resta visibile su Taxi');

    // Salva e verifica in IndexedDB che nulla sia stato distrutto
    await page.locator('button:has-text("Aggiorna")').first().click();
    await page.waitForTimeout(400);
    const saved = await readTransportFromDb(page, DB_NAME, 'tr-flight-full');
    assert.equal(saved.type, 'taxi');
    assert.equal(saved.departureIata, 'FCO');
    assert.equal(saved.arrivalIata, 'AKL');
    assert.equal(saved.bagagli, '2x23kg stiva');
    assert.equal(saved.posti, '14A, 14B');
    assert.equal(saved.terminalGate, 'T3 Gate E12');
    assert.equal(saved.checkinCutoff, '17:30');
    assert.equal(saved.layover?.airport, 'PEK');
    assert.equal(saved.ticketUrl, 'https://example.com/boarding-pass');
    assert.equal(saved.noteCopilota, 'Check-in online 24h prima');

    // Train-specific persistence, with legacy seat data and one connection.
    await page.locator('h3:visible').filter({hasText:'Treno sintetico 9612'}).first().click();
    await page.getByTestId('train-back-layout').waitFor({state:'visible'});
    const coachEdit = page.getByRole('textbox', {name:'Carrozza', exact:true});
    const seatsEdit = page.getByRole('textbox', {name:'Posti', exact:true});
    assert.equal(await coachEdit.inputValue(),'5');
    assert.equal(await seatsEdit.inputValue(),'12A, 12B');
    await coachEdit.fill('8');
    await seatsEdit.fill('21A, ');
    assert.equal(await seatsEdit.inputValue(),'21A, ', 'Spazi durante la digitazione preservati');
    await seatsEdit.fill('21A, 21B');
    await page.getByTestId('train-action-pnr').click();
    assert.equal(await page.getByTestId('pnr-modal-input').inputValue(),'TEST-TRAIN');
    await page.locator('button:has-text("Fatto")').last().click();
    await page.getByTestId('add-train-change').click();
    const change = page.getByTestId('train-change');
    await change.getByPlaceholder('es. Bologna Centrale').fill('Bologna Centrale');
    await change.getByPlaceholder('es. FR 9520').fill('FR 9520');
    await page.locator('button:has-text("Aggiorna")').first().click();
    await page.waitForTimeout(400);
    const trainSaved = await readTransportFromDb(page, DB_NAME, 'tr-train-legacy');
    assert.equal(trainSaved.posti,'Carrozza: 8 · Posti: 21A, 21B');
    assert.equal(trainSaved.terminalGate,'4');
    assert.equal(trainSaved.departureTimeZone,'Europe/Rome');
    assert.equal(trainSaved.dropoffTimeZone,'Europe/Rome');
    assert.equal(trainSaved.noteCopilota,'Nota treno sintetica');
    assert.equal(trainSaved.layover?.airport,'Bologna Centrale');
    assert.equal(trainSaved.layover?.carrier,'FR 9520');
    await page.locator('h3:visible').filter({hasText:'Treno sintetico 9612'}).first().click();
    await page.getByTestId('train-back-layout').waitFor({state:'visible'});
    assert.equal(await coachEdit.inputValue(),'8');
    assert.equal(await seatsEdit.inputValue(),'21A, 21B');
    await page.locator('button:has-text("Annulla")').first().click();

    for (const type of ['traghetto','auto','camper','transfer','taxi','metro']) {
      await page.locator('h3:visible').filter({hasText:'Test compatto '+type}).first().click();
      await page.getByTestId('transport-back-layout').waitFor({state:'visible'});
      assert.equal(await page.getByTestId('transport-subcategory-select').inputValue(),type);
      assert.equal(await page.getByTestId('transport-finance-always-open').isVisible(),true);
      assert.equal(await page.getByTestId('toggle-transport-notes').getAttribute('aria-expanded'),'false');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,type+': overflow');
      await page.getByTestId('toggle-secondary-details').click();
      assert.equal(await page.getByTestId('field-departureIata').locator('input').inputValue(),'FCO');
      await page.getByTestId('transport-action-pnr').click();
      assert.ok((await page.getByTestId('pnr-modal-input').inputValue()).startsWith('REF-'));
      await page.locator('button:has-text("Fatto")').last().click();
      await page.getByTestId('toggle-transport-stop').click();
      assert.equal(await page.getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Nota sosta');
      await page.getByTestId('toggle-transport-notes').click();
      await page.getByRole('textbox',{name:'Note Copilota',exact:true}).fill('Nota aggiornata '+type);
      await page.getByTestId('toggle-transport-notes').click();
      await page.locator('button:has-text("Aggiorna")').first().click();
      await page.waitForTimeout(400);
      const actual = await readTransportFromDb(page, DB_NAME, 'tr-compact-'+type);
      const expected = FIXTURES.trasporti.find(x=>x.id==='tr-compact-'+type);
      for (const key of ['type','carrier','bookingCode','terminalGate','posti','checkinOpen','checkinCutoff','bagagli','veicolo','assicurazione','cauzione','ticketUrl','departureIata','arrivalIata','departureTimeZone','dropoffTimeZone']) assert.equal(actual[key],expected[key],type+': preserva '+key);
      for (const [key,value] of Object.entries(expected.layover)) assert.equal(actual.layover[key],value,type+': preserva sosta '+key);
      if (['auto','camper'].includes(type)) for (const key of ['dropoffLocation','dropoffDate','dropoffTime']) assert.equal(actual[key],expected[key],type+': preserva riconsegna '+key);
      assert.equal(actual.noteCopilota,'Nota aggiornata '+type);
    }

    console.log('✓ [PASS] Audit e test E2E sottocategorie retro card Trasporti (volo/treno/traghetto/auto/camper/transfer/taxi/metro) + cambio mezzo senza perdita dati');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('❌ [FAIL]', err);
  process.exit(1);
});
