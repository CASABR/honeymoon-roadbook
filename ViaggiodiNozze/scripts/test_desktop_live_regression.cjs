const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9226;
const BASE_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getWebSocketDebuggerUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page') || list[0];
          if (page && page.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl);
          } else {
            reject(new Error('No inspectable tab found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.onEvent = () => {};
    
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.onEvent(msg.method, msg.params);
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
    const res = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

let client = null;

async function run() {
  console.log('--- TEST RIPRODUZIONE REGRESSIONE LIVE DESKTOP ---');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      wsUrl = await getWebSocketDebuggerUrl();
      break;
    } catch {}
  }

  if (!wsUrl) {
    console.error('Impossibile connettersi a Chrome CDP');
    chromeProc.kill();
    return;
  }

  client = new CDPClient(wsUrl);
  await client.ready();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Console.enable');

  const consoleLogs = [];
  client.onEvent = (method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const args = (params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      consoleLogs.push(`[${params.type}] ${args}`);
    } else if (method === 'Runtime.exceptionThrown') {
      consoleLogs.push(`[EXCEPTION] ${params.exceptionDetails?.text || ''} ${JSON.stringify(params.exceptionDetails?.exception || {})}`);
    }
  };

  // Set desktop viewport (1440x900)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Navigate to base URL
  console.log('1. Navigo all applicazione desktop (1440x900)...');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);

  console.log('2. Inietto sessione dispositivo viewer / desktop...');
  await client.eval(`
    (async () => {
      const { persistDeviceSession } = await import('./src/utils/deviceSession.ts');
      await persistDeviceSession('0000', 'viewer');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: '0000',
        title: 'Giappone & Nuova Zelanda',
        startDate: '2026-11-28',
        endDate: '2026-12-20',
        ownerUid: 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2'
      }));
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('houni_view_mode', 'desktop');
      localStorage.setItem('theme', 'light');
    })()
  `);

  console.log('3. Ricarico la pagina per applicare la sessione desktop...');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(2500);

  console.log('4. Cerco il pulsante Live Tracking GPS nella sidebar desktop...');
  const buttonsFound = await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.map(b => b.textContent?.trim() || '').filter(Boolean);
    })()
  `);
  console.log('Pulsanti trovati nella vista:', buttonsFound.slice(0, 15));

  const clickedLive = await client.eval(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const liveBtn = buttons.find(b => b.textContent && (b.textContent.includes('Live Tracking GPS') || b.textContent.includes('Live')));
      if (liveBtn) {
        liveBtn.click();
        return liveBtn.textContent.trim();
      }
      return null;
    })()
  `);
  console.log('Pulsante cliccato:', clickedLive);
  await sleep(2500);

  // Check what is rendered on screen
  const pageState = await client.eval(`
    (() => {
      const bodyText = document.body.innerText;
      const hasError = bodyText.includes('Impossibile caricare Live Viaggio');
      const hasMap = Boolean(document.querySelector('.leaflet-container, canvas, [data-map], [data-tile]'));
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.innerText);
      return { hasError, hasMap, headings, sampleText: bodyText.slice(0, 400) };
    })()
  `);

  console.log('Stato della pagina:', pageState);
  console.log('\n--- CONSOLE LOGS & EXCEPTIONS ---');
  consoleLogs.forEach(l => console.log(l));

  chromeProc.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
