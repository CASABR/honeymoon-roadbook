import { TRIP_DAYS, type TripDayItem } from '../../utils/tripDates';

interface DayPickerStripProps {
  selectedDate: string | 'tutte';
  onSelectDate: (date: string | 'tutte') => void;
  /** Opzionale: conteggio elementi per data { 'YYYY-MM-DD': number } */
  itemCounts?: Record<string, number>;
  totalCount?: number;
}

export default function DayPickerStrip({
  selectedDate,
  onSelectDate,
  itemCounts,
  totalCount
}: DayPickerStripProps) {
  return (
    <div className="-mx-1 mb-4">
      <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-none snap-x items-center">
        {/* Chip 'Tutti i giorni' DEFAULT fisso a sinistra */}
        <button
          type="button"
          onClick={() => onSelectDate('tutte')}
          className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
            selectedDate === 'tutte'
              ? 'bg-slate-900 text-white font-semibold shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-2xs hover:border-slate-300'
          }`}
        >
          <span>Tutti i giorni</span>
          {typeof totalCount === 'number' && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                selectedDate === 'tutte'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {totalCount}
            </span>
          )}
        </button>

        {/* Elenco date del viaggio (29 Nov 2026 -> 10 Gen 2027) */}
        {TRIP_DAYS.map((day: TripDayItem) => {
          const isSelected = selectedDate === day.dateStr;
          const count = itemCounts ? itemCounts[day.dateStr] || 0 : undefined;

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => onSelectDate(day.dateStr)}
              className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white font-semibold shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-2xs hover:border-slate-300'
              }`}
            >
              <span className="text-[10px] font-normal opacity-75">
                {day.dayNameShort}
              </span>
              <span>{day.labelFormatted}</span>
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
