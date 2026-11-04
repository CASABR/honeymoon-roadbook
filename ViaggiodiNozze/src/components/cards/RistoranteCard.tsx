import type { Ristorante } from '../../types';
import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';

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
  const time = ristorante.orario || (ristorante as any).time;
  const hasQrOrAttachment = Boolean(
    (ristorante as any).qrCode?.trim() ||
    ristorante.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  return (
    <div
      onClick={onDetail || onEdit}
      className={`hounigo-panel cursor-pointer rounded-2xl hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700 ${
        isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'
      }`}
    >
      {/* TOP */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-700/50 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200/80 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30 text-xs font-bold tracking-wider uppercase">
            <span>🍽️</span> Ristorante
          </span>
          {ristorante.sottocategoria && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-xs font-bold">
              <span>{ristorante.sottocategoria.toLowerCase().includes('cena') ? '🍷' : ristorante.sottocategoria.toLowerCase().includes('pranzo') ? '🥗' : ristorante.sottocategoria.toLowerCase().includes('colaz') ? '☕' : '🍴'}</span>
              <span>{ristorante.sottocategoria}</span>
            </span>
          )}
          {time ? (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
              ristorante.timeStatus === 'indicativo'
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                : 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600'
            }`}>
              ⏰ Ore {time}{ristorante.timeStatus === 'indicativo' ? ' · indicativo' : ''}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Orario non specificato</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
            hasCopilotNotes
              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
          }`}
          title="Apri note Copilota"
        >
          <span>🧭</span>
          <span>Note</span>
        </button>
      </div>

      {/* BODY */}
      <div className="space-y-1.5">
        <h3 className={`text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug ${isPaid ? 'opacity-90' : ''}`}>
          {ristorante.nome}
        </h3>
        {mapTarget && (
          <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 font-medium leading-relaxed flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">📍</span>
            <span className="break-words">{mapTarget}</span>
          </p>
        )}
      </div>

      {/* BOTTOM */}
      <div className="mt-0.5 pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isFree ? (
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">
              Gratuito
            </span>
          ) : costNum > 0 ? (
            <span className="text-slate-900 dark:text-white font-extrabold bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg text-xs sm:text-sm tabular-nums">
              {costNum.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
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
          {ristorante.telefono && (
            <a
              href={`tel:${ristorante.telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
            >
              📞
            </a>
          )}
          {ristorante.linkPrenotazione && (
            <a
              href={ristorante.linkPrenotazione}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Prenota ↗
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAttachmentOpen(true);
            }}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer border ${
              hasQrOrAttachment
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 dark:border-slate-600'
            }`}
            title="Biglietti e QR / Voucher"
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
