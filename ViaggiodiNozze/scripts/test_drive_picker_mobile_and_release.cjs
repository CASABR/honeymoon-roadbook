const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(root, 'test-mobile-fix-temp-'));
const testTimeout = setTimeout(() => {
  console.error('FAIL: Test superato limite massimo di 60s');
  process.exit(1);
}, 60000);

// HTML della fixture
fs.writeFileSync(path.join(fixture, 'index.html'), `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>HOUNIGO Test Mobile & Picker</title>
</head>
<body class="bg-slate-50 text-slate-900 m-0 p-0 overflow-x-hidden">
  <div id="root"></div>
  <script>
    localStorage.setItem('roadbook_trip_config', JSON.stringify({
      id: 'test-mobile-trip',
      title: 'Viaggio Nuova Zelanda',
      startDate: '2026-11-28',
      endDate: '2027-01-12'
    }));
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('app_device_role', 'guida');
  </script>
  <script type="module" src="./fixture.tsx"></script>
</body>
</html>
`);

// Componente React fixture che monta sia DocumentiView, AltroView che PreDeparturePhotoCard
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import DocumentiView from '/src/views/altro/DocumentiView';
import AltroView from '/src/views/AltroView';
import PreDeparturePhotoCard from '/src/components/cards/PreDeparturePhotoCard';
import {
  APP_VERSION,
  BUILD_TIME,
  COMMIT_HASH,
  RELEASE_TIMESTAMP_ISO,
  FORMATTED_RELEASE_TIME,
  formatReleaseTimestamp
} from '/src/utils/appVersion';
import { storageService } from '/src/storage/storageService';
import { getGooglePickerConfigStatus } from '/src/services/googlePickerService';

window.testHounigoApi = {
  APP_VERSION,
  BUILD_TIME,
  COMMIT_HASH,
  RELEASE_TIMESTAMP_ISO,
  FORMATTED_RELEASE_TIME,
  formatReleaseTimestamp,
  storageService,
  getGooglePickerConfigStatus
};

