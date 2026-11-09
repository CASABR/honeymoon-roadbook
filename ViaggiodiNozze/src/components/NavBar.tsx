import { TrailItinerario, TrailCategorie, TrailMappa, TrailToolkit, TrailAi } from './icons/TrailIcons';
import { MapPin, Plus } from 'lucide-react';

export { TrailCategorie };

/**
 * Icona bicolore per "Aggiungi":
 * - map-pin: segnaposto nel colore principale/inattivo o attivo
 * - plus: piccolo simbolo + rosso corallo (#FF6B5F) sovrapposto in alto a destra
 */
export function BicolorMapPinPlusIcon({ active = false, size = 20 }: { active?: boolean; size?: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <MapPin
        size={size}
        strokeWidth={active ? 2.3 : 1.9}
        className={active ? 'text-[#FF6B5F]' : 'text-slate-500 dark:text-slate-400'}
      />
      <span
        className={`absolute -top-1 -right-1 flex items-center justify-center w-3 h-3 rounded-full border border-white/40 dark:border-slate-800 ${
          active ? 'bg-[#FFF0ED] dark:bg-[#221c27]' : 'bg-[#F8F7F3] dark:bg-[#172033]'
        }`}
      >
        <Plus
          size={9}
          strokeWidth={3.5}
          className="text-[#FF6B5F]"
        />
      </span>
    </div>
  );
}
import type { ReactNode } from 'react';
import type { SectionTab } from '../types';
import { MAIN_SECTION_ORDER } from '../utils/mainNavigation';

export type { SectionTab };

interface NavBarProps {
  activeTab: SectionTab;
  onTabChange: (tab: SectionTab) => void;
  onOpenCategorie?: () => void;
  onOpenSmartInsert?: () => void;
  isCategorieActive?: boolean;
}

export default function NavBar({
  activeTab,
  onTabChange,
  onOpenCategorie,
  onOpenSmartInsert,
  isCategorieActive = false
}: NavBarProps) {
  const tabDetails = {
    oggi: {
      label: 'Viaggio',
      icon: (active: boolean) => <TrailItinerario size={20} active={active} />
    },
    categorie: {
      label: 'Aggiungi',
      icon: (active: boolean) => <BicolorMapPinPlusIcon size={20} active={active} />
    },
    mappa: {
      label: 'Mappa',
      icon: (active: boolean) => <TrailMappa size={20} active={active} />
    },
    altro: {
      label: 'Altro',
      icon: (active: boolean) => <TrailToolkit size={20} active={active} />
    }
  } satisfies Record<SectionTab, { label: string; icon: (active: boolean) => ReactNode }>;
  const tabs = MAIN_SECTION_ORDER.map(id => ({ id, ...tabDetails[id] }));

  const handleClick = (tabId: SectionTab) => {
    if (tabId === 'categorie') {
      if (onOpenCategorie) {
        onOpenCategorie();
      } else {
        onTabChange('categorie');
      }
    } else {
      onTabChange(tabId);
    }
  };

  return (
    <nav style={{ WebkitTransform: "translate3d(0,0,0)", transform: "translate3d(0,0,0)", WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }} className="app-bottom-nav fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-[#F8F7F3]/95 dark:bg-[#172033]/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(23,32,51,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
      <div className="w-full max-w-md mx-auto flex items-center justify-around gap-2 font-sans">
        {tabs.slice(0, 2).map((tab) => {
          const isSelected = tab.id === 'categorie'
            ? (activeTab === 'categorie' || isCategorieActive)
            : activeTab === tab.id;

          let activeClasses = 'text-slate-400 hover:text-[#172033] dark:text-slate-400 dark:hover:text-white font-medium';
          if (isSelected) {
            activeClasses = 'text-[#FF6B5F] bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90] font-bold shadow-2xs';
          }

          const iconScale = isSelected ? 'scale-105' : '';

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleClick(tab.id)}
              className={"flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200 cursor-pointer flex-1 min-h-[48px] active:scale-95 " + activeClasses}
            >
              <div className={"transition-transform duration-200 " + iconScale}>
                {tab.icon(isSelected)}
              </div>
              <span className="text-[11px] tracking-tight leading-tight">{tab.label}</span>
            </button>
          );
        })}

        {/* Pulsante Centrale HouniAI */}
        <button
          type="button"
          onClick={() => onOpenSmartInsert && onOpenSmartInsert()}
          className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-2xl transition-all duration-200 cursor-pointer shrink-0 min-h-[48px] active:scale-95 text-slate-500 hover:text-[#172033] dark:text-slate-400 dark:hover:text-white font-medium group"
          title="Apri HouniAI"
        >
          <div className="w-10 h-10 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-md shadow-[#FF6B5F]/25 group-hover:scale-105 transition-transform">
            <TrailAi size={22} active />
          </div>
          <span className="text-[10px] tracking-tight leading-tight font-extrabold text-[#FF6B5F]">HouniAI</span>
        </button>

        {tabs.slice(2).map((tab) => {
          const isSelected = activeTab === tab.id;

          let activeClasses = 'text-slate-400 hover:text-[#172033] dark:text-slate-400 dark:hover:text-white font-medium';
          if (isSelected) {
            activeClasses = 'text-[#FF6B5F] bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90] font-bold shadow-2xs';
          }

          const iconScale = isSelected ? 'scale-105' : '';

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleClick(tab.id)}
              className={"flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200 cursor-pointer flex-1 min-h-[48px] active:scale-95 " + activeClasses}
            >
              <div className={"transition-transform duration-200 " + iconScale}>
                {tab.icon(isSelected)}
              </div>
              <span className="text-[11px] tracking-tight leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
