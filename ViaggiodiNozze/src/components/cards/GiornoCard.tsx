import type { Giorno } from '../../types';
import Badge from '../common/Badge';

interface GiornoCardProps {
  day: Giorno;
  activityCount: number;
  isSelected?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddActivity: () => void;
}

export default function GiornoCard({
  day,
  activityCount,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAddActivity
}: GiornoCardProps) {
  // Format date nicely
  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div 
      className={"rounded-3xl border transition-all p-4.5 bg-white shadow-sm " + (isSelected ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200/80 hover:border-slate-300')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 cursor-pointer" onClick={onSelect}>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-mono">
              {formatDate(day.date)}
            </span>
            <Badge label={activityCount === 1 ? '1 attività' : activityCount + ' attività'} variant={activityCount > 0 ? 'amber' : 'slate'} />
          </div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
            {day.title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{day.location}</span>
          </p>
          {day.notes && (
            <p className="text-xs text-slate-600 mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 italic">
              {day.notes}
            </p>
          )}
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            title="Modifica giorno"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Elimina giorno"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onSelect}
          className="text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>{isSelected ? 'Nascondi attività' : 'Vedi attività del giorno'}</span>
          <svg className={"w-3.5 h-3.5 transition-transform " + (isSelected ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onAddActivity}
          className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Aggiungi attività</span>
        </button>
      </div>
    </div>
  );
}
