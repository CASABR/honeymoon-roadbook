import { useEffect, type ReactNode } from 'react';
import type { CategoriaTab } from '../types';
import {
  TrailTappe,
  TrailAttivita,
  TrailRistoranti,
  TrailAlloggi,
  TrailTrasporti,
  TrailShopping
} from './icons/TrailIcons';

interface CategorieBarProps {
  activeCategoria: CategoriaTab | null;
  onSelectCategoria: (cat: CategoriaTab) => void;
  onClose: () => void;
}

interface CategoriaItem {
  id: CategoriaTab;
  label: string;
  renderIcon: (active: boolean) => ReactNode;
}

const CATEGORIE_ITEMS: CategoriaItem[] = [
  {
    id: 'tappe',
    label: 'Tappe',
    renderIcon: (active) => <TrailTappe size={22} active={active} />
  },
  {
    id: 'attivita',
    label: 'Attività',
    renderIcon: (active) => <TrailAttivita size={22} active={active} />
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    renderIcon: (active) => <TrailRistoranti size={22} active={active} />
  },
  {
    id: 'alloggi',
    label: 'Alloggi',
    renderIcon: (active) => <TrailAlloggi size={22} active={active} />
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    renderIcon: (active) => <TrailTrasporti size={22} active={active} />
  },
  {
    id: 'shopping',
    label: 'Shopping',
    renderIcon: (active) => <TrailShopping size={22} active={active} />
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
      {/* Overlay trasparente e leggero di sfondo */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dock popup a 2 file da 3 icone */}
      <div className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto z-50 animate-slide-up">
        <div className="bg-[#F8F7F3] dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 backdrop-blur-xl rounded-3xl p-3.5 shadow-2xl">
          <div className="flex items-center justify-between px-2 mb-2 pb-1.5 border-b border-slate-200/80 dark:border-slate-800">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#172033] dark:text-slate-200 flex items-center gap-1.5 font-sans">
              <span>🧭</span> Categorie Roadbook
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold p-1 rounded-lg cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-1 font-sans">
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
                      ? 'bg-[#172033] dark:bg-white text-white dark:text-[#172033] border-[#172033] dark:border-white shadow-md shadow-[#172033]/20 scale-[1.02]'
                      : 'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#172033] dark:text-white border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 active:scale-95'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-1.5 transition-transform duration-150 ${
                    isActive 
                      ? 'bg-[#FF6B5F] text-white shadow-xs' 
                      : 'bg-[#F8F7F3] dark:bg-slate-700/80 text-[#172033] dark:text-white border border-slate-200/60 dark:border-slate-600 group-hover:scale-105'
                  }`}>
                    {item.renderIcon(isActive)}
                  </div>
                  <span className={`text-[11px] font-extrabold text-center leading-tight truncate w-full ${isActive ? 'text-white dark:text-[#172033]' : 'text-slate-800 dark:text-slate-200'}`}>
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
