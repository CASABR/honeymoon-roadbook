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
  // Se ci sono date salvate (es. 28 Novembre 2026 o anteriori), individua la minima assoluta
  const validDates = dates.filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (validDates.length > 0) {
    validDates.sort();
    // Non retrocedere arbitrariamente ad anni passati, ma se la data è del viaggio (fine 2026 / inizio 2027) prendi la prima
    const tripStartCandidate = validDates.find(d => d >= '2026-11-01') || validDates[0];
    if (tripStartCandidate && tripStartCandidate <= '2026-11-29') {
      return tripStartCandidate;
    }
  }

  const DEFAULT_START = '2026-11-28';
  let minDate = DEFAULT_START;

  for (const d of validDates) {
    if (d < minDate) {
      minDate = d;
    }
  }

  return minDate;
}

/**
 * Trova la data massima tra una serie di stringhe data (YYYY-MM-DD).
 * Se nessuna data è superiore al 10 Gennaio 2027, usa '2027-01-10' come default.
 */
export function calculateLatestTripDate(dates: (string | undefined | null)[]): string {
  const DEFAULT_END = '2027-01-10';
  let maxDate = DEFAULT_END;

  for (const d of dates) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (d > maxDate) {
        maxDate = d;
      }
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
 * Calcola l'intervallo reale dinamico del viaggio interrogando direttamente IndexedDB.
 * Raccoglie tutte le date presenti in giorni, attività, tappe, trasporti, ristoranti, shopping e alloggi.
 */
export async function getTripDateRange(): Promise<TripDateRange> {
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

    const allDates: (string | undefined | null)[] = [
      ...days.map(d => d.date),
      ...activities.map(a => a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : undefined)),
      ...transports.map(t => t.date),
      ...transports.map(t => t.dropoffDate),
      ...tappe.map(t => t.data || t.date),
      ...ristoranti.map(r => r.data || r.date),
      ...shopping.map(s => s.data || s.date),
      ...accs.map(a => a.checkIn),
      ...accs.map(a => a.checkOut)
    ];

    const minTripDate = calculateEarliestTripDate(allDates);
    const maxTripDate = calculateLatestTripDate(allDates);
    const tripDays = generateTripDays(minTripDate, maxTripDate);

    return { minTripDate, maxTripDate, tripDays };
  } catch (err) {
    console.error('[getTripDateRange] Errore calcolo range viaggio:', err);
    const minTripDate = '2026-11-28';
    const maxTripDate = '2027-01-10';
    return { minTripDate, maxTripDate, tripDays: generateTripDays(minTripDate, maxTripDate) };
  }
}

export const TRIP_DAYS = generateTripDays();

