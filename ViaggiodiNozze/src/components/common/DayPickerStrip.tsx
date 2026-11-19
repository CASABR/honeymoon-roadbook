import { useEffect, useRef } from 'react';
import { TRIP_DAYS, type TripDayItem, generateTripDays, calculateEarliestTripDate } from '../../utils/tripDates';
import { useHorizontalScrollCue } from '../../hooks/useHorizontalScrollCue';

interface DayPickerStripProps {
  selectedDate: string | 'tutte';
  onSelectDate: (date: string | 'tutte') => void;
  /** Opzionale: lista personalizzata dei giorni calcolati dinamicamente */
  tripDays?: TripDayItem[];
  days?: TripDayItem[];
  /** Opzionale: conteggio elementi per data { 'YYYY-MM-DD': number } */
  itemCounts?: Record<string, number>;
  totalCount?: number;
}

export default function DayPickerStrip({
  selectedDate,
  onSelectDate,
  tripDays: propTripDays,
  days: propDays,
  itemCounts,
  totalCount
}: DayPickerStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedBtnRef = useRef<HTMLButtonElement>(null);

  // Se non fornito, calcola dinamicamente l'inizio considerando le date presenti in itemCounts
  const dynamicDays = propTripDays || propDays || (itemCounts ? generateTripDays(calculateEarliestTripDate(Object.keys(itemCounts))) : TRIP_DAYS);
  const { canScrollLeft, canScrollRight, scrollByDirection } = useHorizontalScrollCue(containerRef, dynamicDays.length);

  // Auto-centratura automatica dello scroll sul giorno selezionato
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedDate !== 'tutte' && selectedBtnRef.current && containerRef.current) {
        const container = containerRef.current;
        const element = selectedBtnRef.current;
        const elementOffset = element.offsetLeft;
        const elementWidth = element.offsetWidth;
        const containerWidth = container.offsetWidth;
        
        const scrollPosition = elementOffset - (containerWidth / 2) + (elementWidth / 2);
        container.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth'
        });
      } else if (selectedDate === 'tutte' && containerRef.current) {
        containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedDate, dynamicDays]);

  return (
    <div className="flex items-center gap-1.5 -mx-1 mb-4">
      {/* Freccia sinistra esterna al tracciato: visibile solo se si puo' scorrere indietro, senza coprire TUTTI */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByDirection('left', 260)}
          className="hidden md:flex shrink-0 mb-2 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-sm items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Scorri giorni indietro"
          title="Scorri indietro"
        >
          <span className="text-[11px] font-bold leading-none">◀</span>
        </button>
      )}

      <div className="relative flex-1 min-w-0">
        {canScrollLeft && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-2 w-4 bg-gradient-to-r from-[#F8F7F3] dark:from-slate-950 to-transparent z-10"
            aria-hidden="true"
          />
        )}
        <div
          ref={containerRef}
          className="flex gap-2 overflow-x-auto pb-2 pt-0.5 px-1 scrollbar-none snap-x items-center scroll-smooth"
        >
        {/* Chip compatta 'Tutti' fissa a sinistra come UNICO primo elemento */}
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

        {/* Card/Pill dei Singoli Giorni subito dopo 'Tutti' */}
        {dynamicDays.map((day: TripDayItem) => {
          const isSelected = selectedDate === day.dateStr;
          const count = itemCounts ? itemCounts[day.dateStr] || 0 : undefined;
          const hasItems = typeof count === 'number' && count > 0;

          return (
            <button
              key={day.dateStr}
              ref={isSelected ? selectedBtnRef : undefined}
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
        {canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-2 w-5 bg-gradient-to-l from-[#F8F7F3] dark:from-slate-950 to-transparent z-10"
            aria-hidden="true"
          />
        )}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByDirection('right', 260)}
          className="hidden md:flex shrink-0 mb-2 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-sm items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Scorri giorni avanti"
          title="Scorri avanti"
        >
          <span className="text-[11px] font-bold leading-none">▶</span>
        </button>
      )}
    </div>
  );
}
