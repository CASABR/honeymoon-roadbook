const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(root, 'test-closure-fixture-'));
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
  <title>HOUNIGO Test Chiusura Beta 1.6.0</title>
</head>
<body class="bg-slate-50 text-slate-900 m-0 p-0">
  <div id="root"></div>
  <script type="module" src="./fixture.tsx"></script>
</body>
</html>
`);

// Componente React fixture
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import OnboardingView from '/src/views/OnboardingView';
import LiveEditorialExperience from '/src/views/altro/LiveEditorialExperience';
import AppInfoModal, { AppInfoButton } from '/src/components/common/AppInfo';
import { getGooglePickerConfigStatus } from '/src/services/googlePickerService';
import { liveGpsService } from '/src/services/liveGpsService';
import {
  APP_VERSION,
  RELEASE_TIMESTAMP_ISO,
  FORMATTED_RELEASE_TIME,
  formatReleaseTimeOnly
} from '/src/utils/appVersion';

window.testClosureApi = {
  getGooglePickerConfigStatus,
  liveGpsService,
  APP_VERSION,
  RELEASE_TIMESTAMP_ISO,
  FORMATTED_RELEASE_TIME,
  formatReleaseTimeOnly
};

function TestApp() {
  const [tab, setTab] = useState<'onboarding' | 'live_active' | 'live_inactive' | 'live_expired' | 'app_info'>('onboarding');
  const [createdConfig, setCreatedConfig] = useState<any>(null);

  const mockPlannedIntel = {
    plannedLocation: {
      title: 'Grand Hotel Kyoto',
      coords: { lat: 35.0116, lng: 135.7681 }
    },
    tripStatus: 'in_trip'
  };

  const activeGpsLocation = {
    lat: 35.6762,
    lng: 139.6503,
    accuracy: 15,
    city: 'Tokyo',
    country: 'Giappone',
    updatedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minuti fa
    publisherDeviceId: 'dev-1234567890123456',
    status: 'active' as const
  };

  const expiredGpsLocation = {
    lat: 35.6762,
    lng: 139.6503,
    accuracy: 15,
    city: 'Tokyo',
    country: 'Giappone',
    updatedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minuti fa (> 15m)
    publisherDeviceId: 'dev-1234567890123456',
    status: 'active' as const
  };

  return (
    <div className="w-full min-h-screen">
      <header className="p-2 bg-white border-b flex gap-2 text-xs font-bold">
        <button id="btn-tab-onboarding" onClick={() => setTab('onboarding')} className="px-2 py-1 border rounded">Onboarding</button>
        <button id="btn-tab-live-active" onClick={() => setTab('live_active')} className="px-2 py-1 border rounded">Live Attivo</button>
        <button id="btn-tab-live-inactive" onClick={() => setTab('live_inactive')} className="px-2 py-1 border rounded">Live Inattivo</button>
        <button id="btn-tab-live-expired" onClick={() => setTab('live_expired')} className="px-2 py-1 border rounded">Live Scaduto</button>
        <button id="btn-tab-app-info" onClick={() => setTab('app_info')} className="px-2 py-1 border rounded">App Info</button>
      </header>

      <main>
        {tab === 'onboarding' && (
          <OnboardingView onComplete={(cfg) => setCreatedConfig(cfg)} />
        )}

        {tab === 'live_active' && (
          <LiveEditorialExperience
            isExternal={true}
            onBack={() => {}}
            location="Tokyo"
            realLocation={activeGpsLocation}
            remoteGpsLocation={activeGpsLocation}
            mapSearchUrl="https://maps.google.com"
            tileGrid={null}
            tileLoadFailed={false}
            onTileError={() => {}}
            gpsError={null}
            isDetectingGps={false}
            canControlGps={false}
            deviceLabel="Ospite"
            liveIntelligence={mockPlannedIntel as any}
            statusMessage="In viaggio verso Kyoto"
            statusUpdatedAt="2 minuti fa"
            canPublish={false}
            isEditingStatus={false}
            tempStatus=""
            onTempStatusChange={() => {}}
            onToggleStatusEdit={() => {}}
            onSaveStatus={() => {}}
            liveTextMessage=""
            onLiveTextChange={() => {}}
            isPublishingUpdate={false}
            onPublishLiveText={() => {}}
            quickReactions={['❤️']}
            reactionPendingKey={null}
            onAddReaction={() => {}}
            updates={[]}
            onDeleteUpdate={() => {}}
            guestMessages={[]}
            onSendGuestMessage={async () => {}}
            isPrivileged={false}
            onOpenUploadModal={() => {}}
          />
        )}

        {tab === 'live_inactive' && (
          <LiveEditorialExperience
            isExternal={true}
            onBack={() => {}}
            location="Tokyo"
            realLocation={null}
            remoteGpsLocation={null}
            mapSearchUrl="https://maps.google.com"
            tileGrid={null}
            tileLoadFailed={false}
            onTileError={() => {}}
            gpsError={null}
            isDetectingGps={false}
            canControlGps={false}
            deviceLabel="Ospite"
            liveIntelligence={mockPlannedIntel as any}
            statusMessage="Pausa"
            statusUpdatedAt="Pochi istanti fa"
            canPublish={false}
            isEditingStatus={false}
            tempStatus=""
            onTempStatusChange={() => {}}
            onToggleStatusEdit={() => {}}
            onSaveStatus={() => {}}
            liveTextMessage=""
            onLiveTextChange={() => {}}
            isPublishingUpdate={false}
            onPublishLiveText={() => {}}
            quickReactions={['❤️']}
            reactionPendingKey={null}
            onAddReaction={() => {}}
            updates={[]}
            onDeleteUpdate={() => {}}
            guestMessages={[]}
            onSendGuestMessage={async () => {}}
            isPrivileged={false}
            onOpenUploadModal={() => {}}
          />
        )}

        {tab === 'live_expired' && (
          <LiveEditorialExperience
            isExternal={true}
            onBack={() => {}}
            location="Tokyo"
            realLocation={expiredGpsLocation}
            remoteGpsLocation={expiredGpsLocation}
            mapSearchUrl="https://maps.google.com"
            tileGrid={null}
            tileLoadFailed={false}
            onTileError={() => {}}
            gpsError={null}
            isDetectingGps={false}
            canControlGps={false}
            deviceLabel="Ospite"
            liveIntelligence={mockPlannedIntel as any}
            statusMessage="In viaggio"
            statusUpdatedAt="Oggi alle 14:00"
            canPublish={false}
            isEditingStatus={false}
            tempStatus=""
            onTempStatusChange={() => {}}
            onToggleStatusEdit={() => {}}
            onSaveStatus={() => {}}
            liveTextMessage=""
            onLiveTextChange={() => {}}
            isPublishingUpdate={false}
            onPublishLiveText={() => {}}
            quickReactions={['❤️']}
            reactionPendingKey={null}
            onAddReaction={() => {}}
            updates={[]}
            onDeleteUpdate={() => {}}
            guestMessages={[]}
            onSendGuestMessage={async () => {}}
            isPrivileged={false}
            onOpenUploadModal={() => {}}
          />
        )}

        {tab === 'app_info' && (
          <div className="p-4">
            <AppInfoButton />
            <AppInfoModal />
          </div>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<TestApp />);
`);

