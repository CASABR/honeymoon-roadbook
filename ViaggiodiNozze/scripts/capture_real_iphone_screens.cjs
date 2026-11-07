const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9238;
const BASE_URL = 'http://localhost:4188/honeymoon-roadbook/';
const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity\\brain\\d1e39d97-0426-46d3-8997-c8e3fadd549e';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP method ${method} timed out after 10s`));
      }, 10000);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timeout); resolve(val); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    this.ws.close();
  }
}

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buffer = Buffer.from(result.data, 'base64');
  const targetPath = path.join(ARTIFACT_DIR, filename);
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  fs.writeFileSync(targetPath, buffer);
  fs.writeFileSync(localPath, buffer);
  console.log(`[SCREENSHOT] Salvato: ${filename} (${buffer.length} bytes)`);
}

async function setViewport(cdp, width, height, isMobile = true) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: isMobile
  });
  await sleep(300);
}

async function run() {
  console.log('=== CATTURA SCREENSHOT REALI IPHONE 15 (CONSOLIDAMENTO) ===\n');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-iphone-final'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        const pageTarget = list.find(t => t.type === 'page') || list[0];
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  console.log('[CDP] Connesso con successo a:', wsUrl);
  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    await setViewport(cdp, 393, 852, true);
    console.log('[CDP] Navigazione a', BASE_URL);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // 1. Schermata di Onboarding / Primo Accesso
    await captureScreenshot(cdp, 'real_iphone15_primo_accesso.png');

    // Iniezione sessione per entrare in OggiView
    console.log('[CDP] Iniezione sessione viaggio...');
    await cdp.eval(`(() => {
      try {
        localStorage.setItem('houni_trip_id', '0000');
        localStorage.setItem('houni_device_role', 'organizer');
        localStorage.setItem('houni_authenticated', 'true');
        localStorage.setItem('houni_pin_authenticated', 'true');
        localStorage.setItem('auth_pin_verified', 'true');
        localStorage.setItem('walkthrough_seen', 'true');
        localStorage.setItem('houni_onboarding_completed_v1', 'true');
        localStorage.setItem('theme', 'light');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('hounigo_trip_config', JSON.stringify({
          id: '0000',
          title: 'Giappone & Polinesia',
          startDate: '2026-11-28',
          endDate: '2026-12-18',
          ownerName: 'Nunzio & Giusy'
        }));
      } catch (e) {
        console.error('Storage error', e);
      }
    })()`);
    await cdp.send('Page.reload');
    await sleep(2500);

    // 2. Schermata Oggi Popolata con Header pulito, Campanella a 3 stati e pulsante "+ Aggiungi"
    await captureScreenshot(cdp, 'real_iphone15_oggi_timeline.png');

    // 3. Apertura Modale Categorie tramite "+ Aggiungi"
    console.log('[CDP] Click su + Aggiungi...');
    await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find(b => b.textContent && b.textContent.includes('Aggiungi') && !b.textContent.includes('Spesa'));
      if (addBtn) addBtn.click();
    })()`);
    await sleep(600);
    await captureScreenshot(cdp, 'real_iphone15_categorie_modal.png');

    // Chiusura modale categorie
    await cdp.eval(`(() => {
      const closeBtn = document.querySelector('button[aria-label="Chiudi"]');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(400);

    // 4. Apertura Modale Notifiche tramite Campanella nell'Header
    console.log('[CDP] Click su Campanella Header...');
    await cdp.eval(`(() => {
      const bell = document.querySelector('button[aria-label*="Notifiche"]');
      if (bell) bell.click();
    })()`);
    await sleep(600);
    await captureScreenshot(cdp, 'real_iphone15_campanella_modal.png');

    console.log('\n=== CATTURA SCREENSHOT REALI IPHONE COMPLETATA CON SUCCESSO ===');
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
