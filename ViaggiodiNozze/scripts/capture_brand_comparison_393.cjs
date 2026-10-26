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
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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

async function run() {
  console.log('=== AVVIO CATTURA SCREENSHOT MOBILE 393px PER BRAND IDENTITY HOUNIGO ===\n');

  // 1. Avvia server vite se necessario
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
    // Attendi apertura porta
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

  assert(viteRunning, 'Impossibile avviare il server web su porta ' + VITE_PORT);
  console.log('[OK] Web server attivo su ' + BASE_URL);

  // 2. Avvia Chrome Headless con porta CDP
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--mute-audio',
    'about:blank'
  ]);

  let connected = false;
  let targets = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      targets = await res.json();
      if (targets && targets.length > 0) {
        connected = true;
        break;
      }
    } catch {}
  }

  if (!connected) {
    chromeProc.kill();
    if (viteProc) viteProc.kill();
    throw new Error('Impossibile connettersi a Chrome CDP su porta ' + PORT);
  }

  console.log('[OK] Chrome CDP connesso.');
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.ready();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  // Imposta viewport mobile esatto 393x852 (standard iPhone 15)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    mobile: true
  });

  async function captureAndSave(filename) {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(data, 'base64');
    const localFile = path.join(LOCAL_SCREENSHOT_DIR, filename);
    const artifactFile = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(localFile, buffer);
    fs.writeFileSync(artifactFile, buffer);
    console.log(`[SCREENSHOT] Salvato: ${filename} (${buffer.length} bytes)`);
  }

  async function waitForElement(selector, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await client.eval(`!!document.querySelector('${selector}')`);
      if (found) return true;
      await sleep(300);
    }
    return false;
  }

  // --- 1. SCREENSHOT ONBOARDING ---
  console.log('\n--- 1. Cattura Onboarding (Navy #172033, Coral #FF6B5F, Manrope, TrailIcons) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);
  await client.eval(`
    localStorage.clear();
    localStorage.setItem('houni_view_mode', 'mobile');
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  `);
  await client.send('Page.reload');
  await waitForElement('button');
  await sleep(1500);
  await captureAndSave('brand_393_onboarding.png');

  // --- 2. SCREENSHOT OGGI / HOME ---
  console.log('\n--- 2. Cattura Oggi / Home (Cloud #F8F7F3, Navy #172033, Coral #FF6B5F, Trail NavBar) ---');
  await client.eval(`
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('houni_authenticated', 'true');
    localStorage.setItem('houni_pin_authenticated', 'true');
    localStorage.setItem('auth_pin_verified', 'true');
    localStorage.setItem('walkthrough_seen', 'true');
    localStorage.setItem('houni_onboarding_completed_v1', 'true');
    localStorage.setItem('houni_view_mode', 'mobile');
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  `);
  await client.send('Page.reload');
  await waitForElement('nav');
  await sleep(2000);
  await captureAndSave('brand_393_oggi.png');

  // --- 3. SCREENSHOT CATEGORIE SHEET ---
  console.log('\n--- 3. Cattura Categorie Sheet (Cloud, Navy, Coral active chip) ---');
  await client.eval(`
    const navButtons = document.querySelectorAll('nav button');
    if (navButtons[1]) navButtons[1].click();
  `);
  await sleep(1500);
  await captureAndSave('brand_393_categorie.png');

  // --- 4. SCREENSHOT HOUNIAI ASSISTENTE MODAL ---
  console.log('\n--- 4. Cattura HouniAI Assistente Modal (TrailAi icon, Navy/Coral branding) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);
  await client.eval(`
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('houni_authenticated', 'true');
    localStorage.setItem('houni_pin_authenticated', 'true');
    localStorage.setItem('auth_pin_verified', 'true');
    localStorage.setItem('walkthrough_seen', 'true');
    localStorage.setItem('houni_onboarding_completed_v1', 'true');
    localStorage.setItem('houni_view_mode', 'mobile');
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  `);
  await client.send('Page.reload');
  await waitForElement('nav');
  await sleep(1500);
  await client.eval(`
    const navButtons = document.querySelectorAll('nav button');
    if (navButtons[2]) navButtons[2].click();
  `);
  await sleep(1500);
  await captureAndSave('brand_393_houni_ai.png');

  // --- 5. SCREENSHOT ALTRO MENU ---
  console.log('\n--- 5. Cattura Altro Menu (Cloud cards, Trail icons, Live card) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);
  await client.eval(`
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('houni_authenticated', 'true');
    localStorage.setItem('houni_pin_authenticated', 'true');
    localStorage.setItem('auth_pin_verified', 'true');
    localStorage.setItem('walkthrough_seen', 'true');
    localStorage.setItem('houni_onboarding_completed_v1', 'true');
    localStorage.setItem('houni_view_mode', 'mobile');
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  `);
  await client.send('Page.reload');
  await waitForElement('nav');
  await sleep(1500);
  await client.eval(`
    const altroBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.includes('Altro'));
    if (altroBtn) altroBtn.click();
  `);
  await sleep(2000);
  await captureAndSave('brand_393_altro.png');

  console.log('\n=== CATTURA COMPLETATA CON SUCCESSO! ===');

  try { client.close(); } catch {}
  try { chromeProc.kill(); } catch {}
  try { if (viteProc) viteProc.kill(); } catch {}
  setTimeout(() => process.exit(0), 500);
}

function assert(condition, message) {
  if (!condition) {
    console.error('[ERRORE ASSERT]', message);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
