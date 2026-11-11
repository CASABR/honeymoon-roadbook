/**
 * Utility centralizzata per verificare e gestire lo stato economico di qualsiasi entità del roadbook:
 * Voli, Alloggi, Transfer, Attività, Ristoranti, Shopping, Spese extra.
 *
 * Tutte le visualizzazioni e somme di budget avvengono esclusivamente in EUR (€).
 * Eventuali importi ancora espressi in valuta estera non convertita o con valuta incerta
 * vengono segnalati e NON vengono mai sommati al nominale come se fossero EUR.
 */

import { detectCurrencyFromValue, parseRawNumericAmount, roundEur } from '../services/currencyService';

export interface PricePaymentInfo {
  isFree: boolean;
  isPackageIncluded: boolean;
  isPaid: boolean;
  isCurrencyUnresolved: boolean;
  isEstimatedConversion: boolean;
  unverifiedRawText?: string;
  conversionSummary?: string;
  costNum: number;
  paidNum: number;
  remainingNum: number;
  displayText: string;
  compactPaymentText: string;
}

export interface CauzioneInfo {
  hasCauzione: boolean;
  rawText: string;
  originalAmountText?: string;
  eurEquivalentText?: string;
  isEstimated: boolean;
}

/**
 * Determina se un valore di costo indica esplicitamente o numericamente la gratuità.
 */
export function isCostFree(costRaw?: string | number | null): boolean {
  if (costRaw === undefined || costRaw === null) return false;
  if (typeof costRaw === 'number') {
    return costRaw === 0;
  }
  const clean = String(costRaw).trim().toLowerCase();
  if (clean === '' || clean === 'gratuito' || clean === 'free' || clean === 'gratis') return true;
  if (clean === 'incluso' || clean === 'incluso nel pacchetto') return false;

  const detected = detectCurrencyFromValue(clean);
  if (detected.isAmbiguous && !/\d/.test(clean)) return false; // Es. "$$" fascia prezzo ristorante
  return detected.amount === 0 && !clean.includes('incluso');
}

/**
 * Determina se una voce è inclusa nel pacchetto di viaggio.
 */
export function isCostPackageIncluded(costRaw?: string | number | null, packageIncludedFlag?: boolean): boolean {
  const clean = costRaw === undefined || costRaw === null ? '' : String(costRaw).trim().toLowerCase();
  if (clean === 'incluso' || clean.includes('incluso nel pacchetto')) return true;
  return packageIncludedFlag === true;
}

/**
 * Estrae un importo in EUR. Se la stringa contiene una valuta estera non convertita
 * (es. "200 AUD", "5 NZD", "$100"), restituisce 0 per impedire somme eterogenee.
 */
export function parseCostToNumber(costRaw?: string | number | null): number {
  if (costRaw === undefined || costRaw === null) return 0;
  if (typeof costRaw === 'number') return Number.isNaN(costRaw) ? 0 : roundEur(Math.max(0, costRaw));
  const cleanStr = String(costRaw).trim().toLowerCase();
  if (cleanStr === 'gratuito' || cleanStr === 'free' || cleanStr === 'gratis' || cleanStr.includes('incluso')) {
    return 0;
  }
  const detected = detectCurrencyFromValue(costRaw);
  if (!detected.hasValue || detected.isForeign || detected.isAmbiguous) {
    return 0;
  }
  return roundEur(Math.max(0, detected.amount));
}

/**
 * Formatta un importo in EUR a due decimali compatti: es. "€180" o "€180,50".
 */
