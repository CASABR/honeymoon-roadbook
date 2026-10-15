import { useState, useEffect } from 'react';
import type { TripConfig } from '../../utils/tripConfig';
import { useDeviceRole } from '../../utils/useDeviceRole';
import DarkModeToggle from '../common/DarkModeToggle';
import SettingsMenu from '../common/SettingsMenu';

declare const __BUILD_TIME__: string;

export type DesktopNavSection =
  | 'prenotazioni'
  | 'itinerario'
  | 'attivita'
  | 'alloggi'
  | 'trasporti'
  | 'ristoranti'
  | 'shopping'
  | 'documenti'
  | 'spese'
  | 'mappa'
  | 'gestione'
  | 'live';

interface DesktopNavigationProps {
  currentSection: DesktopNavSection;
  onSelectSection: (section: DesktopNavSection) => void;
  onOpenSmartInsert: () => void;
  tripConfig: TripConfig | null;
  bookingsCount?: number;
  onToggleMobileView?: () => void;
}

export default function DesktopNavigation({
  currentSection,
  onSelectSection,
  onOpenSmartInsert,
  tripConfig,
  bookingsCount = 0,
  onToggleMobileView
}: DesktopNavigationProps) {
  const { role, isGuida, isCopilota } = useDeviceRole();

  // Ascolta orologio/sync per stato realtime
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navItems = [
    {
      id: 'prenotazioni' as DesktopNavSection,
      label: 'Prenotazioni & Voucher',
      icon: '📑',
      badge: bookingsCount > 0 ? bookingsCount : undefined,
      isPrimary: true
    },
    {
      id: 'itinerario' as DesktopNavSection,
      label: 'Itinerario Giornaliero',
      icon: '🗺️'
    },
    {
      id: 'alloggi' as DesktopNavSection,
      label: 'Hotel & Alloggi',
      icon: '🏨'
    },
    {
      id: 'trasporti' as DesktopNavSection,
      label: 'Voli & Trasporti',
      icon: '✈️'
    },
    {
      id: 'attivita' as DesktopNavSection,
      label: 'Tour & Attività',
      icon: '🎟️'
    },
    {
      id: 'ristoranti' as DesktopNavSection,
      label: 'Ristoranti & Tavoli',
      icon: '🍽️'
    },
    {
      id: 'shopping' as DesktopNavSection,
      label: 'Shopping & Acquisti',
      icon: '🛍️'
    },
    {
      id: 'documenti' as DesktopNavSection,
      label: 'Documenti & Polizze',
      icon: '📁'
    },
    {
      id: 'spese' as DesktopNavSection,
      label: 'Spese & Budget',
      icon: '💳'
    },
    {
      id: 'mappa' as DesktopNavSection,
      label: 'Mappa Interattiva',
      icon: '📍'
    },
    {
      id: 'gestione' as DesktopNavSection,
      label: 'Partecipanti & Invito',
      icon: '👥'
    },
    {
      id: 'live' as DesktopNavSection,
      label: 'Live Tracking GPS',
      icon: '📡'
    }
  ];

  return (
    <aside className="w-64 xl:w-72 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] select-none">
      
      {/* ─── LOGO & TRIP INFO ─────────────────────────────────────────── */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-7 w-auto object-contain" />
            <span className="font-black text-lg tracking-tight text-[#172033] dark:text-white">
              Hounigo
            </span>
            {typeof __BUILD_TIME__ !== 'undefined' && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full ml-1" title="Orario ultimo deploy">
                🟢 {__BUILD_TIME__}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <DarkModeToggle />
            <SettingsMenu />
          </div>
        </div>

        {/* Card Info Viaggio Attivo */}
        <div className="bg-[#FAF7F2] dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Viaggio Attivo
            </span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
              isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isOnline ? 'Cloud Synced' : 'Offline'}
            </span>
          </div>
          <h3 className="font-black text-xs text-[#172033] dark:text-white truncate">
            {tripConfig?.title || 'Il nostro viaggio'}
          </h3>
          <p className="text-[10px] text-slate-500 truncate mt-0.5">
            {tripConfig?.startDate && tripConfig?.endDate
              ? `${tripConfig.startDate} → ${tripConfig.endDate}`
              : 'Date non impostate'}
          </p>
        </div>

        {/* Pulsanti Rapidi: Smart AI & Visualizzazione Mobile */}
        <div className="mt-3 space-y-1.5">
          <button
            type="button"
            onClick={onOpenSmartInsert}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <span>✨</span>
            <span>Inserimento Smart AI</span>
          </button>

          {onToggleMobileView && (
            <button
              type="button"
              onClick={onToggleMobileView}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200/80 dark:border-slate-700 active:scale-95 transition-all cursor-pointer"
              title="Passa al layout compatto smartphone"
            >
              <span>📱</span>
              <span>Visualizzazione mobile</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── VOCI DI NAVIGAZIONE SCORREVOLI ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 no-scrollbar">
        <div className="px-3 pb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
          Area di Lavoro
        </div>
        {navItems.map(item => {
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer text-left ${
                isActive
                  ? item.isPrimary
                    ? 'bg-[#FF6B5F] text-white shadow-md shadow-[#FF6B5F]/20'
                    : 'bg-[#172033] text-white dark:bg-white dark:text-[#172033] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── FOOTER UTENTE E RUOLO ─────────────────────────────────────── */}
      <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-[#FAF7F2]/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs">
              {isGuida ? '🟢' : isCopilota ? '🟡' : '💻'}
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-extrabold text-[#172033] dark:text-white capitalize truncate">
                Dispositivo: {role}
              </span>
              <span className="block text-[9px] text-slate-400">
                {isGuida ? 'Accesso Master Completo' : isCopilota ? 'Accesso Copilota' : 'Visualizzazione'}
              </span>
            </div>
          </div>
          <span className="text-[9px] font-mono text-slate-400">v1.2</span>
        </div>
      </div>
    </aside>
  );
}
