import type { Alloggio } from '../../types';
import Badge from '../common/Badge';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onEdit: () => void;
  onDelete: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onDelete }: AlloggioCardProps) {
  const statusLabels = {
    da_prenotare: 'Da Prenotare',
    prenotato: 'Prenotato',
    completato: 'Completato'
  };

  const statusVariant = {
    da_prenotare: 'amber',
    prenotato: 'purple',
    completato: 'emerald'
  }[accommodation.status] as 'amber' | 'purple' | 'emerald';

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4.5 hover:border-purple-500/40 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
              {formatDate(accommodation.checkIn)} → {formatDate(accommodation.checkOut)}
            </span>
            <Badge label={statusLabels[accommodation.status]} variant={statusVariant} />
          </div>

          <h3 className="text-base font-bold text-slate-100 tracking-tight leading-snug">
            {accommodation.name}
          </h3>

          <p className="text-xs font-medium text-purple-300/90 mt-0.5 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <span>{accommodation.location}</span>
          </p>

          <p className="text-xs text-slate-400 mt-1.5 flex items-start gap-1 leading-relaxed">
            <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>{accommodation.address}</span>
          </p>

          {(accommodation.bookingCode || accommodation.phone) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
              {accommodation.bookingCode && (
                <span className="font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                  Cod: {accommodation.bookingCode}
                </span>
              )}
              {accommodation.phone && (
                <a href={"tel:" + accommodation.phone} className="text-purple-400 hover:underline">
                  📞 {accommodation.phone}
                </a>
              )}
            </div>
          )}

          {accommodation.notes && (
            <p className="text-xs text-slate-400/90 mt-2 p-2 rounded-lg bg-slate-800/50 border border-slate-800/80">
              {accommodation.notes}
            </p>
          )}

          {accommodation.bookingUrl && (
            <a
              href={accommodation.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-3 font-medium transition-colors"
            >
              <span>Apri prenotazione online</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            title="Modifica alloggio"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Elimina alloggio"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
