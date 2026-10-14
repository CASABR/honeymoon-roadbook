import { useState } from 'react';
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

export default function TimeCollisionModal({
  collision,
  onKeepBoth,
  onDeleteItem,
  onDismiss
}: TimeCollisionModalProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!collision) return null;

  const { itemA, itemB, time } = collision;

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case 'trasporto': return '✈️ Trasporto / Spostamento';
      case 'attivita': return '🎟️ Attività / Tour';
      case 'ristorante': return '🍽️ Ristorante / Tavolo';
      case 'tappa': return '📍 Tappa Itinerario';
      case 'shopping': return '🛍️ Shopping';
      case 'alloggio': return '🏨 Alloggio';
      default: return '📌 Evento';
    }
  };

  const handleDelete = async (item: TimelineItem) => {
    if (confirm(`Sei sicuro di voler eliminare definitivamente "${item.title}"?`)) {
      setDeletingId(item.id);
      try {
        await onDeleteItem(item.id, item.type);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onDismiss} />
      
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 z-10 animate-in zoom-in-95 duration-200">
        
        {/* Header Modale */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                Possibile Sovrapposizione Oraria
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rilevate 2 schede programmate alle ore <span className="font-mono font-bold text-amber-700 dark:text-amber-300">{time}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-xs cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Ci sono due voci previste per lo stesso orario. Vuoi mantenerle entrambe oppure rimuoverne una?
        </p>

        {/* Confronto Schede */}
        <div className="space-y-3">
          {/* Card A */}
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {getItemTypeLabel(itemA.type)}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                {itemA.time}
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {itemA.title}
              </h4>
              {itemA.location && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  📍 {itemA.location}
                </p>
              )}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={deletingId === itemA.id}
                onClick={() => handleDelete(itemA)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 transition-all cursor-pointer disabled:opacity-50"
              >
                {deletingId === itemA.id ? 'Eliminazione...' : '🗑️ Elimina questa'}
              </button>
            </div>
          </div>

          {/* Card B */}
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {getItemTypeLabel(itemB.type)}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                {itemB.time}
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {itemB.title}
              </h4>
              {itemB.location && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  📍 {itemB.location}
                </p>
              )}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={deletingId === itemB.id}
                onClick={() => handleDelete(itemB)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 transition-all cursor-pointer disabled:opacity-50"
              >
                {deletingId === itemB.id ? 'Eliminazione...' : '🗑️ Elimina questa'}
              </button>
            </div>
          </div>
        </div>

        {/* Pulsanti di Azione Generale */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
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
            Decidi in seguito
          </button>
        </div>

      </div>
    </div>
  );
}
