export interface TripDayItem {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  dayOfMonth: string;
  monthShort: string;
  dayNameShort: string;
  labelFormatted: string; // es. "29 Nov"
}

export function generateTripDays(): TripDayItem[] {
  const days: TripDayItem[] = [];
  const start = new Date(2026, 10, 29); // 29 Novembre 2026
  const end = new Date(2027, 0, 10); // 10 Gennaio 2027

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const monthNames = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  let current = new Date(start);
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

export const TRIP_DAYS = generateTripDays();
