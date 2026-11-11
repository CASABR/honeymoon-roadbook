import {
  type User,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  getRedirectResult
} from 'firebase/auth';
import { doc, getDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { buildTripDiscoveryPlan, resolveVerifiedTripRole } from '../utils/tripDiscovery';
import { getCustomUserDisplayName } from './userAccessService';

export interface UserTripSummary {
  id: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  ownerUid?: string;
  ownerName?: string;
  isOwner: boolean;
  role: 'owner' | 'copilota' | 'viewer';
  isLastUsed?: boolean;
  source?: 'cloud-index' | 'local-verified';
}

export interface UserTripsReport {
  trips: UserTripSummary[];
  cloudIndexStatus: 'loaded' | 'missing';
  indexedTripIds: string[];
  localCandidateIds: string[];
  failedIndexedTripIds: string[];
  unverifiedLocalTripIds: string[];
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
  const customName = getCustomUserDisplayName(user.uid);
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: customName || user.displayName || null,
    isAnonymous: Boolean(user.isAnonymous),
    providers
  };
}

/**
 * Recupero controllato della titolarità (ownership) di un viaggio legacy creato con sessione anonima
 * (es. trip_l96ccua di Giusy dopo login permanente).
 * REGOLE DI SICUREZZA:
 * - Vietato toccare il viaggio master 0000.
 * - Vietata qualsiasi migrazione automatica silenziosa: richiede confirmedByUser === true.
 * - Richiede una prova verificabile: presenza del tripId nella memoria locale del dispositivo,
 *   oppure appartenenza già registrata in /members/{uid}, oppure intervento amministrativo esplicito.
 */
