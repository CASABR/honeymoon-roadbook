const { spawn, spawnSync } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9247;
const appUrl = process.env.HOUNIGO_TEST_URL || 'http://127.0.0.1:4173/';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function run() {
  const profileDirectory = `C:\\tmp\\hounigo-ux-${Date.now()}`;
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank'
  ]);

  try {
    await sleep(1200);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find(target => target.type === 'page');
    if (!page) throw new Error('Nessuna pagina Chrome disponibile');

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    let requestId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Errore Runtime.evaluate');
      return result.result.value;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', {
      urls: [
        '*firestore.googleapis.com/*',
        '*firebaseio.com/*',
        '*identitytoolkit.googleapis.com/*',
        '*securetoken.googleapis.com/*'
      ]
    });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: appUrl });
    await sleep(1800);

    await evaluate(`(() => {
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('app_device_role', 'guida');
      localStorage.setItem('hounigo_user_role', 'owner');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: '0000', title: 'Test locale', startDate: '2026-11-28', endDate: '2027-01-10'
      }));
      return true;
    })()`);
    await evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open('ViaggiodiNozzeDB', 8);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('tappe', 'readwrite');
        const store = transaction.objectStore('tappe');
        const now = Date.now();
        store.put({ id: 'ux-test-a', titolo: 'Tappa test A', data: '2026-11-28', orario: '09:00', createdAt: now, updatedAt: now });
        store.put({ id: 'ux-test-b', titolo: 'Tappa test B', data: '2026-11-28', orario: '11:00', createdAt: now, updatedAt: now });
        transaction.oncomplete = () => { db.close(); resolve(true); };
        transaction.onerror = () => reject(transaction.error);
      };
    })`);
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: "Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });"
    });
    await send('Page.reload', { ignoreCache: true });
    await sleep(3500);

    const desktop = await evaluate(`(() => {
      const header = Array.from(document.querySelectorAll('div')).find(element =>
        element.className.includes('hidden lg:flex sticky top-0')
      );
      const insertButtons = Array.from(document.querySelectorAll('button')).filter(button =>
        button.getAttribute('aria-label')?.startsWith('Inserisci una card dopo')
      );
      return {
        headerVisible: Boolean(header && getComputedStyle(header).display !== 'none'),
        insertionCount: insertButtons.length,
        bodyText: document.body.innerText.slice(0, 300)
      };
    })()`);
    if (!desktop.headerVisible) throw new Error('Header desktop sticky non visibile');
    if (desktop.insertionCount < 1) throw new Error(`Nessun punto di inserimento desktop; pagina: ${desktop.bodyText}`);

    await evaluate(`(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const button = Array.from(document.querySelectorAll('button')).find(item =>
        item.getAttribute('aria-label')?.startsWith('Inserisci una card dopo')
      );
      button.scrollIntoView({ block: 'center' });
      button.click();
      return true;
    })()`);
    await sleep(250);

    const chooser = await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"][aria-label="Inserisci una nuova card"]');
      const input = panel?.querySelector('input[type="time"]');
      if (!input || !panel) return { categories: 0, hasTime: false, insideViewport: false };
      const categories = panel ? Array.from(panel.querySelectorAll('button')).filter(button =>
        ['Tappa', 'Attività', 'Ristorante', 'Alloggio', 'Trasporto', 'Shopping'].some(label => button.textContent.includes(label))
      ) : [];
      const rect = panel.getBoundingClientRect();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, input.value || '12:34');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        categories: categories.length,
        hasTime: Boolean(input.value),
        insideViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1
      };
    })()`);
    if (chooser.categories !== 6 || !chooser.hasTime || !chooser.insideViewport) throw new Error(`Selettore inserimento incompleto: ${JSON.stringify(chooser)}`);
    await sleep(100);

    await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"][aria-label="Inserisci una nuova card"]');
      const button = Array.from(panel.querySelectorAll('button')).find(item => item.textContent.includes('Tappa'));
      button.click();
      return true;
    })()`);
    await sleep(250);

    const dialog = await evaluate(`(() => {
      const element = document.querySelector('[role="dialog"]');
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        insideViewport: rect.top >= 0 && rect.bottom <= innerHeight + 1,
        centerDelta: Math.abs((rect.top + rect.height / 2) - innerHeight / 2),
        activeInside: element.contains(document.activeElement)
      };
    })()`);
    if (!dialog?.insideViewport || dialog.centerDelta > 80 || !dialog.activeInside) {
      throw new Error(`Dialog desktop non centrato/accessibile: ${JSON.stringify(dialog)}`);
    }

    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(150);

    await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
    await sleep(250);
    const mobile = await evaluate(`(() => {
      const header = Array.from(document.querySelectorAll('div')).find(element =>
        element.className.includes('hidden lg:flex sticky top-0')
      );
      const insertButton = Array.from(document.querySelectorAll('button')).find(button =>
        button.getAttribute('aria-label')?.startsWith('Inserisci una card dopo')
      );
      return {
        headerHidden: !header || getComputedStyle(header).display === 'none',
        insertionHidden: !insertButton || getComputedStyle(insertButton.parentElement).display === 'none',
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        dialogClosed: !document.querySelector('[role="dialog"]')
      };
    })()`);
    if (!Object.values(mobile).every(Boolean)) throw new Error(`Regressione viewport mobile: ${JSON.stringify(mobile)}`);

    console.log('[PASS] Desktop: header sticky e punti di inserimento visibili');
    console.log('[PASS] Inserimento: sei categorie e orario esplicito');
    console.log('[PASS] Dialog: centrato dopo scroll, focus ed Escape');
    console.log('[PASS] Mobile 393x852: controlli desktop nascosti, nessun overflow');
    socket.close();
  } finally {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      chrome.kill();
    }
    await sleep(1500);
    fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

run().catch(error => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
