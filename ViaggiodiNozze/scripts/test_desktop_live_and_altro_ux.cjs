/**
 * test_desktop_live_and_altro_ux.cjs
 *
 * Test di validazione UX Desktop LIVE e Riordino Altro:
 * 1. Verifica strutturale 5 sezioni di AltroView e Google Drive link
 * 2. Verifica reattività vista LIVE Ospiti a 390px, 768px e 1440px
 * 3. Assenza e ingombro zero del banner su mobile (390px) e tablet (768px)
 * 4. Presenza banner elegante e layout panoramico a 2 colonne su desktop (1440px)
 * 5. Distinzione chiara: Posizione Attuale vs Ultima Posizione Nota vs Itinerario Previsto
 * 6. Assenza credenziali private nella vista ospite
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const VITE_PORT = 5186;
const BASE_URL = `http://localhost:${VITE_PORT}`;

let viteProcess = null;
let browser = null;

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          setTimeout(check, 300);
        }
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout attesa Vite server su ${url}`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

async function runTests() {
  console.log('🚀 Avvio Test Suite UX Desktop LIVE + Riordino Altro...\n');

  // 1. VERIFICHE STATICHE / STRUTTURALI
  console.log('--- 1. VERIFICA STRUTTURALE STATICA ---');
  const altroPath = path.join(__dirname, '../src/views/AltroView.tsx');
  const liveExpPath = path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx');
  const appPath = path.join(__dirname, '../src/App.tsx');

  const altroContent = fs.readFileSync(altroPath, 'utf8');
  const liveExpContent = fs.readFileSync(liveExpPath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');

  // Verifica AltroView
  assert(altroContent.includes('Live & Posizione'), 'AltroView deve contenere Live & Posizione');
  assert(altroContent.includes('Documenti & Risorse'), 'AltroView deve contenere Documenti & Risorse');
  assert(altroContent.includes('data-google-drive-card'), 'AltroView deve contenere data-google-drive-card');
  assert(altroContent.includes('target="_blank"'), 'Google Drive deve aprire in una nuova scheda');
  assert(altroContent.includes('rel="noopener noreferrer"'), 'Google Drive deve avere rel="noopener noreferrer"');
  assert(altroContent.includes('Strumenti Utili'), 'AltroView deve contenere Strumenti Utili');
  assert(altroContent.includes('Partecipanti & Gestione Viaggio'), 'AltroView deve contenere Partecipanti & Gestione Viaggio');
  assert(altroContent.includes('Account & Impostazioni Avanzate'), 'AltroView deve contenere Account & Impostazioni Avanzate');
  console.log('  ✓ AltroView: gerarchia a 5 livelli e accesso Google Drive verificati');

  // Verifica LiveEditorialExperience
  assert(liveExpContent.includes('data-testid="desktop-live-banner"'), 'LiveEditorialExperience deve avere banner desktop con testid');
  assert(liveExpContent.includes('hidden lg:block'), 'Banner deve avere class hidden lg:block');
  assert(liveExpContent.includes('Segui il viaggio in diretta'), 'Banner deve contenere "Segui il viaggio in diretta"');
  assert(liveExpContent.includes('Posizione Attuale'), 'Deve distinguere Posizione Attuale');
  assert(liveExpContent.includes('Ultima Posizione Nota'), 'Deve distinguere Ultima Posizione Nota');
  assert(liveExpContent.includes('Itinerario Previsto'), 'Deve distinguere Itinerario Previsto');
  assert(liveExpContent.includes('lg:grid lg:grid-cols-12'), 'Layout desktop deve usare griglia a 12 colonne');
  console.log('  ✓ LiveEditorialExperience: banner responsive e distinzione stati verificati');

  // Verifica App.tsx
  assert(appContent.includes('lg:max-w-7xl'), 'App.tsx deve supportare max-w-7xl su lg:');
  console.log('  ✓ App.tsx: container responsive fino a 7xl verificato');

  // 2. AVVIO VITE DEV SERVER
  console.log('\n--- 2. AVVIO VITE DEV SERVER ---');
  const viteBin = path.join(__dirname, '../node_modules/vite/bin/vite.js');
  viteProcess = spawn('node', [viteBin, '--port', String(VITE_PORT), '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    shell: true
  });

  await waitForServer(BASE_URL);
  console.log(`  ✓ Vite attivo su ${BASE_URL}`);

  // 3. E2E BROWSER TESTS
  browser = await chromium.launch({ headless: true });

  // TEST A: Smartphone Viewport (390 x 844 - iPhone)
  console.log('\n--- 3. TEST A: SMARTPHONE (390 x 844) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/?tripId=0000&view=live`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForSelector('.hounigo-live-entry', { timeout: 15000 });

  const mobileBanner = await mobilePage.$('[data-testid="desktop-live-banner"]');
  assert(mobileBanner, 'Elemento banner presente nel DOM');
  const isMobileBannerVisible = await mobileBanner.isVisible();
  assert.strictEqual(isMobileBannerVisible, false, 'Il banner NON deve essere visibile su smartphone');
  const mobileBox = await mobileBanner.boundingBox();
  assert(mobileBox === null || mobileBox.height === 0, 'Il banner su smartphone non deve occupare spazio');
  console.log('  ✓ Smartphone: banner invisibile con ingombro ZERO');

  // TEST B: Tablet Viewport (768 x 1024 - iPad)
  console.log('\n--- 4. TEST B: TABLET (768 x 1024) ---');
  const tabletContext = await browser.newContext({
    viewport: { width: 768, height: 1024 }
  });
  const tabletPage = await tabletContext.newPage();
  await tabletPage.goto(`${BASE_URL}/?tripId=0000&view=live`, { waitUntil: 'domcontentloaded' });
  await tabletPage.waitForSelector('.hounigo-live-entry', { timeout: 15000 });

  const tabletBanner = await tabletPage.$('[data-testid="desktop-live-banner"]');
  assert(tabletBanner, 'Elemento banner presente nel DOM su tablet');
  const isTabletBannerVisible = await tabletBanner.isVisible();
  assert.strictEqual(isTabletBannerVisible, false, 'Il banner NON deve essere visibile su tablet (768px)');
  console.log('  ✓ Tablet: banner non visibile, leggibilità verticale preservata');

  // TEST C: Desktop Viewport (1440 x 900)
  console.log('\n--- 5. TEST C: DESKTOP (1440 x 900) ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`${BASE_URL}/?tripId=0000&view=live`, { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForSelector('.hounigo-live-entry', { timeout: 15000 });

  const desktopBanner = await desktopPage.$('[data-testid="desktop-live-banner"]');
  assert(desktopBanner, 'Elemento banner presente nel DOM su desktop');
  const isDesktopBannerVisible = await desktopBanner.isVisible();
  assert.strictEqual(isDesktopBannerVisible, true, 'Il banner DEVE essere visibile su desktop (1440px)');

  const bannerText = (await desktopBanner.innerText()).toLowerCase();
  assert(bannerText.includes('segui il viaggio in diretta'), 'Banner deve contenere "Segui il viaggio in diretta"');
  assert(bannerText.includes('posizione attuale'), 'Banner deve contenere "Posizione Attuale"');
  assert(bannerText.includes('ultima posizione nota'), 'Banner deve contenere "Ultima Posizione Nota"');
  assert(bannerText.includes('itinerario previsto'), 'Banner deve contenere "Itinerario Previsto"');
  console.log('  ✓ Desktop: banner visibile con intestazione elegante e 3 stati posizione distinti');

  // Verifica layout a 2 colonne affiancate su desktop
  const posSection = await desktopPage.$('#live-position');
  const diarySection = await desktopPage.$('#live-diary');
  assert(posSection && diarySection, 'Sezioni posizione e diario presenti');

  const posBox = await posSection.boundingBox();
  const diaryBox = await diaryBoxHelper(diarySection);
  assert(posBox && diaryBox, 'Bounding box validi');
  assert(diaryBox.x > posBox.x, `Layout affiancato: diary.x (${diaryBox.x}) deve essere maggiore di pos.x (${posBox.x})`);
  console.log(`  ✓ Desktop: layout panoramico a 2 colonne attivo (Mappa x=${Math.round(posBox.x)}, Diario x=${Math.round(diaryBox.x)})`);

  // TEST D: Schermata Altro e Google Drive Card
  console.log('\n--- 6. TEST D: SCHERMATA ALTRO E GOOGLE DRIVE ---');
  const appPage = await mobileContext.newPage();
  await appPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await appPage.evaluate(() => {
    localStorage.setItem('houni_authenticated', 'true');
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.setItem('houni_onboarding_completed_v1', 'true');
    localStorage.setItem('walkthrough_seen', 'true');
    localStorage.setItem('ios_install_prompt_dismissed', 'true');
    localStorage.setItem('roadbook_device_session_authenticated', 'true');
    localStorage.setItem('roadbook_trip_config', JSON.stringify({
      id: '0000',
      title: 'Viaggio Originale',
      startDate: '2026-11-28',
      endDate: '2027-01-10'
    }));
  });
  await appPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });

  // Clicca sulla scheda "Altro" nella NavBar
  const altroTab = await appPage.waitForSelector('nav button:has-text("Altro"), button:has-text("Altro")', { timeout: 15000 });
  await altroTab.click();

  // Verifica pulsante Google Drive
  const driveCard = await appPage.waitForSelector('[data-google-drive-card]', { timeout: 15000 });
  assert(driveCard, 'Card Google Drive deve essere presente');
  const driveHref = await driveCard.getAttribute('href');
  assert(driveHref && driveHref.includes('drive.google.com'), 'Link Google Drive deve puntare a drive.google.com');
  const driveTarget = await driveCard.getAttribute('target');
  assert.strictEqual(driveTarget, '_blank', 'Target deve essere _blank');
  console.log(`  ✓ Schermata Altro: Google Drive card presente, target="_blank", href="${driveHref}"`);

  // TEST E: Privacy Vista Ospiti
  console.log('\n--- 7. TEST E: PRIVACY VISTA OSPITI ---');
  await desktopPage.goto(`${BASE_URL}/?tripId=0000&view=live`, { waitUntil: 'domcontentloaded' });
  const pageText = await desktopPage.innerText('body');
  assert(!pageText.includes('private_credentials'), 'Nessuna stringa private_credentials esposta');
  assert(!pageText.includes('Codice PIN'), 'Nessun PIN esposto agli ospiti');
  assert(!pageText.includes('Codice PNR'), 'Nessun PNR esposto agli ospiti');
  console.log('  ✓ Vista ospiti: nessuna credenziale privata o informazione sensibile esposta');

  console.log('\n🎉 TUTTI I TEST UX DESKTOP LIVE E ALTRO SUPERATI CON SUCCESSO!');
}

async function diaryBoxHelper(diarySection) {
  return await diarySection.boundingBox();
}

async function cleanup() {
  if (browser) {
    await browser.close().catch(() => {});
  }
  if (viteProcess) {
    viteProcess.kill('SIGTERM');
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  console.error('\n❌ ERRORE TEST:', err);
  await cleanup();
  process.exit(1);
});

runTests()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n❌ ERRORE TEST:', err);
    await cleanup();
    process.exit(1);
  });
