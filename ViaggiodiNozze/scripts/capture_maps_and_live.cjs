const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const msg = JSON.stringify({ id, method, params });
    const onMessage = (evt) => {
      const res = JSON.parse(evt.data.toString());
      if (res.id === id) {
        ws.removeEventListener('message', onMessage);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(msg);
  });
}

async function captureScreen(viewport, theme, viewTab, filename) {
  const port = 9225;
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    `--window-size=${viewport.width},${viewport.height}`,
    'http://localhost:5173/'
  ]);

  await wait(2500);

  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    await new Promise(r => { ws.onopen = r; });

    await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 2,
      mobile: viewport.width < 768
    });

    // Imposta theme e stato di autenticazione e configurazione
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (() => {
          if ('${theme}' === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
          }
          localStorage.setItem('houni_trip_id', '0000');
          localStorage.setItem('houni_device_role', 'viewer');
          localStorage.setItem('houni_authenticated', 'true');
          localStorage.setItem('houni_pin_authenticated', 'true');
          localStorage.setItem('auth_pin_verified', 'true');
          localStorage.setItem('app_device_role', 'viewer');
          localStorage.setItem('roadbook_trip_config', JSON.stringify({
            id: '0000',
            title: 'Viaggio Originale',
            startDate: '2026-11-28',
            endDate: '2027-01-10',
            totalDays: 44,
            ownerName: 'nunzio'
          }));
          localStorage.setItem('walkthrough_seen', 'true');
          localStorage.setItem('houni_onboarding_completed_v1', 'true');
          localStorage.setItem('has_onboarded', 'true');
          localStorage.setItem('houni_view_mode', '${viewport.width >= 768 ? 'desktop' : 'mobile'}');
        })()
      `
    });

    await sendCDP(ws, 'Page.navigate', { url: 'http://localhost:5173/' });
    await wait(2000);

    if (viewTab === 'live') {
      await sendCDP(ws, 'Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const liveBtn = btns.find(b => b.textContent && (b.textContent.includes('LIVE Tracking GPS') || b.textContent.includes('Live Viaggio') || b.textContent.includes('LIVE')));
            if (liveBtn) liveBtn.click();
            else {
              window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'live' } }));
            }
          })()
        `
      });
      await wait(1800);
    } else {
      await sendCDP(ws, 'Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const oggiBtn = btns.find(b => b.textContent && (b.textContent.includes('Itinerario Giornaliero') || b.textContent.includes('Oggi') || b.textContent.includes('Itinerario')));
            if (oggiBtn) oggiBtn.click();
          })()
        `
      });
      await wait(1800);
    }

    await wait(2200);

    const { data } = await sendCDP(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });

    const dest = path.join(screenshotsDir, filename);
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    console.log(`✓ Screenshot salvato: ${filename} (${viewport.width}x${viewport.height}, ${theme}, ${viewTab})`);

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function run() {
  console.log('Avvio suite screenshot responsive e verifica visiva...');

  // 1. Desktop 1440px - Oggi con nuova DayMapsCard
  await captureScreen({ width: 1440, height: 900 }, 'light', 'oggi', 'desktop_1440_maps_light.png');
  await captureScreen({ width: 1440, height: 900 }, 'dark', 'oggi', 'desktop_1440_maps_dark.png');

  // 2. Desktop 1440px - Live Tracking e Mappa
  await captureScreen({ width: 1440, height: 900 }, 'light', 'live', 'desktop_1440_live_light.png');
  await captureScreen({ width: 1440, height: 900 }, 'dark', 'live', 'desktop_1440_live_dark.png');

  // 3. Mobile 393px - Oggi con nuova DayMapsCard
  await captureScreen({ width: 393, height: 852 }, 'light', 'oggi', 'mobile_393_maps_light.png');
  await captureScreen({ width: 393, height: 852 }, 'dark', 'oggi', 'mobile_393_maps_dark.png');

  // 4. Mobile 320px - Schermo ultra-compatto
  await captureScreen({ width: 320, height: 600 }, 'light', 'oggi', 'mobile_320_maps_light.png');

  console.log('Tutti gli screenshot completati con successo!');
}

run().catch(console.error);
