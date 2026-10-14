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
import { SyncService } from './storage/syncService';
import OnboardingView from './views/OnboardingView';
import { getTripConfig, saveTripConfig, normalizeTripConfig, type TripConfig } from './utils/tripConfig';
import { getPersistedSession, registerDeviceOnFirestore } from './utils/deviceSession';
import { withTimeout } from './utils/withTimeout';
import { storageService } from './storage/storageService';
import { auth } from './firebase';
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

import LiveView from './views/altro/LiveView';
import WalkthroughModal from './components/modals/WalkthroughModal';
import SmartInsertModal from './components/modals/SmartInsertModal';
import { InstallPWA } from './components/InstallPWA';
import DesktopNavigation, { type DesktopNavSection } from './components/common/DesktopNavigation';
import PrenotazioniWorkspaceView from './views/desktop/PrenotazioniWorkspaceView';
// Dichiarazione della costante globale iniettata da Vite
declare const __BUILD_TIME__: string;

/**
 * Config iniziale sincrona: localStorage, solo se il dispositivo è autenticato per un viaggio
 * (evita lo spinner sulla PWA e bypassa la schermata di blocco o di inserimento PIN).
 */
function getInitialTripConfig(): TripConfig | null {
  if (typeof localStorage === 'undefined') return null;
  const session = getPersistedSession();
  const stored = getTripConfig();
  if (stored && session.isAuthenticated) return stored;
  if (session.isAuthenticated && session.tripId) {
    const trip = normalizeTripConfig({
      id: session.tripId,
      title: session.tripId === '0000' ? 'Viaggio Originale' : 'Il nostro viaggio',
      startDate: '',
      endDate: ''
    });
    saveTripConfig(trip);
    return trip;
  }
  return null;
}

