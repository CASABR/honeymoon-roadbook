import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
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
import { formatDateIT, formatDateTimeIT, formatDateRangeIT } from '../../utils/tripDates';
import { fetchUsersAccessPage, formatUserDisplayName, type UserAccessEntry } from '../../services/userAccessService';
import {
  formatStorageBytes,
  calculateQuotaPercentage,
  calculateTripRootDocSize
} from '../../utils/firestoreStorageCalculator';
import {
  OFFICIAL_FIRESTORE_METRIC,
  type OfficialFirestoreStorageSnapshot
} from '../../config/officialFirestoreStorage';
import {
  calculateDetailedTripStorage,
  getTripStorageFromCache,
  clearTripStorageCache
} from '../../services/tripStorageService';
import { DatabaseUsagePanel } from './DatabaseUsagePanel';
import { AdminNotificationsPanel } from './AdminNotificationsPanel';

/** Sottocollezioni note del viaggio gestite dall'app */
export const KNOWN_ADMIN_DELETION_SUBCOLLECTIONS = [
  'tappe',
  'attivita',
  'alloggi',
  'trasporti',
  'ristoranti',
  'shopping',
  'spese',
  'documenti',
  'note',
  'bagagli',
  'giorni',
  'settings',
  'locks',
  'members',
  'inviteTokens'
] as const;

export function deriveTripDestination(tripId: string, d: Record<string, any> = {}): string | undefined {
  const direct = d.destination || d.meta || d.city || d.countries || d.locationsSummary;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (Array.isArray(direct) && direct.length > 0) return direct.filter(Boolean).join(', ');
  if (tripId === '0000') return 'Nuova Zelanda, Australia & Filippine';
  const rawTitle = String(d.title || d.name || '').trim();
  if (rawTitle && !/^viaggio\b/i.test(rawTitle) && !/^il nostro viaggio$/i.test(rawTitle)) {
    return rawTitle;
  }
  return undefined;
}

export function buildPrivilegedTripDeletionCommands(tripId: string): { inspect: string; execute: string } {
  const cleanId = String(tripId || '').trim();
  if (!cleanId || /[\/\s]/.test(cleanId) || cleanId === '.' || cleanId === '..') {
    throw new Error('Identificativo tripId mancante o non valido.');
  }
  if (cleanId === '0000') throw new Error('Il viaggio reale 0000 è protetto e non può essere eliminato.');
  return {
    inspect: `node scripts/admin-delete-trip.mjs --trip-id=${cleanId}`,
    execute: `node scripts/admin-delete-trip.mjs --trip-id=${cleanId} --execute --confirm-id=${cleanId}`
  };
}

export interface TripSummary {
  id: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  ownerUid?: string;
  ownerEmail?: string;
  ownerName?: string;
  membersCount: number;
  membersList?: string[];
  tappeCount?: number;
  estimatedStorageBytes?: number;
  storageStatus: 'calcolata' | 'parziale' | 'non_disponibile';
  docsCount?: number;
  quotaPercentage?: number;
  subcollectionsBreakdown?: Record<string, { docsCount: number; bytes: number }>;
  createdAt?: number;
  updatedAt?: number;
  lastActiveAt?: number;
  headerImageUrl?: string | null;
  timeStatus: 'upcoming' | 'in_progress' | 'completed' | 'not_set';
  activityStatus: 'active' | 'dormant' | 'abandoned' | 'unknown';
  daysSinceActivity: number | null;
  _rawDocData?: Record<string, any>;
}

interface StorageEstimateData {
  quota: number;
  usage: number;
  remaining: number;
  percentUsed: number;
  supported: boolean;
  measuredAt: string;
}

export type GlobalAdminAccessStatus =
  | 'checking'
  | 'authorized'
  | 'unauthorized'
  | 'network_error'
  | 'empty_database'
  | 'error';

