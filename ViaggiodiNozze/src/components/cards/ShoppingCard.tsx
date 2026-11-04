import type { Shopping } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';

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
    if (paymentInfo.isFree || paymentInfo.isPackageIncluded || paymentInfo.costNum <= 0) return;
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
  const displayAddress = shopping.indirizzo?.trim() || '';
  const hasQrOrAttachment = Boolean(
    (shopping as any).qrCode?.trim() ||
    shopping.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  const headerTimeSummary = shopping.orario
    ? `Ore ${shopping.orario}${shopping.timeStatus === 'indicativo' ? ' · indicativo' : ''}`
    : ((shopping.data || shopping.date) ? formatDateIT((shopping.data || shopping.date)!) : '');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-panel cursor-pointer"
    >
      {/* 1. HEADER: CATEGORIA VERDE ED EVENTUALE ORARIO PROGRAMMATO */}
      <div className="hounigo-ds-card-header hounigo-ds-header-shopping">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider min-w-0">
            <span aria-hidden="true">🛍️</span>
            <span>Shopping</span>
            {shopping.sottocategoria && (
              <span className="font-bold normal-case tracking-normal opacity-90">
                · {shopping.sottocategoria}
              </span>
            )}
          </div>

          {headerTimeSummary && (
            <span className="font-mono text-xs sm:text-[13px] font-extrabold tabular-nums shrink-0">
              {headerTimeSummary}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY: NOME NEGOZIO O ACQUISTO, INDIRIZZO/LUOGO ED EVENTUALI INFORMAZIONI ESSENZIALI */}
      <div className="hounigo-ds-card-body">
        <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight break-words">
          {shopping.nome}
        </h3>

        {displayAddress && (
          <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 font-semibold leading-snug flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5" aria-hidden="true">📍</span>
            <span className="break-words">{displayAddress}</span>
          </p>
        )}

        {shopping.scopo && (
          <p className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-snug flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5" aria-hidden="true">🎯</span>
            <span className="break-words">{shopping.scopo}</span>
          </p>
        )}

        {hasCopilotNotes && (
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
            {copilotData.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: IMPORTO/STATO QUANDO APPLICABILI E AZIONI DISPONIBILI */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2 flex-wrap">
          {paymentInfo.isFree ? (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Gratuito
            </span>
          ) : paymentInfo.isPackageIncluded ? (
            <span className="text-xs font-bold text-sky-800 dark:text-sky-300">
              Incluso nel pacchetto
            </span>
          ) : paymentInfo.costNum > 0 ? (
            <>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                {paymentInfo.costNum.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
              <button
                type="button"
                onClick={handleTogglePayment}
                className={`inline-flex items-center text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                  isSaldato
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-700'
                }`}
                title="Clicca per invertire stato: Saldato / Da saldare"
              >
                {isSaldato ? '✓ Saldato' : '⏳ Da saldare'}
              </button>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {shopping.link && (
            <a
              href={shopping.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri sito web"
            >
              <span>🌐</span>
              <span>Sito</span>
            </a>
          )}

          {hasQrOrAttachment && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAttachmentOpen(true);
              }}
              className="hounigo-ds-action-btn hounigo-ds-action-btn-highlight"
              title="Ricevute e QR"
            >
              <span>🎫</span>
              <span>Ricevuta / QR</span>
            </button>
          )}

          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
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
        title={shopping.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...shopping, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.updateShopping(shopping.id, updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            notifyDataChanged('shopping', 'save', updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'shopping', data: updated } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
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
