import React from 'react';
import type { Ristorante } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';

interface RistoranteCardProps {
  ristorante: Ristorante;
  onEdit: () => void;
  onDelete: () => void;
}

export default function RistoranteCard({ ristorante, onEdit }: RistoranteCardProps) {
  const mapTarget = ristorante.indirizzo || ristorante.nome;

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storageService.updateRistorante(ristorante.id, { completed: !ristorante.completed });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div onClick={onEdit} className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-[#FFFFFF] dark:bg-[#1E293B] border-[#ECEAE5] dark:border-slate-700">
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs bg-emerald-50 text-emerald-700 border border-emerald-100">
            🍽️
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Ristorante
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
      ristorante.completed
        ? 'bg-[#E6F4EA] text-[#39734A] dark:bg-[#143521] dark:text-[#4ADE80] border-transparent dark:border-[#235835]'
        : 'bg-[#FFFDF2] text-[#172033] border-[#FFC857]/40 dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
    }`}
  >
    {ristorante.completed ? '✓ Confermato' : 'Da Saldare'}
  </button>
            <h3 className={`text-sm sm:text-base font-extrabold text-[#172033] dark:text-slate-50 leading-snug pt-0.5 ${ristorante.completed ? 'opacity-75' : ''}`}>
            {ristorante.nome}
          </h3>
          {(() => {
            const time = ristorante.orario || (ristorante as any).time;
            if (!time) {
              return (
                <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[11px] font-bold text-[#64748B] dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition mt-1">
                  ⏱️ Imposta orario
                </button>
              );
            }
            return (
              <span className="text-sm font-bold text-[#172033] dark:text-white bg-[#F0F7FF] dark:bg-[#1E293B] px-2.5 py-0.5 rounded-md border border-[#D8E8FC] dark:border-slate-700 mt-1">
                Ore {time}
              </span>
            );
          })()}
          {ristorante.copilota && (
            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0 mt-1">
              🧭 Co-pilota
            </span>
          )}
        </div>
        {mapTarget && (
          <p className="text-xs text-[#64748B] dark:text-slate-400 font-medium mt-1 truncate flex items-center gap-1">
            <span className="text-slate-400">📍</span>
            <span>{mapTarget}</span>
          </p>
        )}
      </div>

      {/* Info condensata (Telefono / Notes / Type) */}
      {(ristorante.telefono || ristorante.linkPrenotazione || ristorante.nota) && (
        <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px]">
          {ristorante.telefono && (
            <a
              href={`tel:${ristorante.telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <span>📞 {ristorante.telefono}</span>
            </a>
          )}
          {ristorante.linkPrenotazione && (
            <a
              href={ristorante.linkPrenotazione}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors ml-auto"
            >
              Prenotazione ↗
            </a>
          )}
        </div>
      )}

      {/* Barra inferiore: Prezzo, Dettagli, Maps */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        {/* Prezzo */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(!ristorante.budget || isNaN(parseFloat(ristorante.budget)) || parseFloat(ristorante.budget) === 0) ? (
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
              Budget non inserito
            </span>
          ) : (
            <span className="text-[11px] font-bold text-[#172033] dark:text-slate-50 bg-slate-100 px-2.5 py-0.5 rounded-lg">
              {parseFloat(ristorante.budget).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
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
