import type { Attivita } from '../../types';
import Badge from '../common/Badge';

interface AttivitaCardProps {
  activity: Attivita;
  onEdit: () => void;
  onDelete: () => void;
}

export default function AttivitaCard({ activity, onEdit, onDelete }: AttivitaCardProps) {
  const categoryLabels = {
    visita: 'Visita',
    cibo: 'Ristorante',
    relax: 'Relax',
    natura: 'Natura',
    cultura: 'Cultura',
    shopping: 'Shopping',
    altro: 'Altro'
  };

  const statusVariant = {
    pianificata: 'amber',
    completata: 'emerald',
    annullata: 'rose'
  }[activity.status] as 'amber' | 'emerald' | 'rose';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700/80 transition-all">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {activity.time && (
              <span className="text-[11px] font-mono font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                {activity.time}
              </span>
            )}
            <Badge label={categoryLabels[activity.category] || activity.category} variant="slate" />
            <Badge label={activity.status} variant={statusVariant} />
            {activity.duration && (
              <span className="text-[11px] text-slate-400">⏱️ {activity.duration}</span>
            )}
          </div>

          <h4 className="text-sm font-bold text-slate-100 leading-snug">
            {activity.title}
          </h4>

          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <span>{activity.location}</span>
          </p>

          {activity.notes && (
            <p className="text-xs text-slate-400/90 mt-1.5 leading-relaxed">
              {activity.notes}
            </p>
          )}

          {activity.link && (
            <a
              href={activity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 mt-2 transition-colors"
            >
              <span>Vedi riferimento online</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            title="Modifica attività"
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Elimina attività"
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
