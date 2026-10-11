import type { Ristorante } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';

interface RistoranteCardProps {
  ristorante: Ristorante;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Ristorante) => void;
}

export default function RistoranteCard({ ristorante, onEdit, onDetail, onUpdate }: RistoranteCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = (ristorante as any).noteCopilota || (ristorante as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  
  const isSaldato = ristorante.status === 'saldato' || Boolean((ristorante as any).completed);

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      const updated: Ristorante = {
        ...ristorante,
        status: newStatus,
        completed: !isSaldato,
        updatedAt: Date.now()
      };
      await storageService.saveRistorante(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' } }));
    } catch (e) {
      console.error(e);
    }
  };

  const mapTarget = ristorante.indirizzo || ristorante.nome;

  return (
    <div 
      onClick={onDetail || onEdit} 
      className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-white border border-slate-200"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20 text-[10px] font-bold tracking-wide uppercase">
            <span className="text-sm">🍽️</span> Ristorante
          </span>
          {ristorante.orario && (
            <div className="flex flex-col ml-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">
                Prenotazione: {ristorante.orario}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Badge Saldato / Da saldare interattivo */}
          <button
            type="button"
            onClick={handleTogglePayment}
            className={`cursor-pointer hover:opacity-85 active:scale-95 transition-all text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${
              isSaldato
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
            }`}
            title="Clicca per cambiare stato (Saldato / Da saldare)"
          >
            {isSaldato ? '✓ Saldato' : '⏳ Da saldare'}
          </button>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
            className={`flex items-center justify-center w-7 h-7 rounded-full border transition-colors shadow-sm ${
              hasCopilotNotes
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Apri note Copilota"
          >
            <span className="text-sm">🧭</span>
          </button>
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className={`text-base font-extrabold text-slate-900 leading-snug ${isSaldato ? 'opacity-90' : ''}`}>
            {ristorante.nome}
          </h3>
        </div>
        {mapTarget && (
          <p className="text-xs text-slate-500 font-medium truncate mt-1 flex items-center gap-1">
            <span>📍</span>
            <span className="truncate">{mapTarget}</span>
          </p>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {(!ristorante.budget || isNaN(parseFloat(ristorante.budget)) || parseFloat(ristorante.budget) === 0) ? (
            <span className="text-[11px] font-semibold text-slate-500">
              Budget non inserito
            </span>
          ) : (
            <span className="text-slate-900 dark:text-slate-100 font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
              {parseFloat(ristorante.budget).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {ristorante.telefono && (
            <a
              href={`tel:${ristorante.telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              📞
            </a>
          )}
          {ristorante.linkPrenotazione && (
            <a
              href={ristorante.linkPrenotazione}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 text-xs font-medium transition-colors"
            >
              Prenota ↗
            </a>
          )}
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
        title={ristorante.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...ristorante, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.saveRistorante(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}
