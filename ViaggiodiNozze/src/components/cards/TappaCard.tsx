import type { Tappa } from '../../types';
import { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { formatDateIT } from '../../utils/tripDates';
import OpeningHoursBadge from '../common/OpeningHoursBadge';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Tappa) => void;
  variant?: 'compact' | 'full';
}

export default function TappaCard({ tappa, onEdit, onDetail, onUpdate, variant }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  useEffect(() => {
    const nextNotes = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [tappa]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const orario = tappa.orario || (tappa as any).time;

  const mapTarget = tappa.mapsUrl || tappa.titolo;

  if (variant === 'compact') {
    return (
      <>
        <div
          onClick={onDetail || onEdit}
          className="w-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#172033] hover:border-slate-300 dark:hover:border-slate-700 p-3 sm:p-3.5 transition-all cursor-pointer shadow-xs hover:shadow-sm"
        >
          <div className="flex items-start gap-3">
            {/* Colonna Orario */}
            <div className="shrink-0 text-left min-w-[56px] pt-0.5">
              <span className="font-mono text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tabular-nums block">
                {orario || '—:—'}
              </span>
              {(tappa as any).sottocategoria && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block truncate max-w-[56px]">
                  {(tappa as any).sottocategoria}
                </span>
              )}
            </div>

            {/* Divisore */}
            <div className="w-px self-stretch bg-slate-100 dark:bg-slate-800 shrink-0" />

            {/* Contenuto */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="text-sm shrink-0">📍</span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {tappa.titolo}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-xs">
                  {hasCopilotNotes && <span title="Note Copilota">🧭</span>}
                </div>
              </div>

              {tappa.indirizzo && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
                  <span>📍</span>
                  <span className="truncate">{tappa.indirizzo}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <UniversalCopilotaModal
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          noteCopilota={copilotNotes}
          title={`Note Copilota · ${tappa.titolo}`}
          onSave={async (notes: string) => {
            setCopilotNotes(notes);
            await storageService.updateTappa(tappa.id, { noteCopilota: notes });
            onUpdate?.({ ...tappa, noteCopilota: notes } as any);
          }}
        />
      </>
    );
  }

  return (
    <div 
      onClick={onDetail || onEdit} 
      className="hounigo-panel cursor-pointer rounded-2xl p-3.5 sm:p-4 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-100 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20 text-[11px] font-semibold uppercase tracking-wider">
            <span className="text-sm">📍</span> Tappa
          </span>
          {(tappa as any).sottocategoria && (tappa as any).sottocategoria !== 'Tappa' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-[10px] font-bold tracking-wide">
              <span>🏷️</span>
              <span>{(tappa as any).sottocategoria}</span>
            </span>
          )}
          {orario ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-medium ${
              tappa.timeStatus === 'indicativo'
                ? 'bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }`}>
              ⏰ Ore {orario} {tappa.timeStatus === 'indicativo' ? '· indicativo' : ''}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200 transition-colors cursor-pointer"
              title="Inserisci orario per questa tappa"
            >
              ⏰ {tappa.sottocategoria === 'Sosta fotografica' ? 'Orario non specificato' : '+ Orario'}
            </button>
          )}
          {tappa.data && (
            <div className="flex flex-col ml-1">
              <span className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                {formatDateIT(tappa.data)}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-2xs ${
              hasCopilotNotes
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 opacity-60 hover:opacity-100'
            }`}
            title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
          >
            <span className="text-sm">🧭</span>
          </button>
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="font-semibold text-base leading-snug tracking-tight text-slate-900 dark:text-white">
            {tappa.titolo}
          </h3>
        </div>
        {tappa.indirizzo && (
          <p className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300 truncate mt-1 flex items-center gap-1">
            <span>📍</span>
            <span className="truncate">{tappa.indirizzo}</span>
          </p>
        )}
        <div className="mt-2">
          <OpeningHoursBadge info={tappa.openingHours} date={tappa.data || tappa.date} time={orario} />
        </div>
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div /> {/* Spacer for flex-between */}

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              <span className="text-[10px]">📍</span> 
              <span>Maps</span>
            </a>
          )}
        </div>
      </div>
    
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={tappa.titolo || 'Dettaglio'}
        noteCopilota={copilotNotes}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = { ...tappa, noteCopilota: clean, updatedAt: Date.now() } as any;
            await storageService.saveTappa(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}