export async function recoverLegacyTripOwnership(params: {
  tripId: string;
  targetOwnerUid: string;
  targetOwnerName?: string;
  previousAnonymousUid?: string;
  confirmedByUser: boolean;
  isAdminOverride?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  const cleanTripId = (params.tripId || '').trim();
  const cleanTargetUid = (params.targetOwnerUid || '').trim();

  if (!cleanTripId || !cleanTargetUid) {
    return { success: false, error: 'ID viaggio e UID destinatario sono obbligatori.' };
  }
  if (cleanTripId === '0000') {
    return { success: false, error: 'Operazione bloccata: il viaggio master 0000 è protetto e non può essere riassegnato.' };
  }
  if (!params.confirmedByUser) {
    return { success: false, error: 'Conferma esplicita richiesta prima di aggiornare la titolarità del viaggio.' };
  }
  if (!db) {
    return { success: false, error: 'Database Firestore non disponibile.' };
  }

  try {
    const tripRef = doc(db, 'trips', cleanTripId);
    const tripSnap = await getDoc(tripRef);
    if (!tripSnap.exists()) {
      return { success: false, error: `Il viaggio "${cleanTripId}" non esiste su Firestore.` };
    }

    const tripData = tripSnap.data();
    const currentOwnerUid = tripData?.ownerUid || tripData?.ownerId || '';

    // Verifica prova di titolarità legittima se non è un override admin
    if (!params.isAdminOverride) {
      let hasProof = false;
      if (currentOwnerUid === cleanTargetUid) {
        hasProof = true;
      }
      if (params.previousAnonymousUid && currentOwnerUid === params.previousAnonymousUid) {
        hasProof = true;
      }
      if (typeof localStorage !== 'undefined') {
        const prevAnon = localStorage.getItem('hounigo_prev_anon_uid');
        if (prevAnon && prevAnon === currentOwnerUid) hasProof = true;
        const rawKnown = localStorage.getItem('hounigo_known_trip_ids') || '';
        const rawConfig = localStorage.getItem('roadbook_trip_config') || '';
        if (rawKnown.includes(cleanTripId) || rawConfig.includes(cleanTripId)) {
          hasProof = true;
        }
      }
      if (Array.isArray(tripData?.members) && tripData.members.includes(cleanTargetUid)) {
        hasProof = true;
      }
      const memberSnap = await getDoc(doc(db, 'trips', cleanTripId, 'members', cleanTargetUid)).catch(() => null);
      if (memberSnap?.exists()) {
        hasProof = true;
      }

      if (!hasProof) {
        return {
          success: false,
          error: 'Prova di titolarità insufficiente su questo dispositivo. Usa la Console Manager (Admin) per associare il viaggio in sicurezza.'
        };
      }
    }

    const resolvedOwnerName =
      (params.targetOwnerName || '').trim() ||
      getCustomUserDisplayName(cleanTargetUid) ||
      tripData?.ownerName ||
      'Organizzatore';

    const batch = writeBatch(db);
    batch.set(tripRef, {
      ownerUid: cleanTargetUid,
      ownerName: resolvedOwnerName,
      legacyPreviousOwnerUid: currentOwnerUid && currentOwnerUid !== cleanTargetUid ? currentOwnerUid : (tripData?.legacyPreviousOwnerUid || null),
      members: arrayUnion(cleanTargetUid),
      ownershipRecoveredAt: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });

    const memberRef = doc(db, 'trips', cleanTripId, 'members', cleanTargetUid);
    batch.set(memberRef, {
      uid: cleanTargetUid,
      name: resolvedOwnerName,
      role: 'owner',
      updatedAt: Date.now()
    }, { merge: true });

    const userRef = doc(db, 'users', cleanTargetUid);
    batch.set(userRef, {
      uid: cleanTargetUid,
      associatedTripIds: arrayUnion(cleanTripId),
      updatedAt: Date.now()
    }, { merge: true });

    await batch.commit();

    return {
      success: true,
      message: `Titolarità del viaggio "${tripData?.title || cleanTripId}" associata con successo a ${resolvedOwnerName}.`
    };
  } catch (err: any) {
    console.warn('[accountService] Errore recupero titolarità viaggio legacy:', err);
    return {
      success: false,
      error: err?.code === 'permission-denied'
        ? 'Permessi Firestore insufficienti dall’account corrente. Esegui il recupero dalla Console Manager con account Admin.'
        : (err?.message || 'Impossibile completare il recupero del viaggio.')
    };
  }
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
    const ownerUid = data?.ownerUid || data?.ownerId || null;
    const ownerName = data?.ownerName || null;
    const isOwner = Boolean(ownerUid && ownerUid === currentUid);
    return {
      exists: true,
      isOwner,
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
export async function fetchUserTripsReport(uid: string): Promise<UserTripsReport> {
  if (!db || !uid) throw new Error('Servizio viaggi non disponibile. Riprova quando sei online.');

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    console.warn('[accountService] Lettura indice viaggi non riuscita:', error);
    throw new Error('Impossibile caricare l’elenco dei viaggi. Verifica la connessione e riprova.');
  }

  const userData = userSnap.exists() ? userSnap.data() : null;
  const rawLocalCandidateIds: string[] = [];
  const addLocalCandidate = (tripId: unknown) => {
    if (typeof tripId !== 'string') return;
    const cleanId = tripId.trim();
    if (cleanId && !rawLocalCandidateIds.includes(cleanId)) rawLocalCandidateIds.push(cleanId);
  };

  // 1. Includi sempre MASTER_TRIP_ID ('0000') tra i candidati da verificare:
  // Se l'UID autenticato è già membro/copilota o owner di 0000 su Firestore,
  // verrà mostrato correttamente anche se l'indice users/{uid} è incompleto.
  // Se non è autorizzato, Firestore restituirà permission-denied e NON verrà mostrato.
  addLocalCandidate('0000');

  if (typeof localStorage !== 'undefined') {
    const candidateKeys = [
      'roadbook_trip_config',
      'hounigo_trip_config',
      'houni_trip_id',
      'hounigo_active_trip_id',
      'hounigo_last_active_trip_id'
    ];
    for (const key of candidateKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        if (raw.startsWith('{')) addLocalCandidate(JSON.parse(raw)?.id);
        else addLocalCandidate(raw);
      } catch {}
    }
    try {
      const { getKnownTripIds } = await import('../utils/tripConfig');
      getKnownTripIds().forEach(addLocalCandidate);
    } catch {}
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      const sessTrip = sessionStorage.getItem('houni_trip_id') || sessionStorage.getItem('hounigo_trip_id');
      if (sessTrip) addLocalCandidate(sessTrip);
    } catch {}
  }

  const { indexedTripIds, localCandidateIds, uniqueTripIds } = buildTripDiscoveryPlan(
    userData?.associatedTripIds,
    userData?.lastTripId,
    rawLocalCandidateIds
  );
  const lastTripId = typeof userData?.lastTripId === 'string' ? userData.lastTripId.trim() : '';
  const indexedSet = new Set(indexedTripIds);
  const summaries: UserTripSummary[] = [];
  const failedIndexedTripIds: string[] = [];
  const unverifiedLocalTripIds: string[] = [];

  const inspections = await Promise.all(uniqueTripIds.map(async (tripId) => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 7000)
      );
      const result = await Promise.race([
        (async () => {
          const snap = await getDoc(doc(db, 'trips', tripId));
          if (!snap.exists()) return null;
          const tripData = snap.data();
          let verifiedRole: 'owner' | 'copilota' | 'viewer' | null = null;

          if (tripData.ownerUid === uid || tripData.ownerId === uid) {
            verifiedRole = 'owner';
          } else {
            // Verifica autorevole sulla sottocollezione /members/{uid}:
            // Un membro Viewer non deve mai essere interpretato come Copilota.
            const memberSnap = await getDoc(doc(db, 'trips', tripId, 'members', uid)).catch(() => null);
            if (memberSnap?.exists()) {
              verifiedRole = resolveVerifiedTripRole(uid, tripData, true, memberSnap.data()?.role);
            } else if (Array.isArray(tripData.members) && tripData.members.includes(uid)) {
              verifiedRole = resolveVerifiedTripRole(uid, tripData, false);
            }
          }

          if (!verifiedRole) return null;

          return {
            id: tripId,
            title: tripData?.title || 'Viaggio',
            destination: tripData?.destination || undefined,
            startDate: tripData?.startDate,
            endDate: tripData?.endDate,
            ownerUid: tripData?.ownerUid || tripData?.ownerId,
            ownerName: tripData?.ownerName || undefined,
            isOwner: verifiedRole === 'owner',
            role: verifiedRole,
            isLastUsed: tripId === lastTripId,
            source: indexedSet.has(tripId) ? 'cloud-index' : 'local-verified'
          } satisfies UserTripSummary;
        })(),
        timeoutPromise
      ]);
      return { tripId, result, failed: false };
    } catch (error: any) {
      const isPermissionDenied = error?.code === 'permission-denied' || String(error?.message).includes('permission-denied');
      const isNotFound = error?.code === 'not-found';
      const isExpectedNonAccess = Boolean(isPermissionDenied || isNotFound);
      console.warn(`[accountService] Verifica viaggio ${tripId} (${isExpectedNonAccess ? 'inaccessibile/rimosso' : 'errore rete'}):`, error?.code || error?.message);
      return { tripId, result: null, failed: !isExpectedNonAccess };
    }
  }));

  inspections.forEach(({ tripId, result, failed }) => {
    if (result) summaries.push(result);
    if (failed && indexedSet.has(tripId)) failedIndexedTripIds.push(tripId);
    if (!indexedSet.has(tripId) && !result) unverifiedLocalTripIds.push(tripId);
  });

  return {
    trips: summaries,
    cloudIndexStatus: userSnap.exists() ? 'loaded' : 'missing',
    indexedTripIds,
    localCandidateIds,
    failedIndexedTripIds,
    unverifiedLocalTripIds
  };
}

