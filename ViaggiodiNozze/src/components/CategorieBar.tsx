import type { CategoriaTab } from '../types';

interface CategorieBarProps {
  activeCategoria: CategoriaTab | null;
  onSelectCategoria: (cat: CategoriaTab) => void;
  onClose?: () => void;
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
    // Icona pin mappa minimale
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    )
  },
  {
    id: 'attivita',
    label: 'Attività',
    // Icona calendario con orologio minimale
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <circle
          cx="16.5"
          cy="16.5"
          r="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.6"}
          d="M16.5 15.5v1.2l.8.8"
        />
      </svg>
    )
  },
  {
    id: 'ristoranti',
    label: 'Ristoranti',
    // Icona forchetta e coltello
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Forchetta */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M7 3v6a2 2 0 002 2h0a2 2 0 002-2V3M9 3v8m0 0v10"
        />
        {/* Coltello */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M16 3v9a2 2 0 01-2 2h0m2-11a3 3 0 013 3v8a2 2 0 01-2 2v5"
        />
      </svg>
    )
  },
  {
    id: 'alloggi',
    label: 'Alloggi',
    // Icona letto
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M3 7v14M21 17v4M3 17h18M3 13h18a2 2 0 002-2V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4"
        />
        <circle
          cx="6.5"
          cy="10.5"
          r="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.7"}
        />
      </svg>
    )
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    // Icona auto con aereo / aereo + mobilità
    icon: (active) => (
      <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Sagoma aereo stilizzata / auto */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2.2" : "1.7"}
          d="M12 3l2 4 5 .5-3.5 3.5 1 5L12 14l-4.5 2 1-5L5 7.5 10 7l2-4z"
        />
        {/* Percorso o ruote veicolo inferiore */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? "2" : "1.5"}
          d="M4 20h16M7 20a1 1 0 11-2 0 1 1 0 012 0zm12 0a1 1 0 11-2 0 1 1 0 012 0z"
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
  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-50 animate-slide-up">
      <div className="bg-slate-900/85 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/60 rounded-3xl px-3 py-2.5 flex items-center justify-between gap-1">
        {/* Tasto Ritorno / Back veloce a sinistra */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Chiudi Categorie / Torna al menu principale"
            className="group flex flex-col items-center justify-center p-1.5 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0 mr-0.5"
            aria-label="Torna indietro"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 group-hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </div>
            <span className="text-[10px] text-slate-400 group-hover:text-slate-200 font-medium mt-0.5">
              Menu
            </span>
          </button>
        )}

        {/* 5 Pulsanti Categorie distribuiti in orizzontale */}
        <div className="flex items-center justify-around flex-1 gap-1">
          {CATEGORIE_ITEMS.map((item) => {
            const isActive = activeCategoria === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectCategoria(item.id)}
                className={`group flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all duration-200 cursor-pointer min-h-[46px] active:scale-95 ${
                  isActive
                    ? 'text-white bg-white/15 shadow-inner shadow-white/10 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium'
                }`}
              >
                <div
                  className={`transition-all duration-200 ${
                    isActive
                      ? 'scale-110 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                      : 'text-slate-300 group-hover:text-white'
                  }`}
                >
                  {item.icon(isActive)}
                </div>
                <span
                  className={`text-[11px] tracking-tight leading-tight mt-1 transition-colors ${
                    isActive ? 'text-white font-semibold' : 'text-slate-400 group-hover:text-slate-200'
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
  );
}
