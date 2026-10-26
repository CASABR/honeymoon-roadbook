import { TrailItinerario, TrailCategorie, TrailMappa, TrailToolkit, TrailAi } from './icons/TrailIcons';
import type { SectionTab } from '../types';

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
  const tabs = [
    {
      id: 'oggi' as SectionTab,
      label: 'Itinerario',
      icon: (active: boolean) => <TrailItinerario size={20} active={active} />
    },
    {
      id: 'categorie' as SectionTab,
      label: 'Categorie',
      icon: (active: boolean) => <TrailCategorie size={20} active={active} />
    },
    {
      id: 'mappa' as SectionTab,
      label: 'Mappa',
      icon: (active: boolean) => <TrailMappa size={20} active={active} />
    },
    {
      id: 'altro' as SectionTab,
      label: 'Altro',
      icon: (active: boolean) => <TrailToolkit size={20} active={active} />
    }
  ];

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
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-[#F8F7F3]/95 dark:bg-[#172033]/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(23,32,51,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
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