(async () => {
  let server;
  let browser;

  try {
    const { createServer } = await import('vite');
    server = await createServer({
      root,
      server: { host: '127.0.0.1', port: 0 },
      logLevel: 'error'
    });
    await server.listen();
    const actualPort = server.httpServer.address().port;

    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox']
    });

    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    const fixtureUrl = `http://127.0.0.1:${actualPort}/${path.basename(fixture)}/index.html`;
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: ONBOARDING GOOGLE-FIRST E CREA VIAGGIO
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 1] Verifica Onboarding Google-First...');
    // Clicca "Crea un nuovo viaggio"
    await page.click('button:has-text("Crea un nuovo viaggio")');
    await page.waitForSelector('text=Crea un Viaggio');

    // Verifica presenza della schermata Google-first senza riferimenti tecnici ad "Accesso Rapido Dispositivo"
    const contentText = await page.innerText('body');
    assert.doesNotMatch(contentText, /Accesso Rapido Dispositivo/i, 'Nessun riferimento tecnico "Accesso Rapido Dispositivo" nel flusso Google-first');
    assert.match(contentText, /Continua con Google/i, 'Pulsante Continua con Google visibile');
    assert.match(contentText, /Oppure continua senza account Google/i, 'Opzione alternativa discreta presente');

    // Clicca su opzione continua senza Google per accedere al form
    await page.click('button:has-text("Oppure continua senza account Google")');
    await page.waitForSelector('text=Nuovo Viaggio');
    console.log('✓ TEST 1 Superato: Flusso Google-first e assenza di termini tecnici confermati.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: SAFARI iOS INPUT DATE VIEWPORTS 375, 390, 402, 430px & VALIDAZIONE
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 2] Verifica layout campi Partenza/Rientro e convalida date...');
    const viewports = [
      { width: 375, height: 667, name: 'iPhone SE (375px)' },
      { width: 390, height: 844, name: 'iPhone 13/14 (390px)' },
      { width: 402, height: 874, name: 'iPhone 16 Pro (402px)' },
      { width: 430, height: 932, name: 'iPhone 16 Pro Max (430px)' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(150);

      const metrics = await page.evaluate(() => {
        const docEl = document.documentElement;
        const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
        const formCard = document.querySelector('form')?.closest('.rounded-3xl');
        const cardRect = formCard ? formCard.getBoundingClientRect() : null;

        const inputsOverflow = dateInputs.map(inp => {
          const rect = inp.getBoundingClientRect();
          const parentRect = inp.parentElement?.getBoundingClientRect();
          return {
            width: rect.width,
            parentWidth: parentRect?.width || 0,
            overflowsParent: rect.right > (parentRect?.right || 0) + 1,
            cardRight: cardRect?.right || 0,
            overflowsCard: rect.right > (cardRect?.right || 0) + 1
          };
        });

        return {
          scrollWidth: docEl.scrollWidth,
          innerWidth: window.innerWidth,
          hasHorizontalScroll: docEl.scrollWidth > window.innerWidth,
          inputsOverflow
        };
      });

      console.log(`  -> ${vp.name}: scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth}`);
      assert.ok(
        metrics.scrollWidth <= metrics.innerWidth + 1,
        `Rilevato overflow orizzontale su ${vp.name}: scrollWidth ${metrics.scrollWidth} > innerWidth ${metrics.innerWidth}`
      );

      for (const inp of metrics.inputsOverflow) {
        assert.ok(!inp.overflowsCard, `Input date supera il bordo destro del contenitore card su ${vp.name}`);
      }
    }

    // Convalida: rientro antecedente alla partenza
    const startDateInput = page.locator('input[type="date"]').first();
    const endDateInput = page.locator('input[type="date"]').nth(1);
    const titleInput = page.locator('input[placeholder*="Giappone"]');
    const ownerInput = page.locator('input[placeholder*="Mario Rossi"]');

    await titleInput.fill('Viaggio Test 2026');
    await ownerInput.fill('Mario Rossi');
    await startDateInput.fill('2026-11-20');
    await endDateInput.fill('2026-11-10'); // Antecedente!

    await page.click('button:has-text("Crea Viaggio e Prosegui")');
    await page.waitForSelector('[role="alert"]');
    const alertText = await page.innerText('[role="alert"]');
    console.log(`  -> Messaggio validazione data: "${alertText}"`);
    assert.match(alertText, /non può precedere la partenza|non può essere antecedente/i, 'Errore leggibile visualizzato');

    console.log('✓ TEST 2 Superato: Zero scroll orizzontale su 375/390/402/430px e validazione data funzionante.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: LIVE OSPITI GPS (ATTIVO, INATTIVO, SCADUTO, DESTINAZIONE PROGRAMMATA)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 3] Verifica LIVE Ospiti e visualizzazione GPS...');

    // Scenario A: LIVE GPS ATTIVO
    await page.click('#btn-tab-live-active');
    await page.waitForSelector('text=GPS attivo');
    const activeText = await page.innerText('body');
    assert.match(activeText, /GPS attivo/i, 'Indicatore GPS attivo visibile all’ospite');
    assert.match(activeText, /Tokyo/i, 'Città posizione visibile');
    assert.match(activeText, /Ultimo aggiornamento/i, 'Orario ultimo aggiornamento visibile');
    // Verifica marker "Dove siamo" visibile
    const gpsMarkerPulse = page.locator('.hounigo-live-gps-confirmed');
    await assert.doesNotReject(gpsMarkerPulse.waitFor({ state: 'visible' }), 'Marker "Dove siamo" presente sulla mappa');

    // Scenario B: LIVE GPS INATTIVO / NON CONDIVISO
    await page.click('#btn-tab-live-inactive');
    await page.waitForSelector('text=Posizione non condivisa al momento');
    const inactiveText = await page.innerText('body');
    assert.match(inactiveText, /Posizione non condivisa al momento/i, 'Testo "Posizione non condivisa al momento" visibile');
    assert.match(inactiveText, /Grand Hotel Kyoto/i, 'Destinazione da programma visibile');
    assert.match(inactiveText, /Destinazione da programma \(non GPS\)/i, 'Destinazione programmata chiaramente distinta dal GPS');
    // Marker GPS NON deve essere presente
    assert.equal(await page.locator('.hounigo-live-gps-confirmed').count(), 0, 'Marker GPS non deve essere renderizzato quando inattivo');

    // Scenario C: LIVE GPS SCADUTO (> 15 MIN)
    await page.click('#btn-tab-live-expired');
    await page.waitForSelector('text=Posizione non condivisa al momento');
    const expiredText = await page.innerText('body');
    assert.match(expiredText, /Posizione non condivisa al momento/i, 'Posizione scaduta oltre 15m trattata come non condivisa');
    assert.equal(await page.locator('.hounigo-live-gps-confirmed').count(), 0, 'Marker GPS non visibile per posizione scaduta');

    console.log('✓ TEST 3 Superato: LIVE Ospiti distingue GPS attivo, non condiviso, scaduto e destinazione programmata.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: GOOGLE PICKER STATUS & METADATA VERSIONING
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[TEST 4] Verifica configurazione Google Picker e orario ⓘ...');
    const evalData = await page.evaluate(() => {
      const api = window.testClosureApi;
      const pickerStatus = api.getGooglePickerConfigStatus();
      return {
        pickerConfigured: pickerStatus.isConfigured,
        pickerClientId: pickerStatus.clientId,
        appVersion: api.APP_VERSION,
        isoTimestamp: api.RELEASE_TIMESTAMP_ISO,
        formattedTime: api.FORMATTED_RELEASE_TIME,
        releaseTimeOnly: api.formatReleaseTimeOnly(api.RELEASE_TIMESTAMP_ISO)
      };
    });

    console.log('  -> Dati Picker e Release:', evalData);
    assert.ok(evalData.pickerConfigured, 'Google Picker deve risultare configurato con credenziali presenti');
    assert.match(evalData.pickerClientId, /620099578563.*apps\.googleusercontent\.com/, 'Client ID OAuth valido');
    assert.match(evalData.appVersion, /^1\.\d+\.\d+$/, 'Versione SemVer presente');
    assert.match(evalData.isoTimestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Timestamp ISO valido');
    assert.match(evalData.releaseTimeOnly, /^\d{2}:\d{2}$/, 'Orario effettivo release estratto correttamente');

    // Apri modale App Info
    await page.click('#btn-tab-app-info');
    await page.click('button[aria-label="Informazioni su HOUNIGO"]');
    await page.waitForSelector('text=Informazioni su HOUNIGO');
    const modalText = await page.innerText('body');
    assert.match(modalText, /HOUNIGO v/i, 'Versione presente nel modale');
    assert.match(modalText, /Data di pubblicazione:/i, 'Data di pubblicazione esplicitata');
    assert.match(modalText, /Ora effettiva release:/i, 'Ora effettiva release esplicitata');

    console.log('✓ TEST 4 Superato: Google Picker configurato e modale ⓘ con versione, data e ora locale verificati.');

    console.log('\n======================================================');
    console.log('TUTTI I TEST DI CHIUSURA BETA 1.6.0 SUPERATI CON SUCCESSO!');
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
