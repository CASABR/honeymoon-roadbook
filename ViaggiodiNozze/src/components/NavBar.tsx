export type SectionTab = 'attivita' | 'alloggi' | 'trasporti';

interface NavBarProps {
  activeTab: SectionTab;
  onTabChange: (tab: SectionTab) => void;
}

export default function NavBar({ activeTab, onTabChange }: NavBarProps) {
  const tabs: { id: SectionTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'attivita',
      label: 'Attività',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'alloggi',
      label: 'Alloggi',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6" />
        </svg>
      )
    },
    {
      id: 'trasporti',
      label: 'Trasporti',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      )
    }
  ];

  const activeColorMap = {
    attivita: 'text-amber-400 bg-amber-500/10 font-bold',
    alloggi: 'text-purple-400 bg-purple-500/10 font-bold',
    trasporti: 'text-sky-400 bg-sky-500/10 font-bold'
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-slate-950/80 backdrop-blur-xl border-t border-slate-800/80 px-4 py-2">
      <div className="w-full max-w-md flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const activeClasses = isActive ? activeColorMap[tab.id] : 'text-slate-400 hover:text-slate-200 font-medium';
          const iconScale = isActive ? 'scale-110' : '';
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={"flex flex-col items-center gap-1.5 py-2 px-4 rounded-xl transition-all duration-200 cursor-pointer min-w-[90px] " + activeClasses}
            >
              <div className={"transition-transform duration-200 " + iconScale}>
                {tab.icon}
              </div>
              <span className="text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
