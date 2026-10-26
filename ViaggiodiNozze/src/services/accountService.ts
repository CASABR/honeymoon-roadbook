import {
  type User,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  signInWithCredential,
  getRedirectResult
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

    const userData = userSnap.exists() ? userSnap.data() : null;
    const tripIds: string[] = Array.isArray(userData?.associatedTripIds)
      ? [...userData.associatedTripIds]
      : [];

    const lastTripId = userData?.lastTripId;
    if (lastTripId && !tripIds.includes(lastTripId)) {
      tripIds.unshift(lastTripId);
    }

    // Se l'utente si è autenticato con Google da una precedente sessione anonima su questo dispositivo,
    // recuperiamo anche i tripId memorizzati sul record dell'UID anonimo precedente
    const prevAnonUid = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('houni_prev_anon_uid') : null) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('hounigo_prev_anon_uid') : null);
    if (prevAnonUid && prevAnonUid !== uid) {
      try {
        const anonDocRef = doc(db, 'users', prevAnonUid);
        const anonSnap = await getDoc(anonDocRef);
        if (anonSnap.exists()) {
          const anonData = anonSnap.data();
          if (Array.isArray(anonData?.associatedTripIds)) {
            anonData.associatedTripIds.forEach((tId: string) => {
              if (tId && !tripIds.includes(tId)) tripIds.push(tId);
            });
          }
          if (anonData?.lastTripId && !tripIds.includes(anonData.lastTripId)) {
            tripIds.push(anonData.lastTripId);
          }
        }
      } catch (err) {
        console.warn('[accountService] Impossibile recuperare viaggi da UID anonimo precedente:', err);
      }
    }

    // Controlliamo tutte le chiavi locali note di tripId memorizzati sul dispositivo
    if (typeof localStorage !== 'undefined') {
      const candidateKeys = ['roadbook_trip_config', 'hounigo_trip_config', 'houni_trip_id', 'hounigo_active_trip_id'];
      for (const k of candidateKeys) {
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          if (raw.startsWith('{')) {
            const parsed = JSON.parse(raw);
            if (parsed?.id && parsed.id !== '0000' && !tripIds.includes(parsed.id)) {
              tripIds.push(parsed.id);
            }
          } else if (raw.trim() && raw.trim() !== '0000' && !tripIds.includes(raw.trim())) {
            tripIds.push(raw.trim());
          }
        } catch {}
      }
      try {
        const rawKnown = localStorage.getItem('hounigo_known_trip_ids');
        if (rawKnown) {
          const parsed = JSON.parse(rawKnown);
          if (Array.isArray(parsed)) {
            parsed.forEach((t: string) => {
              if (t && t !== '0000' && !tripIds.includes(t)) tripIds.push(t);
            });
          }
        }
      } catch {}
    }

    const summaries: UserTripSummary[] = [];
    const uniqueTripIds = Array.from(new Set(tripIds.filter(Boolean)));

    // Esecuzione concorrente per ciascun tripId con timeout adeguato a reti mobili (7000ms)
    const tripInspectionPromises = uniqueTripIds.map(async (tripId) => {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 7000)
        );
        const fetchPromise = (async () => {
          const snap = await getDoc(doc(db, 'trips', tripId));
          if (!snap.exists()) return null;
          const tdata = snap.data();
          const isOwner = tdata?.ownerUid === uid || tdata?.ownerId === uid || (tripId === '0000' && uid === 'nunzio') ||
            (prevAnonUid && (tdata?.ownerUid === prevAnonUid || tdata?.ownerId === prevAnonUid));
          const membersList = Array.isArray(tdata?.members) ? tdata.members : [];
          const isMember = membersList.includes(uid) || isOwner || (prevAnonUid && membersList.includes(prevAnonUid));

          let verifiedRole: 'owner' | 'copilota' | null = isOwner ? 'owner' : (isMember ? 'copilota' : null);
          if (!verifiedRole) {
            const memSnap = await getDoc(doc(db, 'trips', tripId, 'members', uid)).catch(() => null);
            if (memSnap && memSnap.exists()) {
              verifiedRole = memSnap.data()?.role === 'owner' ? 'owner' : 'copilota';
            }
          }
          if (!verifiedRole && prevAnonUid) {
            const anonMemSnap = await getDoc(doc(db, 'trips', tripId, 'members', prevAnonUid)).catch(() => null);
            if (anonMemSnap && anonMemSnap.exists()) {
              verifiedRole = anonMemSnap.data()?.role === 'owner' ? 'owner' : 'copilota';
            }
          }
          // Fallback di cortesia se getDoc ha avuto successo grazie a permessi Firestore
          if (!verifiedRole) {
            verifiedRole = tdata?.ownerUid === uid ? 'owner' : 'copilota';
          }

          if (verifiedRole) {
            return {
              id: tripId,
              title: tdata?.title || (tripId === '0000' ? 'Viaggio Originale' : 'Viaggio'),
              destination: tdata?.destination || undefined,
              startDate: tdata?.startDate,
              endDate: tdata?.endDate,
              ownerUid: tdata?.ownerUid || tdata?.ownerId,
              ownerName: tdata?.ownerName || (tripId === '0000' ? 'nunzio' : undefined),
              isOwner: verifiedRole === 'owner',
              role: verifiedRole,
              isLastUsed: tripId === lastTripId
            } as UserTripSummary;
          }
          return null;
        })();

        return await Promise.race([fetchPromise, timeoutPromise]);
      } catch {
        return null;
      }
    });

    const settled = await Promise.allSettled(tripInspectionPromises);
    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value) {
        summaries.push(item.value);
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
 * Controlla se vi è un risultato OAuth pendente da redirect (es. PWA o Safari senza popup).
 */
export async function checkPendingRedirectResult(): Promise<{
  success: boolean;
  user?: User;
  error?: string;
  code?: string;
}> {
  if (!auth) return { success: false };
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return { success: true, user: result.user };
    }
    return { success: false };
  } catch (err: any) {
    const code = err?.code || 'auth/unknown';
    return {
      success: false,
      code,
      error: err?.message || 'Errore durante il recupero del login da reindirizzamento.'
    };
  }
}

