import type { Tappa } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Tappa) => void;
}

export default function TappaCard({ tappa, onEdit, onDetail, onUpdate }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = (tappa as any).noteCopilota || (tappa as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  const orario = tappa.orario || (tappa as any).time;

  const mapTarget = tappa.mapsUrl || tappa.titolo;

  return (
    <div 
      onClick={onDetail || onEdit} 
      className="cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-100 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20 text-xs font-medium">
            <span className="text-sm">📍</span> Tappa
          </span>
          {orario ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-xs font-medium font-mono">
              ⏰ {orario}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200 transition-colors cursor-pointer"
              title="Inserisci orario per questa tappa"
            >
              ⏰ + Orario
            </button>
          )}
          {tappa.data && (
            <div className="flex flex-col ml-1">
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {tappa.data}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors shadow-2xs ${
              hasCopilotNotes
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Note Copilota"
          >
            <span>🧭</span> Co-pilota
          </button>
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="font-semibold text-base text-slate-800 dark:text-slate-100 leading-snug">
            {tappa.titolo}
          </h3>
        </div>

        {/* BOX NOTE COPILOTA */}
        {hasCopilotNotes && (
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-2.5 rounded-lg text-xs leading-relaxed text-amber-900 dark:text-amber-200 mt-2 flex items-start gap-1.5">
            <span className="shrink-0 text-sm">🧭</span>
            <span className="flex-1 break-words">{copilotData}</span>
          </div>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
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
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...tappa, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
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