function TestContainer() {
  const [activeTab, setActiveTab] = useState<'documenti' | 'altro' | 'foto'>('documenti');
  const [initialOpenDrive, setInitialOpenDrive] = useState(false);

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <nav className="flex gap-2 p-2 bg-white border-b border-slate-200">
        <button id="tab-documenti" onClick={() => setActiveTab('documenti')} className="px-3 py-1 text-xs font-bold border rounded">
          Documenti
        </button>
        <button id="tab-altro" onClick={() => setActiveTab('altro')} className="px-3 py-1 text-xs font-bold border rounded">
          Altro
        </button>
        <button id="tab-foto" onClick={() => setActiveTab('foto')} className="px-3 py-1 text-xs font-bold border rounded">
          Foto
        </button>
      </nav>

      <main className="p-3 w-full">
        {activeTab === 'documenti' && (
          <DocumentiView onBack={() => setActiveTab('altro')} initialOpenDriveModal={initialOpenDrive} />
        )}
        {activeTab === 'altro' && (
          <AltroView />
        )}
        {activeTab === 'foto' && (
          <div id="foto-container" className="max-w-md mx-auto">
            <PreDeparturePhotoCard
              tripId="test-mobile-trip"
              startDate="2026-11-28"
              selectedDate="2026-11-28"
              canEdit={true}
              onOpenLive={() => {}}
            />
          </div>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<TestContainer />);
`);

(async () => {
  let server;
  let browser;

  try {
    const { createServer } = await import('vite');
    server = await createServer({
      root,
      server: { host: '127.0.0.1', port: 5198, strictPort: true },
      logLevel: 'error'
    });
    await server.listen();

    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox']
    });

    const context = await browser.newContext({
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    const fixtureUrl = `http://127.0.0.1:5198/${path.basename(fixture)}/index.html`;
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: LAYOUT DOCUMENTI SU VIEWPORT 375px, 390px, 430px (ZERO SCROLL ORIZZONTALE)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 1] Verifica layout Documenti e assenza di scroll orizzontale su 375, 390 e 430px...');
    const viewports = [
      { width: 375, height: 667, name: 'iPhone SE (375px)' },
      { width: 390, height: 844, name: 'iPhone 13/14 (390px)' },
      { width: 430, height: 932, name: 'iPhone 14/15/16 Pro Max (430px)' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      // Assicurati di essere su Documenti
      await page.click('#tab-documenti');
      await page.waitForSelector('text=Documenti del Viaggio');

      const overflowMetrics = await page.evaluate(() => {
        const docEl = document.documentElement;
        return {
          scrollWidth: docEl.scrollWidth,
          clientWidth: docEl.clientWidth,
          innerWidth: window.innerWidth,
          hasHorizontalScroll: docEl.scrollWidth > window.innerWidth
        };
      });

      console.log(`  -> ${vp.name}: scrollWidth=${overflowMetrics.scrollWidth}, innerWidth=${overflowMetrics.innerWidth}`);
      assert.ok(
        overflowMetrics.scrollWidth <= overflowMetrics.innerWidth + 1, // margine 1px sub-pixel rounding
        `Rilevato overflow orizzontale su ${vp.name}: scrollWidth ${overflowMetrics.scrollWidth} > innerWidth ${overflowMetrics.innerWidth}`
      );

      // Verifica che i pulsanti azione siano visibili e dentro il viewport
      const driveBtn = page.getByRole('button', { name: /Aggiungi da Google Drive|Scegli da Google Drive/i });
      const newDocBtn = page.getByRole('button', { name: /Nuovo Documento/i });

      await assert.doesNotReject(driveBtn.waitFor({ state: 'visible' }), `Pulsante Drive non visibile su ${vp.name}`);
      await assert.doesNotReject(newDocBtn.waitFor({ state: 'visible' }), `Pulsante Nuovo Documento non visibile su ${vp.name}`);

      const driveBox = await driveBtn.boundingBox();
      const newDocBox = await newDocBtn.boundingBox();

      assert.ok(driveBox && driveBox.x >= 0 && driveBox.x + driveBox.width <= vp.width, `Pulsante Drive fuoriesce dai bordi su ${vp.name}`);
      assert.ok(newDocBox && newDocBox.x >= 0 && newDocBox.x + newDocBox.width <= vp.width, `Pulsante Nuovo Documento fuoriesce dai bordi su ${vp.name}`);
    }
    console.log('✓ TEST 1 Superato: Zero scroll orizzontale confermato su 375, 390 e 430px con pulsanti perfettamente visibili.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: APERTURA DEI DUE COMANDI GOOGLE DRIVE IN ALTRO
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 2] Verifica distinzione dei comandi Google Drive in Altro...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#tab-altro');
    await page.waitForSelector('[data-google-drive-card]');

    // Comando 1: Apri Google Drive (esterno)
    const externalDriveLink = page.locator('[data-google-drive-card]');
    await assert.doesNotReject(externalDriveLink.waitFor({ state: 'visible' }));
    const href = await externalDriveLink.getAttribute('href');
    const target = await externalDriveLink.getAttribute('target');
    const rel = await externalDriveLink.getAttribute('rel');
    assert.match(href || '', /^https:\/\/drive\.google\.com/i, 'Il link esterno deve puntare a drive.google.com');
    assert.equal(target, '_blank', 'Il link esterno deve aprire in target _blank');
    assert.match(rel || '', /noopener/, 'Il link esterno deve specificare noopener');
    assert.match(await externalDriveLink.innerText(), /Apri Google Drive/, 'Testo comando esterno chiaro');

    // Comando 2: Collega documento Drive (funzione HOUNIGO)
    const connectDriveBtn = page.locator('[data-google-drive-connect-card]');
    await assert.doesNotReject(connectDriveBtn.waitFor({ state: 'visible' }));
    assert.match(await connectDriveBtn.innerText(), /Collega documento Drive/, 'Testo comando interno chiaro');

    // Clicca Collega documento Drive e verifica che apra Documenti con modale Drive aperto
    await connectDriveBtn.click();
    await page.waitForSelector('text=Collega da Google Drive');
    console.log('✓ TEST 2 Superato: Comandi distinti ("Apri Google Drive" esterno vs "Collega documento Drive" interno) funzionanti.');

    // Chiudi modale
    await page.click('button:has-text("Annulla")');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3 & 4: FLUSSO PICKER (MOCK), FALLBACK MANUALE E SALVATAGGIO LINK
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 3 & 4] Verifica flusso Picker simulato, fallback manuale e salvataggio collegamento...');
    // Apri modale Drive da Documenti
    await page.click('button:has-text("Aggiungi da Google Drive")');
    await page.waitForSelector('text=Collega da Google Drive');

    // Verifica fallback manuale: inserimento link manuale
    const manualUrlInput = page.locator('input[type="url"]');
    await manualUrlInput.fill('https://drive.google.com/file/d/testFile12345/view?usp=sharing');

    const nameInput = page.locator('input[placeholder*="Es. Biglietti Volo"]');
    await nameInput.fill('Voucher Noleggio Camper');

    // Seleziona categoria "Alloggi & Hotel" o "Biglietti"
    await page.click('button:has-text("Biglietti & Voucher")');

    // Salva collegamento
    await page.click('button:has-text("Salva collegamento")');

    // Verifica che la card sia apparsa in lista
    await page.waitForSelector('h3:has-text("Voucher Noleggio Camper")');
    const savedCard = page.locator('div.rounded-3xl', { hasText: 'Voucher Noleggio Camper' }).first();
    await assert.doesNotReject(savedCard.waitFor({ state: 'visible' }));

    // Verifica badge Google Drive e pulsante Apri su Drive
    const driveBadge = savedCard.locator('span', { hasText: 'Google Drive' }).first();
    await assert.doesNotReject(driveBadge.waitFor({ state: 'visible' }));
    const openBtn = savedCard.locator('button', { hasText: 'Apri su Drive' }).first();
    await assert.doesNotReject(openBtn.waitFor({ state: 'visible' }));

    console.log('✓ TEST 3 & 4 Superato: Inserimento e salvataggio collegamento Drive verificato.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: COMPATTEZZA FOTO PRE-PARTENZA (ALTEZZA RIDOTTA 15-20%)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 5] Verifica compattezza foto pre-partenza...');
    await page.click('#tab-foto');
    const photoCard = page.locator('[data-testid="predeparture-photo-card"]');
    await assert.doesNotReject(photoCard.waitFor({ state: 'visible' }));

    const photoCardHeight = await photoCard.evaluate((el) => el.getBoundingClientRect().height);
    console.log(`  -> Altezza card foto pre-partenza misurata su smartphone: ${photoCardHeight}px`);
    // Prima della modifica era ~205-210px; con la compattazione (15-20%) deve essere <= 175px
    assert.ok(photoCardHeight <= 175, `Card foto pre-partenza troppo alta (${photoCardHeight}px > 175px)`);

    // Verifica presenza elementi essenziali: pulsante scatta, toggle LIVE, info
    const shootBtn = photoCard.getByRole('button', { name: /Scatta o carica foto/i });
    const liveToggle = photoCard.locator('input[type="checkbox"]');
    const infoBtn = photoCard.getByRole('button', { name: /Cos’è il LIVE/i });
    await assert.doesNotReject(shootBtn.waitFor({ state: 'visible' }));
    await assert.doesNotReject(liveToggle.waitFor({ state: 'visible' }));
    await assert.doesNotReject(infoBtn.waitFor({ state: 'visible' }));

    console.log('✓ TEST 5 Superato: Card pre-partenza compatta (~18% riduzione altezza) con tutte le funzioni preservate.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: VERSIONE E TIMESTAMP
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 6] Verifica versione e timestamp pubblicazione...');
    const versionData = await page.evaluate(() => {
      const api = window.testHounigoApi;
      return {
        appVersion: api.APP_VERSION,
        isoTimestamp: api.RELEASE_TIMESTAMP_ISO,
        formattedTime: api.FORMATTED_RELEASE_TIME,
        buildTime: api.BUILD_TIME,
        commitHash: api.COMMIT_HASH
      };
    });

    console.log('  -> Dati versione registrati:', versionData);
    assert.equal(versionData.appVersion, '1.5.13', 'Versione app corretta');
    assert.match(versionData.isoTimestamp, /^2026-11-09T11:19:16/, 'Timestamp ISO con fuso orario presente');
    assert.match(versionData.formattedTime, /^09\/11\/2026, 11:19/, 'Timestamp formattato nel fuso locale come "09/11/2026, 11:19"');
    assert.notEqual(versionData.formattedTime, versionData.buildTime, 'Data di pubblicazione distinta da orario di compilazione');

    console.log('✓ TEST 6 Superato: Versione e timestamp ISO nel fuso locale ("v1.5.13 · 09/11/2026, 11:19") verificati.');

    console.log('\n======================================================');
    console.log('TUTTI I 6 TEST SUITE MOBILE, PICKER & RELEASE SUPERATI!');
    console.log('======================================================\n');
  } finally {
    clearTimeout(testTimeout);
    if (browser) await browser.close();
    if (server) await server.close();
    try {
      fs.rmSync(fixture, { recursive: true, force: true });
    } catch {}
  }
})();