export default function App() {
  // Rileva se il visitatore ha aperto il link condiviso esterno (es. ?live=1 oppure #live)
  const [isExternalLive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.get('live') === '1' ||
      urlParams.get('live') === 'true' ||
      urlParams.get('view') === 'live' ||
      (window.location.hash || '').toLowerCase().includes('live')
    );
  });

  // PRIMISSIMA operazione sincrona: verifica se la sessione del dispositivo è autenticata
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const session = getPersistedSession();
    return session.isAuthenticated;
  });

  const [tripConfig, setTripConfig] = useState<TripConfig | null>(getInitialTripConfig);

  const [isInitializing, setIsInitializing] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    const session = getPersistedSession();
    return !session.isAuthenticated;
  });

  // Rete di sicurezza: lo spinner iniziale non può mai durare più di 1s
  useEffect(() => {
    if (!isInitializing) return;
    const safety = setTimeout(() => setIsInitializing(false), 1000);
    return () => clearTimeout(safety);
  }, [isInitializing]);

  useEffect(() => {
    if (!isInitializing) return;

    async function hydrateState() {
      const session = getPersistedSession();
      if (!session.isAuthenticated) {
        setIsAuthenticated(false);
        setTripConfig(null);
        setIsInitializing(false);
        return;
      }

      setIsAuthenticated(true);
      let config = tripConfig;
      if (!config) {
        try {
          const { idbGet } = await import('./storage/indexedDB');
          const storedConfig = await withTimeout(idbGet<any>('settings', 'trip_config_backup'), 1500, undefined);
          if (storedConfig && storedConfig.value) {
            config = storedConfig.value;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('roadbook_trip_config', JSON.stringify(config));
            }
          }
        } catch (e) { console.error(e); }
      }

      if (typeof localStorage !== 'undefined' && !localStorage.getItem('houni_device_role') && !localStorage.getItem('app_device_role')) {
        try {
          const { idbGet } = await import('./storage/indexedDB');
          const storedRole = await withTimeout(idbGet<any>('settings', 'device_role_backup'), 1500, undefined);
          if (storedRole && storedRole.value) {
            localStorage.setItem('houni_device_role', storedRole.value);
            localStorage.setItem('app_device_role', storedRole.value);
            window.dispatchEvent(new CustomEvent('device_role_changed', { detail: { role: storedRole.value } }));
          }
        } catch (e) { console.error(e); }
      }

      if (config && config.id === 'default') {
        config = normalizeTripConfig({ id: '0000', title: 'Viaggio Originale', startDate: '', endDate: '' });
      }

      setTripConfig(config);
      setIsInitializing(false);
    }
    
    hydrateState();
  }, [isInitializing, tripConfig]);

  useEffect(() => {
    const handleConfigChange = () => {
      const session = getPersistedSession();
      if (session.isAuthenticated) {
        setIsAuthenticated(true);
        setTripConfig(getTripConfig() || normalizeTripConfig({ id: session.tripId || '0000', title: 'Viaggio Originale', startDate: '', endDate: '' }));
      } else {
        setIsAuthenticated(false);
        setTripConfig(getTripConfig());
      }
    };
    window.addEventListener('trip_config_changed', handleConfigChange);
    window.addEventListener('storage', handleConfigChange);
    
    // Ensure alloggi and refuels are populated
    storageService.ensureRefuels().catch(console.error);

    // --- DEDUPLICAZIONE FORZATA AL PRIMO RENDER ---
    const runDeduplication = async () => {
      try {
        const allTransports = await storageService.getTransports();
        let deletedAny = false;
        for (const t of allTransports) {
          if (t.date === '2026-11-28') {
            if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || t.departureTime === '00:00' || (!t.carrier?.toLowerCase().includes('frecciarossa') && !t.carrier?.toLowerCase().includes('italo'))) {
              await storageService.deleteTransport(t.id);
              deletedAny = true;
            }
          }
          if (t.carrier && (t.carrier.includes('(CA950 + CA783)') || t.carrier.includes('CA950 + CA783'))) {
            await storageService.deleteTransport(t.id);
            deletedAny = true;
          }
        }
        if (deletedAny) {
          const { notifyDataChanged } = await import('./storage/storageService');
          notifyDataChanged('trasporti', 'delete', {});
        }
      } catch (err) {
        console.error('[App] Errore deduplicazione forzata:', err);
      }
    };
    runDeduplication();
    
    return () => window.removeEventListener('trip_config_changed', handleConfigChange);
  }, []);

  // Aggiornamento immediato Service Worker per allineamento PWA
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.update().catch(() => {});
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {}));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[App] Nuovo Service Worker rilevato: ricarico per applicare l\'aggiornamento.');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
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
        if (tripConfig.id !== '0000') {
          const tripRef = doc(db, 'trips', tripConfig.id);
          const memberRef = doc(db, 'trips', tripConfig.id, 'members', authUser.uid);
          const snapshot = await getDoc(tripRef).catch(() => null);
          
          if (!snapshot || !snapshot.exists()) {
            const batch = writeBatch(db);
            batch.set(tripRef, {
              ownerUid: authUser.uid,
              members: [authUser.uid],
              title: tripConfig.title,
              startDate: tripConfig.startDate,
              endDate: tripConfig.endDate,
              createdAt: Date.now()
            }, { merge: true });
            batch.set(memberRef, {
              uid: authUser.uid,
              role: 'owner',
              createdAt: Date.now()
            }, { merge: true });
            await batch.commit().catch(err => {
              console.warn("[Auth] Impossibile creare il viaggio / membro owner:", err);
            });
          } else {
            const tripData = snapshot.data();
            if (tripData?.ownerUid === authUser.uid) {
              const memSnap = await getDoc(memberRef).catch(() => null);
              if (!memSnap || !memSnap.exists()) {
                await setDoc(memberRef, {
                  uid: authUser.uid,
                  role: 'owner',
                  createdAt: Date.now()
                }, { merge: true }).catch(err => {
                  console.warn("[Auth] Impossibile allineare membro owner:", err);
                });
              }
            }
          }
        }
        
        if (isMounted) {
          syncService = new SyncService(tripConfig.id);
        }

        // Registrazione/aggiornamento heartbeat device su Firestore
        const deviceRole = storageService.getDeviceRole();
        registerDeviceOnFirestore(tripConfig.id, deviceRole).catch(console.error);
        
        // Esegui la migrazione automatica dei rifornimenti
        await storageService.ensureRefuels();
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
    const handleNavigateTo = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { view, subView, categoria } = customEvent.detail || {};
      if (view) {
        handleTabChange(view as SectionTab, categoria as CategoriaTab, subView);
      }
    };
    window.addEventListener('open_smart_insert', handleOpenSmartInsert);
    window.addEventListener('navigate_to', handleNavigateTo);
    return () => {
      window.removeEventListener('open_smart_insert', handleOpenSmartInsert);
      window.removeEventListener('navigate_to', handleNavigateTo);
    };
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

  // Se non c'è un viaggio configurato e NON siamo in modalità Live esterna con tripId, mostra l'Onboarding
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const externalTripId = urlParams.get('tripId');
  
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    );
  }

  // Se l'utente non è ancora autenticato e non siamo in vista ospite Live esterna
  if (!isAuthenticated && !(isExternalLive && externalTripId)) {
    return (
      <OnboardingView
        onComplete={() => {
          setIsAuthenticated(true);
          setTripConfig(getTripConfig() || normalizeTripConfig({ id: '0000', title: 'Viaggio Originale', startDate: '', endDate: '' }));
        }}
      />
    );
  }

  if (isExternalLive) {
    const activeTripId = tripConfig?.id || externalTripId || '';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col items-center selection:bg-rose-500 selection:text-white font-sans antialiased">
        <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Hounigo • Live
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-700">
            Vista Ospiti
          </span>
        </header>

        <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-10">
          <LiveView isStandaloneExternal={true} tripId={activeTripId} />
        </main>
      </div>
    );
  }

  const [desktopSection, setDesktopSection] = useState<DesktopNavSection>('prenotazioni');

  const handleSelectDesktopSection = (section: DesktopNavSection) => {
    setDesktopSection(section);
    if (section === 'itinerario') {
      setActiveTab('oggi');
      setActiveCategoria(null);
    } else if (section === 'alloggi') {
      setActiveTab('categorie');
      setActiveCategoria('alloggi');
    } else if (section === 'trasporti') {
      setActiveTab('categorie');
      setActiveCategoria('trasporti');
    } else if (section === 'attivita') {
      setActiveTab('categorie');
      setActiveCategoria('attivita');
    } else if (section === 'ristoranti') {
      setActiveTab('categorie');
      setActiveCategoria('ristoranti');
    } else if (section === 'shopping') {
      setActiveTab('categorie');
      setActiveCategoria('shopping');
    } else if (section === 'spese') {
      setActiveTab('categorie');
      setActiveCategoria('spese');
    } else if (section === 'documenti') {
      setActiveTab('altro');
      setAltroSubView('documenti');
    } else if (section === 'mappa') {
      setActiveTab('mappa');
    } else if (section === 'gestione') {
      setActiveTab('altro');
      setAltroSubView('gestione' as any);
    } else if (section === 'live') {
      setActiveTab('altro');
      setAltroSubView('live');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-slate-950 text-[#172033] dark:text-slate-100 flex flex-col md:flex-row selection:bg-rose-500 selection:text-white font-sans antialiased">
      
      {/* ─── DESKTOP SIDEBAR NAVIGATION (Schermi md+) ─────────────────── */}
      <div className="hidden md:block">
        <DesktopNavigation
          currentSection={desktopSection}
          onSelectSection={handleSelectDesktopSection}
          onOpenSmartInsert={() => {
            setSmartInsertMode('manual');
            setIsSmartInsertOpen(true);
          }}
          tripConfig={tripConfig}
        />
      </div>

      {/* ─── MAIN CONTENT CONTAINER (Responsive: mobile centered shell, desktop full workspace) ─ */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        
        {/* Top Header Mobile / Tablet Header */}
        <header className="w-full flex md:hidden items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5 border-b border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <img src="/favicon.svg" alt="Hounigo" className="h-6 w-auto object-contain max-w-[100px]" />
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

        {/* Workspace Body */}
        <main className="flex-1 px-3 sm:px-6 md:px-8 py-3 md:py-6 max-w-7xl w-full mx-auto pb-24 md:pb-12">
          {/* Sezione Desktop Esclusiva Hub Prenotazioni */}
          {desktopSection === 'prenotazioni' ? (
            <div className="hidden md:block">
              <PrenotazioniWorkspaceView
                onOpenSmartInsert={() => {
                  setSmartInsertMode('manual');
                  setIsSmartInsertOpen(true);
                }}
                onNavigateToTab={(tab, cat) => handleTabChange(tab as SectionTab, cat as CategoriaTab)}
              />
            </div>
          ) : null}

          {/* Viste Standard (Visibili sempre su mobile, e su desktop quando selezionate dalla sidebar) */}
          <div className={desktopSection === 'prenotazioni' ? 'block md:hidden' : 'block'}>
            {activeTab === 'oggi' && <OggiView onNavigateTab={handleTabChange} />}
            
            {activeTab === 'mappa' && <MappaView />}

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
          </div>
        </main>
      </div>

      {/* ─── MOBILE BOTTOM BAR (Visibile solo su schermi < md) ───────────── */}
      <div className="block md:hidden">
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

        {/* Dock orizzontale Categorie su Mobile */}
        {isCategorieOpen && (
          <CategorieBar
            activeCategoria={activeCategoria}
            onSelectCategoria={handleSelectCategoria}
            onClose={handleCloseCategorie}
          />
        )}
      </div>

      {/* Onboarding / Guida */}
      <WalkthroughModal isOpen={isWalkthroughOpen} onClose={handleCloseWalkthrough} />

      {/* Inserimento Smart AI */}
      <SmartInsertModal
        isOpen={isSmartInsertOpen}
        onClose={() => setIsSmartInsertOpen(false)}
        mode={smartInsertMode}
      />

      {/* PWA Update Toast */}
      <UpdateToast />

      {/* PWA Install Button */}
      <InstallPWA />
    </div>
  );
}


