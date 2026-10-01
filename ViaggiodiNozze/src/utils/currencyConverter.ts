export type SupportedCurrency = 'EUR' | 'NZD' | 'AUD' | 'PHP' | 'USD' | 'GBP' | 'JPY' | 'CHF' | 'CAD';

const CACHE_KEY = 'roadbook_currency_rates';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface RatesCache {
  rates: Record<string, number>;
  timestamp: number;
}

export async function fetchExchangeRates(): Promise<Record<string, number> | null> {
  // Controlla cache
  if (typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed: RatesCache = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_EXPIRY) {
          return parsed.rates;
        }
      } catch (e) {
        console.error('Invalid currency cache', e);
      }
    }
  }

  // Fetch nuovi tassi (fallisce silenziosamente se offline)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    
    if (data && data.rates) {
      const rates = data.rates as Record<string, number>;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          rates,
          timestamp: Date.now()
        }));
      }
      return rates;
    }
  } catch (err) {
    console.error('Fetch exchange rates failed, using fallback or cache', err);
    // Se fallisce (es. offline) e abbiamo una vecchia cache scaduta, usala lo stesso
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached).rates;
        } catch (e) {}
      }
    }
  }

  // Fallback rate super basici per le valute principali se completamente vuoto
  return {
    EUR: 1,
    NZD: 1.80,
    AUD: 1.65,
    PHP: 60.50,
    USD: 1.08,
    GBP: 0.85,
    JPY: 160.0,
    CHF: 0.95,
    CAD: 1.45
  };
}

export function convertToEur(amount: number, fromCurrency: string, rates: Record<string, number> | null): number {
  if (fromCurrency === 'EUR' || !rates || !rates[fromCurrency]) {
    return amount;
  }
  // rates[fromCurrency] è quante valute estere servono per 1 EUR.
  // Quindi EUR = amount / rate
  return amount / rates[fromCurrency];
}
