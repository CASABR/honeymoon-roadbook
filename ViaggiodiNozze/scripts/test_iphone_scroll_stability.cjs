const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

(async () => {
  const { preview } = await import('vite');
  const server = await preview({
    root,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5198, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      serviceWorkers: 'block',
    });
    await ctx.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      return host === '127.0.0.1' ? route.continue() : route.abort();
    });

    await ctx.addInitScript(() => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', 'synthetic-iphone');
      localStorage.setItem('houni_device_role', 'owner');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem(
        'roadbook_trip_config',
        JSON.stringify({
          id: 'synthetic-iphone',
          title: 'iPhone Stability Test Trip',
          startDate: '2026-11-28',
          endDate: '2026-12-05',
        })
      );
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);

    // 1. Verifica che senza ?uiDebug=1 l'overlay NON venga montato e che i 5 tocchi in Informazioni lo attivino/chiudano
    await page.goto('http://127.0.0.1:5198/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.locator('header.app-mobile-header').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-testid="ui-debug-overlay"]').count(), 0, 'uiDebug overlay must be hidden by default');

    await page.getByRole('button', { name: 'Informazioni su HOUNIGO' }).click();
    const verLabel = page.getByTestId('app-version-label');
    await verLabel.waitFor({ state: 'visible' });
    for (let t = 0; t < 5; t++) await verLabel.click();
    await page.getByText(/Diagnostica scroll attivata/i).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    const debugOverlay = page.locator('[data-testid="ui-debug-overlay"]');
    await debugOverlay.waitFor({ state: 'visible' });
    await debugOverlay.getByRole('button', { name: 'Ferma' }).click();
    await debugOverlay.getByRole('button', { name: 'Avvia' }).click();
    await debugOverlay.getByRole('button', { name: 'Chiudi diagnostica' }).click();
    assert.equal(await debugOverlay.count(), 0, 'uiDebug overlay must close cleanly without modifying trip data');

    // 2. Popola IndexedDB con una giornata realistica ricca (alloggio + trasporti + attivita + ristoranti + tappe)
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = window.indexedDB.open('ViaggiodiNozzeDB_synthetic-iphone', 8);
        req.onupgradeneeded = () => {
          const db = req.result;
          const stores = [
            'giorni', 'attivita', 'alloggi', 'trasporti', 'documenti',
            'routes', 'tappe', 'ristoranti', 'shopping', 'spese',
            'note', 'bagagli', 'settings',
          ];
          for (const s of stores) {
            if (!db.objectStoreNames.contains(s)) {
              db.createObjectStore(s, { keyPath: 'id' });
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['alloggi', 'attivita', 'trasporti', 'ristoranti', 'tappe'], 'readwrite');
          tx.objectStore('alloggi').put({
            id: 'hotel-1',
            name: 'Park Hyatt Test',
            checkIn: '2026-11-28',
            checkOut: '2026-11-30',
            address: 'Via Test 1, Milano',
            location: 'Milano',
            status: 'prenotato',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          });
          tx.objectStore('trasporti').put({
            id: 'tr-1',
            date: '2026-11-28',
            departureTime: '08:30',
            arrivalTime: '11:30',
            type: 'treno',
            departureLocation: 'Roma Termini',
            arrivalLocation: 'Milano Centrale',
            carrier: 'Frecciarossa',
            status: 'prenotato',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          });
          const places = ['Duomo di Milano', 'Galleria Vittorio Emanuele', 'Castello Sforzesco', 'Parco Sempione', 'Pinacoteca di Brera', 'Navigli'];
          places.forEach((p, idx) => {
            const hour = String(10 + idx).padStart(2, '0');
            tx.objectStore('attivita').put({
              id: `act-${idx + 1}`,
              dayId: 'day-1',
              date: '2026-11-28',
              time: `${hour}:00`,
              title: `Visita ${p}`,
              location: p,
              category: 'visita',
              status: 'prenotato',
              createdAt: 1700000000000,
              updatedAt: 1700000000000,
            });
          });
          tx.objectStore('tappe').put({
            id: 'tappa-1',
            dayId: 'day-1',
            date: '2026-11-28',
            time: '10:30',
            title: 'Terrazze del Duomo',
            location: 'Duomo di Milano',
            parentAttivitaId: 'act-1',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          });
          tx.objectStore('ristoranti').put({
            id: 'rist-1',
            data: '2026-11-28',
            orario: '20:30',
            nome: 'Trattoria Test',
            indirizzo: 'Via Brera 12, Milano',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // 3. Ricarica con ?uiDebug=1 e verifica presenza telemetry + manifest singolo
    await page.goto('http://127.0.0.1:5198/honeymoon-roadbook/?uiDebug=1', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="ui-debug-overlay"]').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Visita Duomo di Milano' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(900); // lascia completare RouteBadge e caricamento iniziale

    const manifestInfo = await page.evaluate(() => ({
      hrefs: Array.from(document.querySelectorAll('link[rel="manifest"]')).map((el) => el.getAttribute('href')),
      hasMinSvh: document.documentElement.innerHTML.includes('min-h-[100svh]') || Boolean(document.querySelector('[class*="100svh"]')),
    }));
    assert.equal(manifestInfo.hrefs.length, 1, `Expected single manifest link, got: ${JSON.stringify(manifestInfo.hrefs)}`);
    assert.ok(manifestInfo.hrefs[0]?.includes('manifest.webmanifest'), `Unexpected manifest href: ${manifestInfo.hrefs[0]}`);
    assert.equal(manifestInfo.hasMinSvh, true, 'Root shell should use 100svh instead of 100dvh on mobile');

    // 4. Scorri a meta pagina (Y ~ 550) e resetta i contatori per misurare le perturbazioni post-caricamento
    const scrollTarget = await page.evaluate(() => {
      const target = Math.min(550, Math.max(250, Math.floor((document.documentElement.scrollHeight - window.innerHeight) * 0.6)));
      window.scrollTo({ top: target, behavior: 'instant' });
      return Math.round(window.scrollY);
    });
    assert.ok(scrollTarget >= 200, `Expected scrollable content (>=200px), got scrollY=${scrollTarget}`);

    await page.getByRole('button', { name: /uiDebug/ }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.waitForTimeout(150);

    // 5. Simula raffiche di eventi cloud sync / mutazioni / role re-verification / resize Safari toolbar
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_synced', { detail: { pulled: 0, pushed: 0, syncMode: 'delta' } }));
      }
      for (let i = 0; i < 3; i++) {
        window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'sync', entityType: 'all' } }));
      }
      for (let i = 0; i < 4; i++) {
        window.dispatchEvent(new CustomEvent('houni_cloud_role_changed', { detail: { cloudRole: 'owner' } }));
      }
    });
    await page.waitForTimeout(900);

    // Simula variazione altezza barra Safari iOS (852 -> 760 -> 852)
    await page.setViewportSize({ width: 393, height: 760 });
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.waitForTimeout(250);

    const afterBurst = await page.evaluate(() => window.__HOUNIGO_UI_DEBUG_GET__());
    console.log('[AFTER_BURST]', JSON.stringify({
      scrollTarget,
      scrollY: afterBurst.scrollY,
      counts: afterBurst.counts,
    }));

    assert.ok(Math.abs(afterBurst.scrollY - scrollTarget) <= 5, `Scroll drifted unexpectedly after sync burst: ${scrollTarget} -> ${afterBurst.scrollY}`);
    assert.equal(afterBurst.counts.oggiMounts, 0, `OggiView remounted unexpectedly: ${afterBurst.counts.oggiMounts}`);
    assert.equal(afterBurst.counts.mainHeightChanges, 0, `Main height oscillated on identical sync burst: ${afterBurst.counts.mainHeightChanges}`);
    assert.equal(afterBurst.counts.unpromptedScrollShifts, 0, `Unprompted scroll shifts detected: ${afterBurst.counts.unpromptedScrollShifts}`);

    // 6. Test apertura/chiusura modale dettaglio: lo scroll non deve resettarsi in cima
    const modalTrigger = page.getByRole('heading', { name: 'Visita Castello Sforzesco' });
    await modalTrigger.scrollIntoViewIfNeeded();
    await modalTrigger.click();
    await page.waitForTimeout(250);
    const duringModal = await page.evaluate(() => window.__HOUNIGO_UI_DEBUG_GET__());
    const closeBtn = page.locator('[role="dialog"]').getByRole('button', { name: /Chiudi/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(350);

    const afterModal = await page.evaluate(() => window.__HOUNIGO_UI_DEBUG_GET__());
    assert.ok(Math.abs(afterModal.scrollY - duringModal.scrollY) <= 5, `Scroll jumped after modal close: ${duringModal.scrollY} -> ${afterModal.scrollY}`);
    assert.equal(afterModal.counts.oggiMounts, 0, `OggiView remounted on modal close: ${afterModal.counts.oggiMounts}`);

    console.log('✅ test_iphone_scroll_stability PASSED', {
      scrollTarget,
      duringModalScrollY: duringModal.scrollY,
      scrollAfterBurst: afterBurst.scrollY,
      scrollAfterModal: afterModal.scrollY,
      oggiRendersDelta: afterBurst.counts.oggiRenders,
    });
  } finally {
    if (browser) await browser.close();
    server.httpServer.close();
  }
})();

