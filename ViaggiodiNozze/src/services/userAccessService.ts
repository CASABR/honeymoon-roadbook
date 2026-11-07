import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import { updateProfile, type User } from 'firebase/auth';
import { db, auth } from '../firebase';

export interface UserAccessEntry {
  uid: string;
  displayName: string | null;
  customDisplayName?: string | null;
  isAnonymous: boolean;
  lastAccessAt: number | null; // millisecond timestamp o null se mancante
  lastSeenAt?: number | null; // millisecond timestamp dell'ultima attività in primo piano
  lastTripId?: string | null;
  associatedTripIds?: string[];
}

import { addKnownTripId, getTripConfig, saveTripConfig } from '../utils/tripConfig';

const CUSTOM_NAME_KEY_PREFIX = 'hounigo_user_display_name_';
const CUSTOM_NAME_GLOBAL_KEY = 'hounigo_user_display_name';

export function getCustomUserDisplayName(uid?: string | null): string | null {
  if (typeof localStorage === 'undefined') return null;
  const targetUid = uid || auth?.currentUser?.uid;
  if (targetUid) {
    const byUid = localStorage.getItem(`${CUSTOM_NAME_KEY_PREFIX}${targetUid}`);
    if (byUid && byUid.trim()) return byUid.trim();
  }
  const globalName = localStorage.getItem(CUSTOM_NAME_GLOBAL_KEY);
  return globalName && globalName.trim() ? globalName.trim() : null;
}

/**
 * Restituisce un nome leggibile e mai un UID tecnico grezzo per l'interfaccia utente.
 */
export function formatUserDisplayName(
  name?: string | null,
  role?: 'owner' | 'copilota' | 'viewer' | 'member' | string,
  uid?: string | null
): string {
  const clean = (name || '').trim();
  // Evita che un UID tecnico o 'Utente Anonimo' venga mostrato come nome primario
  if (clean && clean !== 'Utente Anonimo' && clean !== uid) {
    return clean;
  }
  if (uid) {
    const localCustom = getCustomUserDisplayName(uid);
    if (localCustom) return localCustom;
  }
  if (role === 'owner' || role === 'guida') return 'Organizzatore';
  if (role === 'copilota') return 'Copilota';
  if (role === 'viewer') return 'Ospite';
  return 'Partecipante';
}

/**
 * Salva il nome personalizzato dell'utente in localStorage, Firebase Auth, /users/{uid} e nel viaggio attivo.
 */
export async function saveCustomUserDisplayName(customName: string, tripId?: string): Promise<string> {
  const cleanName = customName.trim();
  const user = auth?.currentUser;
  const uid = user?.uid;

  if (typeof localStorage !== 'undefined') {
    if (cleanName) {
      localStorage.setItem(CUSTOM_NAME_GLOBAL_KEY, cleanName);
      if (uid) localStorage.setItem(`${CUSTOM_NAME_KEY_PREFIX}${uid}`, cleanName);
    } else {
      localStorage.removeItem(CUSTOM_NAME_GLOBAL_KEY);
      if (uid) localStorage.removeItem(`${CUSTOM_NAME_KEY_PREFIX}${uid}`);
    }
  }

  if (user && cleanName) {
    try {
      await updateProfile(user, { displayName: cleanName });
    } catch {
      // ignore su sessioni che non supportano updateProfile
    }
  }

  const activeConfig = getTripConfig();
  const targetTripId = tripId || activeConfig?.id;

  if (activeConfig && uid && activeConfig.ownerUid === uid && cleanName) {
    const updatedCfg = { ...activeConfig, ownerName: cleanName };
    saveTripConfig(updatedCfg);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trip_config_changed', { detail: { config: updatedCfg } }));
    }
  }

  if (db && uid) {
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName: cleanName || null,
        customDisplayName: cleanName || null,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.warn('[userAccess] Aggiornamento nome su /users/{uid} rimandato:', err);
    }

    if (targetTripId && cleanName) {
      try {
        const memberRef = doc(db, 'trips', targetTripId, 'members', uid);
        const memberSnap = await getDoc(memberRef).catch(() => null);
        if (memberSnap?.exists()) {
          await setDoc(memberRef, {
            name: cleanName,
            displayName: cleanName,
            updatedAt: Date.now()
          }, { merge: true });
        }
        if (activeConfig?.ownerUid === uid) {
          await setDoc(doc(db, 'trips', targetTripId), {
            ownerName: cleanName,
            updatedAt: Date.now()
          }, { merge: true });
        }
      } catch {
        // non bloccante
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('user_display_name_changed', { detail: { uid, displayName: cleanName } }));
  }

  return cleanName;
}

let lastRecordedUid: string | null = null;
let lastRecordedTripId: string | null = null;
let lastRecordedTime = 0;

/**
 * Registra o aggiorna l'ultimo accesso dell'utente corrente su Firestore.
 * Compatibile con Firebase Spark (0 Cloud Functions).
 * Regole di sicurezza: solo l'utente autenticato può scrivere il proprio record con serverTimestamp().
 */
