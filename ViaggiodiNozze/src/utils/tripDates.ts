import { getTripConfig } from './tripConfig';

export const DEFAULT_TRIP_START_DATE = '2026-11-28';
export const DEFAULT_TRIP_END_DATE = '2027-01-10';

export interface TripDayItem {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  dayOfMonth: string;
  monthShort: string;
  dayNameShort: string;
  labelFormatted: string; // es. "29 Nov"
}

export function generateTripDays(startDateStr?: string, endDateStr?: string): TripDayItem[] {
  const days: TripDayItem[] = [];
  const config = getTripConfig();
  const defaultStart = config ? config.startDate : DEFAULT_TRIP_START_DATE;
  const defaultEnd = config ? config.endDate : DEFAULT_TRIP_END_DATE;
  
  // Se specificata una data d'inizio valida, usala; altrimenti usa defaultStart
  let start: Date;
  const startToUse = startDateStr || defaultStart;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startToUse)) {
    const [y, m, d] = startToUse.split('-').map(Number);
    start = new Date(y, m - 1, d);
  } else {
    const [y, m, d] = DEFAULT_TRIP_START_DATE.split('-').map(Number);
    start = new Date(y, m - 1, d);
  }

  const endToUse = endDateStr || defaultEnd;
  let end: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(endToUse)) {
    const [y, m, d] = endToUse.split('-').map(Number);
    end = new Date(y, m - 1, d);
  } else {
    const [y, m, d] = DEFAULT_TRIP_END_DATE.split('-').map(Number);
    end = new Date(y, m - 1, d);
  }

  // Nel caso limite in cui la data sia successiva alla fine, limita alla fine
  if (start > end) {
    start = new Date(end);
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const monthNames = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  const current = new Date(start);
  let count = 1;

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const monthShort = monthNames[current.getMonth()];

    days.push({
      dateStr,
      dayNum: count,
      dayOfMonth: d,
      monthShort,
      dayNameShort: dayNames[current.getDay()],
      labelFormatted: `${d} ${monthShort}`
    });

    current.setDate(current.getDate() + 1);
    count++;
  }

  return days;
}

/**
 * Trova la data più remota (minima) tra una serie di stringhe data (YYYY-MM-DD).
 * Se nessuna data è inferiore al 29 Novembre 2026, usa '2026-11-29' come default.
 */
export function calculateEarliestTripDate(dates: (string | undefined | null)[]): string {
  const config = getTripConfig();
  const defaultStart = config?.startDate || DEFAULT_TRIP_START_DATE;
  const validDates = dates.filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));

  let minDate = defaultStart;
  for (const d of validDates) {
    if (d < minDate) {
      minDate = d;
    }
  }

  return minDate;
}

/**
 * Trova la data massima tra una serie di stringhe data (YYYY-MM-DD).
 * Se nessuna data è superiore alla data di fine vacanza, usa quella come base.
 */
export function calculateLatestTripDate(dates: (string | undefined | null)[]): string {
  const config = getTripConfig();
  const defaultEnd = config?.endDate || DEFAULT_TRIP_END_DATE;
  const validDates = dates.filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));

  let maxDate = defaultEnd;
  for (const d of validDates) {
    if (d > maxDate) {
      maxDate = d;
    }
  }

  return maxDate;
}

export interface TripDateRange {
  minTripDate: string;
  maxTripDate: string;
  tripDays: TripDayItem[];
}

let cachedTripDateRange: { key: string; range: TripDateRange } | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('roadbook_data_mutated', () => {
    cachedTripDateRange = null;
  });
  window.addEventListener('roadbook_cloud_synced', () => {
    cachedTripDateRange = null;
  });
}

/**
 * Calcola l'intervallo reale dinamico del viaggio.
 * REGOLA:
 * - Per le date antecedenti alla data di inizio del viaggio (es. 2026-11-28),
 *   include il giorno SOLO ED ESCLUSIVAMENTE se per quella specifica data esiste
 *   almeno 1 elemento registrato in IndexedDB (trasporti, tappe, attività, alloggi, ristoranti, shopping).
 * - Per l'intervallo ufficiale di viaggio [startDate, endDate], genera tutti i giorni consecutivi.
 */