export function formatCompactEuro(val: number): string {
  const rounded = roundEur(val);
  if (Math.abs(Math.round(rounded) - rounded) < 1e-9) {
    return `€${Math.round(rounded).toLocaleString('it-IT')}`;
  }
  return `€${rounded.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEuroExact(val: number): string {
  const rounded = roundEur(val);
  return `${rounded.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function buildConversionSummary(item: {
  originalCurrency?: string;
  originalCost?: string | number;
  originalDepositPaid?: string | number;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  conversionType?: 'definitiva' | 'stimata';
}): string | undefined {
  if (!item.originalCurrency || item.originalCurrency === 'EUR') return undefined;
  const origParts: string[] = [];
  if (item.originalCost !== undefined && item.originalCost !== null && item.originalCost !== '') {
    const num = typeof item.originalCost === 'number'
      ? item.originalCost.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(item.originalCost);
    origParts.push(`${num} ${item.originalCurrency}`);
  }
  if (item.exchangeRate && item.exchangeRate > 0) {
    const rateStr = item.exchangeRate.toLocaleString('it-IT', { maximumFractionDigits: 4 });
    const src = item.exchangeRateSource || 'Tasso';
    const dt = item.exchangeRateDate ? ` ${item.exchangeRateDate}` : '';
    origParts.push(`cambio ${rateStr} (${src}${dt})`);
  }
  if (origParts.length === 0) return undefined;
  return `${item.conversionType === 'stimata' ? 'Stima da' : 'Orig.'} ${origParts.join(' · ')}`;
}

/**
 * Risolve lo stato contabile unificato di un elemento esclusivamente in EUR.
 */
export function resolvePaymentInfo(item: {
  cost?: string | number | null;
  budget?: string | number | null;
  amount?: string | number | null;
  depositPaid?: string | number | null;
  acconto?: string | number | null;
  amountPaid?: string | number | null;
  paymentStatus?: string | null;
  status?: string | null;
  completed?: boolean | null;
  packageIncluded?: boolean | null;
  currencyUncertain?: boolean | null;
  conversionType?: 'definitiva' | 'stimata' | null;
  depositConversionType?: 'definitiva' | 'stimata' | null;
  originalCurrency?: string | null;
  originalCost?: string | number | null;
  originalDepositPaid?: string | number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  exchangeRateSource?: string | null;
}): PricePaymentInfo {
  const costVal = item.cost ?? item.budget ?? item.amount;
  const paidVal = item.depositPaid ?? item.acconto ?? item.amountPaid;

  const isPkg = isCostPackageIncluded(costVal, item.packageIncluded ?? undefined);
  const costDetected = detectCurrencyFromValue(costVal);
  const paidDetected = detectCurrencyFromValue(paidVal);

  // Controllo sicurezza: mai trattare "$$" o importi esteri non convertiti come gratuiti né come EUR
  const hasExplicitNonEur =
    !isPkg &&
    ((costDetected.hasValue && (costDetected.isForeign || costDetected.isAmbiguous) && costDetected.amount > 0) ||
      (paidDetected.hasValue && (paidDetected.isForeign || paidDetected.isAmbiguous) && paidDetected.amount > 0));

  const isUncertainFlag = Boolean(item.currencyUncertain) && !isPkg && (costDetected.hasValue || paidDetected.hasValue);
  const isCurrencyUnresolved = hasExplicitNonEur || isUncertainFlag;

  const isEstimatedConversion =
    item.conversionType === 'stimata' || item.depositConversionType === 'stimata';

  const conversionSummary = buildConversionSummary({
    originalCurrency: item.originalCurrency || undefined,
    originalCost: item.originalCost ?? undefined,
    originalDepositPaid: item.originalDepositPaid ?? undefined,
    exchangeRate: item.exchangeRate ?? undefined,
    exchangeRateDate: item.exchangeRateDate ?? undefined,
    exchangeRateSource: item.exchangeRateSource ?? undefined,
    conversionType: item.conversionType ?? undefined
  });

  if (isCurrencyUnresolved) {
    const rawStr = costVal !== undefined && costVal !== null ? String(costVal).trim() : '';
    const unverifiedRawText = rawStr || (paidVal ? String(paidVal).trim() : '');
    return {
      isFree: false,
      isPackageIncluded: false,
      isPaid: false,
      isCurrencyUnresolved: true,
      isEstimatedConversion,
      unverifiedRawText,
      conversionSummary,
      costNum: 0,
      paidNum: 0,
      remainingNum: 0,
      displayText: unverifiedRawText ? `Da verificare (${unverifiedRawText})` : 'Valuta da verificare',
      compactPaymentText: unverifiedRawText ? `⚠ Valuta da verificare (${unverifiedRawText})` : '⚠ Valuta da verificare'
    };
  }

  const isFree = !isPkg && isCostFree(costVal);
  const costNum = (isFree || isPkg) ? 0 : parseCostToNumber(costVal);
  const parsedPaidNum = (isFree || isPkg) ? 0 : parseCostToNumber(paidVal);
  const paidNum = costNum > 0 ? Math.min(costNum, parsedPaidNum) : parsedPaidNum;

  const isExplicitPaid =
    (item.paymentStatus === 'saldato' && (paidNum === 0 || paidNum >= costNum)) ||
    (item.status === 'saldato' && (paidNum === 0 || paidNum >= costNum)) ||
    (costNum > 0 && paidNum >= costNum);

  const isPaid = !isFree && !isPkg && isExplicitPaid && (item.paymentStatus !== 'da_saldare' || (costNum > 0 && paidNum >= costNum));

  const effectivePaidNum = isPaid ? costNum : paidNum;
  const remainingNum = isPaid ? 0 : roundEur(Math.max(0, costNum - effectivePaidNum));

  let displayText = '';
  if (isPkg) {
    displayText = 'Incluso nel pacchetto';
  } else if (isFree) {
    displayText = 'Gratuito';
  } else if (costNum > 0) {
    displayText = `${isEstimatedConversion ? '~' : ''}${formatEuroExact(costNum)}`;
  } else {
    displayText = 'Costo da definire';
  }

  let compactPaymentText = '';
  if (isPkg) {
    compactPaymentText = 'Incluso';
  } else if (isFree) {
    compactPaymentText = 'Gratuito';
  } else if (costNum > 0) {
    const estPrefix = isEstimatedConversion ? '~' : '';
    if (isPaid) {
      compactPaymentText = `${estPrefix}${formatCompactEuro(costNum)} · Saldato`;
    } else if (effectivePaidNum > 0 && remainingNum > 0) {
      compactPaymentText = `${estPrefix}${formatCompactEuro(remainingNum)} da saldare · Acc. ${formatCompactEuro(effectivePaidNum)}`;
    } else {
      compactPaymentText = `${estPrefix}${formatCompactEuro(costNum)} · Da saldare`;
    }
  } else {
    compactPaymentText = displayText;
  }

  return {
    isFree,
    isPackageIncluded: isPkg,
    isPaid,
    isCurrencyUnresolved: false,
    isEstimatedConversion,
    conversionSummary,
    costNum,
    paidNum: effectivePaidNum,
    remainingNum,
    displayText,
    compactPaymentText
  };
}

/**
 * Estrae in modo sicuro i metadati di cauzione/preautorizzazione per la sola visualizzazione informativa.
 */
export function resolveCauzioneInfo(item: {
  cauzione?: string | number | null;
  originalCauzione?: string | number | null;
  originalCauzioneCurrency?: string | null;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
}): CauzioneInfo | null {
  const raw = item.cauzione;
  if (!raw && (item.originalCauzione === undefined || item.originalCauzione === null)) {
    return null;
  }
  const rawText = raw ? String(raw).trim() : `${item.originalCauzione} ${item.originalCauzioneCurrency || ''}`.trim();
  if (!rawText) return null;

  const rate = item.originalCauzioneCurrency === item.originalCurrency
    && item.exchangeRate && item.exchangeRate > 0 ? item.exchangeRate : null;
  const origNum = item.originalCauzione !== undefined && item.originalCauzione !== null
    ? Number(item.originalCauzione)
    : undefined;

  let eurEquivalentText: string | undefined;
  const euroInText = rawText.match(/€\s*[\d.,]+(?:\s*[–-]\s*€?\s*[\d.,]+)?/);
  if (euroInText) {
    eurEquivalentText = euroInText[0];
  } else if (origNum !== undefined && !Number.isNaN(origNum)) {
    if (origNum === 0) {
      eurEquivalentText = '0,00 €';
    } else if (item.originalCauzioneCurrency === 'EUR') {
      eurEquivalentText = formatEuroExact(origNum);
    } else if (rate) {
      eurEquivalentText = `~${formatEuroExact(origNum / rate)}`;
    }
  }

  return {
    hasCauzione: true,
    rawText,
    eurEquivalentText,
    isEstimated: Boolean(eurEquivalentText && eurEquivalentText.startsWith('~'))
  };
}

export const parseEuro = (val: unknown): number => {
  return parseRawNumericAmount(val);
};
