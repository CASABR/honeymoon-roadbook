import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';

export type LiveGpsStatus = 'active' | 'paused' | 'stopped';

export interface LiveGpsLease {
  holderUid: string;
  holderDeviceId: string;
  status: LiveGpsStatus;
  updatedAt: Date;
  expiresAt: Date;
}

export interface LiveGpsLocation {
  lat: number;
  lng: number;
  accuracy: number;
  city: string;
  country: string;
  updatedAt: Date;
  publisherDeviceId: string;
  status: LiveGpsStatus;
}

export interface LiveGpsDevice {
  deviceId: string;
  uid: string;
  role: string;
  label: string;
  lastSeen: number;
}

export interface TripMemberInfo {
  uid: string;
  name: string;
  role: string;
}

export interface LiveGpsPositionInput {
  lat: number;
  lng: number;
  accuracy: number;
  city?: string;
  country?: string;
}

const LEASE_HOURS = 18;
const MIN_PUBLISH_INTERVAL_MS = 15_000;
export const GPS_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minuti
const lastPublishTimestampByTrip = new Map<string, number>();

const asDate = (value: unknown): Date =>
  value instanceof Timestamp ? value.toDate() : new Date(typeof value === 'number' ? value : 0);

const friendlyError = (error: unknown): Error => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code.includes('permission-denied') || message.includes('permission-denied')) {
    return new Error('Non hai i permessi per controllare questa condivisione GPS. Assicurati di essere registrato come Copilota o Organizzatore.');
  }
  if (code === 'resource-exhausted' || code.includes('resource-exhausted')) {
    return new Error('Limite temporaneo operazioni cloud raggiunto. Riprova tra qualche minuto.');
  }
  if (code.includes('unavailable')) return new Error('Connessione non disponibile. Riprova quando sei online.');
  if (code.includes('aborted')) return new Error('La guida è cambiata da un altro dispositivo. Stato aggiornato.');
  return error instanceof Error ? error : new Error('Operazione GPS non riuscita.');
};

export function describeLiveGpsStartError(error: unknown): string {
  const candidate = error as { code?: number | string; message?: string; name?: string };
  const message = String(candidate?.message || '').trim();
  const normalized = message.toLowerCase();

  if (candidate?.code === 1 || candidate?.name === 'NotAllowedError' || /permission|permess|denied|negat/.test(normalized)) {
    return 'Attiva la posizione nelle impostazioni del browser e riprova.';
  }
  if (candidate?.code === 2 || candidate?.name === 'PositionUnavailableError' || /position unavailable|gps non disponibile/.test(normalized)) {
    return 'GPS non disponibile. Spostati in un punto aperto e riprova.';
  }
  if (candidate?.code === 3 || candidate?.name === 'TimeoutError' || /timeout|timed out/.test(normalized)) {
    return 'GPS non disponibile entro il tempo previsto. Riprova.';
  }
  if (/offline|network|connessione non disponibile|unavailable/.test(normalized)) {
    return 'Connessione assente. La posizione non è stata condivisa.';
  }
  if (/altro dispositivo|guida è cambiata|already.*sharing/.test(normalized)) {
    return 'Un altro dispositivo sta condividendo la posizione.';
  }
  return message || 'Impossibile avviare la condivisione.';
}

const leaseRef = (tripId: string) => doc(db, 'live_feeds', tripId, 'gps_control', 'current');
const locationRef = (tripId: string) => doc(db, 'live_feeds', tripId, 'locations', 'current');

