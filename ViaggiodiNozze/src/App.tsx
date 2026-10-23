import { useState, useEffect, lazy, Suspense } from 'react';
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
import AltroView from './views/AltroView';
import SettingsMenu from './components/common/SettingsMenu';

const MappaView = lazy(() => import('./views/MappaView'));
const SpeseBudgetView = lazy(() => import('./views/altro/SpeseBudgetView'));
import DarkModeToggle from './components/common/DarkModeToggle';
import UpdateToast from './components/common/UpdateToast';
import { SyncService } from './storage/syncService';
import OnboardingView from './views/OnboardingView';
import { getTripConfig, saveTripConfig, normalizeTripConfig, type TripConfig } from './utils/tripConfig';
import { getPersistedSession, registerDeviceOnFirestore } from './utils/deviceSession';
import { withTimeout } from './utils/withTimeout';
import { storageService } from './storage/storageService';
import { useAuthIdentity } from './utils/useAuthIdentity';
import { auth } from './firebase';
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { recordUserAccess } from './services/userAccessService';

const LiveView = lazy(() => import('./views/altro/LiveView'));
const AdminDashboardView = lazy(() => import('./views/altro/AdminDashboardView'));
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

  // Rileva accesso diretto alla console Admin via URL dedicato autonomo (?admin=1 o #admin) o evento interno
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.get('admin') === '1' ||
      urlParams.get('admin') === 'true' ||
      urlParams.get('view') === 'admin' ||
      (window.location.hash || '').toLowerCase().includes('admin')
    );
  });

  useEffect(() => {
    const checkAdmin = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isAdm = (
        urlParams.get('admin') === '1' ||
        urlParams.get('admin') === 'true' ||
        urlParams.get('view') === 'admin' ||
        (window.location.hash || '').toLowerCase().includes('admin')
      );
      setIsAdminRoute(isAdm);
    };
    window.addEventListener('popstate', checkAdmin);
    window.addEventListener('hashchange', checkAdmin);
    window.addEventListener('open_admin_console', () => setIsAdminRoute(true));
    return () => {
      window.removeEventListener('popstate', checkAdmin);
      window.removeEventListener('hashchange', checkAdmin);
      window.removeEventListener('open_admin_console', () => setIsAdminRoute(true));
    };
  }, []);

  // PRIMISSIMA operazione sincrona: verifica se la sessione del dispositivo è autenticata
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const session = getPersistedSession();
    if (session.isAuthenticated) {
      // Se l'utente è già autenticato da una sessione precedente, segna l'onboarding completato
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
    }
    return session.isAuthenticated;
  });

  const [tripConfig, setTripConfig] = useState<TripConfig | null>(getInitialTripConfig);
  const { isSimulated, simulatedRole, setSimulatedRole } = useAuthIdentity();

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
      let session = getPersistedSession();
      if (!session.isAuthenticated) {
        const { restorePersistedSessionFromIndexedDB } = await import('./utils/deviceSession');
        session = await restorePersistedSessionFromIndexedDB();
      }

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
          const { idbGetForTrip } = await import('./storage/indexedDB');
          const storedConfig = await withTimeout(
            idbGetForTrip<any>(session.tripId || '0000', 'settings', 'trip_config_backup'),
            1500,
            undefined
          );
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
      } else {
        // Registrazione ultimo accesso utente compatibile Firebase Spark
        recordUserAccess(user, tripConfig?.id);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Aspettiamo di avere sia il config del viaggio sia l'autenticazione prima di avviare il sync
    if (!tripConfig || !authUser) return;

    // Aggiornamento associazione viaggio per l'ultimo accesso
    recordUserAccess(authUser, tripConfig.id);
    
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
            const tripPayload: any = {
              ownerUid: authUser.uid,
              members: [authUser.uid],
              title: tripConfig.title,
              startDate: tripConfig.startDate,
              endDate: tripConfig.endDate,
              createdAt: Date.now()
            };
            if (tripConfig.ownerName) {
              tripPayload.ownerName = tripConfig.ownerName;
            }
            batch.set(tripRef, tripPayload, { merge: true });

            const memberPayload: any = {
              uid: authUser.uid,
              role: 'owner',
              createdAt: Date.now()
            };
            if (tripConfig.ownerName) {
              memberPayload.name = tripConfig.ownerName;
            }
            batch.set(memberRef, memberPayload, { merge: true });
            await batch.commit().catch(err => {
              console.warn("[Auth] Impossibile creare il viaggio / membro owner:", err);
            });
          } else {
            const tripData = snapshot.data();
            // Se il cloud ha già ownerName e il config locale no, sincronizza in locale
            if (tripData?.ownerName && !tripConfig.ownerName) {
              const updatedCfg = { ...tripConfig, ownerName: tripData.ownerName };
              saveTripConfig(updatedCfg);
            }
            if (tripData?.ownerUid === authUser.uid) {
              const memSnap = await getDoc(memberRef).catch(() => null);
              if (!memSnap || !memSnap.exists()) {
                const memData: any = {
                  uid: authUser.uid,
                  role: 'owner',
                  createdAt: Date.now()
                };
                if (tripConfig.ownerName || tripData?.ownerName) {
                  memData.name = tripConfig.ownerName || tripData?.ownerName;
                }
                await setDoc(memberRef, memData, { merge: true }).catch(err => {
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

  const [desktopSection, setDesktopSection] = useState<DesktopNavSection>('prenotazioni');

  // Modalità di visualizzazione: 'desktop' (standard workspace a schermo intero) o 'mobile' (shell smartphone centrata)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('houni_view_mode');
      if (saved === 'mobile' || saved === 'desktop') return saved;
    }
    return 'desktop';
  });

  const toggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'desktop' ? 'mobile' : 'desktop';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('houni_view_mode', next);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleReplayTutorial = () => {
      setIsWalkthroughOpen(true);
    };
    window.addEventListener('replay_tutorial_requested', handleReplayTutorial);
    return () => window.removeEventListener('replay_tutorial_requested', handleReplayTutorial);
  }, []);

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

  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col p-4 sm:p-6 font-sans antialiased">
        <Suspense fallback={
          <div className="flex flex-col h-64 items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento Console Admin...</span>
            </div>
          </div>
        }>
          <AdminDashboardView onBack={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('admin');
            url.searchParams.delete('view');
            url.hash = '';
            window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
            setIsAdminRoute(false);
          }} />
        </Suspense>
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
          <Suspense fallback={
            <div className="flex flex-col h-64 items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento Live Feed...</span>
              </div>
            </div>
          }>
            <LiveView isStandaloneExternal={true} tripId={activeTripId} />
          </Suspense>
        </main>
      </div>
    );
  }



  const handleSelectDesktopSection = (section: DesktopNavSection) => {
    setDesktopSection(section);
    if (section === 'itinerario') {
      setActiveTab('oggi');
      setActiveCategoria(null);
    } else if (section === 'tappe') {
      setActiveTab('categorie');
      setActiveCategoria('tappe');
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

  const isForcedMobileView = viewMode === 'mobile';

  return (
    <div className="flex flex-col min-h-screen">
      {/* ─── BANNER MODALITÀ TEST SIMULATA (Solo ambiente Dev) ────────────────────────── */}
      {isSimulated && (
        <div className="w-full bg-amber-500 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between sticky top-0 z-50 shadow-lg border-b border-amber-600">
          <div className="flex items-center gap-2">
            <span className="text-base">🧪</span>
            <span>MODALITÀ TEST SIMULATA ATTIVA: <strong>{simulatedRole?.toUpperCase()}</strong></span>
            <span className="hidden sm:inline text-amber-950/80 font-normal text-[11px]">— Solo simulazione locale dell'interfaccia. Nessun dato reale né permessi Firestore modificati.</span>
          </div>
          <button
            type="button"
            onClick={() => setSimulatedRole(null)}
            className="px-2.5 py-1 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors shadow-xs"
          >
            Ripristina Reale ✕
          </button>
        </div>
      )}

      <div className={`flex-1 min-h-screen bg-[#F8F7F3] dark:bg-slate-950 text-[#172033] dark:text-slate-100 flex flex-col ${isForcedMobileView ? 'items-center justify-start bg-[#e9e5dd] dark:bg-slate-900/90' : 'md:flex-row'} selection:bg-[#FF6B5F] selection:text-white font-sans antialiased`}>
      
      {/* ─── FLOATING BAR PER TORNARE A DESKTOP (Mostrata su schermi md+ se attiva la vista mobile) ─── */}
      {isForcedMobileView && (
        <div className="hidden md:flex fixed top-3 left-1/2 -translate-x-1/2 z-50 items-center gap-3 bg-[#fffdfa]/95 dark:bg-slate-800/95 backdrop-blur-md px-4 py-2 rounded-full border border-[#e5e3dd] dark:border-slate-700 shadow-xl animate-fade-in">
          <span className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
            <span>📱</span>
            <span>Modalità Mobile attiva</span>
          </span>
          <button
            type="button"
            onClick={toggleViewMode}
            className="hounigo-button-primary px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer"
          >
            Torna a Desktop ↗
          </button>
        </div>
      )}

      {/* ─── DESKTOP SIDEBAR NAVIGATION (Schermi md+ e solo se non in vista mobile forzata) ─── */}
      {!isForcedMobileView && (
        <div className="hidden md:block">
          <DesktopNavigation
            currentSection={desktopSection}
            onSelectSection={handleSelectDesktopSection}
            onOpenSmartInsert={() => {
              setSmartInsertMode('manual');
              setIsSmartInsertOpen(true);
            }}
            tripConfig={tripConfig}
            onToggleMobileView={toggleViewMode}
          />
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER (Responsive: mobile centered shell, desktop full workspace) ─ */}
      <div className={`flex-1 flex flex-col min-w-0 ${isForcedMobileView ? 'w-full max-w-md min-h-screen shadow-2xl border-x border-[#e5e3dd] dark:border-slate-800 bg-[#F8F7F3] dark:bg-slate-950 relative pb-20' : 'h-screen overflow-y-auto'}`}>
        
        {/* Top Header Mobile / Tablet Header (o sempre in modalità mobile forzata) */}
        <header className={`w-full flex ${isForcedMobileView ? 'flex' : 'md:hidden'} items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5 border-b border-[#e5e3dd] dark:border-slate-800 bg-[#fffdfa]/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30`}>
          <div className="flex items-center gap-1.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-6 w-auto object-contain max-w-[100px]" />
            {typeof __BUILD_TIME__ !== 'undefined' && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full">
                🟢 {__BUILD_TIME__}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
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
        <main className={`flex-1 px-3 sm:px-6 md:px-8 py-3 md:py-6 ${isForcedMobileView ? 'max-w-md w-full px-4 py-3' : 'max-w-7xl w-full mx-auto pb-24 md:pb-12'}`}>
          {/* Sezione Desktop Esclusiva Hub Prenotazioni (disponibile solo in modalità desktop piena) */}
          {!isForcedMobileView && desktopSection === 'prenotazioni' ? (
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

          {/* Viste Standard (Visibili sempre su mobile o in modalità mobile forzata, e su desktop quando selezionate dalla sidebar) */}
          <div className={!isForcedMobileView && desktopSection === 'prenotazioni' ? 'block md:hidden' : 'block'}>
            {activeTab === 'oggi' && <OggiView onNavigateTab={handleTabChange} />}
            
            {activeTab === 'mappa' && (
              <Suspense fallback={
                <div className="flex flex-col h-[52vh] min-h-[340px] items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento mappa...</span>
                  </div>
                </div>
              }>
                <MappaView />
              </Suspense>
            )}

            {activeTab === 'categorie' && (
              <>
                {activeCategoria === 'tappe' && <TappeView />}
                {activeCategoria === 'attivita' && <AttivitaView />}
                {activeCategoria === 'ristoranti' && <RistorantiView />}
                {activeCategoria === 'alloggi' && <AlloggiView />}
                {activeCategoria === 'trasporti' && <TrasportiView />}
                {activeCategoria === 'shopping' && <ShoppingView />}
                {activeCategoria === 'spese' && (
                  <Suspense fallback={
                    <div className="flex flex-col h-72 items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse m-4">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento spese e budget...</span>
                      </div>
                    </div>
                  }>
                    <SpeseBudgetView />
                  </Suspense>
                )}
                {!activeCategoria && <TappeView />}
              </>
            )}

            {activeTab === 'altro' && <AltroView initialSubView={altroSubView} />}
          </div>
        </main>
      </div>

      {/* ─── MOBILE BOTTOM BAR (Visibile su schermi < md oppure quando forzata la modalità mobile) ─ */}
      <div className={`block ${isForcedMobileView ? 'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40' : 'md:hidden'}`}>
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
    </div>
  );
}
