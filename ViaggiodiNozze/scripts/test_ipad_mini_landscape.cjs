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

async function run() {
  const { createServer } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({
    root: projectRoot,
    define: {
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('demo-hounigo-test'),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('demo-key'),
    },
    server: { host: '127.0.0.1', port: 5204, strictPort: true },
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

    const TRIP_ID = 'synth-ipad-mini-1728';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const FIXTURES = {
      giorni: [
        { id: 'day-1', date: '2026-12-01', title: 'Giorno 1 Roma', location: 'Roma', createdAt: 1, updatedAt: 1 },
        { id: 'day-2', date: '2026-12-02', title: 'Giorno 2 Pechino', location: 'Pechino', createdAt: 1, updatedAt: 1 },
      ],
      attivita: [
        { id: 'act-1', dayId: 'day-2', date: '2026-12-02', time: '09:00', title: 'Città Proibita', location: 'Pechino Centro', status: 'prenotato', createdAt: 1, updatedAt: 1 },
        { id: 'act-2', dayId: 'day-2', date: '2026-12-02', time: '14:00', title: 'Tempio del Cielo', location: 'Pechino Sud', status: 'pianificato', createdAt: 1, updatedAt: 1 },
        { id: 'act-3', dayId: 'day-2', date: '2026-12-02', time: '17:30', title: 'Quartiere Hutong', location: 'Nanluoguxiang', status: 'pianificato', createdAt: 1, updatedAt: 1 },
      ],
      tappe: [],
      ristoranti: [
        { id: 'rist-1', data: '2026-12-02', orario: '20:00', nome: 'Anatra Pechinese', indirizzo: 'Qianmen', status: 'prenotato', createdAt: 1, updatedAt: 1 },
      ],
      shopping: [],
      alloggi: [],
      trasporti: [
        { id: 'tr-1', type: 'volo', carrier: 'Air China CA950', date: '2026-12-02', departureTime: '06:30', departureLocation: 'FCO', arrivalLocation: 'PEK', status: 'prenotato', createdAt: 1, updatedAt: 1 },
      ],
    };

    const ctx = await browser.newContext({ viewport: { width: 1133, height: 744 } });
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
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Test iPad Mini Landscape', startDate: '2026-12-01', endDate: '2026-12-05' }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    await page.route('**/*firestore.googleapis.com*/**', (route) => route.abort());
    page.setDefaultTimeout(8000);

    await page.goto('http://127.0.0.1:5204/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5204/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Apri Itinerario Giornaliero dalla sidebar desktop
    await page.locator('button:visible').filter({ hasText: /Itinerario Giornaliero/i }).first().click();
    await page.waitForTimeout(300);

    // Seleziona Giorno 2 manualmente (con 5 card)
    await page.locator('button:visible').filter({ hasText: /Dopo →/i }).first().click();
    await page.waitForTimeout(300);

    // 1. Verifica layout iPad mini 6 landscape (1133x744)
    const landscapeLayout = await page.evaluate(() => {
      const aside = document.querySelector('.app-desktop-navigation');
      const timeline = document.querySelector('.hounigo-ipad-landscape-timeline');
      const cards = timeline ? Array.from(timeline.querySelectorAll('.hounigo-timeline-item')) : [];
      const rects = cards.slice(0, 2).map((el) => el.getBoundingClientRect());
      return {
        docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
        cardCount: cards.length,
        sideBySide: rects.length === 2 && Math.abs(rects[0].top - rects[1].top) <= 4 && rects[1].left > rects[0].left,
      };
    });
    assert.equal(landscapeLayout.docOverflow, false, '1133x744: nessun overflow orizzontale');
    assert.ok(landscapeLayout.asideWidth > 0 && landscapeLayout.asideWidth <= 245, `Sidebar compatta: ${landscapeLayout.asideWidth}px`);
    assert.equal(landscapeLayout.sideBySide, true, '1133x744: card timeline affiancate su 2 colonne');

    // 2. Verifica modale più ampia in 1133x744
    await page.locator('h3:visible').filter({ hasText: 'Air China CA950' }).first().click();
    await page.getByTestId('trasporto-form').waitFor({ state: 'visible' });
    const modalRect = await page.locator('.modal-sheet-container').boundingBox();
    assert.ok(modalRect.width >= 650, `1133x744: modale espansa orizzontalmente (${modalRect.width}px)`);
    assert.ok(modalRect.height <= 730, `1133x744: modale contenuta in altezza (${modalRect.height}px)`);

    // Simula modifica in corso nel form e rotazione a Portrait (744x1133) e ritorno a Landscape (1133x744)
    const carrierInput = page.getByTestId('field-carrier').locator('input');
    await carrierInput.fill('Air China Modificata');
    await page.setViewportSize({ width: 744, height: 1133 });
    await page.waitForTimeout(250);
    assert.equal(await carrierInput.inputValue(), 'Air China Modificata', 'Rotazione 1133x744 -> 744x1133: modifica in corso preservata');
    await page.setViewportSize({ width: 1133, height: 744 });
    await page.waitForTimeout(250);
    assert.equal(await carrierInput.inputValue(), 'Air China Modificata', 'Rotazione 744x1133 -> 1133x744: modifica in corso preservata');
    await page.locator('button:has-text("Annulla")').first().click();
    await page.waitForTimeout(200);

    // 3. Verifica preservazione scroll + giorno selezionato nella rotazione 744x1133 <-> 1133x744
    await page.setViewportSize({ width: 744, height: 1133 });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 260));
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 1133, height: 744 });
    await page.waitForTimeout(300);
    const afterRotateToLandscape = await page.evaluate(() => ({
      scrollTop: document.querySelector('[data-main-scroll-container="true"]')?.scrollTop ?? 0,
      dayText: document.body.innerText,
    }));
    assert.ok(afterRotateToLandscape.scrollTop >= 200, `Scroll preservato dopo rotazione a landscape (${afterRotateToLandscape.scrollTop}px)`);
    assert.ok(afterRotateToLandscape.dayText.includes('GIORNO 2'), 'Giorno selezionato preservato dopo rotazione');

    // 4. Verifica preservazione layout iPhone (393x852) e Desktop (1280x800): 1 colonna e zero overflow
    for (const vp of [{ width: 393, height: 852 }, { width: 744, height: 1133 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);
      const check = await page.evaluate(() => {
        const timeline = document.querySelector('.hounigo-ipad-landscape-timeline');
        const cards = timeline ? Array.from(timeline.querySelectorAll('.hounigo-timeline-item')) : [];
        const rects = cards.slice(0, 2).map((el) => el.getBoundingClientRect());
        return {
          docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          stackedSingleCol: rects.length < 2 || rects[1].top >= rects[0].bottom - 4,
        };
      });
      assert.equal(check.docOverflow, false, `${vp.width}x${vp.height}: nessun overflow orizzontale`);
      assert.equal(check.stackedSingleCol, true, `${vp.width}x${vp.height}: layout 1 colonna preservato`);
    }

    console.log('✓ [PASS] iPad mini 6 landscape (1133x744): colonne affiancate, modali ampie, rotazione con stato/scroll/giorno preservati, e layout iPhone/portrait/desktop intatti');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('❌ [FAIL]', err);
  process.exit(1);
});