export async function getTripDateRange(extraDates: (string | undefined | null)[] = []): Promise<TripDateRange> {
  const cacheKey = Array.isArray(extraDates) ? extraDates.filter(Boolean).sort().join(',') : '';
  if (cachedTripDateRange && cachedTripDateRange.key === cacheKey) {
    return cachedTripDateRange.range;
  }

  try {
    const { storageService } = await import('../storage/storageService');
    const [days, activities, transports, tappe, ristoranti, shopping, accs] = await Promise.all([
      storageService.getDays(),
      storageService.getActivities(),
      storageService.getTransports(),
      storageService.getTappe(),
      storageService.getRistoranti(),
      storageService.getShopping(),
      storageService.getAccommodations()
    ]);

    const populatedDatesSet = new Set<string>();
    const addDate = (d?: string | null) => {
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        populatedDatesSet.add(d);
      }
    };

    if (Array.isArray(extraDates)) {
      extraDates.forEach(addDate);
    }

    days.forEach(d => addDate(d.date));
    activities.forEach(a => addDate(a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : undefined)));
    transports.forEach(t => {
      addDate(t.date);
      addDate(t.arrivalDate);
      addDate(t.dropoffDate);
    });
    tappe.forEach(t => addDate(t.data || t.date));
    ristoranti.forEach(r => addDate(r.data || r.date));
    shopping.forEach(s => addDate(s.data || s.date));
    accs.forEach(a => {
      addDate(a.checkIn);
      addDate(a.checkOut);
    });

    const config = getTripConfig();
    const officialStart = config?.startDate || DEFAULT_TRIP_START_DATE;
    const officialEnd = config?.endDate || DEFAULT_TRIP_END_DATE;

    // 1. Date antecedenti a officialStart: SOLO se effettivamente presenti tra i dati salvati
    const antecedentDates = Array.from(populatedDatesSet)
      .filter(d => d < officialStart)
      .sort();

    // 2. Intervallo continuativo del viaggio ufficiale [officialStart, officialEnd]
    const officialDays = generateTripDays(officialStart, officialEnd);

    // 3. Date successive a officialEnd: solo se popolate
    const subsequentDates = Array.from(populatedDatesSet)
      .filter(d => d > officialEnd)
      .sort();

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const monthNames = [
      'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
      'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
    ];
    const buildItem = (dateStr: string, dayNum: number): TripDayItem => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const monthShort = monthNames[dt.getMonth()];
      const dayOfMonth = String(d);
      return {
        dateStr,
        dayNum,
        dayOfMonth,
        monthShort,
        dayNameShort: dayNames[dt.getDay()],
        labelFormatted: `${dayOfMonth} ${monthShort}`
      };
    };

    const antecedentItems: TripDayItem[] = antecedentDates.map((dateStr, idx) => {
      return buildItem(dateStr, idx - antecedentDates.length);
    });

    const subsequentItems: TripDayItem[] = subsequentDates.map((dateStr, idx) => {
      return buildItem(dateStr, officialDays.length + 1 + idx);
    });

    const tripDays = [...antecedentItems, ...officialDays, ...subsequentItems];
    const minTripDate = tripDays.length > 0 ? tripDays[0].dateStr : officialStart;
    const maxTripDate = tripDays.length > 0 ? tripDays[tripDays.length - 1].dateStr : officialEnd;

    const result = { minTripDate, maxTripDate, tripDays };
    cachedTripDateRange = { key: cacheKey, range: result };
    return result;
  } catch (err) {
    console.error('[getTripDateRange] Errore calcolo range viaggio:', err);
    return { minTripDate: DEFAULT_TRIP_START_DATE, maxTripDate: DEFAULT_TRIP_END_DATE, tripDays: generateTripDays() };
  }
}

export const TRIP_DAYS = generateTripDays();

/**
 * Formatta qualsiasi tipo di data nel formato standard italiano Hounigo:
 * gg-mm-aaaa (es. "28-11-2026")
 *
 * Protezioni integrate:
 * - Evita shift di fuso orario su stringhe YYYY-MM-DD
 * - Supporta stringhe YYYY-MM-DD, stringhe ISO, Timestamp Firebase, Date, numeri epoch
 * - Gestisce valori null, undefined, non validi senza generare "Invalid Date" o "NaN"
 */
