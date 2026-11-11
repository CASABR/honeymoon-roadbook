import { Handshake } from 'lucide-react';
import GoogleMapsIcon from '../icons/GoogleMapsIcon';
import type { Shopping } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo, formatCompactEuro } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';

interface ShoppingCardProps {
  shopping: Shopping;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onDuplicate?: () => void;
  onUpdate?: (updated: Shopping) => void;
}

export default function ShoppingCard({ shopping, onEdit, onDetail, onDuplicate, onUpdate }: ShoppingCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const copilotData = (shopping as any).noteCopilota || (shopping as any).nota || (shopping as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());

  const paymentInfo = resolvePaymentInfo({
    cost: shopping.budget || (shopping as any).cost,
    depositPaid: shopping.depositPaid || (shopping as any).amountPaid || (shopping as any).acconto,
    paymentStatus: shopping.paymentStatus,
    status: (shopping as any).status,
    completed: shopping.completed,
    currencyUncertain: (shopping as any).currencyUncertain,
    conversionType: (shopping as any).conversionType,
    originalCurrency: (shopping as any).originalCurrency,
    originalCost: (shopping as any).originalCost,
    exchangeRate: (shopping as any).exchangeRate,
    exchangeRateDate: (shopping as any).exchangeRateDate,
    exchangeRateSource: (shopping as any).exchangeRateSource
  });

  const isSaldato = paymentInfo.isPaid;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (paymentInfo.isFree || paymentInfo.isPackageIncluded || paymentInfo.costNum <= 0) return;
    try {
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      const origAcconto = (shopping as any).acconto || (paymentInfo.paidNum > 0 && paymentInfo.paidNum < paymentInfo.costNum ? formatCompactEuro(paymentInfo.paidNum) : undefined);
      const updated: Shopping = {
        ...shopping,
        paymentStatus: newStatus,
        completed: newStatus === 'saldato',
        acconto: origAcconto,
        depositPaid: newStatus === 'saldato' ? formatCompactEuro(paymentInfo.costNum) : (origAcconto || ''),
        updatedAt: Date.now()
      } as any;

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

  const displayTime = (shopping.orario || (shopping as any).time || '').trim();
  const isConfirmed = Boolean(displayTime) && shopping.timeStatus === 'confermato';
  const headerTimeSummary = displayTime
    ? `Ore ${displayTime}${isConfirmed ? ' · Confermato' : ' · indicativo'}`
    : ((shopping.data || shopping.date) ? formatDateIT((shopping.data || shopping.date)!) : '');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-ds-cat-shopping cursor-pointer"
    >
      {/* 1. HEADER: TARGA CATEGORIA VERDE BOSCO E CARTELLINO ORARIO PROGRAMMATO */}
      <div className="hounigo-ds-card-header hounigo-ds-header-shopping">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
            <span aria-hidden="true" className="text-xs">🛍️</span>
            <span>Shopping</span>
            {shopping.sottocategoria && (
              <>
                <span className="opacity-45">·</span>
                <span className="font-bold tracking-wide truncate">
                  {shopping.sottocategoria}
                </span>
              </>
            )}
          </div>

          {headerTimeSummary && (
            <span
              data-time-status={displayTime ? (isConfirmed ? 'confermato' : 'indicativo') : undefined}
              className={`hounigo-ds-time-stamp ${isConfirmed ? 'hounigo-ds-time-stamp-confirmed text-[#E11D48] dark:text-[#FF6B5F] font-black border-[#E11D48]/40 bg-rose-50 dark:bg-rose-950/40' : ''}`}
              title={displayTime ? (isConfirmed ? 'Orario confermato' : 'Orario indicativo') : undefined}
            >
              {isConfirmed && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#E11D48] dark:bg-[#FF6B5F] mr-1" aria-hidden="true" />}
              {headerTimeSummary}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY: NOME NEGOZIO, TRACCIATO LUOGO E CASELLARIO ACQUISTO */}
      <div className="hounigo-ds-card-body">
        <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight break-words">
          {shopping.nome}
        </h3>

        {displayAddress && (
          <div className="hounigo-ds-route-track">
            <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
              <span className="hounigo-ds-route-kicker">Luogo</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                {displayAddress}
              </span>
            </div>
          </div>
        )}

        {shopping.scopo && (
          <div className="hounigo-ds-spec-grid">
            <div className="hounigo-ds-spec-cell">
              <span className="hounigo-ds-spec-label">Articoli / Obiettivo acquisto</span>
              <span className="hounigo-ds-spec-value">{shopping.scopo}</span>
            </div>
          </div>
        )}

        {hasCopilotNotes && shopping.mostraNoteInCard && (
          <p className="hounigo-ds-note line-clamp-2">
            {copilotData.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: TAGLIANDO STATO ECONOMICO & AZIONI DISPONIBILI */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2 flex-wrap">
          {paymentInfo.isFree ? (
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Gratuito
            </span>
          ) : paymentInfo.isPackageIncluded ? (
            <span className="text-xs font-extrabold uppercase tracking-wide text-sky-800 dark:text-sky-300">
              Incluso
            </span>
          ) : paymentInfo.costNum > 0 ? (
            <button
              type="button"
              onClick={handleTogglePayment}
              className={`hounigo-ds-pay-badge font-mono ${
                isSaldato
                  ? 'hounigo-ds-pay-saldato'
                  : (paymentInfo.paidNum > 0 && paymentInfo.remainingNum > 0)
                  ? 'hounigo-ds-pay-acconto'
                  : 'hounigo-ds-pay-dasaldare'
              }`}
              title="Tocca per invertire stato: Saldato / Da saldare"
              aria-label="Stato pagamento shopping"
            >
              {paymentInfo.compactPaymentText}
            </button>
          ) : null}
        </div>

        <div className="hounigo-ds-actions-group">
          {hasCopilotNotes && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`hounigo-ds-action-btn ${hasCopilotNotes ? 'hounigo-ds-action-btn-active-green' : ''}`}
              title="Note per il Copilota"
              aria-label="Note Copilota"
            >
              <span className="relative inline-flex items-center">
                <Handshake className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white dark:ring-slate-900" />
              </span>
              <span className="hounigo-ds-btn-text">Copilota</span>
            </button>
          )}

          {shopping.link && (
            <a
              href={shopping.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri sito web"
              aria-label="Sito web"
            >
              <span aria-hidden="true">🌐</span>
              <span className="hounigo-ds-btn-text">Sito</span>
              <span className="hounigo-ds-btn-arrow text-[10px] opacity-70">↗</span>
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
              aria-label="Ricevute e QR"
            >
              <span aria-hidden="true">🎟️</span>
              <span className="hounigo-ds-btn-text">Ricevuta</span>
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="hounigo-ds-action-btn"
              title="Duplica questo shopping"
              aria-label="Duplica shopping"
            >
              <span aria-hidden="true">📄</span>
              <span className="hounigo-ds-btn-text">Duplica</span>
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
              aria-label="Apri su Google Maps"
            >
              <GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hounigo-ds-btn-text">Maps</span>
              <span className="hounigo-ds-btn-arrow text-[10px] opacity-70">↗</span>
            </a>
          )}
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={shopping.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        mostraNoteInCard={shopping.mostraNoteInCard}
        canEdit={true}
        onSave={async (notes, showOnCard) => {
          try {
            const updated = {
              ...shopping,
              noteCopilota: notes.trim(),
              mostraNoteInCard: Boolean(showOnCard),
              updatedAt: Date.now()
            } as any;
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
