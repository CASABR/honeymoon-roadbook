import { useState, useEffect } from 'react';
import type { TripConfig } from '../../utils/tripConfig';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import DarkModeToggle from '../common/DarkModeToggle';
import SettingsMenu from '../common/SettingsMenu';
import HounigoLogo from '../common/HounigoLogo';
import { AppInfoButton } from '../common/AppInfo';

export type DesktopNavSection =
  | 'prenotazioni'
  | 'itinerario'
  | 'tappe'
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
  const { role, isCopilota } = useDeviceRole();
  const { cloudRole } = useAuthIdentity();

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
      id: 'tappe' as DesktopNavSection,
      label: 'Tappe del Viaggio',
      icon: '📍'
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

  // Rispecchia fedelmente i permessi Firestore verificati:
  // Se la sessione è copilota, non mostrare MAI "Guida"
  const verifiedRoleLabel = cloudRole === 'owner'
    ? '👑 Organizzatore'
    : cloudRole === 'copilota'
    ? '🤝 Copilota'
    : cloudRole === 'admin'
    ? '🛡️ Amministratore'
    : (isCopilota || role === 'copilota')
    ? '🤝 Copilota'
    : '👁️ Partecipante';

  return (
    <aside className="w-full h-screen sticky top-0 flex flex-col justify-between overflow-x-hidden overflow-y-hidden bg-[#fffdfa] dark:bg-slate-900 border-r border-[#e5e3dd] dark:border-slate-800 shadow-[4px_0_24px_rgba(23,32,51,0.035)] select-none">
      
      {/* ─── LOGO & TRIP INFO ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="dark:hidden">
              <HounigoLogo variant="onLight" size="sm" />
            </div>
            <div className="hidden dark:block">
              <HounigoLogo variant="onDark" size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <AppInfoButton />
            <DarkModeToggle />
            <SettingsMenu />
          </div>
        </div>

        {/* Card Info Viaggio Attivo */}
        <div className="hounigo-panel-muted dark:bg-slate-800/80 p-3 rounded-2xl dark:border-slate-700/60 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
              Viaggio Attivo
            </span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
              isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isOnline ? 'Sincronizzato' : 'Offline'}
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
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onOpenSmartInsert}
            className="hounigo-button-primary w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-extrabold text-xs active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <span>✨</span>
            <span>Inserimento Smart AI</span>
          </button>

          {onToggleMobileView && (
            <button
              type="button"
              onClick={onToggleMobileView}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200/80 dark:border-slate-700 active:scale-95 transition-all cursor-pointer"
              title="Passa al layout compatto smartphone"
            >
              <span>📱</span>
              <span>Visualizzazione mobile</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── VOCI DI NAVIGAZIONE SCORREVOLI ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1">
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
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left min-w-0 ${
                isActive
                  ? item.isPrimary
                    ? 'bg-[#FF6B5F] text-white shadow-md shadow-[#FF6B5F]/20'
                    : 'bg-[#172033] text-white dark:bg-white dark:text-[#172033] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ml-1.5 ${
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

      {/* ─── FOOTER UTENTE E RUOLO (Semplificato, non affollato) ─────────── */}
      <div className="p-3.5 border-t border-[#e5e3dd] dark:border-slate-800 bg-[#f1eee7]/50 dark:bg-slate-900/50 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs shrink-0">
              {cloudRole === 'owner' ? '👑' : cloudRole === 'copilota' ? '🤝' : '💻'}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-extrabold text-[#172033] dark:text-white truncate block">
                {verifiedRoleLabel}
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate block">
                {tripConfig?.title || 'Hounigo Roadbook'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
