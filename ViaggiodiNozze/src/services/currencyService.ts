export interface ExchangeRateQuote {
  currency: string;
  rate: number; // Unità di valuta estera per 1 EUR (es. 1.6236 AUD per 1 EUR)
  date: string; // YYYY-MM-DD
  source: string;
}

export interface DetectedCurrencyValue {
  hasValue: boolean;
  amount: number;
  currency: string | null; // 'EUR', 'AUD', 'NZD', ecc. | null se assente o ambiguo
  isExplicitEur: boolean;
  isForeign: boolean;
  isAmbiguous: boolean;
  rawText: string;
}

const RATES_CACHE_KEY = 'hounigo_ecb_rates_v1';
const RATES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const KNOWN_CURRENCIES = new Set([
  'EUR', 'AUD', 'NZD', 'PHP', 'USD', 'GBP', 'CHF', 'JPY',
  'CNY', 'RMB', 'TWD', 'CAD', 'SGD', 'THB', 'MYR', 'IDR', 'KRW', 'HKD'
]);

export function roundEur(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Estrae numero e valuta da una stringa/numero di costo senza scartare silenziosamente
 * i codici valuta esteri o i simboli ambigui (come "$" non qualificato).
 */
export function parseRawNumericAmount(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

  let str = String(val).trim();
  // Estrae la prima espressione numerica valida per evitare concatenazioni spurie
  const numMatch = str.match(/-?\d[\d.,\s]*/);
  if (!numMatch) return 0;
  str = numMatch[0].replace(/\s+/g, '');

  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Formato europeo 1.234,56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US 1,234.56
      str = str.replace(/,/g, '');
    }
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  } else if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts[1] && parts[1].length === 3 && Number(parts[0]) !== 0) {
      str = str.replace(/\./g, '');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts[1] && parts[1].length === 3 && parts.length === 2 && Number(parts[0]) > 0) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }

  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function detectCurrencyFromValue(raw: unknown): DetectedCurrencyValue {
  if (raw === undefined || raw === null) {
    return { hasValue: false, amount: 0, currency: null, isExplicitEur: false, isForeign: false, isAmbiguous: false, rawText: '' };
  }
  const rawText = String(raw).trim();
  if (!rawText) {
    return { hasValue: false, amount: 0, currency: null, isExplicitEur: false, isForeign: false, isAmbiguous: false, rawText: '' };
  }

  const upper = rawText.toUpperCase();
  const amount = Math.max(0, parseRawNumericAmount(rawText));
  if (!/\d/.test(rawText) && !/^(gratuito|gratis|free|incluso(?: nel pacchetto)?)$/i.test(rawText)) {
    return { hasValue: true, amount: 0, currency: null, isExplicitEur: false, isForeign: false, isAmbiguous: true, rawText };
  }

  // Rileva simboli/codici espliciti di valute estere
  if (/\bA\s*\$|AU\$|\bAUD\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'AUD', isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }
  if (/\bNZ\s*\$|\bNZD\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'NZD', isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }
  if (/\bUS\s*\$|\bUSD\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'USD', isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }
  if (/₱|\bPHP\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'PHP', isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }
  if (/\b(RMB|CNY)\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'CNY', isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }

  const isoMatch = upper.match(/(?:^|[^A-Z])(EUR|AUD|NZD|PHP|USD|GBP|CHF|JPY|CNY|TWD|CAD|SGD|THB|MYR|IDR|KRW|HKD)(?=$|[^A-Z])/);
  if (isoMatch && KNOWN_CURRENCIES.has(isoMatch[1])) {
    const code = isoMatch[1];
    if (code === 'EUR') {
      return { hasValue: true, amount, currency: 'EUR', isExplicitEur: true, isForeign: false, isAmbiguous: false, rawText };
    }
    return { hasValue: true, amount, currency: code, isExplicitEur: false, isForeign: true, isAmbiguous: false, rawText };
  }

  if (rawText.includes('€') || /\bEURO\b/.test(upper)) {
    return { hasValue: true, amount, currency: 'EUR', isExplicitEur: true, isForeign: false, isAmbiguous: false, rawText };
  }

  // Simbolo "$" non qualificato o fascia "$$"
  if (rawText.includes('$') || rawText.includes('£') || rawText.includes('¥')
      || /(?:^|[^A-Z])[A-Z]{3}(?=$|[^A-Z])/.test(upper)) {
    return { hasValue: true, amount, currency: null, isExplicitEur: false, isForeign: true, isAmbiguous: true, rawText };
  }

  // Numero puro senza codice valuta (retrocompatibile EUR salvo flag currencyUncertain)
  return { hasValue: true, amount, currency: 'EUR', isExplicitEur: false, isForeign: false, isAmbiguous: false, rawText };
}

