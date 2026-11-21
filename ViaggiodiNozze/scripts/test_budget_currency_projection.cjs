const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} }; modules.set(file, mod);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(id => load(path.resolve(path.dirname(file), id + '.ts')), mod, mod.exports);
  return mod.exports;
}
const currency = load(path.join(root, 'src/services/currencyService.ts'));
const price = load(path.join(root, 'src/utils/priceHelper.ts'));
const { prepareBudgetCurrencySnapshot } = load(path.join(root, 'src/utils/budgetCurrency.ts'));
const store = new Map();
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
const empty = () => ({ spese: [], trasporti: [], alloggi: [], attivita: [], ristoranti: [], shopping: [] });
let calls = 0;
const quote = async code => { calls++; return { currency: code, rate: { NZD: 2, AUD: 1.5, USD: 1.25 }[code], date: '2026-11-20', source: 'BCE (Frankfurter)' }; };
const options = tripId => ({ tripId, offline: false, quoteResolver: quote });
let passed = 0;
async function test(name, fn) { store.clear(); calls = 0; await fn(); console.log('PASS ' + (++passed) + ': ' + name); }
(async () => {
  await test('EUR totals, originals, shared quotes and original display', async () => {
    const data = empty(); data.attivita = [{ id: 'a', cost: '100 NZD', depositPaid: '20 NZD' }, { id: 'b', cost: '40 NZD' }];
    const original = JSON.stringify(data);
    const result = await prepareBudgetCurrencySnapshot(data, options('eur-unit'));
    assert.equal(calls, 1);
    assert.equal(result.attivita[0].cost, '50.00');
    assert.equal(result.attivita[0].depositPaid, '10.00');
    assert.equal(result.attivita[0].originalCost, 100);
    assert.equal(result.attivita[0].exchangeRateDate, '2026-11-20');
    assert.ok(result.attivita[0].__budgetConversionSummary.includes('100 NZD ≈ 50.00 EUR'));
    const info = price.resolvePaymentInfo(result.attivita[0]);
    assert.equal(info.costNum, 50); assert.equal(info.paidNum, 10); assert.equal(info.remainingNum, 40); assert.equal(info.isEstimatedConversion, true);
    assert.equal(JSON.stringify(data), original);
  });
  await test('recorded paid EUR debit beats the market estimate without a quote', async () => {
    const data = empty(); data.trasporti = [{ id: 'paid', cost: '100 NZD', depositPaid: '47 EUR', paymentStatus: 'saldato' }];
    const item = (await prepareBudgetCurrencySnapshot(data, options('paid-unit'))).trasporti[0];
    assert.equal(item.cost, '47.00'); assert.equal(item.depositPaid, '47.00'); assert.equal(item.conversionType, 'definitiva'); assert.equal(item.originalCost, 100); assert.equal(calls, 0);
    const info = price.resolvePaymentInfo(item); assert.equal(info.costNum, 47); assert.equal(info.paidNum, 47); assert.equal(info.remainingNum, 0);
  });
  await test('partial EUR payments and mixed foreign deposits remain coherent', async () => {
    const data = empty(); data.alloggi = [{ id: 'mixed', cost: '100 NZD', depositPaid: '15 USD' }, { id: 'eur-paid', cost: '100 NZD', depositPaid: '60 EUR' }];
    const items = (await prepareBudgetCurrencySnapshot(data, options('mixed-unit'))).alloggi;
    assert.equal(items[0].cost, '50.00'); assert.equal(items[0].depositPaid, '12.00'); assert.equal(items[0].depositExchangeRate, 1.25);
    const info = price.resolvePaymentInfo(items[1]); assert.equal(info.paidNum, 60); assert.equal(info.costNum, 60); assert.equal(info.remainingNum, 0);
  });
  await test('existing EUR conversions and immutable provenance are not converted again', async () => {
    const data = empty(); const original = { id: 'converted', cost: '50.00', depositPaid: '10.00', originalCost: 100, originalCurrency: 'NZD', exchangeRate: 2, exchangeRateDate: '2026-11-20', conversionType: 'stimata', currencyUncertain: false };
    data.attivita = [original]; const result = await prepareBudgetCurrencySnapshot(data, options('existing-unit'));
    assert.deepEqual(result.attivita[0], original); assert.equal(calls, 0);
    const projected = (await prepareBudgetCurrencySnapshot({ ...empty(), attivita: [{ id: 'new', cost: '100 NZD' }] }, options('save-unit'))).attivita[0];
    const saved = await currency.buildEurSavePatch({ costRaw: projected.cost, depositRaw: '0', existingItem: projected });
    assert.equal(saved.originalCost, 100); assert.equal(saved.originalCurrency, 'NZD'); assert.equal(saved.conversionType, 'stimata'); assert.equal(saved.cost, '50.00');
  });
  await test('ambiguous legacy numbers, price tiers and conflicting deposits stay excluded', async () => {
    const data = empty(); data.alloggi = [{ id: 'aud-known', cost: '99.00', originalCurrency: 'AUD', originalCost: 160, currencyUncertain: true }, { id: 'ambiguous-deposit', cost: '100 NZD', depositPaid: '30', currencyUncertain: true }]; data.ristoranti = [{ id: 'tier', budget: '$$', currencyUncertain: true }];
    const result = await prepareBudgetCurrencySnapshot(data, options('uncertain-unit'));
    for (const item of [...result.alloggi, ...result.ristoranti]) { assert.equal(item.currencyUncertain, true); assert.ok(item.__budgetCurrencyIssue); }
    assert.equal(calls, 0);
  });
  await test('applied per-item rates survive reopening offline; changed amounts do not reuse old results', async () => {
    const data = { ...empty(), attivita: [{ id: 'offline', cost: '100 NZD' }] };
    const online = await prepareBudgetCurrencySnapshot(data, options('offline-unit'));
    const offline = await prepareBudgetCurrencySnapshot(data, { ...options('offline-unit'), offline: true });
    assert.equal(offline.attivita[0].cost, online.attivita[0].cost); assert.equal(calls, 1);
    data.attivita[0].cost = '200 NZD';
    const changed = await prepareBudgetCurrencySnapshot(data, { ...options('offline-unit'), offline: true });
    assert.equal(changed.attivita[0].cost, '100.00'); assert.equal(changed.attivita[0].currencyUncertain, false);assert.equal(calls, 1);
  });
  await test('expired verified Frankfurter cache is an explicit offline fallback', async () => {
    store.set('hounigo_ecb_rates_v1', JSON.stringify({ date: '2026-11-20', fetchedAt: Date.now() - 2 * 86400000, rates: { NZD: 2 } }));
    const result = await prepareBudgetCurrencySnapshot({ ...empty(), attivita: [{ id: 'stale', cost: '100 NZD' }] }, { ...options('stale-unit'), offline: true });
    assert.equal(result.attivita[0].cost, '50.00'); assert.ok(result.attivita[0].__budgetConversionSummary.includes('cache non aggiornata')); assert.equal(calls, 0);
  });
  await test('missing or invalid rates never silently turn foreign amounts into EUR', async () => {
    for (const q of [null, { currency: 'NZD', rate: 0, date: '2026-11-20' }, { currency: 'NZD', rate: 2, date: '2099-01-01' }, { currency: 'NZD', rate: 2, date: '2026-02-30' }]) {
      const item = (await prepareBudgetCurrencySnapshot({ ...empty(), attivita: [{ id: 'bad', cost: '100 NZD' }] }, { tripId: 'bad-unit', offline: false, quoteResolver: async () => q })).attivita[0];
      assert.equal(item.cost, '100 NZD'); assert.equal(item.currencyUncertain, true);
    }
  });
  await test('corrupt cached rate is discarded without persisting financial amounts', async () => {
    const data = { ...empty(), attivita: [{ id: 'bad-cache', cost: '100 NZD' }] };
    await prepareBudgetCurrencySnapshot(data, options('cache-unit'));
    const key = 'hounigo_budget_ecb_quotes_v1_cache-unit'; const cached = JSON.parse(store.get(key));assert.ok(!store.get(key).includes('originalCost'));assert.ok(!store.get(key).includes('depositPaid'));cached.NZD.quote.rate = 0;store.set(key, JSON.stringify(cached));
    const item = (await prepareBudgetCurrencySnapshot(data, { ...options('cache-unit'), offline: true })).attivita[0];
    assert.equal(item.currencyUncertain, true); assert.equal(item.cost, '100 NZD');
  });
  await test('deposits and package-included bookings remain separate', async () => {
    const data = { ...empty(), alloggi: [{ id: 'deposit', cost: '100 NZD', cauzione: '500 NZD rimborsabili' }, { id: 'package', cost: '100 NZD', packageIncluded: true }] };
    const items = (await prepareBudgetCurrencySnapshot(data, options('deposit-unit'))).alloggi;
    assert.equal(items[0].cost, '50.00'); assert.equal(items[0].cauzione, '500 NZD rimborsabili'); assert.equal(price.resolvePaymentInfo(items[1]).costNum, 0);
  });
  await test('foreign-denominated zero amounts remain free without rates', async () => {
    const data = { ...empty(), trasporti: [{ id: 'free', cost: '0 AUD' }] };
    const item = (await prepareBudgetCurrencySnapshot(data, { ...options('zero-unit'), offline: true })).trasporti[0];
    assert.equal(item.cost, '0 AUD'); assert.notEqual(item.currencyUncertain, true); assert.equal(price.resolvePaymentInfo(item).isFree, true); assert.equal(calls, 0);
  });
  await test('existing Frankfurter endpoint fallback and cached applied rate/date', async () => {
    const previousFetch = globalThis.fetch; const requests = [];
    globalThis.fetch = async url => { requests.push(url);return requests.length === 1 ? { ok: false } : { ok: true, json: async () => ({ date: '2026-11-20', rates: { NZD: 2 } }) }; };
    try { const result = await prepareBudgetCurrencySnapshot({ ...empty(), attivita: [{ id: 'network', cost: '100 NZD' }] }, { tripId: 'frankfurter-unit', offline: false }); assert.equal(result.attivita[0].cost, '50.00'); assert.ok(requests[0].startsWith('https://api.frankfurter.dev/')); assert.ok(requests[1].startsWith('https://api.frankfurter.app/')); assert.equal(currency.getCachedEcbExchangeRate('NZD').rate, 2); }
    finally { globalThis.fetch = previousFetch; }
  });
  console.log(`Budget EUR: ${passed} targeted tests passed, no production access.`);
})().catch(e => { console.error(e);process.exitCode = 1; }).finally(() => { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
