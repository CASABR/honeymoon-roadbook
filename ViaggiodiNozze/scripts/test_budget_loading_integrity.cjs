const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..');

const fixture = {
  spese: [{ id: 'extra', title: 'Extra test', amount: '20 EUR', status: 'saldato' }],
  trasporti: [
    { id: 'flight-a', carrier: 'Volo test', type: 'volo', cost: '100 EUR', paymentStatus: 'saldato', bookingCode: 'SYNTHETIC-TICKET' },
    { id: 'flight-b', carrier: 'Coincidenza test', type: 'volo', cost: '100 EUR', paymentStatus: 'saldato', bookingCode: 'SYNTHETIC-TICKET' },
  ],
  alloggi: [{ id: 'hotel', name: 'Hotel test', cost: '200 EUR', depositPaid: '50 EUR', cauzione: '50 EUR rimborsabili' }],
  attivita: [
    { id: 'activity', title: 'Attivita test', cost: '20 EUR', paymentStatus: 'saldato' },
    { id: 'activity', title: 'Attivita test', cost: '20 EUR', paymentStatus: 'saldato' },
    { id: 'uncertain', title: 'Valuta test', cost: '10 AUD', currencyUncertain: true },
  ],
  ristoranti: [{ id: 'restaurant', nome: 'Ristorante test', budget: '40 EUR' }],
  shopping: [{ id: 'shopping', nome: 'Shopping test', budget: '30 EUR' }],
  budget: { amount: 13000, updatedAt: 1 },
};

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hounigo-budget-integrity-'));
  let server;
  let browser;
  try {
    const { createServer } = await import(pathToFileURL(path.join(project, 'node_modules/vite/dist/node/index.js')).href);
    const react = (await import(pathToFileURL(path.join(project, 'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
    const entry = path.join(temp, 'entry.tsx').replaceAll('\\', '/');
    const component = path.join(project, 'src/views/altro/SpeseBudgetView.tsx').replaceAll('\\', '/');
    const moneyComponent = path.join(project, 'src/components/common/CurrencyAmountInput.tsx').replaceAll('\\', '/');
    const lightboxComponent = path.join(project, 'src/components/common/LightboxCarousel.tsx').replaceAll('\\', '/');
    const currencyModule = path.join(project, 'src/services/currencyService.ts').replaceAll('\\', '/');
    const pdfObjects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length 41 >>\nstream\nBT /F1 12 Tf 30 250 Td (TEST PDF) Tj ET\nendstream'];
    let pdf = '%PDF-1.4\n'; const offsets = [0];pdfObjects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf));pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n'; });const xref = Buffer.byteLength(pdf);pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const pdfDataUrl = 'data:application/pdf;base64,' + Buffer.from(pdf).toString('base64');
    fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import Budget from '/@fs/${component}';import Money from '/@fs/${moneyComponent}';import Lightbox from '/@fs/${lightboxComponent}';import {buildEurSavePatch} from '/@fs/${currencyModule}';window.budgetMock={data:${JSON.stringify(fixture)},delays:{budget:900},fail:null,calls:[]};const root=createRoot(document.getElementById('root'));let n=0;window.remountBudget=()=>root.render(<Budget key={++n}/>);window.fixturePdfData=${JSON.stringify(pdfDataUrl)};window.remountBudget();﻿function MoneyTest({uncertain=false}){const [value,setValue]=React.useState(uncertain?'50':'');return <><Money value={value} onValueChange={setValue} uncertain={uncertain} aria-label="Importo originale di prova" currencyLabel="Valuta di prova"/><output data-testid="money-raw">{value}</output><button onClick={async()=>{window.moneySaved=await buildEurSavePatch({costRaw:value,existingItem:uncertain?{cost:'50',currencyUncertain:true}:undefined})}}>Normalizza prova</button></>}
window.showMoney=uncertain=>{window.moneySaved=null;root.render(<MoneyTest key={'money'+(++n)} uncertain={uncertain}/>)};
window.showLightbox=kind=>root.render(<Lightbox isOpen={true} onClose={()=>{}} items={[{id:'synthetic-ticket',name:kind==='image'?'test.png':'test.pdf',type:kind==='image'?'image':'pdf',size:100,createdAt:'2026-11-20',dataUrl:kind==='missing'?undefined:kind==='image'?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/a1ioAAAAASUVORK5CYII=':window.fixturePdfData}]} />);
`);
    const virtual = '\0budget-test-storage';
    server = await createServer({
      root: project,
      configFile: false,
      optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react'] },
      cacheDir: path.join(temp, '.vite'),
      resolve: { alias: { react: path.join(project, 'node_modules/react'), 'react-dom': path.join(project, 'node_modules/react-dom') } },
      server: { host: '127.0.0.1', port: 0, fs: { allow: [project, temp] } },
      plugins: [
        { name: 'budget-read-only-fixture', enforce: 'pre',
          resolveId(id) { if (id.endsWith('/storageService') || id.endsWith('/storageService.ts')) return virtual; },
          load(id) {
            if (id !== virtual) return;
            return `function read(field){const c=window.budgetMock;const value=structuredClone(c.data[field]);const fail=c.fail===field;const delay=c.delays[field]||0;c.calls.push(field);return new Promise((resolve,reject)=>setTimeout(()=>fail?reject(new Error('Synthetic read failure')):resolve(value),delay));}export const storageService={getDeviceRole:()=> 'viewer',getSpese:()=>read('spese'),getTransports:()=>read('trasporti'),getAccommodations:()=>read('alloggi'),getActivities:()=>read('attivita'),getRistoranti:()=>read('ristoranti'),getShoppingItems:()=>read('shopping'),getTripBudget:()=>read('budget')};export function notifyDataChanged(){throw new Error('Unexpected write in read-only budget test');}`;
          },
          configureServer(vite) { vite.middlewares.use('/__budget-test', (_req, res) => { res.setHeader('Content-Type', 'text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/@fs/${entry}"></script></body></html>`); }); },
        }, react(),
      ],
    });
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/__budget-test`);
    const summary = page.getByTestId('budget-summary');
    await summary.waitFor();
    assert.equal(await summary.getAttribute('aria-busy'), 'true');
    assert.ok(!(await summary.innerText()).includes('410,00'), 'No partial initial sum');
    assert.equal(await page.getByTestId('budget-exclusions').count(), 0, 'No premature exclusion count');
    await page.waitForFunction(() => document.querySelector('[data-testid="budget-summary"]')?.getAttribute('aria-busy') === 'false');
    assert.ok((await summary.innerText()).includes('410,00'), 'Deduplicated complete total');
    assert.ok((await summary.innerText()).includes('190,00'), 'Paid total preserved');
    assert.ok((await page.getByTestId('budget-local-persistence').innerText()).includes('Non è ancora condiviso'));
    assert.ok((await summary.innerText()).includes('220,00'), 'Remaining total preserved');
    const exclusions = await page.getByTestId('budget-exclusions').innerText();
    assert.ok(exclusions.includes('Valuta incerta: 1 voce'));
    assert.ok(exclusions.includes('Cauzioni/preautorizzazioni: 1 voce'));
    assert.equal(await page.getByText('Attivita test', { exact: false }).count(), 1, 'Duplicate IDs counted once');
    assert.equal(await page.getByText('Coincidenza test', { exact: false }).count(), 0, 'Duplicate flight ticket counted once');
    console.log('PASS initial loading, complete totals, currency/deposit counts and deduplication');

    async function settleAfter(action) {
      const reads = await page.evaluate(() => window.budgetMock.calls.length);
      await action();
      await page.waitForFunction(n => window.budgetMock.calls.length >= n + 7, reads);
      await page.waitForFunction(() => document.querySelector('[data-testid="budget-summary"]')?.getAttribute('aria-busy') === 'false');
    }
    await settleAfter(() => page.evaluate(() => { window.budgetMock.delays = {};window.budgetMock.data.attivita.push({ id: 'late-activity', title: 'Attivita tardiva', cost: '25 EUR' });window.dispatchEvent(new Event('roadbook_cloud_synced')); }));
    assert.ok((await summary.innerText()).includes('435,00'));
    for (let i = 0; i < 2; i++) await settleAfter(() => page.evaluate(() => window.dispatchEvent(new Event('roadbook_data_mutated'))));
    assert.ok((await summary.innerText()).includes('435,00'));
    assert.equal(await page.getByText('Attivita tardiva', { exact: false }).count(), 1);
    console.log('PASS sync refresh and repeated events without duplicated entries');

    const reads = await page.evaluate(() => window.budgetMock.calls.length);
    await page.evaluate(() => { window.budgetMock.delays = { budget: 300 };window.budgetMock.data.spese[0].amount = '120 EUR';window.dispatchEvent(new Event('roadbook_data_mutated')); });
    await page.waitForFunction(n => window.budgetMock.calls.length >= n + 7, reads);
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.budgetMock.delays = {};window.budgetMock.data.spese[0].amount = '220 EUR';window.dispatchEvent(new Event('roadbook_data_mutated')); });
    await page.waitForTimeout(210);
    assert.equal(await summary.getAttribute('aria-busy'), 'true', 'Invalidated old read cannot clear pending state during debounce');
    assert.ok(!(await summary.innerText()).includes('535,00'), 'Stale total never published');
    await page.waitForFunction(n => window.budgetMock.calls.length >= n + 14, reads);
    await page.waitForFunction(() => document.querySelector('[data-testid="budget-summary"]')?.getAttribute('aria-busy') === 'false');
    assert.ok((await summary.innerText()).includes('635,00'));
    console.log('PASS late stale response during debounce does not overwrite latest snapshot');

    await settleAfter(() => page.evaluate(() => { window.budgetMock.fail = 'alloggi';window.dispatchEvent(new Event('roadbook_cloud_synced')); }));
    assert.ok((await page.getByRole('status').innerText()).includes('Caricamento non completato'));
    assert.ok(!(await summary.innerText()).includes('635,00'), 'Failure cannot label a total complete');
    assert.equal(await page.getByText('Nessuna spesa registrata', { exact: true }).count(), 0);
    await settleAfter(() => page.evaluate(() => { window.budgetMock.fail = null;window.dispatchEvent(new Event('roadbook_cloud_sync_idle')); }));
    assert.ok((await summary.innerText()).includes('635,00'));
    await page.evaluate(() => window.dispatchEvent(new Event('roadbook_cloud_sync_error')));
    assert.ok((await page.getByRole('status').innerText()).includes('Sincronizzazione non completata'));
    console.log('PASS read failure preserves entries, masks incomplete summary and supports recovery');

    await context.setOffline(true);
    await settleAfter(() => page.evaluate(() => window.remountBudget()));
    assert.ok((await page.getByRole('status').innerText()).includes('Offline:'));
    assert.ok((await summary.innerText()).includes('635,00'));
    assert.equal(await page.getByText('Attivita tardiva', { exact: false }).count(), 1);
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Totali dei dati locali disponibili'));
    await settleAfter(() => page.evaluate(() => { window.budgetMock.fail = 'spese';window.remountBudget(); }));
    assert.ok((await page.getByRole('status').innerText()).includes('Caricamento non completato'));
    assert.equal(await page.getByText('Nessuna spesa registrata', { exact: true }).count(), 0);
    assert.ok(!(await summary.innerText()).includes('0,00'), 'Initial failure cannot masquerade as an empty zero budget');
    await settleAfter(() => page.evaluate(() => { window.budgetMock.fail = null;window.dispatchEvent(new Event('roadbook_cloud_sync_idle')); }));
    assert.ok((await summary.innerText()).includes('635,00'));
    console.log('PASS initial failure avoids false zero/empty state and retries safely');
    let quoteRequests = 0;
    await context.route('https://api.frankfurter.*/**', route => { if (new URL(route.request().url()).searchParams.get('to') !== 'NZD') return route.abort();quoteRequests++;return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ date: '2026-11-20', rates: { NZD: 2 } }) }); });
    await settleAfter(() => page.evaluate(() => { window.budgetMock.data.shopping.push({ id: 'nzd-shopping', nome: 'Acquisto NZD test', budget: '100 NZD' });window.budgetMock.data.attivita.push({ id: 'paid-nzd', title: 'Addebito EUR test', cost: '100 NZD', depositPaid: '47 EUR', paymentStatus: 'saldato' });window.dispatchEvent(new Event('roadbook_cloud_synced')); }));
    assert.ok((await summary.innerText()).includes('732,00'));
    assert.ok((await summary.innerText()).includes('437,00'));
    assert.ok((await summary.innerText()).includes('295,00'));
    assert.ok(await page.getByText(/100 NZD ≈ 50.00 EUR/).isVisible());
    assert.ok(await page.getByText(/100 NZD = 47.00 EUR/).isVisible());
    assert.equal(quoteRequests, 1, 'One Frankfurter lookup shared by a currency');
    await context.setOffline(true);
    await settleAfter(() => page.evaluate(() => window.remountBudget()));
    assert.ok((await summary.innerText()).includes('732,00'));
    assert.equal(quoteRequests, 1, 'Opening offline uses saved applied rates');
    assert.equal(await page.getByText('Acquisto NZD test', { exact: false }).count(), 1);
    console.log('PASS EUR projection in rendered totals, actual EUR debit, original currency labels and offline reopening without double conversion');
    const originalData = await page.evaluate(() => JSON.stringify(window.budgetMock.data));
    const readsBeforeDisplay = await page.evaluate(() => window.budgetMock.calls.length);
    await page.getByLabel('Mostra riepilogo in').selectOption('NZD');
    await page.waitForFunction(() => document.querySelector('[data-testid="budget-display-rate-status"]')?.textContent.includes('1 EUR = 2 NZD'));
    assert.ok((await summary.innerText()).includes('1464,00'));
    assert.ok((await summary.innerText()).includes('874,00'));
    assert.ok((await summary.innerText()).includes('590,00'));
    assert.ok(await page.getByText(/26.000,00/).isVisible());
    assert.equal(await page.evaluate(() => JSON.stringify(window.budgetMock.data)), originalData);
    assert.equal(await page.evaluate(() => window.budgetMock.calls.length), readsBeforeDisplay, 'Display selection does not reload or write booking data');
    await page.getByLabel('Mostra riepilogo in').selectOption('TWD');
    await page.waitForFunction(() => document.querySelector('[data-testid="budget-display-rate-status"]')?.textContent.includes('non disponibile'));
    assert.ok(!(await summary.innerText()).includes('1464,00'));
    await page.getByLabel('Mostra riepilogo in').selectOption('EUR');
    assert.ok((await summary.innerText()).includes('732,00'));
    console.log('PASS EUR/alternative display, budget/paid/residual conversion, offline missing rate and zero mutations');

    await page.evaluate(() => window.showMoney(false));
    const input = page.getByRole('textbox', { name: 'Importo originale di prova' });
    const iso = page.getByLabel('Valuta di prova');
    assert.equal(await iso.inputValue(), 'EUR');
    for (const code of ['EUR', 'NZD', 'AUD', 'PHP', 'CNY', 'TWD', 'USD']) assert.equal(await iso.locator('option[value="' + code + '"]').count(), 1);
    await iso.selectOption('NZD');await input.fill('100');
    assert.equal(await page.getByTestId('money-raw').innerText(), '100 NZD');
    await page.getByRole('button', { name: 'Normalizza prova' }).click();
    await page.waitForFunction(() => window.moneySaved?.cost === '50.00');
    assert.equal(await page.evaluate(() => window.moneySaved.originalCurrency), 'NZD');
    assert.equal(await page.evaluate(() => window.moneySaved.originalCost), 100);
    await page.evaluate(() => window.showMoney(true));
    await page.waitForFunction(() => document.querySelector('select[aria-label="Valuta di prova"]')?.value === '');
    assert.equal(await iso.inputValue(), '');
    await input.fill('60');await page.getByRole('button', { name: 'Normalizza prova' }).click();
    await page.waitForFunction(() => window.moneySaved?.currencyUncertain === true);
    await iso.selectOption('EUR');await page.getByRole('button', { name: 'Normalizza prova' }).click();
    await page.waitForFunction(() => window.moneySaved?.currencyUncertain === false);
    assert.equal(await page.evaluate(() => window.moneySaved.originalCurrency), 'EUR');
    console.log('PASS shared ISO input, original currency persistence and no automatic currency on uncertain entries');

    await page.evaluate(() => window.showLightbox('missing'));
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('iframe').count(), 0, 'Missing PDF must not reload the HOUNIGO HTML in an iframe');
    assert.ok(await page.getByRole('alert').isVisible());
    assert.ok(await page.getByRole('button', { name: 'Apri a schermo intero', exact: true }).isDisabled());
    await page.evaluate(() => window.showLightbox('pdf'));
    const pdfFrame = page.locator('iframe');await pdfFrame.waitFor();
    assert.ok((await pdfFrame.getAttribute('src')).startsWith('blob:'));
    const signature = await page.evaluate(async () => { const url = document.querySelector('iframe').src.split('#')[0];const r = await fetch(url);return { type: r.headers.get('content-type'), prefix: (await r.text()).slice(0, 5) }; });
    assert.equal(signature.type, 'application/pdf');assert.equal(signature.prefix, '%PDF-');
    await page.evaluate(() => window.showLightbox('image'));
    await page.locator('img').waitFor();assert.equal(await page.locator('iframe').count(), 0);assert.equal(await page.locator('img').count(), 1);
    console.log('PASS missing-PDF recursion guard, valid PDF bytes/MIME and image attachment regression');
    assert.deepEqual(errors, []);
    console.log('PASS offline opening from cached fixture and online recovery; no external requests or production writes');
  } finally {
    if (browser) await browser.close();
    if (server) { server.httpServer?.closeAllConnections?.();await server.close(); }
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error);process.exit(1); });