/**
 * Effettua il login o collegamento account con Google.
 * Se l'utente corrente è anonimo, tenta linkWithPopup per preservare l'UID e le membership legittime.
 * Se l'account Google è già registrato con altro UID (credential-already-in-use), estrae le credenziali
 * tramite credentialFromError ed esegue signInWithCredential in modo trasparente senza aprire un secondo popup
 * (evitando il blocco popup di iOS Safari e PWA).
 */
export async function loginWithGoogle(onProgress?: (stage: string) => void): Promise<{
  success: boolean;
  user?: User;
  error?: string;
  code?: string;
  linked?: boolean;
  preExistingAccount?: boolean;
}> {
  if (!auth) return { success: false, error: 'Firebase Auth non inizializzato.' };
  try {
    onProgress?.('Apertura finestra di autenticazione…');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const currentUser = auth.currentUser;
    const isAnon = Boolean(currentUser && currentUser.isAnonymous);
    if (currentUser?.uid && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('houni_prev_anon_uid', currentUser.uid);
        localStorage.setItem('hounigo_prev_anon_uid', currentUser.uid);
      } catch {}
    }
    let wasPreExisting = false;
    let targetUser: User | null = null;
    let isLinked = false;

    // Se l'utente è attualmente anonimo su questo dispositivo, proviamo a collegare le credenziali Google
    // al medesimo UID, preservando al 100% tutte le membership e associazioni già concesse
    if (isAnon && currentUser) {
      try {
        onProgress?.('Verifica sessione e collegamento account…');
        const linkRes = await linkWithPopup(currentUser, provider);
        targetUser = linkRes.user;
        isLinked = true;
      } catch (linkErr: any) {
        if (linkErr?.code === 'auth/credential-already-in-use') {
          wasPreExisting = true;
          onProgress?.('Riconciliazione identità Google…');
          console.info('[accountService] Account Google già registrato con altro UID: accesso diretto con credenziale.');
          const credential = GoogleAuthProvider.credentialFromError(linkErr) || (linkErr as any)?.credential || null;
          if (credential) {
            const credRes = await signInWithCredential(auth, credential);
            targetUser = credRes.user;
          } else {
            try {
              const popupRes = await signInWithPopup(auth, provider);
              targetUser = popupRes.user;
            } catch (popupErr: any) {
              if (popupErr?.code === 'auth/popup-blocked' && typeof window !== 'undefined') {
                console.warn('[accountService] Secondo popup bloccato dal browser: reindirizzamento Google.');
                const { signInWithRedirect } = await import('firebase/auth');
                await signInWithRedirect(auth, provider);
                return { success: false, code: 'auth/redirect-started', error: 'Reindirizzamento verso Google in corso...' };
              }
              throw popupErr;
            }
          }
        } else {
          throw linkErr;
        }
      }
    } else {
      // Accesso standard con Google per account nuovo o sessione già autenticata
      onProgress?.('Autenticazione con Google…');
      const res = await signInWithPopup(auth, provider);
      targetUser = res.user;
    }

    if (!targetUser) {
      return { success: false, error: 'Nessun utente restituito dall\'accesso Google.' };
    }

    // Registra accesso utente Google in modo sicuro (senza migrazioni automatiche non autorizzate)
    try {
      const { recordUserAccess } = await import('./userAccessService');
      const rawLocalConfig = typeof localStorage !== 'undefined' ? localStorage.getItem('roadbook_trip_config') : null;
      let activeTripId: string | undefined = undefined;
      if (rawLocalConfig) {
        try {
          const parsed = JSON.parse(rawLocalConfig);
          if (parsed?.id && parsed.id !== '0000') {
            // Per gli account preesistenti, associa il viaggio locale solo se l'utente risulta realmente autorizzato
            if (!wasPreExisting) {
              activeTripId = parsed.id;
            } else {
              // Verifica rapida se il viaggio appartiene già o include l'utente
              if (parsed.ownerUid === targetUser.uid || parsed.members?.includes(targetUser.uid)) {
                activeTripId = parsed.id;
              }
            }
          }
        } catch {}
      }
      await recordUserAccess(targetUser, activeTripId);
    } catch (recErr) {
      console.warn('[accountService] RecordUserAccess non bloccante fallito:', recErr);
    }

    return {
      success: true,
      user: targetUser,
      linked: isLinked,
      preExistingAccount: wasPreExisting
    };
  } catch (err: any) {
    const code = err?.code || 'auth/unknown';
    let error = 'Accesso Google interrotto.';
    if (code === 'auth/popup-closed-by-user') {
      error = 'Finestra di accesso Google chiusa prima del completamento (auth/popup-closed-by-user). Riprova cliccando nuovamente sul pulsante.';
    } else if (code === 'auth/popup-blocked') {
      error = 'Il browser ha bloccato il popup di Google (auth/popup-blocked). Consenti le finestre popup per questo sito, oppure usa l\'accesso Email e Password.';
    } else if (code === 'auth/unauthorized-domain') {
      error = 'Questo dominio web non è autorizzato per l\'accesso Google in Firebase Authentication (auth/unauthorized-domain).';
    } else if (code === 'auth/account-exists-with-different-credential') {
      error = 'Questo indirizzo email è già registrato con un altro metodo. Accedi inserendo le credenziali Email e Password (auth/account-exists-with-different-credential).';
    } else if (code === 'auth/network-request-failed') {
      error = 'Errore di connessione durante l\'accesso a Google (auth/network-request-failed). Verifica la connessione di rete e riprova.';
    } else if (err?.message) {
      error = `${err.message} (${code})`;
    }
    return {
      success: false,
      code,
      error
    };
  }
}


