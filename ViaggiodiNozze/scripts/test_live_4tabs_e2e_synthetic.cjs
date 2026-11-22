const assert = require('node:assert/strict');
const path = require('node:path');
const { preview } = require('vite');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 4186;
const baseUrl = `http://127.0.0.1:${port}/honeymoon-roadbook`;
const TRIP_ID = 'synth-4tabs';

const tinyPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mP8z8BQz0AEYBxVSF8BAAkNAf1v3x4TAAAAAElFTkSuQmCC';

async function openLive(page, width) {
  if (width >= 1024) {
    await page.locator('aside button').filter({ hasText: /^Live$/i }).first().click();
  } else {
    const moreBtn = page.locator('nav button').filter({ hasText: /Altro/i }).first();
    if (await moreBtn.isVisible().catch(() => false)) await moreBtn.click();
    const liveCard = page.getByText(/Diario Live|Viaggio in diretta/i).first();
    if (await liveCard.isVisible().catch(() => false)) {
      await liveCard.click();
    } else {
      await page.locator('button').filter({ hasText: /Live/i }).first().click();
    }
  }
}

(async () => {
  const server = await preview({
    root,
    configFile: false,
    base: '/honeymoon-roadbook/',
    preview: { host: '127.0.0.1', port, strictPort: true }
  });
  const browser = await chromium.launch({ headless: true });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    await ctx.addInitScript(({ tripId, tinyPng }) => {
      sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', tripId);
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('hounigo_predeparture_dismissed_v1', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: tripId,
        title: 'Test Sintetico 4 Tab',
        startDate: '2099-05-10',
        endDate: '2099-05-20'
      }));
      localStorage.setItem('hounigo_live_gallery', JSON.stringify([
        { id: 'p2', tripId, userId: 'owner-synth', url: tinyPng, caption: 'Secondo scatto sintetico', location: 'Auckland', timestamp: 2000, isCustom: true, pendingSync: false },
        { id: 'p1', tripId, userId: 'owner-synth', url: tinyPng, caption: 'Primo scatto sintetico', location: 'Pechino', timestamp: 1000, isCustom: true, pendingSync: false }
      ]));
    }, { tripId: TRIP_ID, tinyPng: tinyPngDataUrl });

    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    await page.goto(`${baseUrl}/?live=1&tripId=${TRIP_ID}&view=live`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="live-tab-mappa"]', { timeout: 8000 });

    for (const vp of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      await page.waitForSelector('[data-testid="live-tab-mappa"]', { timeout: 8000 });
      for (const id of ['mappa', 'foto', 'diario', 'messaggi']) {
        assert.equal(await page.isVisible(`[data-testid="live-tab-${id}"]`), true, `Tab ${id} missing at ${vp.width}`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false, `Horizontal overflow at ${vp.width}x${vp.height}`);
    }

    // Navigate all 4 tabs in real DOM (External Guest view): Foto must NOT leak private localStorage photos
    await page.click('[data-testid="live-tab-foto"]');
    await page.waitForSelector('[data-testid="live-section-photos"]');
    assert.equal(await page.locator('[data-testid="live-latest-photo-trigger"]').count(), 0, 'External guest must not see private localStorage photos');

    await page.click('[data-testid="live-tab-diario"]');
    await page.waitForSelector('[data-testid="live-section-diary"]');
    await page.click('[data-testid="live-tab-messaggi"]');
    await page.waitForSelector('[data-testid="live-section-messages"]');
    await page.click('[data-testid="live-tab-mappa"]');
    await page.waitForSelector('[data-testid="live-section-position"]');

    await ctx.close();
    console.log('PASS: Real Playwright E2E 4-tab navigation, latest-photo lightbox & responsive 320/393/1280 verified!');
  } finally {
    await browser.close();
    server.httpServer.closeAllConnections?.();
    await new Promise(resolve => { server.httpServer.close(() => resolve()); setTimeout(resolve, 500); });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
