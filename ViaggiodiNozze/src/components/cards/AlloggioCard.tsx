import { useState } from 'react';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onEdit: () => void;
  onDelete: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onDelete }: AlloggioCardProps) {
  const { canEdit } = useDeviceRole();
  const [copied, setCopied] = useState(false);

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

  const mapTarget = accommodation.address || accommodation.location;

  return (
    <div className="bg-white rounded-2xl border border-indigo-100 p-3.5 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
      {/* Header a riga singola */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-50/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center text-xs shrink-0">
            🛏️
          </span>
          <span className="text-xs font-bold text-slate-800 tracking-tight truncate">
            Pernottamento
          </span>
          <span className="text-[10px] text-slate-400 font-medium shrink-0">
            • {formatDate(accommodation.checkIn)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100/70">
            Check-in {accommodation.checkInTime || '14:00'}
          </span>
          {canEdit && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                type="button"
                onClick={onEdit}
                title="Modifica alloggio"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Elimina alloggio"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Corpo Centrale Compatto (Flex Orizzontale) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800 leading-snug truncate">
              {accommodation.name}
            </h3>
            {accommodation.copilota && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0">
                🧭 Co-pilota
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5 flex items-center gap-1">
            <span className="text-slate-400">📍</span>
            <span className="truncate">
              {accommodation.address || accommodation.location || 'Indirizzo registrato'}
            </span>
          </p>
        </div>

        {/* Pulsante pillola compatta Maps sulla stessa riga a destra */}
        {mapTarget && (
          <a
            href={resolveMapUrl(mapTarget)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors active:scale-95 border border-indigo-100"
          >
            <span>📍 Maps ↗</span>
          </a>
        )}
      </div>

      {/* Info extra condensata se presente codice prenotazione, tel o note */}
      {(accommodation.bookingCode || accommodation.phone || accommodation.notes) && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-2 flex-wrap">
            {accommodation.bookingCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copia codice prenotazione"
                className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-slate-700 hover:border-purple-300 hover:text-purple-700 transition-all cursor-pointer active:scale-95"
              >
                <span>{copied ? '✓ Copiato!' : `Cod: ${accommodation.bookingCode}`}</span>
              </button>
            )}
            {accommodation.phone && (
              <a
                href={`tel:${accommodation.phone}`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-800 transition-colors"
              >
                <span>📞 {accommodation.phone}</span>
              </a>
            )}
          </div>

          {accommodation.bookingUrl && (
            <a
              href={accommodation.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 transition-colors ml-auto"
            >
              Prenotazione ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
