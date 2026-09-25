import { useEffect } from 'react';
import type { CategoriaTab } from '../types';

interface CategorieDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategoria: (cat: CategoriaTab) => void;
  activeCategoria: CategoriaTab | null;
}

interface CategoriaItem {
  id: CategoriaTab;
  label: string;
  sublabel: string;
  icon: string;
  colorClass: string;
  bgLightClass: string;
  borderClass: string;
}

const CATEGORIE: CategoriaItem[] = [
  {
    id: 'tappe',
    label: 'Tappe',
    sublabel: 'Punti di passaggio, soste foto e riferimenti',
    icon: '📍',
    colorClass: 'text-emerald-700',
    bgLightClass: 'bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/25',
    borderClass: 'border-emerald-500/20'
  },
  {
    id: 'attivita',
    label: 'Attività',
    sublabel: 'Tour, visite ed esperienze organizzate',
    icon: '🗓️',
    colorClass: 'text-amber-700',
    bgLightClass: 'bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/25',
    borderClass: 'border-amber-500/20'
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    sublabel: 'Luoghi dove mangiare e prenotazioni',
    icon: '🍽️',
    colorClass: 'text-orange-700',
    bgLightClass: 'bg-orange-500/10 hover:bg-orange-500/20 active:bg-orange-500/25',
    borderClass: 'border-orange-500/20'
  },
  {
    id: 'alloggi',
    label: 'Alloggi',
    sublabel: 'Hotel, resort, check-in e recapiti',
    icon: '🏨',
    colorClass: 'text-purple-700',
    bgLightClass: 'bg-purple-500/10 hover:bg-purple-500/20 active:bg-purple-500/25',
    borderClass: 'border-purple-500/20'
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    sublabel: 'Voli, treni, camper, auto e noleggi',
    icon: '✈️',
    colorClass: 'text-blue-700',
    bgLightClass: 'bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/25',
    borderClass: 'border-blue-500/20'
  }
];

export default function CategorieDrawer({
  isOpen,
  onClose,
  onSelectCategoria,
  activeCategoria
}: CategorieDrawerProps) {
  // Blocco dello scroll del body quando il drawer è aperto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop sfumato cliccabile per chiudere */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Pannello Drawer dal basso */}
      <div
        className="relative w-full max-w-md mx-auto bg-slate-900 border-t border-slate-800 text-white rounded-t-3xl shadow-2xl z-10 flex flex-col pb-6 px-4 pt-3 animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Menu Categorie"
      >
        {/* Handle trascinamento / tocco mobile */}
        <div className="w-12 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-3 cursor-pointer" onClick={onClose} />

        {/* Header Drawer */}
        <div className="flex items-center justify-between px-1 mb-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>🗂️</span> Categorie di Viaggio
            </h2>
            <p className="text-[11px] text-slate-400">
              Scegli la sezione da consultare o gestire
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Chiudi Categorie"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 5 Pulsanti Categorie */}
        <div className="flex flex-col gap-2.5 mt-1">
          {CATEGORIE.map((cat) => {
            const isSelected = activeCategoria === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  onSelectCategoria(cat.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left cursor-pointer active:scale-[0.98] ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-500 shadow-md shadow-amber-500/10'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 border ${cat.bgLightClass} ${cat.borderClass}`}
                  >
                    {cat.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        {cat.label}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                          Attiva
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 line-clamp-1">
                      {cat.sublabel}
                    </p>
                  </div>
                </div>

                <div className="text-slate-500 pl-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
