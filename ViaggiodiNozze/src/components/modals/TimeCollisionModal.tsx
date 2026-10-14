import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineItem } from '../../types';

export interface TimeCollision {
  id: string; // key univoca della collisione es: `collision_${itemA.id}_${itemB.id}`
  time: string;
  itemA: TimelineItem;
  itemB: TimelineItem;
}

interface TimeCollisionModalProps {
  collision: TimeCollision | null;
  onKeepBoth: () => void;
  onDeleteItem: (itemId: string, itemType: string) => Promise<void>;
  onDismiss: () => void;
}

/**
 * Valuta la completezza informativa di un elemento in base a dati concreti verificabili
 */
function evaluateCompleteness(item: TimelineItem) {
  let score = 0;
  const reasons: string[] = [];
  const raw = item.originalData || {};

  // 1. Voucher, biglietti o allegati (+4)
  const attachments = raw.attachments || (raw as any).tickets || [];
  const hasQRCode = Boolean(raw.qrCode || raw.bookingCode || raw.pnr);
  if (attachments.length > 0 || hasQRCode) {
    score += 4;
    reasons.push(attachments.length > 0 ? 'include voucher/allegati' : 'ha codice/PNR');
  }

  // 2. Indirizzo o posizione specifica (+2)
  const loc = item.location || raw.address || raw.indirizzo || raw.departureLocation;
  if (loc && loc.trim().length > 3) {
    score += 2;
    reasons.push('ha indirizzo completo');
  }

  // 3. Durata o orari di arrivo/fine (+2)
  if (raw.duration || raw.orarioInizio || raw.checkOutTime || raw.arrivalTime || raw.departureTime) {
    score += 2;
    reasons.push('orario e durata dettagliati');
  }

  // 4. Descrizione, note o dettagli operativi (+2)
  const desc = raw.description || raw.descrizione || raw.notes || raw.nota || raw.noteCopilota || item.noteCopilota;
  if (desc && desc.trim().length > 10) {
    score += 2;
    reasons.push('descrizione e note');
  }

  // 5. Prezzo e stato economico specificati (+1)
  if (raw.cost || raw.budget || raw.price || raw.paymentStatus) {
    score += 1;
  }

  return { score, reasons };
}

