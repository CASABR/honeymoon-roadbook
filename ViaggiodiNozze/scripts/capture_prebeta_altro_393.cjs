const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9237;
const vitePort = 5178;
const baseUrl = `http://127.0.0.1:${vitePort}`;
const outputPath = path.join(__dirname, '..', 'screenshots', 'prebeta_altro_after_393.png');
const profilePath = path.join(__dirname, '..', 'scratch', `prebeta-screenshot-${process.pid}`);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) {
        if (message.method === 'Runtime.exceptionThrown' || message.method === 'Runtime.consoleAPICalled') {
          this.events.push(message);
        }
        return;
      }
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
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
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(400);
  }
  throw new Error('Vite non disponibile');
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(profilePath, { recursive: true });

  const vite = process.env.HOUNIGO_REUSE_SERVER === '1'
    ? null
    : spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore',
        windowsHide: true
      });
  let chrome;
  let client;

  try {
    await waitForServer(baseUrl);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profilePath}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-proxy-server',
      '--disable-dev-shm-usage',
      'about:blank'
    ], { stdio: 'ignore', windowsHide: true });

    let targets;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
        if (targets.length) break;
      } catch {}
      await sleep(300);
    }
    if (!targets?.length) throw new Error('Chrome CDP non disponibile');

    const target = targets.find(candidate => candidate.type === 'page') || targets[0];
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.ready();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true
    });
    await client.send('Page.navigate', { url: `${baseUrl}/scripts/visual/altro-preview.html` });
    await sleep(1200);
    let isAltroVisible = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      isAltroVisible = await client.evaluate(`document.body?.innerText?.includes('Risorse, sicurezza e gestione del roadbook')`);
      if (isAltroVisible) break;
      await sleep(250);
    }
    if (!isAltroVisible) {
      const bodyText = await client.evaluate(`document.body?.innerText?.slice(0, 600)`);
      const diagnostics = await client.evaluate(`({ href: location.href, title: document.title, html: document.documentElement?.outerHTML?.slice(0, 500), resources: performance.getEntriesByType('resource').map(entry => entry.name).slice(0, 12) })`);
      throw new Error(`La vista Altro non è stata renderizzata; screenshot annullato. Contenuto: ${bodyText}. Diagnostica: ${JSON.stringify(diagnostics)}. Eventi: ${JSON.stringify(client.events).slice(0, 1600)}`);
    }
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
    console.log(outputPath);
  } finally {
    try { client?.socket.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { vite?.kill(); } catch {}
    await sleep(300);
    try { fs.rmSync(profilePath, { recursive: true, force: true }); } catch {}
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