interface CachedRatesPayload {
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

function readCachedEcbRates(allowExpired = false): CachedRatesPayload | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRatesPayload;
    if (!parsed || !parsed.rates || typeof parsed.rates !== 'object' || !parsed.date || !Number.isFinite(parsed.fetchedAt) || parsed.fetchedAt > Date.now()) return null;
    if (!allowExpired && Date.now() - (parsed.fetchedAt || 0) > RATES_CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchEcbExchangeRate(currency: string): Promise<ExchangeRateQuote | null> {
  const code = currency.trim().toUpperCase();
  if (!code || code === 'EUR') {
    return { currency: 'EUR', rate: 1, date: new Date().toISOString().slice(0, 10), source: 'EUR' };
  }

  const freshCache = readCachedEcbRates(false);
  if (freshCache && Number.isFinite(freshCache.rates[code]) && freshCache.rates[code] > 0) {
    return {
      currency: code,
      rate: freshCache.rates[code],
      date: freshCache.date,
      source: 'BCE (Frankfurter)'
    };
  }

  if (typeof fetch === 'function') {
    const endpoints = [
      `https://api.frankfurter.dev/v1/latest?from=EUR&to=${encodeURIComponent(code)}`,
      `https://api.frankfurter.app/latest?from=EUR&to=${encodeURIComponent(code)}`
    ];
    for (const url of endpoints) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
        const res = await fetch(url, { signal: controller?.signal });
        if (timer) clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        const rate = data?.rates?.[code];
        if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && typeof data?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
          const prev = readCachedEcbRates(true);
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(
                RATES_CACHE_KEY,
                JSON.stringify({
                  date: data.date,
                  rates: { ...(prev && prev.date === data.date ? prev.rates : {}), ...data.rates },
                  fetchedAt: Date.now()
                })
              );
            }
          } catch {
            // Ignora quota storage piena
          }
          return {
            currency: code,
            rate,
            date: data.date,
            source: 'BCE (Frankfurter)'
          };
        }
      } catch {
        // Ritenta endpoint secondario; in assenza di tasso valido resta null senza inventare tassi
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }

  return null;
}

/**
 * Converte automaticamente eventuali importi in valuta estera (es. "2468.13 AUD")
 * al salvataggio dai form HOUNIGO, preservando valuta e importo originali nei metadati privati.
 */
