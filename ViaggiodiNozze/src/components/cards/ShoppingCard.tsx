import type { Shopping } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';

interface ShoppingCardProps {
  shopping: Shopping;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Shopping) => void;
}

export default function ShoppingCard({ shopping, onEdit, onDetail, onUpdate }: ShoppingCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const copilotData = (shopping as any).noteCopilota || (shopping as any).nota || (shopping as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());

  const paymentInfo = resolvePaymentInfo({
    cost: shopping.budget || (shopping as any).cost,
    depositPaid: shopping.depositPaid || (shopping as any).amountPaid || (shopping as any).acconto,
    paymentStatus: shopping.paymentStatus,
    status: (shopping as any).status,
    completed: shopping.completed
  });

  const isSaldato = paymentInfo.isPaid;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (paymentInfo.isFree || paymentInfo.isPackageIncluded) return;
    try {
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      const costStr = shopping.budget || (shopping as any).cost || `${paymentInfo.costNum.toFixed(2)} €`;
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
      className="hounigo-panel cursor-pointer rounded-2xl p-4 hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[10px] font-bold tracking-wide uppercase">
            <span className="text-sm">🛍️</span> Shopping
          </span>
          {shopping.sottocategoria && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-300 dark:border-slate-600 text-[10px] font-bold tracking-wide">
              <span>🏷️</span>
              <span>{shopping.sottocategoria}</span>
            </span>
          )}
          {shopping.scopo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 text-[10px] font-semibold tracking-wide">
              <span>🎯</span>
              <span>{shopping.scopo}</span>
            </span>
          )}
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
        <div className="flex items-center gap-2">
          {paymentInfo.isFree ? (
            <span className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
              Gratuito
            </span>
          ) : paymentInfo.isPackageIncluded ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-sky-700 bg-sky-50 border border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50">
              Incluso nel pacchetto
            </span>
          ) : paymentInfo.costNum === 0 ? (
            <span className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
              Budget da definire
            </span>
          ) : (
            <span className="text-slate-900 dark:text-white font-semibold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md text-sm">
              {paymentInfo.costNum.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </span>
          )}

          {!paymentInfo.isFree && !paymentInfo.isPackageIncluded && (
            <button
              type="button"
              onClick={handleTogglePayment}
              className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs ${
                isSaldato
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700'
              }`}
              title="Clicca per invertire stato: Saldato / Da saldare"
            >
              {isSaldato ? '✓ Saldato' : '⏳ Da saldare'}
            </button>
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
          {(() => {
            const hasQrOrAttachment = Boolean(
              (shopping as any).bookingCode?.trim() ||
              (shopping as any).qrCode?.trim() ||
              (shopping.attachments && shopping.attachments.length > 0)
            );
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAttachmentOpen(true);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer border ${
                  hasQrOrAttachment
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 dark:border-indigo-800'
                }`}
                title="Scontrini / Buoni / QR"
              >
                <span className="text-[10px]">🎫</span> Scontrino/QR
              </button>
            );
          })()}
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
      <UniversalAttachmentModal
        isOpen={isAttachmentOpen}
        onClose={() => setIsAttachmentOpen(false)}
        title={`Ricevute / Scontrini - ${shopping.nome}`}
        attachments={shopping.attachments || []}
        onSave={async (newAttachments) => {
          const updated: Shopping = {
            ...shopping,
            attachments: newAttachments,
            updatedAt: Date.now()
          };
          await storageService.updateShopping(shopping.id, updated);
          if (typeof onUpdate === 'function') onUpdate(updated);
          notifyDataChanged('shopping', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'shopping', data: updated } }));
        }}
      />
    </div>
  );
}
