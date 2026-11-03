import {
  doc,
  setDoc,
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
import type { User } from 'firebase/auth';
import { db } from '../firebase';

export interface UserAccessEntry {
  uid: string;
  displayName: string | null;
  isAnonymous: boolean;
  lastAccessAt: number | null; // millisecond timestamp o null se mancante
  lastSeenAt?: number | null; // millisecond timestamp dell'ultima attività in primo piano
  lastTripId?: string | null;
  associatedTripIds?: string[];
}

import { addKnownTripId } from '../utils/tripConfig';

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
    const payload: Record<string, any> = {
      uid: user.uid,
      displayName: user.displayName || (user.isAnonymous ? 'Utente Anonimo' : null),
      isAnonymous: Boolean(user.isAnonymous),
      lastAccessAt: serverTimestamp(),
      updatedAt: now
    };

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
    const payload: Record<string, any> = {
      uid: user.uid,
      displayName: user.displayName || (user.isAnonymous ? 'Utente Anonimo' : null),
      isAnonymous: Boolean(user.isAnonymous),
      lastSeenAt: serverTimestamp(),
      updatedAt: now
    };
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
