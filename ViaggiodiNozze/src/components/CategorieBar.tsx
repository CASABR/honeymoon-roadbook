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
  icon: (active: boolean) => React.ReactNode;
}

const CATEGORIE_ITEMS: CategoriaItem[] = [
  {
    id: 'tappe',
    label: 'Tappe',
    // 📍 Icona pin mappa elegante e sottile
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    )
  },
  {
    id: 'attivita',
    label: 'Attività',
    // 🗓️ Icona calendario con orologio minimale
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <circle
          cx="16"
          cy="16"
          r="3.5"
          className="fill-white/80 dark:fill-slate-900/80"
          stroke="currentColor"
          strokeWidth={active ? "2" : "1.6"}
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M16 14.5v1.5l1 1"
        />
      </svg>
    )
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    // 🍽️ Icona forchetta e coltello da ristorazione
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Forchetta a 3 punte */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M6 3v5a2 2 0 002 2v11M10 3v5a2 2 0 01-2 2M8 3v5"
        />
        {/* Coltello affusolato */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M17 3v9a2 2 0 01-2 2v7M17 3c1.8 1.2 2 5.5 2 9h-2"
        />
      </svg>
    )
  },
  {
    id: 'alloggi',
    label: 'Alloggi',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M3 7v13M21 15v5M3 15h18M3 11h18a2 2 0 012 2v2H3v-2a2 2 0 012-2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M6.5 11a1.5 1.5 0 011.5-1.5h2a1.5 1.5 0 011.5 1.5"
        />
      </svg>
    )
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M6 3v5a2 2 0 002 2v11M10 3v5a2 2 0 01-2 2M8 3v5"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M17 3v9a2 2 0 01-2 2v7M17 3c1.8 1.2 2 5.5 2 9h-2"
        />
      </svg>
    )
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M3 12.5l7 1.5 4-8.5 2 1-2.5 8 5.5 1.5 2-2.5 1.5.5-1 3.5 1 3.5-1.5.5-2-2.5-5.5 1.5 2.5 8-2 1-4-8.5-7 1.5z"
        />
      </svg>
    )
  },
  {
    id: 'attivita',
    label: 'Attività',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <circle
          cx="16"
          cy="16"
          r="3.5"
          className="fill-white/80 dark:fill-slate-900/80"
          stroke="currentColor"
          strokeWidth={active ? "2" : "1.6"}
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M16 14.5v1.5l1 1"
        />
      </svg>
    )
  },
  {
    id: 'tappe',
    label: 'Tappe',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    )
  },
  {
    id: 'spese',
    label: 'Spese / Budget',
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect
          x="2"
          y="5"
          width="20"
          height="14"
          rx="2"
          strokeWidth={active ? "2" : "1.6"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="2"
          y1="10"
          x2="22"
          y2="10"
          strokeWidth={active ? "2" : "1.6"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
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

          <div className="grid grid-cols-3 gap-2.5">
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
                  className={`group flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all duration-150 cursor-pointer min-h-[64px] border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20 scale-[1.02]'
                      : 'bg-slate-50/80 hover:bg-slate-100/90 text-slate-700 border-slate-200/60 hover:border-slate-300 active:scale-95'
                  }`}
                >
                  <div className={`transition-transform duration-150 mb-1 ${isActive ? 'text-white' : 'text-slate-700 group-hover:scale-110'}`}>
                    {item.icon(isActive)}
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
