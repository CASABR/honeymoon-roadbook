const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const VITE_PORT = 5173;
const BASE_URL = `http://localhost:${VITE_PORT}`;

const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\62bf6247-9ed9-4d56-890b-a2a63fe7702a\\screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });

const mode = process.argv[2] || 'before'; // 'before' or 'after'

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
        if (msg.error) {
          if (msg.error.message && msg.error.message.includes('navigated')) {
            resolve({});
          } else {
            reject(new Error(msg.error.message));
          }
        } else {
          resolve(msg.result);
        }
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
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP method ${method} timed out after 15s`));
      }, 15000);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timeout); resolve(val); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      });
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

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buffer = Buffer.from(result.data, 'base64');
  const targetPath = path.join(ARTIFACT_DIR, filename);
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  fs.writeFileSync(targetPath, buffer);
  fs.writeFileSync(localPath, buffer);
  console.log(`[SCREENSHOT] Salvato: ${filename} (${buffer.length} bytes)`);
}

async function setViewport(cdp, width, height, isMobile = true) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: isMobile
  });
  await sleep(400);
}

async function run() {
  console.log(`=== MISURAZIONE E CATTURA SCREENSHOT [MODALITÀ: ${mode.toUpperCase()}] ===\n`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-${mode}`
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        const pageTarget = list.find(t => t.type === 'page') || list[0];
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(2500);

    // Setup sessione e trip 0000
    await cdp.eval(`(async () => {
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_device_role', 'organizer');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      const tripCfg = {
        id: '0000',
        title: 'Nuova Zelanda & Australia 2026',
        startDate: '2026-11-28',
        endDate: '2027-01-10',
        ownerName: 'Nunzio & Giusy'
      };
      localStorage.setItem('roadbook_trip_config', JSON.stringify(tripCfg));
      localStorage.setItem('hounigo_trip_config', JSON.stringify(tripCfg));

      try {
        const { idbPut, STORES } = await import('/src/storage/indexedDB.ts');
        const { SEED_TRANSPORTS } = await import('/src/storage/seedTransports.ts');
        const { SEED_ACTIVITIES } = await import('/src/storage/seedActivities.ts');
        const { SEED_TAPPE } = await import('/src/storage/seedTappe.ts');
        const { SEED_ALLOGGI } = await import('/src/storage/seedAlloggi.ts');
        const { SEED_RISTORANTI } = await import('/src/storage/seedRistoranti.ts');

        for (const t of SEED_TRANSPORTS) {
          await idbPut(STORES.TRASPORTI, t);
        }
        for (const a of SEED_ACTIVITIES) {
          await idbPut(STORES.ATTIVITA, a);
        }
        for (const tap of SEED_TAPPE) {
          await idbPut(STORES.TAPPE, tap);
        }
        for (const al of SEED_ALLOGGI) {
          await idbPut(STORES.ALLOGGI, al);
        }
        for (const r of SEED_RISTORANTI) {
          await idbPut(STORES.RISTORANTI, r);
        }
      } catch (err) {
        console.error('[TEST-SEED] Errore inserimento dati test:', err);
      }
    })()`);
    await sleep(2000);

    // Ricarica la pagina con cache pulita per far leggere i dati a OggiView
    await cdp.eval(`(() => {
      if (window.storageService && window.storageService.memoryCache) {
        window.storageService.memoryCache.clear();
      }
      window.location.reload();
    })()`);
    await sleep(4500);

    // Assicuriamoci di essere su Oggi e su 28 nov 2026
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toLowerCase().includes('28') && b.textContent.toLowerCase().includes('nov'));
      if (btn) btn.click();
    })()`);
    await sleep(1500);

    // =========================================================================
    // 1. iPhone 15 Pro (393 x 852): 28 Novembre (Giorno con molti eventi)
    // =========================================================================
    await setViewport(cdp, 393, 852, true);
    await sleep(600);

    // Misurazioni altezze
    const measurements28Nov = await cdp.eval(`(() => {
      const timelineItems = Array.from(document.querySelectorAll('.hounigo-timeline-item'));
      
      // Cerca card treno Frecciarossa
      const trainItem = timelineItems.find(el => el.textContent && (el.textContent.includes('Frecciarossa') || el.textContent.includes('Roma Termini')));
      const trainCard = trainItem ? (trainItem.firstElementChild || trainItem) : null;
      
      // Cerca card foto pre-partenza
      const photoCard = document.querySelector('[data-testid="pre-departure-card"]') || 
        Array.from(document.querySelectorAll('div')).find(el => el.textContent && el.textContent.includes('Foto pre-partenza') && el.offsetHeight > 30 && el.offsetHeight < 300 && el.classList.contains('rounded-2xl'));
      
      // Cerca card Museo del Novecento
      const museumItem = timelineItems.find(el => el.textContent && el.textContent.includes('Museo del Novecento'));
      const museumCard = museumItem ? (museumItem.firstElementChild || museumItem) : null;

      // Cerca hero / next event
      const heroSection = document.querySelector('[data-focus-hero]') || 
        Array.from(document.querySelectorAll('div')).find(el => el.textContent && el.textContent.includes('Focus') && el.offsetHeight > 40 && el.offsetHeight < 300 && el.classList.contains('rounded-2xl'));

      return {
        trainHeight: trainCard ? trainCard.offsetHeight : null,
        photoHeight: photoCard ? photoCard.offsetHeight : null,
        museumHeight: museumCard ? museumCard.offsetHeight : null,
        heroHeight: heroSection ? heroSection.offsetHeight : null,
        bodyScrollHeight: document.body.scrollHeight,
        windowInnerHeight: window.innerHeight
      };
    })()`);

    console.log(`[MISURAZIONE 28 NOV]`, measurements28Nov);
    fs.writeFileSync(
      path.join(LOCAL_SCREENSHOT_DIR, `measurements_${mode}.json`),
      JSON.stringify(measurements28Nov, null, 2)
    );

    // Cattura TOP 28 Nov
    await captureScreenshot(cdp, `${mode}_iphone15_28nov_top.png`);

    // Scorri a MID
    await cdp.eval(`(() => { window.scrollTo(0, 500); })()`);
    await sleep(500);
    await captureScreenshot(cdp, `${mode}_iphone15_28nov_mid.png`);

    // Scorri a BOTTOM
    await cdp.eval(`(() => { window.scrollTo(0, document.body.scrollHeight || 1000); })()`);
    await sleep(500);
    await captureScreenshot(cdp, `${mode}_iphone15_28nov_bottom.png`);

    // =========================================================================
    // 2. Data con noleggio attivo (es. 5 dicembre 2026)
    // =========================================================================
    await cdp.eval(`(() => {
      // Navighiamo al 5 dicembre tramite data selector o cambio data
      const dateButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.toLowerCase().includes('dic'));
      const dec5 = dateButtons.find(b => b.textContent.includes('5') || b.textContent.includes('05'));
      if (dec5) {
        dec5.click();
      }
    })()`);
    await sleep(1000);
    await cdp.eval(`(() => { window.scrollTo(0, 300); })()`);
    await sleep(500);
    await captureScreenshot(cdp, `${mode}_iphone15_active_rental.png`);

    // =========================================================================
    // 3. Data con pochi eventi (es. 29 o 30 novembre, volo intercontinentale o relax)
    // =========================================================================
    await cdp.eval(`(() => {
      const nov29 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toLowerCase().includes('29') && b.textContent.toLowerCase().includes('nov'));
      if (nov29) nov29.click();
    })()`);
    await sleep(1000);
    await cdp.eval(`(() => { window.scrollTo(0, 0); })()`);
    await sleep(500);
    await captureScreenshot(cdp, `${mode}_iphone15_few_events.png`);

    // =========================================================================
    // 4. Modale / Popup su Mobile
    // =========================================================================
    // Torniamo al 28 nov
    await cdp.eval(`(() => {
      const nov28 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toLowerCase().includes('28') && b.textContent.toLowerCase().includes('nov'));
      if (nov28) nov28.click();
    })()`);
    await sleep(600);

    // Apriamo il selettore viaggi o impostazioni per testare il popup
    await cdp.eval(`(() => {
      // Cerca pulsante per aprire popup 'I tuoi viaggi' o switcher
      const tripBtn = Array.from(document.querySelectorAll('button')).find(b => 
        (b.textContent && (b.textContent.includes('Nuova Zelanda') || b.textContent.includes('I tuoi viaggi') || b.textContent.includes('Viaggio'))) ||
        b.getAttribute('aria-label')?.includes('viaggi')
      );
      if (tripBtn) tripBtn.click();
    })()`);
    await sleep(800);
    await captureScreenshot(cdp, `${mode}_iphone15_modal_open.png`);

    // Chiudi modale se aperta
    await cdp.eval(`(() => {
      const closeBtn = document.querySelector('[aria-label="Chiudi"], [aria-label="Close"], button.close, [data-testid="modal-close"]');
      if (closeBtn) closeBtn.click();
      else {
        const backdrop = document.querySelector('.backdrop, [class*="bg-black/"]');
        if (backdrop) backdrop.click();
      }
    })()`);
    await sleep(600);

    // =========================================================================
    // 5. Secondo Viewport Mobile: Android Standard (360 x 780)
    // =========================================================================
    await setViewport(cdp, 360, 780, true);
    await cdp.eval(`(() => { window.scrollTo(0, 0); })()`);
    await sleep(500);
    await captureScreenshot(cdp, `${mode}_android360_28nov.png`);

    // =========================================================================
    // 6. Desktop (1280 x 800)
    // =========================================================================
    await setViewport(cdp, 1280, 800, false);
    await cdp.eval(`(() => { window.scrollTo(0, 0); })()`);
    await sleep(600);
    await captureScreenshot(cdp, `${mode}_desktop_28nov.png`);

    // Desktop modal open
    await cdp.eval(`(() => {
      const tripBtn = Array.from(document.querySelectorAll('button')).find(b => 
        (b.textContent && (b.textContent.includes('Nuova Zelanda') || b.textContent.includes('I tuoi viaggi') || b.textContent.includes('Viaggio'))) ||
        b.getAttribute('aria-label')?.includes('viaggi')
      );
      if (tripBtn) tripBtn.click();
    })()`);
    await sleep(800);
    await captureScreenshot(cdp, `${mode}_desktop_modal_open.png`);

    console.log(`\n=== MISURAZIONE E CATTURA [${mode.toUpperCase()}] COMPLETATA CON SUCCESSO ===`);
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
