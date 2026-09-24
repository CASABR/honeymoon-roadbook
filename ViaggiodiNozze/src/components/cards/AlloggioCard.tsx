import { useState } from 'react';
import type { Alloggio } from '../../types';
import Badge from '../common/Badge';
import { resolveMapUrl } from '../../utils/mapsHelper';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onEdit: () => void;
  onDelete: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onDelete }: AlloggioCardProps) {
  const [copied, setCopied] = useState(false);

  const statusLabels = {
    da_prenotare: 'Da Prenotare',
    prenotato: 'Prenotato',
    completato: 'Completato',
  };

  const statusVariant = {
    da_prenotare: 'amber',
    prenotato: 'purple',
    completato: 'emerald',
  }[accommodation.status] as 'amber' | 'purple' | 'emerald';

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  const handleCopyCode = async () => {
    if (!accommodation.bookingCode) return;
    try {
      await navigator.clipboard.writeText(accommodation.bookingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silenzioso
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4 hover:border-slate-600/70 transition-all">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 leading-snug truncate">
                {accommodation.name}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge label={statusLabels[accommodation.status]} variant={statusVariant} />
                {accommodation.copilota && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <span>🧭</span>
                    <span>Co-pilota</span>
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-mono">
                  {formatDate(accommodation.checkIn)} → {formatDate(accommodation.checkOut)}
                </span>
              </div>
            </div>
            {/* Azioni */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onEdit}
                title="Modifica alloggio"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors cursor-pointer"
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

          {/* Location → Google Maps */}
          {accommodation.location && (
            <a
              href={resolveMapUrl(accommodation.location)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-purple-300 transition-colors group"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{accommodation.location}</span>
            </a>
          )}

          {/* Indirizzo → Google Maps */}
          {accommodation.address && (
            <a
              href={resolveMapUrl(accommodation.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1 text-xs text-slate-400 hover:text-purple-300 transition-colors group mt-1"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="leading-snug">{accommodation.address}</span>
            </a>
          )}

          {/* Codice prenotazione + telefono */}
          {(accommodation.bookingCode || accommodation.phone) && (
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {accommodation.bookingCode && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  title="Copia codice prenotazione"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-700/60 text-slate-300 hover:border-purple-500/40 hover:text-purple-300 transition-all cursor-pointer active:scale-95"
                >
                  <span>{copied ? '✓ Copiato!' : `Cod: ${accommodation.bookingCode}`}</span>
                  {!copied && (
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              )}
              {accommodation.phone && (
                <a
                  href={`tel:${accommodation.phone}`}
                  className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{accommodation.phone}</span>
                </a>
              )}
            </div>
          )}

          {/* Note */}
          {accommodation.notes && (
            <p className="text-xs text-slate-400/90 mt-2.5 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 leading-relaxed">
              {accommodation.notes}
            </p>
          )}

          {/* Link prenotazione */}
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
      </div>
    </div>
  );
}
