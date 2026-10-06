import type { Tappa } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TappaCard({ tappa, onEdit }: TappaCardProps) {
  const mapTarget = tappa.mapsUrl || tappa.titolo;

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storageService.updateTappa(tappa.id, { completed: !tappa.completed });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div onClick={onEdit} className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-[#FFFFFF] dark:bg-[#1E293B] border-[#ECEAE5] dark:border-slate-700">
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs bg-rose-50 text-rose-700 border border-rose-100">
            📍
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Tappa
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          
        </div>
      </div>

      <div>
        <div className="flex items-start gap-2.5 flex-wrap">
          <button
    type="button"
    onClick={handleToggleComplete}
    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${
      tappa.completed
        ? 'bg-[#E6F4EA] text-[#39734A] dark:bg-[#143521] dark:text-[#4ADE80] border-transparent dark:border-[#235835]'
        : 'bg-[#FFFDF2] text-[#172033] border-[#FFC857]/40 dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
    }`}
  >
    {tappa.completed ? '✓ Confermato' : 'Da Saldare'}
  </button>
            <h3 className={`text-sm sm:text-base font-extrabold text-[#172033] dark:text-slate-50 leading-snug pt-0.5 ${tappa.completed ? 'opacity-75' : ''}`}>
            {tappa.titolo}
          </h3>
          {tappa.copilota && (
            <span className="text-[9px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded-full border border-rose-200 shrink-0 mt-1">
              🧭 Co-pilota
            </span>
          )}
        </div>
      </div>

      {/* Barra inferiore: Maps e Dettagli */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div /> {/* Spacer for flex-between */}

        {/* Pulsanti destra */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs"
            >
              <span className="text-[10px]">📍</span> 
              <span>Maps</span>
            </a>
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation();
              onEdit();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs active:scale-95"
          >
            <span className="text-[10px]">ℹ️</span>
            <span>Dettagli</span>
          </button>
        </div>
      </div>
    </div>
  );
}
