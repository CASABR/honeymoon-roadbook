import type { DeviceRole } from '../types';
import { idbGet, idbPut, idbDelete } from '../storage/indexedDB';

const DEVICE_ID_KEY = 'houni_device_id';
const TRIP_ID_KEY = 'houni_trip_id';
const DEVICE_ROLE_KEY = 'houni_device_role';
const AUTHENTICATED_KEY = 'houni_authenticated';

/**
 * Legge o genera un ID dispositivo pseudonimo casuale v4.
 * Non richiede e non legge alcun dato hardware o personale.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'node-device-id';
  }
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId || deviceId.trim() === '') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Registra o aggiorna l'associazione del dispositivo su Firestore in background:
 * Path: /trips/{tripId}/devices/{deviceId}
 * Payload: { deviceId, role, lastSeen: Date.now() }
 */
export async function registerDeviceOnFirestore(tripId: string, role: DeviceRole): Promise<void> {
  if (!tripId || tripId.trim() === '') return;
  const deviceId = getOrCreateDeviceId();

  try {
    const { db } = await import('../firebase');
    const { doc, setDoc } = await import('firebase/firestore');
    if (!db) return;

    const deviceDocRef = doc(db, 'trips', tripId, 'devices', deviceId);
    await setDoc(deviceDocRef, {
      deviceId,
      role,
      lastSeen: Date.now()
    }, { merge: true });
  } catch (err) {
    // Non blocca l'operatività offline o in assenza temporanea di rete
    console.warn('[DeviceSession] Registrazione dispositivo Firestore (offline/deferred):', err);
  }
}

// Contatore/timestamp per serializzare le mutazioni di sessione e prevenire race conditions
let lastSessionMutationTime = 0;

/**
 * Salva la sessione di accesso autenticato al viaggio:
 * - houni_trip_id: ID del viaggio attivo
 * - houni_device_role: ruolo assegnato ('guida' | 'copilota')
 * - houni_authenticated: 'true'
 * E registra l'associazione su Firestore e il backup su IndexedDB in modo atomico.
 */
export async function persistDeviceSession(tripId: string, role: DeviceRole): Promise<void> {
  const mutationTime = Date.now();
  lastSessionMutationTime = mutationTime;

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem('houni_explicit_logout');
    localStorage.setItem(TRIP_ID_KEY, tripId);
    localStorage.setItem(DEVICE_ROLE_KEY, role);
    localStorage.setItem(AUTHENTICATED_KEY, 'true');
    localStorage.setItem('houni_pin_authenticated', 'true');
    localStorage.setItem('auth_pin_verified', 'true');
    localStorage.setItem('app_device_role', role);
  }

  // Backup in IndexedDB: salviamo anche il timestamp per respingere scritture obsolete
  try {
    await idbPut('settings', {
      id: 'device_session_backup',
      value: {
        tripId,
        role,
        authenticated: true,
        updatedAt: mutationTime
      }
    });
  } catch (err) {
    console.warn('[DeviceSession] Backup IndexedDB non riuscito (fallback su localStorage):', err);
  }

  // Registra su Firestore in background senza bloccare la UI
  registerDeviceOnFirestore(tripId, role).catch(console.error);
}

/**
 * Verifica se esiste una sessione attiva persistente per il dispositivo sincrona (da localStorage).
 */
export function getPersistedSession(): {
  isAuthenticated: boolean;
  tripId: string | null;
  role: DeviceRole | null;
} {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { isAuthenticated: false, tripId: null, role: null };
  }

  // Se è presente il marcatore di logout esplicito, la sessione è terminata
  if (localStorage.getItem('houni_explicit_logout') === 'true') {
    return { isAuthenticated: false, tripId: null, role: null };
  }

  const isAuth =
    localStorage.getItem(AUTHENTICATED_KEY) === 'true' ||
    localStorage.getItem('houni_pin_authenticated') === 'true' ||
    localStorage.getItem('auth_pin_verified') === 'true';

  const tripId = localStorage.getItem(TRIP_ID_KEY) || null;
  const role = (localStorage.getItem(DEVICE_ROLE_KEY) || localStorage.getItem('app_device_role')) as DeviceRole | null;

  return {
    isAuthenticated: isAuth && Boolean(tripId),
    tripId,
    role
  };
}

