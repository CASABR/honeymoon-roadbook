const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const port = 9444;
const output = path.join(__dirname, '..', 'screenshots', 'live');
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    };
  }
  ready() { return this.socket.readyState === WebSocket.OPEN ? Promise.resolve() : new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; }
}

async function run() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--proxy-bypass-list=localhost;127.0.0.1',
    `--user-data-dir=${path.join(output, '.profile')}`, 'about:blank'
  ]);
  try {
    let targets = [];
    for (let attempt = 0; attempt < 30 && !targets.length; attempt += 1) {
      await sleep(300);
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {}
    }
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('Target Chrome non disponibile');
    const client = new Cdp(target.webSocketDebuggerUrl);
    await client.ready();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.navigate', { url: 'http://localhost:5173/?live=1&tripId=test-live-ui#live' });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(500);
      const ready = await client.evaluate(`document.body?.innerText.includes('Il viaggio, mentre accade') || false`);
      if (ready) break;
    }

    const variants = [
      ['desktop-light', 1440, 1000, false, 'light'], ['desktop-dark', 1440, 1000, false, 'dark'],
      ['mobile-light', 390, 844, true, 'light'], ['mobile-dark', 390, 844, true, 'dark']
    ];
    for (const [name, width, height, mobile, theme] of variants) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await client.evaluate(`localStorage.setItem('theme','${theme}'); document.documentElement.classList.toggle('dark', '${theme}' === 'dark'); window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: '${theme}' } }));`);
      await sleep(700);
      const state = await client.evaluate(`({ text: document.body?.innerText || '', overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, dark: document.documentElement.classList.contains('dark') })`);
      for (const heading of ['POSIZIONE', 'DIARIO', 'INTERAZIONI']) if (!state.text.toUpperCase().includes(heading)) throw new Error(`${name}: sezione ${heading} assente. Pagina: ${state.text.slice(0, 180)}`);
      if (state.overflow) throw new Error(`${name}: overflow orizzontale`);
      if (state.dark !== (theme === 'dark')) throw new Error(`${name}: tema errato`);
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
      console.log(`[PASS] ${name}: tre aree visibili, tema corretto, nessun overflow`);
    }
    client.socket.close();
  } finally {
    chrome.kill();
  }
}

run().catch(error => { console.error(error); process.exit(1); });
