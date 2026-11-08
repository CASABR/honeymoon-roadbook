import React, { useState, useEffect, useMemo } from 'react';
import { Handshake } from 'lucide-react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import GoogleMapsIcon from '../icons/GoogleMapsIcon';
import { resolvePaymentInfo, formatCompactEuro } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onUpdate?: (updated: Alloggio) => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onDuplicate?: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onUpdate, onDetail }: AlloggioCardProps) {
  const { canEdit, canSeePrivateInfo: deviceCanSeePrivate } = useDeviceRole();
  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && deviceCanSeePrivate;

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

  const { isFree, isPaid, costNum, paidNum, remainingNum, compactPaymentText } = paymentInfo;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFree || costNum <= 0) return;
    try {
      const newStatus = isPaid ? 'da_saldare' : 'saldato';
      const origAcconto = accommodation.acconto || (paidNum > 0 && paidNum < costNum ? formatCompactEuro(paidNum) : undefined);
      const updated: Alloggio = {
        ...accommodation,
        status: (newStatus === 'saldato' ? 'completato' : 'da_prenotare') as any,
        paymentStatus: newStatus as any,
        acconto: origAcconto,
        depositPaid: newStatus === 'saldato' ? formatCompactEuro(costNum) : (origAcconto || ''),
        completed: newStatus === 'saldato',
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

  const handleToggleCheckIn = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    try {
      const now = Date.now();
      const nextCheckIn = !accommodation.checkInDone;
      const updated: Alloggio = {
        ...accommodation,
        checkInDone: nextCheckIn,
        checkInAt: nextCheckIn ? now : undefined,
        // Se si annulla il check-in, azzera anche il check-out
        ...(nextCheckIn ? {} : { checkOutDone: false, checkOutAt: undefined }),
        updatedAt: now
      };
      await storageService.saveAlloggio(updated);
      notifyDataChanged('alloggi', 'save', updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
    } catch (err) {
      console.error('Errore toggle check-in alloggio:', err);
    }
  };

  const handleToggleCheckOut = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    try {
      const now = Date.now();
      const nextCheckOut = !accommodation.checkOutDone;
      const updated: Alloggio = {
        ...accommodation,
        checkInDone: nextCheckOut ? true : accommodation.checkInDone,
        checkInAt: nextCheckOut ? (accommodation.checkInAt || now) : accommodation.checkInAt,
        checkOutDone: nextCheckOut,
        checkOutAt: nextCheckOut ? now : undefined,
        updatedAt: now
      };
      await storageService.saveAlloggio(updated);
      notifyDataChanged('alloggi', 'save', updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
    } catch (err) {
      console.error('Errore toggle check-out alloggio:', err);
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
    ? `IN ${accommodation.checkInTime} · OUT ${accommodation.checkOutTime}`
    : accommodation.checkInTime
    ? `Check-in ${accommodation.checkInTime}`
    : accommodation.checkOutTime
    ? `Check-out ${accommodation.checkOutTime}`
    : '';

  const numNights = useMemo(() => {
    if ((accommodation as any).totalNights) return Number((accommodation as any).totalNights);
    if (!accommodation.checkIn || !accommodation.checkOut) return 1;
    const dIn = new Date(accommodation.checkIn).getTime();
    const dOut = new Date(accommodation.checkOut).getTime();
    const diffDays = Math.round((dOut - dIn) / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 1 : diffDays;
  }, [accommodation.checkIn, accommodation.checkOut, (accommodation as any).totalNights]);

  const hasOperationalDetails = Boolean(
    accommodation.arrivalTime ||
    (canSeePrivateInfo && (accommodation as any).pinCode) ||
    (canSeePrivateInfo && accommodation.bookingCode) ||
    accommodation.cancellazioneGratuitaEntro
  );

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-ds-cat-alloggio cursor-pointer"
    >
      {/* 1. HEADER: TARGA CATEGORIA VIOLA/INDACO E CARTELLINO ORARI CHECK-IN/OUT */}
      <div className="hounigo-ds-card-header hounigo-ds-header-alloggio">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
            <span aria-hidden="true" className="text-xs">🛏️</span>
            <span>Alloggio</span>
            {accommodation.sottocategoria && (
              <>
                <span className="opacity-45">·</span>
                <span className="font-bold tracking-wide truncate">
                  {accommodation.sottocategoria}
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

      {/* 2. BODY: NOME STRUTTURA, PERIODO SOGGIORNO, INDIRIZZO E CASELLARIO OPERATIVO */}
      <div className="hounigo-ds-card-body">
        <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
          {accommodation.name}
        </h3>

        <div className="hounigo-ds-route-track">
          {numNights > 1 && accommodation.checkIn && accommodation.checkOut && (
            <div className="hounigo-ds-route-stop">
              <span className="hounigo-ds-route-kicker">Date</span>
              <span className="font-mono text-xs sm:text-[13px] font-extrabold text-slate-900 dark:text-white">
                {formatDateIT(accommodation.checkIn)} → {formatDateIT(accommodation.checkOut)} ({numNights} notti)
              </span>
            </div>
          )}

          {displayAddress && (
            <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
              <span className="hounigo-ds-route-kicker">Luogo</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                {displayAddress}
              </span>
            </div>
          )}
        </div>

        {hasOperationalDetails && (
          <div className="hounigo-ds-spec-grid">
            {accommodation.arrivalTime && (
              <div className="hounigo-ds-spec-cell">
                <span className="hounigo-ds-spec-label">Arrivo previsto</span>
                <span className="hounigo-ds-spec-value font-mono">ore {accommodation.arrivalTime}</span>
              </div>
            )}

            {canSeePrivateInfo && (accommodation as any).pinCode && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const pin = (accommodation as any).pinCode;
                  try {
                    await navigator.clipboard.writeText(pin);
                  } catch {
                    try {
                      const ta = document.createElement('textarea');
                      ta.value = pin;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    } catch {}
                  }
                  setCopiedPin(true);
                  setTimeout(() => setCopiedPin(false), 2000);
                }}
                className="hounigo-ds-spec-cell text-left hover:border-slate-400 transition-colors cursor-pointer"
                title="Copia PIN ingresso"
              >
                <span className="hounigo-ds-spec-label">
                  PIN ingresso · {copiedPin ? '✓ Copiato' : 'Copia'}
                </span>
                <span className="hounigo-ds-spec-value font-mono text-amber-900 dark:text-amber-300">
                  {(accommodation as any).pinCode}
                </span>
              </button>
            )}

            {canSeePrivateInfo && accommodation.bookingCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="hounigo-ds-spec-cell text-left hover:border-slate-400 transition-colors cursor-pointer"
                title="Copia codice prenotazione"
              >
                <span className="hounigo-ds-spec-label">
                  Rif. prenotazione · {copiedCode ? '✓ Copiato' : 'Copia'}
                </span>
                <span className="hounigo-ds-spec-value font-mono">
                  {accommodation.bookingCode}
                </span>
              </button>
            )}

            {accommodation.cancellazioneGratuitaEntro && (
              <div className="hounigo-ds-spec-cell">
                <span className="hounigo-ds-spec-label">Condizioni</span>
                <span className="hounigo-ds-spec-value text-emerald-800 dark:text-emerald-300">
                  Canc. gratuita fino al {formatDateIT(accommodation.cancellazioneGratuitaEntro)}
                </span>
              </div>
            )}
          </div>
        )}

        {hasCopilotNotes && accommodation.mostraNoteInCard && (
          <p className="hounigo-ds-note line-clamp-2">
            {displayedCopilotNotes.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: TAGLIANDO STATO ECONOMICO, CHECK-IN/OUT & AZIONI OPERATIVE */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isFree ? (
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <button
              type="button"
              onClick={handleTogglePayment}
              className={`hounigo-ds-pay-badge font-mono ${
                isPaid
                  ? 'hounigo-ds-pay-saldato'
                  : (paidNum > 0 && remainingNum > 0)
                  ? 'hounigo-ds-pay-acconto'
                  : 'hounigo-ds-pay-dasaldare'
              }`}
              title="Tocca per invertire stato: Saldato / Da saldare"
              aria-label="Stato pagamento alloggio"
            >
              {compactPaymentText}
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleToggleCheckIn}
            disabled={!canEdit}
            data-testid={`accommodation-checkin-toggle-${accommodation.id}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-all ${
              accommodation.checkInDone
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
            } ${canEdit ? 'cursor-pointer active:scale-95' : 'cursor-default opacity-80'}`}
            title={canEdit ? 'Tocca per aggiornare lo stato di check-in' : 'Stato check-in alloggio'}
            aria-label={accommodation.checkInDone ? 'Check-in effettuato' : 'Check-in da fare'}
          >
            <span>{accommodation.checkInDone ? '✓ Check-in fatto' : 'Check-in da fare'}</span>
          </button>

          {(accommodation.checkInDone || accommodation.checkOutDone) && (
            <button
              type="button"
              onClick={handleToggleCheckOut}
              disabled={!canEdit}
              data-testid={`accommodation-checkout-toggle-${accommodation.id}`}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-extrabold border transition-all ${
                accommodation.checkOutDone
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-700'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              } ${canEdit ? 'cursor-pointer active:scale-95' : 'cursor-default opacity-80'}`}
              title={canEdit ? 'Tocca per aggiornare lo stato di check-out' : 'Stato check-out alloggio'}
            >
              <span>{accommodation.checkOutDone ? '✓ Check-out fatto' : 'Check-out'}</span>
            </button>
          )}
        </div>

        <div className="hounigo-ds-actions-group">
          {canSeePrivateInfo && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`hounigo-ds-action-btn ${hasCopilotNotes ? 'hounigo-ds-action-btn-active-green' : ''}`}
              title={hasCopilotNotes ? 'Note copilota e istruzioni registrate' : 'Note per il copilota'}
              aria-label="Note Copilota"
            >
              <span className="relative inline-flex items-center">
                <Handshake className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {hasCopilotNotes && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white dark:ring-slate-900" />
                )}
              </span>
              <span className="hounigo-ds-btn-text">Copilota</span>
            </button>
          )}

          {accommodation.phone && (
            <a
              href={`tel:${accommodation.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title={`Chiama la struttura: ${accommodation.phone}`}
              aria-label="Chiama la struttura"
            >
              <span aria-hidden="true">📞</span>
              <span className="hounigo-ds-btn-text">Chiama</span>
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
            aria-label="Voucher e allegati dell'alloggio"
          >
            <span aria-hidden="true">🎟️</span>
            <span className="hounigo-ds-btn-text">Voucher</span>
          </button>

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
        title={`Istruzioni & Note · ${accommodation.name || 'Alloggio'}`}
        noteCopilota={displayedCopilotNotes}
        mostraNoteInCard={accommodation.mostraNoteInCard}
        canEdit={canSeePrivateInfo}
        onSave={async (notes, showOnCard) => {
          if (!canSeePrivateInfo) return;
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = {
              ...accommodation,
              noteCopilota: clean,
              mostraNoteInCard: Boolean(showOnCard),
              updatedAt: Date.now()
            } as any;
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
