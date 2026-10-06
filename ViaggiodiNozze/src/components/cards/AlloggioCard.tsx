import React, { useState } from 'react';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onEdit: () => void;
  onDelete: () => void;
}

export default function AlloggioCard({ accommodation, onEdit }: AlloggioCardProps) {
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

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = { ...accommodation, completed: !accommodation.completed };
      await storageService.saveAccommodation(updated);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div onClick={onEdit} className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-[#FFFFFF] dark:bg-[#1E293B] border-[#ECEAE5] dark:border-slate-700">
      {/* Header a riga singola */}
      <div className="flex items-center justify-between pb-2 mb-2 ">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center text-xs shrink-0">
            🛏️
          </span>
          <span className="text-xs font-bold text-[#172033] dark:text-slate-50 tracking-tight truncate">
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
          
        </div>
      </div>

      {/* Corpo Centrale Compatto (Flex Orizzontale) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5 flex-wrap">
            <button
    type="button"
    onClick={handleToggleComplete}
    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${
      accommodation.completed
        ? 'bg-[#E6F4EA] text-[#39734A] dark:bg-[#143521] dark:text-[#4ADE80] border-transparent dark:border-[#235835]'
        : 'bg-[#FFFDF2] text-[#172033] border-[#FFC857]/40 dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
    }`}
  >
    {accommodation.completed ? '✓ Confermato' : 'Da Saldare'}
  </button>
            <h3 className={`text-sm font-semibold text-[#172033] dark:text-slate-50 leading-snug truncate pt-0.5 ${accommodation.completed ? 'opacity-75' : ''}`}>
              {accommodation.name}
            </h3>
            {accommodation.copilota && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0 mt-1">
                🧭 Co-pilota
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-normal truncate mt-0.5 flex items-center gap-1">
            <span className="text-slate-400">📍</span>
            <span className="truncate">
              {accommodation.address || accommodation.location || 'Indirizzo registrato'}
            </span>
          </p>
        </div>

      </div>

      {/* Info extra condensata (Telefono / Codice) */}
      {(accommodation.bookingCode || accommodation.phone) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
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
      )}

      {/* Barra inferiore: Prezzo, Dettagli, Maps */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        {/* Prezzo */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(!accommodation.cost || isNaN(parseFloat(accommodation.cost)) || parseFloat(accommodation.cost) === 0) ? (
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
              Costo non inserito
            </span>
          ) : (
            <span className="text-[11px] font-bold text-[#172033] dark:text-slate-50 bg-slate-100 px-2.5 py-0.5 rounded-lg">
              {parseFloat(accommodation.cost).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
          {accommodation.paymentStatus === 'saldato' ? (
            <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              Saldato
            </span>
          ) : accommodation.cost && parseFloat(accommodation.cost) > 0 ? (
            <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              Da saldare
            </span>
          ) : null}
        </div>

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

          {accommodation.bookingUrl && (
            <a
              href={accommodation.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs"
            >
              <span className="text-[10px]">🔗</span> 
              <span>Link</span>
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
