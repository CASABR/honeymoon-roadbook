import React, { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
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
  
  const isSaldato = accommodation.paymentStatus === 'saldato' || accommodation.completed || Boolean(accommodation.depositPaid && parseFloat(accommodation.depositPaid.replace(',', '.')) >= parseFloat(String(accommodation.cost || '0').replace(',', '.')) && parseFloat(String(accommodation.cost || '0').replace(',', '.')) > 0);

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      const updatedCost = accommodation.cost || '0.00';
      const depositVal = newStatus === 'saldato' ? updatedCost : '0.00';
      const updated: Alloggio = {
        ...accommodation,
        status: (newStatus === 'saldato' ? 'completato' : 'da_prenotare') as any,
        paymentStatus: newStatus as any,
        completed: newStatus === 'saldato',
        depositPaid: depositVal,
        acconto: depositVal,
        updatedAt: Date.now()
      };
      await storageService.saveAlloggio(updated);
      notifyDataChanged('alloggi', 'save', updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated }}));
    } catch (err) {
      console.error('Errore durante il cambio stato pagamento alloggio:', err);
    }
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
      className="cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[11px] font-semibold uppercase tracking-wider">
            <span className="text-sm">🛏️</span> Alloggio
          </span>
          {(accommodation.checkInTime || accommodation.checkOutTime) && (
            <div className="flex items-center gap-1.5 ml-1">
              {accommodation.checkInTime && (
                <span className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                  In {accommodation.checkInTime}
                </span>
              )}
              {accommodation.checkOutTime && (
                <span className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                  • Out {accommodation.checkOutTime}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-2xs ${
              hasCopilotNotes
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 opacity-60 hover:opacity-100'
            }`}
            title="Note Copilota"
          >
            <span className="text-sm">🧭</span>
          </button>
          <button
            type="button"
            onClick={handleTogglePayment}
            className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs ${
              isSaldato
                ? 'bg-[#E6F4EA] text-[#39734A] border-emerald-300 dark:bg-[#143521] dark:text-[#4ADE80] dark:border-emerald-800'
                : 'bg-[#FFFDF2] text-amber-900 border-[#FFC857] dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
            }`}
            title="Clicca per invertire stato: Saldato / Da saldare"
          >
            {isSaldato ? '✓ Saldato' : '⏳ Da saldare'}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className={`font-semibold text-base leading-snug tracking-tight text-slate-900 dark:text-white ${isSaldato ? 'opacity-90' : ''}`}>
            {accommodation.name}
          </h3>
        </div>
        <p className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300 truncate mt-1 flex items-center gap-1">
          <span>📍</span>
          <span className="truncate">{accommodation.address || accommodation.location || 'Indirizzo registrato'}</span>
        </p>

        {accommodation.cancellazioneGratuitaEntro && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/60 px-2 py-0.5 rounded-lg w-fit mt-2">
            <span>🛡️</span>
            <span>Cancellazione gratuita fino al {accommodation.cancellazioneGratuitaEntro}</span>
          </div>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {(!accommodation.cost || isNaN(parseFloat(String(accommodation.cost).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(accommodation.cost).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Gratuito
            </span>
          ) : (
            <span className="text-sm font-semibold text-slate-900 bg-slate-100 dark:bg-slate-700 dark:text-slate-100 px-2 py-1 rounded-md">
              {String(accommodation.cost)}
            </span>
          )}
          
          {accommodation.cost && String(accommodation.cost) !== '0' && (
            <button 
              type="button"
              onClick={handleTogglePayment}
              className={`cursor-pointer hover:scale-105 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs ${
                isSaldato
                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800" 
                  : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700"
              }`}
              title="Clicca per invertire stato: Saldato / Da saldare"
            >
              {isSaldato ? '✓ Saldato' : '⏳ Da saldare'}
            </button>
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
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated }}));
            setIsCopilotOpen(false);
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </div>
  );
}