export async function fetchUserTrips(uid: string): Promise<UserTripSummary[]> {
  return (await fetchUserTripsReport(uid)).trips;
}

/**
 * Cambia il viaggio attivo corrente senza contaminazione dati:
 * chiude IndexedDB, imposta sessione dispositivo e notifica l'app.
 * Mantiene invariata l'identità autenticata dell'utente.
 */
export async function switchActiveTrip(trip: UserTripSummary): Promise<void> {
  const { saveTripConfig, normalizeTripConfig, addKnownTripId } = await import('../utils/tripConfig');
  const { storageService } = await import('../storage/storageService');
  const { persistDeviceSession } = await import('../utils/deviceSession');
  const { recordUserAccess } = await import('./userAccessService');

  const role = trip.isOwner ? 'guida' : trip.role === 'viewer' ? 'viewer' : 'copilota';
  persistDeviceSession(trip.id, role);
  storageService.setDeviceRole(role);
  addKnownTripId(trip.id);

  const config = normalizeTripConfig({
    id: trip.id,
    title: trip.title,
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    ownerUid: trip.ownerUid || '',
    ownerName: trip.ownerName || ''
  });
  saveTripConfig(config);

  if (auth?.currentUser) {
    await recordUserAccess(auth.currentUser, trip.id).catch(() => {});
  }
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
 * Assicura che la sessione corrente sia autenticata con un account permanente (email/password),
 * creando l'account o effettuando il login.
 */
export async function ensureAuthenticatedAccount(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  if (!auth) return { success: false, error: 'Firebase Auth non inizializzato.' };
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
  const cleanEmail = email.trim().toLowerCase();

  // 1. Prova prima il login se l'account è già stato registrato
  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    return { success: true, user: cred.user };
  } catch (signErr: any) {
    // Continua con la creazione se non esiste
  }

  // 2. Se c'è una sessione anonima corrente, prova prima a collegare le credenziali per preservare l'UID
  if (auth.currentUser && auth.currentUser.isAnonymous) {
    try {
      const linkRes = await linkEmailPasswordToCurrentSession(auth.currentUser, cleanEmail, pass);
      if (linkRes.success) {
        return { success: true, user: auth.currentUser };
      }
    } catch {}
  }

  // 3. Creazione diretta dell'account su Firebase Auth
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try { await auth.signOut(); } catch {}
    }
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
    return { success: true, user: cred.user };
  } catch (createErr: any) {
    if (createErr?.code === 'auth/email-already-in-use') {
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        return { success: true, user: cred.user };
      } catch (loginErr: any) {
        return { success: false, error: loginErr?.message || 'Email già in uso.' };
      }
    }
    return { success: false, error: createErr?.message || 'Errore creazione account' };
  }
}

