import React, { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onUpdate?: (updated: Alloggio) => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onUpdate, onDetail }: AlloggioCardProps) {
  const { role } = useDeviceRole();
  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && (role === 'guida' || role === 'copilota');

  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const initialCopilot = (accommodation as any).noteCopilota || (accommodation as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  useEffect(() => {
    const nextNotes = (accommodation as any).noteCopilota || (accommodation as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [accommodation]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());

  const paymentInfo = resolvePaymentInfo({
    cost: accommodation.cost,
    depositPaid: accommodation.depositPaid || accommodation.acconto,
    paymentStatus: accommodation.paymentStatus,
    status: accommodation.status,
    completed: accommodation.completed
  });

  const { isFree, isPaid, costNum, displayText } = paymentInfo;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFree) return;
    try {
      const newStatus = isPaid ? 'da_saldare' : 'saldato';
      const updatedCost = accommodation.cost || (costNum > 0 ? `${costNum.toFixed(2)} €` : '0.00');
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
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
    } catch (err) {
      console.error('Errore durante il cambio stato pagamento alloggio:', err);
    }
  };

  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!accommodation.bookingCode) return;
    try {
      await navigator.clipboard.writeText(accommodation.bookingCode);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = accommodation.bookingCode;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const mapTarget = accommodation.address || accommodation.location || accommodation.name;
  const displayAddress = accommodation.address || accommodation.location;
  const hasAttachments = Boolean(
    accommodation.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  // Per gli ospiti non autorizzati, maschera eventuali PIN/codici presenti nelle note d'ingresso
  const displayedCopilotNotes = canSeePrivateInfo
    ? copilotNotes
    : copilotNotes.replace(/\b(PIN|codice|keybox|cassaforte|digita)\s*[:=-]?\s*([A-Z0-9#*]{3,12})/gi, '$1: [Riservato]');

  const headerTimeSummary = accommodation.checkInTime && accommodation.checkOutTime
    ? `Check-in ${accommodation.checkInTime} · Out ${accommodation.checkOutTime}`
    : accommodation.checkInTime
    ? `Check-in dalle ${accommodation.checkInTime}`
    : accommodation.checkOutTime
    ? `Check-out entro ${accommodation.checkOutTime}`
    : '';

  const hasOperationalDetails = Boolean(
    accommodation.arrivalTime ||
    (canSeePrivateInfo && (accommodation as any).pinCode) ||
    (canSeePrivateInfo && accommodation.bookingCode) ||
    accommodation.cancellazioneGratuitaEntro
  );

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-panel cursor-pointer"
    >
      {/* 1. HEADER: CATEGORIA VIOLA/LILLA, ORARI CHECK-IN/OUT E AVVISO ISTRUZIONI SOLO SE PRESENTE */}
      <div className="hounigo-ds-card-header hounigo-ds-header-alloggio">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider min-w-0">
            <span aria-hidden="true">🛏️</span>
            <span>Alloggio</span>
            {accommodation.sottocategoria && (
              <span className="font-bold normal-case tracking-normal opacity-90">
                · {accommodation.sottocategoria}
              </span>
            )}
          </div>

          {headerTimeSummary && (
            <span className="font-mono text-xs font-extrabold tabular-nums shrink-0">
              {headerTimeSummary}
            </span>
          )}
        </div>

        {hasCopilotNotes && (
          <div className="flex items-center justify-between gap-2 pt-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className="inline-flex items-center gap-1.5 hover:underline cursor-pointer text-left"
              title="Apri istruzioni d'ingresso"
            >
              <span>🧭</span>
              <span>Istruzioni d&apos;ingresso disponibili</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. BODY: NOME STRUTTURA, DATE DEL SOGGIORNO, INDIRIZZO E DETTAGLI OPERATIVI ESSENZIALI */}
      <div className="hounigo-ds-card-body">
        <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
          {accommodation.name}
        </h3>

        {(accommodation.checkIn || accommodation.checkOut) && (
          <p className="text-xs sm:text-[13px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <span className="shrink-0" aria-hidden="true">📅</span>
            <span>
              {accommodation.checkIn ? formatDateIT(accommodation.checkIn) : ''}
              {accommodation.checkOut ? ` → ${formatDateIT(accommodation.checkOut)}` : ''}
              {(accommodation as any).totalNights ? ` (${(accommodation as any).totalNights} ${(accommodation as any).totalNights === 1 ? 'notte' : 'notti'})` : ''}
            </span>
          </p>
        )}

        {displayAddress && (
          <p className="text-xs sm:text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5" aria-hidden="true">📍</span>
            <span className="break-words">{displayAddress}</span>
          </p>
        )}

        {hasOperationalDetails && (
          <div className="pt-1 flex flex-col gap-1 text-xs sm:text-[13px] text-slate-800 dark:text-slate-200">
            {(accommodation.arrivalTime || (canSeePrivateInfo && ((accommodation as any).pinCode || accommodation.bookingCode))) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
                {accommodation.arrivalTime && (
                  <span>
                    🕒 Arrivo previsto: <strong className="font-mono font-extrabold text-slate-950 dark:text-white">ore {accommodation.arrivalTime}</strong>
                  </span>
                )}
                {canSeePrivateInfo && (accommodation as any).pinCode && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await navigator.clipboard.writeText((accommodation as any).pinCode);
                        setCopiedPin(true);
                        setTimeout(() => setCopiedPin(false), 2000);
                      } catch {}
                    }}
                    className="inline-flex items-center gap-1 font-mono font-extrabold text-amber-900 dark:text-amber-300 hover:underline cursor-pointer"
                    title="Copia PIN ingresso"
                  >
                    <span>🔑 PIN: {(accommodation as any).pinCode}</span>
                    <span className="font-sans text-[11px] font-bold">({copiedPin ? '✓ Copiato' : 'Copia'})</span>
                  </button>
                )}
                {canSeePrivateInfo && accommodation.bookingCode && (
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 font-mono font-bold text-slate-700 dark:text-slate-200 hover:underline cursor-pointer"
                    title="Copia codice prenotazione"
                  >
                    <span>🎟️ Rif: {accommodation.bookingCode}</span>
                    <span className="font-sans text-[11px]">({copiedCode ? '✓' : 'Copia'})</span>
                  </button>
                )}
              </div>
            )}

            {accommodation.cancellazioneGratuitaEntro && (
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                🛡️ Cancellazione gratuita fino al {formatDateIT(accommodation.cancellazioneGratuitaEntro)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3. FOOTER: PREZZO / STATO PAGAMENTO A SINISTRA, AZIONI OPERATIVE A DESTRA */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2 flex-wrap">
          {isFree ? (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
              {displayText}
            </span>
          ) : null}

          {!isFree && costNum > 0 && (
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
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {hasCopilotNotes && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className="hounigo-ds-action-btn"
              title="Istruzioni d'ingresso e note operative"
            >
              <span>🧭</span>
              <span>Istruzioni</span>
            </button>
          )}

          {accommodation.phone && (
            <a
              href={`tel:${accommodation.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Chiama la struttura"
            >
              <span>📞</span>
              <span>Chiama</span>
            </a>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAttachmentOpen(true);
            }}
            className={`hounigo-ds-action-btn ${hasAttachments ? 'hounigo-ds-action-btn-highlight' : ''}`}
            title="Voucher e allegati dell'alloggio"
          >
            <span>🎫</span>
            <span>Voucher</span>
          </button>

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
        title={`Istruzioni & Note · ${accommodation.name || 'Alloggio'}`}
        noteCopilota={displayedCopilotNotes}
        canEdit={canSeePrivateInfo}
        onSave={async (notes) => {
          if (!canSeePrivateInfo) return;
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = { ...accommodation, noteCopilota: clean, updatedAt: Date.now() } as any;
            await storageService.saveAccommodation(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
            setIsCopilotOpen(false);
          } catch (e) {
            console.error(e);
          }
        }}
      />
      <UniversalAttachmentModal
        isOpen={isAttachmentOpen}
        onClose={() => setIsAttachmentOpen(false)}
        title={`Voucher / Allegati - ${accommodation.name}`}
        attachments={accommodation.attachments || []}
        onSave={async (newAttachments) => {
          const updated: Alloggio = {
            ...accommodation,
            attachments: newAttachments,
            updatedAt: Date.now()
          };
          await storageService.saveAccommodation(updated);
          notifyDataChanged('alloggi', 'save', updated);
          if (typeof onUpdate === 'function') onUpdate(updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
        }}
      />
    </div>
  );
}
