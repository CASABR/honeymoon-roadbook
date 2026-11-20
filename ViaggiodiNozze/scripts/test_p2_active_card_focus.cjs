const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
const ts = require(path.join(projectRoot, 'node_modules/typescript'));

function resolvePlaywright() {
  for (const candidate of [
    'playwright',
    path.resolve(projectRoot, 'node_modules/playwright'),
    path.resolve(projectRoot, '../node_modules/playwright'),
  ]) {
    try {
      return require(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function loadTsGraph(entryRelPath, mocks = {}) {
  const cache = new Map();
  function loadFile(absPath) {
    const normalized = path.normalize(absPath);
    if (cache.has(normalized)) return cache.get(normalized).exports;
    const mod = { exports: {} };
    cache.set(normalized, mod);
    const src = fs.readFileSync(normalized, 'utf8');
    const transpiled = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const fn = new Function('require', 'module', 'exports', transpiled.outputText);
    fn((id) => {
      if (mocks[id]) return mocks[id];
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(normalized), id);
        for (const ext of ['', '.ts', '.tsx', '.js']) {
          if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
            return loadFile(base + ext);
          }
        }
      }
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  }
  return loadFile(path.join(projectRoot, entryRelPath));
}

function runUnitTests() {
  const focus = loadTsGraph('src/utils/dayFocusPriority.ts');
  let passed = 0;
  const check = (name, fn) => { fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };

  check('1. Prima dell inizio viaggio: nessun salto ne evidenziazione', () => {
    const res = focus.resolveTripActiveCard(
      [{ id: 'a1', type: 'attivita', time: '09:00', timeStatus: 'confermato', title: 'Test', location: 'MXP', categoryOrType: 'visita' }],
      '2026-11-28',
      {
        now: new Date(Date.UTC(2026, 10, 20, 11, 0, 0)),
        tripStartDate: '2026-11-28',
        tripEndDate: '2027-01-10',
        activeTimeZone: 'Europe/Rome',
      },
    );
    assert.equal(res.isBeforeTrip, true);
    assert.equal(res.isDuringTrip, false);
    assert.equal(res.defaultSelectedDate, '2026-11-28');
    assert.equal(res.activeItemId, null);
    assert.equal(res.scrollItemId, null);
    assert.equal(res.reason, 'before_trip');
  });

  check('2. Durante il viaggio: seleziona giorno locale corretto e evidenzia card in corso su fuso Pechino', () => {
    const res = focus.resolveTripActiveCard(
      [
        {
          id: 'trn_ca950', type: 'trasporto', time: '05:30', title: 'Arrivo PEK', location: 'PEK', categoryOrType: 'volo',
          originalData: { id: 'trn_ca950', type: 'volo', departureLocation: 'Pechino PEK', departureTimeZone: 'Asia/Shanghai', status: 'prenotato' },
        },
        {
          id: 'att_mutianyu', type: 'attivita', time: '08:30', timeStatus: 'confermato', title: 'Mutianyu', location: 'Mutianyu', categoryOrType: 'natura',
          originalData: { id: 'att_mutianyu', duration: '4h', timeStatus: 'confermato', coordinate: { lat: 40.4319, lng: 116.5704 } },
        },
        {
          id: 'tappa_pm', type: 'tappa', time: '14:00', timeStatus: 'indicativo', title: 'Piazza', location: 'Pechino', categoryOrType: 'Tappa',
          originalData: { id: 'tappa_pm', timeStatus: 'indicativo', indirizzo: 'Pechino' },
        },
      ],
      '2026-11-30',
      {
        now: new Date(Date.UTC(2026, 10, 30, 1, 30, 0)),
        tripStartDate: '2026-11-28',
        tripEndDate: '2027-01-10',
        activeTimeZone: 'Asia/Shanghai',
      },
    );
    assert.equal(res.isDuringTrip, true);
    assert.equal(res.localTodayStr, '2026-11-30');
    assert.equal(res.activeItemId, 'att_mutianyu');
    assert.equal(res.scrollItemId, 'att_mutianyu');
    assert.equal(res.reason, 'ongoing_or_imminent');
  });

  check('3. Giorno con cambio fuso (PEK -> AKL): rispetta fuso di ciascuna card e preferisce orari confermati', () => {
    const res = focus.resolveTripActiveCard(
      [
        {
          id: 'trn_pek_akl', type: 'trasporto', time: '01:05', title: 'Volo CA783', location: 'PEK -> AKL', categoryOrType: 'volo',
          originalData: { id: 'trn_pek_akl', type: 'volo', departureIata: 'PEK', departureLocation: 'Pechino PEK', status: 'prenotato' },
        },
        {
          id: 'tap_ind', type: 'tappa', time: '18:20', timeStatus: 'indicativo', title: 'Passeggiata indicativa', location: 'Auckland', categoryOrType: 'Tappa',
          originalData: { id: 'tap_ind', timeStatus: 'indicativo', indirizzo: 'Auckland' },
        },
        {
          id: 'act_conf', type: 'attivita', time: '18:35', timeStatus: 'confermato', title: 'Cena Sky Tower', location: 'Auckland', categoryOrType: 'cibo',
          originalData: { id: 'act_conf', timeStatus: 'confermato', coordinate: { lat: -36.8485, lng: 174.7633 } },
        },
      ],
      '2026-12-01',
      {
        now: new Date(Date.UTC(2026, 11, 1, 5, 0, 0)),
        tripStartDate: '2026-11-28',
        tripEndDate: '2027-01-10',
        activeTimeZone: 'Pacific/Auckland',
      },
    );
    assert.equal(res.activeItemId, 'act_conf', 'Deve ignorare CA783 gia partito e preferire card confermata entro 25m');
    assert.equal(res.reason, 'upcoming');
  });

  check('4. Navigazione su altro giorno durante il viaggio: non evidenzia ne forza scroll', () => {
    const res = focus.resolveTripActiveCard(
      [{ id: 'x1', type: 'attivita', time: '10:00', timeStatus: 'confermato', title: 'X', location: 'Auckland', categoryOrType: 'visita' }],
      '2026-12-05',
      {
        now: new Date(Date.UTC(2026, 11, 1, 5, 0, 0)),
        tripStartDate: '2026-11-28',
        tripEndDate: '2027-01-10',
        activeTimeZone: 'Pacific/Auckland',
      },
    );
    assert.equal(res.isDuringTrip, true);
    assert.equal(res.isCurrentDay, false);
    assert.equal(res.activeItemId, null);
    assert.equal(res.scrollItemId, null);
    assert.equal(res.reason, 'other_day');
  });

  return passed;
}

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
    { name: dbName, data: fixtures },
  );
}

async function runBrowserTests() {
  const pw = resolvePlaywright();
  const distIndex = path.join(projectRoot, 'dist/index.html');
  if (!pw || !fs.existsSync(distIndex)) {
    throw new Error('Playwright o dist mancante per verifica E2E P2');
  }
  const { chromium } = pw;
  const { preview } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await preview({
    root: projectRoot,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5202, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'synth-p2-active-trip';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FIXTURES = {
      giorni: [
        { id: 'd1', date: '2026-11-28', title: 'Partenza Milano', location: 'Milano', createdAt: 1, updatedAt: 1 },
        { id: 'd6', date: '2026-12-03', title: 'Hobbiton & Rotorua', location: 'Rotorua', createdAt: 1, updatedAt: 1 },
        { id: 'd7', date: '2026-12-04', title: 'Wai-O-Tapu', location: 'Rotorua', createdAt: 1, updatedAt: 1 },
      ],
      attivita: [
        { id: 'pre_a1', dayId: 'day_2026-11-28', date: '2026-11-28', title: 'Colazione', time: '08:00', timeStatus: 'confermato', location: 'Milano', category: 'cibo', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'pre_a2', dayId: 'day_2026-11-28', date: '2026-11-28', title: 'Navetta Malpensa', time: '10:00', timeStatus: 'confermato', location: 'Malpensa', category: 'altro', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'pre_a3', dayId: 'day_2026-11-28', date: '2026-11-28', title: 'Check-in banco', time: '12:00', timeStatus: 'confermato', location: 'Malpensa', category: 'altro', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'pre_a4', dayId: 'day_2026-11-28', date: '2026-11-28', title: 'Imbarco gate', time: '15:00', timeStatus: 'confermato', location: 'Malpensa', category: 'altro', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'd6_01', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Colazione Rotorua', time: '08:00', timeStatus: 'confermato', location: 'Rotorua', category: 'cibo', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'd6_02', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Trasferimento Matamata', time: '09:30', timeStatus: 'confermato', location: 'Matamata', category: 'visita', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'd6_03', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Passeggiata lago', time: '11:00', timeStatus: 'indicativo', location: 'Rotorua', category: 'natura', status: 'libero', createdAt: 1, updatedAt: 1 },
        { id: 'd6_04', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Pranzo veloce', time: '12:30', timeStatus: 'indicativo', location: 'Matamata', category: 'cibo', status: 'libero', createdAt: 1, updatedAt: 1 },
        { id: 'd6_ind_1400', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Sosta foto indicativa', time: '14:00', timeStatus: 'indicativo', location: 'Hobbiton', category: 'visita', status: 'libero', createdAt: 1, updatedAt: 1 },
        { id: 'act_target_1425', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Tour Confermato Hobbiton', time: '14:25', orarioInizio: '14:25', timeStatus: 'confermato', timeZone: 'Pacific/Auckland', duration: '2h', location: 'Hobbiton Movie Set', category: 'visita', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'd6_07', dayId: 'day_2026-12-03', date: '2026-12-03', title: 'Te Pa Tu Serale', time: '18:30', timeStatus: 'confermato', timeZone: 'Pacific/Auckland', location: 'Rotorua', category: 'cultura', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'd7_01', dayId: 'day_2026-12-04', date: '2026-12-04', title: 'Parco Geotermico', time: '09:00', timeStatus: 'confermato', timeZone: 'Pacific/Auckland', location: 'Rotorua', category: 'natura', status: 'prenotato', createdAt: 1, updatedAt: 1 },
      ],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      trasporti: [],
    };

    const initAppStorage = ({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test P2 Viaggio', startDate: '2026-11-28', endDate: '2026-12-10' }));
    };

    // Caso E2E A: Prima dell'inizio del viaggio -> nessun salto né evidenziazione
    {
      const ctxPre = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
      await ctxPre.clock.install({ time: new Date('2026-11-20T12:00:00+01:00') });
      await ctxPre.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
      await ctxPre.addInitScript(initAppStorage, { tripId: TRIP_ID });
      const page = await ctxPre.newPage();
      const pageErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));

      await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
      await seedIndexedDB(page, DB_NAME, FIXTURES);
      await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#timeline-card-pre_a1', { timeout: 8000 });
      await page.waitForTimeout(600);

      const preState = await page.evaluate(() => {
        const mainEl = document.querySelector('[data-main-scroll-container]');
        const dateInput = document.querySelector('input[type="date"][aria-label="Scegli data dal calendario"]');
        return {
          scrollY: Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, mainEl?.scrollTop || 0),
          activeCount: document.querySelectorAll('[data-active-card="true"]').length,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          selectedDateVal: dateInput ? dateInput.value : '',
          body: document.body.innerText,
        };
      });
      assert.equal(pageErrors.length, 0, `Pre-trip pageErrors: ${pageErrors.join(' | ')}`);
      assert.equal(preState.scrollY, 0, 'Pre-viaggio NON deve scorrere automaticamente');
      assert.equal(preState.activeCount, 0, 'Pre-viaggio NON deve evidenziare nessuna card come attiva adesso');
      assert.equal(preState.overflow, false, 'Pre-viaggio senza overflow');
      assert.equal(preState.selectedDateVal, '2026-11-28', 'Pre-viaggio deve restare su giorno 1 (2026-11-28)');
      await Promise.race([ctxPre.close().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
      console.log('[PASS E2E A] Pre-viaggio: nessun salto automatico e nessuna falsa card attiva.');
    }

    // Caso E2E B: Durante il viaggio (2026-12-03 14:18 NZDT) -> seleziona giorno locale 3 Dic, scorre UNA volta a Hobbiton Confermato (14:25), evidenzia, non blocca navigazione manuale o modali
    {
      const ctxTrip = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: 'Pacific/Auckland', serviceWorkers: 'block' });
      await ctxTrip.clock.install({ time: new Date('2026-12-03T14:18:00+13:00') });
      await ctxTrip.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
      await ctxTrip.addInitScript(initAppStorage, { tripId: TRIP_ID });
      const page = await ctxTrip.newPage();
      const pageErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));

      await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
      await seedIndexedDB(page, DB_NAME, FIXTURES);
      await page.goto('http://127.0.0.1:5202/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#timeline-card-act_target_1425', { timeout: 8000 });
      await page.waitForTimeout(800);

      const tripState = await page.evaluate(() => {
        const card = document.getElementById('timeline-card-act_target_1425');
        const rect = card ? card.getBoundingClientRect() : null;
        const mainEl = document.querySelector('[data-main-scroll-container]');
        const dateInput = document.querySelector('input[type="date"][aria-label="Scegli data dal calendario"]');
        return {
          scrollY: Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, mainEl?.scrollTop || 0),
          activeAttr: card?.getAttribute('data-active-card'),
          activeTotal: document.querySelectorAll('[data-active-card="true"]').length,
          selectedDateVal: dateInput ? dateInput.value : '',
          cardTop: rect?.top ?? -1,
          cardBottom: rect?.bottom ?? -1,
          viewportHeight: window.innerHeight,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          body: document.body.innerText,
        };
      });

      assert.equal(pageErrors.length, 0, `Trip pageErrors: ${pageErrors.join(' | ')}`);
      assert.equal(tripState.selectedDateVal, '2026-12-03', 'Deve selezionare il giorno locale corrente 2026-12-03');
      assert.ok(tripState.body.includes('OGGI IN CORSO'), 'Deve mostrare badge OGGI IN CORSO');
      assert.equal(tripState.activeTotal, 1, 'Una sola card deve essere evidenziata');
      assert.equal(tripState.activeAttr, 'true', 'Deve evidenziare act_target_1425 confermata e non d6_ind_1400 indicativa');
      assert.ok(tripState.scrollY > 50, `Deve scorrere una volta alla card attiva (scrollY=${tripState.scrollY})`);
      assert.ok(tripState.cardTop >= -40 && tripState.cardBottom <= tripState.viewportHeight + 80, 'La card attiva deve essere centrata nella viewport');
      assert.equal(tripState.overflow, false, 'Nessun overflow orizzontale su 393px con card attiva');

      // Apertura modifica non deve essere interrotta né generare errori
      await page.locator('#timeline-card-act_target_1425').click();
      await page.waitForSelector('text=Dettagli Attività', { timeout: 5000 });
      await page.locator('button[aria-label="Chiudi"]').first().click().catch(async () => {
        await page.keyboard.press('Escape');
      });
      await page.waitForTimeout(200);

      // Navigazione manuale verso 4 Dic -> non deve tornare indietro ne evidenziare card
      const day4Btn = page.locator('button').filter({ hasText: /Ven\s*04\s*Dic/i }).first();
      await day4Btn.click();
      await page.waitForSelector('#timeline-card-d7_01', { timeout: 6000 });
      await page.waitForTimeout(450);
      assert.equal(await page.locator('[data-active-card="true"]').count(), 0, 'Altro giorno non deve mostrare evidenziazione attiva');

      // Ritorna al 3 Dic manualmente, scorri in cima manualmente, poi attendi: non deve riscattare lo scroll automatico!
      const day3Btn = page.locator('button').filter({ hasText: /Gio\s*03\s*Dic/i }).first();
      await day3Btn.click();
      await page.waitForSelector('#timeline-card-act_target_1425', { timeout: 6000 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const mainEl = document.querySelector('[data-main-scroll-container]');
        if (mainEl) mainEl.scrollTop = 0;
      });
      await page.waitForTimeout(500);
      const scrollAfterReturn = await page.evaluate(() => {
        const mainEl = document.querySelector('[data-main-scroll-container]');
        return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, mainEl?.scrollTop || 0);
      });
      assert.equal(scrollAfterReturn, 0, 'Lo scroll automatico deve avvenire UNA SOLA volta all apertura e mai dopo navigazione manuale');

      await Promise.race([ctxTrip.close().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
      console.log('[PASS E2E B] Durante il viaggio: giorno locale corretto, evidenziazione discreta, scroll singolo non invasivo.');
    }
  } finally {
    if (browser) await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
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
    console.error('TIMEOUT: test_p2_active_card_focus exceeded 60s');
    process.exit(2);
  }, 60000);
  killer.unref();

  const unitCount = runUnitTests();
  console.log(`\n=== TEST P2 UNITARI: ${unitCount}/${unitCount} PASS ===`);

  if (process.argv.includes('--require-browser') || fs.existsSync(path.join(projectRoot, 'dist/index.html'))) {
    await runBrowserTests();
  }

  clearTimeout(killer);
  console.log('\n=== TEST P2 COMPLETI: SUPERATI ===');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
