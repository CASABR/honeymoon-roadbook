import {
  type User,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface UserTripSummary {
  id: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  ownerUid?: string;
  ownerName?: string;
  isOwner: boolean;
  role: 'owner' | 'copilota';
  isLastUsed?: boolean;
}

export interface AccountStatus {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  providers: string[];
}

/**
 * Restituisce lo stato corrente dell'identità Firebase.
 */
export function getAccountStatus(user: User | null = auth?.currentUser || null): AccountStatus {
  if (!user) {
    return {
      uid: null,
      email: null,
      displayName: null,
      isAnonymous: true,
      providers: []
    };
  }

  const providers = user.providerData.map(p => p.providerId);
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    isAnonymous: Boolean(user.isAnonymous),
    providers
  };
}

/**
 * Verifica in SOLA LETTURA se un determinato UID è l'owner autenticato del viaggio.
 * Non presume né modifica alcuna configurazione remota.
 */
export async function verifyTripOwnership(tripId: string, currentUid: string): Promise<{
  exists: boolean;
  isOwner: boolean;
  ownerUid: string | null;
  ownerName: string | null;
}> {
  if (!db || !tripId || !currentUid) {
    return { exists: false, isOwner: false, ownerUid: null, ownerName: null };
  }

  try {
    const tripSnap = await getDoc(doc(db, 'trips', tripId));
    if (!tripSnap.exists()) {
      return { exists: false, isOwner: false, ownerUid: null, ownerName: null };
    }
    const data = tripSnap.data();
    const ownerUid = data?.ownerUid || null;
    const ownerName = data?.ownerName || (tripId === '0000' ? 'nunzio' : null);
    return {
      exists: true,
      isOwner: ownerUid === currentUid,
      ownerUid,
      ownerName
    };
  } catch (err) {
    console.warn('[accountService] Verifica ownership viaggio in sola lettura fallita:', err);
    return { exists: false, isOwner: false, ownerUid: null, ownerName: null };
  }
}

/**
 * Recupera in sicurezza i viaggi associati all'utente corrente.
 * NOTA CRITICA: Non esegue MAI 'list' su /trips (riservata ad admin globale),
 * ma legge il documento /users/{uid} (permesso all'utente) ed esegue singoli
 * 'get' puntuali su ciascun tripId autorizzato.
 */
export async function fetchUserTrips(uid: string): Promise<UserTripSummary[]> {
  if (!db || !uid) return [];

  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return [];

    const userData = userSnap.data();
    const tripIds: string[] = Array.isArray(userData?.associatedTripIds)
      ? [...userData.associatedTripIds]
      : [];

    const lastTripId = userData?.lastTripId;
    if (lastTripId && !tripIds.includes(lastTripId)) {
      tripIds.unshift(lastTripId);
    }

    const summaries: UserTripSummary[] = [];

    // Eseguiamo getDoc puntuale per ciascun ID autorizzato:
    for (const tripId of tripIds) {
      if (!tripId) continue;
      try {
        const snap = await getDoc(doc(db, 'trips', tripId));
        if (snap.exists()) {
          const tdata = snap.data();
          const isOwner = tdata?.ownerUid === uid || (tripId === '0000' && uid === 'nunzio');
          summaries.push({
            id: tripId,
            title: tdata?.title || (tripId === '0000' ? 'Viaggio Originale' : 'Viaggio'),
            destination: tdata?.destination || undefined,
            startDate: tdata?.startDate,
            endDate: tdata?.endDate,
            ownerUid: tdata?.ownerUid,
            ownerName: tdata?.ownerName || (tripId === '0000' ? 'nunzio' : undefined),
            isOwner,
            role: isOwner ? 'owner' : 'copilota',
            isLastUsed: tripId === lastTripId
          });
        }
      } catch {
        // Se non autorizzato per quel singolo viaggio, salta silenziosamente
      }
    }

    return summaries;
  } catch (err) {
    console.warn('[accountService] Impossibile recuperare viaggi associati da /users/{uid}:', err);
    return [];
  }
}

/**
 * Cambia il viaggio attivo corrente senza contaminazione dati:
 * chiude IndexedDB, imposta sessione dispositivo e notifica l'app.
 */
export async function switchActiveTrip(trip: UserTripSummary): Promise<void> {
  const { saveTripConfig, normalizeTripConfig } = await import('../utils/tripConfig');
  const { storageService } = await import('../storage/storageService');
  const { persistDeviceSession } = await import('../utils/deviceSession');

  const role = trip.isOwner ? 'guida' : 'copilota';
  persistDeviceSession(trip.id, role);
  storageService.setDeviceRole(role);

  const config = normalizeTripConfig({
    id: trip.id,
    title: trip.title,
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    ownerUid: trip.ownerUid || '',
    ownerName: trip.ownerName || ''
  });
  saveTripConfig(config);
}

/**
 * Collega un account Google alla sessione corrente (preserva l'UID anonimo esistente).
 * Se l'account Google è già in uso, restituisce un errore gestito senza perdere la sessione anonima.
 */
