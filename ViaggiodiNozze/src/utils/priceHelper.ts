/**
 * Utility centralizzata per verificare e gestire lo stato economico di qualsiasi entità del roadbook:
 * Voli, Alloggi, Transfer, Attività, Ristoranti, Shopping, Spese extra.
 */

export interface PricePaymentInfo {
  isFree: boolean;
  isPackageIncluded: boolean;
  isPaid: boolean;
  costNum: number;
  paidNum: number;
  remainingNum: number;
  displayText: string;
  compactPaymentText: string;
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
  if (clean === 'incluso' || clean === 'incluso nel pacchetto') return false; // È incluso nel pacchetto, non "gratuito"
  
  const num = parseCostToNumber(clean);
  return num === 0 && !clean.includes('incluso');
}

/**
 * Determina se una voce è inclusa nel pacchetto di viaggio.
 */
export function isCostPackageIncluded(costRaw?: string | number | null, packageIncludedFlag?: boolean): boolean {
  if (packageIncludedFlag === true) return true;
  if (packageIncludedFlag === false) return false;
  if (costRaw === undefined || costRaw === null) return false;
  const clean = String(costRaw).trim().toLowerCase();
  return clean === 'incluso' || clean.includes('incluso nel pacchetto');
}

/**
 * Esegue il parsing robusto di stringhe di costo (€, valute, virgole, punti).
 */
export function parseCostToNumber(costRaw?: string | number | null): number {
  if (costRaw === undefined || costRaw === null) return 0;
  if (typeof costRaw === 'number') return isNaN(costRaw) ? 0 : Math.max(0, costRaw);
  const cleanStr = String(costRaw).trim().toLowerCase();
  if (cleanStr === 'gratuito' || cleanStr === 'free' || cleanStr === 'gratis' || cleanStr.includes('incluso')) {
    return 0;
  }
  return Math.max(0, parseEuro(cleanStr));
}

/**
 * Formatta un importo in euro in modo compatto: es. "€180" se intero o "€180,50" con decimali.
 */
export function formatCompactEuro(val: number): string {
  if (Math.round(val) === val) {
    return `€${val.toLocaleString('it-IT')}`;
  }
  return `€${val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Risolve lo stato contabile unificato di un elemento.
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
}): PricePaymentInfo {
  const costVal = item.cost ?? item.budget ?? item.amount;
  const isPkg = isCostPackageIncluded(costVal, item.packageIncluded ?? undefined);
  const isFree = !isPkg && isCostFree(costVal);

  const costNum = (isFree || isPkg) ? 0 : parseCostToNumber(costVal);
  const paidVal = item.depositPaid ?? item.acconto ?? item.amountPaid;
  const parsedPaidNum = (isFree || isPkg) ? 0 : parseCostToNumber(paidVal);
  const paidNum = parsedPaidNum;

  // Un elemento è saldato se il paymentStatus è 'saldato' (e non vi è un acconto parziale ancora inferiore al costo non saldato),
  // oppure se la somma effettivamente versata copre l'intero costo.
  // NON considerare saldato un elemento solo per 'completed=true' o 'status=completato' se vi è ancora un residuo dovuto!
  const isExplicitPaid =
    (item.paymentStatus === 'saldato' && (paidNum === 0 || paidNum >= costNum)) ||
    (item.status === 'saldato' && (paidNum === 0 || paidNum >= costNum)) ||
    (costNum > 0 && paidNum >= costNum);

  // Se esplicitamente 'da_saldare', non è saldato a meno che la somma versata non copra l'intero costo
  const isPaid = !isFree && !isPkg && isExplicitPaid && (item.paymentStatus !== 'da_saldare' || (costNum > 0 && paidNum >= costNum));

  // Quando saldato, il residuo dovuto è zero; se non saldato, remainingNum riflette esattamente l'importo ancora dovuto
  const effectivePaidNum = isPaid ? costNum : paidNum;
  const remainingNum = isPaid ? 0 : Math.max(0, costNum - paidNum);

  let displayText = '';
  if (isPkg) {
    displayText = 'Incluso nel pacchetto';
  } else if (isFree) {
    displayText = 'Gratuito';
  } else if (costNum > 0) {
    displayText = `${costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  } else {
    displayText = 'Costo da definire';
  }

  // Calcolo della riga compatta unificata conforme ai requisiti PWA:
  // 1. «€180 · Saldato»
  // 2. «€180 · Da saldare»
  // 3. «€120 da saldare · Cap. €60» (quando c'è caparra/acconto e saldo residuo)
  let compactPaymentText = '';
  if (isPkg) {
    compactPaymentText = 'Incluso';
  } else if (isFree) {
    compactPaymentText = 'Gratuito';
  } else if (costNum > 0) {
    if (isPaid) {
      compactPaymentText = `${formatCompactEuro(costNum)} · Saldato`;
    } else if (parsedPaidNum > 0 && remainingNum > 0) {
      compactPaymentText = `${formatCompactEuro(remainingNum)} da saldare · Cap. ${formatCompactEuro(parsedPaidNum)}`;
    } else {
      compactPaymentText = `${formatCompactEuro(costNum)} · Da saldare`;
    }
  } else {
    compactPaymentText = displayText;
  }

  return {
    isFree,
    isPackageIncluded: isPkg,
    isPaid,
    costNum,
    paidNum: effectivePaidNum,
    remainingNum,
    displayText,
    compactPaymentText
  };
}

export const parseEuro = (val: any): number => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim().replace(/[€a-zA-Z\s]/g, "");
  
  // Se è un numero tipo "406.075,00", rimuovi i punti come separatori migliaia.
  if (str.includes(',') && str.includes('.')) {
    // Il punto è il separatore delle migliaia in formato europeo.
    str = str.replace(/\./g, '');
  } else if ((str.match(/\./g) || []).length > 1) {
    // Multipli punti "1.000.000"
    str = str.replace(/\./g, '');
  } else if (str.includes('.') && !str.includes(',')) {
    // "1000.50" (format US) -> Lasciamo così
    const parts = str.split('.');
    if (parts[1] && parts[1].length === 3) {
      // Se dopo il punto ci sono 3 cifre es. "406.075", era un separatore migliaia
      str = str.replace(/\./g, '');
    }
  }

  // Converti la virgola europea in punto per il parsing
  str = str.replace(',', '.');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};
