import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { recordUserAccess } from './userAccessService';

export interface TripInvite {
  inviteToken: string;
  tripId: string;
  role: 'copilota';
  createdBy: string;
  createdAt?: any;
  expiresAt: number; // millisecond timestamp
  status: 'active' | 'used' | 'revoked';
  usedBy?: string | null;
  usedAt?: number | null;
}

export interface InviteValidationResult {
  valid: boolean;
  error?: string;
  tripId?: string;
  tripTitle?: string;
  ownerName?: string;
  expiresAt?: number;
  invite?: TripInvite;
}

/**
 * Genera un token crittografico ad alta entropia (128 bit).
 */
export function generateSecureToken(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  const array = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Crea un nuovo invito per il viaggio specificato.
 * Riservato all'Owner del viaggio.
 */
export async function createTripInvite(tripId: string): Promise<{
  inviteToken: string;
  inviteLink: string;
  expiresAt: number;
}> {
  if (!db) throw new Error('Firestore non inizializzato.');
  const user = auth.currentUser;
  if (!user) throw new Error('Devi essere autenticato per creare un invito.');
  if (tripId === '0000') throw new Error('Il viaggio master 0000 non supporta la generazione di inviti.');

  const inviteToken = generateSecureToken();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 giorni

  const inviteRef = doc(db, 'trips', tripId, 'invites', inviteToken);
  await setDoc(inviteRef, {
    inviteToken,
    tripId,
    role: 'copilota',
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
    status: 'active',
    usedBy: null,
    usedAt: null
  });

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const inviteLink = `${baseUrl}?join=${encodeURIComponent(tripId)}&token=${encodeURIComponent(inviteToken)}`;

  return {
    inviteToken,
    inviteLink,
    expiresAt
  };
}

/**
 * Valida un token d'invito verificando esistenza, stato 'active' e scadenza.
 */
export async function validateTripInvite(tripId: string, token: string): Promise<InviteValidationResult> {
  if (!db || !tripId || !token) {
    return { valid: false, error: 'Parametri invito mancanti o database non disponibile.' };
  }
  if (tripId === '0000') {
    return { valid: false, error: 'Il viaggio master 0000 non supporta inviti copilota.' };
  }

  try {
    const inviteRef = doc(db, 'trips', tripId, 'invites', token);
    const snap = await getDoc(inviteRef);

    if (!snap.exists()) {
      return { valid: false, error: 'Questo link di invito non è valido o è stato revocato.' };
    }

    const data = snap.data();
    const expiresAt = data.expiresAt instanceof Timestamp
      ? data.expiresAt.toMillis()
      : typeof data.expiresAt === 'number'
      ? data.expiresAt
      : 0;

    if (data.status === 'revoked') {
      return { valid: false, error: 'Questo link di invito è stato revocato dall’organizzatore.' };
    }

    if (data.status === 'used') {
      return { valid: false, error: 'Questo link di invito è già stato utilizzato.' };
    }

    if (data.status !== 'active') {
      return { valid: false, error: 'Invito non più attivo.' };
    }

    if (expiresAt > 0 && Date.now() > expiresAt) {
      return { valid: false, error: 'Questo link di invito è scaduto. Chiedi all’organizzatore un nuovo link.' };
    }

    // Carica metadati base del viaggio per conferma visiva all'utente
    let tripTitle = 'Viaggio';
    let ownerName: string | undefined;
    try {
      const tripSnap = await getDoc(doc(db, 'trips', tripId));
      if (tripSnap.exists()) {
        const tData = tripSnap.data();
        tripTitle = tData.title || 'Viaggio';
        ownerName = tData.ownerName;
      }
    } catch {
      // Ignora errore lettura trip metadati se limitato da rules
    }

    return {
      valid: true,
      tripId,
      tripTitle,
      ownerName,
      expiresAt,
      invite: {
        inviteToken: token,
        tripId,
        role: 'copilota',
        createdBy: data.createdBy,
        expiresAt,
        status: data.status,
        usedBy: data.usedBy,
        usedAt: data.usedAt
      }
    };
  } catch (err: any) {
    console.warn('[TripInviteService] Errore verifica invito:', err);
    return { valid: false, error: err?.message || 'Impossibile verificare l’invito. Controlla la connessione.' };
  }
}

/**
 * Riscatta un invito valido associando il copilota in modo atomico.
 */
export async function redeemTripInvite(tripId: string, token: string, user: User): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!db) return { success: false, error: 'Database non disponibile.' };
  if (!user?.uid) return { success: false, error: 'Devi essere connesso per accettare l’invito.' };
  if (tripId === '0000') return { success: false, error: 'Il viaggio 0000 non supporta adesioni da invito.' };

  try {
    const batch = writeBatch(db);

    const memberRef = doc(db, 'trips', tripId, 'members', user.uid);
    batch.set(memberRef, {
      uid: user.uid,
      role: 'copilota',
      name: user.displayName || 'Copilota',
      inviteToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const inviteRef = doc(db, 'trips', tripId, 'invites', token);
    batch.update(inviteRef, {
      status: 'used',
      usedBy: user.uid,
      usedAt: serverTimestamp()
    });

    const tripRef = doc(db, 'trips', tripId);
    batch.update(tripRef, {
      members: arrayUnion(user.uid),
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    // Registra accesso utente
    await recordUserAccess(user, tripId);

    return { success: true };
  } catch (err: any) {
    console.error('[TripInviteService] Errore riscatto invito:', err);
    return {
      success: false,
      error: err?.code === 'permission-denied'
        ? 'Permesso negato: l’invito non è valido, è scaduto oppure non sei autorizzato.'
        : err?.message || 'Errore durante l’adesione al viaggio.'
    };
  }
}

/**
 * Revoca un invito attivo da parte dell'Owner.
 */
export async function revokeTripInvite(tripId: string, token: string): Promise<void> {
  if (!db) throw new Error('Database non disponibile.');
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato.');

  const inviteRef = doc(db, 'trips', tripId, 'invites', token);
  await updateDoc(inviteRef, {
    status: 'revoked',
    updatedAt: serverTimestamp()
  });
}