export async function linkGoogleToCurrentSession(user: User): Promise<{
  success: boolean;
  error?: string;
  code?: string;
}> {
  if (!user) {
    return { success: false, error: 'Nessun account attivo a cui collegare Google.' };
  }
  const originalUid = user.uid;

  try {
    const maskedUid = originalUid ? `...${originalUid.slice(-5)}` : 'none';
    console.info('[accountService] linkGoogle avviato:', {
      maskedUid,
      isAnonymous: user.isAnonymous
    });

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const userCredential = await linkWithPopup(user, provider);

    // Salvaguardia inderogabile: l'identità dell'utente DEVE rimanere identica
    if (!userCredential?.user || userCredential.user.uid !== originalUid) {
      return {
        success: false,
        error: 'Il collegamento non ha mantenuto la stessa identità. Operazione annullata per sicurezza.'
      };
    }

    return { success: true };
  } catch (err: any) {
    const code = err?.code || 'auth/unknown';
    const message = err?.message || '';
    const maskedUid = originalUid ? `...${originalUid.slice(-5)}` : 'none';
    console.warn('[accountService] Errore linkGoogle:', { code, message, maskedUid });

    if (code === 'auth/credential-already-in-use') {
      const detail = user.isAnonymous
        ? 'Questo account Google è già registrato su un altro profilo. Se hai già registrato le tue credenziali, accedi prima con Email/Password (auth/credential-already-in-use).'
        : `Questo account Google è già collegato ad un altro profilo Firebase (auth/credential-already-in-use, UID: ...${originalUid.slice(-5)}).`;
      return {
        success: false,
        code,
        error: detail
      };
    }
    if (code === 'auth/email-already-in-use') {
      return {
        success: false,
        code,
        error: `L'email associata a questo account Google è già presente nel sistema (auth/email-already-in-use, UID: ...${originalUid.slice(-5)}).`
      };
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return {
        success: false,
        code,
        error: `Esiste già un account con credenziali diverse per questa email (auth/account-exists-with-different-credential, UID: ...${originalUid.slice(-5)}).`
      };
    }
    if (code === 'auth/provider-already-linked') {
      return { success: true };
    }
    if (code === 'auth/popup-blocked') {
      return {
        success: false,
        code,
        error: 'La finestra di accesso Google è stata bloccata dal browser. Consenti le finestre popup e riprova (auth/popup-blocked).'
      };
    }
    if (code === 'auth/popup-closed-by-user') {
      return {
        success: false,
        code,
        error: 'Finestra di accesso Google chiusa prima del completamento (auth/popup-closed-by-user).'
      };
    }

    return {
      success: false,
      code,
      error: `Impossibile completare il collegamento con Google (${code}).`
    };
  }
}

/**
 * Collega Email + Password alla sessione corrente (preserva l'UID anonimo esistente).
 * Compatibilità al 100% con iOS Safari, PWA Standalone e browser senza popup.
 */
export async function linkEmailPasswordToCurrentSession(
  user: User,
  email: string,
  pass: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  if (!user) {
    return { success: false, error: 'Nessun utente attivo da collegare.' };
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Inserisci un indirizzo email valido.' };
  }
  if (!pass || pass.length < 6) {
    return { success: false, error: 'La password deve contenere almeno 6 caratteri.' };
  }

  try {
    const credential = EmailAuthProvider.credential(cleanEmail, pass);
    await linkWithCredential(user, credential);
    return { success: true };
  } catch (err: any) {
    const code = err?.code || 'auth/unknown';
    console.warn('[accountService] Errore linkEmailPassword:', code, err);

    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      return {
        success: false,
        code,
        error: 'Questa email è già registrata. Per utilizzarla su questo dispositivo, effettua l\'accesso invece di collegarla.'
      };
    }
    if (code === 'auth/weak-password') {
      return {
        success: false,
        code,
        error: 'La password è troppo semplice. Scegline una più robusta (almeno 6 caratteri).'
      };
    }

    return {
      success: false,
      code,
      error: err?.message || 'Impossibile collegare email e password.'
    };
  }
}

/**
 * Effettua il login su un secondo dispositivo con Email e Password.
 */
export async function loginWithEmailPassword(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: User; error?: string; code?: string }> {
  if (!auth) return { success: false, error: 'Firebase Auth non inizializzato.' };
  try {
    const res = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
    return { success: true, user: res.user };
  } catch (err: any) {
    const code = err?.code;
    let error = 'Email o password errati. Riprova.';
    if (code === 'auth/user-not-found') {
      error = 'Nessun account registrato con questa email.';
    } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      error = 'Password errata. Riprova.';
    } else if (code === 'auth/too-many-requests') {
      error = 'Troppi tentativi falliti. Attendi qualche istante prima di riprovare.';
    }
    return {
      success: false,
      code,
      error
    };
  }
}

/**
 * Effettua il login su un secondo dispositivo con Google.
 */
export async function loginWithGoogle(): Promise<{
  success: boolean;
  user?: User;
  error?: string;
  code?: string;
}> {
  if (!auth) return { success: false, error: 'Firebase Auth non inizializzato.' };
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const res = await signInWithPopup(auth, provider);
    return { success: true, user: res.user };
  } catch (err: any) {
    const code = err?.code || 'auth/unknown';
    let error = 'Accesso Google interrotto.';
    if (code === 'auth/popup-closed-by-user') {
      error = 'Finestra popup di Google chiusa o bloccata dal browser (in finestra incognito consenti i popup o usa l\'accesso Email e Password sottostante).';
    } else if (code === 'auth/popup-blocked') {
      error = 'Il browser ha bloccato il popup di Google. Consenti i popup o usa il login Email e Password.';
    } else if (code === 'auth/account-exists-with-different-credential') {
      error = 'Questo indirizzo email è già registrato con Email e Password. Inserisci email e password nel form sopra e clicca "Accedi con Email".';
    } else if (err?.message) {
      error = err.message;
    }
    return {
      success: false,
      code,
      error
    };
  }
}
