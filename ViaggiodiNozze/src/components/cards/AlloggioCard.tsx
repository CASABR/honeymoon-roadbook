import React, { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import type { Alloggio } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';

interface AlloggioCardProps {
  accommodation: Alloggio;
  onUpdate?: (updated: Alloggio) => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
}

export default function AlloggioCard({ accommodation, onEdit, onUpdate, onDetail }: AlloggioCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const copilotData = (accommodation as any).noteCopilota || (accommodation as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  
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
      className="hounigo-panel cursor-pointer rounded-2xl p-3.5 sm:p-4 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700"
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[11px] font-semibold uppercase tracking-wider">
            <span className="text-sm">🛏️</span> Alloggio
          </span>
          {accommodation.sottocategoria && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-[10px] font-bold tracking-wide">
              <span>{accommodation.sottocategoria.toLowerCase().includes('camp') || accommodation.sottocategoria.toLowerCase().includes('piazz') ? '⛺' : accommodation.sottocategoria.toLowerCase().includes('b&b') ? '🏡' : accommodation.sottocategoria.toLowerCase().includes('appart') ? '🏢' : '🏨'}</span>
              <span>{accommodation.sottocategoria}</span>
            </span>
          )}
          {(accommodation.checkInTime || accommodation.arrivalTime || accommodation.checkOutTime) && (
            <div className="flex items-center gap-1.5 ml-1 flex-wrap text-xs">
              {accommodation.checkInTime && (
                <span className="text-slate-600 dark:text-slate-300">
                  In {accommodation.checkInTime}
                </span>
              )}
              {accommodation.arrivalTime && (
                <span className="inline-flex items-center gap-1 font-bold px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                  <span>🧳</span>
                  <span>Arrivo {accommodation.arrivalTime}</span>
                </span>
              )}
              {accommodation.checkOutTime && (
                <span className="text-slate-600 dark:text-slate-300">
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
        </div>
      </div>

      {/* BODY */}
      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className={`font-semibold text-base leading-snug tracking-tight text-slate-900 dark:text-white ${isPaid ? 'opacity-90' : ''}`}>
            {accommodation.name}
          </h3>
        </div>
        
        {(accommodation.checkIn || accommodation.checkOut) && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-semibold mt-1">
            <span>📅</span>
            <span>
              {accommodation.checkIn ? formatDateIT(accommodation.checkIn) : ''}
              {accommodation.checkOut ? ` → ${formatDateIT(accommodation.checkOut)}` : ''}
              {(accommodation as any).totalNights ? ` (${(accommodation as any).totalNights} ${(accommodation as any).totalNights === 1 ? 'notte' : 'notti'})` : ''}
            </span>
          </div>
        )}

        <p className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300 truncate mt-1 flex items-center gap-1">
          <span>📍</span>
          <span className="truncate">{accommodation.address || accommodation.location || 'Indirizzo registrato'}</span>
        </p>

        {(accommodation as any).pinCode && (
          <div className="flex items-center gap-2 mt-2 w-fit">
            <div className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-amber-900 dark:text-amber-200">
              <span>🔑 PIN:</span>
              <span>{(accommodation as any).pinCode}</span>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText((accommodation as any).pinCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
                className="ml-1 text-[10px] text-amber-800 dark:text-amber-300 font-sans hover:underline cursor-pointer"
              >
                {copied ? '✓ Copiato' : '📋 Copia'}
              </button>
            </div>
          </div>
        )}

        {accommodation.arrivalTime && (
          <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 px-2.5 py-1 rounded-xl w-fit mt-2">
            <span>🕒</span>
            <span>Mio arrivo previsto: <span className="font-extrabold text-indigo-900 dark:text-white">ore {accommodation.arrivalTime}</span></span>
            {accommodation.checkInTime && (
              <span className="text-slate-500 dark:text-slate-400 font-normal text-[10px]">
                (Check-in struttura: dalle {accommodation.checkInTime})
              </span>
            )}
          </div>
        )}

        {accommodation.cancellazioneGratuitaEntro && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/60 px-2 py-0.5 rounded-lg w-fit mt-2">
            <span>🛡️</span>
            <span>Cancellazione gratuita fino al {formatDateIT(accommodation.cancellazioneGratuitaEntro)}</span>
          </div>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isFree ? (
            <span className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
              Gratuito
            </span>
          ) : (
            <span className="text-sm font-semibold text-slate-900 bg-slate-100 dark:bg-slate-700 dark:text-slate-100 px-2 py-1 rounded-md">
              {displayText}
            </span>
          )}

          {!isFree && (
            <button
              type="button"
              onClick={handleTogglePayment}
              className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs ${
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
          {(() => {
            const hasQrOrAttachment = Boolean(
              accommodation.bookingCode?.trim() ||
              (accommodation as any).pinCode?.trim() ||
              (accommodation.attachments && accommodation.attachments.length > 0)
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
                title="Voucher / Allegati / QR"
              >
                <span className="text-[10px]">🎫</span> Voucher/QR
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
