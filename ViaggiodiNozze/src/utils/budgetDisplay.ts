import { detectCurrencyFromValue, fetchEcbExchangeRate, getCachedEcbExchangeRate, roundEur, type ExchangeRateQuote } from '../services/currencyService';

type Category = 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'shopping' | 'altro';
export interface DisplayExpense { category: Category; cost: number; paidAmount: number; paid: boolean; isEstimatedConversion?: boolean }
export function currencyUnits(value: number, currency: string): number {
  const digits = new Intl.NumberFormat('it-IT', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
export function displayPayment(item: Pick<DisplayExpense, 'cost' | 'paidAmount' | 'paid'>, currency: string, rate: number) {
  const cost = currencyUnits(item.cost * rate, currency);
  const paid = currencyUnits((item.paidAmount || (item.paid ? item.cost : 0)) * rate, currency);
  return { cost, paid, remaining: currencyUnits(Math.max(0, cost - paid), currency) };
}
export function buildDisplayLedger(items: readonly DisplayExpense[], currency: string, rate: number) {
  const catStats = Object.fromEntries(['trasporti', 'alloggi', 'attivita', 'ristoranti', 'shopping', 'altro'].map(key => [key, { total: 0, saldato: 0, daSaldare: 0 }])) as Record<Category, { total: number; saldato: number; daSaldare: number }>;
  let totSaldato = 0; let totDaSaldare = 0;
  for (const item of items) {
    const p = displayPayment(item, currency, rate); const cat = catStats[item.category];
    cat.saldato = currencyUnits(cat.saldato + p.paid, currency);cat.daSaldare = currencyUnits(cat.daSaldare + p.remaining, currency);cat.total = currencyUnits(cat.saldato + cat.daSaldare, currency);
    totSaldato = currencyUnits(totSaldato + p.paid, currency);totDaSaldare = currencyUnits(totDaSaldare + p.remaining, currency);
  }
  return { catStats, totSaldato, totDaSaldare, totGenerale: currencyUnits(totSaldato + totDaSaldare, currency), maxCategoryTotal: Math.max(0, ...Object.values(catStats).map(cat => cat.total)), estimatedCount: items.filter(item => item.isEstimatedConversion).length };
}
export async function getDisplayExchangeRate(currency: string, offline = false): Promise<ExchangeRateQuote | null> {
  if (currency === 'EUR') return { currency, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'EUR' };
  const valid = (quote: ExchangeRateQuote | null) => {
    if (!quote || quote.currency !== currency || !Number.isFinite(quote.rate) || quote.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) return null;
    const day = new Date(quote.date + 'T00:00:00Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === quote.date && day.getTime() <= Date.now() ? quote : null;
  };
  const fresh = valid(getCachedEcbExchangeRate(currency));if (fresh) return fresh;
  if (offline) return valid(getCachedEcbExchangeRate(currency, true));
  try { return valid(await fetchEcbExchangeRate(currency)) || valid(getCachedEcbExchangeRate(currency, true)); }
  catch { return valid(getCachedEcbExchangeRate(currency, true)); }
}
export function formatDraftBalance(cost: string, paid: string): string {
  // Pure draft preview only; no conversion or payment mutation here.
  const read = (raw: string) => {
    const info = detectCurrencyFromValue(raw);
    return { code: info.isAmbiguous ? null : info.currency, number: info.amount };
  };
  const c = read(cost), p = paid ? read(paid) : { code: c.code, number: 0 };
  if (!c.code || c.code !== p.code || !Number.isFinite(c.number) || !Number.isFinite(p.number)) return 'Saldo EUR disponibile al salvataggio';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: c.code }).format(roundEur(Math.max(0, c.number - p.number)));
}
