/**
 * capture_pdf_export_screenshots.cjs
 * Cattura screenshot del modale di esportazione PDF e della visualizzazione dello strumento PDF in HOUNIGO.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
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
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false
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
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
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
  await sleep(250);
}

async function run() {
  console.log('=== CATTURA SCREENSHOT ESPORTAZIONE PDF HOUNIGO ===\n');

  let viteProc = null;
  let viteRunning = false;
  try {
    const testRes = await fetch(`${BASE_URL}/`);
    if (testRes.ok) viteRunning = true;
  } catch {}

  if (!viteRunning) {
    console.log('[INFO] Avvio Vite Dev su porta ' + VITE_PORT);
    viteProc = spawn('npm.cmd', ['run', 'dev', '--', '--port', String(VITE_PORT), '--strictPort'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await sleep(600);
      try {
        const r = await fetch(`${BASE_URL}/`);
        if (r.ok) {
          viteRunning = true;
          break;
        }
      } catch {}
    }
  }

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-pdf'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  console.log('[CDP] Connesso con successo!');
  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    // Naviga a home
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1500);

    // Setup authenticated session with synthetic trip
    await cdp.eval(`
      localStorage.setItem('houni_trip_id', 'synthetic_trip');
      localStorage.setItem('houni_device_role', 'organizer');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hounigo_trip_config', JSON.stringify({
        id: 'synthetic_trip',
        title: 'Giappone & Polinesia 2026',
        startDate: '2026-06-10',
        endDate: '2026-07-15',
        ownerName: 'Tester Hounigo'
      }));
    `);
    await cdp.send('Page.reload');
    await sleep(2500);

    // Imposta viewport Mobile 393px (iPhone 14)
    await setViewport(cdp, 393, 852, true);
    await sleep(500);

    // 1. Apri modale PDF tramite evento o click su pulsante
    console.log('[STEP 1] Apertura modale esportazione PDF...');
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('open_pdf_export'));
    `);
    await sleep(700);

    // Cattura screenshot modale PDF su 393px
    await captureScreenshot(cdp, 'screenshot_pdf_modal_393.png');

    // Desktop viewport modale PDF
    await setViewport(cdp, 1200, 800, false);
    await sleep(400);
    await captureScreenshot(cdp, 'screenshot_pdf_modal_desktop.png');

    // Chiudi modale
    await cdp.eval(`
      const closeBtn = document.querySelector('button[aria-label="Chiudi"], .fixed button svg path[d*="M6 18L18 6"]')?.closest('button');
      if (closeBtn) closeBtn.click();
    `);
    await sleep(400);

    // 2. Vai a sezione Altro per verificare scheda PDF Export in Strumenti di Viaggio
    console.log('[STEP 2] Verifica sezione Altro (Strumenti di Viaggio)...');
    await setViewport(cdp, 393, 852, true);
    await cdp.eval(`
      const btnAltro = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent && el.textContent.includes('Altro'));
      if (btnAltro) btnAltro.click();
    `);
    await sleep(800);
    await captureScreenshot(cdp, 'screenshot_pdf_altro_393.png');

    // 3. Visualizzazione e screenshot del PDF Roadbook generato
    console.log('[STEP 3] Rendering visivo del PDF generato...');
    const pdfPath = 'file:///C:/Users/CUSI/.gemini/antigravity-ide/brain/62bf6247-9ed9-4d56-890b-a2a63fe7702a/HOUNIGO_Itinerario_Sintetico_Preview.pdf';
    await setViewport(cdp, 1000, 1400, false);
    await cdp.send('Page.navigate', { url: pdfPath });
    await sleep(2000);
    await captureScreenshot(cdp, 'screenshot_pdf_roadbook_render.png');

    console.log('\n[SUCCESS] Tutti gli screenshot catturati con successo!');
  } finally {
    cdp.close();
    chromeProc.kill();
    if (viteProc) viteProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]:', err);
  process.exit(1);
});
