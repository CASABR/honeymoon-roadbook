import type { Trasporto } from '../../types';
import Badge from '../common/Badge';

interface TrasportoCardProps {
  transport: Trasporto;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TrasportoCard({ transport, onEdit, onDelete }: TrasportoCardProps) {
  const typeIcons: Record<string, string> = {
    volo: '✈️',
    treno: '🚄',
    auto: '🚗',
    bus: '🚌',
    traghetto: '⛴️',
    transfer: '🚕',
    altro: '🧭'
  };

  const statusVariant = {
    pianificato: 'sky',
    prenotato: 'emerald',
    completato: 'slate',
    annullato: 'rose'
  }[transport.status] as 'sky' | 'emerald' | 'slate' | 'rose';

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4.5 hover:border-sky-500/40 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
              {typeIcons[transport.type] || '🧭'} {formatDate(transport.date)}
            </span>
            <Badge label={transport.status} variant={statusVariant} />
            {transport.carrier && (
              <span className="text-xs font-semibold text-slate-300">
                {transport.carrier}
              </span>
            )}
          </div>

          {/* Tratta: Partenza -> Arrivo */}
          <div className="flex items-center gap-2 my-2 text-sm font-bold text-slate-100 flex-wrap">
            <span>{transport.departureLocation}</span>
            <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span>{transport.arrivalLocation}</span>
          </div>

          {(transport.departureTime || transport.arrivalTime) && (
            <p className="text-xs font-mono text-slate-400 flex items-center gap-2 mb-1.5">
              <span>Partenza: <strong className="text-slate-200">{transport.departureTime || '--:--'}</strong></span>
              <span>•</span>
              <span>Arrivo: <strong className="text-slate-200">{transport.arrivalTime || '--:--'}</strong></span>
            </p>
          )}

          {transport.bookingCode && (
            <p className="text-xs text-slate-400 mt-1">
              Codice / Tratta: <span className="font-mono text-sky-300 font-semibold">{transport.bookingCode}</span>
            </p>
          )}

          {transport.notes && (
            <p className="text-xs text-slate-400/90 mt-2 p-2 rounded-lg bg-slate-800/50 border border-slate-800/80">
              {transport.notes}
            </p>
          )}

          {transport.ticketUrl && (
            <a
              href={transport.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 mt-2.5 font-medium transition-colors"
            >
              <span>Vedi biglietto / prenotazione</span>
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
            title="Modifica trasporto"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Elimina trasporto"
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
