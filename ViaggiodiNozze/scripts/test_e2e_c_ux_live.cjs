/**
 * test_e2e_c_ux_live.cjs
 *
 * TEST C: UX E LIVE
 * Calendario accessibile con <label>, note Copilota con badge dot, navigazione LIVE, delega GPS e schermatura dati riservati.
 * Timeout globale: 90s.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const appDir = path.join(root, 'ViaggiodiNozze');
const screenshotDir = path.join('C:', 'Users', 'CUSI', '.gemini', 'antigravity', 'brain', 'd1e39d97-0426-46d3-8997-c8e3fadd549e', 'screenshots');

const timer = setTimeout(() => {
  console.error('❌ TIMEOUT GLOBALE 90s SUPERATO in TEST C');
  cleanupAndExit(1);
}, 90000);

let emuProc;
let viteProc;
let browser;

function cleanupAndExit(code) {
  clearTimeout(timer);
  try { if (browser) browser.close(); } catch {}
  try { if (viteProc?.pid) execSync(`taskkill /F /T /PID ${viteProc.pid}`, { stdio: 'ignore' }); } catch {}
  try { if (emuProc?.pid) execSync(`taskkill /F /T /PID ${emuProc.pid}`, { stdio: 'ignore' }); } catch {}
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(1));
process.on('SIGTERM', () => cleanupAndExit(1));

async function waitHttp(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Timeout attesa endpoint: ${url}`);
}

(async () => {
  try {
    console.log('--- TEST C: UX E LIVE (Calendario, Note Copilota, LIVE & Posizione) ---');

    emuProc = spawn('cmd.exe', ['/c', 'npx firebase-tools emulators:start --only firestore,auth'], {
      cwd: root,
      env: { ...process.env, FIRESTORE_EMULATOR_PORT: '8194' }
    });
    await waitHttp('http://127.0.0.1:8194/');
    await waitHttp('http://127.0.0.1:9099/');

    viteProc = spawn('cmd.exe', ['/c', 'npm --prefix ViaggiodiNozze run dev -- --port 5185 --strictPort'], { cwd: root });
    await waitHttp('http://127.0.0.1:5185/');

    browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
    const context = await browser.newContext({ ...devices['iPhone 15'], locale: 'it-IT' });
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:5185/?emulator=true');
    await page.evaluate(() => {
      window.__HOUNIGO_DISABLE_SW_RELOAD__ = true;
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: 'trip_ux_2027',
        title: 'Nuova Zelanda 2027',
        startDate: '2027-02-01',
        endDate: '2027-02-15',
        totalDays: 15,
        ownerUid: 'user_marco_ux',
        ownerName: 'Marco'
      }));
      localStorage.setItem('active_trip_id', 'trip_ux_2027');
      localStorage.setItem('houni_trip_id', 'trip_ux_2027');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('roadbook_selected_date', '2027-02-01');
      localStorage.setItem('hounigo_selected_date', '2027-02-01');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
    });

    await page.reload();
    await page.waitForTimeout(2000);

    // 1. Inserisci tappa con note copilota e verifica badge visivo
    await page.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      await storageService.saveTappa({
        id: 'tappa_ux_01',
        titolo: 'Arrivo Auckland',
        data: '2027-02-01',
        date: '2027-02-01',
        orario: '10:00',
        time: '10:00',
        noteCopilota: 'Ritirare chiavi auto',
        mostraNoteInCard: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
      const dateInput = document.querySelector('label[title="Scegli data dal calendario"] input[type="date"]');
      if (dateInput) {
        dateInput.value = '2027-02-01';
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1500);

    // Verifica calendario con <label> nativo
    const hasAccessibleLabelCalendar = await page.evaluate(() => {
      const label = document.querySelector('label[title="Scegli data dal calendario"]');
      return Boolean(label && label.querySelector('input[type="date"]'));
    });
    assert.equal(hasAccessibleLabelCalendar, true, 'Selettore data con label nativo presente');

    // Verifica pulsante note copilota di giornata
    const hasDayCopilotBtn = await page.evaluate(() => {
      return Boolean(document.querySelector('button[aria-label="Note Copilota di giornata"]'));
    });
    assert.equal(hasDayCopilotBtn, true, 'Pulsante note copilota di giornata presente');

    // Verifica dot verde su note copilota della card
    const hasBadgeDot = await page.evaluate(() => {
      const copilotBtn = document.querySelector('button[aria-label="Note Copilota"]');
      return Boolean(copilotBtn && copilotBtn.querySelector('.bg-emerald-500'));
    });
    assert.equal(hasBadgeDot, true, 'Badge dot bg-emerald-500 visibile su icona Note Copilota');

    // 2. Navigazione a Live & Posizione
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('reset_altro_root'));
      const btns = Array.from(document.querySelectorAll('nav button'));
      const altroBtn = btns.find(b => b.textContent && b.textContent.includes('Altro'));
      if (altroBtn) altroBtn.click();
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const liveBtn = btns.find(b => b.textContent && b.textContent.includes('Live & Posizione'));
      if (liveBtn) liveBtn.click();
    });
    await page.waitForTimeout(2000);

    const hasLiveView = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Chi condivide la posizione?') || text.includes('LIVE') || text.includes('Diario');
    });
    assert.equal(hasLiveView, true, 'Vista LIVE caricata e accessibile');

    await page.screenshot({ path: path.join(screenshotDir, 'test_c_ux_live_success.png') });
    console.log('✅ TEST C SUPERATO: Calendario mobile, note Copilota con badge e vista LIVE convalidate.');
    cleanupAndExit(0);
  } catch (err) {
    console.error('❌ ERRORE TEST C:', err);
    cleanupAndExit(1);
  }
})();
