const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const outputDir = 'C:\\tmp\\hounigo-postrelease-trekking';
fs.mkdirSync(outputDir, { recursive: true });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    };
  }
  ready() {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || JSON.stringify(result.exceptionDetails);
      throw new Error(detail);
    }
    return result.result?.value;
  }
}

async function run() {
  const projectRoot = path.join(__dirname, '..');
  const vite = spawn(process.execPath, [
    path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', '5173', '--strictPort'
  ], { cwd: projectRoot, windowsHide: true });
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio', '--no-proxy-server', '--proxy-bypass-list=*',
    `--user-data-dir=${path.join(outputDir, '.chrome-profile')}`,
    'about:blank'
  ]);
  try {
    let serverReady = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(250);
      try {
        const response = await fetch('http://127.0.0.1:5173/');
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch {}
    }
    if (!serverReady) throw new Error('Server Vite non disponibile');

    let targets;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(300);
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        if (targets.length) break;
      } catch {}
    }
    if (!targets?.length) throw new Error('Chrome CDP non disponibile');
    const page = targets.find(target => target.type === 'page') || targets[0];
    const client = new Client(page.webSocketDebuggerUrl);
    await client.ready();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.navigate', { url: 'http://localhost:5173/' });
    let currentLocation = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(250);
      currentLocation = await client.evaluate('location.href');
      if (currentLocation.startsWith('http://localhost:5173/')) break;
    }
    if (!currentLocation.startsWith('http://localhost:5173/')) throw new Error(`Navigazione fallita: ${currentLocation}`);
    await client.evaluate(`
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_device_role', 'viewer');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
    `);

    const captures = [
      ['desktop-light', 1440, 900, false, 'light'],
      ['desktop-dark', 1440, 900, false, 'dark'],
      ['iphone-393-light', 393, 852, true, 'light'],
      ['iphone-393-dark', 393, 852, true, 'dark'],
      ['mobile-320-light', 320, 568, true, 'light'],
      ['mobile-320-dark', 320, 568, true, 'dark']
    ];
    for (const [name, width, height, mobile, theme] of captures) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await client.evaluate(`
        localStorage.setItem('theme', '${theme}');
        localStorage.setItem('houni_view_mode', '${mobile ? 'mobile' : 'desktop'}');
        document.documentElement.classList.toggle('dark', '${theme}' === 'dark');
      `);
      await client.send('Page.reload');
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(250);
        if (await client.evaluate('Boolean(document.body)')) break;
      }
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await sleep(500);
        const loading = await client.evaluate(`document.body?.innerText.includes('Caricamento Hounigo') || false`);
        if (!loading) break;
      }
      await client.evaluate(`window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'attivita' } }))`);
      await sleep(1600);
      await client.evaluate(`
        const keepBothButton = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Mantieni entrambe'));
        keepBothButton?.click();
      `);
      await sleep(500);
      await client.evaluate(`document.querySelector('[data-trekking-card="true"]')?.scrollIntoView({ block: 'center' })`);
      await sleep(300);
      const state = await client.evaluate(`({
        hasActivities: document.body?.innerText.includes('Attività') || false,
        hasTrekking: document.body?.innerText.includes('Trekking') || false,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        trekkingCards: [...document.querySelectorAll('[data-trekking-card="true"]')].filter(card => card.getBoundingClientRect().width > 0).length,
        clippedCard: [...document.querySelectorAll('[data-trekking-card="true"]')].some(card => card.scrollWidth > card.clientWidth),
        collisionModal: document.body?.innerText.includes('Attività Sovrapposte') || false,
        dark: document.documentElement.classList.contains('dark'),
        preview: document.body?.innerText.slice(0, 180) || ''
      })`);
      if (!state.hasActivities || !state.hasTrekking || !state.trekkingCards || state.overflow || state.clippedCard || state.collisionModal || state.dark !== (theme === 'dark')) {
        throw new Error(`${name}: verifica fallita ${JSON.stringify(state)}`);
      }
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(data, 'base64'));
      console.log(`[PASS] ${name}: Trekking visibile, tema corretto, nessun overflow`);
    }
    client.socket.close();
  } finally {
    chrome.kill();
    vite.kill();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