export default function AdminDashboardView({ onBack }: { onBack: () => void }) {
  const currentTripConfig = getTripConfig();

  // Tab di navigazione interna all'Admin
  const [activeAdminTab, setActiveAdminTab] = useState<'trips' | 'copilots' | 'users' | 'notifications' | 'diagnostics'>('trips');

  // Stato autorizzazione e query globale dalle Firestore Security Rules
  const [accessStatus, setAccessStatus] = useState<GlobalAdminAccessStatus>('checking');

  // Stato consultazione ultimi accessi utenti con paginazione reale a cursori
  const [usersList, setUsersList] = useState<UserAccessEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersCursorStack, setUsersCursorStack] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [usersLastVisible, setUsersLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersSortBy, setUsersSortBy] = useState<'lastAccessAt' | 'lastSeenAt'>('lastAccessAt');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const loadUsersPage = async (page: number, cursor: QueryDocumentSnapshot | null, sortField = usersSortBy) => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await fetchUsersAccessPage(20, cursor, sortField);
      setUsersList(res.users);
      setUsersLastVisible(res.lastVisible);
      setUsersHasMore(res.hasMore);
      setUsersPage(page);
    } catch (err: any) {
      console.error('[AdminDashboard] Errore caricamento utenti:', err);
      setUsersError(err?.message || 'Errore durante l\'interrogazione della collezione /users.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleNextUsersPage = () => {
    if (!usersHasMore || !usersLastVisible || loadingUsers) return;
    const nextStack = [...usersCursorStack, usersLastVisible];
    setUsersCursorStack(nextStack);
    loadUsersPage(usersPage + 1, usersLastVisible);
  };

  const handlePrevUsersPage = () => {
    if (usersPage <= 1 || loadingUsers) return;
    const nextStack = [...usersCursorStack];
    nextStack.pop();
    const prevCursor = nextStack[nextStack.length - 1] || null;
    setUsersCursorStack(nextStack);
    loadUsersPage(usersPage - 1, prevCursor);
  };

  const handleCopyUid = (uid: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(uid).catch(() => {});
    }
    setCopiedUid(uid);
    setTimeout(() => {
      setCopiedUid(prev => (prev === uid ? null : prev));
    }, 2000);
  };

  useEffect(() => {
    if (activeAdminTab === 'users' && usersList.length === 0 && !loadingUsers && !usersError) {
      loadUsersPage(1, null);
    }
  }, [activeAdminTab]);

  // Stato utente Firebase Auth (distinzione tra Anonimo e Persistente Google/Email)
  const [currentAdminUser, setCurrentAdminUser] = useState<User | null>(() => auth?.currentUser || null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form Email/Password per login persistente alternativo (aperto di default se non autenticato)
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(true);
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
  const [sortBy, setSortBy] = useState<'activity' | 'created' | 'title' | 'startDate' | 'storage' | 'owner'>('activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Stato Modale Eliminazione Sicura Amministrativa
  const [deleteTargetTrip, setDeleteTargetTrip] = useState<TripSummary | null>(null);
  const isDeletingTrip = false;
  const [deletionPhase, setDeletionPhase] = useState<string | null>(null);
  const [deletionStatus, setDeletionStatus] = useState<'idle' | 'deleting' | 'success' | 'error' | 'partial'>('idle');
  const [deleteActionError, setDeleteActionError] = useState<string | null>(null);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);
  const [deletedTripReport, setDeletedTripReport] = useState<{ id: string; title: string; count: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [deletionCommands, setDeletionCommands] = useState<{ inspect: string; execute: string } | null>(null);

  // Stato Gestione Copiloti Globale
  const [copilotsMeta, setCopilotsMeta] = useState<Map<string, { name?: string; role?: string; joinedAt?: any }>>(new Map());
  const [loadingCopilotsMeta, setLoadingCopilotsMeta] = useState(false);
  const [editingCopilotKey, setEditingCopilotKey] = useState<string | null>(null);
  const [editingCopilotName, setEditingCopilotName] = useState('');
  const [savingCopilotKey, setSavingCopilotKey] = useState<string | null>(null);
  const [copilotActionSuccess, setCopilotActionSuccess] = useState<string | null>(null);
  const [copilotActionError, setCopilotActionError] = useState<string | null>(null);
  const [copilotSearchQuery, setCopilotSearchQuery] = useState('');
  const [removingCopilotTarget, setRemovingCopilotTarget] = useState<{
    tripId: string;
    tripTitle: string;
    uid: string;
    name?: string;
  } | null>(null);
  const [isRemovingCopilot, setIsRemovingCopilot] = useState(false);

  // Stato Assegnazione Nuovo Copilota da Admin e Modifica Meta Viaggio
  const [assignCopilotTripId, setAssignCopilotTripId] = useState('');
  const [assignCopilotUid, setAssignCopilotUid] = useState('');
  const [assignCopilotName, setAssignCopilotName] = useState('');
  const [isAssigningCopilot, setIsAssigningCopilot] = useState(false);
  const [editingDestinationTripId, setEditingDestinationTripId] = useState<string | null>(null);
  const [editingDestinationValue, setEditingDestinationValue] = useState('');
  const [isSavingDestination, setIsSavingDestination] = useState(false);

  // Stato Dettaglio Partecipanti del Viaggio Selezionato
  const [tripMembers, setTripMembers] = useState<Array<{
    uid: string;
    name?: string;
    email?: string;
    role: string;
    joinedAt?: number | string;
    inTripArray: boolean;
    inSubcollection: boolean;
    discrepancy?: 'missing_in_subcollection' | 'missing_in_array';
  }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Paginazione
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Diagnostica storage locale
  const [storageData, setStorageData] = useState<StorageEstimateData | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'warn' | 'success' }>>([]);

  // Metrica ufficiale Cloud Monitoring e stato calcoli storage Firestore
  const [officialMetric, setOfficialMetric] = useState<OfficialFirestoreStorageSnapshot>(OFFICIAL_FIRESTORE_METRIC);
  const [calculatingStorageTripId, setCalculatingStorageTripId] = useState<string | null>(null);
  const [isBatchCalculatingStorage, setIsBatchCalculatingStorage] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Calcolo formattazione byte standard KiB / MiB / GiB
  const formatBytes = (bytes: number): string => {
    return formatStorageBytes(bytes);
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
          measuredAt: formatDateTimeIT(Date.now())
        });
      } catch (err) {
        setStorageData({
          quota: 0,
          usage: 0,
          remaining: 0,
          percentUsed: 0,
          supported: false,
          measuredAt: formatDateTimeIT(Date.now())
        });
      }
    } else {
      setStorageData({
        quota: 0,
        usage: 0,
        remaining: 0,
        percentUsed: 0,
        supported: false,
        measuredAt: formatDateTimeIT(Date.now())
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
    setAccessStatus('checking');

    // 1. Controllo di rete preventivo
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAccessStatus('network_error');
      setTripsError('Dispositivo offline. Connessione internet non disponibile.');
      setLoadingTrips(false);
      return;
    }

    if (!db) {
      setAccessStatus('error');
      setTripsError('Inizializzazione database non disponibile.');
      setLoadingTrips(false);
      return;
    }

    if (auth && typeof (auth as any).authStateReady === 'function') {
      try {
        await (auth as any).authStateReady();
      } catch {}
    }

    try {
      const tripsCol = collection(db, 'trips');
      // Tentativo di lettura collezione globale protetta da Firestore Security Rules (isGlobalAdmin)
      const snap = await getDocs(tripsCol);

      // Distinzione tra assenza reale di viaggi ed errore di autorizzazione
      if (snap.empty) {
        setTrips([]);
        setAccessStatus('empty_database');
        logDiag('Query globale completata: nessun viaggio presente nel database', 'info');
        setLoadingTrips(false);
        return;
      }

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

        const destination = deriveTripDestination(id, d);
        const ownerEmail = d.ownerEmail || d.creatorEmail || undefined;
        const ownerName = d.ownerName || d.creatorName || (id === '0000' ? 'Nunzio' : undefined);

        // Calcolo della dimensione documentale Firestore conforme alle specifiche ufficiali Google
        // Trasparenza Hounigo: se presente in cache di sessione, usa la stima dettagliata già calcolata
        const cachedDetail = getTripStorageFromCache(id);
        let estimatedStorageBytes = 0;
        let storageStatus: TripSummary['storageStatus'] = 'parziale';
        let docsCount = 1;
        let quotaPercentage = 0;
        let subcollectionsBreakdown: Record<string, { docsCount: number; bytes: number }> | undefined = undefined;

        if (cachedDetail) {
          estimatedStorageBytes = cachedDetail.totalBytes;
          storageStatus = cachedDetail.status;
          docsCount = cachedDetail.docsCount;
          quotaPercentage = cachedDetail.quotaPercentage;
          subcollectionsBreakdown = cachedDetail.subcollectionsBreakdown;
        } else {
          try {
            estimatedStorageBytes = calculateTripRootDocSize(id, d);
            quotaPercentage = calculateQuotaPercentage(estimatedStorageBytes);
            storageStatus = 'parziale';
            docsCount = 1;
          } catch {
            storageStatus = 'non_disponibile';
          }
        }

        return {
          id,
          title,
          destination,
          startDate,
          endDate,
          totalDays,
          ownerUid,
          ownerEmail,
          ownerName,
          membersCount,
          membersList,
          tappeCount: typeof d.tappeCount === 'number' ? d.tappeCount : undefined,
          estimatedStorageBytes,
          storageStatus,
          docsCount,
          quotaPercentage,
          subcollectionsBreakdown,
          createdAt,
          updatedAt,
          lastActiveAt,
          headerImageUrl,
          timeStatus,
          activityStatus,
          daysSinceActivity,
          _rawDocData: d
        };
      });

      setTrips(parsedList);
      setAccessStatus('authorized');
      logDiag(`Caricati ${parsedList.length} viaggi da Firestore`, 'success');
    } catch (err: any) {
      console.warn('[AdminDashboard] Errore caricamento viaggi globali:', err);
      // Gestione sicura e rigorosa degli errori di autorizzazione Firestore
      if (err?.code === 'permission-denied') {
        setAccessStatus('unauthorized');
        setTrips([]);
        setTripsError(
          'Permesso negato dalle Firestore Security Rules. L\'account attualmente autenticato non dispone dei privilegi di amministratore globale per elencare tutti i viaggi del database.'
        );
      } else if (err?.code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setAccessStatus('network_error');
        setTrips([]);
        setTripsError('Impossibile contattare i server Firestore. Connessione di rete non disponibile o instabile.');
      } else {
        setAccessStatus('error');
        setTrips([]);
        setTripsError(err?.message || 'Impossibile completare la lettura dei viaggi globali.');
      }
      logDiag('Accesso collezione trips bloccato o fallito', 'warn');
    } finally {
      setLoadingTrips(false);
    }
  };

  // Calcolo stima dettagliata per un singolo viaggio
  const handleCalculateSingleTripStorage = async (tripId: string) => {
    if (!db || calculatingStorageTripId || isBatchCalculatingStorage) return;
    setCalculatingStorageTripId(tripId);
    try {
      const existingTrip = trips.find(t => t.id === tripId);
      const detail = await calculateDetailedTripStorage(db, tripId, existingTrip?._rawDocData);
      setTrips(prev => prev.map(t => {
        if (t.id === tripId) {
          return {
            ...t,
            estimatedStorageBytes: detail.totalBytes,
            storageStatus: detail.status,
            docsCount: detail.docsCount,
            quotaPercentage: detail.quotaPercentage,
            subcollectionsBreakdown: detail.subcollectionsBreakdown
          };
        }
        return t;
      }));
      logDiag(`Stima spazio per viaggio ${tripId}: ${formatStorageBytes(detail.totalBytes)} (${detail.docsCount} doc)`, 'success');
    } catch (err: any) {
      console.error(`[AdminDashboard] Errore calcolo spazio ${tripId}:`, err);
      logDiag(`Errore calcolo spazio per ${tripId}: ${err?.message}`, 'warn');
    } finally {
      setCalculatingStorageTripId(null);
    }
  };

  // Calcolo batch efficiente delle stime per i viaggi
  const handleBatchCalculateStorage = async () => {
    if (!db || isBatchCalculatingStorage || calculatingStorageTripId) return;
    const targetList = paginatedTrips.length > 0 ? paginatedTrips : trips;
    if (!targetList.length) return;

    setIsBatchCalculatingStorage(true);
    setBatchProgress({ current: 0, total: targetList.length });

    let count = 0;
    for (const t of targetList) {
      try {
        setBatchProgress({ current: count + 1, total: targetList.length });
        const detail = await calculateDetailedTripStorage(db, t.id, t._rawDocData);
        setTrips(prev => prev.map(item => {
          if (item.id === t.id) {
            return {
              ...item,
              estimatedStorageBytes: detail.totalBytes,
              storageStatus: detail.status,
              docsCount: detail.docsCount,
              quotaPercentage: detail.quotaPercentage,
              subcollectionsBreakdown: detail.subcollectionsBreakdown
            };
          }
          return item;
        }));
      } catch (err) {
        console.warn(`[AdminDashboard] Errore scansione subcollezioni ${t.id}:`, err);
      }
      count++;
    }

    logDiag(`Calcolo stime completato con successo per ${count} viaggi`, 'success');
    setIsBatchCalculatingStorage(false);
    setBatchProgress(null);
  };

  const handleClearStorageCache = () => {
    clearTripStorageCache();
    // Reimposta a stima documentale radice
    setTrips(prev => prev.map(t => {
      const rootBytes = t._rawDocData ? calculateTripRootDocSize(t.id, t._rawDocData) : (t.estimatedStorageBytes || 0);
      return {
        ...t,
        estimatedStorageBytes: rootBytes,
        storageStatus: 'parziale',
        docsCount: 1,
        quotaPercentage: calculateQuotaPercentage(rootBytes),
        subcollectionsBreakdown: undefined
      };
    }));
    logDiag('Cache stime archiviata in sessionStorage azzerata', 'info');
  };

  // Prepara la procedura privilegiata; il browser non esegue cancellazioni.
  const handleConfirmDeleteTrip = async () => {
    if (!deleteTargetTrip) return;

    // Blocco assoluto trip 0000
    if (deleteTargetTrip.id === '0000') {
      setDeleteActionError('Il viaggio reale 0000 è protetto e non può essere eliminato.');
      return;
    }

    if (deleteConfirmId.trim() !== deleteTargetTrip.id) {
      setDeleteActionError('Digita esattamente l’ID del viaggio per preparare la procedura privilegiata.');
      return;
    }

    try {
      const commands = buildPrivilegedTripDeletionCommands(deleteTargetTrip.id);
      setDeletionCommands(commands);
      setDeletionStatus('success');
      setDeleteActionError(null);
      setDeleteSuccessMsg(`Richiesta amministrativa preparata per ${deleteTargetTrip.id}. Nessun dato è stato modificato dal browser.`);
      logDiag(`Preparata richiesta di eliminazione privilegiata per ${deleteTargetTrip.id}; nessuna scrittura eseguita`, 'info');
    } catch (err: any) {
      setDeletionStatus('error');
      setDeleteActionError(err?.message || 'Impossibile preparare la procedura amministrativa.');
    }
  };

  // Caricamento metadati copiloti per tutti i viaggi caricati
  useEffect(() => {
    if (!db || trips.length === 0) return;
    let isMounted = true;

    const loadMeta = async () => {
      setLoadingCopilotsMeta(true);
      try {
        const newMap = new Map<string, { name?: string; role?: string; joinedAt?: any }>();
        for (const trip of trips) {
          if (!trip.membersList || trip.membersList.length === 0) continue;
          try {
            const membersCol = collection(db, 'trips', trip.id, 'members');
            const snap = await getDocs(membersCol);
            snap.docs.forEach(d => {
              const data = d.data();
              newMap.set(`${trip.id}_${d.id}`, {
                name: data.name || data.displayName || undefined,
                role: data.role || 'copilota',
                joinedAt: data.joinedAt || data.createdAt || undefined
              });
            });
          } catch {
            // Ignora se non accessibile singolarmente
          }
        }
        if (isMounted) {
          setCopilotsMeta(newMap);
        }
      } catch (err) {
        console.warn('[AdminDashboard] Errore caricamento metadati copiloti:', err);
      } finally {
        if (isMounted) setLoadingCopilotsMeta(false);
      }
    };

    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [trips, activeAdminTab]);

  // Lista aggregata dei copiloti da tutti i viaggi
  const allCopilotsList = useMemo(() => {
    const list: Array<{
      key: string;
      tripId: string;
      tripTitle: string;
      uid: string;
      name?: string;
      role: string;
      joinedAt?: any;
      hasSubDoc: boolean;
      isInTripArray: boolean;
    }> = [];

    trips.forEach(trip => {
      const ownerUid = trip.ownerUid;
      const members = trip.membersList || [];

      members.forEach(uid => {
        // Un copilota è un partecipante diverso dall'owner
        if (uid && uid !== ownerUid) {
          const meta = copilotsMeta.get(`${trip.id}_${uid}`);
          list.push({
            key: `${trip.id}_${uid}`,
            tripId: trip.id,
            tripTitle: trip.title,
            uid,
            name: meta?.name,
            role: meta?.role || 'copilota',
            joinedAt: meta?.joinedAt,
            hasSubDoc: Boolean(meta),
            isInTripArray: true
          });
        }
      });
    });

    return list;
  }, [trips, copilotsMeta]);

  // Filtro ricerca copiloti
  const filteredCopilots = useMemo(() => {
    if (!copilotSearchQuery.trim()) return allCopilotsList;
    const q = copilotSearchQuery.toLowerCase().trim();
    return allCopilotsList.filter(c =>
      c.uid.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      c.tripTitle.toLowerCase().includes(q) ||
      c.tripId.toLowerCase().includes(q)
    );
  }, [allCopilotsList, copilotSearchQuery]);

  // Assegna o modifica il nome visualizzato di un copilota
  const handleSaveCopilotName = async (tripId: string, uid: string, tripTitle: string) => {
    const cleanName = editingCopilotName.trim();
    if (!cleanName) {
      setCopilotActionError('Il nome visualizzato non può essere vuoto.');
      return;
    }
    if (tripId === '0000') {
      setCopilotActionError('Il viaggio reale 0000 è protetto: modifiche non consentite.');
      return;
    }
    if (!db) return;

    setSavingCopilotKey(`${tripId}_${uid}`);
    setCopilotActionError(null);
    setCopilotActionSuccess(null);

    try {
      const memberRef = doc(db, 'trips', tripId, 'members', uid);
      await setDoc(memberRef, {
        uid,
        name: cleanName,
        role: 'copilota',
        updatedAt: Date.now()
      }, { merge: true });

      setCopilotsMeta(prev => {
        const next = new Map(prev);
        const existing = next.get(`${tripId}_${uid}`) || {};
        next.set(`${tripId}_${uid}`, { ...existing, name: cleanName, role: 'copilota' });
        return next;
      });

      // Aggiorna anche tripMembers se aperto
      setTripMembers(prev => prev.map(m => (m.uid === uid ? { ...m, name: cleanName } : m)));

      setEditingCopilotKey(null);
      setEditingCopilotName('');
      setCopilotActionSuccess(`Nome copilota aggiornato in "${cleanName}" (${uid.slice(0, 8)}…) per il viaggio "${tripTitle}".`);
      logDiag(`Aggiornato nome copilota ${uid} in "${cleanName}" nel viaggio ${tripId}`, 'success');
    } catch (err: any) {
      console.error('[AdminDashboard] Errore salvataggio nome copilota:', err);
      if (err?.code === 'permission-denied') {
        setCopilotActionError('Permesso negato: verifica che la sessione Admin globale sia attiva (nunzio114@gmail.com).');
      } else {
        setCopilotActionError(err?.message || 'Errore durante il salvataggio del nome copilota.');
      }
    } finally {
      setSavingCopilotKey(null);
    }
  };

  // Rimozione sicura di un copilota dal viaggio (senza toccare l'account Firebase dell'utente)
  const handleConfirmRemoveCopilot = async () => {
    if (!removingCopilotTarget || !db) return;
    const { tripId, tripTitle, uid, name } = removingCopilotTarget;

    setIsRemovingCopilot(true);
    setCopilotActionError(null);
    setCopilotActionSuccess(null);

    try {
      // Esecuzione atomica client-side con writeBatch
      const batch = writeBatch(db);
      const tripRef = doc(db, 'trips', tripId);
      batch.update(tripRef, {
        members: arrayRemove(uid),
        updatedAt: Date.now()
      });

      const memberRef = doc(db, 'trips', tripId, 'members', uid);
      batch.delete(memberRef);
      await batch.commit();

      // 3. NOTA DI SICUREZZA: L'account Firebase Auth NON viene toccato/cancellato!

      // 4. Aggiorna lo stato locale dei viaggi
      setTrips(prev => prev.map(t => {
        if (t.id === tripId) {
          const updated = (t.membersList || []).filter(u => u !== uid);
          return { ...t, membersList: updated, membersCount: updated.length };
        }
        return t;
      }));

      // Aggiorna tripMembers se aperto
      setTripMembers(prev => prev.filter(m => !(m.uid === uid && selectedTripId === tripId)));

      // Aggiorna copilotsMeta
      setCopilotsMeta(prev => {
        const next = new Map(prev);
        next.delete(`${tripId}_${uid}`);
        return next;
      });

      const label = name ? `"${name}" (${uid.slice(0, 8)}…)` : uid;
      setCopilotActionSuccess(`Copilota ${label} rimosso con successo dal viaggio "${tripTitle}". Il suo account Firebase è rimasto intatto.`);
      logDiag(`Rimosso copilota ${uid} dal viaggio ${tripId} (account Firebase preservato)`, 'success');
      setRemovingCopilotTarget(null);
    } catch (err: any) {
      console.error('[AdminDashboard] Errore rimozione copilota:', err);
      if (err?.code === 'permission-denied') {
        setCopilotActionError('Permesso negato: operazione riservata all\'Admin globale o all\'owner del viaggio.');
      } else {
        setCopilotActionError(err?.message || 'Errore durante la rimozione del copilota.');
      }
    } finally {
      setIsRemovingCopilot(false);
    }
  };

  // Salvataggio manuale della Meta / Destinazione del viaggio da Console Manager
  const handleSaveTripDestination = async (tripId: string) => {
    if (!db || tripId === '0000') return;
    const cleanDest = editingDestinationValue.trim();
    setIsSavingDestination(true);
    try {
      const tripRef = doc(db, 'trips', tripId);
      await setDoc(tripRef, { destination: cleanDest, updatedAt: Date.now() }, { merge: true });
      setTrips(prev => prev.map(t => (t.id === tripId ? { ...t, destination: cleanDest || undefined } : t)));
      setEditingDestinationTripId(null);
      setEditingDestinationValue('');
      logDiag(`Aggiornata meta viaggio ${tripId}: "${cleanDest || 'Non specificata'}"`, 'success');
    } catch (err: any) {
      console.error('[AdminDashboard] Errore salvataggio meta viaggio:', err);
      logDiag(`Errore salvataggio meta per ${tripId}: ${err?.message}`, 'warn');
    } finally {
      setIsSavingDestination(false);
    }
  };

  // Associazione diretta di un Copilota verificato a un viaggio da Console Manager
  const handleAdminAssignCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetTripId = assignCopilotTripId.trim();
    const targetUid = assignCopilotUid.trim();
    const targetName = assignCopilotName.trim() || 'Copilota';

    if (!targetTripId || !targetUid) {
      setCopilotActionError('Seleziona un viaggio e inserisci l’UID del Copilota da associare.');
      return;
    }
    if (targetTripId === '0000') {
      setCopilotActionError('Il viaggio reale 0000 è protetto: le membership non possono essere alterate dalla Console.');
      return;
    }
    if (!db) return;

    const targetTrip = trips.find(t => t.id === targetTripId);
    if (targetTrip?.ownerUid === targetUid) {
      setCopilotActionError('Questo UID appartiene già all’Organizzatore (Owner) del viaggio selezionato.');
      return;
    }

    setIsAssigningCopilot(true);
    setCopilotActionError(null);
    setCopilotActionSuccess(null);

    try {
      const now = Date.now();
      const batch = writeBatch(db);
      const tripRef = doc(db, 'trips', targetTripId);
      const memberRef = doc(db, 'trips', targetTripId, 'members', targetUid);

      batch.update(tripRef, {
        members: arrayUnion(targetUid),
        updatedAt: now
      });

      batch.set(memberRef, {
        uid: targetUid,
        name: targetName,
        role: 'copilota',
        joinedAt: now,
        updatedAt: now
      }, { merge: true });

      await batch.commit();

      setTrips(prev => prev.map(t => {
        if (t.id === targetTripId) {
          const nextMembers = Array.from(new Set([...(t.membersList || []), targetUid]));
          return { ...t, membersList: nextMembers, membersCount: nextMembers.length };
        }
        return t;
      }));

      setCopilotsMeta(prev => {
        const next = new Map(prev);
        next.set(`${targetTripId}_${targetUid}`, { name: targetName, role: 'copilota', joinedAt: now });
        return next;
      });

      setAssignCopilotUid('');
      setAssignCopilotName('');
      setCopilotActionSuccess(`Copilota "${targetName}" (${targetUid.slice(0, 8)}…) associato con successo al viaggio "${targetTrip?.title || targetTripId}".`);
      logDiag(`Associato copilota ${targetUid} (${targetName}) al viaggio ${targetTripId}`, 'success');
    } catch (err: any) {
      console.error('[AdminDashboard] Errore associazione copilota:', err);
      setCopilotActionError(err?.message || 'Errore durante l’associazione del copilota.');
    } finally {
      setIsAssigningCopilot(false);
    }
  };

  // Caricamento partecipanti e controllo discrepanze per il viaggio selezionato
  useEffect(() => {
    if (!selectedTripId || !db) {
      setTripMembers([]);
      setMembersError(null);
      return;
    }

    let isMounted = true;
    const loadTripMembers = async () => {
      setLoadingMembers(true);
      setMembersError(null);
      try {
        const subMembersMap = new Map<string, any>();
        try {
          const membersCol = collection(db, 'trips', selectedTripId, 'members');
          const snap = await getDocs(membersCol);
          snap.docs.forEach(docSnap => {
            subMembersMap.set(docSnap.id, docSnap.data());
          });
        } catch (subErr: any) {
          console.warn('[AdminDashboard] Lettura sottocollezione members non disponibile:', subErr);
          if (subErr?.code === 'permission-denied') {
            setMembersError('Dettagli avanzati sottocollezione riservati: visualizzati partecipanti registrati nel documento radice del viaggio.');
          } else {
            setMembersError(subErr?.message || 'Accesso dettagli sottocollezione non disponibile.');
          }
        }

        const targetTrip = trips.find(t => t.id === selectedTripId);
        const arrayMembers = new Set(targetTrip?.membersList || []);

        const combined: Array<{
          uid: string;
          name?: string;
          email?: string;
          role: string;
          joinedAt?: number | string;
          inTripArray: boolean;
          inSubcollection: boolean;
          discrepancy?: 'missing_in_subcollection' | 'missing_in_array';
        }> = [];
        const seenUids = new Set<string>();

        // 1. Membri da sottocollezione
        subMembersMap.forEach((data, uid) => {
          seenUids.add(uid);
          const inArray = arrayMembers.has(uid);
          combined.push({
            uid,
            name: data.name || data.displayName || undefined,
            email: data.email || undefined,
            role: data.role || (targetTrip?.ownerUid === uid ? 'owner' : 'member'),
            joinedAt: data.joinedAt || data.createdAt || undefined,
            inTripArray: inArray,
            inSubcollection: true,
            discrepancy: inArray ? undefined : 'missing_in_array'
          });
        });

        // 2. Membri presenti solo nell'array del documento ma senza documento sottocollezione
        arrayMembers.forEach(uid => {
          if (!seenUids.has(uid)) {
            combined.push({
              uid,
              name: undefined,
              email: undefined,
              role: targetTrip?.ownerUid === uid ? 'owner' : 'member',
              joinedAt: undefined,
              inTripArray: true,
              inSubcollection: false,
              discrepancy: 'missing_in_subcollection'
            });
          }
        });

        // Ordina mettendo per primi gli owner
        combined.sort((a, b) => {
          if (a.role === 'owner' && b.role !== 'owner') return -1;
          if (b.role === 'owner' && a.role !== 'owner') return 1;
          return (a.name || a.uid).localeCompare(b.name || b.uid);
        });

        if (isMounted) {
          setTripMembers(combined);
        }
      } catch (err: any) {
        console.warn('[AdminDashboard] Errore caricamento membri:', err);
        if (isMounted) {
          setMembersError(err?.message || 'Impossibile completare la lettura dei partecipanti.');
        }
      } finally {
        if (isMounted) setLoadingMembers(false);
      }
    };

    loadTripMembers();

    return () => {
      isMounted = false;
    };
  }, [selectedTripId, trips]);

  // Sincronizzazione stato utente Firebase Auth
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentAdminUser(user);
      if (user) {
        logDiag(`Sessione Auth attiva: ${user.isAnonymous ? 'Anonimo' : user.email || 'Persistente'}`, 'info');
        fetchGlobalTrips();
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
      setAccessStatus('unauthorized');
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
      fetchGlobalTrips();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setAccessStatus('network_error');
      setTrips([]);
      setTripsError('Dispositivo offline. Connessione internet non disponibile.');
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

    // Ricerca testuale estesa: ID, meta/destinazione, titolo e proprietario (UID, nome, email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.destination && t.destination.toLowerCase().includes(q)) ||
          (t.ownerUid && t.ownerUid.toLowerCase().includes(q)) ||
          (t.ownerEmail && t.ownerEmail.toLowerCase().includes(q)) ||
          (t.ownerName && t.ownerName.toLowerCase().includes(q))
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

    // Ordinamento completo
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
      } else if ((sortBy as any) === 'storage') {
        const valA = a.estimatedStorageBytes || 0;
        const valB = b.estimatedStorageBytes || 0;
        comparison = valA - valB;
      } else if ((sortBy as any) === 'owner') {
        const valA = a.ownerName || a.ownerEmail || a.ownerUid || '';
        const valB = b.ownerName || b.ownerEmail || b.ownerUid || '';
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
    return formatDateTimeIT(timestamp);
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
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                accessStatus === 'authorized' || accessStatus === 'empty_database'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40'
                  : accessStatus === 'unauthorized'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-900/40'
                  : accessStatus === 'network_error'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-900/40'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}>
                {accessStatus === 'authorized' || accessStatus === 'empty_database'
                  ? 'ADMIN GLOBALE'
                  : accessStatus === 'unauthorized'
                  ? 'ACCESSO NON AUTORIZZATO'
                  : accessStatus === 'network_error'
                  ? 'OFFLINE / RETE'
                  : 'VERIFICA IN CORSO...'}
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'trips'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🗺️ Viaggi {accessStatus === 'authorized' ? `(${trips.length})` : accessStatus === 'empty_database' ? '(0)' : accessStatus === 'unauthorized' ? '(Non autorizzato)' : accessStatus === 'network_error' ? '(Offline)' : ''}
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('copilots')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'copilots'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🧭 Copiloti ({allCopilotsList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('users')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'users'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              👥 Ultimi Accessi
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('notifications')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'notifications'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🔔 Notifiche Push
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('diagnostics')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                {accessStatus === 'authorized'
                  ? metrics.total
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {accessStatus === 'authorized'
                  ? 'Tutti i record su Firestore'
                  : accessStatus === 'empty_database'
                  ? 'Nessun record presente'
                  : accessStatus === 'unauthorized'
                  ? 'Query bloccata da Rules'
                  : accessStatus === 'network_error'
                  ? 'Dispositivo offline'
                  : 'Verifica permessi...'}
              </span>
            </div>

            {/* Viaggi Attivi */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                Attivi (&le;14gg)
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {accessStatus === 'authorized'
                  ? metrics.activeCount
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Con modifiche recenti</span>
            </div>

            {/* In Corso Ora */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                In Corso Ora
              </span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {accessStatus === 'authorized'
                  ? metrics.inProgressCount
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Vacanza attualmente in atto</span>
            </div>

            {/* Futuri Programmati */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 block mb-1">
                Futuri
              </span>
              <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                {accessStatus === 'authorized'
                  ? metrics.upcomingCount
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Partenza programmata</span>
            </div>

            {/* Dormienti / Inattivi */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mb-1">
                Dormienti (&gt;14gg)
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {accessStatus === 'authorized'
                  ? metrics.dormantCount
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Nessun accesso recente</span>
            </div>

            {/* Abbandonati / Silenti */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 block mb-1">
                Abbandonati (&gt;60gg)
              </span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {accessStatus === 'authorized'
                  ? metrics.abandonedCount
                  : accessStatus === 'empty_database'
                  ? 0
                  : '—'}
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
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      UID: {currentAdminUser?.uid || 'Non autenticato'}{' '}
                      {currentAdminUser?.email ? `• ${currentAdminUser.email}` : ''}
                    </p>
                    {currentAdminUser?.uid && (
                      <button
                        type="button"
                        onClick={() => handleCopyUid(currentAdminUser.uid)}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Copia identificativo utente"
                      >
                        {copiedUid === currentAdminUser.uid ? '✓ Copiato' : 'Copia UID'}
                      </button>
                    )}
                  </div>
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

            {/* Distinzione Ruoli: Owner Viaggio vs Amministratore Globale */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <span>📍</span>
                    <span>Ruolo Viaggio Locale</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    Viaggio {currentTripConfig?.id || '0000'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  L'utente è riconosciuto come Organizzatore del proprio viaggio locale. I permessi locali sono isolati e non autorizzano l'accesso al database globale.
                </p>
              </div>

              <div className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                accessStatus === 'authorized' || accessStatus === 'empty_database'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
                  : accessStatus === 'unauthorized'
                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50'
                  : accessStatus === 'network_error'
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <span>🌐</span>
                    <span>Console Admin Globale</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    accessStatus === 'authorized' || accessStatus === 'empty_database'
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                      : accessStatus === 'unauthorized'
                      ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                      : accessStatus === 'network_error'
                      ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                      : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {accessStatus === 'authorized' && 'AUTORIZZATO'}
                    {accessStatus === 'empty_database' && 'AUTORIZZATO (VUOTO)'}
                    {accessStatus === 'unauthorized' && 'NON AUTORIZZATO'}
                    {accessStatus === 'network_error' && 'OFFLINE / ERRORE'}
                    {accessStatus === 'checking' && 'VERIFICA IN CORSO...'}
                    {accessStatus === 'error' && 'ERRORE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {accessStatus === 'authorized' && 'Regole Firestore: autorizzazione globale confermata. Accesso a tutti i record attivo.'}
                  {accessStatus === 'empty_database' && 'Regole Firestore: autorizzazione globale confermata. Nessun viaggio registrato nel database.'}
                  {accessStatus === 'unauthorized' && 'Regole Firestore: autorizzazione globale non presente per questo account. Query bloccata server-side.'}
                  {accessStatus === 'network_error' && 'Connessione di rete non disponibile. Impossibile verificare i privilegi con i server Firestore.'}
                  {accessStatus === 'checking' && 'Verifica dello stato autorizzativo sulle Firestore Security Rules in corso…'}
                  {accessStatus === 'error' && (tripsError || 'Errore durante la verifica dei privilegi.')}
                </p>
              </div>
            </div>

            {/* 4 STATI: Banner Dettagliato di Stato */}
            {accessStatus === 'unauthorized' && (
              <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-900/60 rounded-2xl p-4 text-amber-950 dark:text-amber-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔒</span>
                  <h4 className="font-extrabold text-xs">Accesso Globale Riservato agli Amministratori di Sistema</h4>
                </div>
                <p className="text-xs leading-relaxed opacity-95">
                  L'account attualmente connesso è autenticato, ma non è presente nella collezione degli amministratori di sistema. Le Firestore Security Rules proteggono l'elenco globale dei viaggi dei viaggiatori.
                  Per richiedere l'abilitazione, fornisci il tuo UID all'amministratore dell'infrastruttura.
                </p>
                <div className="bg-amber-100/60 dark:bg-amber-900/40 rounded-xl p-3 text-[11px] space-y-1.5 border border-amber-300/50 dark:border-amber-800/50 font-mono">
                  <div className="font-bold text-amber-900 dark:text-amber-100 font-sans">
                    📋 Istruzioni Firebase Console per abilitazione:
                  </div>
                  <div>1. Apri <strong>Firestore Database</strong> nel progetto <code>app-viaggio-di-nozze</code></div>
                  <div>2. Seleziona / crea collezione: <code>system_admins</code></div>
                  <div>3. Crea documento con <strong>ID Documento</strong>: <code>{currentAdminUser?.uid || 'Tuo UID Utente'}</code></div>
                  <div>4. Campi richiesti: <code>role: "admin"</code> (stringa), <code>email: "{currentAdminUser?.email || 'tua@email.com'}"</code> (stringa)</div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-900/60 text-[11px]">
                  <span className="text-slate-600 dark:text-slate-300">
                    UID attivo: <code className="font-mono bg-amber-100/80 dark:bg-amber-900/60 px-1 py-0.5 rounded">{currentAdminUser?.uid || 'Non disponibile'}</code>
                  </span>
                  {currentAdminUser?.uid && (
                    <button
                      type="button"
                      onClick={() => handleCopyUid(currentAdminUser.uid)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-2xs"
                    >
                      {copiedUid === currentAdminUser.uid ? '✓ UID Copiato' : 'Copia UID'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {accessStatus === 'network_error' && (
              <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-300/80 dark:border-rose-900/60 rounded-2xl p-4 text-rose-950 dark:text-rose-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📶</span>
                  <h4 className="font-extrabold text-xs">Connessione di Rete Non Disponibile</h4>
                </div>
                <p className="text-xs leading-relaxed opacity-95">
                  Il dispositivo è offline o i server Firestore non sono momentaneamente raggiungibili. Riconnettiti alla rete per verificare i privilegi globali.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => fetchGlobalTrips()}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Riprova Connessione
                  </button>
                </div>
              </div>
            )}

            {accessStatus === 'empty_database' && (
              <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/50 rounded-2xl px-4 py-3 flex items-center justify-between text-xs text-indigo-950 dark:text-indigo-200">
                <div className="flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    Consultazione globale autorizzata con successo dalle Rules. Nessun viaggio è attualmente presente nel cloud.
                  </span>
                </div>
                <span className="text-[10px] opacity-75 font-mono">0 record trovati</span>
              </div>
            )}

            {accessStatus === 'authorized' && (
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/50 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-950 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <span>🟢</span>
                  <span>
                    Consultazione globale autorizzata. Ultima attività registrata nel cloud:{' '}
                    <strong>{formatDate(metrics.latestActivityTimestamp || undefined)}</strong>
                  </span>
                </div>
                <span className="text-[10px] opacity-75 font-mono">Modalità protetta attiva</span>
              </div>
            )}
          </div>

          {/* Monitoraggio Utilizzo Database Firestore (Quota Spark 1 GiB) */}
          {accessStatus === 'authorized' && (
            <DatabaseUsagePanel
              officialMetric={officialMetric}
              onToggleOfficialMetricAvailability={(available) =>
                setOfficialMetric(prev => ({ ...prev, available }))
              }
              trips={trips}
              isBatchCalculating={isBatchCalculatingStorage}
              batchProgress={batchProgress}
              onBatchCalculate={handleBatchCalculateStorage}
              onClearCache={handleClearStorageCache}
            />
          )}

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
                    <option value="storage">Spazio Occupato (Stimato)</option>
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
                    <th className="p-3">ID / Titolo / Meta</th>
                    <th className="p-3">Periodo Previsto</th>
                    <th className="p-3">Organizzatore</th>
                    <th className="p-3">Membri / Tappe</th>
                    <th className="p-3">Spazio Stimato</th>
                    <th className="p-3">Stato</th>
                    <th className="p-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {loadingTrips ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span>Caricamento dei viaggi in corso...</span>
                        </div>
                      </td>
                    </tr>
                  ) : accessStatus === 'unauthorized' ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                          <span className="text-2xl">🔒</span>
                          <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                            Accesso Globale Negato dalle Firestore Rules
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Questo account non dispone dei privilegi di amministratore globale per elencare i viaggi nel database. La visualizzazione è bloccata server-side dalle Firestore Security Rules.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : accessStatus === 'network_error' ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 px-4">
                        <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                          <span className="text-2xl">📶</span>
                          <span className="text-sm font-extrabold text-rose-700 dark:text-rose-400">
                            Dispositivo Offline o Errore di Rete
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Impossibile stabilire una connessione con i server Firestore.
                          </p>
                          <button
                            type="button"
                            onClick={() => fetchGlobalTrips()}
                            className="mt-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                          >
                            Riprova Caricamento
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : accessStatus === 'empty_database' ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-xl">ℹ️</span>
                          <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Nessun viaggio presente nel database</span>
                          <span className="text-[11px]">La query è stata autorizzata, ma la collezione /trips non contiene attualmente record.</span>
                        </div>
                      </td>
                    </tr>
                  ) : tripsError ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-amber-600 dark:text-amber-400">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-base font-bold">Lettura viaggi non completata</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 max-w-md">{tripsError}</span>
                          <button
                            type="button"
                            onClick={() => fetchGlobalTrips()}
                            className="mt-2 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs"
                          >
                            Riprova caricamento
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedTrips.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
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
                        {/* ID, Titolo e Meta */}
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span className="truncate max-w-[180px] sm:max-w-[240px]">{trip.title}</span>
                            {currentTripConfig?.id === trip.id && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-md font-mono">
                                Corrente
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] mt-0.5">
                            <span className="font-mono text-slate-500 dark:text-slate-400 font-bold">
                              ID: {trip.id}
                            </span>
                            {trip.destination ? (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                                📍 {trip.destination}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Meta: Da definire</span>
                            )}
                          </div>
                        </td>

                        {/* Periodo */}
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {trip.startDate && trip.endDate ? (
                            <div>
                              <div>{formatDateRangeIT(trip.startDate, trip.endDate)}</div>
                              <div className="text-[10px] text-slate-400">
                                {trip.totalDays ? `${trip.totalDays} giorni` : ''}
                              </div>
                            </div>
                          ) : trip.startDate ? (
                            <div>
                              <div>Inizio: {formatDateIT(trip.startDate)}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Non specificato</span>
                          )}
                        </td>

                        {/* Proprietario */}
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {formatUserDisplayName(
                              trip.ownerName || (trip.ownerEmail ? trip.ownerEmail.split('@')[0] : null),
                              'owner',
                              trip.ownerUid
                            )}
                          </div>
                          {trip.ownerEmail && trip.ownerName && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {trip.ownerEmail}
                            </div>
                          )}
                          <div className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={trip.ownerUid}>
                            UID: {trip.ownerUid ? `${trip.ownerUid.slice(0, 10)}...` : 'Non disponibile'}
                          </div>
                        </td>

                        {/* Membri e Tappe */}
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-slate-700 dark:text-slate-300">
                              👥 {trip.membersCount} membri
                            </span>
                            <span className="text-[10px] text-slate-500">
                              📌 {typeof trip.tappeCount === 'number' ? `${trip.tappeCount} tappe` : 'Non disponibile'}
                            </span>
                          </div>
                        </td>

                        {/* Memoria Occupata Stimata */}
                        <td className="p-3">
                          <div className="flex flex-col gap-1 items-start">
                            <div className="font-mono font-extrabold text-xs text-slate-900 dark:text-white">
                              {formatStorageBytes(trip.estimatedStorageBytes || 0)}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              {(trip.quotaPercentage || calculateQuotaPercentage(trip.estimatedStorageBytes || 0)).toFixed(4)}% di 1 GiB
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  trip.storageStatus === 'calcolata'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : trip.storageStatus === 'parziale'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {trip.storageStatus === 'calcolata'
                                  ? `✓ Dettagliata (${trip.docsCount || 1} doc)`
                                  : trip.storageStatus === 'parziale'
                                  ? `Stima parziale (${trip.docsCount || 1} doc)`
                                  : 'Non disp.'}
                              </span>
                              <button
                                type="button"
                                disabled={calculatingStorageTripId === trip.id || isBatchCalculatingStorage}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCalculateSingleTripStorage(trip.id);
                                }}
                                className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 rounded-md font-bold transition-colors cursor-pointer disabled:opacity-50"
                                title="Calcola o aggiorna lo spazio occupato dalle sottocollezioni di questo viaggio"
                              >
                                {calculatingStorageTripId === trip.id ? 'Calcolo…' : trip.storageStatus === 'calcolata' ? 'Aggiorna' : '⚡ Dettaglio'}
                              </button>
                            </div>
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
                          <div className="flex items-center justify-end gap-1.5">
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
                            {trip.id === '0000' ? (
                              <span
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed select-none"
                                title="Viaggio reale 0000 protetto (eliminazione disabilitata)"
                              >
                                🔒 Protetto
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setDeleteTargetTrip(trip);
                                  setDeleteActionError(null);
                                  setDeleteConfirmId('');
                                  setDeletionCommands(null);
                                }}
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                                title="Elimina viaggio (Solo Admin)"
                                aria-label={`Elimina viaggio ${trip.title}`}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Barra Riepilogo e Paginazione */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span>
                  Mostrati <strong>{paginatedTrips.length}</strong> di <strong>{filteredTrips.length}</strong> viaggi
                  {trips.length !== filteredTrips.length && ` (filtrati da ${trips.length} totali)`}
                </span>
                <label className="flex items-center gap-1.5 text-[11px]">
                  <span>Per pagina:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <span>
                    Pagina {currentPage} di {totalPages}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                    >
                      Precedente
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                    >
                      Successiva
                    </button>
                  </div>
                </div>
              )}
            </div>
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
                    {formatDateTimeIT(selectedTrip.createdAt)}
                  </span>
                </div>

                {/* Ultimo Aggiornamento */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Ultimo Sync / Modifica</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {formatDateTimeIT(selectedTrip.updatedAt)}
                  </span>
                </div>

                {/* Proprietario */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <span className="text-slate-400 block font-semibold text-[10px]">Organizzatore (UID)</span>
                  <span className="font-mono text-[11px] text-slate-900 dark:text-white truncate block">
                    {selectedTrip.ownerUid || 'Non disponibile'}
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

              {/* Meta / Destinazione Viaggio con modifica rapida Admin */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span>📍</span>
                  <span className="text-slate-500 font-semibold">Meta / Destinazione:</span>
                  {editingDestinationTripId === selectedTrip.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingDestinationValue}
                        onChange={e => setEditingDestinationValue(e.target.value)}
                        placeholder="Es. Giappone (Tokyo, Kyoto, Osaka)"
                        className="px-2.5 py-1 text-xs rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={isSavingDestination}
                        onClick={() => handleSaveTripDestination(selectedTrip.id)}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        {isSavingDestination ? '...' : 'Salva'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDestinationTripId(null)}
                        className="px-2 py-1 text-slate-500 text-[11px] cursor-pointer"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <strong className="text-slate-900 dark:text-white truncate">
                      {selectedTrip.destination || 'Da definire'}
                    </strong>
                  )}
                </div>
                {selectedTrip.id !== '0000' && editingDestinationTripId !== selectedTrip.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDestinationTripId(selectedTrip.id);
                      setEditingDestinationValue(selectedTrip.destination || '');
                    }}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    ✏️ Imposta / Modifica Meta
                  </button>
                )}
              </div>

              {/* Sezione Partecipanti Registrati e Controllo Discrepanze */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>👥</span>
                    <span>Partecipanti con Accesso ({tripMembers.length})</span>
                  </h3>
                  {loadingMembers && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Caricamento membri...
                    </span>
                  )}
                </div>

                {membersError ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-2xl text-xs text-amber-800 dark:text-amber-300">
                    {membersError}
                  </div>
                ) : tripMembers.length === 0 && !loadingMembers ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-xs text-slate-500 text-center">
                    Nessun partecipante registrato nella sottocollezione membri o nell'array del viaggio.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {tripMembers.map(member => (
                      <div
                        key={member.uid}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate block">
                              {member.name || 'Nome non impostato'}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                              {member.email || 'Email non disponibile'}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                              member.role === 'owner'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60'
                                : member.role === 'copilota'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300/60'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {member.role === 'owner' ? '👑 Owner' : member.role === 'copilota' ? '🧭 Copilota' : '👤 Membro'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-200/40 dark:border-slate-700/40">
                          <span className="truncate max-w-[180px]" title={member.uid}>
                            UID: {member.uid}
                          </span>
                          <span>
                            {member.joinedAt ? formatDateTimeIT(member.joinedAt) : 'Data n/d'}
                          </span>
                        </div>

                        {/* Rilevamento e Segnalazione Discrepanze Membri */}
                        {member.discrepancy === 'missing_in_array' && (
                          <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 px-2 py-1 rounded-lg">
                            ⚠️ Presente nella sottocollezione /members ma assente nell'array 'members' del documento principale.
                          </div>
                        )}
                        {member.discrepancy === 'missing_in_subcollection' && (
                          <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-950/40 px-2 py-1 rounded-lg">
                            ⚠️ Indicizzato nell'array 'members' del viaggio ma documento assente nella sottocollezione /members/{'{uid}'}.
                          </div>
                        )}
                        {/* Azioni Rapide per Copilota nel Dettaglio Viaggio */}
                        {member.role !== 'owner' && (
                          <div className="pt-2 border-t border-slate-200/40 dark:border-slate-700/40 flex items-center justify-between gap-2">
                            {editingCopilotKey === `${selectedTripId}_${member.uid}` ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <input
                                  type="text"
                                  value={editingCopilotName}
                                  onChange={e => setEditingCopilotName(e.target.value)}
                                  placeholder="Nuovo nome"
                                  className="px-2 py-0.5 text-xs rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white flex-1"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  disabled={savingCopilotKey === `${selectedTrip.id}_${member.uid}`}
                                  onClick={() => handleSaveCopilotName(selectedTrip.id, member.uid, selectedTrip.title)}
                                  className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Salva
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCopilotKey(null)}
                                  className="px-1.5 py-0.5 text-slate-500 text-[10px] cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCopilotKey(`${selectedTrip.id}_${member.uid}`);
                                    setEditingCopilotName(member.name || '');
                                  }}
                                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>✏️</span>
                                  <span>{member.name ? 'Modifica nome' : 'Assegna nome'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRemovingCopilotTarget({
                                    tripId: selectedTrip.id,
                                    tripTitle: selectedTrip.title,
                                    uid: member.uid,
                                    name: member.name
                                  })}
                                  className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                                >
                                  Rimuovi dal viaggio
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

      {/* ─── TAB GESTIONE COPILOTI GLOBALE ───────────────────────── */}
      {activeAdminTab === 'copilots' && (
        <div className="space-y-4 animate-fade-in">
          {/* Header e Ricerca */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧭</span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Gestione Copiloti e Identità
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Visualizza, assegna nomi e gestisci i copiloti associati ai viaggi nel sistema
                  </p>
                </div>
              </div>
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                {allCopilotsList.length} copiloti totali
              </div>
            </div>

            {/* Banner Informativo / Esiti Operazioni */}
            {copilotActionSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in">
                <span>✅ {copilotActionSuccess}</span>
                <button
                  type="button"
                  onClick={() => setCopilotActionSuccess(null)}
                  className="text-emerald-700 hover:text-emerald-900 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {copilotActionError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in">
                <span>⚠️ {copilotActionError}</span>
                <button
                  type="button"
                  onClick={() => setCopilotActionError(null)}
                  className="text-rose-700 hover:text-rose-900 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Barra di Ricerca Copiloti */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cerca copilota per UID, nome visualizzato o viaggio..."
                  value={copilotSearchQuery}
                  onChange={e => setCopilotSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 pl-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
                {copilotSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCopilotSearchQuery('')}
                    className="absolute right-3 top-2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Form Associazione Diretta Copilota a un Viaggio (Solo Admin) */}
            <form
              onSubmit={handleAdminAssignCopilot}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span>➕</span>
                  <span>Associa Copilota a un Viaggio (Console Manager)</span>
                </h3>
                <span className="text-[10px] text-slate-500">Il viaggio 0000 è protetto da modifiche</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <select
                  value={assignCopilotTripId}
                  onChange={e => setAssignCopilotTripId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  required
                >
                  <option value="">Seleziona viaggio...</option>
                  {trips
                    .filter(t => t.id !== '0000')
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.id})
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={assignCopilotUid}
                  onChange={e => setAssignCopilotUid(e.target.value)}
                  placeholder="UID Firebase Copilota"
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  required
                />
                <input
                  type="text"
                  value={assignCopilotName}
                  onChange={e => setAssignCopilotName(e.target.value)}
                  placeholder="Nome visualizzato (es. Giusy)"
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={isAssigningCopilot || !assignCopilotTripId || !assignCopilotUid.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isAssigningCopilot ? 'Associazione...' : 'Associa Copilota'}
                </button>
              </div>
            </form>

            {/* Tabella o Elenco Copiloti */}
            {loadingCopilotsMeta ? (
              <div className="py-10 text-center text-xs text-slate-500 space-y-2">
                <span className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p>Caricamento copiloti e identità in corso…</p>
              </div>
            ) : filteredCopilots.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-1 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="font-bold">Nessun copilota trovato</p>
                <p className="text-[11px] opacity-75">
                  {copilotSearchQuery ? 'Nessun risultato corrisponde alla ricerca.' : 'Nessun viaggio ha attualmente membri secondari (copiloti) registrati.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 font-extrabold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-3">Nome Visualizzato</th>
                      <th className="p-3">Identità Firebase (UID)</th>
                      <th className="p-3">Viaggio di Appartenenza</th>
                      <th className="p-3">Ruolo</th>
                      <th className="p-3 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCopilots.map(copilot => {
                      const isEditing = editingCopilotKey === copilot.key;
                      const isSaving = savingCopilotKey === copilot.key;

                      return (
                        <tr key={copilot.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                          {/* Nome Visualizzato */}
                          <td className="p-3 font-medium">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingCopilotName}
                                  onChange={e => setEditingCopilotName(e.target.value)}
                                  placeholder="Es. Co-pilota"
                                  className="px-2.5 py-1 text-xs rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                                  autoFocus
                                  disabled={isSaving}
                                />
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleSaveCopilotName(copilot.tripId, copilot.uid, copilot.tripTitle)}
                                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs"
                                >
                                  {isSaving ? (
                                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  ) : (
                                    'Salva'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => {
                                    setEditingCopilotKey(null);
                                    setEditingCopilotName('');
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  Annulla
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 dark:text-white">
                                  {copilot.name || <span className="italic text-slate-400 font-normal">Nessun nome visualizzato</span>}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCopilotKey(copilot.key);
                                    setEditingCopilotName(copilot.name || '');
                                    setCopilotActionError(null);
                                    setCopilotActionSuccess(null);
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[11px] cursor-pointer"
                                  title="Modifica o assegna nome visualizzato"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Identità Firebase UID */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="truncate max-w-[150px] sm:max-w-[200px]" title={copilot.uid}>
                                {copilot.uid}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (navigator.clipboard) {
                                    navigator.clipboard.writeText(copilot.uid);
                                    setCopilotActionSuccess(`UID ${copilot.uid.slice(0, 8)}… copiato negli appunti!`);
                                  }
                                }}
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-500 hover:text-indigo-600 text-[10px] cursor-pointer"
                                title="Copia UID"
                              >
                                📋
                              </button>
                            </div>
                          </td>

                          {/* Viaggio di Appartenenza */}
                          <td className="p-3">
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block truncate max-w-[160px]">
                                {copilot.tripTitle}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 block truncate">
                                ID: {copilot.tripId}
                              </span>
                            </div>
                          </td>

                          {/* Ruolo */}
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300/60">
                              🧭 Copilota
                            </span>
                          </td>

                          {/* Azioni */}
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => setRemovingCopilotTarget(copilot)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                              title="Rimuovi copilota dal viaggio"
                            >
                              Rimuovi dal viaggio
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODALE CONFERMA RIMOZIONE COPILOTA ────────────────────── */}
      {removingCopilotTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-950 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl p-2 bg-amber-100 dark:bg-amber-950 text-amber-600 rounded-2xl">⚠️</span>
              <div className="flex-1">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Rimuovi Copilota dal Viaggio
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Revoca l'accesso al viaggio senza cancellare l'account Firebase
                </p>
              </div>
              <button
                type="button"
                disabled={isRemovingCopilot}
                onClick={() => setRemovingCopilotTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl text-xs space-y-1.5 text-amber-900 dark:text-amber-200">
              <div>
                <strong>Copilota:</strong> {removingCopilotTarget.name || 'Nome non impostato'}
              </div>
              <div className="font-mono text-[11px]">
                <strong>UID:</strong> {removingCopilotTarget.uid}
              </div>
              <div>
                <strong>Viaggio:</strong> {removingCopilotTarget.tripTitle} ({removingCopilotTarget.tripId})
              </div>
              <p className="text-[10px] text-amber-700 dark:text-amber-300 pt-1 border-t border-amber-200/60 dark:border-amber-900/60">
                L'utente verrà rimosso dall'elenco dei partecipanti di questo viaggio. Il suo account Firebase Auth, i suoi viaggi personali e i dati condivisi <strong>non</strong> verranno cancellati.
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Sei sicuro di voler procedere con la rimozione del copilota dal viaggio?
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isRemovingCopilot}
                onClick={() => setRemovingCopilotTarget(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isRemovingCopilot}
                onClick={handleConfirmRemoveCopilot}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-sm"
              >
                {isRemovingCopilot ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span>Rimozione in corso…</span>
                  </>
                ) : (
                  <span>Conferma Rimozione</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB ULTIMI ACCESSI UTENTI (PAGINAZIONE REALE FIRESTORE SPARK) ─ */}
      {activeAdminTab === 'users' && (
        <div className="space-y-4 animate-fade-in">
          {/* Header e Controlli Sezione */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">👥</span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Ultimi Accessi Utenti
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Consultazione degli accessi registrati sul cloud Firestore con paginazione server-side reale
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      if (usersSortBy === 'lastAccessAt') return;
                      setUsersSortBy('lastAccessAt');
                      setUsersCursorStack([null]);
                      loadUsersPage(1, null, 'lastAccessAt');
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      usersSortBy === 'lastAccessAt'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    🔑 Ultimo Accesso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (usersSortBy === 'lastSeenAt') return;
                      setUsersSortBy('lastSeenAt');
                      setUsersCursorStack([null]);
                      loadUsersPage(1, null, 'lastSeenAt');
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      usersSortBy === 'lastSeenAt'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    ⚡ Ultima Attività
                  </button>
                </div>

                <button
                  type="button"
                  disabled={loadingUsers}
                  onClick={() => {
                    setUsersCursorStack([null]);
                    loadUsersPage(1, null, usersSortBy);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Ricarica elenco utenti da Firestore"
                >
                  <span className={`inline-block ${loadingUsers ? 'animate-spin' : ''}`}>🔄</span>
                  <span>{loadingUsers ? 'Caricamento…' : 'Aggiorna'}</span>
                </button>
              </div>
            </div>

            {/* Banner di Trasparenza Architettura e Privacy */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/50 text-[11px] space-y-1.5 text-indigo-950 dark:text-indigo-200">
              <div className="font-extrabold flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>Architettura Dati & Limiti Tecnologici Firebase Spark</span>
              </div>
              <p className="leading-relaxed opacity-90">
                La registrazione dell'ultimo accesso e dell'ultima attività avviene in modo trasparente e conforme al piano gratuito Firebase Spark (0 Cloud Functions). Ogni utente autenticato aggiorna esclusivamente il proprio record in <code>/users/{'{uid}'}</code> con <code>serverTimestamp()</code> protetto da regole di sicurezza.
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] opacity-80">
                <li><strong>Ultimo Accesso:</strong> registrato all'avvio dell'applicazione con sessione attiva.</li>
                <li><strong>Ultima Attività:</strong> registrata in modo leggero e discreto solo con app in primo piano, con un intervallo minimo di 15 minuti tra le scritture per preservare la quota Spark.</li>
                <li><strong>Tutela Privacy:</strong> nessun tracciamento di navigazione o geolocalizzazione; il dato è accessibile unicamente all'amministratore autorizzato e modificabile dall'utente solo per il proprio record.</li>
                <li>Se un partecipante non ha ancora un record registrato, la data viene correttamente indicata come <strong>Non disponibile</strong>.</li>
              </ul>
            </div>

            {/* Messaggio di Errore */}
            {usersError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3">
                <span>⚠️ {usersError}</span>
                <button
                  type="button"
                  onClick={() => loadUsersPage(usersPage, usersCursorStack[usersPage - 1] || null)}
                  className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Riprova
                </button>
              </div>
            )}
          </div>

          {/* Tabella Dati Utenti con Paginazione Reale */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Nome Visualizzato</th>
                    <th className="py-3 px-4">UID Utente</th>
                    <th className="py-3 px-4">Viaggi Associati</th>
                    <th className="py-3 px-4">Ultimo Accesso</th>
                    <th className="py-3 px-4">Ultima Attività</th>
                    <th className="py-3 px-4 text-center">Stato Dato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {loadingUsers && usersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">Interrogazione collezione /users su Firestore in corso…</span>
                        </div>
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        Nessun utente registrato nella collezione /users.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((user) => {
                      // Risoluzione autoritativa dei viaggi associati a partire dai dati reali dei viaggi caricati
                      const tripLabels: string[] = [];
                      const authoritativeTrips = trips.filter(
                        t => t.ownerUid === user.uid || (Array.isArray(t.membersList) && t.membersList.includes(user.uid))
                      );
                      if (authoritativeTrips.length > 0) {
                        authoritativeTrips.forEach((t) => {
                          tripLabels.push(`${t.title} (${t.id})`);
                        });
                      } else if (user.lastTripId && user.lastTripId !== '0000') {
                        const matchedTrip = trips.find(t => t.id === user.lastTripId);
                        if (matchedTrip) {
                          tripLabels.push(`${matchedTrip.title} (${matchedTrip.id})`);
                        }
                      }

                      return (
                        <tr
                          key={user.uid}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Nome Visualizzato */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs shrink-0">
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : '👤'}
                              </span>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 dark:text-white block truncate">
                                  {user.displayName || (user.isAnonymous ? 'Utente Anonimo (Ospite)' : 'Nome non specificato')}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* UID con Copia negli Appunti */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              <span className="truncate max-w-[140px] sm:max-w-[200px]" title={user.uid}>
                                {user.uid}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyUid(user.uid)}
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-sans font-bold transition-colors cursor-pointer shrink-0"
                                title="Copia UID negli appunti"
                              >
                                {copiedUid === user.uid ? '✓ Copiato' : '📋 Copia'}
                              </button>
                            </div>
                          </td>

                          {/* Viaggi Associati */}
                          <td className="py-3 px-4">
                            {tripLabels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {tripLabels.map((lbl, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 text-indigo-800 dark:text-indigo-300 text-[10px] font-semibold truncate max-w-[180px]"
                                    title={lbl}
                                  >
                                    ✈️ {lbl}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">
                                Nessun viaggio registrato
                              </span>
                            )}
                          </td>

                          {/* Ultimo Accesso */}
                          <td className="py-3 px-4">
                            {user.lastAccessAt ? (
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {formatDateTimeIT(user.lastAccessAt)}
                              </div>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                                Non disponibile
                              </span>
                            )}
                          </td>

                          {/* Ultima Attività (lastSeenAt) */}
                          <td className="py-3 px-4">
                            {user.lastSeenAt ? (
                              <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                                {formatDateTimeIT(user.lastSeenAt)}
                              </div>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-[10px]">
                                Nessuna attività
                              </span>
                            )}
                          </td>

                          {/* Stato Dato */}
                          <td className="py-3 px-4 text-center">
                            {user.lastAccessAt || user.lastSeenAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60">
                                <span>✓</span>
                                <span>Attivo</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60">
                                <span>⚠️</span>
                                <span>In attesa</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Controlli di Paginazione Reale Cursore startAfter */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 dark:text-slate-400 font-medium">
                Pagina <strong className="text-slate-900 dark:text-white">{usersPage}</strong>
                {usersList.length > 0 && (
                  <span> • {usersList.length} utenti visualizzati (dimensione pagina: 20)</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={usersPage <= 1 || loadingUsers}
                  onClick={handlePrevUsersPage}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                >
                  ← Precedente
                </button>
                <button
                  type="button"
                  disabled={!usersHasMore || loadingUsers}
                  onClick={handleNextUsersPage}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                >
                  Successiva →
                </button>
              </div>
            </div>
          </div>
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
                      Quota Spark 1 GiB e metrica ufficiale Google Cloud Monitoring
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  officialMetric.available && officialMetric.bytes > 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}>
                  {officialMetric.available && officialMetric.bytes > 0 ? 'DATO CERTIFICATO' : 'DATO PARZIALE'}
                </span>
              </div>

              {officialMetric.available && officialMetric.bytes > 0 ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                      <span>Totale ufficiale: {formatStorageBytes(officialMetric.bytes)}</span>
                      <span>Residuo: {formatStorageBytes(Math.max(0, officialMetric.quotaLimitBytes - officialMetric.bytes))}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          calculateQuotaPercentage(officialMetric.bytes, officialMetric.quotaLimitBytes) >= 95
                            ? 'bg-rose-500'
                            : calculateQuotaPercentage(officialMetric.bytes, officialMetric.quotaLimitBytes) >= 85
                            ? 'bg-amber-500'
                            : calculateQuotaPercentage(officialMetric.bytes, officialMetric.quotaLimitBytes) >= 70
                            ? 'bg-yellow-500'
                            : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.max(1, calculateQuotaPercentage(officialMetric.bytes, officialMetric.quotaLimitBytes))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span>Quota Spark: {formatStorageBytes(officialMetric.quotaLimitBytes)}</span>
                      <span className="font-semibold">{calculateQuotaPercentage(officialMetric.bytes, officialMetric.quotaLimitBytes).toFixed(2)}% occupato</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span className="truncate max-w-[200px]">Metrica: <code>data_and_index_storage</code></span>
                      <span>Aggiornato: {formatDateTimeIT(officialMetric.measuredAt)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Include documenti e overhead indici dell'intero database <code>(default)</code>.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-base text-amber-500 shrink-0">ℹ️</span>
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <p className="font-extrabold text-slate-900 dark:text-white">Totale ufficiale non disponibile</p>
                      <p className="leading-relaxed">
                        L'SDK Web client non dispone di credenziali per invocare l'API Cloud Monitoring.
                        Consulta il pannello Viaggi per la somma delle stime documentali.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
                <span>Database: <code>(default)</code></span>
                <span>Piano: Spark Free (1 GiB)</span>
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

      {/* ─── TAB GESTIONE NOTIFICHE PUSH (CONSOLE ADMIN) ───────── */}
      {activeAdminTab === 'notifications' && (
        <AdminNotificationsPanel currentTrip={currentTripConfig} />
      )}

      {/* ─── MODALE DI CONFERMA ELIMINAZIONE SICURA AMMINISTRATIVA ─── */}
      {deleteTargetTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-950 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            {deletionStatus === 'success' && deletedTripReport ? (
              <div className="py-2 space-y-4 text-center animate-fade-in">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    Viaggio eliminato correttamente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Eliminazione e verifica completate con successo.
                  </p>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl text-xs space-y-1.5 text-emerald-900 dark:text-emerald-200 text-left">
                  <div><strong>Viaggio:</strong> {deletedTripReport.title}</div>
                  <div className="font-mono text-[11px]"><strong>ID:</strong> {deletedTripReport.id}</div>
                  <div className="pt-1.5 text-[11px] border-t border-emerald-200/60 dark:border-emerald-800/60 leading-relaxed">
                    Documento principale e tutte le 15 sottocollezioni verificate rimosse (<strong>{deletedTripReport.count}</strong> documenti totali cancellati, nessun residuo orfano rilevato).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteTargetTrip(null);
                    setDeletionStatus('idle');
                    setDeletedTripReport(null);
                    setDeleteActionError(null);
                    fetchGlobalTrips();
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  Chiudi e Aggiorna Elenco
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <span className="text-2xl p-2 bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-2xl">⚠️</span>
                  <div className="flex-1">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Prepara eliminazione privilegiata
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Nessuna cancellazione viene eseguita dalla Console nel browser.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isDeletingTrip}
                    onClick={() => {
                      if (isDeletingTrip) return;
                      setDeleteTargetTrip(null);
                      setDeleteActionError(null);
                      setDeletionPhase(null);
                      setDeletionStatus('idle');
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 rounded-2xl text-xs space-y-1.5 text-rose-900 dark:text-rose-200">
                  <div>
                    <strong>Viaggio:</strong> {deleteTargetTrip.title}
                  </div>
                  <div>
                    <strong>Destinazione / Meta:</strong> {deleteTargetTrip.destination || 'Non specificata'}
                  </div>
                  <div className="font-mono text-[11px]">
                    <strong>ID:</strong> {deleteTargetTrip.id}
                  </div>
                  <p className="text-[10px] text-rose-700 dark:text-rose-300 pt-1 border-t border-rose-200/60 dark:border-rose-900/60">
                    Lo script locale enumera documento principale, discendenti e LIVE, crea il backup e verifica i residui prima di dichiarare il completamento.
                  </p>
                </div>

                {/* Controllo Trasparente Autorizzazione Amministratore */}
                {currentAdminUser && !currentAdminUser.isAnonymous ? (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-1.5 font-semibold">
                    <span>✓</span>
                    <span>Sessione amministratore verificata: <strong>{currentAdminUser.email || currentAdminUser.uid}</strong>. L'esecuzione richiede comunque un token IAM temporaneo fuori dal browser.</span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-[11px] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>⚠️</span>
                      <span>Sessione Anonima (Non Amministratore)</span>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-90">
                      La Console può solo preparare la procedura. L'esecuzione resta riservata a un operatore IAM autorizzato fuori dal browser.
                    </p>
                  </div>
                )}

                {/* Indicatore visivo di caricamento e avanzamento fasi */}
                {isDeletingTrip && (
                  <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl text-xs space-y-2 animate-pulse">
                    <div className="flex items-center gap-2.5 text-indigo-900 dark:text-indigo-200">
                      <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent dark:border-indigo-400 dark:border-t-transparent rounded-full animate-spin shrink-0" />
                      <span className="font-extrabold text-sm">Eliminazione in corso…</span>
                    </div>
                    <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium pl-6">
                      {deletionPhase || 'Operazione in corso sui server Firestore…'}
                    </div>
                  </div>
                )}

                {deleteActionError && (
                  <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 text-xs font-semibold leading-relaxed">
                    {deleteActionError}
                  </div>
                )}

                <label className="block space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-bold">Conferma ID viaggio</span>
                  <input
                    value={deleteConfirmId}
                    onChange={event => setDeleteConfirmId(event.target.value)}
                    placeholder={deleteTargetTrip.id}
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </label>

                {deletionCommands && (
                  <div className="space-y-2 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 p-3 text-[11px] text-indigo-950 dark:text-indigo-200">
                    <p className="font-bold">Procedura pronta, ma non eseguita.</p>
                    <p>1. Ricognizione e identificazione certa dei residui:</p>
                    <code className="block overflow-x-auto rounded-lg bg-slate-950 p-2 text-slate-100">{deletionCommands.inspect}</code>
                    <p>2. Solo dopo verifica umana, backup e token IAM temporaneo:</p>
                    <code className="block overflow-x-auto rounded-lg bg-slate-950 p-2 text-slate-100">{deletionCommands.execute}</code>
                  </div>
                )}

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  La Console non cancella più dati dal browser. Prepara una procedura locale privilegiata con backup, ripresa e verifica dei residui per <strong>{deleteTargetTrip.title}</strong> (<span className="font-mono text-rose-600 font-semibold">{deleteTargetTrip.id}</span>).
                </p>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isDeletingTrip}
                    onClick={() => {
                      if (isDeletingTrip) return;
                      setDeleteTargetTrip(null);
                      setDeleteActionError(null);
                      setDeletionPhase(null);
                      setDeletionStatus('idle');
                    }}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingTrip}
                    onClick={handleConfirmDeleteTrip}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-sm"
                  >
                    {isDeletingTrip ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                        <span>Eliminazione in corso…</span>
                      </>
                    ) : (
                      <>
                        <span>🗑️</span>
                        <span>Prepara procedura sicura</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Banner Notifica Successo Eliminazione */}
      {deleteSuccessMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white p-4 rounded-2xl shadow-xl max-w-md text-xs font-bold flex items-center justify-between gap-3 animate-fade-in">
          <span>✅ {deleteSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setDeleteSuccessMsg(null)}
            className="text-white hover:text-slate-200 p-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
