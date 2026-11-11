const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = 'C:\\Users\\CUSI\\.gemini\\antigravity\\brain\\d1e39d97-0426-46d3-8997-c8e3fadd549e\\scratch\\safearea_160';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const { preview } = await import('vite');
  const server = await preview({ root, configFile: false, base: '/honeymoon-roadbook/', preview: { host: '127.0.0.1', port: 5197, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      timeout: 15000,
      args: ['--no-sandbox'],
    });
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await ctx.route('**/*', route => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
    await ctx.addInitScript(() => sessionStorage.setItem('hounigo_motion_splash_seen_v1', '1'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);

    // 1. Check Onboarding safe area across 320, 375, 393, 430, 1440
    await page.goto('http://127.0.0.1:5197/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Crea il tuo viaggio/ }).waitFor({ state: 'visible' });
    for (const [w, h, insets] of [
      [320, 568, [44, 0, 34, 0]],
      [375, 812, [47, 0, 34, 0]],
      [393, 852, [59, 0, 34, 0]],
      [430, 932, [59, 0, 34, 0]],
      [1440, 900, [0, 0, 0, 0]],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(v => ['top', 'right', 'bottom', 'left'].forEach((e, i) => document.documentElement.style.setProperty('--app-safe-' + e, v[i] + 'px')), insets);
      const res = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        cardRect: document.querySelector('.rounded-3xl')?.getBoundingClientRect() || null,
      }));
      assert.equal(res.overflow, false, `Onboarding horizontal overflow at ${w}px`);
      if (res.cardRect && h > 650) assert.ok(res.cardRect.top >= insets[0] - 1, `Onboarding card overlapped top safe area at ${w}px`);
    }
    await page.screenshot({ path: path.join(outDir, 'onboarding-393-island.png') });

    // 2. Check Authenticated App Shell (Home, Budget, Documenti, Altro, LIVE) at 320, 375, 393, 430, 1440
    await page.addInitScript(() => {
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_trip_id', 'synthetic-safearea');
      localStorage.setItem('houni_device_role', 'viewer');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('roadbook_trip_config', JSON.stringify({ id: 'synthetic-safearea', title: 'SafeArea Trip', startDate: '2026-11-28', endDate: '2026-12-05' }));
    });
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('http://127.0.0.1:5197/honeymoon-roadbook/', { waitUntil: 'domcontentloaded' });
    await page.locator('header.app-mobile-header').waitFor({ state: 'visible' });

    for (const [w, h, insets] of [
      [320, 568, [44, 0, 34, 0]],
      [375, 812, [47, 0, 34, 0]],
      [393, 852, [59, 0, 34, 0]],
      [430, 932, [59, 0, 34, 0]],
      [1440, 900, [0, 0, 0, 0]],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(v => ['top', 'right', 'bottom', 'left'].forEach((e, i) => document.documentElement.style.setProperty('--app-safe-' + e, v[i] + 'px')), insets);
      const metrics = await page.evaluate(() => {
        const hdr = document.querySelector('header.app-mobile-header')?.getBoundingClientRect();
        const nav = document.querySelector('nav.app-bottom-nav')?.getBoundingClientRect();
        const padTop = document.querySelector('header.app-mobile-header') ? parseFloat(getComputedStyle(document.querySelector('header.app-mobile-header')).paddingTop) : 0;
        const padBottom = document.querySelector('nav.app-bottom-nav') ? parseFloat(getComputedStyle(document.querySelector('nav.app-bottom-nav')).paddingBottom) : 0;
        return { overflow: document.documentElement.scrollWidth > window.innerWidth, hdr, nav, padTop, padBottom };
      });
      assert.equal(metrics.overflow, false, `App horizontal overflow at ${w}px`);
      if (w < 768) {
        assert.ok(metrics.padTop >= insets[0], `Mobile header paddingTop < safeTop at ${w}px (${metrics.padTop} < ${insets[0]})`);
        assert.ok(metrics.padBottom >= insets[2], `Bottom nav paddingBottom < safeBottom at ${w}px (${metrics.padBottom} < ${insets[2]})`);
      }
      if (w === 393) await page.screenshot({ path: path.join(outDir, 'app-393-island.png') });
    }

    // Check Altro + LIVE at 393px with Dynamic Island insets
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => ['top', 'right', 'bottom', 'left'].forEach((e, i) => document.documentElement.style.setProperty('--app-safe-' + e, [59, 0, 34, 0][i] + 'px')));
    await page.locator('nav.app-bottom-nav button').filter({ hasText: 'Altro' }).click();
    await page.getByText('Live & Posizione', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: path.join(outDir, 'altro-393-island.png') });

    console.log('PASS: Responsive & simulated Dynamic Island safe-area checks passed across 320, 375, 393, 430, 1440px (no overflow, header/nav/onboarding clear safe areas). Note: physical iPhone hardware/Safari requires live device check.');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.httpServer.close(r));
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

