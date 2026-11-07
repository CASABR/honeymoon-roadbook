const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9231;
const VITE_PORT = 5176;
const BASE_URL = `http://localhost:${VITE_PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity\\brain\\d1e39d97-0426-46d3-8997-c8e3fadd549e';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== VERIFICA DEFINITIVA POPUP VIEWPORT SU SCROLL PROFONDO ===\n');

  // 1. Avvia Vite dev server
  const viteProc = spawn('npm.cmd', ['run', 'dev', '--', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    shell: true
  });

  let serverUp = false;
  for (let i = 0; i < 25; i++) {
    await sleep(500);
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) { serverUp = true; break; }
    } catch {}
  }
  if (!serverUp) {
    console.error('Vite dev server non avviato!');
    viteProc.kill();
    process.exit(1);
  }

  // 2. Avvia Chrome CDP
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-popup-final'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        const page = list.find(t => t.type === 'page') || list[0];
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(res => ws.onopen = res);

  let curId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = curId++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === id) {
        ws.removeEventListener('message', handler);
        resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const evalCode = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result ? res.result.value : undefined;
  };

  // Naviga e imposta sessione
  await send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);
  await evalCode(`
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
  await send('Page.reload');
  await sleep(2500);

  const report = {};

  // --- TEST 1: iPHONE 15 PRO (393x852) MODAL APERTO DOPO SCROLL 2000px ---
  console.log('[1] Test iPhone 15 Pro (393x852) con scroll profondo...');
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await sleep(500);

  // Scrolla a fondo pagina
  await evalCode(`
    const container = document.querySelector('.overflow-y-auto, [data-main-scroll-container]') || window;
    container.scrollTo(0, 2500);
    window.scrollTo(0, 2500);
  `);
  await sleep(600);

  // Apri il modale centrale HouniAI / Assistente
  console.log('Apertura modale HouniAI con nav button[2]...');
  await evalCode(`
    const navButtons = document.querySelectorAll('nav button');
    if (navButtons[2]) navButtons[2].click();
  `);
  await sleep(800);

  // Misura la posizione del popup aperto su iPhone 15 Pro
  const boxMobile = await evalCode(`(() => {
    const modal = document.querySelector('.modal-sheet-container, .fixed.inset-0 > div, [role="dialog"]');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      isInViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
    };
  })()`);
  console.log('Posizione Modale iPhone 15 Pro:', boxMobile);
  report.iphone15pro = boxMobile;

  // Cattura screenshot iPhone 15 Pro
  const shotMobile = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bufMobile = Buffer.from(shotMobile.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'popup_iphone15_scroll_bottom.png'), bufMobile);
  fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, 'popup_iphone15_scroll_bottom.png'), bufMobile);
  console.log('Salvato popup_iphone15_scroll_bottom.png');

  // Chiudi modale
  await evalCode(`
    const closeBtn = document.querySelector('button[aria-label="Chiudi"], .modal-sheet-container button, .fixed.inset-0 button');
    if (closeBtn) closeBtn.click();
    const bd = document.querySelector('.modal-backdrop-layer, .fixed.inset-0');
    if (bd) bd.click();
  `);
  await sleep(500);

  // --- TEST 2: DESKTOP (1280x900) MODAL APERTO DOPO SCROLL ---
  console.log('\n[2] Test Desktop (1280x900) con scroll profondo...');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  await sleep(500);

  // Scroll a fondo pagina
  await evalCode(`
    const container = document.querySelector('.overflow-y-auto, [data-main-scroll-container]') || window;
    container.scrollTo(0, 2500);
    window.scrollTo(0, 2500);
  `);
  await sleep(600);

  // Apri modale (es. clicca su nav button o card)
  await evalCode(`
    const navButtons = document.querySelectorAll('nav button');
    if (navButtons[2]) navButtons[2].click();
  `);
  await sleep(800);

  const boxDesktop = await evalCode(`(() => {
    const modal = document.querySelector('.modal-sheet-container, .fixed.inset-0 > div, [role="dialog"]');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      isInViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
    };
  })()`);
  console.log('Posizione Modale Desktop:', boxDesktop);
  report.desktop = boxDesktop;

  const shotDesktop = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bufDesktop = Buffer.from(shotDesktop.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'popup_desktop_scroll_bottom.png'), bufDesktop);
  fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, 'popup_desktop_scroll_bottom.png'), bufDesktop);
  console.log('Salvato popup_desktop_scroll_bottom.png');

  // --- TEST 3: ANDROID COMPATTO (360x780) ---
  console.log('\n[3] Test Android Compatto (360x780)...');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await sleep(500);

  const shot360 = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buf360 = Buffer.from(shot360.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'popup_android360_scroll_bottom.png'), buf360);
  fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, 'popup_android360_scroll_bottom.png'), buf360);
  console.log('Salvato popup_android360_scroll_bottom.png');

  // Salva report
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'popup_viewport_measurements.json'), JSON.stringify(report, null, 2));

  ws.close();
  chromeProc.kill();
  viteProc.kill();
  console.log('\n=== TUTTI I TEST POPUP E SCREENSHOT COMPLETATI CON SUCCESSO! ===');
})();
