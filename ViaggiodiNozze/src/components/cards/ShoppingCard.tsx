import type { Shopping } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';

interface ShoppingCardProps {
  shopping: Shopping;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Shopping) => void;
}

export default function ShoppingCard({ shopping, onEdit, onDetail, onUpdate }: ShoppingCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = (shopping as any).noteCopilota || (shopping as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());

  const costNum = parseFloat(String(shopping.budget || shopping.cost || '0').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
  const paidNum = parseFloat(String(shopping.depositPaid || shopping.amountPaid || shopping.acconto || '0').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;

  const isSaldato = shopping.paymentStatus === 'saldato' || shopping.completed || (costNum > 0 && paidNum >= costNum);

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      const costStr = shopping.budget || shopping.cost || `${costNum.toFixed(2)} €`;
      const paidVal = newStatus === 'saldato' ? costStr : '0.00 €';

      const updated: Shopping = {
        ...shopping,
        paymentStatus: newStatus,
        completed: newStatus === 'saldato',
        depositPaid: paidVal,
        acconto: paidVal,
        amountPaid: paidVal,
        updatedAt: Date.now()
      };

      await storageService.saveShopping(updated);
      notifyDataChanged('shopping', 'save', updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'shopping', data: updated } }));
    } catch (err) {
      console.error('Errore durante il cambio stato pagamento shopping:', err);
    }
  };

  const mapTarget = shopping.indirizzo || shopping.nome;

  return (
    <div 
      onClick={onDetail || onEdit} 
      className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[10px] font-bold tracking-wide uppercase">
            <span className="text-sm">🛍️</span> Shopping
          </span>
          {shopping.orario && (
            <div className="flex flex-col ml-1">
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                Orario: {shopping.orario}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
            className={`flex items-center justify-center w-7 h-7 rounded-full border transition-colors shadow-sm ${
              hasCopilotNotes
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 opacity-60 hover:opacity-100'
            }`}
            title="Apri note Copilota"
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
          <h3 className={`text-base font-semibold text-slate-900 dark:text-white leading-snug ${isSaldato ? 'opacity-90' : ''}`}>
            {shopping.nome}
          </h3>
        </div>
        {mapTarget && (
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate mt-1 flex items-center gap-1">
            <span>📍</span>
            <span className="truncate">{mapTarget}</span>
          </p>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center">
          {(!shopping.budget || isNaN(parseFloat(shopping.budget)) || parseFloat(shopping.budget) === 0) ? (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Costo non specificato
            </span>
          ) : (
            <span className="text-slate-900 dark:text-white font-semibold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md text-sm">
              {parseFloat(shopping.budget).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {shopping.link && (
            <a
              href={shopping.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-pink-600 dark:text-pink-400 text-xs font-medium transition-colors"
            >
              Sito Web ↗
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
        title={shopping.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...shopping, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            
            await storageService.updateShopping(shopping.id, updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
      
            notifyDataChanged('shopping', 'save', updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'shopping', data: updated }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}
