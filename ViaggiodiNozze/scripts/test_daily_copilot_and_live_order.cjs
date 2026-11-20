const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolvePlaywright() {
  for (const candidate of [
    'playwright',
    path.resolve(__dirname, '../node_modules/playwright'),
    path.resolve(__dirname, '../../node_modules/playwright'),
  ]) {
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
const screenshotDir = process.env.HOUNIGO_TEST_SHOT_DIR || '';
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

async function readNotesFromIndexedDB(page, dbName) {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['note'], 'readonly');
          const allReq = tx.objectStore('note').getAll();
          allReq.onsuccess = () => {
            db.close();
            resolve(allReq.result || []);
          };
          allReq.onerror = () => reject(allReq.error);
        };
        req.onerror = () => reject(req.error);
      }),
    dbName
  );
}

async function openLiveFromApp(page, width) {
  if (width >= 768) {
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
    await page.waitForTimeout(250);
  }
  const liveTile = page.getByRole('button', { name: /Live & Posizione/i }).first();
  if (await liveTile.isVisible().catch(() => false)) {
    await liveTile.click();
    await page.waitForTimeout(350);
  }
}

async function runDailyCopilotUnitTests() {
  console.log('\n--- 1. UNIT TEST COPILOTA GIORNALIERO (isolamento per data e preservazione assegnazioni) ---');
  const { createServer } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const mod = await vite.ssrLoadModule('/src/utils/dailyCopilot.ts');
    const {
      getDailyCopilotNoteId,
      resolveDailyCopilotNoteForDate,
      buildDailyCopilotSavePayload,
    } = mod;

    assert.equal(getDailyCopilotNoteId('2099-05-10'), 'copilota_2099-05-10');

    const mixedNotes = [
      { id: 'nota_trip_general', title: 'Promemoria generale viaggio', content: 'Valigia comune', color: 'amber', createdAt: 1, updatedAt: 1 },
      { id: 'copilota_2099-05-10', title: 'Note Copilota di Giornata', content: 'Guida giorno 1: ritiro auto', color: 'sky', date: '2099-05-10', createdAt: 2, updatedAt: 2 },
      // Simulazione record sporco da vecchio bug: id del giorno 10 ma campo date del giorno 12
      { id: 'copilota_2099-05-11', title: 'Note Copilota di Giornata', content: 'Guida giorno 2: navigatore centro', color: 'sky', date: '2099-05-12', createdAt: 3, updatedAt: 3 },
      // Record vuoto con soli spazi
      { id: 'copilota_2099-05-13', title: 'Note Copilota di Giornata', content: '   \n  ', color: 'sky', date: '2099-05-13', createdAt: 4, updatedAt: 4 },
      // Assegnazione legacy senza prefisso copilota_
      { id: 'legacy_day_14', title: 'Note Copilota di Giornata', content: 'Assegnazione legacy giorno 14', color: 'emerald', date: '2099-05-14', createdAt: 5, updatedAt: 5 },
    ];

    const r10 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-10');
    assert.equal(r10.hasAssignment, true);
    assert.equal(r10.noteId, 'copilota_2099-05-10');
    assert.equal(r10.text, 'Guida giorno 1: ritiro auto');

    const r11 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-11');
    assert.equal(r11.hasAssignment, true);
    assert.equal(r11.noteId, 'copilota_2099-05-11');
    assert.equal(r11.text, 'Guida giorno 2: navigatore centro');

    // Giorno senza assegnazione: NON deve mostrare né la nota di viaggio né il record copilota_2099-05-11 con date sporco
    const r12 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-12');
    assert.equal(r12.hasAssignment, false);
    assert.equal(r12.text, '');
    assert.equal(r12.noteId, null);

    // Giorno con soli spazi: nessuna assegnazione attiva
    const r13 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-13');
    assert.equal(r13.hasAssignment, false);
    assert.equal(r13.text, '');

    // Assegnazione legacy preservata esclusivamente sulla data corretta
    const r14 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-14');
    assert.equal(r14.hasAssignment, true);
    assert.equal(r14.noteId, 'legacy_day_14');
    assert.equal(r14.text, 'Assegnazione legacy giorno 14');

    const r15 = resolveDailyCopilotNoteForDate(mixedNotes, '2099-05-15');
    assert.equal(r15.hasAssignment, false);
    assert.equal(r15.text, '');

    // Salvataggio su giorno vuoto usa ID canonico del giorno e non sovrascrive altri giorni
    const emptyNoop = buildDailyCopilotSavePayload({ selectedDate: '2099-05-15', notesText: '   ', existingNotes: mixedNotes, now: 100 });
    assert.equal(emptyNoop.action, 'noop');

    const save12 = buildDailyCopilotSavePayload({ selectedDate: '2099-05-12', notesText: 'Nuova nota giorno 12', existingNotes: mixedNotes, now: 200 });
    assert.equal(save12.action, 'save');
    assert.equal(save12.noteId, 'copilota_2099-05-12');
    assert.equal(save12.payload.id, 'copilota_2099-05-12');
    assert.equal(save12.payload.date, '2099-05-12');
    assert.equal(save12.payload.content, 'Nuova nota giorno 12');

    // Aggiornamento assegnazione legacy preserva il suo id storico e i dati
    const save14 = buildDailyCopilotSavePayload({ selectedDate: '2099-05-14', notesText: 'Legacy aggiornata', existingNotes: mixedNotes, now: 300 });
    assert.equal(save14.action, 'save');
    assert.equal(save14.noteId, 'legacy_day_14');
    assert.equal(save14.payload.color, 'emerald');
    assert.equal(save14.payload.createdAt, 5);

    console.log('✓ [PASS] Logica unitaria Copilota Giornaliero verificata (6 casi).');
  } finally {
    await vite.close();
  }
}

