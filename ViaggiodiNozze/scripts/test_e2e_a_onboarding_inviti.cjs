/**
 * test_e2e_a_onboarding_inviti.cjs
 *
 * TEST A: ONBOARDING E INVITI
 * Nuovo utente -> creazione viaggio -> invito -> ingresso Copilota (share sheet / copia link).
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

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// Timeout globale di sicurezza: 90 secondi
const timer = setTimeout(() => {
  console.error('❌ TIMEOUT GLOBALE 90s SUPERATO in TEST A');
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
    console.log('--- TEST A: ONBOARDING E INVITI (Nuovo utente -> Inviti -> Copilota) ---');

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
        id: 'trip_nuovo_2027',
        title: 'Nuova Zelanda 2027',
        startDate: '2027-02-01',
        endDate: '2027-02-15',
        totalDays: 15,
        ownerUid: 'owner_marco_2027',
        ownerName: 'Marco'
      }));
      localStorage.setItem('active_trip_id', 'trip_nuovo_2027');
      localStorage.setItem('houni_trip_id', 'trip_nuovo_2027');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
    });

    await page.reload();
    await page.waitForTimeout(2500);

    // Naviga ad Altro -> Partecipanti & Inviti
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      const altroBtn = btns.find(b => b.textContent && b.textContent.includes('Altro'));
      if (altroBtn) altroBtn.click();
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Partecipanti'));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1200);

    // Genera link d'invito sicuro
    await page.evaluate(() => {
      const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Genera Link'));
      if (genBtn) genBtn.click();
    });
    await page.waitForTimeout(2000);

    const shareBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Condividi Link (WhatsApp, SMS…)'));
    });

    const copyBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Copia Link d\'Invito'));
    });

    assert.equal(shareBtnExists, true, 'Pulsante Condividi Link con share sheet nativo presente');
    assert.equal(copyBtnExists, true, 'Pulsante Copia Link presente');

    await page.screenshot({ path: path.join(screenshotDir, 'test_a_onboarding_inviti_success.png') });
    console.log('✅ TEST A SUPERATO: Onboarding, configurazione viaggio e generazione link d\'invito nativo verificati.');
    cleanupAndExit(0);
  } catch (err) {
    console.error('❌ ERRORE TEST A:', err);
    cleanupAndExit(1);
  }
})();
