const fs = require('node:fs');
const assert = require('node:assert/strict');
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
      // try next
    }
  }
  throw new Error('Playwright module not found');
}

const { chromium } = resolvePlaywright();
const projectRoot = path.resolve(__dirname, '..');

async function seedLegacyBudget(page, dbName, amount) {
  await page.evaluate(
    ({ name, val }) =>
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
          const tx = db.transaction(['settings'], 'readwrite');
          tx.objectStore('settings').put({ id: 'trip_budget_goal', amount: val, updatedAt: 100 });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { name: dbName, val: amount }
  );
}

async function readIdbSnapshot(page, dbName) {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['note', 'settings'], 'readonly');
          const rNote = tx.objectStore('note').get('__hounigo_trip_budget_goal_v1');
          const rLegacy = tx.objectStore('settings').get('trip_budget_goal');
          tx.oncomplete = () => {
            db.close();
            resolve({ noteRecord: rNote.result || null, legacySetting: rLegacy.result || null });
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    dbName
  );
}

(async () => {
  // 0. Verifica regola Firestore /note/{docId} strettamente riservata ai membri privilegiati
  const rulesSrc = fs.readFileSync(path.join(projectRoot, 'firestore.rules'), 'utf8');
  assert.match(rulesSrc, /match \/note\/\{docId\}\s*\{\s*allow read, write: if isTripPrivilegedMember\(tripId\);/m, 'Rules /note/{docId} devono restare strettamente private (Owner/Copilota)');

  const { preview } = await import(pathToFileURL(path.join(projectRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await preview({
    root: projectRoot,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5207, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const TRIP_ID = 'local_synth_budget_sync';
    const DB_NAME = `ViaggiodiNozzeDB_${encodeURIComponent(TRIP_ID)}`;
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    await ctx.addInitScript(({ tripId }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: tripId,
        title: 'Viaggio Budget Sync Test',
        startDate: '2099-06-01',
        endDate: '2099-06-10',
      }));
    }, { tripId: TRIP_ID });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    await page.goto('http://127.0.0.1:5207/honeymoon-roadbook/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedLegacyBudget(page, DB_NAME, 13000);

    await page.goto('http://127.0.0.1:5207/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().waitFor({ state: 'visible', timeout: 10000 });

    // Apri Altro -> Spese & Budget
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Spese & Budget/i }).first().click();
    await page.waitForSelector('button:has-text("Modifica"), button:has-text("+ Imposta budget")', { timeout: 8000 });
    await page.waitForTimeout(200);

    // 1. Legge e preserva il budget locale esistente (13.000 EUR)
    const initialBody = await page.locator('body').innerText();
    assert.match(initialBody, /13[.\u202f\s]?000/, 'Deve preservare e leggere il budget locale esistente 13.000 EUR');

    await page.evaluate(() => {
      window.__budgetMutationEvents = [];
      window.addEventListener('roadbook_data_mutated', (e) => {
        window.__budgetMutationEvents.push(e.detail);
      });
    });

    // 2. Modifica budget OFFLINE -> salva su STORES.NOTE/__hounigo_trip_budget_goal_v1 e persiste al reload offline
    await ctx.setOffline(true);
    await page.getByRole('button', { name: 'Modifica' }).first().click();
    await page.waitForSelector('[placeholder="es. 3500 oppure 0"]', { timeout: 5000 });
    await page.locator('[placeholder="es. 3500 oppure 0"]').fill('13500');
    await page.getByRole('button', { name: 'Salva Budget' }).click();
    await page.waitForTimeout(400);

    const afterSaveBody = await page.locator('body').innerText();
    assert.match(afterSaveBody, /13[.\u202f\s]?500/, 'UI deve aggiornarsi a 13.500 offline');

    const snapAfterSave = await readIdbSnapshot(page, DB_NAME);
    assert.equal(snapAfterSave.noteRecord?.id, '__hounigo_trip_budget_goal_v1');
    assert.equal(snapAfterSave.noteRecord?.recordKind, 'budget_goal');
    assert.equal(snapAfterSave.noteRecord?.amount, 13500);
    assert.equal(snapAfterSave.legacySetting, null, 'Cache legacy settings deve essere rimossa dopo salvataggio privato');

    const noteEvents = await page.evaluate(() => window.__budgetMutationEvents || []);
    assert.ok(
      noteEvents.some((e) => e?.entityType === 'note' && e?.action === 'save' && e?.data?.id === '__hounigo_trip_budget_goal_v1'),
      'Deve emettere evento sync privato su entityType=note'
    );

    // Riapertura vista offline (navigazione in-app offline con serviceWorkers bloccati in headless)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('reset_altro_root')));
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Spese & Budget/i }).first().click();
    await page.waitForSelector('button:has-text("Modifica"), button:has-text("+ Imposta budget")', { timeout: 8000 });
    assert.match(await page.locator('body').innerText(), /13[.\u202f\s]?500/, 'Budget modificato offline deve persistere nella riapertura offline');

    // 3. Cancellazione esplicita via UI ("Rimuovi") offline -> amount: null e "Nessun budget fissato"
    await page.getByRole('button', { name: 'Modifica' }).first().click();
    await page.waitForSelector('button:has-text("Rimuovi")', { timeout: 5000 });
    await page.getByRole('button', { name: 'Rimuovi' }).click();
    await page.waitForTimeout(400);
    assert.ok((await page.locator('body').innerText()).includes('Nessun budget fissato'), 'Cancellazione esplicita deve rimuovere il budget');
    const snapAfterClear = await readIdbSnapshot(page, DB_NAME);
    assert.equal(snapAfterClear.noteRecord?.amount, null, 'Record privato deve registrare amount: null alla cancellazione');
    await ctx.setOffline(false);

    // Reload completo e conferma persistenza rimozione
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().waitFor({ state: 'visible', timeout: 10000 });

    // 4. Verifica isolamento: __hounigo_trip_budget_goal_v1 NON deve comparire in Note di Viaggio
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('reset_altro_root')));
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Note di Viaggio/i }).first().click();
    await page.waitForSelector('text=Note di Viaggio', { timeout: 6000 });
    await page.waitForTimeout(250);
    assert.ok((await page.locator('body').innerText()).includes('Nessuna nota ancora'), 'Budget privato non deve apparire nei post-it');

    // Torna a Spese & Budget
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('reset_altro_root')));
    await page.locator('nav button').filter({ hasText: 'Altro' }).first().click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Spese & Budget/i }).first().click();
    await page.waitForSelector('button:has-text("Modifica"), button:has-text("+ Imposta budget")', { timeout: 6000 });

    // 5. Simula Dispositivo B che riceve aggiornamento remoto (14.200) e poi clear remoto (amount: null) su legacy stale
    await page.evaluate(
      (name) =>
        new Promise((resolve) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['note'], 'readwrite');
            tx.objectStore('note').put({
              id: '__hounigo_trip_budget_goal_v1',
              recordKind: 'budget_goal',
              amount: 14200,
              originalCurrency: 'EUR',
              originalCost: 14200,
              conversionType: 'definitiva',
              createdAt: 10,
              updatedAt: Date.now() + 1000,
            });
            tx.oncomplete = () => {
              db.close();
              window.dispatchEvent(new CustomEvent('roadbook_cloud_synced'));
              resolve();
            };
          };
        }),
      DB_NAME
    );
    await page.waitForTimeout(500);
    assert.match(await page.locator('body').innerText(), /14[.\u202f\s]?200/, 'Aggiornamento remoto da altro dispositivo deve riflettersi in UI');

    await page.evaluate(
      (name) =>
        new Promise((resolve) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['settings', 'note'], 'readwrite');
            tx.objectStore('settings').put({ id: 'trip_budget_goal', amount: 8888, updatedAt: 50 });
            tx.objectStore('note').put({ id: '__hounigo_trip_budget_goal_v1', recordKind: 'budget_goal', amount: null, createdAt: 10, updatedAt: Date.now() + 2000 });
            tx.oncomplete = () => {
              db.close();
              window.dispatchEvent(new CustomEvent('roadbook_cloud_synced'));
              resolve();
            };
          };
        }),
      DB_NAME
    );
    await page.waitForTimeout(500);
    assert.ok((await page.locator('body').innerText()).includes('Nessun budget fissato'), 'Clear remoto deve prevalere sulla cache legacy');

    // 6. Ospite esterno LIVE: nessun dato budget visibile
    const guestCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await guestCtx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`http://127.0.0.1:5207/honeymoon-roadbook/?view=live&tripId=${TRIP_ID}`, { waitUntil: 'domcontentloaded' });
    await guestPage.waitForSelector('.hounigo-live-entry', { timeout: 8000 });
    const guestText = await guestPage.locator('body').innerText();
    assert.equal(guestText.includes('Budget Obiettivo') || guestText.includes('14.200') || guestText.includes('13.000') || guestText.includes('__hounigo_trip_budget_goal_v1'), false, 'Ospite esterno LIVE non deve vedere alcun dato budget');
    await guestCtx.close();

    console.log('✓ [PASS] Budget privato: accesso autorizzato, offline, modifica, rimozione, sync dispositivi, 13.000 EUR preservato e zero leak LIVE.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server?.httpServer) await new Promise((r) => server.httpServer.close(r));
  }
})();
