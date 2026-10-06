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
import MappaView from './views/MappaView';
import SettingsMenu from './components/common/SettingsMenu';
import DarkModeToggle from './components/common/DarkModeToggle';
import UpdateToast from './components/common/UpdateToast';
import { storageService } from './storage/storageService';
import { SyncService } from './storage/syncService';
import OnboardingView from './views/OnboardingView';
import { getTripConfig, saveTripConfig, type TripConfig } from './utils/tripConfig';
import { auth } from './firebase';
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  MASTER_TRIP_ID,
  MASTER_TRIP_START_DATE,
  MASTER_TRIP_END_DATE,
  MASTER_TRIP_TOTAL_DAYS,
  ensureMasterTripMembership
} from './utils/masterTrip';

import LiveView from './views/altro/LiveView';
import WalkthroughModal from './components/modals/WalkthroughModal';
import SmartInsertModal from './components/modals/SmartInsertModal';
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
        id: '0000', // ID usato in precedenza su Firebase
        title: 'Viaggio Originale',
        startDate: MASTER_TRIP_START_DATE,
        endDate: MASTER_TRIP_END_DATE,
        totalDays: MASTER_TRIP_TOTAL_DAYS
      };
      saveTripConfig(config);
    }
    // Check se l'id è rimasto 'default'
    if (config && config.id === 'default') {
      config.id = '0000';
      config.title = 'Viaggio Originale';
      config.startDate = MASTER_TRIP_START_DATE;
      config.endDate = MASTER_TRIP_END_DATE;
      config.totalDays = MASTER_TRIP_TOTAL_DAYS;
      saveTripConfig(config);
    }
    return config;
  });

  useEffect(() => {
    const handleConfigChange = () => setTripConfig(getTripConfig());
    window.addEventListener('trip_config_changed', handleConfigChange);
    return () => window.removeEventListener('trip_config_changed', handleConfigChange);
  }, []);

  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) {
      console.warn("Auth not initialized (e.g. Firebase blocked). Running in offline mode without cloud sync.");
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        // Se non è autenticato, proviamo l'accesso anonimo automatico
        signInAnonymously(auth).catch((error) => {
          console.error('[Auth] Errore signInAnonymously:', error);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Aspettiamo di avere sia il config del viaggio sia l'autenticazione prima di avviare il sync
    if (!tripConfig || !authUser) return;
    
    let isMounted = true;
    let syncService: SyncService | null = null;

    const initializeTrip = async () => {
      try {
        if (tripConfig.id === MASTER_TRIP_ID) {
          // ⚠️ TEMP dev/test: riallineamento silenzioso del nuovo UID anonimo su "0000"
          await ensureMasterTripMembership(authUser.uid, tripConfig).catch(err =>
            console.warn('[MasterTrip] Riallineamento "0000" non riuscito:', err)
          );
        } else {
        const docRef = doc(db, 'trips', tripConfig.id);
        const snapshot = await getDoc(docRef).catch(() => null); // Catturiamo l'errore di permessi
        
        if (!snapshot || !snapshot.exists()) {
          // Tentiamo la creazione se non esiste o se non avevamo i permessi per leggerlo.
          // Se in realtà esiste e non siamo membri, la regola `allow create` o `allow update` ci bloccherà comunque, il che è corretto.
          await setDoc(docRef, {
            ownerUid: authUser.uid,
            members: [authUser.uid],
            title: tripConfig.title,
            startDate: tripConfig.startDate,
            endDate: tripConfig.endDate,
            createdAt: Date.now()
          }, { merge: true }).catch(err => {
            console.warn("[Auth] Impossibile creare/aggiornare il viaggio principale:", err);
          });
        }
        }
        
        if (isMounted) {
          syncService = new SyncService(tripConfig.id);
          if (tripConfig.id === MASTER_TRIP_ID) {
            await storageService.ensureMasterTripSeedData();
            await storageService.logLocalDataCounts('[App] IndexedDB pronto per push "0000"');
            syncService.syncAllLocalToCloud().catch(err =>
              console.warn('[SyncService] Push iniziale dati locali "0000" non riuscito:', err)
            );
          }
        }
      } catch (err) {
        console.error("[App] Errore inizializzazione viaggio:", err);
      }
    };

    initializeTrip();

    return () => {
      isMounted = false;
      if (syncService) syncService.destroy();
    };
  }, [tripConfig?.id, authUser?.uid]);

  useEffect(() => {
    // Auto-caricamento attività fisse per il viaggio 0000 se mancanti (funziona anche offline)
    if (tripConfig?.id === '0000') {
      storageService.seedRealActivities().catch(err => console.error(err));
    }
  }, [tripConfig?.id]);

  // Quando il cloud porta nuovi dati, forza il re-render delle view
  
  useEffect(() => {
    const handleCloudSync = () => {
      console.log('[App] Cloud sync ricevuto, aggiorno views');
      
    };
    window.addEventListener('roadbook_cloud_synced', handleCloudSync);
    return () => window.removeEventListener('roadbook_cloud_synced', handleCloudSync);
  }, []);

  const [activeTab, setActiveTab] = useState<SectionTab>('oggi');
  const [activeCategoria, setActiveCategoria] = useState<CategoriaTab | null>(null);
  const [altroSubView, setAltroSubView] = useState<'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | null>(null);
  const [isCategorieOpen, setIsCategorieOpen] = useState(false);

  const [isSmartInsertOpen, setIsSmartInsertOpen] = useState(false);
  const [smartInsertMode, setSmartInsertMode] = useState<'gmail' | 'manual'>('manual');
  

  useEffect(() => {
    const handleOpenSmartInsert = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.mode) {
        setSmartInsertMode(customEvent.detail.mode);
      } else {
        setSmartInsertMode('manual');
      }
      setIsSmartInsertOpen(true);
    };
    window.addEventListener('open_smart_insert', handleOpenSmartInsert);
    return () => window.removeEventListener('open_smart_insert', handleOpenSmartInsert);
  }, []);

  // IMPORTANT: must be declared here (before any conditional returns) to comply with React Rules of Hooks
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(() => {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('walkthrough_seen')) {
      return true;
    }
    return false;
  });

  const handleCloseWalkthrough = () => {
    setIsWalkthroughOpen(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('walkthrough_seen', 'true');
    }
  };

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
        <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
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
        <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5">
        <div className="flex items-center gap-1.5">
          <img src="/favicon.svg" alt="Hounigo" className="w-8 h-8 object-contain" />
          {typeof __BUILD_TIME__ !== 'undefined' && (
            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full">
              🟢 {__BUILD_TIME__}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsWalkthroughOpen(true)}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
            aria-label="Guida"
          >
            <span className="text-sm font-bold">?</span>
          </button>
          <DarkModeToggle />
          <SettingsMenu />
        </div>
      </header>

      {/* Container Mobile / Shell */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-20">
        {activeTab === 'oggi' && <OggiView  onNavigateTab={handleTabChange} />}
        
        {activeTab === 'mappa' && <MappaView  />}

        {activeTab === 'categorie' && (
          <>
            {activeCategoria === 'tappe' && <TappeView  />}
            {activeCategoria === 'attivita' && <AttivitaView  />}
            {activeCategoria === 'ristoranti' && <RistorantiView />}
            {activeCategoria === 'alloggi' && <AlloggiView  />}
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
        onOpenSmartInsert={() => {
          setSmartInsertMode('manual');
          setIsSmartInsertOpen(true);
        }}
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

      {/* Onboarding / Guida */}
      <WalkthroughModal isOpen={isWalkthroughOpen} onClose={handleCloseWalkthrough} />

      {/* Add Menu eliminato: la funzione è stata accorpata in Categorie e Smart AI */}

      {/* Inserimento Smart AI */}
      <SmartInsertModal
        isOpen={isSmartInsertOpen}
        onClose={() => setIsSmartInsertOpen(false)}
        mode={smartInsertMode}
      />

      {/* PWA Update Toast */}
      <UpdateToast />
    </div>
  );
}


