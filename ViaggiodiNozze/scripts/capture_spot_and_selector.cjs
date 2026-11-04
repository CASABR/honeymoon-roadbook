const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9239;
const PREVIEW_PORT = 4189;
const BASE_URL = `http://localhost:${PREVIEW_PORT}/honeymoon-roadbook/`;
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
  console.log('=== AVVIO PREVIEW VITE E CATTURA SCREENSHOT IPHONE 15 ===\n');

  // Avvio Vite Preview
  const previewProc = spawn('npx.cmd', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--host', '127.0.0.1'], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: 'ignore'
  });

  await sleep(2500);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-iphone-spot'
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
    previewProc.kill();
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  console.log('[CDP] Connesso con successo a:', wsUrl);
  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    await setViewport(cdp, 393, 852, true);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // Iniezione sessione
    await cdp.eval(`(() => {
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_device_role', 'organizer');
      localStorage.setItem('houni_authenticated', 'true');
      sessionStorage.setItem('houni_onboarding_dismissed', 'true');
    })()`);

    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // Clicca sul pulsante "+ Aggiungi"
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Aggiungi'));
      if (btn) btn.click();
    })()`);
    await sleep(800);

    // Clicca sulla card "Attività"
    await cdp.eval(`(() => {
      const card = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Attività'));
      if (card) card.click();
    })()`);
    await sleep(1000);

    // Seleziona Spot fotografico
    await cdp.eval(`(() => {
      const spotBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Spot foto'));
      if (spotBtn) spotBtn.click();
    })()`);
    await sleep(500);

    await captureScreenshot(cdp, 'real_iphone15_attivita_selector.png');

    // Chiudi modale attività e apri Tappa
    await cdp.eval(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Annulla') || b.textContent.includes('✕')));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(500);

    // Riapri selettore card
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Aggiungi'));
      if (btn) btn.click();
    })()`);
    await sleep(800);

    // Clicca su "Tappa"
    await cdp.eval(`(() => {
      const card = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Tappa'));
      if (card) card.click();
    })()`);
    await sleep(1000);

    // Seleziona categoria "Spot fotografico" nella select
    await cdp.eval(`(() => {
      const select = document.querySelector('select');
      if (select) {
        select.value = 'Spot fotografico';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(600);

    await captureScreenshot(cdp, 'real_iphone15_tappa_spot_form.png');

    console.log('\n[SUCCESSO] Catture completate con successo!');
  } finally {
    cdp.close();
    chromeProc.kill();
    previewProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
