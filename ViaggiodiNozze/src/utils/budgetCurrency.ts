import {
  detectCurrencyFromValue,
  fetchEcbExchangeRate,
  getCachedEcbExchangeRate,
  normalizeFinancialFieldsToEur,
  roundEur,
  type ExchangeRateQuote,
} from '../services/currencyService';

export type BudgetCurrencyCollections = Record<'spese' | 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'shopping', any[]>;
const CACHE_TTL = 12 * 60 * 60 * 1000;
const originalFields = ['originalCurrency', 'originalCost', 'originalDepositPaid', 'originalDepositCurrency', 'originalRemaining'];
interface CachedQuote { quote: ExchangeRateQuote; cachedAt: number }

/** Budget-only derived values. Never saves a booking, changes originals, or enqueues Sync. */
export async function prepareBudgetCurrencySnapshot(
  collections: BudgetCurrencyCollections,
  options: { tripId: string; offline?: boolean; nowMs?: number; quoteResolver?: (currency: string) => Promise<ExchangeRateQuote | null> },
): Promise<BudgetCurrencyCollections> {
  const now = options.nowMs ?? Date.now();
  const offline = options.offline ?? (typeof navigator !== 'undefined' && navigator.onLine === false);
  // Persist rates only: no booking amounts, payment data or private financial fingerprints.
  const cacheKey = `hounigo_budget_ecb_quotes_v1_${encodeURIComponent(options.tripId)}`;
  const valid = (currency: string, q: ExchangeRateQuote | null | undefined) => {
    if (!q || q.currency !== currency || !Number.isFinite(q.rate) || q.rate <= 0 || typeof q.source !== 'string' || !q.source || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return null;
    const date = new Date(q.date + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === q.date && date.getTime() <= now ? q : null;
  };
  let stored: Record<string, CachedQuote> = {};
  try { stored = JSON.parse(localStorage.getItem(cacheKey) || '{}'); } catch { /* Memory-only when storage is unavailable. */ }
  const nextCache: Record<string, CachedQuote> = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [code, entry] of Object.entries(stored)) {
      const q = valid(code, entry?.quote);
      if (q && Number.isFinite(entry.cachedAt) && entry.cachedAt <= now) nextCache[code] = { quote: q, cachedAt: entry.cachedAt };
    }
  }
  const quotes = new Map<string, Promise<ExchangeRateQuote | null>>();
  const quote = (currency: string): Promise<ExchangeRateQuote | null> => {
    if (!quotes.has(currency)) quotes.set(currency, (async () => {
      const local = nextCache[currency];
      const cached = local?.quote;
      const expired = local && now - local.cachedAt >= CACHE_TTL;
      const asCached = (q: ExchangeRateQuote, stale: boolean) => ({ ...q, source: q.source + (q.source.includes('cache') ? '' : stale ? ' · cache non aggiornata' : ' · cache locale') });
      if (cached && !expired) return asCached(cached, false);
      const fresh = valid(currency, getCachedEcbExchangeRate(currency));
      if (fresh) { nextCache[currency] = { quote: fresh, cachedAt: now };return fresh; }
      const fallback = () => cached ? asCached(cached, true) : valid(currency, getCachedEcbExchangeRate(currency, true));
      if (offline) return fallback();
      let live: ExchangeRateQuote | null = null;
      try { live = valid(currency, await (options.quoteResolver || fetchEcbExchangeRate)(currency)); } catch { /* Try a verified offline quote. */ }
      if (live) { nextCache[currency] = { quote: live, cachedAt: now };return live; }
      return fallback();
    })());
    return quotes.get(currency)!;
  };
  const result = {} as BudgetCurrencyCollections;
  await Promise.all((Object.keys(collections) as Array<keyof BudgetCurrencyCollections>).map(async category => {
    result[category] = await Promise.all(collections[category].map(async item => {
      const costField = category === 'spese' ? 'amount' : category === 'ristoranti' || category === 'shopping' ? 'budget' : 'cost';
      const costRaw = item[costField] ?? item.cost;
      const depositRaw = item.depositPaid || item.acconto || item.amountPaid;
      const cost = detectCurrencyFromValue(costRaw);
      if (item.packageIncluded || /^incluso(?: nel pacchetto)?$/i.test(cost.rawText)) return item;
      if (!item.currencyUncertain && cost.hasValue && cost.amount === 0 && !cost.isAmbiguous && detectCurrencyFromValue(depositRaw).amount === 0) return item;
      const deposit = detectCurrencyFromValue(depositRaw);
      const uncertainNumericCost = item.currencyUncertain && cost.hasValue && !cost.isForeign && !cost.isExplicitEur;
      const uncertainNumericDeposit = item.currencyUncertain && deposit.amount > 0 && !deposit.isForeign && !deposit.isExplicitEur;
      if (cost.isAmbiguous || uncertainNumericCost || uncertainNumericDeposit) {
        return { ...item, __budgetCurrencyIssue: item.originalCurrency && item.originalCurrency !== 'EUR'
          ? `Valuta ${item.originalCurrency} documentata; confermare se importi e acconti sono originali o già in EUR.`
          : 'Confermare valuta e importo: posizione del viaggio e simboli non qualificati non determinano la valuta.' };
      }
      if (!cost.isForeign && !deposit.isForeign) {
        // Already EUR, including historical conversions: never apply another exchange rate.
        if (item.currencyUncertain && cost.isExplicitEur) return { ...item, currencyUncertain: false, __budgetOriginalItem: item };
        return item;
      }
      const fullyPaid = item.paymentStatus === 'saldato' || item.status === 'saldato';
      const depositIsKnownEur = deposit.isExplicitEur || (!item.currencyUncertain && !deposit.isForeign && !deposit.isAmbiguous && item.depositConversionType === 'definitiva');
      let patch: Record<string, any>;
      const actualPaid = fullyPaid && cost.isForeign && deposit.amount > 0 && depositIsKnownEur;
      if (actualPaid) {
        // The recorded EUR debit takes precedence over a market estimate; no invented payment date.
        patch = { cost: roundEur(deposit.amount).toFixed(2), depositPaid: roundEur(deposit.amount).toFixed(2), acconto: roundEur(deposit.amount).toFixed(2), currencyUncertain: false, originalCurrency: cost.currency, originalCost: cost.amount, originalDepositCurrency: 'EUR', originalDepositPaid: deposit.amount, conversionType: 'definitiva', depositConversionType: 'definitiva', exchangeRateSource: 'Addebito EUR registrato' };
      } else {
        patch = await normalizeFinancialFieldsToEur({ costRaw, depositRaw, exchangeRateResolver: quote });
        if (patch.currencyUncertain) return { ...item, currencyUncertain: true, __budgetCurrencyIssue: 'Cambio verificabile non disponibile. Importo escluso; riprovare online o con una cache valida.' };
        // A real EUR payment must never disappear because the market estimate is lower.
        if (!deposit.isForeign && deposit.amount > Number(patch.cost)) patch.cost = roundEur(deposit.amount).toFixed(2);
      }
      for (const field of originalFields) if (item[field] !== undefined) patch[field] = item[field];
      if (!cost.isForeign) {
        for (const field of ['exchangeRate', 'exchangeRateDate', 'exchangeRateSource', 'conversionType']) if (item[field] !== undefined) patch[field] = item[field];
      }
      const descriptions = [cost.isForeign ? `${cost.amount} ${cost.currency} ${actualPaid ? '=' : '≈'} ${patch.cost} EUR` : `${patch.cost} EUR`];
      if (actualPaid) descriptions.push('addebito EUR registrato');
      else {
        if (cost.isForeign) descriptions.push(`stima: 1 EUR = ${patch.exchangeRate} ${cost.currency} · ${patch.exchangeRateDate} · ${patch.exchangeRateSource}`);
        if (deposit.isForeign) descriptions.push(`acconto ${deposit.amount} ${deposit.currency} ≈ ${patch.depositPaid} EUR · 1 EUR = ${patch.depositExchangeRate} ${deposit.currency} · ${patch.depositExchangeRateDate} · ${patch.depositExchangeRateSource}`);
      }
      return { ...item, ...patch, [costField]: patch.cost, __budgetOriginalItem: item, __budgetConversionSummary: descriptions.join(' · ') };
    }));
  }));
  try { localStorage.setItem(cacheKey, JSON.stringify(nextCache)); } catch { /* No reliable persistence: remain usable in this session. */ }
  return result;
}