export async function recordUserAccess(user: User | null, tripId?: string): Promise<void> {
  if (!db || !user?.uid) return;

  const cleanTripId = tripId && tripId.trim() !== '' ? tripId.trim() : undefined;
  if (cleanTripId) {
    addKnownTripId(cleanTripId);
  }

  const now = Date.now();
  // Throttle: massimo una scrittura ogni 5 minuti per la stessa identica sessione e viaggio
  if (
    lastRecordedUid === user.uid &&
    lastRecordedTripId === (cleanTripId || null) &&
    (now - lastRecordedTime) < 5 * 60 * 1000
  ) {
    return;
  }

  try {
    const userRef = doc(db, 'users', user.uid);
    const resolvedName = getCustomUserDisplayName(user.uid) || user.displayName || null;
    const payload: Record<string, any> = {
      uid: user.uid,
      isAnonymous: Boolean(user.isAnonymous),
      lastAccessAt: serverTimestamp(),
      updatedAt: now
    };
    if (resolvedName) {
      payload.displayName = resolvedName;
    }

    // Registra tripId nei viaggi associati del profilo utente per il recupero multi-dispositivo
    if (cleanTripId) {
      payload.lastTripId = cleanTripId;
      payload.associatedTripIds = arrayUnion(cleanTripId);
    }

    await setDoc(userRef, payload, { merge: true });
    lastRecordedUid = user.uid;
    lastRecordedTripId = cleanTripId || null;
    lastRecordedTime = now;
  } catch (err) {
    // Non bloccante: log diagnostico
    console.warn('[userAccess] Impossibile registrare ultimo accesso:', err);
  }
}

let lastSeenRecordedUid: string | null = null;
let lastSeenRecordedTime = 0;

/**
 * Registra in modo leggero e sicuro l'ultima attività dell'utente con app in primo piano.
 * Throttle a 15 minuti per ridurre al minimo le scritture su Firestore.
 * Utilizza serverTimestamp() per garantire autenticità e orario autorevole del server.
 */
export async function recordUserActivity(user: User | null, tripId?: string): Promise<void> {
  if (!db || !user?.uid) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  const now = Date.now();
  if (lastSeenRecordedUid === user.uid && (now - lastSeenRecordedTime) < 15 * 60 * 1000) {
    return;
  }

  try {
    const cleanTripId = tripId && tripId.trim() !== '' ? tripId.trim() : undefined;
    const userRef = doc(db, 'users', user.uid);
    const resolvedName = getCustomUserDisplayName(user.uid) || user.displayName || null;
    const payload: Record<string, any> = {
      uid: user.uid,
      isAnonymous: Boolean(user.isAnonymous),
      lastSeenAt: serverTimestamp(),
      updatedAt: now
    };
    if (resolvedName) {
      payload.displayName = resolvedName;
    }
    if (cleanTripId) {
      payload.lastTripId = cleanTripId;
      payload.associatedTripIds = arrayUnion(cleanTripId);
    }
    await setDoc(userRef, payload, { merge: true });
    lastSeenRecordedUid = user.uid;
    lastSeenRecordedTime = now;
  } catch (err) {
    console.warn('[userAccess] Impossibile registrare attività utente:', err);
  }
}


/**
 * Converte un campo timestamp Firestore o numerico in millisecondi.
 * Restituisce null se il dato non è disponibile o non valido.
 */
export function parseLastAccessTimestamp(raw: any): number | null {
  if (!raw) return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  return null;
}

/**
 * Interroga la collezione /users con paginazione reale basata su cursore (startAfter) e limit.
 * Non carica l'intero dataset in memoria lato client.
 */
export async function fetchUsersAccessPage(
  pageSize: number = 20,
  cursor?: QueryDocumentSnapshot | null,
  sortBy: 'lastAccessAt' | 'lastSeenAt' = 'lastAccessAt'
): Promise<{
  users: UserAccessEntry[];
  lastVisible: QueryDocumentSnapshot | null;
  hasMore: boolean;
}> {
  if (!db) {
    throw new Error('Database Firestore non inizializzato.');
  }

  // Interroga limit + 1 per determinare con precisione la presenza di pagine successive
  const fetchLimit = pageSize + 1;
  const colRef = collection(db, 'users');

  const q = cursor
    ? query(colRef, orderBy(sortBy, 'desc'), startAfter(cursor), limit(fetchLimit))
    : query(colRef, orderBy(sortBy, 'desc'), limit(fetchLimit));

  const snap = await getDocs(q);

  if (snap.empty) {
    return { users: [], lastVisible: null, hasMore: false };
  }

  const hasMore = snap.docs.length > pageSize;
  const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  const lastVisible = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  const users: UserAccessEntry[] = pageDocs.map(docSnap => {
    const data = docSnap.data();
    return {
      uid: data.uid || docSnap.id,
      displayName: data.displayName || null,
      isAnonymous: Boolean(data.isAnonymous),
      lastAccessAt: parseLastAccessTimestamp(data.lastAccessAt),
      lastSeenAt: parseLastAccessTimestamp(data.lastSeenAt),
      lastTripId: data.lastTripId || null,
      associatedTripIds: Array.isArray(data.associatedTripIds) ? data.associatedTripIds : []
    };
  });

  return { users, lastVisible, hasMore };
}
