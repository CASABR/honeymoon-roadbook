import React, { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onUpdate?: (updated: Alloggio) => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onUpdate, onDetail }: AlloggioCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = (accommodation as any).noteCopilota || (accommodation as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  
  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      
      const isSaldato = accommodation.completed;
      const updated = { ...accommodation, completed: !isSaldato, status: isSaldato ? 'da_prenotare' : 'completato' } as any;
      updated.acconto = isSaldato ? "0" : accommodation.cost;
      updated.updatedAt = Date.now();
      await storageService.saveAccommodation(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
    
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    } catch(e) { console.error(e); }
  };
  

  const [copied, setCopied] = useState(false);

  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!accommodation.bookingCode) return;
    try {
      await navigator.clipboard.writeText(accommodation.bookingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const mapTarget = accommodation.address || accommodation.location;

  return (
    <div 
      onClick={onDetail || onEdit} 
      className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-white border border-slate-200"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[10px] font-bold tracking-wide uppercase">
            <span className="text-sm">🛏️</span> Alloggio
          </span>
          {(accommodation.checkInTime || accommodation.checkOutTime) && (
            <div className="flex flex-col ml-1">
              {accommodation.checkInTime && (
                <span className="text-[10px] font-semibold text-slate-500">
                  Check-in {accommodation.checkInTime}
                </span>
              )}
              {accommodation.checkOutTime && (
                <span className="text-[10px] font-medium text-slate-400">
                  Out {accommodation.checkOutTime}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {true && (
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
            )}
          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            accommodation.completed
              ? 'bg-[#E6F4EA] text-[#39734A] dark:bg-[#143521] dark:text-[#4ADE80] border-transparent'
              : 'bg-[#FFFDF2] text-slate-900 border-[#FFC857]/40 dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
          }`}>
            {accommodation.completed ? '✓ Confermato' : 'Da Saldare'}
          </span>
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className={`text-base font-extrabold text-slate-900 leading-snug ${accommodation.completed ? 'opacity-90' : ''}`}>
            {accommodation.name}
          </h3>
        </div>
        <p className="text-xs text-slate-500 font-medium truncate mt-1 flex items-center gap-1">
          <span>📍</span>
          <span className="truncate">{accommodation.address || accommodation.location || 'Indirizzo registrato'}</span>
        </p>
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
                {(!accommodation.cost || isNaN(parseFloat(String(accommodation.cost).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(accommodation.cost).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
                  <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    Gratuito
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded-md">
                    {String(accommodation.cost)}
                  </span>
                )}
                
                {accommodation.cost && String(accommodation.cost) !== '0' && (
                  <span 
                    onClick={handleTogglePayment}
                    className={`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs hover:shadow-sm ${
                      (accommodation.completed)
                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" 
                        : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    {(accommodation.completed) ? '✓ Saldato' : '⏳ Da saldare'}
                  </span>
                )}
              </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {accommodation.phone && (
            <a
              href={`tel:${accommodation.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              📞
            </a>
          )}
          {accommodation.bookingCode && (
            <button
              type="button"
              onClick={handleCopyCode}
              title="Copia codice prenotazione"
              className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-purple-700 transition-colors"
            >
              {copied ? '✓' : 'Codice'}
            </button>
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
        title={accommodation.name || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...accommodation, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            
            await storageService.saveAccommodation(updated);
            try { if (eval("typeof onUpdate === 'function'")) eval("onUpdate(updated)"); } catch(e){}
      
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}
