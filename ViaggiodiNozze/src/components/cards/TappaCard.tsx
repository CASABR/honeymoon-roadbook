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

export default function TappaCard({ tappa, onEdit, onDetail, onUpdate, variant = 'full' }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  useEffect(() => {
    const nextNotes = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [tappa]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const orario = tappa.orario || (tappa as any).time;
  const isCompact = variant === 'compact';

  const mapTarget = tappa.mapsUrl || tappa.indirizzo || tappa.titolo;
  const usefulNote = (tappa.nota || (tappa as any).notes || '').trim();

  return (
    <div
      onClick={onDetail || onEdit}
      className={`hounigo-panel cursor-pointer rounded-2xl hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700 ${
        isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'
      }`}
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-700 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200/80 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30 text-xs font-bold uppercase tracking-wider">
            <span>📍</span> Tappa
          </span>
          {(tappa as any).sottocategoria && (tappa as any).sottocategoria !== 'Tappa' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-xs font-bold">
              <span>🏷️</span>
              <span>{(tappa as any).sottocategoria}</span>
            </span>
          )}
          {orario ? (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-xs font-bold border ${
              tappa.timeStatus === 'indicativo'
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                : 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600'
            }`}>
              ⏰ Ore {orario}{tappa.timeStatus === 'indicativo' ? ' · indicativo' : ''}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200 transition-colors cursor-pointer"
              title="Inserisci orario per questa tappa"
            >
              ⏰ {tappa.sottocategoria === 'Sosta fotografica' ? 'Orario libero' : '+ Orario'}
            </button>
          )}
          {tappa.data && !isCompact && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {formatDateIT(tappa.data)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
            hasCopilotNotes
              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
          }`}
          title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
        >
          <span>🧭</span>
          <span>Note</span>
        </button>
      </div>

      {/* BODY */}
      <div className="space-y-1.5">
        <h3 className="font-extrabold text-base sm:text-lg leading-snug tracking-tight text-slate-900 dark:text-white">
          {tappa.titolo}
        </h3>

        {tappa.indirizzo && (
          <p className="text-xs sm:text-[13px] font-medium leading-relaxed text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">📍</span>
            <span className="break-words">{tappa.indirizzo}</span>
          </p>
        )}

        {tappa.openingHours && tappa.openingHours.verifiedAt && tappa.openingHours.status !== 'unverified' && (
          <div className="pt-0.5">
            <OpeningHoursBadge info={tappa.openingHours} date={tappa.data || tappa.date} time={orario} />
          </div>
        )}

        {usefulNote && (
          <div className="mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-2">
            {usefulNote}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="mt-0.5 pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
          {tappa.data ? formatDateIT(tappa.data) : 'Tappa itinerario'}
        </span>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
              title="Apri su Google Maps"
            >
              <span>📍</span>
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
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