export default function TimeCollisionModal({
  collision,
  onKeepBoth,
  onDeleteItem,
  onDismiss
}: TimeCollisionModalProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedA, setExpandedA] = useState(false);
  const [expandedB, setExpandedB] = useState(false);

  // Blocca lo scroll del body quando il popup è aperto e ripristina esattamente lo stato precedente
  useEffect(() => {
    if (!collision) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [collision, onDismiss]);

  if (!collision) return null;

  const { itemA, itemB, time } = collision;

  const compA = evaluateCompleteness(itemA);
  const compB = evaluateCompleteness(itemB);

  // Determina quale elemento ha oggettivamente più informazioni
  let winner: 'A' | 'B' | 'equal' = 'equal';
  let winnerReason = '';
  if (compA.score > compB.score && compA.score - compB.score >= 2) {
    winner = 'A';
    winnerReason = compA.reasons.slice(0, 2).join(' e ');
  } else if (compB.score > compA.score && compB.score - compA.score >= 2) {
    winner = 'B';
    winnerReason = compB.reasons.slice(0, 2).join(' e ');
  }

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case 'trasporto': return '✈️ Trasporto';
      case 'attivita': return '🎟️ Attività';
      case 'ristorante': return '🍽️ Ristorante';
      case 'tappa': return '📍 Tappa';
      case 'shopping': return '🛍️ Shopping';
      case 'alloggio': return '🏨 Alloggio';
      default: return '📌 Evento';
    }
  };

  const handleDeleteItem = async (toKeep: TimelineItem, toDelete: TimelineItem) => {
    if (confirm(`Confermi di voler mantenere "${toKeep.title}" ed eliminare "${toDelete.title}"?`)) {
      setDeletingId(toDelete.id);
      try {
        await onDeleteItem(toDelete.id, toDelete.type);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const renderMiniCard = (
    item: TimelineItem,
    otherItem: TimelineItem,
    isWinner: boolean,
    expanded: boolean,
    setExpanded: (v: boolean) => void
  ) => {
    const raw = item.originalData || {};
    const loc = item.location || raw.address || raw.indirizzo || raw.departureLocation || '';
    const desc = raw.description || raw.descrizione || raw.notes || raw.nota || '';
    const attachmentsCount = (raw.attachments?.length || 0);
    const bookingCode = (raw.bookingCode || raw.pnr || raw.pinCode || '').trim();
    const priceText = raw.cost || raw.budget ? `${raw.cost || raw.budget}` : '';
    const isFree = raw.isFree || raw.status === 'gratuito' || raw.cost === '0' || raw.cost === '0 €';
    const isPackage = raw.isPackageIncluded || raw.inclusoPacchetto;

    return (
      <div className={`rounded-2xl p-3.5 sm:p-4 border transition-all flex flex-col justify-between ${
        isWinner
          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60 shadow-sm'
          : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700'
      }`}>
        <div className="space-y-2">
          {/* Top badges */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {getItemTypeLabel(item.type)}
            </span>
            <div className="flex items-center gap-1.5">
              {isWinner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  ⭐ Più completa {winnerReason ? `(${winnerReason})` : ''}
                </span>
              )}
              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                {item.time}
              </span>
            </div>
          </div>

          {/* Title */}
          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
            {item.title}
          </h4>

          {/* Location */}
          {loc && (
            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 line-clamp-1">
              <span>📍</span>
              <span className="truncate">{loc}</span>
            </p>
          )}

          {/* Extra details row */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            {bookingCode && (
              <span className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px]">
                Cod: {bookingCode}
              </span>
            )}
            {attachmentsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                📎 {attachmentsCount} allegat{attachmentsCount === 1 ? 'o' : 'i'}
              </span>
            )}
            {isPackage ? (
              <span className="text-sky-600 dark:text-sky-400 font-medium">
                Incluso pacchetto
              </span>
            ) : isFree ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Gratuito
              </span>
            ) : priceText ? (
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {priceText}
              </span>
            ) : null}
          </div>

          {/* Collapsible notes/description */}
          {desc && (
            <div className="pt-1">
              {expanded ? (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/70 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700 leading-relaxed whitespace-pre-line">
                  {desc}
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {desc}
                </p>
              )}
              {desc.length > 80 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 cursor-pointer"
                >
                  {expanded ? 'Mostra meno' : 'Mostra dettagli'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action: Mantieni questa ed elimina l'altra */}
        <div className="pt-3 mt-3 border-t border-slate-200/70 dark:border-slate-700/70 flex justify-end">
          <button
            type="button"
            disabled={deletingId === otherItem.id}
            onClick={() => handleDeleteItem(item, otherItem)}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-800 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-300 dark:border-slate-600 hover:border-rose-300 dark:hover:border-rose-800 transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span>✓</span>
            <span>
              {deletingId === otherItem.id ? 'Eliminazione in corso...' : `Mantieni questa ed elimina l'altra`}
            </span>
          </button>
        </div>
      </div>
    );
  };

  const modalNode = (
    <div 
      className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs select-none"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
      }}
    >
      {/* Backdrop overlay per click to dismiss */}
      <div 
        className="absolute inset-0 bg-transparent cursor-pointer" 
        onClick={onDismiss} 
        aria-hidden="true" 
      />
      
      {/* Dialog box centrato nella viewport */}
      <div 
        className="relative z-10 bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 max-w-xl w-full shadow-2xl border border-slate-200/90 dark:border-slate-800 space-y-3.5 flex flex-col pointer-events-auto"
        style={{
          maxHeight: 'calc(100dvh - 32px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Modale */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                Attività Sovrapposte
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rilevate due voci concomitanti alle ore <span className="font-mono font-bold text-amber-700 dark:text-amber-300">{time}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-xs cursor-pointer transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Info confronto */}
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed shrink-0">
          {winner === 'equal' ? (
            <p>Entrambe le schede presentano un livello di dettaglio analogo. Puoi scegliere quale mantenere oppure conservarle entrambe.</p>
          ) : (
            <p>
              La scheda con il badge <span className="font-semibold text-amber-700 dark:text-amber-300">⭐ Più completa</span> ha informazioni più dettagliate ({winnerReason}), ma puoi scegliere liberamente quale mantenere.
            </p>
          )}
        </div>

        {/* Mini-cards comparative con scroll autonomo su schermi bassi */}
        <div 
          className="space-y-3 pr-1 py-1 flex-1 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {renderMiniCard(itemA, itemB, winner === 'A', expandedA, setExpandedA)}
          {renderMiniCard(itemB, itemA, winner === 'B', expandedB, setExpandedB)}
        </div>

        {/* Pulsanti di Azione Generale */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onKeepBoth}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#172033] hover:bg-[#23304d] dark:bg-white dark:hover:bg-slate-100 text-white dark:text-[#172033] shadow-md transition-all text-center cursor-pointer"
          >
            ✓ Mantieni entrambe
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-center cursor-pointer"
          >
            Annulla
          </button>
        </div>

      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
}
