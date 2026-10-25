const { spawn } = require('child_process');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9227;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const proc = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', 'about:blank']);
  await sleep(1000);

  const listRes = await fetch(`http://127.0.0.1:${PORT}/json`);
  const tabs = await listRes.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);

  await new Promise(res => { ws.onopen = res; });
  let id = 1;
  const send = (m, p = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (evt) => {
      const d = JSON.parse(evt.data);
      if (d.id === curId) {
        ws.removeEventListener('message', handler);
        if (d.error) reject(new Error(d.error.message));
        else resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method: m, params: p }));
  });

  const logs = [];
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + msg.params.type + '] ' + msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('[EXCEPTION] ' + JSON.stringify(msg.params.exceptionDetails));
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1500);

  // Authenticate session as desktop viewer directly via localStorage
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        localStorage.setItem('houni_trip_id', '0000');
        localStorage.setItem('houni_device_role', 'viewer');
        localStorage.setItem('houni_authenticated', 'true');
        localStorage.setItem('houni_pin_authenticated', 'true');
        localStorage.setItem('auth_pin_verified', 'true');
        localStorage.setItem('app_device_role', 'viewer');
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
      })()
    `
  });

  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(2500);

  // 1. Click Mappa Interattiva
  console.log('--- TEST 1: CLICK MAPPA INTERATTIVA ---');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const mappaBtn = btns.find(b => b.textContent && b.textContent.includes('Mappa Interattiva'));
        if (mappaBtn) mappaBtn.click();
      })()
    `
  });
  await sleep(2000);

  let stateMappa = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasLeaflet: Boolean(document.querySelector('.leaflet-container')),
          hasError: document.body.innerText.includes('Impossibile caricare'),
          bodySnippet: document.body.innerText.slice(0, 300)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Mappa Interattiva:', stateMappa.result.value);

  // 2. Click Live Tracking GPS
  console.log('--- TEST 2: CLICK LIVE TRACKING GPS ---');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const liveBtn = btns.find(b => b.textContent && b.textContent.includes('Live Tracking GPS'));
        if (liveBtn) liveBtn.click();
      })()
    `
  });
  await sleep(2000);

  let stateLive = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasError: document.body.innerText.includes('Impossibile caricare'),
          hasLiveHeadings: document.body.innerText.includes('Dove siamo'),
          bodySnippet: document.body.innerText.slice(0, 300)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Live Tracking GPS:', stateLive.result.value);

  // 3. Now let's test what happens when someone opens the app on desktop in GUEST MODE or without roadbook_trip_config!
  console.log('--- TEST 3: APERTURA DESKTOP SENZA LOCALSTORAGE / OSPITE ESTERNO O CONFIG PARZIALE ---');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        // Clear all storage to simulate first time visit on desktop or guest on desktop
        localStorage.clear();
        sessionStorage.clear();
      })()
    `
  });
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(2500);

  let stateClean = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          bodySnippet: document.body.innerText.slice(0, 300),
          hasError: document.body.innerText.includes('Impossibile caricare')
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Clean desktop visit:', stateClean.result.value);

  // 4. Test guest URL on desktop: http://localhost:5173/?live=1&tripId=0000
  console.log('--- TEST 4: DESKTOP GUEST URL (?live=1&tripId=0000) ---');
  await send('Page.navigate', { url: 'http://localhost:5173/?live=1&tripId=0000#live' });
  await sleep(3000);

  let stateGuest = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasError: document.body.innerText.includes('Impossibile caricare'),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText),
          bodySnippet: document.body.innerText.slice(0, 400)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Guest (?live=1):', stateGuest.result.value);

  console.log('\n--- ERROR LOGS CAPTURED ---');
  const errorLogs = logs.filter(l => l.includes('Error') || l.includes('EXCEPTION') || l.includes('RouteErrorBoundary') || l.includes('Impossibile'));
  console.log(errorLogs.join('\n') || 'Nessun errore catturato nei test 1-4');

  proc.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
