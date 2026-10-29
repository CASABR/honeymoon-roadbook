/**
 * firestoreStorageCalculator.ts
 *
 * Calcolatore ufficiale per la stima dello spazio Firestore conformemente
 * alle regole documentate da Google Cloud Firebase ("Storage size calculations").
 *
 * Regole ufficiali Firebase:
 * - Percorso documento (path): 16 byte base + lunghezza UTF-8 dei segmenti + 1 byte delimitatore
 * - Overhead documento: 32 byte fissi per documento
 * - Nome campo: lunghezza UTF-8 del nome + 1 byte
 * - Valori dei campi:
 *   - null / undefined: 1 byte
 *   - boolean: 1 byte
 *   - integer / float: 8 byte
 *   - timestamp / Date: 8 byte
 *   - string: lunghezza UTF-8 + 1 byte
 *   - bytes / blob: lunghezza byte
 *   - GeoPoint: 16 byte (lat 8 + lng 8)
 *   - reference: lunghezza percorso + 16 byte
 *   - array: 1 byte overhead + somma dimensioni elementi
 *   - map (oggetto): 1 byte overhead + somma (nome campo + valore)
 */

export const FIRESTORE_SPARK_FREE_STORAGE_LIMIT_BYTES = 1073741824; // 1 GiB (1024^3)

/** Formatta byte in stringa leggibile standard KiB, MiB, GiB */
export function formatStorageBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  if (bytes < k) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < k * k) {
    return `${(bytes / k).toFixed(2)} KiB`;
  }
  if (bytes < k * k * k) {
    return `${(bytes / (k * k)).toFixed(2)} MiB`;
  }
  return `${(bytes / (k * k * k)).toFixed(3)} GiB`;
}

/** Calcola la percentuale di occupazione rispetto al limite gratuito di 1 GiB */
export function calculateQuotaPercentage(
  bytes: number,
  limitBytes: number = FIRESTORE_SPARK_FREE_STORAGE_LIMIT_BYTES
): number {
  if (!bytes || bytes <= 0 || !limitBytes || limitBytes <= 0) return 0;
  return (bytes / limitBytes) * 100;
}

/** Calcola la dimensione UTF-8 in byte di una stringa */
export function getUtf8ByteLength(str: string): number {
  if (!str) return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  // Fallback per ambienti senza TextEncoder
  let s = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) s += 1;
    else if (code <= 0x7ff) s += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      s += 4;
      i++; // surrogate pair
    } else s += 3;
  }
  return s;
}

/**
 * Calcola la dimensione in byte di un singolo valore Firestore secondo le specifiche Google
 */
export function calculateFirestoreValueSize(val: any): number {
  if (val === null || val === undefined) {
    return 1;
  }

  const type = typeof val;

  if (type === 'boolean') {
    return 1;
  }

  if (type === 'number') {
    return 8;
  }

  if (type === 'string') {
    return getUtf8ByteLength(val) + 1;
  }

  // Date o Timestamp Firestore (ha toMillis o seconds)
  if (val instanceof Date || (typeof val === 'object' && ('seconds' in val || 'toMillis' in val))) {
    return 8;
  }

  // GeoPoint Firestore (latitude, longitude)
  if (typeof val === 'object' && 'latitude' in val && 'longitude' in val) {
    return 16;
  }

  // Reference Firestore (path / id)
  if (typeof val === 'object' && typeof val.path === 'string') {
    return getUtf8ByteLength(val.path) + 16;
  }

  // Array Firestore
  if (Array.isArray(val)) {
    let arraySize = 1; // 1 byte overhead per array
    for (const item of val) {
      arraySize += calculateFirestoreValueSize(item);
    }
    return arraySize;
  }

  // Map / Oggetto nidificato
  if (type === 'object') {
    let mapSize = 1; // 1 byte overhead per map
    for (const key of Object.keys(val)) {
      // Ogni campo ha il nome (lunghezza UTF-8 + 1) + la dimensione del valore
      mapSize += (getUtf8ByteLength(key) + 1) + calculateFirestoreValueSize(val[key]);
    }
    return mapSize;
  }

  return 1;
}

/**
 * Calcola la dimensione totale stimata di un documento Firestore (path + overhead + campi)
 * @param documentPath Percorso completo o relativo del documento (es. "trips/0000" o "trips/0000/tappe/tappa_1")
 * @param data Dati del documento
 */
export function calculateFirestoreDocSize(documentPath: string, data: Record<string, any> | undefined | null): number {
  let totalBytes = 32; // 32 byte fissi per documento

  // Path overhead: 16 byte base + lunghezza segmenti + delimitatori
  if (documentPath) {
    totalBytes += 16 + getUtf8ByteLength(documentPath);
  }

  if (!data) return totalBytes;

  // Campi del documento
  for (const fieldName of Object.keys(data)) {
    const nameSize = getUtf8ByteLength(fieldName) + 1;
    const valueSize = calculateFirestoreValueSize(data[fieldName]);
    totalBytes += nameSize + valueSize;
  }

  return totalBytes;
}

/**
 * Calcola la stima del documento radice di un viaggio
 */
export function calculateTripRootDocSize(tripId: string, tripData: Record<string, any>): number {
  const path = `trips/${tripId}`;
  return calculateFirestoreDocSize(path, tripData);
}

/** Soglie di allerta quota globale ufficiali richieste dalle specifiche */
export type StorageAlertLevel = 'normal' | 'warning_70' | 'alert_85' | 'critical_95';

export function getQuotaAlertLevel(percentUsed: number): {
  level: StorageAlertLevel;
  badgeLabel: string;
  badgeColorClass: string;
  description: string;
} {
  if (percentUsed >= 95) {
    return {
      level: 'critical_95',
      badgeLabel: '🔴 CRITICO (≥95%)',
      badgeColorClass: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
      description: 'Attenzione: la quota gratuita di archiviazione Firestore è quasi esaurita. Rischio blocco scritture!'
    };
  }
  if (percentUsed >= 85) {
    return {
      level: 'alert_85',
      badgeLabel: '🟠 ALLERTA ELEVATA (≥85%)',
      badgeColorClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
      description: 'Superata la soglia dell\'85% della quota gratuita Spark (1 GiB). Pianificare ottimizzazione o pulizia.'
    };
  }
  if (percentUsed >= 70) {
    return {
      level: 'warning_70',
      badgeLabel: '🟡 ATTENZIONE (≥70%)',
      badgeColorClass: 'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800',
      description: 'La quota utilizzata supera il 70% del limite gratuito di 1 GiB. Monitoraggio consigliato.'
    };
  }
  return {
    level: 'normal',
    badgeLabel: '🟢 NORMALE (<70%)',
    badgeColorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
    description: 'Utilizzo di archiviazione ampiamente entro i limiti gratuiti del piano Firebase Spark.'
  };
}
