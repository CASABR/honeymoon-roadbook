import { useState, useEffect } from 'react';
import type { TripConfig } from '../../utils/tripConfig';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import DarkModeToggle from '../common/DarkModeToggle';
import SettingsMenu from '../common/SettingsMenu';

declare const __BUILD_TIME__: string;

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
  const { role, isGuida, isCopilota, isSimulated, simulatedRole } = useDeviceRole();
  const {
    currentUid,
    shortUid,
    ownerName,
    cloudRole,
    hasDiscrepancy
  } = useAuthIdentity();

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

  return (
    <aside className="w-64 xl:w-72 bg-[#fffdfa]/95 dark:bg-slate-900/90 backdrop-blur-xl border-r border-[#e5e3dd] dark:border-slate-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-[4px_0_24px_rgba(23,32,51,0.035)] select-none">
      
      {/* ─── LOGO & TRIP INFO ─────────────────────────────────────────── */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-7 w-auto object-contain" />
            <span className="font-black text-lg tracking-tight text-[#172033] dark:text-white">
              Hounigo
            </span>
            {typeof __BUILD_TIME__ !== 'undefined' && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full ml-1" title="Orario della build inclusa in questa versione">
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
        <div className="hounigo-panel-muted dark:bg-slate-800/80 p-3 rounded-2xl dark:border-slate-700/60">
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
            className="hounigo-button-primary w-full flex items-center justify-center gap-2 py-2 px-3 rounded-2xl font-extrabold text-xs active:scale-95 transition-all cursor-pointer"
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
      <div className="p-3.5 border-t border-[#e5e3dd] dark:border-slate-800 bg-[#f1eee7]/50 dark:bg-slate-900/50 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs shrink-0">
              {isGuida ? '🟢' : isCopilota ? '🟢' : (role === 'guida' || role === 'copilota') ? '🟡' : '💻'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-extrabold text-[#172033] dark:text-white capitalize truncate">
                  {role}
                </span>
                {isSimulated && (
                  <span className="text-[9px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 px-1.5 py-0.2 rounded">
                    🧪 {simulatedRole}
                  </span>
                )}
              </div>
              <span className="block text-[9px] text-slate-500 dark:text-slate-400 truncate">
                Cloud: {
                  cloudRole === 'owner' ? `👑 Owner (${ownerName})` :
                  cloudRole === 'copilota' ? '🤝 Copilota' :
                  cloudRole === 'admin' ? '🛡️ Admin' :
                  cloudRole === 'checking' ? '⏳ In verifica...' :
                  cloudRole === 'offline' ? '📡 Offline' :
                  cloudRole === 'unverified' ? '⚠️ Non verificato' :
                  '👁️ Viewer'
                }
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {tripConfig?.id === '0000' && (
              <button
                type="button"
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('admin', '1');
                  window.history.pushState({}, '', url.toString());
                  window.dispatchEvent(new CustomEvent('open_admin_console'));
                }}
                title="Apri Console Amministratore"
                className="px-1.5 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold cursor-pointer transition-colors"
              >
                🛡️ Admin
              </button>
            )}
            <span className="text-[9px] font-mono text-slate-400">v1.2</span>
          </div>
        </div>

        {/* Indicazione discreta Sessione UID & Discrepanza */}
        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono px-0.5">
          <span title={currentUid || ''}>UID: {shortUid}</span>
          <span title="Owner del viaggio">Owner: {ownerName}</span>
        </div>

        {hasDiscrepancy && (
          <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-[9px] text-amber-700 dark:text-amber-300 font-semibold leading-tight">
            ⚠️ Locale ({role}) ≠ Cloud ({cloudRole})
          </div>
        )}
      </div>
    </aside>
  );
}
