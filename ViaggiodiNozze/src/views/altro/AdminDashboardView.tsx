import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  arrayRemove,
  writeBatch,
  query,
  limit,
  type Firestore,
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
import { fetchUsersAccessPage, type UserAccessEntry } from '../../services/userAccessService';

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

export class PartialDeletionError extends Error {
  isPartial: boolean;
  deletedSubDocsCount: number;
  constructor(message: string, deletedSubDocsCount: number) {
    super(message);
    this.name = 'PartialDeletionError';
    this.isPartial = true;
    this.deletedSubDocsCount = deletedSubDocsCount;
  }
}

/**
 * Eliminazione completa di un viaggio e di tutti i documenti discendenti
 * tramite SDK client Firestore, compatibile con il piano gratuito Firebase Spark (0 Cloud Functions).
 */
export async function deleteTripAdminClientSide(
  firestoreDb: Firestore,
  tripId: string,
  onProgress?: (phase: string) => void
): Promise<{ success: boolean; deletedTripId: string; deletedSubDocsCount: number }> {
  const cleanId = String(tripId || '').trim();
  if (!cleanId) {
    throw new Error('Identificativo tripId mancante o non valido.');
  }

  // PROTEZIONE ASSOLUTA: Il viaggio reale 0000 non può MAI essere eliminato
  if (cleanId === '0000') {
    throw new Error('Il viaggio reale 0000 è protetto e non può essere eliminato in alcun caso.');
  }

  let totalDeletedSubDocs = 0;

  try {
    // 1. Eliminazione a pagine (massimo 400 doc per batch, sotto il limite Firestore di 500) di ogni sottocollezione
    for (const subcol of KNOWN_ADMIN_DELETION_SUBCOLLECTIONS) {
      onProgress?.(`Elimino i dati… (sottocollezione ${subcol})`);
      const colRef = collection(firestoreDb, 'trips', cleanId, subcol);
      let hasMore = true;
      while (hasMore) {
        const q = query(colRef, limit(400));
        const snap = await getDocs(q);
        if (snap.empty) {
          hasMore = false;
          break;
        }
        const batch = writeBatch(firestoreDb);
        snap.docs.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        totalDeletedSubDocs += snap.size;
        if (snap.size < 400) {
          hasMore = false;
        }
      }
    }

    // 2. Pulizia live_feeds associato al viaggio (se presente)
    try {
      onProgress?.('Elimino i dati… (live feed e aggiornamenti)');
      const feedUpdatesRef = collection(firestoreDb, 'live_feeds', cleanId, 'updates');
      let feedHasMore = true;
      while (feedHasMore) {
        const snap = await getDocs(query(feedUpdatesRef, limit(400)));
        if (snap.empty) {
          feedHasMore = false;
          break;
        }
        const batch = writeBatch(firestoreDb);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        totalDeletedSubDocs += snap.size;
        if (snap.size < 400) feedHasMore = false;
      }
      await deleteDoc(doc(firestoreDb, 'live_feeds', cleanId)).catch(() => {});
    } catch (feedErr) {
      console.warn('[AdminDashboard] Pulizia live_feeds non critica:', feedErr);
    }

    // 3. Eliminazione del documento principale trips/{tripId}
    onProgress?.('Elimino i dati… (documento principale del viaggio)');
    const rootTripRef = doc(firestoreDb, 'trips', cleanId);
    await deleteDoc(rootTripRef);

    // 4. Verifica post-cancellazione: il documento radice non deve più esistere
    onProgress?.('Verifico il risultato… (controllo assenza documento principale)');
    const verifyRoot = await getDoc(rootTripRef);
    if (verifyRoot.exists()) {
      throw new PartialDeletionError(
        `Verifica post-cancellazione fallita: il documento trips/${cleanId} risulta ancora presente.`,
        totalDeletedSubDocs
      );
    }

    // 5. Verifica post-cancellazione: nessuna sottocollezione deve contenere documenti residui
    for (const subcol of KNOWN_ADMIN_DELETION_SUBCOLLECTIONS) {
      onProgress?.(`Verifico il risultato… (controllo assenza dati in ${subcol})`);
      const residualSnap = await getDocs(query(collection(firestoreDb, 'trips', cleanId, subcol), limit(1)));
      if (!residualSnap.empty) {
        throw new PartialDeletionError(
          `Verifica post-cancellazione fallita: rilevati documenti orfani residui in trips/${cleanId}/${subcol}.`,
          totalDeletedSubDocs
        );
      }
    }

    return {
      success: true,
      deletedTripId: cleanId,
      deletedSubDocsCount: totalDeletedSubDocs
    };
  } catch (err: any) {
    if (err instanceof PartialDeletionError) {
      throw err;
    }
    if (totalDeletedSubDocs > 0) {
      throw new PartialDeletionError(
        err?.message || 'Errore durante la cancellazione parziale delle sottocollezioni.',
        totalDeletedSubDocs
      );
    }
    throw err;
  }
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
  const [activeAdminTab, setActiveAdminTab] = useState<'trips' | 'copilots' | 'users' | 'diagnostics'>('trips');

  // Stato consultazione ultimi accessi utenti con paginazione reale a cursori
  const [usersList, setUsersList] = useState<UserAccessEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersCursorStack, setUsersCursorStack] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [usersLastVisible, setUsersLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const loadUsersPage = async (page: number, cursor: QueryDocumentSnapshot | null) => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await fetchUsersAccessPage(20, cursor);
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
  const [isDeletingTrip, setIsDeletingTrip] = useState(false);
  const [deletionPhase, setDeletionPhase] = useState<string | null>(null);
  const [deletionStatus, setDeletionStatus] = useState<'idle' | 'deleting' | 'success' | 'error' | 'partial'>('idle');
  const [deleteActionError, setDeleteActionError] = useState<string | null>(null);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);
  const [deletedTripReport, setDeletedTripReport] = useState<{ id: string; title: string; count: number } | null>(null);

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

        const destination = d.destination || d.meta || d.city || undefined;
        const ownerEmail = d.ownerEmail || d.creatorEmail || undefined;
        const ownerName = d.ownerName || d.creatorName || undefined;

        // Calcolo della dimensione logica serializzata del documento Firestore
        // Trasparenza Hounigo: dichiara esplicitamente se la stima è parziale o non disponibile
        let estimatedStorageBytes = 0;
        let storageStatus: TripSummary['storageStatus'] = 'parziale';
        try {
          const serializedStr = JSON.stringify(d);
          // La dimensione del documento include i dati serializzati + overhead ID
          estimatedStorageBytes = new Blob([serializedStr]).size + id.length;
        } catch {
          storageStatus = 'non_disponibile';
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

  // Esecuzione eliminazione sicura client-side (Firebase Spark nativo, 0 Cloud Functions)
  const handleConfirmDeleteTrip = async () => {
    if (!deleteTargetTrip) return;

    // Blocco assoluto trip 0000
    if (deleteTargetTrip.id === '0000') {
      setDeleteActionError('Il viaggio reale 0000 è protetto e non può essere eliminato.');
      return;
    }

    // Controllo preventivo autenticazione amministratore
    if (!currentAdminUser || currentAdminUser.isAnonymous) {
      const isTripOwner = Boolean(deleteTargetTrip.ownerUid && deleteTargetTrip.ownerUid === currentAdminUser?.uid);
      if (!isTripOwner) {
        setDeleteActionError(
          'Autorizzazione mancante: per eliminare viaggi non tuoi su Firebase Spark devi prima accedere con l\'account amministratore autorizzato (es. nunzio114@gmail.com) nel riquadro in cima alla dashboard.'
        );
        return;
      }
    }

    setIsDeletingTrip(true);
    setDeletionStatus('deleting');
    setDeletionPhase('Elimino i dati… (avvio procedura)');
    setDeleteActionError(null);
    setDeleteSuccessMsg(null);
    setDeletedTripReport(null);

    try {
      if (!db) {
        throw new Error('Database Firestore non inizializzato.');
      }

      // Timeout di sicurezza (30 secondi): garantisce che la UI non resti mai bloccata
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout operazione: la cancellazione o la verifica ha impiegato più di 30 secondi. Verifica la connessione di rete.'));
        }, 30000);
      });

      // Procedura client-side nativa Firebase Spark tramite SDK Firestore con feedback avanzato
      const deletionPromise = deleteTripAdminClientSide(db, deleteTargetTrip.id, phase => {
        setDeletionPhase(phase);
      });

      const response = await Promise.race([deletionPromise, timeoutPromise]);

      if (response.success) {
        const deletedId = response.deletedTripId;
        const subCount = response.deletedSubDocsCount;
        setDeletedTripReport({
          id: deletedId,
          title: deleteTargetTrip.title,
          count: subCount
        });
        setDeletionStatus('success');
        setDeleteSuccessMsg(`Viaggio eliminato correttamente: "${deleteTargetTrip.title}" (${deletedId}) e tutti i ${subCount} documenti correlati sono stati rimossi.`);
        logDiag(`Eliminato viaggio ${deletedId} da Admin (Spark Client SDK, ${subCount} doc verificati)`, 'success');
        
        // Rimuove immediatamente il viaggio dall'elenco della dashboard SOLO dopo conferma reale
        setTrips(prev => prev.filter(t => t.id !== deletedId));
        if (selectedTripId === deletedId) {
          setSelectedTripId(null);
        }
      } else {
        setDeletionStatus('error');
        setDeleteActionError('Operazione completata ma senza conferma positiva.');
      }
    } catch (err: any) {
      console.error('[AdminDashboard] Errore eliminazione viaggio:', err);
      if (err?.isPartial || (err?.deletedSubDocsCount && err.deletedSubDocsCount > 0)) {
        setDeletionStatus('partial');
        setDeleteActionError(
          `Cancellazione parziale: ${err.message} (${err.deletedSubDocsCount || 0} documenti rimossi). Alcuni documenti potrebbero essere rimasti orfani nel database ed è necessario un intervento di recupero o ripetere l'eliminazione.`
        );
      } else if (err?.code === 'permission-denied') {
        setDeletionStatus('error');
        setDeleteActionError('Permesso negato da Firestore: la cancellazione diretta richiede un amministratore globale autorizzato dalle Firestore Rules.');
      } else if (err?.code === 'unauthenticated') {
        setDeletionStatus('error');
        setDeleteActionError('Devi effettuare il login persistente come amministratore per eseguire questa operazione.');
      } else {
        setDeletionStatus('error');
        setDeleteActionError(err?.message || 'Errore durante l\'eliminazione del viaggio.');
      }
    } finally {
      setIsDeletingTrip(false);
      setDeletionPhase(null);
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'trips'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🗺️ Viaggi ({trips.length})
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
                        {trips.length === 0 ? 'Nessun viaggio registrato nel database.' : 'Nessun viaggio corrispondente ai filtri selezionati.'}
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
                              <span className="text-slate-400 italic">Meta: Non specificata</span>
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
                            {trip.ownerName ? trip.ownerName : (trip.ownerEmail ? trip.ownerEmail : (trip.ownerUid ? 'Nome non specificato' : 'Non specificato'))}
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
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatBytes(trip.estimatedStorageBytes || 0)}
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-md font-semibold ${
                              trip.storageStatus === 'calcolata'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : trip.storageStatus === 'parziale'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {trip.storageStatus === 'calcolata'
                              ? 'Calcolata'
                              : trip.storageStatus === 'parziale'
                              ? 'Stima doc radice'
                              : 'Non disponibile'}
                          </span>
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
                                  placeholder="Es. Giusy"
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loadingUsers}
                  onClick={() => {
                    setUsersCursorStack([null]);
                    loadUsersPage(1, null);
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
                La registrazione dell'ultimo accesso avviene in modo trasparente e conforme al piano gratuito Firebase Spark (0 Cloud Functions). Ogni utente autenticato aggiorna esclusivamente il proprio record in <code>/users/{'{uid}'}</code> con <code>serverTimestamp()</code> protetto da regole di sicurezza.
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] opacity-80">
                <li>I dati di accesso sono tracciati a partire dall'introduzione di questa funzionalità (nessuno storico retroattivo fittizio).</li>
                <li>Se un partecipante non ha ancora effettuato l'accesso o non ha un record registrato, la data viene correttamente indicata come <strong>Non disponibile</strong>.</li>
                <li>Non vengono effettuate chiamate non autorizzate a Firebase Auth Client; l'elenco rispetta la collezione Firestore autorizzata all'Amministratore.</li>
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
                    <th className="py-3 px-4 text-center">Stato Dato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {loadingUsers && usersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">Interrogazione collezione /users su Firestore in corso…</span>
                        </div>
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
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

                          {/* Stato Dato */}
                          <td className="py-3 px-4 text-center">
                            {user.lastAccessAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60">
                                <span>✓</span>
                                <span>Registrato</span>
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
                      Conferma Eliminazione Definitiva
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Operazione irreversibile ad esclusivo privilegio dell'amministratore.
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
                    Verranno eliminati il documento principale e tutte le relative sottocollezioni annidate (membri, tappe, alloggi, trasporti, spese, ecc.) tramite procedura protetta Spark SDK.
                  </p>
                </div>

                {/* Controllo Trasparente Autorizzazione Amministratore */}
                {currentAdminUser && !currentAdminUser.isAnonymous ? (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-1.5 font-semibold">
                    <span>✓</span>
                    <span>Sessione amministratore attiva: <strong>{currentAdminUser.email || currentAdminUser.uid}</strong></span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-[11px] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>⚠️</span>
                      <span>Sessione Anonima (Non Amministratore)</span>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-90">
                      L'eliminazione diretta su Firebase Spark è protetta a livello di regole Firestore: per eliminare viaggi altrui devi effettuare il login con un account autorizzato (es. <code>nunzio114@gmail.com</code>) nel riquadro in cima alla dashboard.
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

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Sei sicuro di voler eliminare definitivamente il viaggio <strong>{deleteTargetTrip.title}</strong> (<span className="font-mono text-rose-600 font-semibold">{deleteTargetTrip.id}</span>)? Questa operazione non può essere annullata.
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
                        <span>Elimina Definitivamente</span>
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
