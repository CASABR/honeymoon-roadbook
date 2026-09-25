export interface TripDayItem {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  dayOfMonth: string;
  monthShort: string;
  dayNameShort: string;
  labelFormatted: string; // es. "29 Nov"
}

export function generateTripDays(startDateStr?: string): TripDayItem[] {
  const days: TripDayItem[] = [];
  
  // Se specificata una data d'inizio valida (es. "2026-11-28"), usala; altrimenti fallback al 29 Novembre 2026
  let start: Date;
  if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
    const [y, m, d] = startDateStr.split('-').map(Number);
    start = new Date(y, m - 1, d);
  } else {
    start = new Date(2026, 10, 29); // 29 Novembre 2026 default
  }

  const end = new Date(2027, 0, 10); // 10 Gennaio 2027

  // Nel caso limite in cui la data sia successiva alla fine, limita alla fine
  if (start > end) {
    start = new Date(2026, 10, 29);
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
  const DEFAULT_START = '2026-11-29';
  let minDate = DEFAULT_START;

  for (const d of dates) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (d < minDate) {
        minDate = d;
      }
    }
  }

  return minDate;
}

export const TRIP_DAYS = generateTripDays();

