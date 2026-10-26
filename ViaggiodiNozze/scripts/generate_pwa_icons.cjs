/**
 * generate_pwa_icons.cjs
 * Genera le icone PWA quadrate pwa-192x192.png e pwa-512x512.png
 * a partire dal logo ufficiale in public/images/brand/hounigo-logo-on-light.png,
 * perfettamente centrate e senza alcuna deformazione.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;

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
    return new Promise((resolve, reject) => {
      const id = this.id++;
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
  console.log('=== GENERAZIONE ICONE PWA HOUNIGO ===');

  const logoPath = path.join(__dirname, '..', 'public', 'images', 'brand', 'hounigo-logo-on-light.png');
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo non trovato in ${logoPath}`);
  }

  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const logoDataUri = `data:image/png;base64,${logoBase64}`;

  // Avvia Chrome headless
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-pwa-icons'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  console.log('[CDP] Connesso con successo!');
  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(300);

    const sizes = [192, 512];
    for (const size of sizes) {
      console.log(`[INFO] Generazione icona ${size}x${size}...`);
      
      const script = `
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = ${size};
            canvas.height = ${size};
            const ctx = canvas.getContext('2d');
            
            // Sfondo bianco pulito (come da background_color del manifest)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, ${size}, ${size});
            
            // Rapporto e centratura perfetta senza deformazione (safe area 84%)
            const maxLogoWidth = ${size} * 0.84;
            const scale = maxLogoWidth / img.width;
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const drawX = (${size} - drawW) / 2;
            const drawY = (${size} - drawH) / 2;
            
            // Disegna logo ufficiale centrato
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            
            resolve(canvas.toDataURL('image/png').split(',')[1]);
          };
          img.onerror = (e) => reject('Errore caricamento immagine');
          img.src = '${logoDataUri}';
        })
      `;

      const base64Data = await cdp.eval(script);
      const buffer = Buffer.from(base64Data, 'base64');
      const outPath = path.join(__dirname, '..', 'public', `pwa-${size}x${size}.png`);
      fs.writeFileSync(outPath, buffer);
      console.log(`[SUCCESSO] Icona creata: ${outPath} (${buffer.length} bytes, ${size}x${size})`);
    }

    console.log('\n=== ICONE GENERATE CON SUCCESSO! ===');
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]:', err);
  process.exit(1);
});
