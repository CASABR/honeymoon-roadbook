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
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const mapTarget = accommodation.address || accommodation.location || accommodation.name;
  const hasAttachments = Boolean(
    accommodation.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  // Per gli ospiti non autorizzati, maschera eventuali PIN/codici presenti nelle note d'ingresso
  const displayedCopilotNotes = canSeePrivateInfo
    ? copilotNotes
    : copilotNotes.replace(/\b(PIN|codice|keybox|cassaforte|digita)\s*[:=-]?\s*([A-Z0-9#*]{3,12})/gi, '$1: [Riservato]');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-panel cursor-pointer rounded-2xl p-4 sm:p-5 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700"
    >
      {/* TOP: BADGE CATEGORIA, ORARI CHECK-IN/OUT E PULSANTE ISTRUZIONI D'INGRESSO */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-700 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200/80 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30 text-xs font-bold uppercase tracking-wider">
            <span>🛏️</span> Alloggio
          </span>
          {accommodation.sottocategoria && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-xs font-bold">
              <span>{accommodation.sottocategoria.toLowerCase().includes('camp') || accommodation.sottocategoria.toLowerCase().includes('piazz') ? '⛺' : accommodation.sottocategoria.toLowerCase().includes('b&b') ? '🏡' : accommodation.sottocategoria.toLowerCase().includes('appart') ? '🏢' : '🏨'}</span>
              <span>{accommodation.sottocategoria}</span>
            </span>
          )}
          {(accommodation.checkInTime || accommodation.checkOutTime) && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono font-bold">
              {accommodation.checkInTime && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                  🔑 Check-in dalle {accommodation.checkInTime}
                </span>
              )}
              {accommodation.checkOutTime && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600">
                  🏁 Check-out entro {accommodation.checkOutTime}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
            hasCopilotNotes
              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
          }`}
          title="Istruzioni d'ingresso e note operative"
        >
          <span>🧭</span>
          <span>Istruzioni</span>
        </button>
      </div>

      {/* BODY: STRUTTURA, DATE, INDIRIZZO, ORARIO DI ARRIVO E CODICI RISERVATI */}
      <div className="space-y-1.5">
        <h3 className={`font-extrabold text-base sm:text-lg leading-snug tracking-tight text-slate-900 dark:text-white ${isPaid ? 'opacity-95' : ''}`}>
          {accommodation.name}
        </h3>

        {(accommodation.checkIn || accommodation.checkOut) && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-bold">
            <span>📅</span>
            <span>
              {accommodation.checkIn ? formatDateIT(accommodation.checkIn) : ''}
              {accommodation.checkOut ? ` → ${formatDateIT(accommodation.checkOut)}` : ''}
              {(accommodation as any).totalNights ? ` (${(accommodation as any).totalNights} ${(accommodation as any).totalNights === 1 ? 'notte' : 'notti'})` : ''}
            </span>
          </div>
        )}

        <p className="text-xs sm:text-[13px] font-medium leading-relaxed text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5">📍</span>
          <span className="break-words">{accommodation.address || accommodation.location || 'Indirizzo registrato'}</span>
        </p>

        {/* PILLS OPERATIVE: ARRIVO PREVISTO, PIN (SOLO AUTORIZZATI), CANCELLAZIONE */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {accommodation.arrivalTime && (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200 bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60 px-2.5 py-1 rounded-xl">
              <span>🕒</span>
              <span>Arrivo previsto: <strong className="font-mono font-extrabold text-indigo-950 dark:text-white">ore {accommodation.arrivalTime}</strong></span>
            </div>
          )}

          {canSeePrivateInfo && (accommodation as any).pinCode && (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/60 px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-amber-950 dark:text-amber-200">
              <span>🔑 PIN:</span>
              <span>{(accommodation as any).pinCode}</span>
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
                className="ml-1 text-[11px] text-amber-800 dark:text-amber-300 font-sans font-bold hover:underline cursor-pointer"
              >
                {copiedPin ? '✓ Copiato' : 'Copia'}
              </button>
            </div>
          )}

          {accommodation.cancellazioneGratuitaEntro && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/60 px-2.5 py-1 rounded-xl">
              <span>🛡️</span>
              <span>Cancellazione gratuita fino al {formatDateIT(accommodation.cancellazioneGratuitaEntro)}</span>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER: PREZZO / STATO PAGAMENTO A SINISTRA, AZIONI CHIARE A DESTRA */}
      <div className="mt-1 pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isFree ? (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 bg-slate-100 dark:bg-slate-700 dark:text-slate-100 px-2.5 py-1 rounded-lg tabular-nums">
              {displayText}
            </span>
          ) : null}

          {!isFree && costNum > 0 && (
            <button
              type="button"
              onClick={handleTogglePayment}
              className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                isPaid
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700'
              }`}
              title="Clicca per invertire stato: Saldato / Da saldare"
            >
              {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
          {accommodation.phone && (
            <a
              href={`tel:${accommodation.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
              title="Chiama la struttura"
            >
              <span>📞</span>
              <span className="hidden sm:inline">Chiama</span>
            </a>
          )}

          {canSeePrivateInfo && accommodation.bookingCode && (
            <button
              type="button"
              onClick={handleCopyCode}
              title="Copia codice prenotazione"
              className="min-h-[34px] inline-flex items-center gap-1.5 font-mono text-xs font-bold bg-indigo-50/80 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 transition-colors cursor-pointer"
            >
              <span>{copiedCode ? '✓' : '#️⃣'}</span>
              <span>{copiedCode ? 'Copiato' : accommodation.bookingCode}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAttachmentOpen(true);
            }}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer border ${
              hasAttachments
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 dark:border-slate-600'
            }`}
            title="Biglietti e QR / Voucher alloggio"
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
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
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
