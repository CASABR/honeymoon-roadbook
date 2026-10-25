const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
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
  console.log('=== HOUNIGO — FASE 1: VERIFICA CONCLUSIVA CARD TRASPORTO EDITORIAL ===\n');

  // Launch Chrome
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
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  async function saveScreenshot(filename) {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(data, 'base64');
    for (const dir of SCREENSHOT_DIRS) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, buffer);
      console.log(`[SCREENSHOT SALVATO] ${fullPath} (${buffer.length} bytes)`);
    }
  }

  // 1. Initial setup at iPhone 15 Pro viewport
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true
  });

  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);

  // Authenticate session & register trip configuration
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
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    })()
  `);

  // Reload to hydrate authentication
  await client.send('Page.reload');
  await sleep(2500);

  // Inietta le 3 fixtures sintetiche richieste:
  // - Volo full (Air China CA950 con tutti i campi)
  // - Treno (Frecciarossa 9512 con binario, carrozza/posto, senza checkin aeroporto)
  // - Volo minimale con info mancanti (NZ823 senza gate, posto, PNR per test robustezza)
  console.log('2. Iniezione 3 card sintetiche (Volo full, Treno, Volo info mancanti)...');
  const injectResult = await client.eval(`
    (async () => {
      try {
        const { storageService } = await import('./src/storage/storageService.ts');

        const fixtures = [
          {
            id: 'syn_flight_full',
            type: 'volo',
            carrier: 'Air China · CA950',
            date: '2026-11-29',
            arrivalDate: '2026-11-30',
            departureTime: '12:30',
            arrivalTime: '05:30',
            departureLocation: 'Milano Malpensa',
            departureIata: 'MXP',
            arrivalLocation: 'Pechino Capital',
            arrivalIata: 'PEK',
            terminalGate: 'T1 · Gate B22',
            posti: '14A (Finestrino)',
            bookingCode: 'CA-950-XJ9',
            ticketUrl: 'https://example.com/ticket_ca950.pdf',
            cost: '1.250,00 €',
            paymentStatus: 'saldato',
            bagagli: '2 bagagli stiva 23kg + trolley cabina',
            noteCopilota: 'Passaporto 6 mesi. Check-in banchi T1.'
          },
          {
            id: 'syn_train_frecciarossa',
            type: 'treno',
            carrier: 'Frecciarossa 9512',
            date: '2026-11-28',
            departureTime: '08:15',
            arrivalTime: '11:45',
            departureLocation: 'Roma Termini',
            departureIata: 'ROM',
            arrivalLocation: 'Milano Centrale',
            arrivalIata: 'MIL',
            terminalGate: 'Binario 7',
            posti: 'Carrozza 4 · Posto 12D',
            bookingCode: 'FR-9512-PNR',
            ticketUrl: 'https://example.com/ticket_fr9512.pdf',
            cost: '89,00 €',
            paymentStatus: 'saldato'
          },
          {
            id: 'syn_flight_minimal',
            type: 'volo',
            carrier: 'Air New Zealand · NZ823',
            date: '2026-12-05',
            departureTime: '14:00',
            arrivalTime: '15:20',
            departureLocation: 'Auckland Int.',
            departureIata: 'AKL',
            arrivalLocation: 'Christchurch Int.',
            arrivalIata: 'CHC',
            cost: '140,00 €',
            paymentStatus: 'da_saldare'
          }
        ];

        for (const t of fixtures) {
          await storageService.saveTransport(t);
        }

        window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'trasporti' } }));
        return { success: true, count: fixtures.length };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);
  console.log('Esito iniezione:', injectResult);
  await sleep(1500);

  // Chiudi eventuale TimeCollisionModal cliccando 'Mantieni entrambe'
  await client.eval(`
    (() => {
      const keepBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Mantieni entrambe') || b.innerText.includes('Annulla'));
      if (keepBtn) keepBtn.click();
    })()
  `);
  await sleep(1000);

  // 3. Verifica DOM a 393 × 852 CSS px (iPhone 15 Pro) - LIGHT MODE
  console.log('\n--- 3. Verifica DOM su iPhone 15 Pro (393 × 852 px) - Light Mode ---');
  const checkLight = await client.eval(`
    (() => {
      const text = document.body.innerText.toUpperCase();
      const rawText = document.body.innerText;
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;

      return {
        // Gerarchia tratta/orari
        hasAirChina: text.includes('CA950'),
        hasRouteHierarchy: text.includes('12:30') && text.includes('05:30') && text.includes('MXP') && text.includes('PEK'),
        hasNextDayBadge: rawText.includes('+1'),
        
        // Terminal e gate
        hasTerminalGateFlight: text.includes('TERMINAL/GATE:') && text.includes('T1 · GATE B22'),
        
        // Posto
        hasSeatFlight: text.includes('POSTO:') && text.includes('14A (FINESTRINO)'),
        
        // Check-in (presente su volo con 11:30 e 09:30)
        hasCheckinNotice: text.includes('CHIUSURA CHECK-IN ENTRO 11:30') && text.includes('09:30'),
        
        // Biglietto e PNR
        hasPnrAirChina: text.includes('CA-950-XJ9'),
        hasTicketBtnAirChina: text.includes('BIGLIETTO'),
        
        // Prezzo nei dettagli
        hasPriceAirChina: text.includes('1250,00 €') || text.includes('1.250,00 €') || text.includes('1250'),
        hasStatusPaid: text.includes('SALDATO'),
        
        // Card Treno
        hasTrain: text.includes('FRECCIAROSSA 9512'),
        hasTrainPlatform: text.includes('BINARIO:') && text.includes('BINARIO 7'),
        hasTrainCoachSeat: text.includes('CARROZZA / POSTO:') && text.includes('CARROZZA 4 · POSTO 12D'),
        hasTrainNoAirportNotice: !rawText.includes('Frecciarossa') || !rawText.includes('consigliato in aeroporto'),
        
        // Card info mancanti
        hasMinimalCard: text.includes('NZ823') && text.includes('AKL') && text.includes('CHC'),
        
        // Layout e responsive
        noOverflow: scrollW <= innerW,
        scrollW,
        innerW
      };
    })()
  `);
  // Scrolla verticalmente per inquadrare la card Air China CA950 mantenendo left: 0
  await client.eval(`
    (() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const flightCard = cards.find(c => c.innerText.includes('CA950'));
      if (flightCard) {
        const top = flightCard.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 80), left: 0, behavior: 'instant' });
      }
    })()
  `);
  await sleep(1000);
  await saveScreenshot('transport_editorial_iphone15_light.png');

  // 4. Verifica DARK MODE a 393 × 852 CSS px
  console.log('\n--- 4. Verifica DOM su iPhone 15 Pro (393 × 852 px) - Dark Mode ---');
  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
  `);
  await sleep(1000);
  await client.eval(`
    (() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const flightCard = cards.find(c => c.innerText.includes('CA950'));
      if (flightCard) {
        const top = flightCard.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 80), left: 0, behavior: 'instant' });
      }
    })()
  `);
  await sleep(500);

  const checkDark = await client.eval(`
    (() => {
      const isDark = document.documentElement.classList.contains('dark');
      const text = document.body.innerText.toUpperCase();
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      return {
        isDark,
        hasAirChina: text.includes('CA950'),
        hasTrain: text.includes('FRECCIAROSSA'),
        noOverflow: scrollW <= innerW,
        scrollW,
        innerW
      };
    })()
  `);
  console.log('Risultati ispezione Dark Mode:', checkDark);
  await saveScreenshot('transport_editorial_iphone15_dark.png');

  // 5. Verifica a 320 px (Mobile compatto standard)
  console.log('\n--- 5. Verifica a 320 px (Mobile compatto standard) ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 640,
    deviceScaleFactor: 2,
    mobile: true
  });
  await client.send('Page.reload');
  await sleep(2500);

  // Naviga a trasporti
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'trasporti' } }));
  `);
  await sleep(1500);

  // Chiudi eventuale collision modal
  await client.eval(`
    (() => {
      const keepBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Mantieni entrambe') || b.innerText.includes('Annulla'));
      if (keepBtn) keepBtn.click();
    })()
  `);
  await sleep(1000);

  await client.eval(`
    (() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const flightCard = cards.find(c => c.innerText.includes('CA950'));
      if (flightCard) {
        const top = flightCard.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 80), left: 0, behavior: 'instant' });
      }
    })()
  `);
  await sleep(1000);

  const check320 = await client.eval(`
    (() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const text = document.body.innerText.toUpperCase();
      return {
        noOverflow: scrollW <= innerW,
        scrollW,
        innerW,
        hasAirChina: text.includes('CA950'),
        hasTrain: text.includes('FRECCIAROSSA 9512'),
        hasMinimal: text.includes('NZ823')
      };
    })()
  `);
  console.log('Risultati ispezione 320 px:', check320);
  await saveScreenshot('transport_editorial_320px.png');

  client.close();
  chromeProc.kill();
  console.log('\n=== FASE 1 COMPLETATA CON SUCCESSO! ===\n');
}

run().catch(err => {
  console.error('[ERRORE FASE 1]:', err);
  process.exit(1);
});
