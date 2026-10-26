const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const VITE_PORT = 5173;
const BASE_URL = `http://localhost:${VITE_PORT}`;

const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\62bf6247-9ed9-4d56-890b-a2a63fe7702a\\screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });

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

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
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
  await sleep(250);
}

async function run() {
  console.log('=== AVVIO CATTURA SCREENSHOT JARVIS FINALE (320px, 393px, Desktop) ===\n');

  let viteProc = null;
  let viteRunning = false;
  try {
    const testRes = await fetch(`${BASE_URL}/`);
    if (testRes.ok) viteRunning = true;
  } catch {}

  if (!viteRunning) {
    console.log('[INFO] Avvio Vite Dev su porta ' + VITE_PORT);
    viteProc = spawn('npm.cmd', ['run', 'dev', '--', '--port', String(VITE_PORT), '--strictPort'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true
    });
    for (let i = 0; i < 20; i++) {
      await sleep(600);
      try {
        const r = await fetch(`${BASE_URL}/`);
        if (r.ok) {
          viteRunning = true;
          break;
        }
      } catch {}
    }
  }

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-finale'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
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
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  console.log('[CDP] Connesso con successo!');
  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. PRIMO ACCESSO LIGHT (320px, 393px, Desktop)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. PRIMO ACCESSO LIGHT ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1500);

    // Reset onboarding state in localStorage per mostrare OnboardingView
    await cdp.eval(`
      localStorage.removeItem('houni_onboarding_completed_v1');
      sessionStorage.removeItem('houni_pending_invite');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    `);
    await cdp.send('Page.reload');
    await sleep(2000);

    // 1A. Mobile 393px (iPhone 14 / standard moderno)
    await setViewport(cdp, 393, 852, true);
    await sleep(500);
    await captureScreenshot(cdp, 'finale_393_onboarding_light.png');

    // 1B. Mobile 320px (iPhone SE compattezza estrema)
    await setViewport(cdp, 320, 568, true);
    await sleep(500);
    await captureScreenshot(cdp, 'finale_320_onboarding_light.png');

    // 1C. Desktop 1280px
    await setViewport(cdp, 1280, 800, false);
    await sleep(500);
    await captureScreenshot(cdp, 'finale_desktop_onboarding_light.png');

    // ═══════════════════════════════════════════════════════════════════════════
    // 2 & 3. LOGO COMPLETO SU SFONDO CHIARO (A) E SU SFONDO NAVY (B)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 2 & 3. LOGHI UFFICIALI SU SFONDO CHIARO E SCURO ---');
    await cdp.eval(`
      document.body.innerHTML = \`
        <div style="padding: 40px; display: flex; flex-direction: column; gap: 40px; font-family: Manrope, sans-serif;">
          <!-- LOGO A SU CLOUD LIGHT -->
          <div id="test-logo-light" style="background: #F8F7F3; padding: 32px; border-radius: 24px; border: 1px solid #e2e8f0; display: inline-flex; flex-direction: column; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Logo A — Ufficiale Lettering Navy su Cloud (#F8F7F3)</div>
            <img src="/images/brand/hounigo-logo-on-light.png" style="height: 52px; width: auto; object-fit: contain;" alt="Hounigo Light" />
          </div>

          <!-- LOGO B SU NAVY SCURO -->
          <div id="test-logo-dark" style="background: #172033; padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); display: inline-flex; flex-direction: column; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8;">Logo B — Ufficiale Lettering Bianco su Navy (#172033)</div>
            <img src="/images/brand/hounigo-logo-on-dark.png" style="height: 52px; width: auto; object-fit: contain;" alt="Hounigo Dark" />
          </div>
        </div>
      \`;
    `);
    await setViewport(cdp, 640, 480, false);
    await sleep(600);
    await captureScreenshot(cdp, 'finale_loghi_ufficiali_light_and_dark.png');

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. HOUNIAI LIGHT (393px & Desktop)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. HOUNIAI LIGHT ---');
    // Ripristiniamo la navigazione normale con sessione autenticata
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1500);
    await cdp.eval(`
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_device_role', 'organizer');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hounigo_trip_config', JSON.stringify({
        id: '0000',
        title: 'Nuova Zelanda & Australia 2026',
        startDate: '2026-11-28',
        endDate: '2027-01-10',
        ownerName: '***REMOVED*** & ***REMOVED***'
      }));
    `);
    await cdp.send('Page.reload');
    await sleep(2500);

    // Apri HouniAI modal
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'manual' } }));
    `);
    await sleep(600);

    // Mobile 393px HouniAI Light
    await setViewport(cdp, 393, 852, true);
    await sleep(400);
    await captureScreenshot(cdp, 'finale_393_houniai_light.png');

    // Desktop HouniAI Light
    await setViewport(cdp, 1280, 800, false);
    await sleep(400);
    await captureScreenshot(cdp, 'finale_desktop_houniai_light.png');

    // Chiudi modal HouniAI premendo ESC o click backdrop
    await cdp.eval(`
      const closeBtn = document.querySelector('button[aria-label="Chiudi"], .fixed button svg path[d*="M6 18L18 6"]')?.closest('button');
      if (closeBtn) closeBtn.click();
    `);
    await sleep(500);

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. OGGI (Mobile 393px e Desktop)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 5. OGGI VIEW ---');
    await cdp.eval(`
      // Clicca sul tab Oggi
      const btnOggi = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent && el.textContent.includes('Oggi'));
      if (btnOggi) btnOggi.click();
    `);
    await sleep(600);

    await setViewport(cdp, 393, 852, true);
    await sleep(400);
    await captureScreenshot(cdp, 'finale_393_oggi.png');

    await setViewport(cdp, 1280, 800, false);
    await sleep(400);
    await captureScreenshot(cdp, 'finale_desktop_oggi.png');

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. LIVE (Mobile 393px e Desktop)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 6. LIVE VIEW ---');
    // Mobile 393px LIVE view
    await setViewport(cdp, 393, 852, true);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?view=live` });
    await sleep(1500);
    await captureScreenshot(cdp, 'finale_393_live.png');

    // Desktop LIVE view
    await setViewport(cdp, 1280, 800, false);
    await sleep(600);
    await captureScreenshot(cdp, 'finale_desktop_live.png');

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. NAVIGAZIONE CON TRAIL ICONS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n--- 7. NAVIGAZIONE CON TRAIL ICONS ---');
    // Torna alla home
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await sleep(1500);

    // Su 393px mostra la bottom bar con le Trail Icons originali
    await setViewport(cdp, 393, 852, true);
    await sleep(500);
    await captureScreenshot(cdp, 'finale_393_nav_trail_icons.png');

    // Su Desktop mostra la sidebar di navigazione con Trail Icons e HounigoLogo
    await setViewport(cdp, 1280, 800, false);
    await sleep(500);
    await captureScreenshot(cdp, 'finale_desktop_nav_trail_icons.png');

    console.log('\n=== CATTURA COMPLETATA CON SUCCESSO! TUTTI GLI SCREENSHOT SONO PRONTI ===');

  } catch (err) {
    console.error('Errore durante la cattura screenshot:', err);
  } finally {
    cdp.close();
    chromeProc.kill();
    if (viteProc) viteProc.kill();
  }
}

run();
