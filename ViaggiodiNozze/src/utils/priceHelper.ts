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
  const numStr = cleanStr.replace(/[^0-9,.-]/g, '').replace(',', '.');
  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : Math.max(0, num);
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
  const paidNum = (isFree || isPkg) ? 0 : parseCostToNumber(paidVal);
  const remainingNum = Math.max(0, costNum - paidNum);

  const isExplicitPaid = item.paymentStatus === 'saldato' || 
    item.status === 'saldato' || 
    item.status === 'completato' || 
    Boolean(item.completed) ||
    (costNum > 0 && paidNum >= costNum);

  const isPaid = !isFree && !isPkg && isExplicitPaid;

  let displayText = '';
  if (isPkg) {
    displayText = 'Incluso nel pacchetto';
  } else if (isFree) {
    displayText = 'Gratuito';
  } else if (costNum > 0) {
    displayText = `${costNum.toFixed(2)} €`;
  } else {
    displayText = 'Costo da definire';
  }

  return {
    isFree,
    isPackageIncluded: isPkg,
    isPaid,
    costNum,
    paidNum,
    remainingNum,
    displayText
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

