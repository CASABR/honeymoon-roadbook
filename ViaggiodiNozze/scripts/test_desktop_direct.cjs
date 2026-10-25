const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9232;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('=== TEST REGRESSIONE LIVE & MAPPA DESKTOP ===\n');
  const proc = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', '--disable-extensions', 'about:blank']);
  await sleep(1000);

  const listRes = await fetch(`http://127.0.0.1:${PORT}/json`);
  const tabs = await listRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  if (!pageTab) throw new Error('No page tab found');

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
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

  // 1. Navigate to base URL
  console.log('1. Navigo all applicazione desktop (1440x900)...');
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(2000);

  // Set session as viewer on desktop
  console.log('2. Inietto sessione dispositivo (desktop viewer)...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        localStorage.setItem('houni_trip_id', '0000');
        localStorage.setItem('houni_device_role', 'viewer');
        localStorage.setItem('houni_authenticated', 'true');
        localStorage.setItem('houni_pin_authenticated', 'true');
        localStorage.setItem('auth_pin_verified', 'true');
        localStorage.setItem('app_device_role', 'viewer');
        localStorage.setItem('hounigo_user_role', 'owner');
        sessionStorage.setItem('houni_dev_simulated_role', 'owner');
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

  // Reload to activate session
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(3000);

  // 3. Test Mappa Interattiva
  console.log('3. Clicco "Mappa Interattiva" nella sidebar desktop...');
  const clickMappaRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const mappaBtn = btns.find(b => b.textContent && b.textContent.includes('Mappa Interattiva'));
        if (mappaBtn) {
          mappaBtn.click();
          return 'CLICCATO: ' + mappaBtn.textContent.trim();
        }
        return 'MAPPA BTN NOT FOUND';
      })()
    `,
    returnByValue: true
  });
  console.log('Risultato click Mappa:', clickMappaRes.result.value);
  await sleep(2500);

  const shotMappa = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/desktop_test_mappa.png', Buffer.from(shotMappa.data, 'base64'));
  console.log('Screenshot salvato in screenshots/desktop_test_mappa.png');

  const checkMappa = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasError: document.body.innerText.includes('Impossibile caricare'),
          leafletPresent: Boolean(document.querySelector('.leaflet-container')),
          text: document.body.innerText.slice(0, 300)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Stato Mappa:', checkMappa.result.value);

  // 4. Test Live Tracking GPS
  console.log('\n4. Clicco "Live Tracking GPS" nella sidebar desktop...');
  const clickLiveRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const liveBtn = btns.find(b => b.textContent && b.textContent.includes('Live Tracking GPS'));
        if (liveBtn) {
          liveBtn.click();
          return 'CLICCATO: ' + liveBtn.textContent.trim();
        }
        return 'LIVE BTN NOT FOUND';
      })()
    `,
    returnByValue: true
  });
  console.log('Risultato click Live:', clickLiveRes.result.value);
  await sleep(3000);

  const shotLive = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/desktop_test_live.png', Buffer.from(shotLive.data, 'base64'));
  console.log('Screenshot salvato in screenshots/desktop_test_live.png');

  const checkLive = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          hasError: document.body.innerText.includes('Impossibile caricare'),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText),
          text: document.body.innerText.slice(0, 400)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Stato Live:', checkLive.result.value);

  console.log('\n--- ERROR LOGS CAPTURED ---');
  const errs = logs.filter(l => l.includes('Error') || l.includes('EXCEPTION') || l.includes('RouteErrorBoundary') || l.includes('Impossibile'));
  console.log(errs.join('\n') || 'Nessun errore critico nei log.');

  proc.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
