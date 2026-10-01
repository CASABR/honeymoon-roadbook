import type { SectionTab } from '../types';

export type { SectionTab };

interface NavBarProps {
  activeTab: SectionTab;
  onTabChange: (tab: SectionTab) => void;
  onOpenCategorie?: () => void;
  isCategorieActive?: boolean;
}

export default function NavBar({
  activeTab,
  onTabChange,
  onOpenCategorie,
  isCategorieActive = false
}: NavBarProps) {
  const tabs = [
    {
      id: 'oggi' as SectionTab,
      label: 'Oggi',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    {
      id: 'categorie' as SectionTab,
      label: 'Categorie',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3.5" y="3.5" width="7" height="7" rx="2.5" strokeWidth="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2.5" strokeWidth="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2.5" strokeWidth="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2.5" strokeWidth="1.8" />
        </svg>
      )
    },
    {
      id: 'mappa' as SectionTab,
      label: 'Mappa',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    },
    {
      id: 'altro' as SectionTab,
      label: 'Altro',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      )
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-4 pt-1.5 safe-bottom shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
      <div className="w-full max-w-md mx-auto flex items-center justify-around gap-2">
        {tabs.map((tab) => {
          const isSelected = tab.id === 'categorie' 
            ? (activeTab === 'categorie' || isCategorieActive) 
            : activeTab === tab.id;

          let activeClasses = 'text-slate-400 hover:text-slate-700 font-medium';
          if (isSelected) {
            if (tab.id === 'oggi') {
              activeClasses = 'text-rose-600 bg-rose-50/90 font-bold shadow-2xs';
            } else if (tab.id === 'categorie') {
              activeClasses = 'text-amber-600 bg-amber-50/90 font-bold shadow-2xs';
            } else if (tab.id === 'altro') {
              activeClasses = 'text-slate-900 bg-slate-100 font-bold shadow-2xs';
            }
          }

          const iconScale = isSelected ? 'scale-110' : '';

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleClick(tab.id)}
              className={"flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200 cursor-pointer flex-1 min-h-[48px] active:scale-95 " + activeClasses}
            >
              <div className={"transition-transform duration-200 " + iconScale}>
                {tab.icon}
              </div>
              <span className="text-[11px] tracking-tight leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}


