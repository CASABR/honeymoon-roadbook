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
    // 🛏️ Icona letto con cuscino
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Struttura letto */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M3 7v13M21 15v5M3 15h18M3 11h18a2 2 0 012 2v2H3v-2a2 2 0 012-2z"
        />
        {/* Cuscino */}
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
    id: 'trasporti',
    label: 'Trasporti',
    // ✈️ Icona aereo pulita e fedele
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
    id: 'shopping',
    label: 'Shopping',
    // 🛍️ Icona borsa della spesa elegante
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
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
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dock orizzontale a capsula fluttuante in stile Light Glassmorphism */}
      <div className="fixed bottom-5 left-3 right-3 max-w-lg mx-auto z-50 animate-slide-up">
        <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-full px-2 sm:px-3 py-2 flex items-center justify-between">
          {/* I 6 elementi distribuiti orizzontalmente in modo uniforme */}
          <div className="flex items-center justify-around w-full gap-0.5">
            {CATEGORIE_ITEMS.map((item) => {
              const isActive = activeCategoria === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectCategoria(item.id)}
                  className={`group relative flex-1 flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition-all duration-150 cursor-pointer min-h-[44px] hover:scale-105 active:scale-95 hover:bg-slate-900/10 dark:hover:bg-white/15 ${
                    isActive ? 'bg-slate-900/5 dark:bg-white/10' : ''
                  }`}
                >
                  {/* Icona */}
                  <div
                    className={`relative z-10 transition-all duration-150 ${
                      isActive
                        ? 'text-slate-900 dark:text-white scale-105 font-bold'
                        : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  >
                    {item.icon(isActive)}
                  </div>

                  {/* Micro-etichetta */}
                  <span
                    className={`relative z-10 text-[10px] sm:text-[11px] font-medium tracking-tight mt-0.5 truncate transition-colors duration-150 ${
                      isActive
                        ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  >
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
