import { useEffect } from 'react';
import type { CategoriaTab } from '../types';

interface CategorieBarProps {
  activeCategoria: CategoriaTab | null;
  onSelectCategoria: (cat: CategoriaTab) => void;
  onClose: () => void;
}

interface CategoriaItem {
  id: CategoriaTab;
  label: string;
  icon: string;
  accent: {
    bg: string;
    text: string;
    border: string;
    activeBg: string;
  };
}

const CATEGORIE_ITEMS: CategoriaItem[] = [
  {
    id: 'tappe',
    label: 'Tappe',
    icon: '📍',
    accent: {
      bg: 'bg-rose-50',
      text: 'text-rose-600',
      border: 'border-rose-100',
      activeBg: 'bg-rose-500'
    }
  },
  {
    id: 'attivita',
    label: 'Attività',
    icon: '🎯',
    accent: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-100',
      activeBg: 'bg-amber-500'
    }
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    icon: '🍽️',
    accent: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
      activeBg: 'bg-emerald-500'
    }
  },
  {
    id: 'alloggi',
    label: 'Alloggi',
    icon: '🛏️',
    accent: {
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-100',
      activeBg: 'bg-purple-500'
    }
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    icon: '✈️',
    accent: {
      bg: 'bg-sky-50',
      text: 'text-sky-600',
      border: 'border-sky-100',
      activeBg: 'bg-sky-500'
    }
  },
  {
    id: 'shopping',
    label: 'Shopping / Extra',
    icon: '🛍️',
    accent: {
      bg: 'bg-pink-50',
      text: 'text-pink-600',
      border: 'border-pink-100',
      activeBg: 'bg-pink-500'
    }
  }
];

export default function CategorieBar({
  activeCategoria,
  onSelectCategoria,
  onClose
}: CategorieBarProps) {
  // Chiudi premendo Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Overlay trasparente e leggero di sfondo (cliccare fuori chiude il dock) */}
      <div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dock popup a 2 file da 3 icone */}
      <div className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto z-50 animate-slide-up">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/80 p-3.5">
          <div className="flex items-center justify-between px-2 mb-2 pb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>🗂️</span> Categorie Viaggio
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 rounded-lg"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 p-1">
            {CATEGORIE_ITEMS.map((item) => {
              const isActive = activeCategoria === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectCategoria(item.id);
                    onClose();
                  }}
                  className={`group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-150 cursor-pointer min-h-[76px] border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20 scale-[1.02]'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/70 hover:border-slate-300 shadow-xs active:scale-95'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-1.5 transition-transform duration-150 ${
                    isActive 
                      ? `${item.accent.activeBg} text-white shadow-xs` 
                      : `${item.accent.bg} ${item.accent.text} border ${item.accent.border} group-hover:scale-105`
                  }`}>
                    {item.icon}
                  </div>
                  <span className={`text-[11px] font-bold text-center leading-tight truncate w-full ${isActive ? 'text-white' : 'text-slate-800'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