/**
 * Tenta il ripristino asincrono della sessione da IndexedDB qualora localStorage sia stato ripulito dal browser mobile.
 * NOTA: Non ripristina la sessione se è stato eseguito un logout volontario o se il backup non è integro.
 */
export async function restorePersistedSessionFromIndexedDB(): Promise<{
  isAuthenticated: boolean;
  tripId: string | null;
  role: DeviceRole | null;
}> {
  // 1. Controlla prima se localStorage ha già una sessione valida
  const current = getPersistedSession();
  if (current.isAuthenticated) return current;

  // Se localStorage registra un logout esplicito, non ripristinare
  if (typeof localStorage !== 'undefined' && localStorage.getItem('houni_explicit_logout') === 'true') {
    return { isAuthenticated: false, tripId: null, role: null };
  }

  // 2. Cerca il backup in IndexedDB (STORES.SETTINGS)
  try {
    const backup = await idbGet<any>('settings', 'device_session_backup');

    // Se un logout è avvenuto o il record indica disconnessione / timestamp obsoleto
    if (!backup || !backup.value || backup.value.authenticated !== true) {
      return { isAuthenticated: false, tripId: null, role: null };
    }

    // Se durante il caricamento è intervenuta una mutazione locale più recente di logout
    if (backup.value.updatedAt && backup.value.updatedAt < lastSessionMutationTime) {
      return { isAuthenticated: false, tripId: null, role: null };
    }

    if (typeof backup.value.tripId === 'string' && backup.value.tripId.trim().length > 0) {
      const tripId = backup.value.tripId.trim();
      const rawRole = backup.value.role;
      const role: DeviceRole = (rawRole === 'guida' || rawRole === 'copilota' || rawRole === 'viewer')
        ? rawRole
        : 'guida';

      // Ripristina in localStorage per le letture sincrone future dell'app
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('houni_explicit_logout');
        localStorage.setItem(TRIP_ID_KEY, tripId);
        localStorage.setItem(DEVICE_ROLE_KEY, role);
        localStorage.setItem(AUTHENTICATED_KEY, 'true');
        localStorage.setItem('app_device_role', role);
      }

      return {
        isAuthenticated: true,
        tripId,
        role
      };
    }
  } catch (err) {
    console.warn('[DeviceSession] Impossibile recuperare session backup da IndexedDB:', err);
  }

  return { isAuthenticated: false, tripId: null, role: null };
}

/**
 * Rimuove le credenziali della sessione del dispositivo e cancella lo stato autenticato (anche dal backup IndexedDB).
 * Previene race conditions aggiornando il timestamp di mutazione e salvando l'annullamento atomico in IndexedDB.
 */
export async function clearDeviceSession(): Promise<void> {
  const mutationTime = Date.now();
  lastSessionMutationTime = mutationTime;

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    // Marcatore immediato sincrono: l'utente ha chiesto esplicitamente il logout
    localStorage.setItem('houni_explicit_logout', 'true');

    localStorage.removeItem(AUTHENTICATED_KEY);
    localStorage.removeItem(TRIP_ID_KEY);
    localStorage.removeItem(DEVICE_ROLE_KEY);
    localStorage.removeItem('houni_pin_authenticated');
    localStorage.removeItem('auth_pin_verified');
    localStorage.removeItem('houni_auth_time');
    localStorage.removeItem('app_device_role');
    localStorage.removeItem('houni_onboarding_completed_v1');
  }

  // Invalida esplicitamente il record in IndexedDB prima di cancellarlo per garantire che nessuna lettura concorrente lo accetti
  try {
    await idbPut('settings', {
      id: 'device_session_backup',
      value: {
        authenticated: false,
        tripId: null,
        updatedAt: mutationTime
      }
    });
  } catch {}

  // Rimuove definitivamente i backup da IndexedDB
  try {
    await Promise.all([
      idbDelete('settings', 'device_session_backup'),
      idbDelete('settings', 'trip_config_backup'),
      idbDelete('settings', 'device_role_backup')
    ]);
  } catch (err) {
    console.warn('[DeviceSession] Pulizia backup IndexedDB durante logout fallita o parziale:', err);
  }
}
