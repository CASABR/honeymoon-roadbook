const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223; // Different port to avoid conflict
const VITE_PORT = 5173;
const BASE_URL = `http://localhost:${VITE_PORT}`;

const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\62bf6247-9ed9-4d56-890b-a2a63fe7702a\\screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  console.log(`[CDP] Invio Page.captureScreenshot per ${filename}...`);
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
  console.log('=== CATTURA REDESIGN OGGI (iPhone 15 Pro 393px & Desktop) ===\n');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-oggi-redesign'
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
    console.log('[CDP] Navigazione a', `${BASE_URL}/`);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(2500);

    // Setup sessione autenticata con dati sintetici
    console.log('[CDP] Iniezione impostazioni sessione...');
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
          title: 'Nuova Zelanda & Australia 2026',
          startDate: '2026-11-28',
          endDate: '2027-01-10',
          ownerName: 'Nunzio & Giusy'
        }));
      } catch (e) {
        console.error('Storage setup error', e);
      }
    })()`);
    await cdp.send('Page.reload');
    await sleep(2500);

    // 1. Mobile iPhone 15 Pro (393 x 852)
    console.log('[SCREENSHOT] Impostazione viewport mobile 393x852...');
    await setViewport(cdp, 393, 852, true);
    await sleep(600);
    await captureScreenshot(cdp, 'oggi_redesign_mobile_393.png');

    // 2. Desktop (1280 x 800)
    console.log('[SCREENSHOT] Impostazione viewport desktop 1280x800...');
    await setViewport(cdp, 1280, 800, false);
    await sleep(600);
    await captureScreenshot(cdp, 'oggi_redesign_desktop_1280.png');

    // Misura altezza elementi chiave
    const metrics = await cdp.eval(`(() => {
      const header = document.querySelector('header');
      const hero = document.querySelector('.bg-emerald-500') || document.querySelector('.bg-indigo-600') || document.querySelector('.bg-amber-500');
      const scadenze = document.querySelector('[title*="scadenze"]') || document.querySelector('.animate-pulse');
      return {
        headerHeight: header ? header.getBoundingClientRect().height : null,
        totalTopOffset: hero ? hero.getBoundingClientRect().top : null
      };
    })()`);
    console.log('[METRICS] Nuova altezza header:', metrics);

    console.log('\n=== CATTURA REDESIGN COMPLETATA CON SUCCESSO ===');
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
