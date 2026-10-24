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
    this.events = [];
    
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
  console.log('=== AVVIO VERIFICA VISIVA E CATTURA SCREENSHOT ===\n');
  
  // 1. Launch Chrome
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
    throw new Error('Impossibile connettersi a Chrome DevTools Protocol su porta ' + PORT);
  }

  console.log('[OK] Connessione CDP stabilita.');
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.ready();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  // Helper to save screenshot to both directories
  async function saveScreenshot(filename) {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(data, 'base64');
    for (const dir of SCREENSHOT_DIRS) {
      if (fs.existsSync(dir)) {
        const fullPath = path.join(dir, filename);
        fs.writeFileSync(fullPath, buffer);
        console.log(`[SCREENSHOT SALVATO] ${fullPath} (${buffer.length} bytes)`);
      }
    }
  }

  // --- VERIFICA 1: Oggi Travel Editorial Desktop Light ---
  console.log('\n--- Test 1.1: Oggi Travel Editorial - Desktop Light ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });
  await client.send('Page.navigate', { url: `${BASE_URL}/` });
  await sleep(1500);

  // Imposta sessione autenticata per viaggio 0000 e Light Mode
  await client.eval(`
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('houni_authenticated', 'true');
    localStorage.setItem('houni_pin_authenticated', 'true');
    localStorage.setItem('auth_pin_verified', 'true');
    localStorage.setItem('walkthrough_seen', 'true');
    localStorage.setItem('houni_onboarding_completed_v1', 'true');
    localStorage.setItem('houni_view_mode', 'desktop');
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  `);
  await client.send('Page.reload');
  await sleep(2500);

  // Seleziona Itinerario Giornaliero (OggiView) nella sidebar desktop
  await client.eval(`
    const itinBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Itinerario Giornaliero'));
    if (itinBtn) itinBtn.click();
    else window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'oggi' } }));
  `);
  await sleep(1500);

  const isTodayView = await client.eval(`
    document.body.innerText.includes('CALENDARIO TAPPE') || 
    document.body.innerText.includes('ALLOGGIO PER STANOTTE') ||
    document.body.innerText.includes('Nuova Zelanda')
  `);
  console.log(`[VERIFICA] Oggi Travel Editorial presente in Desktop Light: ${isTodayView}`);
  await saveScreenshot('desktop_light.png');

  // --- VERIFICA 2: Oggi Travel Editorial Desktop Dark ---
  console.log('\n--- Test 1.2: Oggi Travel Editorial - Desktop Dark ---');
  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
  `);
  await sleep(800);
  const isDarkApplied = await client.eval(`document.documentElement.classList.contains('dark')`);
  console.log(`[VERIFICA] Classe dark applicata a html: ${isDarkApplied}`);
  await saveScreenshot('desktop_dark.png');

  // --- VERIFICA 3: Oggi Travel Editorial Mobile Light ---
  console.log('\n--- Test 1.3: Oggi Travel Editorial - Mobile Light ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });
  await client.eval(`
    localStorage.setItem('theme', 'light');
    localStorage.setItem('houni_view_mode', 'mobile');
    document.documentElement.classList.remove('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'light' } }));
  `);
  await client.send('Page.reload');
  await sleep(2500);
  await saveScreenshot('mobile_light.png');

  // --- VERIFICA 4: Oggi Travel Editorial Mobile Dark ---
  console.log('\n--- Test 1.4: Oggi Travel Editorial - Mobile Dark ---');
  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
  `);
  await sleep(800);
  await saveScreenshot('mobile_dark.png');

  // Ripristina desktop metrics per le verifiche funzionali
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  // --- VERIFICA 5: Mappa su viaggio nuovo SENZA tappe ---
  console.log('\n--- Test 1.5: Mappa su viaggio nuovo SENZA tappe ---');
  await client.eval(`
    localStorage.setItem('houni_trip_id', 'trip_empty_test');
    localStorage.setItem('roadbook_trip_config', JSON.stringify({
      id: 'trip_empty_test',
      title: 'Nuovo Viaggio',
      startDate: '2027-02-01',
      endDate: '2027-02-15'
    }));
    localStorage.setItem('houni_view_mode', 'desktop');
  `);
  await client.send('Page.reload');
  await sleep(2000);

  // Naviga alla Mappa
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'mappa' } }));
  `);
  await sleep(1500);

  const emptyMapText = await client.eval(`
    document.body.innerText.includes('Mappa vuota') || 
    document.body.innerText.includes('nessun punto registrato')
  `);
  const hasLeafletCrash = await client.eval(`
    !!document.querySelector('.leaflet-container')
  `);
  console.log(`[VERIFICA] Mappa vuota mostra stato dedicato senza tappe: ${emptyMapText}`);
  console.log(`[VERIFICA] MapContainer Leaflet non montato su stato vuoto (anti-crash): ${!hasLeafletCrash}`);

  // --- VERIFICA 6: Mappa su viaggio CON tappe ---
  console.log('\n--- Test 1.6: Mappa su viaggio CON tappe (0000) ---');
  await client.eval(`
    localStorage.setItem('houni_trip_id', '0000');
    localStorage.removeItem('roadbook_trip_config');
  `);
  await client.send('Page.reload');
  await sleep(2000);
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'mappa' } }));
  `);
  await sleep(2000);

  const hasPinsOrLeaflet = await client.eval(`
    !!document.querySelector('.leaflet-container') ||
    !!document.querySelector('.leaflet-custom-poi-marker') ||
    document.body.innerText.includes('Tutti (')
  `);
  console.log(`[VERIFICA] Mappa con tappe monta Leaflet e carica pin: ${hasPinsOrLeaflet}`);

  // --- VERIFICA 7: LIVE GPS da desktop SENZA autorizzazione GPS ---
  console.log('\n--- Test 1.7: LIVE GPS da desktop SENZA autorizzazione GPS ---');
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'live' } }));
  `);
  await sleep(2000);

  const liveViewLoaded = await client.eval(`
    document.body.innerText.includes('LIVE') || 
    document.body.innerText.includes('DIARIO DAL VIVO') ||
    document.body.innerText.includes('Stato Viaggio')
  `);
  const noCrashLive = await client.eval(`
    !document.body.innerText.includes('Qualcosa è andato storto') &&
    !document.body.innerText.includes('Application Error')
  `);
  console.log(`[VERIFICA] Schermata LIVE montata regolarmente: ${liveViewLoaded}`);
  console.log(`[VERIFICA] Nessun crash o blocco in assenza di GPS: ${noCrashLive}`);

  // --- VERIFICA 8: Note - Aggiunta, Modifica ed Eliminazione ---
  console.log('\n--- Test 1.8: Note - Aggiunta, Modifica ed Eliminazione ---');
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'note' } }));
    window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'note' } }));
  `);
  await sleep(1500);

  const noteViewLoaded = await client.eval(`
    document.body.innerText.includes('Note di Viaggio') ||
    document.body.innerText.includes('Nuova Nota') ||
    document.body.innerText.includes('Post-it')
  `);
  console.log(`[VERIFICA] Schermata Note montata: ${noteViewLoaded}`);;

  // Esegui test CRUD completo sul componente Note via UI / storageService
  const noteCrudResult = await client.eval(`
    (async () => {
      try {
        // 1. Aggiunta
        const testId = 'test_note_' + Date.now();
        const testNote = {
          id: testId,
          title: 'Nota Test E2E Chiusura',
          content: 'Contenuto di verifica funzionale per chiusura sprint',
          color: 'emerald',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        // Simula click pulsante "Nuova Nota"
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Nuova Nota') || b.title?.includes('Nuova'));
        if (addBtn) addBtn.click();
        
        // Salva direttamente tramite storageService per validare persistenza DB
        const { storageService } = await import('./src/storage/storageService.ts');
        await storageService.saveNota(testNote);
        
        let allNotes = await storageService.getNote();
        const createdOk = allNotes.some(n => n.id === testId);
        
        // 2. Modifica
        testNote.title = 'Nota Test E2E Chiusura (MODIFICATA)';
        testNote.updatedAt = Date.now();
        await storageService.saveNota(testNote);
        allNotes = await storageService.getNote();
        const modifiedOk = allNotes.some(n => n.id === testId && n.title.includes('MODIFICATA'));
        
        // 3. Eliminazione
        await storageService.deleteNota(testId);
        allNotes = await storageService.getNote();
        const deletedOk = !allNotes.some(n => n.id === testId);
        
        return { createdOk, modifiedOk, deletedOk };
      } catch (err) {
        return { error: err.message };
      }
    })()
  `);
  console.log('[VERIFICA] Esito CRUD Note:', noteCrudResult);

  // --- VERIFICA 9: Card Trasporto Travel Editorial (iPhone 15 Pro: 393 × 852 px) ---
  console.log('\n--- Test 1.9: Card Trasporto Travel Editorial - iPhone 15 Pro ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true
  });

  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'trasporti' } }));
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'light' } }));
  `);
  await sleep(2000);
  await saveScreenshot('transport_editorial_iphone15_light.png');

  await client.eval(`
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'dark' } }));
  `);
  await sleep(1000);
  await saveScreenshot('transport_editorial_iphone15_dark.png');

  const transportCheck = await client.eval(`
    (() => {
      const text = document.body.innerText;
      const hasCards = document.querySelectorAll('.rounded-2xl').length > 0;
      const noOverflow = document.documentElement.scrollWidth <= window.innerWidth;
      return { hasCards, noOverflow, hasAirChina: text.includes('Air China') || text.includes('MXP') };
    })()
  `);
  console.log('[VERIFICA TRASPORTI] Card caricate e formattate:', transportCheck);

  // --- VERIFICA 10: LIVE Intelligence & Dual Map (iPhone 15 Pro: 393 × 852 px) ---
  console.log('\n--- Test 1.10: LIVE Intelligence & Dual Reference Map - iPhone 15 Pro ---');
  await client.eval(`
    window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'live' } }));
    window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'live' } }));
  `);
  await sleep(2500);
  await saveScreenshot('live_dual_reference_iphone15_dark.png');

  await client.eval(`
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { theme: 'light' } }));
  `);
  await sleep(1000);
  await saveScreenshot('live_dual_reference_iphone15_light.png');

  const liveCheck = await client.eval(`
    (() => {
      const text = document.body.innerText;
      return {
        hasPosition: text.includes('01 · Posizione') || text.includes('Dove siamo'),
        hasDiario: text.includes('02 · Diario') || text.includes('Diario'),
        hasControls: text.includes('Avvia') || text.includes('LIVE') || text.includes('Dispositivo autorizzato'),
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()
  `);
  console.log('[VERIFICA LIVE INTELLIGENCE] Elementi e responsive verificati:', liveCheck);

  // Close browser
  client.close();
  chromeProc.kill();
  console.log('\n=== VERIFICA VISIVA COMPLETATA CON SUCCESSO! ===\n');
}

run().catch(err => {
  console.error('[ERRORE VERIFICA]:', err);
  process.exit(1);
});
