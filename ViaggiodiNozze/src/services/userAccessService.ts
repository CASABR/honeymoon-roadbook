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
  lastTripId?: string | null;
  associatedTripIds?: string[];
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

  const now = Date.now();
  // Throttle: massimo una scrittura ogni 5 minuti per la stessa sessione (stesso utente e stesso viaggio)
  if (
    lastRecordedUid === user.uid &&
    lastRecordedTripId === (tripId || null) &&
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

    // Non registriamo mai il viaggio 0000 per rispettare i vincoli di non alterazione
    if (tripId && tripId.trim() !== '' && tripId !== '0000') {
      payload.lastTripId = tripId;
      payload.associatedTripIds = arrayUnion(tripId);
    }

    await setDoc(userRef, payload, { merge: true });
    lastRecordedUid = user.uid;
    lastRecordedTripId = tripId || null;
    lastRecordedTime = now;
  } catch (err) {
    // Non bloccante: log diagnostico
    console.warn('[userAccess] Impossibile registrare ultimo accesso:', err);
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
  cursor?: QueryDocumentSnapshot | null
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
    ? query(colRef, orderBy('lastAccessAt', 'desc'), startAfter(cursor), limit(fetchLimit))
    : query(colRef, orderBy('lastAccessAt', 'desc'), limit(fetchLimit));

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
      lastTripId: data.lastTripId || null,
      associatedTripIds: Array.isArray(data.associatedTripIds) ? data.associatedTripIds : []
    };
  });

  return { users, lastVisible, hasMore };
}
