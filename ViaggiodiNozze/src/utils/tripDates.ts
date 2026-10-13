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

/**
 * Calcola l'intervallo reale dinamico del viaggio.
 * REGOLA:
 * - Per le date antecedenti alla data di inizio del viaggio (es. 2026-11-28),
 *   include il giorno SOLO ED ESCLUSIVAMENTE se per quella specifica data esiste
 *   almeno 1 elemento registrato in IndexedDB (trasporti, tappe, attività, alloggi, ristoranti, shopping).
 * - Per l'intervallo ufficiale di viaggio [startDate, endDate], genera tutti i giorni consecutivi.
 */
export async function getTripDateRange(extraDates: (string | undefined | null)[] = []): Promise<TripDateRange> {
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

    return { minTripDate, maxTripDate, tripDays };
  } catch (err) {
    console.error('[getTripDateRange] Errore calcolo range viaggio:', err);
    return { minTripDate: DEFAULT_TRIP_START_DATE, maxTripDate: DEFAULT_TRIP_END_DATE, tripDays: generateTripDays() };
  }
}

export const TRIP_DAYS = generateTripDays();

/**
 * Converte una data YYYY-MM-DD nel formato europeo standard DD-MM-YYYY
 */
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  // Se ha l'orario associato YYYY-MM-DDTHH:mm, prendiamo solo la data
  const dateOnly = dateStr.split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateStr; // Non formattabile
  const [y, m, d] = dateOnly.split('-');
  return `${d}-${m}-${y}`;
}