export function formatDateIT(
  dateInput?: string | number | Date | { seconds?: number; nanoseconds?: number; toDate?: () => Date } | null,
  fallback: string = ''
): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    return fallback;
  }

  // 1. Se è già una stringa
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return fallback;

    // Se è già gg-mm-aaaa
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Se è gg/mm/aaaa -> converti in gg-mm-aaaa
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed.replace(/\//g, '-');
    }

    // Se è YYYY-MM-DD (con o senza parte oraria)
    // CRITICO: Non usare new Date('YYYY-MM-DD') per evitare shift timezone UTC -> giorno prima!
    const dateOnly = trimmed.split(/[T\s]/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const [y, m, d] = dateOnly.split('-');
      return `${d}-${m}-${y}`;
    }

    // Se è una stringa data parseabile generica
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = parsed.getFullYear();
      return `${day}-${month}-${year}`;
    }

    return trimmed; // Ritorna il testo così com'è senza mostrare Invalid Date
  }

  // 2. Se è un Timestamp Firestore (oggetto con toDate o seconds)
  if (typeof dateInput === 'object') {
    if ('toDate' in dateInput && typeof (dateInput as any).toDate === 'function') {
      const d = (dateInput as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      }
    }

    if ('seconds' in dateInput && typeof (dateInput as any).seconds === 'number') {
      const d = new Date((dateInput as any).seconds * 1000);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      }
    }

    // Se è un'istanza Date nativa
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) return fallback;
      const day = String(dateInput.getDate()).padStart(2, '0');
      const month = String(dateInput.getMonth() + 1).padStart(2, '0');
      const year = dateInput.getFullYear();
      return `${day}-${month}-${year}`;
    }
  }

  // 3. Se è un numero (timestamp epoch in ms)
  if (typeof dateInput === 'number') {
    if (!isFinite(dateInput) || dateInput <= 0) return fallback;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return fallback;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return fallback;
}

/**
 * Formatta data e orario nel formato:
 * gg-mm-aaaa, HH:mm (es. "28-11-2026, 14:30")
 */
