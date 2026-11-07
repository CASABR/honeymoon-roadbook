const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9251;
const VITE_PORT = 5199;
const BASE_URL = `http://localhost:${VITE_PORT}/prototype.html`;
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
  console.log('=== HOUNIGO LAB: CATTURA PROTOTIPI MOBILE-FIRST ===\n');

  // 1. Avvia server Vite in background
  console.log(`[VITE] Avvio server Vite sulla porta ${VITE_PORT}...`);
  const viteProc = spawn('npx.cmd', ['vite', '--port', String(VITE_PORT)], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    shell: true
  });

  // Attendiamo che Vite risponda
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://localhost:${VITE_PORT}/prototype.html`);
      if (res.status === 200) {
        serverReady = true;
        console.log('[VITE] Server Vite attivo e pronto su', BASE_URL);
        break;
      }
    } catch {}
  }

  if (!serverReady) {
    viteProc.kill();
    throw new Error('Impossibile avviare il server Vite locale!');
  }

  // 2. Avvia Chrome Headless con CDP
  console.log(`[CHROME] Avvio Chrome su porta CDP ${CDP_PORT}...`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-prototypes'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json`);
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
    viteProc.kill();
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const measurements = {};

  try {
    // ─── PROPOSTA A: ROADBOOK EDITORIALE ──────────────────────────────────────────
    console.log('\n--- CATTURA PROPOSTA A: ROADBOOK EDITORIALE ---');
    
    // A - Android 360x780
    await setViewport(cdp, 360, 780, true);
    await cdp.send('Page.navigate', { url: `${BASE_URL}?mode=a` });
    await sleep(1500);
    // Nascondi eventuale toolbar prototype per screenshot pulito mobile
    await cdp.eval(`(() => {
      const tb = document.getElementById('prototype-toolbar');
      if (tb) tb.style.display = 'none';
    })()`);
    await sleep(300);
    await captureScreenshot(cdp, 'redesign_proposta_a_360.png');

    // Misura altezza scroll Proposta A
    const heightA = await cdp.eval(`(() => {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
        itemsCount: document.querySelectorAll('.group').length
      };
    })()`);
    measurements['proposta_a'] = heightA;
    console.log('[MISURAZIONI] Proposta A:', heightA);

    // A - iPhone 15 393x852
    await setViewport(cdp, 393, 852, true);
    await sleep(500);
    await captureScreenshot(cdp, 'redesign_proposta_a_393.png');

    // ─── PROPOSTA B: TRAVEL BOARD ────────────────────────────────────────────────
    console.log('\n--- CATTURA PROPOSTA B: TRAVEL BOARD ---');

    // B - Android 360x780
    await setViewport(cdp, 360, 780, true);
    await cdp.send('Page.navigate', { url: `${BASE_URL}?mode=b` });
    await sleep(1500);
    await cdp.eval(`(() => {
      const tb = document.getElementById('prototype-toolbar');
      if (tb) tb.style.display = 'none';
    })()`);
    await sleep(300);
    await captureScreenshot(cdp, 'redesign_proposta_b_360.png');

    // Misura altezza scroll Proposta B
    const heightB = await cdp.eval(`(() => {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
        sectionsCount: document.querySelectorAll('section').length
      };
    })()`);
    measurements['proposta_b'] = heightB;
    console.log('[MISURAZIONI] Proposta B:', heightB);

    // B - iPhone 15 393x852
    await setViewport(cdp, 393, 852, true);
    await sleep(500);
    await captureScreenshot(cdp, 'redesign_proposta_b_393.png');

    // ─── CONFRONTO PANORAMICO SIDE-BY-SIDE ─────────────────────────────────────────
    console.log('\n--- CATTURA CONFRONTO SIDE-BY-SIDE ---');
    await setViewport(cdp, 1200, 850, false);
    await cdp.send('Page.navigate', { url: `${BASE_URL}?mode=compare` });
    await sleep(1500);
    await captureScreenshot(cdp, 'redesign_comparison_overview.png');

    // Salva misurazioni in JSON
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'redesign_prototype_measurements.json'),
      JSON.stringify(measurements, null, 2)
    );
    console.log('[MISURAZIONI] Salvate in redesign_prototype_measurements.json');

  } catch (err) {
    console.error('[ERRORE DURANTE CATTURA]', err);
  } finally {
    cdp.close();
    chromeProc.kill();
    viteProc.kill();
    console.log('\n[PULIZIA] Processi Chrome e Vite terminati.');
  }
}

run();

