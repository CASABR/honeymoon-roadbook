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
  onDuplicate?: () => void;
  onUpdate?: (updated: Ristorante) => void;
  variant?: 'compact' | 'full';
}

export default function RistoranteCard({ ristorante, onEdit, onDetail, onDuplicate, onUpdate, variant = 'full' }: RistoranteCardProps) {
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
      className="hounigo-ds-card hounigo-ds-cat-ristorante cursor-pointer"
    >
      {/* 1. HEADER: TARGA CATEGORIA OCRA/AMBRA E CARTELLINO ORARIO PRENOTAZIONE */}
      <div className="hounigo-ds-card-header hounigo-ds-header-ristorante">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
            <span aria-hidden="true" className="text-xs">🍽️</span>
            <span>Ristorante</span>
            {ristorante.sottocategoria && (
              <>
                <span className="opacity-45">·</span>
                <span className="font-bold tracking-wide truncate">
                  {ristorante.sottocategoria}
                </span>
              </>
            )}
          </div>

          {headerTimeSummary && (
            <span className="hounigo-ds-time-stamp">
              {headerTimeSummary}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY: NOME LOCALE, TRACCIATO INDIRIZZO E NOTA PRENOTAZIONE */}
      <div className="hounigo-ds-card-body">
        <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight break-words">
          {ristorante.nome}
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

        {hasCopilotNotes && ristorante.mostraNoteInCard && (
          <p className="hounigo-ds-note line-clamp-2">
            {copilotData.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: TAGLIANDO STATO ECONOMICO & AZIONI OPERATIVE */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2 flex-wrap">
          {isFree ? (
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <>
              <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                {costNum.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
              <button
                type="button"
                onClick={handleTogglePayment}
                className={`hounigo-ds-pay-badge ${
                  isPaid ? 'hounigo-ds-pay-saldato' : 'hounigo-ds-pay-dasaldare'
                }`}
                title="Clicca per invertire stato: Saldato / Da saldare"
              >
                {isPaid ? '✓ Saldato' : 'Da saldare'}
              </button>
            </>
          ) : null}
        </div>

        <div className="hounigo-ds-actions-group">
          {hasCopilotNotes && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`hounigo-ds-action-btn ${hasCopilotNotes ? 'hounigo-ds-action-btn-active-green' : ''}`}
              title="Note per il Copilota"
              aria-label="Note per il Copilota"
            >
              <span aria-hidden="true">🧭</span>
              <span className="hounigo-ds-btn-text">Note</span>
            </button>
          )}

          {ristorante.telefono && (
            <a
              href={`tel:${ristorante.telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title={`Chiama il ristorante: ${ristorante.telefono}`}
              aria-label="Chiama il ristorante"
            >
              <span aria-hidden="true">📞</span>
              <span className="hounigo-ds-btn-text">Chiama</span>
            </a>
          )}

          {ristorante.linkPrenotazione && (
            <a
              href={ristorante.linkPrenotazione}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri prenotazione tavolo"
              aria-label="Apri prenotazione"
            >
              <span aria-hidden="true">🍽️</span>
              <span className="hounigo-ds-btn-text">Prenota</span>
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
              title="Voucher / Ricevuta prenotazione"
              aria-label="Voucher / Ricevuta prenotazione"
            >
              <span aria-hidden="true">🎟️</span>
              <span className="hounigo-ds-btn-text">Voucher</span>
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="hounigo-ds-action-btn"
              title="Duplica questo ristorante"
              aria-label="Duplica ristorante"
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
              <span aria-hidden="true">🗺️</span>
              <span className="hounigo-ds-btn-text">Maps</span>
              <span className="hounigo-ds-btn-arrow text-[10px] opacity-70">↗</span>
            </a>
          )}
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={ristorante.nome || 'Dettaglio'}
        noteCopilota={copilotData}
        mostraNoteInCard={ristorante.mostraNoteInCard}
        canEdit={true}
        onSave={async (notes, showOnCard) => {
          try {
            const updated = {
              ...ristorante,
              noteCopilota: notes.trim(),
              mostraNoteInCard: Boolean(showOnCard),
              updatedAt: Date.now()
            } as any;
            await storageService.saveRistorante(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'ristoranti', data: updated } }));
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