export function formatDateTimeIT(
  dateInput?: string | number | Date | { seconds?: number; nanoseconds?: number; toDate?: () => Date } | null,
  timeStrOrFallback?: string,
  fallback: string = 'Non disponibile'
): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    return fallback;
  }

  // Se è stato passato un orario separato esplicito come secondo argomento (es. formatDateTimeIT('2026-11-28', '14:30'))
  if (timeStrOrFallback && /^\d{1,2}:\d{2}/.test(timeStrOrFallback)) {
    const formattedDate = formatDateIT(dateInput, '');
    if (!formattedDate) return fallback;
    return `${formattedDate}, ${timeStrOrFallback}`;
  }

  let dt: Date | null = null;

  if (typeof dateInput === 'number') {
    if (!isFinite(dateInput) || dateInput <= 0) return fallback;
    dt = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    dt = dateInput;
  } else if (typeof dateInput === 'object') {
    if ('toDate' in dateInput && typeof (dateInput as any).toDate === 'function') {
      dt = (dateInput as any).toDate();
    } else if ('seconds' in dateInput && typeof (dateInput as any).seconds === 'number') {
      dt = new Date((dateInput as any).seconds * 1000);
    }
  } else if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (trimmed.includes('T') || trimmed.includes(' ')) {
      dt = new Date(trimmed);
    } else {
      // Solo data, senza ora
      const formattedDate = formatDateIT(trimmed, fallback);
      return formattedDate;
    }
  }

  if (!dt || isNaN(dt.getTime())) {
    return typeof timeStrOrFallback === 'string' && !/^\d{1,2}:\d{2}/.test(timeStrOrFallback)
      ? timeStrOrFallback
      : fallback;
  }

  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year}, ${hours}:${minutes}`;
}

/**
 * Formatta un intervallo di date nel formato:
 * gg-mm-aaaa → gg-mm-aaaa
 */
export function formatDateRangeIT(
  startDate?: string | number | Date | null,
  endDate?: string | number | Date | null,
  fallback: string = 'Non specificato'
): string {
  const s = formatDateIT(startDate, '');
  const e = formatDateIT(endDate, '');
  if (s && e) return `${s} → ${e}`;
  if (s) return s;
  if (e) return e;
  return fallback;
}

/**
 * Converte/formatta una data nel formato gg-mm-aaaa mantenendo compatibilità
 * completa con la signature esistente di formatDate(dateStr?: string | null): string
 */
export function formatDate(
  dateStr?: string | number | Date | { seconds?: number; nanoseconds?: number; toDate?: () => Date } | null,
  fallback: string = ''
): string {
  return formatDateIT(dateStr, fallback);
}

/**
 * Normalizza qualsiasi rappresentazione di data/timestamp in un valore numerico epoch (millisecondi).
 * Gestisce in modo sicuro:
 * - timestamp numerico (es. Date.now(), 1729341234567, timestamp in secondi)
 * - stringa ISO o data testuale (es. "2026-11-28T10:00:00.000Z", "2026-11-28", "28-11-2026")
 * - istanza Date nativa
 * - Firebase Timestamp (con metodo .toDate() o proprietà seconds / nanoseconds / _seconds)
 * - valori null, undefined, assenti o malformati (ritorna 0 come fallback senza inventare date)
 */
export function normalizeTimestamp(val?: any): number {
  if (val === null || val === undefined || val === '') {
    return 0;
  }

  // 1. Numero (epoch ms o epoch secondi)
  if (typeof val === 'number') {
    if (!isFinite(val) || val <= 0) return 0;
    if (val < 10000000000) {
      return Math.floor(val * 1000);
    }
    return Math.floor(val);
  }

  // 2. Oggetto Date nativo
  if (val instanceof Date) {
    const t = val.getTime();
    return isNaN(t) || t <= 0 ? 0 : t;
  }

  // 3. Oggetto Firebase Timestamp (ha toDate() o seconds / _seconds)
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          return d.getTime();
        }
      } catch {
        // ignora
      }
    }
    const secs = typeof val.seconds === 'number' ? val.seconds : (typeof val._seconds === 'number' ? val._seconds : null);
    if (secs !== null && isFinite(secs) && secs > 0) {
      const nanos = typeof val.nanoseconds === 'number' ? val.nanoseconds : (typeof val._nanoseconds === 'number' ? val._nanoseconds : 0);
      return Math.floor(secs * 1000 + nanos / 1000000);
    }
  }

  // 4. Stringa (ISO, numerica o testuale)
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return 0;

    // Se è una stringa interamente numerica (es. "1729341234567")
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (isFinite(num) && num > 0) {
        if (num < 10000000000) return Math.floor(num * 1000);
        return Math.floor(num);
      }
    }

    // Se è una data gg-mm-aaaa o gg/mm/aaaa
    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split(/[-/]/).map(Number);
      const dt = new Date(y, m - 1, d);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }

    // Prova parsing Date standard (ISO 8601 o formati supportati)
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

/**
 * Estrae una data canonica YYYY-MM-DD da qualsiasi input valido (stringa, number, Date, Firebase Timestamp).
 * Non solleva mai eccezioni e non presuppone che l'input sia una stringa.
 * Ritorna undefined se il valore è assente o non rappresenta una data valida.
 */
export function normalizeDateToISO(val?: any): string | undefined {
  if (val === null || val === undefined || val === '') {
    return undefined;
  }

  // 1. Stringa
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    // Già YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // Inizia con YYYY-MM-DD (es. ISO "2026-11-28T14:30:00Z" o "2026-11-28 10:00")
    if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) {
      return trimmed.split(/[T\s]/)[0];
    }

    // gg-mm-aaaa o gg/mm/aaaa
    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split(/[-/]/);
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Stringa numerica (epoch ms)
    if (/^\d{10,}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (isFinite(num) && num > 0) {
        const d = new Date(num < 10000000000 ? num * 1000 : num);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
      }
    }

    // Altra stringa data valida
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    return undefined;
  }

  // 2. Numero (timestamp epoch)
  if (typeof val === 'number') {
    if (!isFinite(val) || val <= 0) return undefined;
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return undefined;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 3. Oggetto Date nativo
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return undefined;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 4. Firebase Timestamp
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
      } catch {
        // ignora
      }
    }
    const secs = typeof val.seconds === 'number' ? val.seconds : (typeof val._seconds === 'number' ? val._seconds : null);
    if (secs !== null && isFinite(secs) && secs > 0) {
      const d = new Date(secs * 1000);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  return undefined;
}
