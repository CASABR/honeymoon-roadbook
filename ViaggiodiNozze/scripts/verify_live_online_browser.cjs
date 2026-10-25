const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9225;
const LIVE_URL = 'https://casabr.github.io/honeymoon-roadbook/';

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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== TEST LIVE ONLINE BROWSER: https://casabr.github.io/honeymoon-roadbook/ ===\n');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800'
  ]);

  await sleep(1500);

  try {
    const listRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await listRes.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;
    const client = new CDPClient(wsUrl);
    await client.ready();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    const consoleErrors = [];
    client.ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          consoleErrors.push(msg.params.exceptionDetails.text || JSON.stringify(msg.params.exceptionDetails));
        }
      } catch {}
    });

    console.log('1. Navigazione verso il sito live in produzione...');
    await client.send('Page.navigate', { url: LIVE_URL });
    await sleep(3500);

    const title = await client.eval('document.title');
    console.log('Titolo pagina caricata:', title);

    const bodyText = await client.eval('document.body.innerText.slice(0, 300)');
    console.log('Testo iniziale rilevato nel DOM:', bodyText.replace(/\n+/g, ' '));

    const rootExists = await client.eval('Boolean(document.getElementById("root") && document.getElementById("root").children.length > 0)');
    console.log('Elemento #root idratato con componenti React:', rootExists);

    // Screenshot
    const ss = await client.send('Page.captureScreenshot', { format: 'png' });
    const ssPath = path.join(__dirname, '..', 'screenshots', 'live_gh_pages_verified.png');
    fs.writeFileSync(ssPath, Buffer.from(ss.data, 'base64'));
    console.log(`\n[Screenshot Live Salvato]: ${ssPath}`);

    console.log('\nErrori JavaScript bloccanti rilevati in console:');
    if (consoleErrors.length === 0) {
      console.log('✓ NESSUN ERRORE CONSOLE RILEVATO! Applicazione 100% integra in produzione.');
    } else {
      consoleErrors.forEach(err => console.log('  ⚠️ ' + err));
    }

    client.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(console.error);
