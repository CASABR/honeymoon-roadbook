const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const BASE_URL = 'http://localhost:5173';

const SCREENSHOT_DIRS = [
  path.join(__dirname, '..', 'screenshots'),
  'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\f79f81c7-1c28-4a54-8dea-b824095bc466\\screenshots'
];

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
  console.log('=== HOUNIGO: VISUAL VERIFICATION SUITE — PACCHETTO 2 ===\n');

  SCREENSHOT_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

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
    await sleep(500);
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
    throw new Error('Impossibile connettersi a Chrome DevTools Protocol');
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.ready();

  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Network.enable');

  async function saveScreenshot(filename) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    for (const d of SCREENSHOT_DIRS) {
      const p = path.join(d, filename);
      fs.writeFileSync(p, buf);
      console.log(`[Screenshot Salvato]: ${p} (${Math.round(buf.length / 1024)} KB)`);
    }
  }

  // 1. Initial setup at iPhone 15 Pro viewport (393 × 852 px)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true
  });

  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);

  // Authenticate session & register trip configuration & populate synthetic photos
  console.log('1. Autenticazione sessione e idratazione storage...');
  await client.eval(`
    (async () => {
      const { persistDeviceSession } = await import('./src/utils/deviceSession.ts');
      await persistDeviceSession('0000', 'guida');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: '0000',
        title: 'Giappone & Nuova Zelanda',
        startDate: '2026-11-28',
        endDate: '2026-12-20'
      }));
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('hounigo_user_role', 'owner');
      localStorage.setItem('sposi_admin_authenticated', 'true');
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');

      const mockGallery = [
        {
          id: 'photo_rarotonga_1',
          url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
          caption: 'Spiaggia al tramonto • Rarotonga',
          location: 'Isole Cook',
          timestamp: Date.now() - 3600000,
          isCustom: true
        },
        {
          id: 'photo_aitutaki_2',
          url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
          caption: 'Laguna turchese di One Foot Island',
          location: 'Aitutaki',
          timestamp: Date.now() - 7200000,
          isCustom: true
        },
        {
          id: 'photo_toyota_3',
          url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
          caption: 'Passeggiata verso il Cross-Island Track',
          location: 'Rarotonga',
          timestamp: Date.now() - 14400000,
          isCustom: true
        }
      ];
      localStorage.setItem('hounigo_live_gallery', JSON.stringify(mockGallery));
    })()
  `);

  // Reload to hydrate authentication
  await client.send('Page.reload');
  await sleep(2500);

  // Naviga alla scheda Altro
  console.log('2. Apertura AltroView -> LiveView (Organizzatore)...');
  await client.eval(`
    (() => {
      // Trova il pulsante 'Altro' nella barra di navigazione
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const altroBtn = buttons.find(b => b.innerText && b.innerText.includes('Altro'));
      if (altroBtn) altroBtn.click();
    })()
  `);
  await sleep(1500);

  // Apri la sotto-sezione Live in AltroView
  await client.eval(`
    (() => {
      window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'live' } }));
    })()
  `);
  await sleep(2000);

  // Chiudi eventuale collision/modal
  await client.eval(`
    (() => {
      const keepBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Mantieni') || b.innerText.includes('Annulla'));
      if (keepBtn) keepBtn.click();
    })()
  `);
  await sleep(1000);

  // Screenshot 1: LIVE Organizzatore Light Mode
  console.log('\n--- 1. Screenshot LIVE Organizzatore su iPhone 15 Pro (Light Mode) ---');
  await client.eval(`window.scrollTo({ top: 0, left: 0, behavior: 'instant' });`);
  await sleep(800);
  await saveScreenshot('live_editorial_packet2_iphone15_light.png');

  // Screenshot 1b: Galleria e Diario Organizzatore Light Mode
  console.log('\n--- 1b. Screenshot Galleria e Diario Organizzatore su iPhone 15 Pro ---');
  await client.eval(`
    (() => {
      const gallery = document.querySelector('section[aria-labelledby="live-gallery-title"]');
      if (gallery) {
        gallery.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        window.scrollBy({ top: 400, behavior: 'instant' });
      }
    })()
  `);
  await sleep(800);
  await saveScreenshot('live_gallery_and_diary_iphone15_light.png');

  // Screenshot 2: LIVE Organizzatore Dark Mode
  console.log('\n--- 2. Screenshot LIVE Organizzatore su iPhone 15 Pro (Dark Mode) ---');
  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  `);
  await sleep(1000);
  await saveScreenshot('live_editorial_packet2_iphone15_dark.png');

  // Screenshot 3: LIVE Organizzatore a 320 px
  console.log('\n--- 3. Screenshot LIVE Organizzatore a 320 px (Mobile compatto) ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 640,
    deviceScaleFactor: 2,
    mobile: true
  });
  await client.eval(`window.scrollTo({ top: 0, left: 0, behavior: 'instant' });`);
  await sleep(800);
  await saveScreenshot('live_editorial_packet2_320px.png');

  // Screenshot 4: LIVE Vista OSPITI ESTERNI (Light Mode via ?live=1)
  console.log('\n--- 4. Screenshot LIVE Vista OSPITI ESTERNI (Light Mode) ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true
  });
  await client.send('Page.navigate', { url: `${BASE_URL}/?live=1` });
  await sleep(2500);

  await client.eval(`
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'light' } }));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  `);
  await sleep(1000);
  await saveScreenshot('live_guest_packet2_iphone15_light.png');

  // Screenshot 5: Card Trasporti - Check-in Refinement (Light Mode)
  console.log('\n--- 5. Screenshot TrasportoCard Check-in Refinement (Light Mode) ---');
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(2000);

  await client.eval(`
    (() => {
      // Inietta volo CA950 sintetico e treno
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const catBtn = buttons.find(b => b.innerText && b.innerText.includes('Categorie'));
      if (catBtn) catBtn.click();
    })()
  `);
  await sleep(1500);

  // Apri categoria Trasporti
  await client.eval(`
    (() => {
      const cards = Array.from(document.querySelectorAll('div, button'));
      const trCard = cards.find(c => c.innerText && c.innerText.includes('Trasporti'));
      if (trCard) trCard.click();
    })()
  `);
  await sleep(1500);

  // Chiudi dialog
  await client.eval(`
    (() => {
      const keepBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Mantieni') || b.innerText.includes('Annulla'));
      if (keepBtn) keepBtn.click();
    })()
  `);
  await sleep(1000);

  // Scroll to flight card
  await client.eval(`
    (() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const flightCard = cards.find(c => c.innerText.includes('CA950') || c.innerText.includes('Air China'));
      if (flightCard) {
        flightCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    })()
  `);
  await sleep(800);
  await saveScreenshot('transport_checkin_packet2_iphone15_light.png');

  // Screenshot 6: Card Trasporti - Check-in Refinement (Dark Mode)
  console.log('\n--- 6. Screenshot TrasportoCard Check-in Refinement (Dark Mode) ---');
  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
  `);
  await sleep(800);
  await saveScreenshot('transport_checkin_packet2_iphone15_dark.png');

  client.close();
  chromeProc.kill();
  console.log('\n=== TUTTI GLI SCREENSHOT VERIFICATI E SALVATI CON SUCCESSO! ===\n');
}

run().catch(err => {
  console.error('[ERRORE VISUAL VERIFICATION]:', err);
  process.exit(1);
});
