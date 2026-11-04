import type { Ristorante } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';

interface RistoranteCardProps {
  ristorante: Ristorante;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Ristorante) => void;
  variant?: 'compact' | 'full';
}

export default function RistoranteCard({ ristorante, onEdit, onDetail, onUpdate, variant = 'full' }: RistoranteCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const copilotData = (ristorante as any).noteCopilota || (ristorante as any).nota || (ristorante as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  const isCompact = variant === 'compact';

  const paymentInfo = resolvePaymentInfo({
    budget: ristorante.budget,
    paymentStatus: (ristorante as any).paymentStatus || (ristorante.status === 'saldato' ? 'saldato' : 'da_saldare'),
    status: ristorante.status,
    completed: (ristorante as any).completed
  });

  const { isFree, isPaid, costNum } = paymentInfo;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFree) return;
    try {
      const newStatus = isPaid ? 'da_saldare' : 'saldato';
      const updated: Ristorante = {
        ...ristorante,
        status: newStatus as any,
        completed: !isPaid,
        updatedAt: Date.now()
      };
      await storageService.saveRistorante(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'ristoranti', data: updated } }));
    } catch (e) {
      console.error(e);
    }
  };

  const mapTarget = ristorante.indirizzo || ristorante.nome;
  const displayAddress = ristorante.indirizzo?.trim() || '';
  const time = ristorante.orario || (ristorante as any).time;
  const hasQrOrAttachment = Boolean(
    (ristorante as any).qrCode?.trim() ||
    ristorante.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  const headerTimeSummary = time
    ? `Ore ${time}${ristorante.timeStatus === 'indicativo' ? ' · indicativo' : ''}`
    : (!isCompact && (ristorante.data || ristorante.date) ? formatDateIT((ristorante.data || ristorante.date)!) : '');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-panel cursor-pointer"
    >
      {/* 1. HEADER: CATEGORIA ARANCIONE, SOTTOCATEGORIA ED EVENTUALE ORARIO PRENOTAZIONE */}
      <div className="hounigo-ds-card-header hounigo-ds-header-ristorante">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider min-w-0">
            <span aria-hidden="true">🍽️</span>
            <span>Ristorante</span>
            {ristorante.sottocategoria && (
              <span className="font-bold normal-case tracking-normal opacity-90">
                · {ristorante.sottocategoria}
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

      {/* 2. BODY: NOME LOCALE, INDIRIZZO ED EVENTUALI INFORMAZIONI DI PRENOTAZIONE */}
      <div className="hounigo-ds-card-body">
        <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight break-words">
          {ristorante.nome}
        </h3>

        {displayAddress && (
          <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 font-semibold leading-snug flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5" aria-hidden="true">📍</span>
            <span className="break-words">{displayAddress}</span>
          </p>
        )}

        {hasCopilotNotes && (
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
            {copilotData.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: PREZZO/STATO SE APPLICABILI, PRENOTAZIONE/VOUCHER E MAPS */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2 flex-wrap">
          {isFree ? (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                {costNum.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
              <button
                type="button"
                onClick={handleTogglePayment}
                className={`inline-flex items-center text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                  isPaid
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-700'
                }`}
                title="Clicca per invertire stato: Saldato / Da saldare"
              >
                {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
              </button>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {ristorante.telefono && (
            <a
              href={`tel:${ristorante.telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Chiama il ristorante"
            >
              <span>📞</span>
              <span>Chiama</span>
            </a>
          )}

          {ristorante.linkPrenotazione && (
            <a
              href={ristorante.linkPrenotazione}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri prenotazione"
            >
              <span>🌐</span>
              <span>Prenota</span>
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
              title="Voucher / Ricevuta prenotazione"
            >
              <span>🎫</span>
              <span>Voucher</span>
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
        title={ristorante.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...ristorante, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.saveRistorante(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
      <UniversalAttachmentModal
        isOpen={isAttachmentOpen}
        onClose={() => setIsAttachmentOpen(false)}
        title={`Voucher / Ricevute - ${ristorante.nome}`}
        attachments={ristorante.attachments || []}
        onSave={async (newAttachments) => {
          const updated: Ristorante = {
            ...ristorante,
            attachments: newAttachments,
            updatedAt: Date.now()
          };
          await storageService.saveRistorante(updated);
          if (typeof onUpdate === 'function') onUpdate(updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'ristoranti', data: updated } }));
        }}
      />
    </div>
  );
}
