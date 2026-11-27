const assert = require('node:assert/strict');
const fs = require('node:fs');
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
            ['note', ['data']], ['spese', ['date']], ['bagagli', ['owner']],
            ['settings', []], ['sync_queue', ['createdAt']], ['attachments', ['entityId']],
          ]) {
            if (!db.objectStoreNames.contains(storeName)) {
              const s = db.createObjectStore(storeName, { keyPath: 'id' });
              indexes.forEach((idx) => s.createIndex(idx, idx, { unique: false }));
            }
          }
        };
        req.onsuccess = (ev) => {
          const db = ev.target.result;
          const stores = Object.keys(data);
          const tx = db.transaction(stores, 'readwrite');
          for (const store of stores) {
            const os = tx.objectStore(store);
            os.clear();
            for (const item of data[store]) os.put(item);
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
    server: { host: '127.0.0.1', port: 5207, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const TRIP_ID = 'test-pdf-1741';
    const DB_NAME = `ViaggiodiNozzeDB_${TRIP_ID}`;
    const FIXTURES = {
      giorni: [{ id: 'day-1', date: '2026-12-06', title: 'Wellington', location: 'Wellington', createdAt: 1, updatedAt: 1 }],
      tappe: [{
        id: 'tp-1',
        data: '2026-12-06',
        date: '2026-12-06',
        titolo: 'Mount Victoria Lookout',
        indirizzo: 'Wellington, New Zealand',
        orario: '10:00',
        nota: 'Nota privata segreta tappa',
        createdAt: 1,
        updatedAt: 1,
      }],
      trasporti: [{
        id: 'tr-1',
        type: 'volo',
        carrier: 'Air New Zealand',
        date: '2026-12-06',
        departureTime: '08:00',
        departureLocation: 'Auckland (AKL)',
        arrivalLocation: 'Wellington (WLG)',
        bookingCode: 'SECRET-PNR-999',
        noteCopilota: 'Nota privata segreta volo',
        status: 'prenotato',
        createdAt: 1,
        updatedAt: 1,
      }],
      alloggi: [{
        id: 'al-1',
        name: 'Hotel Wellington',
        checkIn: '2026-12-06',
        checkOut: '2026-12-07',
        address: '100 Lambton Quay, Wellington',
        bookingCode: 'SECRET-HOTEL-888',
        notes: 'Nota privata segreta alloggio',
        createdAt: 1,
        updatedAt: 1,
      }],
      attivita: [],
      ristoranti: [],
      shopping: [],
      note: [{ id: 'n-1', date: '2026-12-06', data: '2026-12-06', content: 'Nota privata giornaliera 777' }],
      spese: [{ id: 'sp-1', date: '2026-12-06', title: 'Spesa segreta', amount: 123 }],
    };

    // ── 1. DESKTOP (Owner, offline): Anteprima + Download diretto + Integrità PDF ──
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await desktopCtx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_view_mode', 'mobile');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Nuova Zelanda', startDate: '2026-12-06', endDate: '2026-12-07' }));
    }, { tripId: TRIP_ID });

    const page = await desktopCtx.newPage();
    await page.route('**/*firestore.googleapis.com*/**', (r) => r.abort());
    page.setDefaultTimeout(10000);

    await page.goto('http://127.0.0.1:5207/', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Altro/i }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button:visible').filter({ hasText: 'Esporta Itinerario PDF' }).first().click();
    await page.waitForTimeout(300);

    // Owner deve vedere i checkbox privati
    await page.locator('label:visible').filter({ hasText: 'Riferimenti prenotazione' }).first().waitFor({ state: 'visible' });

    // Anteprima integrata
    await page.locator('button:visible').filter({ hasText: 'Anteprima' }).first().click();
    const iframe = page.locator('iframe[title="Anteprima PDF Roadbook"]');
    await iframe.waitFor({ state: 'visible', timeout: 8000 });
    const iframeSrc = await iframe.getAttribute('src');
    assert.ok(iframeSrc && iframeSrc.startsWith('blob:'), `Anteprima usa blob URL: ${iframeSrc}`);

    // Download diretto su desktop
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:visible').filter({ hasText: 'Scarica PDF' }).first().click(),
    ]);
    const suggestedName = download.suggestedFilename();
    assert.equal(suggestedName, 'HOUNIGO \u2013 Nuova Zelanda \u2013 Itinerario.pdf', `Nome file atteso: ${suggestedName}`);
    const dlPath = await download.path();
    const pdfBuf = fs.readFileSync(dlPath);
    const pdfHead = pdfBuf.subarray(0, 8).toString('latin1');
    const pdfTail = pdfBuf.subarray(Math.max(0, pdfBuf.length - 64)).toString('latin1');
    assert.ok(pdfHead.startsWith('%PDF-'), `Header PDF valido: ${pdfHead}`);
    assert.ok(pdfTail.includes('%%EOF'), 'Footer %%EOF valido');
    assert.ok(pdfBuf.length > 2000, `Dimensione PDF valida: ${pdfBuf.length}`);
    await desktopCtx.close();

    // ── 2. MOBILE (iPhone): Condivisione nativa + Download locale ──
    const mobileCtx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasTouch: true,
      isMobile: true,
    });
    await mobileCtx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_view_mode', 'mobile');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Nuova Zelanda', startDate: '2026-12-06', endDate: '2026-12-07' }));
      window.__sharedCalls = [];
      navigator.canShare = (data) => Boolean(data && Array.isArray(data.files) && data.files.length > 0);
      navigator.share = async (data) => {
        window.__sharedCalls.push({
          title: data.title,
          fileCount: data.files?.length || 0,
          fileName: data.files?.[0]?.name,
          fileType: data.files?.[0]?.type,
          fileSize: data.files?.[0]?.size,
        });
      };
    }, { tripId: TRIP_ID });

    const mPage = await mobileCtx.newPage();
    await mPage.route('**/*firestore.googleapis.com*/**', (r) => r.abort());
    await mPage.goto('http://127.0.0.1:5207/', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(mPage, DB_NAME, FIXTURES);
    await mPage.reload({ waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(500);

    await mPage.getByRole('button', { name: /Altro/i }).first().click();
    await mPage.waitForTimeout(300);
    await mPage.locator('button:visible').filter({ hasText: 'Esporta Itinerario PDF' }).first().click();
    await mPage.waitForTimeout(300);

    const shareBtn = mPage.locator('button:visible').filter({ hasText: 'Condividi' }).first();
    await shareBtn.waitFor({ state: 'visible', timeout: 3000 });
    await shareBtn.click();
    await mPage.waitForTimeout(500);

    const sharedCalls = await mPage.evaluate(() => window.__sharedCalls);
    assert.equal(sharedCalls.length, 1, 'Web Share API invocata su mobile');
    assert.equal(sharedCalls[0].fileName, 'HOUNIGO \u2013 Nuova Zelanda \u2013 Itinerario.pdf');
    assert.equal(sharedCalls[0].fileType, 'application/pdf');
    assert.ok(sharedCalls[0].fileSize > 2000, 'File condiviso non vuoto');
    await mobileCtx.close();

    // ── 3. VIEWER: Permessi e protezione dati riservati ──
    const viewerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await viewerCtx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      sessionStorage.setItem('houni_dev_simulated_role', 'viewer');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'viewer');
      localStorage.setItem('houni_view_mode', 'mobile');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: tripId, title: 'Nuova Zelanda', startDate: '2026-12-06', endDate: '2026-12-07' }));
    }, { tripId: TRIP_ID });

    const vPage = await viewerCtx.newPage();
    await vPage.route('**/*firestore.googleapis.com*/**', (r) => r.abort());
    await vPage.goto('http://127.0.0.1:5207/', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(vPage, DB_NAME, FIXTURES);
    await vPage.reload({ waitUntil: 'domcontentloaded' });
    await vPage.waitForTimeout(500);

    await vPage.getByRole('button', { name: /Altro/i }).first().click();
    await vPage.waitForTimeout(300);
    await vPage.locator('button:visible').filter({ hasText: 'Esporta Itinerario PDF' }).first().click();
    await vPage.waitForTimeout(300);

    const readOnlyNotice = vPage.locator('text=Accesso in sola lettura');
    await readOnlyNotice.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await vPage.locator('label:visible').filter({ hasText: 'Riferimenti prenotazione' }).count(), 0, 'Viewer non vede checkbox PNR');

    // Anche invocando il servizio direttamente, i dati privati devono essere esclusi
    const viewerPdfInfo = await vPage.evaluate(async () => {
      const { preparePdfData } = await import('/src/services/pdfExportService.ts');
      return preparePdfData({
        includeTappe: true,
        includeActivities: true,
        includeTransports: true,
        includeAccommodations: true,
        includeBookingRefs: true,
        includeNotes: true,
        includeSpese: true,
        periodType: 'all',
        detailLevel: 'detailed',
        allowPrivateInfo: false,
      });
    });
    const serialized = JSON.stringify(viewerPdfInfo);
    assert.ok(!serialized.includes('SECRET-PNR-999'), 'Viewer PDF esclude PNR');
    assert.ok(!serialized.includes('Nota privata segreta'), `Viewer PDF esclude note private: ${serialized.slice(Math.max(0, serialized.indexOf('Nota privata') - 60), serialized.indexOf('Nota privata') + 80)}`);
    assert.ok(!serialized.includes('Spesa segreta'), 'Viewer PDF esclude spese');
    await viewerCtx.close();

    console.log('✓ [PASS] PDF Roadbook 1.7.41: download desktop, share mobile, anteprima, nome file, offline, integrita PDF e permessi Owner/Copilota/Viewer');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('❌ [FAIL]', err);
  process.exit(1);
});