export const liveGpsService = {
  getDeviceId: getOrCreateDeviceId,

  subscribeLease(tripId: string, callback: (lease: LiveGpsLease | null) => void, onError?: (error: Error) => void): Unsubscribe {
    return onSnapshot(leaseRef(tripId), snapshot => {
      if (!snapshot.exists()) return callback(null);
      const data = snapshot.data();
      callback({
        holderUid: data.holderUid,
        holderDeviceId: data.holderDeviceId,
        status: data.status,
        updatedAt: asDate(data.updatedAt),
        expiresAt: asDate(data.expiresAt)
      });
    }, error => {
      callback(null);
      onError?.(friendlyError(error));
    });
  },

  subscribeLocation(
    tripId: string,
    isPrivileged: boolean,
    callback: (location: LiveGpsLocation | null, isStale: boolean) => void
  ): Unsubscribe {
    let active = true;
    let unsubFirestore: Unsubscribe | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setupListener = () => {
      if (!active) return;
      try {
        unsubFirestore = onSnapshot(locationRef(tripId), snapshot => {
          if (!active) return;
          if (!snapshot.exists()) return callback(null, false);
          const data = snapshot.data();
          const location: LiveGpsLocation = {
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy,
            city: data.city || '',
            country: data.country || '',
            updatedAt: asDate(data.updatedAt),
            publisherDeviceId: data.publisherDeviceId,
            status: data.status
          };
          const isStale = Date.now() - location.updatedAt.getTime() >= GPS_STALE_THRESHOLD_MS;
          if (isPrivileged) {
            callback(location, isStale);
          } else {
            callback(location.status === 'active' && !isStale ? location : null, isStale);
          }
        }, () => {
          if (!active) return;
          callback(null, false);
          // Riconnessione periodica: se le Security Rules hanno negato l'accesso (posizione inattiva o lease scaduta),
          // riprova tra 20s così che appena la guida avvia la condivisione, l'ospite si ricolleghi automaticamente.
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (active) setupListener();
          }, 20_000);
        });
      } catch {
        if (!active) return;
        callback(null, false);
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (active) setupListener();
        }, 20_000);
      }
    };

    setupListener();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubFirestore) unsubFirestore();
    };
  },

  subscribePublicLocation(tripId: string, callback: (location: LiveGpsLocation | null) => void): Unsubscribe {
    return this.subscribeLocation(tripId, false, (location) => callback(location));
  },

  subscribeDevices(tripId: string, callback: (devices: LiveGpsDevice[]) => void): Unsubscribe {
    return onSnapshot(collection(db, 'trips', tripId, 'devices'), snapshot => {
      callback(snapshot.docs.map(item => {
        const data = item.data();
        return {
          deviceId: item.id,
          uid: typeof data.uid === 'string' ? data.uid : '',
          role: typeof data.role === 'string' ? data.role : '',
          label: typeof data.label === 'string' ? data.label : `Dispositivo ${item.id.slice(0, 6)}`,
          lastSeen: typeof data.lastSeen === 'number' ? data.lastSeen : 0
        };
      }));
    }, () => callback([]));
  },

  subscribeMembers(tripId: string, callback: (members: TripMemberInfo[]) => void): () => void {
    if (!db || !tripId) {
      callback([]);
      return () => {};
    }
    const memRef = collection(db, 'trips', tripId, 'members');
    return onSnapshot(memRef, (snapshot) => {
      callback(snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          uid: docSnap.id,
          name: typeof data.name === 'string' ? data.name : (data.role === 'copilota' ? 'Copilota' : 'Organizzatore'),
          role: typeof data.role === 'string' ? data.role : 'copilota'
        };
      }));
    }, () => callback([]));
  },

  async assignGuide(tripId: string, holderUid: string, holderDeviceId?: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di assegnare la guida GPS.');
    const safeDeviceId = holderDeviceId && holderDeviceId.trim().length >= 16
      ? holderDeviceId.trim()
      : `delegated_pending_${holderUid}`.slice(0, 120);
    try {
      await setDoc(leaseRef(tripId), {
        holderUid,
        holderDeviceId: safeDeviceId,
        status: 'active',
        updatedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + LEASE_HOURS * 60 * 60 * 1000)
      });
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async claimOrResumeDelegatedGuide(tripId: string, holderUid: string, holderDeviceId: string, expiresAt: Date): Promise<void> {
    const user = auth.currentUser;
    if (!user || user.uid !== holderUid) throw new Error('Solo la guida designata può attivare questa delega GPS.');
    try {
      await updateDoc(leaseRef(tripId), {
        holderUid,
        holderDeviceId,
        status: 'active',
        updatedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(expiresAt.getTime())
      });
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async publishLocation(tripId: string, position: LiveGpsPositionInput, options: { force?: boolean } = {}): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di condividere la posizione.');
    try {
      const now = Date.now();
      const lastPublishTimestamp = lastPublishTimestampByTrip.get(tripId) || 0;
      if (!options.force && now - lastPublishTimestamp < MIN_PUBLISH_INTERVAL_MS) {
        return false;
      }
      const deviceId = getOrCreateDeviceId();
      await setDoc(locationRef(tripId), {
        lat: position.lat,
        lng: position.lng,
        accuracy: Math.max(0, position.accuracy || 0),
        city: (position.city || '').slice(0, 120),
        country: (position.country || '').slice(0, 120),
        updatedAt: serverTimestamp(),
        publisherDeviceId: deviceId,
        status: 'active'
      });
      lastPublishTimestampByTrip.set(tripId, now);
      return true;
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async pauseOrStop(tripId: string, status: 'paused' | 'stopped'): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di modificare la condivisione.');
    try {
      const locSnapshot = await getDoc(locationRef(tripId));
      await updateDoc(leaseRef(tripId), { status, updatedAt: serverTimestamp() });
      if (locSnapshot.exists()) {
        await updateDoc(locationRef(tripId), { status, updatedAt: serverTimestamp() });
      }
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async resume(tripId: string, holderUid: string, holderDeviceId: string): Promise<void> {
    await this.assignGuide(tripId, holderUid, holderDeviceId);
  }
};
