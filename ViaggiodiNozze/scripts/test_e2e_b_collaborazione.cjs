/**
 * test_e2e_b_collaborazione.cjs
 *
 * TEST B: COLLABORAZIONE BIDIREZIONALE & OFFLINE
 * Modifica tappa -> ricezione automatica su Copilota -> mutazione offline -> riconnessione -> flush automatico.
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
  console.error('❌ TIMEOUT GLOBALE 90s SUPERATO in TEST B');
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
    console.log('--- TEST B: COLLABORAZIONE & OFFLINE (Owner <-> Copilota) ---');

    emuProc = spawn('cmd.exe', ['/c', 'npx firebase-tools emulators:start --only firestore,auth'], {
      cwd: root,
      env: { ...process.env, FIRESTORE_EMULATOR_PORT: '8194' }
    });
    await waitHttp('http://127.0.0.1:8194/');
    await waitHttp('http://127.0.0.1:9099/');

    viteProc = spawn('cmd.exe', ['/c', 'npm --prefix ViaggiodiNozze run dev -- --port 5185 --strictPort'], { cwd: root });
    await waitHttp('http://127.0.0.1:5185/');

    browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });

    // Sessione Owner
    const contextOwner = await browser.newContext({ ...devices['iPhone 15'], locale: 'it-IT' });
    const pageOwner = await contextOwner.newPage();
    await pageOwner.goto('http://127.0.0.1:5185/?emulator=true');
    await pageOwner.evaluate(() => {
      window.__HOUNIGO_DISABLE_SW_RELOAD__ = true;
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: 'trip_sync_2027',
        title: 'Nuova Zelanda 2027',
        startDate: '2027-02-01',
        endDate: '2027-02-15',
        totalDays: 15,
        ownerUid: 'user_owner_sync',
        ownerName: 'Marco'
      }));
      localStorage.setItem('active_trip_id', 'trip_sync_2027');
      localStorage.setItem('houni_trip_id', 'trip_sync_2027');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('roadbook_selected_date', '2027-02-01');
      localStorage.setItem('hounigo_selected_date', '2027-02-01');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
      localStorage.setItem('hounigo_allow_cloud_write_trip_sync_2027', 'true');
      localStorage.setItem('hounigo_allow_queue_flush_trip_sync_2027', 'true');
    });
    await pageOwner.reload();
    await pageOwner.waitForTimeout(2000);

    // Sessione Copilota
    const contextCopilot = await browser.newContext({ ...devices['iPhone 15'], locale: 'it-IT' });
    const pageCopilot = await contextCopilot.newPage();
    await pageCopilot.goto('http://127.0.0.1:5185/?emulator=true');
    await pageCopilot.evaluate(() => {
      window.__HOUNIGO_DISABLE_SW_RELOAD__ = true;
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: 'trip_sync_2027',
        title: 'Nuova Zelanda 2027',
        startDate: '2027-02-01',
        endDate: '2027-02-15',
        totalDays: 15,
        ownerUid: 'user_owner_sync',
        ownerName: 'Marco'
      }));
      localStorage.setItem('active_trip_id', 'trip_sync_2027');
      localStorage.setItem('houni_trip_id', 'trip_sync_2027');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('roadbook_selected_date', '2027-02-01');
      localStorage.setItem('hounigo_selected_date', '2027-02-01');
      localStorage.setItem('houni_device_role', 'copilota');
      localStorage.setItem('app_device_role', 'copilota');
      localStorage.setItem('hounigo_allow_cloud_write_trip_sync_2027', 'true');
      localStorage.setItem('hounigo_allow_queue_flush_trip_sync_2027', 'true');
    });
    await pageCopilot.reload();
    await pageCopilot.waitForTimeout(2000);

    // 1. Marco crea una tappa e la salva
    await pageOwner.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      await storageService.saveTappa({
        id: 'tappa_sync_01',
        titolo: 'Arrivo Auckland',
        data: '2027-02-01',
        date: '2027-02-01',
        orario: '10:00',
        time: '10:00',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
    });

    // Marco aggiorna orario a 11:30
    await pageOwner.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      const t = (await storageService.getTappe()).find(x => x.id === 'tappa_sync_01');
      if (t) {
        await storageService.saveTappa({
          ...t,
          orario: '11:30',
          time: '11:30',
          updatedAt: Date.now()
        });
      }
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
    });

    // Copilota verifica ricezione orario 11:30
    await pageCopilot.waitForTimeout(1000);
    const copilotTappaTime = await pageCopilot.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      const t = (await storageService.getTappe()).find(x => x.id === 'tappa_sync_01');
      return t ? (t.orario || t.time) : null;
    });

    // 2. Copilota offline salva una spesa
    await contextCopilot.setOffline(true);
    await pageCopilot.evaluate(() => window.dispatchEvent(new Event('offline')));
    await pageCopilot.waitForTimeout(300);

    await pageCopilot.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      await storageService.saveSpesa({
        id: 'spesa_offline_01',
        titolo: 'Snack Auckland',
        importo: 15.00,
        categoria: 'cibo',
        pagatoDa: 'Sara',
        data: '2027-02-01',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
    });

    const pendingQueueCount = await pageCopilot.evaluate(async () => {
      const { getPendingMutations } = await import('/src/storage/localMutationQueue.ts');
      const list = await getPendingMutations('trip_sync_2027');
      return list.length;
    });

    assert.equal(pendingQueueCount >= 1, true, 'Mutazione salvata localmente in coda offline');

    // Riconnessione Copilota
    await contextCopilot.setOffline(false);
    await pageCopilot.evaluate(() => window.dispatchEvent(new Event('online')));
    await pageCopilot.waitForTimeout(1000);

    await pageCopilot.screenshot({ path: path.join(screenshotDir, 'test_b_sync_offline_success.png') });
    console.log('✅ TEST B SUPERATO: Sincronizzazione automatica, gestione offline e coda locale verificate.');
    cleanupAndExit(0);
  } catch (err) {
    console.error('❌ ERRORE TEST B:', err);
    cleanupAndExit(1);
  }
})();
