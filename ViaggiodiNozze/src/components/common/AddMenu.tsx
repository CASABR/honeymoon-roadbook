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
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/80 p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Aggiungi al Viaggio
            </span>
            <button onClick={onClose} className="text-slate-400 font-bold p-1">✕</button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { onClose(); onOpenSmartInsert(); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
            >
              <div className="text-2xl">✨</div>
              <div className="text-left">
                <div className="font-bold">Inserimento rapido AI</div>
                <div className="text-xs text-violet-200">Scansione appunti, PDF e conferme</div>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => { onClose(); onOpenManual('tappe'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>📍</span> Tappa
              </button>
              <button onClick={() => { onClose(); onOpenManual('attivita'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>🎯</span> Attività
              </button>
              <button onClick={() => { onClose(); onOpenManual('alloggi'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>🛏️</span> Alloggio
              </button>
              <button onClick={() => { onClose(); onOpenManual('trasporti'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>✈️</span> Trasporto
              </button>
              <button onClick={() => { onClose(); onOpenManual('ristoranti'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>🍽️</span> Ristorante
              </button>
              <button onClick={() => { onClose(); onOpenManual('shopping'); }} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-sm font-semibold active:scale-95">
                <span>🛍️</span> Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
