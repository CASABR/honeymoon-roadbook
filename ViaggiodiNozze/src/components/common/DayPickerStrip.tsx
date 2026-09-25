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
        {/* Chip compatta 'Tutti' fissa a sinistra */}
        <button
          type="button"
          onClick={() => onSelectDate('tutte')}
          className={`snap-start shrink-0 flex flex-col items-center justify-center w-12 py-2 px-1 rounded-2xl transition-all duration-200 cursor-pointer ${
            selectedDate === 'tutte'
              ? 'bg-slate-900 text-white font-bold shadow-md shadow-slate-900/20 scale-105'
              : 'bg-white border border-slate-200/80 text-slate-500 hover:border-slate-300 hover:text-slate-800 shadow-2xs'
          }`}
        >
          <span className={`text-[10px] uppercase font-medium tracking-tight ${selectedDate === 'tutte' ? 'text-slate-300' : 'text-slate-400'}`}>
            TUTTI
          </span>
          <span className="text-sm font-extrabold my-0.5 leading-none">
            {typeof totalCount === 'number' ? totalCount : '∞'}
          </span>
          <span className={`text-[9px] font-semibold px-1 rounded-full ${selectedDate === 'tutte' ? 'text-amber-300' : 'text-slate-400'}`}>
            ALL
          </span>
        </button>

        {/* Card/Pill dei Singoli Giorni (layout compatto verticale a densità elevata) */}
        {TRIP_DAYS.map((day: TripDayItem) => {
          const isSelected = selectedDate === day.dateStr;
          const count = itemCounts ? itemCounts[day.dateStr] || 0 : undefined;
          const hasItems = typeof count === 'number' && count > 0;

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => onSelectDate(day.dateStr)}
              className={`snap-start shrink-0 w-11 sm:w-12 flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white font-bold shadow-md shadow-slate-900/20 scale-105'
                  : 'bg-white border border-slate-200/80 text-slate-500 hover:border-slate-300 hover:text-slate-800 shadow-2xs'
              }`}
            >
              {/* Sopra: giorno della settimana abbreviato */}
              <span className={`text-[10px] uppercase font-medium tracking-tight ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                {day.dayNameShort}
              </span>

              {/* Centro: numero del giorno grande e leggibile */}
              <span className="text-sm font-extrabold my-0.5 leading-none">
                {day.dayOfMonth}
              </span>

              {/* Sotto: micro-indicatore del mese con puntino se sono presenti elementi */}
              <div className="flex items-center gap-0.5">
                <span className={`text-[9px] font-medium leading-none ${isSelected ? 'text-rose-300 font-semibold' : 'text-slate-400'}`}>
                  {day.monthShort}
                </span>
                {hasItems && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-amber-400 ring-1 ring-white/50' : 'bg-amber-500'
                    }`}
                    title={`${count} elementi`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
