import { useEffect } from 'react';
import type { CategoriaTab } from '../../types';

interface AddMenuProps {
  onClose: () => void;
  onOpenSmartInsert: () => void;
  onOpenManual: (cat: CategoriaTab) => void;
}

export default function AddMenu({ onClose, onOpenSmartInsert, onOpenManual }: AddMenuProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-xs animate-fade-in" onClick={onClose} />
      
      <div className="fixed bottom-24 left-4 right-4 max-w-sm mx-auto z-50 animate-slide-up">
        <div className="hounigo-panel backdrop-blur-xl rounded-3xl p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#e5e3dd]">
            <span className="hounigo-section-kicker">
              Aggiungi al Viaggio
            </span>
            <button onClick={onClose} className="text-slate-400 font-bold p-1">✕</button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { onClose(); onOpenSmartInsert(); }}
              className="hounigo-button-primary w-full flex items-center gap-3 p-4 rounded-2xl active:scale-95 transition-all"
            >
              <div className="text-2xl">✨</div>
              <div className="text-left">
                <div className="font-bold">Inserimento rapido AI</div>
                <div className="text-xs text-white/80">Scansione appunti, PDF e conferme</div>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => { onClose(); onOpenManual('tappe'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>📍</span> Tappa
              </button>
              <button onClick={() => { onClose(); onOpenManual('attivita'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>🎯</span> Attività
              </button>
              <button onClick={() => { onClose(); onOpenManual('alloggi'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>🛏️</span> Alloggio
              </button>
              <button onClick={() => { onClose(); onOpenManual('trasporti'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>✈️</span> Trasporto
              </button>
              <button onClick={() => { onClose(); onOpenManual('ristoranti'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>🍽️</span> Ristorante
              </button>
              <button onClick={() => { onClose(); onOpenManual('shopping'); }} className="hounigo-button-secondary flex items-center gap-2 p-3 rounded-xl hover:bg-[#f1eee7] text-sm font-semibold active:scale-95">
                <span>🛍️</span> Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
