import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import { db, auth } from '../../firebase';
import { getTripConfig } from '../../utils/tripConfig';

export interface TripSummary {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  ownerUid?: string;
  membersCount: number;
  membersList?: string[];
  createdAt?: number;
  updatedAt?: number;
  lastActiveAt?: number;
  headerImageUrl?: string | null;
  timeStatus: 'upcoming' | 'in_progress' | 'completed' | 'not_set';
  activityStatus: 'active' | 'dormant' | 'abandoned' | 'unknown';
  daysSinceActivity: number | null;
}

interface StorageEstimateData {
  quota: number;
  usage: number;
  remaining: number;
  percentUsed: number;
  supported: boolean;
  measuredAt: string;
}

export default function AdminDashboardView({ onBack }: { onBack: () => void }) {
  const currentTripConfig = getTripConfig();

  // Tab di navigazione interna all'Admin
  const [activeAdminTab, setActiveAdminTab] = useState<'trips' | 'diagnostics'>('trips');

  // Stato utente Firebase Auth (distinzione tra Anonimo e Persistente Google/Email)
  const [currentAdminUser, setCurrentAdminUser] = useState<User | null>(() => auth?.currentUser || null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form Email/Password per login persistente alternativo
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Stato autenticazione operatore e viaggi
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Filtri e ordinamento
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'in_progress' | 'completed'>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'dormant' | 'abandoned'>('all');
  const [sortBy, setSortBy] = useState<'activity' | 'created' | 'title' | 'startDate'>('activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Paginazione
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Diagnostica storage
  const [storageData, setStorageData] = useState<StorageEstimateData | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'warn' | 'success' }>>([]);

  // Calcolo formattazione byte
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Misura storage locale
  const measureStorage = async () => {
    setStorageLoading(true);
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage || 0;
        const quota = est.quota || 0;
        const remaining = Math.max(0, quota - usage);
        const percent = quota > 0 ? (usage / quota) * 100 : 0;

        setStorageData({
          quota,
          usage,
          remaining,
          percentUsed: Math.min(100, Math.max(0, percent)),
          supported: true,
          measuredAt: new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
          }).format(new Date())
        });
      } catch (err) {
        setStorageData({
          quota: 0,
          usage: 0,
          remaining: 0,
          percentUsed: 0,
          supported: false,
          measuredAt: new Date().toLocaleTimeString('it-IT')
        });
      }
    } else {
      setStorageData({
        quota: 0,
        usage: 0,
        remaining: 0,
        percentUsed: 0,
        supported: false,
        measuredAt: new Date().toLocaleTimeString('it-IT')
      });
    }
    setStorageLoading(false);
  };

  const logDiag = (text: string, type: 'info' | 'warn' | 'success') => {
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRecentEvents(prev => [{ id: Math.random().toString(36).substring(2, 9), time, text, type }, ...prev.slice(0, 19)]);
  };

  // Caricamento Viaggi Globali da Firestore
  const fetchGlobalTrips = async () => {
    setLoadingTrips(true);
    setTripsError(null);

    if (!db) {
      setTripsError('Inizializzazione database non disponibile.');
      setLoadingTrips(false);
      return;
    }

    try {
      const tripsCol = collection(db, 'trips');
      // Tentativo di lettura collezione globale autorizzata
      const snap = await getDocs(tripsCol);

      const now = Date.now();
      const todayStr = new Date().toISOString().slice(0, 10);

      const parsedList: TripSummary[] = snap.docs.map(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const title = d.title || d.name || `Viaggio ${id}`;
        const startDate = d.startDate || undefined;
        const endDate = d.endDate || undefined;
        const totalDays = typeof d.totalDays === 'number' ? d.totalDays : undefined;
        const ownerUid = d.ownerUid || undefined;
        const membersList = Array.isArray(d.members) ? d.members : [];
        const membersCount = membersList.length;
        const createdAt = typeof d.createdAt === 'number' ? d.createdAt : undefined;
        const updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : undefined;
        const lastActiveAt = typeof d.lastActiveAt === 'number' ? d.lastActiveAt : (updatedAt || createdAt || undefined);
        const headerImageUrl = d.headerImageUrl || null;

        // 1. Stato Temporale
        let timeStatus: TripSummary['timeStatus'] = 'not_set';
        if (startDate && endDate) {
          if (todayStr < startDate) {
            timeStatus = 'upcoming';
          } else if (todayStr > endDate) {
            timeStatus = 'completed';
          } else {
            timeStatus = 'in_progress';
          }
        } else if (startDate) {
          timeStatus = todayStr < startDate ? 'upcoming' : 'in_progress';
        }

        // 2. Calcolo Attività
        let daysSinceActivity: number | null = null;
        let activityStatus: TripSummary['activityStatus'] = 'unknown';

        if (lastActiveAt) {
          const diffMs = Math.max(0, now - lastActiveAt);
          daysSinceActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          if (daysSinceActivity <= 14) {
            activityStatus = 'active';
          } else if (daysSinceActivity <= 60) {
            activityStatus = 'dormant';
          } else {
            activityStatus = 'abandoned';
          }
        }

        return {
          id,
          title,
          startDate,
          endDate,
          totalDays,
          ownerUid,
          membersCount,
          membersList,
          createdAt,
          updatedAt,
          lastActiveAt,
          headerImageUrl,
          timeStatus,
          activityStatus,
          daysSinceActivity
        };
      });

      setTrips(parsedList);
      logDiag(`Caricati ${parsedList.length} viaggi da Firestore`, 'success');
    } catch (err: any) {
      console.warn('[AdminDashboard] Errore caricamento viaggi globali:', err);
      // Gestione sicura degli errori di autorizzazione Firestore
      if (err?.code === 'permission-denied') {
        setTripsError(
          'Permesso negato da Firestore Security Rules. L\'account attualmente autenticato non dispone dei privilegi di amministratore globale per elencare tutti i viaggi del database.'
        );
      } else {
        setTripsError(err?.message || 'Impossibile completare la lettura dei viaggi globali.');
      }
      logDiag('Accesso collezione trips bloccato o fallito', 'warn');
    } finally {
      setLoadingTrips(false);
    }
  };

  // Sincronizzazione stato utente Firebase Auth
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentAdminUser(user);
      if (user) {
        logDiag(`Sessione Auth attiva: ${user.isAnonymous ? 'Anonimo' : user.email || 'Persistente'}`, 'info');
      }
    });
    return () => unsubscribe();
  }, []);

  // Login Persistente tramite Google OAuth
  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      setCurrentAdminUser(res.user);
      logDiag(`Login Google completato con successo: ${res.user.email}`, 'success');
      // Ricarica la query trips con il nuovo token autorizzato
      await fetchGlobalTrips();
    } catch (err: any) {
      console.warn('[AdminDashboard] Errore Login Google:', err);
      setAuthError(err?.message || 'Accesso Google non completato.');
      logDiag('Accesso Google annullato o fallito', 'warn');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Login Persistente tramite Email / Password
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !adminEmail || !adminPassword) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      setCurrentAdminUser(res.user);
      logDiag(`Login Email completato: ${res.user.email}`, 'success');
      setShowEmailLoginForm(false);
      setAdminPassword('');
      await fetchGlobalTrips();
    } catch (err: any) {
      console.warn('[AdminDashboard] Errore Login Email:', err);
      setAuthError(err?.message || 'Credenziali non valide o errore di autenticazione.');
      logDiag('Accesso Email fallito', 'warn');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Disconnessione sessione Admin
  const handleAdminSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setCurrentAdminUser(null);
      setTrips([]);
      setTripsError('Sessione terminata. Esegui il login per accedere alla console.');
      logDiag('Disconnessione account amministratore eseguita', 'info');
    } catch (err: any) {
      console.warn('[AdminDashboard] Errore signOut:', err);
    }
  };

  useEffect(() => {
    measureStorage();
    fetchGlobalTrips();

    const handleOnline = () => {
      setIsOnline(true);
      logDiag('Connessione internet ripristinata', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      logDiag('Dispositivo offline: modalità locale attiva', 'warn');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Metriche Aggregate Globali
  const metrics = useMemo(() => {
    const total = trips.length;
    let activeCount = 0;
    let dormantCount = 0;
    let abandonedCount = 0;
    let upcomingCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let latestActivityTimestamp: number | null = null;

    trips.forEach(t => {
      if (t.activityStatus === 'active') activeCount++;
      if (t.activityStatus === 'dormant') dormantCount++;
      if (t.activityStatus === 'abandoned') abandonedCount++;

      if (t.timeStatus === 'upcoming') upcomingCount++;
      if (t.timeStatus === 'in_progress') inProgressCount++;
      if (t.timeStatus === 'completed') completedCount++;

      if (t.lastActiveAt && (!latestActivityTimestamp || t.lastActiveAt > latestActivityTimestamp)) {
        latestActivityTimestamp = t.lastActiveAt;
      }
    });

    return {
      total,
      activeCount,
      dormantCount,
      abandonedCount,
      upcomingCount,
      inProgressCount,
      completedCount,
      latestActivityTimestamp
    };
  }, [trips]);

  // Filtraggio e Ordinamento della Tabella Viaggi
  const filteredTrips = useMemo(() => {
    let result = [...trips];

    // Ricerca testuale
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.ownerUid && t.ownerUid.toLowerCase().includes(q))
      );
    }

    // Filtro temporale
    if (timeFilter !== 'all') {
      result = result.filter(t => t.timeStatus === timeFilter);
    }

    // Filtro attività
    if (activityFilter !== 'all') {
      result = result.filter(t => t.activityStatus === activityFilter);
    }

    // Ordinamento
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'activity') {
        const valA = a.lastActiveAt || 0;
        const valB = b.lastActiveAt || 0;
        comparison = valA - valB;
      } else if (sortBy === 'created') {
        const valA = a.createdAt || 0;
        const valB = b.createdAt || 0;
        comparison = valA - valB;
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'startDate') {
        const valA = a.startDate || '';
        const valB = b.startDate || '';
        comparison = valA.localeCompare(valB);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [trips, searchQuery, timeFilter, activityFilter, sortBy, sortOrder]);

  // Paginazione
  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const paginatedTrips = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTrips.slice(start, start + pageSize);
  }, [filteredTrips, currentPage, pageSize]);

  // Reset pagina se cambiano i filtri
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timeFilter, activityFilter, sortBy, sortOrder]);

  const selectedTrip = useMemo(() => {
    if (!selectedTripId) return null;
    return trips.find(t => t.id === selectedTripId) || null;
  }, [trips, selectedTripId]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Non disponibile';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  };

  return (
    <div className="space-y-6 pt-1 animate-fade-in pb-16 max-w-6xl mx-auto font-sans">
      {/* ─── HEADER BAR AMMINISTRATIVO ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-bold text-sm cursor-pointer"
            title="Torna all'applicazione"
          >
            ← Esci
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛡️</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Console Admin Globale
              </h1>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                PROPRIETARIO
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Monitoraggio centralizzato di tutti i viaggi, attività e stato del sistema Hounigo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Selettore Tab Interno */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl flex items-center gap-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveAdminTab('trips')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeAdminTab === 'trips'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🗺️ Viaggi ({trips.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('diagnostics')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeAdminTab === 'diagnostics'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⚙️ Diagnostica Locale
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchGlobalTrips();
              measureStorage();
            }}
            disabled={loadingTrips}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <span>{loadingTrips ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline">Aggiorna</span>
          </button>
        </div>
      </div>

      {/* ─── TAB VIAGGI GLOBALI ─────────────────────────────────────── */}
      {activeAdminTab === 'trips' && (
        <div className="space-y-6">
          {/* 1. PANORAMICA METRICHE GLOBALI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Totale Viaggi */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                Totale Viaggi
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.total}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Tutti i record su Firestore</span>
            </div>

            {/* Viaggi Attivi */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                Attivi (&le;14gg)
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {metrics.activeCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Con modifiche recenti</span>
            </div>

            {/* In Corso Ora */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                In Corso Ora
              </span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {metrics.inProgressCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Vacanza attualmente in atto</span>
            </div>

            {/* Futuri Programmati */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 block mb-1">
                Futuri
              </span>
              <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                {metrics.upcomingCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Partenza programmata</span>
            </div>

            {/* Dormienti / Inattivi */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mb-1">
                Dormienti (&gt;14gg)
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {metrics.dormantCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Nessun accesso recente</span>
            </div>

            {/* Abbandonati / Silenti */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 block mb-1">
                Abbandonati (&gt;60gg)
              </span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {metrics.abandonedCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Fermo prolungato</span>
            </div>
          </div>

          {/* Banner Informativo / Stato Autenticazione e Sicurezza Firestore */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">👤</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Identità Firebase Auth Attiva
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        currentAdminUser && !currentAdminUser.isAnonymous
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {currentAdminUser && !currentAdminUser.isAnonymous ? 'PERSISTENTE (RECUPERABILE)' : 'EFFIMERA (ANONIMA)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    UID: {currentAdminUser?.uid || 'Non autenticato'}{' '}
                    {currentAdminUser?.email ? `• ${currentAdminUser.email}` : ''}
                  </p>
                </div>
              </div>

              {/* Azioni di Autenticazione Persistente */}
              <div className="flex items-center gap-2 flex-wrap">
                {currentAdminUser && !currentAdminUser.isAnonymous ? (
                  <button
                    type="button"
                    onClick={handleAdminSignOut}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Disconnetti Account
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isAuthenticating}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>🌐</span>
                      <span>Accedi con Google</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailLoginForm(prev => !prev)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {showEmailLoginForm ? 'Chiudi' : 'Email / Password'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Form Email / Password opzionale a comparsa */}
            {showEmailLoginForm && (!currentAdminUser || currentAdminUser.isAnonymous) && (
              <form onSubmit={handleEmailSignIn} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fade-in">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Accesso Amministratore con Credenziali Persistenti
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="email.amministratore@example.com"
                    required
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Password amministratore"
                    required
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {authError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">{authError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEmailLoginForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isAuthenticating ? 'Accesso in corso...' : 'Accedi'}
                  </button>
                </div>
              </form>
            )}

            {/* Esito Permessi Firestore */}
            {tripsError ? (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 rounded-2xl p-4 text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔒</span>
                  <h4 className="font-extrabold text-xs">Query Globale Bloccata dalle Firestore Security Rules</h4>
                </div>
                <p className="text-xs leading-relaxed opacity-90">{tripsError}</p>
                <div className="text-[11px] bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-amber-200 dark:border-amber-800 text-slate-600 dark:text-slate-300 space-y-1">
                  <p>
                    <strong>Istruzioni Whitelist per il Proprietario:</strong> Per autorizzare questo account in modo permanente e recuperabile da qualsiasi computer:
                  </p>
                  <ol className="list-decimal pl-4 space-y-0.5 font-mono text-[10px]">
                    <li>Accedi con Google o Email persistente cliccando il pulsante sopra.</li>
                    <li>Copia il tuo UID: <code className="font-bold text-indigo-600 dark:text-indigo-400">{currentAdminUser?.uid || 'UID_NON_DISPONIBILE'}</code>.</li>
                    <li>Nella Firebase Console &gt; Firestore, crea il documento: <code className="font-bold">/system_admins/{currentAdminUser?.uid || '<TUO_UID>'}</code>.</li>
                    <li>Ricarica questa pagina: Firestore autorizzerà la lettura globale e popolerà tutti i dati.</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/50 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                <div className="flex items-center gap-2">
                  <span>🟢</span>
                  <span>
                    Consultazione globale autorizzata. Ultima attività registrata nel cloud:{' '}
                    <strong>{formatDate(metrics.latestActivityTimestamp || undefined)}</strong>
                  </span>
                </div>
                <span className="text-[10px] opacity-75 font-mono">Modalità sola lettura protetta</span>
              </div>
            )}
          </div>

          {/* 2. FILTRI, RICERCA E TABELLA GLOBALE */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-4">
            {/* Barra dei Filtri */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Ricerca per titolo / ID / owner */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  Cerca Viaggio
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Titolo, ID o UID owner..."
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Filtro Periodo */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  Periodo Previsto
                </label>
                <select
                  value={timeFilter}
                  onChange={e => setTimeFilter(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tutti i periodi</option>
                  <option value="upcoming">✈️ Futuri (non iniziati)</option>
                  <option value="in_progress">🟢 In corso oggi</option>
                  <option value="completed">🏁 Conclusi</option>
                </select>
              </div>

              {/* Filtro Attività */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  Stato Attività
                </label>
                <select
                  value={activityFilter}
                  onChange={e => setActivityFilter(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tutti gli stati</option>
                  <option value="active">🟢 Attivo (&le;14 giorni)</option>
                  <option value="dormant">🟡 Dormiente (15-60 giorni)</option>
                  <option value="abandoned">🔴 Abbandonato (&gt;60 giorni)</option>
                </select>
              </div>

              {/* Ordinamento */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  Ordina Per
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="activity">Ultima Attività</option>
                    <option value="created">Data Creazione</option>
                    <option value="title">Titolo Alfabetico</option>
                    <option value="startDate">Data Inizio</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors"
                    title={`Ordine: ${sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}`}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>

            {/* Tabella Dati */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-extrabold">
                    <th className="p-3">ID / Titolo</th>
                    <th className="p-3">Periodo Previsto</th>
                    <th className="p-3">Membri</th>
                    <th className="p-3">Ultima Attività</th>
                    <th className="p-3">Stato</th>
                    <th className="p-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {loadingTrips ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span>Caricamento dei viaggi in corso...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedTrips.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400">
                        Nessun viaggio corrispondente ai filtri selezionati.
                      </td>
                    </tr>
                  ) : (
                    paginatedTrips.map(trip => (
                      <tr
                        key={trip.id}
                        onClick={() => setSelectedTripId(trip.id)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          selectedTripId === trip.id ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''
                        }`}
                      >
                        {/* ID e Titolo */}
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span className="truncate max-w-[180px] sm:max-w-[240px]">{trip.title}</span>
                            {currentTripConfig?.id === trip.id && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-md font-mono">
                                Corrente
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                            ID: {trip.id} {trip.ownerUid ? `• Owner: ${trip.ownerUid.slice(0, 8)}...` : ''}
                          </div>
                        </td>

                        {/* Periodo */}
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {trip.startDate && trip.endDate ? (
                            <div>
                              <div>{trip.startDate} &rarr; {trip.endDate}</div>
                              <div className="text-[10px] text-slate-400">
                                {trip.totalDays ? `${trip.totalDays} giorni` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Non definito</span>
                          )}
                        </td>

                        {/* Membri */}
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                            👥 {trip.membersCount}
                          </span>
                        </td>

                        {/* Ultima Attività */}
                        <td className="p-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDate(trip.lastActiveAt)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {trip.daysSinceActivity !== null
                              ? `${trip.daysSinceActivity} giorni fa`
                              : 'Non misurabile'}
                          </div>
                        </td>

                        {/* Badge Stato */}
                        <td className="p-3">
                          <div className="flex flex-col gap-1 items-start">
                            {/* Badge Temporale */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                trip.timeStatus === 'in_progress'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : trip.timeStatus === 'upcoming'
                                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                  : trip.timeStatus === 'completed'
                                  ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {trip.timeStatus === 'in_progress'
                                ? 'In corso'
                                : trip.timeStatus === 'upcoming'
                                ? 'Futuro'
                                : trip.timeStatus === 'completed'
                                ? 'Concluso'
                                : 'Non impostato'}
                            </span>

                            {/* Badge Attività */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                                trip.activityStatus === 'active'
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : trip.activityStatus === 'dormant'
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : trip.activityStatus === 'abandoned'
                                  ? 'text-rose-700 dark:text-rose-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {trip.activityStatus === 'active'
                                ? '● Attivo'
                                : trip.activityStatus === 'dormant'
                                ? '● Dormiente'
                                : trip.activityStatus === 'abandoned'
                                ? '● Abbandonato'
                                : '● Sconosciuto'}
                            </span>
                          </div>
                        </td>

                        {/* Azioni */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedTripId(trip.id);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-indigo-600 dark:text-slate-300 transition-colors"
                          >
                            Dettaglio
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginazione */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>
                  Pagina {currentPage} di {totalPages} ({filteredTrips.length} viaggi totali)
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold disabled:opacity-40"
                  >
                    Precedente
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold disabled:opacity-40"
                  >
                    Successiva
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. SCHEDA DETTAGLIO VIAGGIO SELEZIONATO */}
          {selectedTrip && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-950 p-5 shadow-md space-y-4 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✈️</span>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Scheda Dettaglio: {selectedTrip.title}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    ID Documento: {selectedTrip.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTripId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Data Creazione */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Creato il</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {formatDate(selectedTrip.createdAt)}
                  </span>
                </div>

                {/* Ultimo Aggiornamento */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Ultimo Sync / Modifica</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {formatDate(selectedTrip.updatedAt)}
                  </span>
                </div>

                {/* Proprietario */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Proprietario (UID)</span>
                  <span className="font-mono text-[11px] text-slate-900 dark:text-white truncate block">
                    {selectedTrip.ownerUid || 'Non registrato'}
                  </span>
                </div>

                {/* Copilota e Membri */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Partecipanti</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {selectedTrip.membersCount} registrati
                  </span>
                </div>
              </div>

              {/* Tutela Privacy e Limiti Informativi */}
              <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-2">
                <span>🛡️</span>
                <span>
                  <strong>Privacy dei Viaggiatori:</strong> I contenuti privati dei documenti, voucher, note di testo e PIN dei viaggiatori non vengono caricati né mostrati in questa dashboard di monitoraggio aggregato.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB DIAGNOSTICA LOCALE (PREESISTENTE E ISOLATA) ───────── */}
      {activeAdminTab === 'diagnostics' && (
        <div className="space-y-5 animate-fade-in">
          {/* Sezione Storage e Quote */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Storage Locale Dispositivo */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💾</span>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Memoria Locale Dispositivo</span>
                      <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} title={isOnline ? 'Online' : 'Offline'} />
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Dati salvati nel browser (IndexedDB + Storage API) • {isOnline ? 'Connesso' : 'Offline'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  navigator.storage
                </span>
              </div>

              {storageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : storageData?.supported ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                      <span>Utilizzato: {formatBytes(storageData.usage)}</span>
                      <span>Disponibile: {formatBytes(storageData.remaining)}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          storageData.percentUsed > 85 ? 'bg-rose-500' : storageData.percentUsed > 60 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.max(1, storageData.percentUsed)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span>Quota totale allocabile: {formatBytes(storageData.quota)}</span>
                      <span className="font-semibold">{storageData.percentUsed.toFixed(1)}% occupato</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Rilevamento affidabile: SI</span>
                    <span>Rilevato alle: {storageData.measuredAt}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">API Stima non disponibile</p>
                  <p>Il browser in uso non espone <code>navigator.storage.estimate()</code>.</p>
                </div>
              )}
            </div>

            {/* Archiviazione Cloud Firestore */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">☁️</span>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Archiviazione Cloud (Firestore)</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Quota e limiti del database di sincronizzazione
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  DATO REALE
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="text-base text-amber-500 shrink-0">ℹ️</span>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p className="font-extrabold text-slate-900 dark:text-white">Dato di quota cloud non esposto dal client</p>
                    <p className="leading-relaxed">
                      L'SDK Web client di Google Cloud Firestore non espone API per la percentuale di occupazione del database Spark.
                    </p>
                  </div>
                </div>
                <div className="text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 space-y-1">
                  <p><strong>Politica Trasparenza Hounigo:</strong> Nessuna quota fittizia simulata.</p>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
                <span>Fonte: Firebase Client SDK v10</span>
                <span>Piano: No Blaze (Spark Free)</span>
              </div>
            </div>
          </div>

          {/* Registro Eventi Locale */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Registro Diagnostica Locale</h2>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {recentEvents.length} eventi registrati
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Nessun evento recente
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-xs">
                {recentEvents.map(evt => (
                  <div
                    key={evt.id}
                    className={`p-2 rounded-xl flex items-center justify-between border ${
                      evt.type === 'warn'
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
                        : evt.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{evt.type === 'warn' ? '⚠️' : evt.type === 'success' ? '✅' : 'ℹ️'}</span>
                      <span className="truncate">{evt.text}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{evt.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
