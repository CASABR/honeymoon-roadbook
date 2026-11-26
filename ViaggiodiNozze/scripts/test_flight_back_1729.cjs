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
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}),
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
          platform: 'Trip.com sintetico',
          bookingCode: 'PNR111 | Long synthetic reference with additional e-ticket details '.repeat(4),
          date: '2026-12-01',
          departureTime: '19:30',
          departureLocation: 'Roma Fiumicino',
          arrivalDate: '2026-12-02',
          arrivalTime: '12:45',
          arrivalLocation: 'Auckland',
          terminalGate: 'Partenza terminal 3 gate E12 | Arrivo terminal 1, informazioni di prova',
          checkinOpen: '24h prima',
          checkinCutoff: '17:30 — informazioni operative di prova con testo lungo e dettagli aggiuntivi per verificare la visualizzazione completa. '.repeat(3).trim(),
          posti: '14A, 14B',
          noteCopilota: 'Nota copilota sintetica preesistente.',
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
          departureTimeZone: 'Europe/London',
          arrivalDate: '2026-12-02',
          arrivalTime: '18:00',
          arrivalLocation: 'Aeroporto internazionale di destinazione',
          arrivalIata: 'SYD',
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
            notes: 'Nota scalo legacy',
          },
          status: 'prenotato',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
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
    await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:5205/') ? route.continue() : route.abort());
    page.setDefaultTimeout(8000);

    await page.goto('http://127.0.0.1:5205/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    await seedIndexedDB(page, DB_NAME, FIXTURES);
    await page.goto('http://127.0.0.1:5205/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Actual card width, independently of the viewport. Long operational text and touch targets.
    const front = page.locator('[data-transport-type="volo"]').filter({has:page.locator('h3').filter({hasText:'Air China CA950'})}).first();
    await front.waitFor({state:'visible'});
    const mobileFront = await front.evaluate(el => {
      const savedWidth = el.style.width;
      const results = [];
      try {
        for (const width of [300, 340]) {
          el.style.width = width+'px';
          const outer = el.getBoundingClientRect();
          const measured = [...el.querySelectorAll('.flight-front-notice,.flight-front-route,.hounigo-ds-spec-cell,.flight-front-seats,.hounigo-ds-action-btn')].filter(n=>n.getClientRects().length);
          const actions = [...el.querySelectorAll('.hounigo-ds-action-btn')].filter(n=>n.getClientRects().length);
          results.push({
            width:outer.width,
            overflow:measured.some(n=>n.getBoundingClientRect().right>outer.right+1 || n.getBoundingClientRect().left<outer.left-1),
            hitTargets:actions.every(n=>n.getBoundingClientRect().width>=43 && n.getBoundingClientRect().height>=43),
            actionSizes:actions.map(n=>({label:n.getAttribute('aria-label'),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),
            specColumns:getComputedStyle(el.querySelector('.flight-front-spec-grid')).gridTemplateColumns.split(' ').length,
            terminal:el.querySelector('.flight-front-terminal-value').textContent,
            cutoffText:el.querySelector('.flight-front-notice-text').textContent,
            seats:el.querySelector('.flight-front-seat-value').textContent.trim()
          });
        }
      } finally { el.style.width=savedWidth; }
      return results;
    });
    for (const m of mobileFront) {
      assert.equal(m.overflow,false,'Card mobile senza overflow: '+JSON.stringify(m));
      assert.equal(m.hitTargets,true,'Azioni mobile raggiungibili: '+JSON.stringify(m));
      assert.equal(m.cutoffText,FIXTURES.trasporti[0].checkinCutoff);
      assert.equal(m.seats,FIXTURES.trasporti[0].posti);
      assert.equal(m.terminal,FIXTURES.trasporti[0].terminalGate.replace(/\s+\|\s+/g,'\n'));
      if(m.width>=340) assert.equal(m.specColumns,2,'Terminal e posti affiancati quando c’è spazio');
    }
    // 1. Apri volo diretto e verifica auto-IATA, quadro economico sempre aperto, dettagli volo collassati, modali condivise e conservazione modifiche
    await page.locator('h3:visible').filter({ hasText: 'Air China CA950' }).first().click();
    await page.getByTestId('flight-back-layout').waitFor({ state: 'visible' });

    assert.equal(await page.getByTestId('flight-departure-iata-badge').innerText(), 'FCO', 'Auto-IATA FCO da Roma Fiumicino');
    assert.equal(await page.getByTestId('flight-arrival-iata-badge').innerText(), 'AKL', 'Auto-IATA AKL da Auckland');
    const arrival = page.getByPlaceholder('Aeroporto di arrivo');
    await arrival.fill('Sydney');
    await arrival.blur();
    assert.equal(await page.getByTestId('flight-arrival-iata-badge').innerText(), 'SYD', 'IATA aggiornato al cambio aeroporto');
    assert.equal(await page.getByTestId('toggle-flight-advanced').count(), 0, 'Nessun comando tecnico per aeroporti risolti');
    await arrival.fill('Aeroporto non identificato');
    await arrival.blur();
    assert.ok((await page.getByTestId('toggle-flight-advanced').innerText()).includes('Verifica aeroporti'));
    await arrival.fill('Auckland');
    await arrival.blur();
    assert.equal(await page.getByTestId('flight-arrival-iata-badge').innerText(), 'AKL');
    assert.equal(await page.getByTestId('toggle-flight-advanced').count(), 0, 'Avviso scompare quando aeroporto e fuso sono risolti');
    assert.notEqual(await page.getByTestId('add-layover-btn').evaluate(el => getComputedStyle(el).backgroundColor), await page.getByTestId('flight-itinerary-section').evaluate(el => getComputedStyle(el).backgroundColor), 'Scalo distinto cromaticamente');
    assert.equal(await page.getByTestId('flight-subcategory-select').isVisible(), true, 'Selettore sottocategoria compatto accanto a Compagnia');
    assert.equal(await page.getByTestId('flight-finance-always-open').isVisible(), true, 'Quadro economico sempre aperto');
    const economy = page.getByTestId('flight-finance-always-open');
    const originalCost = await economy.getByPlaceholder('es. 150.00').inputValue();
    const originalDeposit = await economy.getByPlaceholder('es. 50.00').inputValue();
    await economy.getByRole('checkbox',{name:'Incluso nel pacchetto'}).check();
    assert.equal(await economy.getByPlaceholder('es. 150.00').count(),0,'Importi nascosti se inclusi');
    await economy.getByRole('checkbox',{name:'Incluso nel pacchetto'}).uncheck();
    assert.equal(await economy.getByPlaceholder('es. 150.00').inputValue(),originalCost,'Costo ripristinato dopo toggle');
    assert.equal(await economy.getByPlaceholder('es. 50.00').inputValue(),originalDeposit,'Acconto ripristinato dopo toggle');
    assert.equal(await page.getByPlaceholder('Aeroporto di partenza').evaluate(el=>el.scrollHeight<=el.clientHeight+2),true,'Nome aeroporto leggibile');
    assert.ok(await page.getByTestId('flight-action-pnr').locator('svg').count(),'Icone vettoriali');
    assert.ok((await page.getByTestId('toggle-flight-details').innerText()).includes('3/3'), 'Riepilogo dettagli volo collassati');

    const carrierBox = await page.getByTestId('field-carrier').locator('input').boundingBox();
    const selectorBox = await page.getByTestId('flight-subcategory-select').boundingBox();
    assert.ok(Math.abs(carrierBox.y - selectorBox.y) < 3, 'Nome e mezzo sulla stessa riga mobile');
    const actionBoxes = await Promise.all(['pnr','bagagli','tickets'].map(x => page.getByTestId('flight-action-'+x).boundingBox()));
    assert.ok(actionBoxes.every(b => Math.abs(b.y - actionBoxes[0].y) < 2), 'Tre azioni sulla stessa riga');
    assert.ok((await page.getByTestId('flight-action-pnr').innerText()).length < 20, 'PNR sintetico senza testo privato');
    assert.equal(await page.getByTestId('field-terminalGate').locator('textarea').inputValue(), FIXTURES.trasporti[0].terminalGate);
    const sheet = page.getByRole('dialog').filter({ has: page.getByTestId('flight-back-layout') });
    const sheetBox = await sheet.boundingBox();
    assert.ok(sheetBox.y < 100 && sheetBox.height > 740, 'Foglio Aereo alto su iPhone');
    await page.getByTestId('toggle-flight-details').click();
    const cutoff = page.getByTestId('field-checkinCutoff').locator('textarea');
    await cutoff.waitFor({ state: 'visible' });
    const fits = (locator) => locator.evaluate(el => el.scrollHeight <= el.clientHeight + 2);
    assert.equal(await fits(cutoff), true, 'Check-in lungo interamente visibile');
    const original = await cutoff.inputValue();
    const longHeight = (await cutoff.boundingBox()).height;
    await cutoff.fill('17:30');
    assert.ok((await cutoff.boundingBox()).height < longHeight, 'Textarea si compatta');
    await cutoff.fill(original);
    assert.equal(await fits(cutoff), true, 'Textarea si adatta alla modifica');
    await page.getByTestId('toggle-flight-details').click();
    assert.equal(await fits(page.getByTestId('field-terminalGate').locator('textarea')), true, 'Terminal interamente visibile');
    const notesToggle = page.getByTestId('toggle-flight-notes');
    const notesInput = page.getByTestId('flight-notes').locator('textarea');
    assert.equal(await notesToggle.getAttribute('aria-expanded'), 'false', 'Note collassate per impostazione predefinita');
    assert.equal(await notesInput.count(), 0, 'Campo note nascosto');
    assert.ok((await notesToggle.innerText()).includes('Presenti'), 'Indicatore note preesistenti');
    await notesToggle.click();
    assert.equal(await notesInput.inputValue(), [FIXTURES.trasporti[0].noteCopilota, FIXTURES.trasporti[0].notes].join('\n\n'), 'Note preesistenti e legacy preservate');
    await notesInput.fill('Nota copilota aggiornata e conservata anche a sezione chiusa.');
    assert.equal(await fits(notesInput), true, 'Note interamente visibili');
    await notesToggle.click();
    assert.equal(await notesToggle.getAttribute('aria-expanded'), 'false');
    await notesToggle.click();
    assert.equal(await notesInput.inputValue(), 'Nota copilota aggiornata e conservata anche a sezione chiusa.');
    await notesToggle.click();
    // Semantic grouping and section contrast in both palettes.
    const groups = await page.evaluate(() => {
      const ids = ['flight-itinerary-section', 'flight-finance-always-open', 'flight-technical-section', 'flight-notes'];
      const root = document.documentElement;
      const original = root.classList.contains('dark');
      const luminance = rgb => {
        const channels = rgb.match(/[0-9.]+/g).slice(0,3).map(Number).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
        return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
      };
      try {
        return [false,true].map(dark => {
          root.classList.toggle('dark',dark);
          const sections = ids.map(id => document.querySelector('[data-testid="'+id+'"]'));
          const colors = sections.map(el => getComputedStyle(el).backgroundColor);
          const contrast = sections.map((el,i) => {
            const title = el.querySelector('.flight-section-title,.flight-technical-label');
            const pair = [luminance(getComputedStyle(title).color),luminance(colors[i])].sort((a,b)=>b-a);
            return (pair[0]+.05)/(pair[1]+.05);
          });
          return { distinct: new Set(colors).size, contrast };
        });
      } finally { root.classList.toggle('dark',original); }
    });
    for (const g of groups) {
      assert.equal(g.distinct, 4, 'Quattro sezioni distinguibili');
      assert.ok(g.contrast.every(r => r >= 4.5), 'Contrasto titoli AA: '+JSON.stringify(g));
    }
    // Verifica gerarchia esatta 1..10 su Aereo
    const orderOk = await page.evaluate(() => {
      const ids = [
        'field-carrier',
        'flight-departure-iata-badge',
        'field-terminalGate',
        'flight-finance-always-open',
        'add-layover-btn',
        'toggle-flight-details',
        'field-platform',
        'flight-shared-actions',
        'flight-notes',
      ];
      const tops = ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1);
      for (let i = 1; i < tops.length; i++) {
        if (tops[i] < tops[i - 1]) return { ok: false, tops };
      }
      return { ok: true, tops };
    });
    assert.equal(orderOk.ok, true, `Gerarchia 1..9 rispettata: ${JSON.stringify(orderOk.tops)}`);

    // Modifica non ancora salvata su carrier + apertura PNR/Bagagli condivisi senza perdere carrier
    const carrierInput = page.getByTestId('field-carrier').locator('input');
    const platformInput = page.getByLabel('Piattaforma di acquisto');
    assert.equal(await platformInput.inputValue(),'Trip.com sintetico');
    await platformInput.fill('Sito ufficiale sintetico');
    await carrierInput.fill('Air China CA950 Mod');
    await page.getByTestId('flight-action-pnr').click();
    assert.equal(await page.getByTestId('pnr-modal-input').inputValue(), FIXTURES.trasporti[0].bookingCode);
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
    assert.equal(await layoverBox.locator('input[placeholder="Calcolata auto"]').getAttribute('readonly') !== null, true, 'Durata scalo non editabile manualmente');

    await layoverBox.getByTestId('flight-layover-notes').fill('Nota scalo aggiornata');
    // Salva e verifica persistenza integrale in IndexedDB
    await page.locator('button:has-text("Aggiorna")').first().click();
    await page.waitForTimeout(400);
    const savedDirect = await readTransportFromDb(page, DB_NAME, 'tr-direct');
    assert.equal(savedDirect.carrier, 'Air China CA950 Mod');
    assert.equal(savedDirect.platform,'Sito ufficiale sintetico');
    await page.locator('h3:visible').filter({hasText:'Air China CA950 Mod'}).first().click();
    await page.getByTestId('flight-back-layout').waitFor({state:'visible'});
    assert.equal(await page.getByLabel('Piattaforma di acquisto').inputValue(),'Sito ufficiale sintetico');
    await page.locator('button:has-text("Annulla")').first().click();
    assert.equal(savedDirect.bookingCode, 'NEWPNR');
    assert.equal(savedDirect.departureIata, 'FCO');
    assert.equal(savedDirect.arrivalIata, 'AKL');
    assert.equal(savedDirect.departureTimeZone, 'Europe/Rome');
    assert.equal(savedDirect.dropoffTimeZone, 'Pacific/Auckland');
    assert.equal(savedDirect.checkinOpen, '24h prima');
    assert.equal(savedDirect.checkinCutoff, FIXTURES.trasporti[0].checkinCutoff);
    assert.equal(savedDirect.posti, '14A, 14B');
    assert.equal(savedDirect.noteCopilota, 'Nota copilota aggiornata e conservata anche a sezione chiusa.');
    assert.equal(savedDirect.layover?.iata, 'PEK');
    assert.equal(savedDirect.layover?.duration, '2h 15m');
    assert.equal(savedDirect.layover?.carrier, 'CA783');
    assert.equal(savedDirect.layover?.notes, 'Nota scalo aggiornata');
    assert.equal(savedDirect.terminalGate, FIXTURES.trasporti[0].terminalGate);

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
      const advanced = page.getByTestId('toggle-flight-advanced');
      assert.equal(await advanced.getAttribute('aria-expanded'), 'false');
      assert.ok((await advanced.innerText()).includes('Verifica aeroporti'));
      await advanced.click();
      assert.equal(await page.getByPlaceholder('es. Europe/Rome').nth(0).inputValue(), 'Europe/London', 'Fuso manuale preservato');
      assert.equal(await page.getByPlaceholder('es. Europe/Rome').nth(1).inputValue(), 'Australia/Sydney', 'Fuso ereditato da IATA SYD');
      await page.getByTestId('flight-use-auto-zones').click();
      assert.equal(await advanced.count(), 0, 'Verifica nascosta dopo correzione automatica');
      await page.getByTestId('toggle-layover-summary').click();
      assert.equal(await page.getByTestId('flight-layover-notes').inputValue(), 'Nota scalo legacy');
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