/**
 * Effettua il login su un secondo dispositivo con Email e Password.
 */
export async function loginWithEmailPassword(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: User; error?: string; code?: string; preExistingAccount?: boolean }> {
  if (!auth) return { success: false, error: 'Firebase Auth non inizializzato.' };
  if (import.meta.env.DEV && typeof window !== 'undefined' && (window as any).__HOUNIGO_MOCK_GOOGLE_USER__) {
    const mockUser = (window as any).__HOUNIGO_MOCK_GOOGLE_USER__;
    return { success: true, user: mockUser, preExistingAccount: false };
  }
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

type RedirectCheckResult = {
  success: boolean;
  user?: User;
  error?: string;
  code?: string;
};

let cachedRedirectCheckPromise: Promise<RedirectCheckResult> | null = null;

/**
 * Controlla se vi è un risultato OAuth pendente da redirect (es. PWA o Safari senza popup).
 * Coalesce su un'unica Promise per evitare doppie chiamate concorrenti a getRedirectResult().
 */
export async function checkPendingRedirectResult(): Promise<RedirectCheckResult> {
  if (!auth) return { success: false };
  if (cachedRedirectCheckPromise) return cachedRedirectCheckPromise;

  cachedRedirectCheckPromise = (async () => {
    try {
      const result = await getRedirectResult(auth);
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('houni_oauth_redirect_pending');
      } catch {}
      if (result && result.user) {
        return { success: true, user: result.user };
      }
      return { success: false };
    } catch (err: any) {
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('houni_oauth_redirect_pending');
      } catch {}
      const code = err?.code || 'auth/unknown';
      return {
        success: false,
        code,
        error: err?.message || 'Errore durante il recupero del login da reindirizzamento.'
      };
    }
  })();

  return cachedRedirectCheckPromise;
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
  if (import.meta.env.DEV && typeof window !== 'undefined' && (window as any).__HOUNIGO_MOCK_GOOGLE_USER__) {
    const mockUser = (window as any).__HOUNIGO_MOCK_GOOGLE_USER__;
    return { success: true, user: mockUser, preExistingAccount: false };
  }
  try {
    onProgress?.('Apertura finestra di autenticazione…');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const currentUser = auth.currentUser;
    if (currentUser?.uid && currentUser.isAnonymous && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('houni_prev_anon_uid', currentUser.uid);
        localStorage.setItem('hounigo_prev_anon_uid', currentUser.uid);
      } catch {}
    }
    let wasPreExisting = false;
    let targetUser: User | null = null;
    let isLinked = false;

    // Accesso esplicito con Google: recupera direttamente l'account Firebase registrato per l'identità Google.
    // SICUREZZA: non collega automaticamente l'account Google al nuovo UID anonimo del dispositivo,
    // garantendo il recupero dell'UID storico autentico (ownerUid).
    onProgress?.('Autenticazione con Google…');
    try {
      const res = await signInWithPopup(auth, provider);
      targetUser = res.user;
    } catch (popupErr: any) {
      if ((popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/cancelled-popup-request') && typeof window !== 'undefined') {
        console.warn('[accountService] Popup bloccato dal browser (iOS Safari / PWA): avvio reindirizzamento Google.');
        onProgress?.('Reindirizzamento verso Google…');
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('houni_oauth_redirect_pending', '1');
        } catch {}
        cachedRedirectCheckPromise = null;
        const { signInWithRedirect } = await import('firebase/auth');
        await signInWithRedirect(auth, provider);
        return { success: false, code: 'auth/redirect-started', error: 'Reindirizzamento verso Google in corso...' };
      }
      throw popupErr;
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
