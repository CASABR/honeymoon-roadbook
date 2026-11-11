const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = 'C:\\Users\\CUSI\\.gemini\\antigravity\\brain\\d1e39d97-0426-46d3-8997-c8e3fadd549e\\scratch\\first_boot';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const { preview } = await import('vite');
  const server = await preview({
    root,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port: 5199, strictPort: true },
  });

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });

    // Scenario 1: Primo avvio assoluto (zero localStorage/sessionStorage/IndexedDB) con rete esterna bloccata (offline/slow) e iPhone 15 Pro (393x852)
    const ctx1 = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await ctx1.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await new Promise((r) => setTimeout(r, 40)); // simula latenza locale
        return route.continue();
      }
      return route.abort(); // simula assenza rete verso Firebase/Google Fonts
    });

    const page1 = await ctx1.newPage();
    page1.setDefaultTimeout(10000);
    const pageErrors = [];
    page1.on('pageerror', (e) => pageErrors.push(e.message));

    await page1.goto('http://127.0.0.1:5199/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    // Imposta safe area iPhone 15 Pro per verificare che il card onboarding non venga spinto giù
    await page1.evaluate(() => {
      ['top', 'right', 'bottom', 'left'].forEach((edge, idx) => {
        document.documentElement.style.setProperty(`--app-safe-${edge}`, `${[59, 0, 34, 0][idx]}px`);
      });
    });

    // Attende il naturale completamento dello splash screen e del caricamento iniziale
    await page1.locator('[data-testid="hounigo-app-splash"]').waitFor({ state: 'detached', timeout: 6000 });
    await page1.getByRole('button', { name: /Crea il tuo viaggio/ }).waitFor({ state: 'visible', timeout: 5000 });
    await page1.waitForTimeout(200);

    const layout = await page1.evaluate(() => {
      const shell = document.querySelector('.app-onboarding-shell');
      const shellChildren = shell ? Array.from(shell.children) : [];
      const blobPositions = shellChildren
        .filter((el) => el.classList.contains('absolute'))
        .map((el) => getComputedStyle(el).position);
      const cardRect = shell?.querySelector('.rounded-3xl')?.getBoundingClientRect() || null;
      const ctaCreate = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Crea il tuo viaggio'))?.getBoundingClientRect() || null;
      const ctaJoin = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Hai ricevuto un invito'))?.getBoundingClientRect() || null;
      const ctaLogin = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Hai già un account'))?.getBoundingClientRect() || null;
      return {
        blobCount: blobPositions.length,
        blobPositions,
        cardRect,
        ctaCreate,
        ctaJoin,
        ctaLogin,
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
      };
    });

    await page1.screenshot({ path: path.join(outDir, 'first-boot-393x852.png') });

    assert.equal(pageErrors.length, 0, `Unexpected page errors on first boot: ${JSON.stringify(pageErrors)}`);
    assert.ok(layout.blobCount >= 2, 'Expected decorative blur blobs inside onboarding shell');
    layout.blobPositions.forEach((pos, idx) => {
      assert.equal(pos, 'absolute', `Decorative blob #${idx} must keep position:absolute (got ${pos})`);
    });
    assert.ok(layout.cardRect, 'Onboarding card must exist');
    assert.ok(layout.cardRect.top >= 58, `Onboarding card overlapped top safe area: top=${layout.cardRect.top}`);
    assert.ok(layout.cardRect.top < 250, `Onboarding card pushed below fold (white-screen bug): top=${layout.cardRect.top}`);
    assert.ok(layout.ctaCreate && layout.ctaCreate.bottom <= layout.innerHeight, `Primary CTA pushed off-screen: bottom=${layout.ctaCreate?.bottom}`);
    assert.ok(layout.ctaJoin && layout.ctaJoin.bottom <= layout.innerHeight, `Invite CTA pushed off-screen: bottom=${layout.ctaJoin?.bottom}`);
    assert.ok(layout.ctaLogin && layout.ctaLogin.bottom <= layout.innerHeight, `Login CTA pushed off-screen: bottom=${layout.ctaLogin?.bottom}`);
    await ctx1.close();

    // Scenario 2: IndexedDB bloccato/fallito al primo avvio -> l'app non resta bloccata su schermo bianco
    const ctx2 = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await ctx2.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
    await ctx2.addInitScript(() => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new Error('Blocked IndexedDB simulation');
        },
      });
    });
    const page2 = await ctx2.newPage();
    page2.setDefaultTimeout(8000);
    await page2.goto('http://127.0.0.1:5199/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    const hasOnboardingOrRetry = await Promise.race([
      page2.getByRole('button', { name: /Crea il tuo viaggio/ }).waitFor({ state: 'visible' }).then(() => 'onboarding'),
      page2.getByRole('button', { name: /Riprova|Ricarica l'App/i }).waitFor({ state: 'visible' }).then(() => 'retry'),
    ]);
    assert.ok(hasOnboardingOrRetry === 'onboarding' || hasOnboardingOrRetry === 'retry');
    await ctx2.close();

    console.log('✅ test_first_boot_onboarding PASSED', {
      cardTop: Math.round(layout.cardRect.top),
      cardBottom: Math.round(layout.cardRect.bottom),
      ctaCreateBottom: Math.round(layout.ctaCreate.bottom),
      indexedDbBlockedFallback: hasOnboardingOrRetry,
    });
  } finally {
    if (browser) await browser.close();
    server.httpServer.close();
  }
})();