async function runPlaywrightE2E() {
  console.log('\n--- 2. E2E PLAYWRIGHT: COPILOTA GIORNALIERO + ORDINE SEZIONE LIVE ---');
  const { preview } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await preview({
    root: projectRoot,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5204, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'local_synth_copilot_live';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const gpsAgeIso = new Date(Date.now() - 6 * 60_000).toISOString();

    const FIXTURES = {
      giorni: [
        { id: 'd1', date: '2099-05-10', title: 'Giorno 1 · Auckland', location: 'Auckland', createdAt: 1, updatedAt: 1 },
        { id: 'd2', date: '2099-05-11', title: 'Giorno 2 · Rotorua', location: 'Rotorua', createdAt: 1, updatedAt: 1 },
        { id: 'd3', date: '2099-05-12', title: 'Giorno 3 · Taupo', location: 'Taupo', createdAt: 1, updatedAt: 1 },
        { id: 'd4', date: '2099-05-13', title: 'Giorno 4 · Wellington', location: 'Wellington', createdAt: 1, updatedAt: 1 },
      ],
      attivita: [],
      tappe: [],
      ristoranti: [],
      shopping: [],
      alloggi: [],
      note: [
        { id: 'nota_trip_wide', title: 'Nota generale viaggio', content: 'Non deve comparire come nota del giorno', color: 'amber', createdAt: 1, updatedAt: 1 },
        { id: 'copilota_2099-05-10', title: 'Note Copilota di Giornata', content: 'Copilota Day 1: Parcheggio terminal Nord', color: 'sky', date: '2099-05-10', recordKind: 'nota', createdAt: 2, updatedAt: 2 },
        { id: 'copilota_2099-05-11', title: 'Note Copilota di Giornata', content: 'Copilota Day 2: Ritiro pass termale', color: 'sky', date: '2099-05-11', recordKind: 'nota', createdAt: 3, updatedAt: 3 },
      ],
      trasporti: [
        {
          id: 'tr-flight-1',
          type: 'volo',
          status: 'prenotato',
          date: '2099-05-10',
          departureTime: '14:20',
          departureTimeZone: 'Europe/Rome',
          carrier: 'Air China CA950',
          departureLocation: 'Milano Malpensa',
          departureIata: 'MXP',
          arrivalLocation: 'Pechino',
          arrivalIata: 'PEK',
          bookingCode: 'SECRET_PNR_TEST',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'tr-train-2',
          type: 'treno',
          status: 'prenotato',
          date: '2099-05-12',
          departureTime: '09:10',
          departureTimeZone: 'Pacific/Auckland',
          carrier: 'Northern Explorer 200',
          departureLocation: 'Auckland Strand',
          arrivalLocation: 'Wellington',
          bookingCode: 'SECRET_TRAIN_TEST',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    };

    // ─── A. TEST COPILOTA GIORNALIERO IN OGGIVIEW ───
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    await ctx.addInitScript(({ tripId, gpsIso }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'copilota'); // Ruolo permanente copilota
      localStorage.setItem('app_device_role', 'copilota');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: tripId,
        title: 'Viaggio Test Copilota',
        startDate: '2099-05-10',
        endDate: '2099-05-13',
        ownerName: 'Marco',
      }));
      localStorage.setItem(`hounigo_live_last_known_loc_${tripId}`, JSON.stringify({
        lat: -36.8485,
        lng: 174.7633,
        accuracy: 10,
        city: 'Auckland',
        country: 'Nuova Zelanda',
        updatedAt: gpsIso,
        publisherDeviceId: 'synth-device',
        status: 'active',
      }));
    }, { tripId: TRIP_ID, gpsIso: gpsAgeIso });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    await page.goto('http://127.0.0.1:5204/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5204/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[aria-label="Note Copilota di giornata"]', { timeout: 10000 });
    await page.waitForTimeout(300);

    // Giorno 1 (2099-05-10): assegnazione presente
    assert.equal(await page.locator('[data-testid="daily-copilot-active-dot"]').count(), 1, 'Giorno 1 deve mostrare badge copilota attivo');
    await page.locator('button[aria-label="Note Copilota di giornata"]').click();
    await page.waitForSelector('[data-copilota-editor="stable"]', { timeout: 4000 });
    assert.equal(await page.locator('[data-copilota-editor="stable"]').inputValue(), 'Copilota Day 1: Parcheggio terminal Nord');
    assert.equal(await page.locator('[role="dialog"]').innerText().then(t => t.includes('2099-05-10')), true, 'Modale deve mostrare la data del giorno 1');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const closeBtn = page.locator('[role="dialog"] button[aria-label="Chiudi"]');
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(200);

    const selectDayPill = async (dayNumStr) => {
      const btn = page
        .locator('.snap-start')
        .filter({ has: page.locator('span', { hasText: new RegExp(`^${dayNumStr}$`) }) })
        .first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
    };

    // Cambio a Giorno 2 (2099-05-11): seconda assegnazione distinta
    await selectDayPill('11');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-testid="daily-copilot-active-dot"]').count(), 1, 'Giorno 2 deve mostrare badge copilota attivo');
    await page.locator('button[aria-label="Note Copilota di giornata"]').click();
    await page.waitForSelector('[data-copilota-editor="stable"]', { timeout: 4000 });
    assert.equal(await page.locator('[data-copilota-editor="stable"]').inputValue(), 'Copilota Day 2: Ritiro pass termale');
    assert.equal(await page.locator('[role="dialog"]').innerText().then(t => t.includes('2099-05-11')), true, 'Modale deve mostrare la data del giorno 2');
    const closeBtn2 = page.locator('[role="dialog"] button[aria-label="Chiudi"]');
    if (await closeBtn2.isVisible().catch(() => false)) await closeBtn2.click();
    await page.waitForTimeout(200);

    // Cambio a Giorno 3 (2099-05-12): nessuna assegnazione -> badge ASSENTE, testo vuoto
    await selectDayPill('12');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-testid="daily-copilot-active-dot"]').count(), 0, 'Giorno 3 senza assegnazione NON deve mostrare badge');

    // Simula un sync cloud while on Day 3: non deve mai ripristinare Day 1!
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('roadbook_cloud_synced'));
    });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-testid="daily-copilot-active-dot"]').count(), 0, 'Dopo evento sync cloud, Giorno 3 resta senza badge');

    await page.locator('button[aria-label="Note Copilota di giornata"]').click();
    await page.waitForSelector('[data-copilota-editor="stable"]', { timeout: 4000 });
    assert.equal(await page.locator('[data-copilota-editor="stable"]').inputValue(), '', 'Giorno 3 vuoto non deve ereditare note da altri giorni');
    await page.locator('[data-copilota-editor="stable"]').fill('Assegnazione specifica Day 3');
    await page.getByRole('button', { name: 'Salva Note Copilota' }).click();
    await page.waitForTimeout(1300);

    // Cambio a Giorno 4 (2099-05-13): resta vuoto
    await selectDayPill('13');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-testid="daily-copilot-active-dot"]').count(), 0, 'Giorno 4 vuoto deve restare senza badge anche con ruolo copilota permanente');

    // Verifica IndexedDB: Day 1 e Day 2 preservati intatti, Day 3 salvato sotto copilota_2099-05-12
    const storedNotes = await readNotesFromIndexedDB(page, DB_NAME);
    const byId = new Map(storedNotes.map((n) => [n.id, n]));
    assert.equal(byId.get('copilota_2099-05-10')?.content, 'Copilota Day 1: Parcheggio terminal Nord', 'Assegnazione Day 1 preservata');
    assert.equal(byId.get('copilota_2099-05-11')?.content, 'Copilota Day 2: Ritiro pass termale', 'Assegnazione Day 2 preservata');
    assert.equal(byId.get('copilota_2099-05-12')?.content, 'Assegnazione specifica Day 3', 'Assegnazione Day 3 salvata sul proprio ID');
    console.log('✓ [PASS] UI Copilota Giornaliero: cambio giorni (1 -> 2 -> 3 sync -> save -> 4), zero leak tra giorni e preservazione.');

    // ─── B. TEST ORDINE LIVE OWNER SU VIEWPORT TARGET ───
    const ownerViewports = [
      { name: 'iphone-15-pro', width: 393, height: 852, expectSideBySide: false },
      { name: 'ipad-mini-portrait', width: 744, height: 1133, expectSideBySide: false },
      { name: 'ipad-mini-landscape', width: 1133, height: 744, expectSideBySide: true },
      { name: 'desktop-1280', width: 1280, height: 800, expectSideBySide: true },
    ];

    for (const vp of ownerViewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await openLiveFromApp(page, vp.width);
      await page.waitForSelector('[data-testid="live-section-header"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="live-next-transport-card"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="live-section-position"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="live-section-diary-interactions"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="live-section-secondary"]', { timeout: 8000 });

      const layout = await page.evaluate(() => {
        const A = document.querySelector('[data-testid="live-section-header"]');
        const clock = document.querySelector('[data-testid="live-dual-clock"]');
        const B = document.querySelector('[data-testid="live-next-transport-card"]');
        const nav = document.querySelector('nav[aria-label="Sezioni LIVE"]');
        const C = document.querySelector('[data-testid="live-section-position"]');
        const D = document.querySelector('[data-testid="live-section-diary-interactions"]');
        const E = document.querySelector('[data-testid="live-section-secondary"]');
        const entry = document.querySelector('.hounigo-live-entry');

        const stickyOrFixedInsideLive = [];
        if (entry) {
          for (const el of entry.querySelectorAll('*')) {
            const pos = getComputedStyle(el).position;
            if (pos === 'sticky' || pos === 'fixed') {
              stickyOrFixedInsideLive.push(el.tagName + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''));
            }
          }
        }

        const rA = A.getBoundingClientRect();
        const rClock = clock.getBoundingClientRect();
        const rB = B.getBoundingClientRect();
        const rNav = nav.getBoundingClientRect();
        const rC = C.getBoundingClientRect();
        const rD = D.getBoundingClientRect();
        const rE = E.getBoundingClientRect();

        return {
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          clockInsideHeader: Boolean(A.contains(clock)),
          stickyOrFixedInsideLive,
          A: { top: rA.top, bottom: rA.bottom },
          clock: { top: rClock.top, bottom: rClock.bottom },
          B: { top: rB.top, bottom: rB.bottom },
          nav: { top: rNav.top, bottom: rNav.bottom },
          C: { top: rC.top, bottom: rC.bottom, x: rC.x },
          D: { top: rD.top, bottom: rD.bottom, x: rD.x },
          E: { top: rE.top, bottom: rE.bottom },
        };
      });

      assert.equal(layout.overflowX, false, `${vp.name} Owner LIVE: nessun overflow orizzontale`);
      assert.equal(layout.clockInsideHeader, true, `${vp.name} Owner LIVE: orari Italia/locale devono essere in A (header)`);
      assert.deepEqual(layout.stickyOrFixedInsideLive, [], `${vp.name} Owner LIVE: nessun elemento sticky/fixed interno deve coprire la pagina`);
      assert.ok(layout.B.top >= layout.A.bottom - 2, `${vp.name}: B deve seguire A (B.top=${layout.B.top}, A.bottom=${layout.A.bottom})`);
      assert.ok(layout.nav.top >= layout.B.bottom - 2, `${vp.name}: nav rapida deve seguire B`);
      assert.ok(layout.C.top >= layout.nav.bottom - 2, `${vp.name}: C (Mappa+GPS) deve seguire nav`);

      if (vp.expectSideBySide) {
        assert.ok(layout.D.x > layout.C.x, `${vp.name}: su tablet/desktop (>=1024px) D affianca C`);
        assert.ok(layout.D.top >= layout.nav.bottom - 2, `${vp.name}: D resta sotto B/nav`);
      } else {
        assert.ok(layout.D.top >= layout.C.bottom - 2, `${vp.name}: su mobile/tablet verticali D segue C (D.top=${layout.D.top}, C.bottom=${layout.C.bottom})`);
      }

      assert.ok(layout.E.top >= Math.max(layout.C.bottom, layout.D.bottom) - 2, `${vp.name}: E (secondarie) segue sempre C e D (E.top=${layout.E.top})`);

      // Verifica interazione frecce B in situ
      const routeBefore = await page.locator('[data-testid="live-next-transport-route"]').innerText();
      await page.locator('[data-testid="live-next-transport-next"]').click();
      await page.waitForTimeout(100);
      const routeAfter = await page.locator('[data-testid="live-next-transport-route"]').innerText();
      assert.notEqual(routeBefore, routeAfter, `${vp.name}: frecce B cambiano tratta`);
      await page.locator('[data-testid="live-next-transport-prev"]').click();

      // Verifica su iPhone che scorrendo fino in fondo la barra fissa inferiore non copra il pulsante finale
      if (vp.width < 768) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(150);
        const bottomClearance = await page.evaluate(() => {
          const shareBottomBtn = Array.from(document.querySelectorAll('[data-testid="live-section-secondary"] button')).find(b => b.textContent?.includes('Condividi'));
          const navBar = document.querySelector('nav.app-bottom-nav');
          if (!shareBottomBtn || !navBar) return null;
          return {
            btnBottom: shareBottomBtn.getBoundingClientRect().bottom,
            navTop: navBar.getBoundingClientRect().top,
          };
        });
        assert.ok(bottomClearance && bottomClearance.btnBottom <= bottomClearance.navTop + 1, `${vp.name}: bottom nav non deve coprire l'ultimo pulsante (btnBottom=${bottomClearance?.btnBottom}, navTop=${bottomClearance?.navTop})`);
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      if (screenshotDir) {
        await page.screenshot({ path: path.join(screenshotDir, `live-owner-${vp.name}.png`), fullPage: false });
      }
    }
    console.log('✓ [PASS] Gerarchia LIVE Owner A->B->C->D->E, zero sticky overlap e layout pulito su iPhone 15 Pro, iPad mini e Desktop.');

    // ─── C. TEST OSPITE ESTERNO (?view=live&tripId=...) ───
    const guestCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await guestCtx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const guestPage = await guestCtx.newPage();
    guestPage.setDefaultTimeout(10000);

    for (const vp of [
      { name: 'guest-iphone-15-pro', width: 393, height: 852 },
      { name: 'guest-ipad-mini-portrait', width: 744, height: 1133 },
      { name: 'guest-desktop-1280', width: 1280, height: 800 },
    ]) {
      await guestPage.setViewportSize({ width: vp.width, height: vp.height });
      await guestPage.goto(`http://127.0.0.1:5204/honeymoon-roadbook/?view=live&tripId=${TRIP_ID}`, { waitUntil: 'domcontentloaded' });
      await guestPage.waitForSelector('[data-testid="live-section-header"]', { timeout: 10000 });
      await guestPage.waitForSelector('[data-testid="live-dual-clock"]', { timeout: 6000 });
      await guestPage.waitForSelector('[data-testid="live-section-position"]', { timeout: 6000 });
      await guestPage.waitForSelector('[data-testid="live-section-diary-interactions"]', { timeout: 6000 });
      await guestPage.waitForSelector('[data-testid="live-section-secondary"]', { timeout: 6000 });

      const guestInfo = await guestPage.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const A = document.querySelector('[data-testid="live-section-header"]').getBoundingClientRect();
        const C = document.querySelector('[data-testid="live-section-position"]').getBoundingClientRect();
        const D = document.querySelector('[data-testid="live-section-diary-interactions"]').getBoundingClientRect();
        const E = document.querySelector('[data-testid="live-section-secondary"]').getBoundingClientRect();
        return {
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          hasLeakedSecrets: bodyText.includes('SECRET_PNR_TEST') || bodyText.includes('private_credentials'),
          hasInternalControls: bodyText.includes('Guida GPS') || bodyText.includes('Delega guida GPS'),
          A, C, D, E,
        };
      });
      assert.equal(guestInfo.overflowX, false, `${vp.name}: nessun overflow orizzontale ospite`);
      assert.equal(guestInfo.hasLeakedSecrets, false, `${vp.name}: nessun segreto esposto all'ospite esterno`);
      assert.equal(guestInfo.hasInternalControls, false, `${vp.name}: nessun controllo Owner/Copilota esposto all'ospite`);
      assert.ok(guestInfo.C.top >= guestInfo.A.bottom - 2, `${vp.name}: C sotto A`);
      assert.ok(guestInfo.E.top >= Math.max(guestInfo.C.bottom, guestInfo.D.bottom) - 2, `${vp.name}: E in fondo sotto C e D`);
    }
    console.log('✓ [PASS] Vista Ospite Esterno: ordine A->C->D->E (B nascosta senza feed), privacy intatta e zero overflow.');
    await guestCtx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server?.httpServer) await new Promise((r) => server.httpServer.close(r));
  }
}

(async () => {
  await runDailyCopilotUnitTests();
  await runPlaywrightE2E();
  console.log('\n🎉 TUTTI I TEST COPILOTA GIORNALIERO + ORDINE LIVE SUPERATI!');
})().catch((err) => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
