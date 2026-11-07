const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9226;
const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\62bf6247-9ed9-4d56-890b-a2a63fe7702a\\screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const chromeProc = spawn(CHROME_PATH, [
    '--remote-debugging-port=' + PORT,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-all-comparisons'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch('http://localhost:' + PORT + '/json');
      const list = await res.json();
      if (list && list.length > 0) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(res => ws.onopen = res);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const htmlPath = path.join(__dirname, '..', 'temp_cards_comparison.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await send('Page.navigate', { url: fileUrl });
  await sleep(2000);

  // Desktop Alloggio Screenshot
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 950, deviceScaleFactor: 2, mobile: false });
  await send('Runtime.evaluate', { expression: "document.getElementById('sec-alloggio').scrollIntoView();" });
  await sleep(400);

  const resAlloggio = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bufAlloggio = Buffer.from(resAlloggio.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'comparison_desktop_sec_alloggio.png'), bufAlloggio);
  fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, 'comparison_desktop_sec_alloggio.png'), bufAlloggio);
  console.log('Saved comparison_desktop_sec_alloggio.png');

  // Mobile Screenshots per Section (iPhone 15 Pro, 393x852)
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  const secs = [
    { id: 'sec-volo', name: 'comparison_mobile_1_volo.png' },
    { id: 'sec-treno', name: 'comparison_mobile_2_treno.png' },
    { id: 'sec-noleggio', name: 'comparison_mobile_3_noleggio.png' },
    { id: 'sec-attivita', name: 'comparison_mobile_4_attivita.png' },
    { id: 'sec-tappa', name: 'comparison_mobile_5_tappa.png' },
    { id: 'sec-alloggio', name: 'comparison_mobile_6_alloggio.png' },
  ];

  for (const s of secs) {
    await send('Runtime.evaluate', { expression: "document.getElementById('" + s.id + "').scrollIntoView();" });
    await sleep(400);
    const sRes = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const sBuf = Buffer.from(sRes.data, 'base64');
    fs.writeFileSync(path.join(ARTIFACT_DIR, s.name), sBuf);
    fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, s.name), sBuf);
    console.log('Saved ' + s.name);
  }

  ws.close();
  chromeProc.kill();
  console.log('All detailed screenshots saved successfully.');
})();
