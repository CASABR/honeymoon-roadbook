import type { DeviceRole } from '../types';

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

/**
 * Salva la sessione di accesso autenticato al viaggio:
 * - houni_trip_id: ID del viaggio attivo
 * - houni_device_role: ruolo assegnato ('guida' | 'copilota')
 * - houni_authenticated: 'true'
 * E registra l'associazione su Firestore.
 */
export function persistDeviceSession(tripId: string, role: DeviceRole): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  localStorage.setItem(TRIP_ID_KEY, tripId);
  localStorage.setItem(DEVICE_ROLE_KEY, role);
  localStorage.setItem(AUTHENTICATED_KEY, 'true');

  // Mantieni retro-compatibilità con le chiavi precedenti
  localStorage.setItem('houni_pin_authenticated', 'true');
  localStorage.setItem('auth_pin_verified', 'true');
  localStorage.setItem('app_device_role', role);

  // Registra su Firestore in background senza attendere
  registerDeviceOnFirestore(tripId, role).catch(console.error);
}

/**
 * Verifica se esiste una sessione attiva persistente per il dispositivo.
 */
export function getPersistedSession(): {
  isAuthenticated: boolean;
  tripId: string | null;
  role: DeviceRole | null;
} {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
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
 * Rimuove le credenziali della sessione del dispositivo e cancella lo stato autenticato.
 */
export function clearDeviceSession(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  localStorage.removeItem(AUTHENTICATED_KEY);
  localStorage.removeItem(TRIP_ID_KEY);
  localStorage.removeItem(DEVICE_ROLE_KEY);
  localStorage.removeItem('houni_pin_authenticated');
  localStorage.removeItem('auth_pin_verified');
  localStorage.removeItem('houni_auth_time');
}