export async function normalizeFinancialFieldsToEur(params: {
  costRaw?: string | number | null;
  depositRaw?: string | number | null;
}): Promise<Record<string, any>> {
  const costInfo = detectCurrencyFromValue(params.costRaw);
  const depInfo = detectCurrencyFromValue(params.depositRaw);

  // Preserve semantic prices. A package inclusion is not a zero-price purchase.
  if (/^incluso(?: nel pacchetto)?$/i.test(costInfo.rawText)) {
    return { cost: 'Incluso nel pacchetto', currencyUncertain: false };
  }

  if (!costInfo.hasValue && !depInfo.hasValue) {
    return {};
  }

  if (costInfo.isAmbiguous || depInfo.isAmbiguous) {
    return {
      cost: costInfo.rawText || undefined,
      depositPaid: depInfo.rawText || undefined,
      acconto: depInfo.rawText || undefined,
      currencyUncertain: true
    };
  }

  const foreignCurrency = costInfo.isForeign
    ? costInfo.currency
    : depInfo.isForeign
    ? depInfo.currency
    : null;

  if (!foreignCurrency) {
    // Già in EUR
    const eurCost = costInfo.hasValue ? roundEur(costInfo.amount).toFixed(2) : undefined;
    const eurDep = depInfo.hasValue ? roundEur(depInfo.amount).toFixed(2) : undefined;
    return {
      cost: eurCost,
      depositPaid: eurDep,
      acconto: eurDep,
      currencyUncertain: false
    };
  }

  // Each input has its own currency. Never apply the cost rate to a different deposit.
  const [costQuote, depositQuote] = await Promise.all([
    costInfo.isForeign ? fetchEcbExchangeRate(costInfo.currency!) : Promise.resolve(null),
    depInfo.isForeign ? fetchEcbExchangeRate(depInfo.currency!) : Promise.resolve(null),
  ]);
  const unresolved = (costInfo.isForeign && !costQuote) || (depInfo.isForeign && !depositQuote);
  const costEur = costInfo.hasValue && !unresolved
    ? roundEur(costInfo.amount / (costQuote?.rate || 1)) : undefined;
  const depositEur = depInfo.hasValue && !unresolved
    ? roundEur(depInfo.amount / (depositQuote?.rate || 1)) : undefined;
  return {
    cost: unresolved ? (costInfo.rawText || undefined) : costEur?.toFixed(2),
    depositPaid: unresolved ? (depInfo.rawText || undefined) : depositEur?.toFixed(2),
    acconto: unresolved ? (depInfo.rawText || undefined) : depositEur?.toFixed(2),
    originalCurrency: costInfo.currency || undefined,
    originalCost: costInfo.hasValue ? costInfo.amount : undefined,
    originalDepositCurrency: depInfo.currency || undefined,
    originalDepositPaid: depInfo.hasValue ? depInfo.amount : undefined,
    // Original remaining is meaningful only when the two nominal amounts use the same currency.
    originalRemaining: costInfo.hasValue && costInfo.currency === depInfo.currency
      ? roundEur(Math.max(0, costInfo.amount - depInfo.amount)) : undefined,
    exchangeRate: costQuote?.rate,
    exchangeRateDate: costQuote?.date,
    exchangeRateSource: costQuote?.source,
    depositExchangeRate: depositQuote?.rate,
    depositExchangeRateDate: depositQuote?.date,
    depositExchangeRateSource: depositQuote?.source,
    conversionType: costInfo.isForeign ? 'stimata' : 'definitiva',
    depositConversionType: depInfo.isForeign ? 'stimata' : 'definitiva',
    convertedAt: unresolved ? undefined : new Date().toISOString(),
    currencyUncertain: Boolean(unresolved),
  };
}

/** Re-saving EUR fields never re-converts them or discards the original provenance. */
export async function buildEurSavePatch(params: {
  costRaw?: string | number | null;
  depositRaw?: string | number | null;
  existingItem?: any;
}): Promise<Record<string, any>> {
  const normalized = await normalizeFinancialFieldsToEur(params);
  const ex = params.existingItem;
  if (!ex) return normalized;
  const cost = detectCurrencyFromValue(params.costRaw);
  const deposit = detectCurrencyFromValue(params.depositRaw);
  const output: Record<string, any> = { ...normalized };
  // Keep immutable original evidence when a field is re-saved/overridden in EUR.
  const retain = (keys: string[]) => {
    for (const key of keys) if (ex[key] !== undefined) output[key] = ex[key];
  };
  if (!cost.isForeign && !cost.isAmbiguous && ex.originalCurrency) {
    retain(['originalCurrency', 'originalCost', 'originalRemaining', 'exchangeRate', 'exchangeRateDate', 'exchangeRateSource', 'convertedAt']);
    const unchanged = roundEur(cost.amount) === roundEur(parseRawNumericAmount(ex.cost ?? ex.budget ?? ex.amount));
    output.conversionType = unchanged ? ex.conversionType : 'definitiva';
  }
  if (!deposit.isForeign && !deposit.isAmbiguous && ex.originalDepositPaid !== undefined) {
    retain(['originalDepositPaid', 'originalDepositCurrency', 'depositExchangeRate', 'depositExchangeRateDate', 'depositExchangeRateSource']);
    const unchanged = roundEur(deposit.amount) === roundEur(parseRawNumericAmount(ex.depositPaid ?? ex.acconto ?? ex.amountPaid));
    output.depositConversionType = unchanged ? ex.depositConversionType : 'definitiva';
  }
  // A numeric legacy amount explicitly flagged uncertain needs an explicit EUR declaration.
  if (ex.currencyUncertain && !cost.isExplicitEur && !cost.isForeign
      && roundEur(cost.amount) === roundEur(parseRawNumericAmount(ex.cost ?? ex.budget ?? ex.amount))) {
    output.currencyUncertain = true;
  }
  return output;
}
