import { useState, useEffect } from 'react';
import type { SectionTab, CategoriaTab } from './types';
import NavBar from './components/NavBar';
import CategorieBar from './components/CategorieBar';
import OggiView from './views/OggiView';
import AttivitaView from './views/AttivitaView';
import TappeView from './views/altro/TappeView';
import RistorantiView from './views/altro/RistorantiView';
import AlloggiView from './views/AlloggiView';
import TrasportiView from './views/TrasportiView';
import ShoppingView from './views/altro/ShoppingView';
import SpeseBudgetView from './views/altro/SpeseBudgetView';
import AltroView from './views/AltroView';
import SettingsMenu from './components/common/SettingsMenu';
import DarkModeToggle from './components/common/DarkModeToggle';
import UpdateToast from './components/common/UpdateToast';
import { SyncService } from './storage/syncService';
import OnboardingView from './views/OnboardingView';
import { getTripConfig, saveTripConfig, type TripConfig } from './utils/tripConfig';

import LiveView from './views/altro/LiveView';

// Dichiarazione della costante globale iniettata da Vite
declare const __BUILD_TIME__: string;

export default function App() {
  // Rileva se il visitatore ha aperto il link condiviso esterno (es. ?live=1 oppure #live)
  const [isExternalLive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.get('live') === '1' ||
      urlParams.get('live') === 'true' ||
      urlParams.get('view') === 'live' ||
      window.location.hash.toLowerCase().includes('live')
    );
  });

  const [tripConfig, setTripConfig] = useState<TripConfig | null>(() => {
    let config = getTripConfig();
    if (!config && localStorage.getItem('honeymoon_roadbook_seeded_v1')) {
      // Migrazione utente legacy
      config = {
        id: 'default', // ID usato in precedenza su Firebase
        title: 'Honeymoon Roadbook',
        startDate: '2026-11-28',
        endDate: '2027-01-10'
      };
      saveTripConfig(config);
    }
    return config;
  });

  useEffect(() => {
    const handleConfigChange = () => setTripConfig(getTripConfig());
    window.addEventListener('trip_config_changed', handleConfigChange);
    return () => window.removeEventListener('trip_config_changed', handleConfigChange);
  }, []);

  useEffect(() => {
    if (!tripConfig) return;
    // Initialize Real-time Firebase Sync with the specific trip ID
    const syncService = new SyncService(tripConfig.id);
    return () => syncService.destroy();
  }, [tripConfig?.id]);

  const [activeTab, setActiveTab] = useState<SectionTab>('oggi');
  const [activeCategoria, setActiveCategoria] = useState<CategoriaTab | null>(null);
  const [altroSubView, setAltroSubView] = useState<'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | null>(null);
  const [isCategorieOpen, setIsCategorieOpen] = useState(false);

  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => {
    setActiveTab(tab);
    setIsCategorieOpen(false);
    if (tab === 'oggi') {
      setActiveCategoria(null);
    } else if (tab === 'altro') {
      setActiveCategoria(null);
      setAltroSubView(subView || null);
    } else if (tab === 'categorie') {
      setActiveCategoria(categoria || activeCategoria || 'tappe');
    }
  };

  const handleToggleCategorie = () => {
    setIsCategorieOpen(prev => !prev);
  };

  const handleSelectCategoria = (cat: CategoriaTab) => {
    setActiveCategoria(cat);
    setActiveTab('categorie');
    setIsCategorieOpen(false);
  };

  const handleCloseCategorie = () => {
    setIsCategorieOpen(false);
  };

  // Se non c'è un viaggio configurato, mostra l'Onboarding (Zero-State)
  if (!tripConfig) {
    return <OnboardingView />;
  }

  if (isExternalLive) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center selection:bg-rose-500 selection:text-white font-sans antialiased">
        <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Honeymoon Roadbook • Live
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
            Vista Ospiti
          </span>
        </header>

        <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-10">
          <LiveView isStandaloneExternal={true} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center selection:bg-rose-500 selection:text-white font-sans antialiased">
      {/* Top Bar */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Honeymoon Roadbook
          </p>
        </div>
        <div className="flex items-center gap-2">
          {typeof __BUILD_TIME__ !== 'undefined' && (
            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full">
              🟢 Aggiornato: {__BUILD_TIME__}
            </span>
          )}
          <DarkModeToggle />
          <SettingsMenu />
        </div>
      </header>

      {/* Container Mobile / Shell */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-28">
        {activeTab === 'oggi' && <OggiView onNavigateTab={handleTabChange} />}
        
        {activeTab === 'categorie' && (
          <>
            {activeCategoria === 'tappe' && <TappeView />}
            {activeCategoria === 'attivita' && <AttivitaView />}
            {activeCategoria === 'ristoranti' && <RistorantiView />}
            {activeCategoria === 'alloggi' && <AlloggiView />}
            {activeCategoria === 'trasporti' && <TrasportiView />}
            {activeCategoria === 'shopping' && <ShoppingView />}
            {activeCategoria === 'spese' && <SpeseBudgetView />}
            {!activeCategoria && <TappeView />}
          </>
        )}

        {activeTab === 'altro' && <AltroView initialSubView={altroSubView} />}
      </main>

      {/* Barra inferiore classica a 3 tab (Oggi - Categorie - Altro) sempre presente come base */}
      <NavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenCategorie={handleToggleCategorie}
        isCategorieActive={activeTab === 'categorie' || isCategorieOpen}
      />

      {/* Dock orizzontale a capsula mostrato in overlay sovrimpresso al click su "Categorie" */}
      {isCategorieOpen && (
        <CategorieBar
          activeCategoria={activeCategoria}
          onSelectCategoria={handleSelectCategoria}
          onClose={handleCloseCategorie}
        />
      )}

      {/* PWA Update Toast */}
      <UpdateToast />
    </div>
  );
}


