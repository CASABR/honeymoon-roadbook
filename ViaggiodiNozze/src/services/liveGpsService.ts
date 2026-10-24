import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
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

export interface LiveGpsPositionInput {
  lat: number;
  lng: number;
  accuracy: number;
  city?: string;
  country?: string;
}

const LEASE_HOURS = 23;
const MIN_PUBLISH_INTERVAL_MS = 16_000;

const asDate = (value: unknown): Date =>
  value instanceof Timestamp ? value.toDate() : new Date(typeof value === 'number' ? value : 0);

const friendlyError = (error: unknown): Error => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied')) return new Error('Non hai i permessi per controllare questa condivisione GPS.');
  if (code.includes('unavailable')) return new Error('Connessione non disponibile. Riprova quando sei online.');
  if (code.includes('aborted')) return new Error('La guida è cambiata da un altro dispositivo. Stato aggiornato.');
  return error instanceof Error ? error : new Error('Operazione GPS non riuscita.');
};

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
    return onSnapshot(locationRef(tripId), snapshot => {
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
      const isStale = Date.now() - location.updatedAt.getTime() >= 120_000;
      if (isPrivileged) {
        callback(location, isStale);
      } else {
        callback(location.status === 'active' && !isStale ? location : null, isStale);
      }
    }, () => callback(null, false));
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

  async assignGuide(tripId: string, holderUid: string, holderDeviceId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di assegnare la guida GPS.');
    try {
      await runTransaction(db, async transaction => {
        const tripSnapshot = await transaction.get(doc(db, 'trips', tripId));
        if (!tripSnapshot.exists() || tripSnapshot.data().ownerUid !== user.uid) {
          throw new Error('Solo l’Organizzatore può assegnare la guida GPS.');
        }
        transaction.set(leaseRef(tripId), {
          holderUid,
          holderDeviceId,
          status: 'active',
          updatedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + LEASE_HOURS * 60 * 60 * 1000)
        });
      });
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async publishLocation(tripId: string, position: LiveGpsPositionInput): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di condividere la posizione.');
    try {
      await runTransaction(db, async transaction => {
        const currentLease = await transaction.get(leaseRef(tripId));
        if (!currentLease.exists()) throw new Error('Nessuna guida GPS assegnata.');
        const lease = currentLease.data();
        const deviceId = getOrCreateDeviceId();
        if (lease.holderUid !== user.uid || lease.holderDeviceId !== deviceId || lease.status !== 'active') {
          throw new Error('Questo dispositivo non detiene la guida GPS attiva.');
        }
        const currentLocation = await transaction.get(locationRef(tripId));
        if (currentLocation.exists()) {
          const lastUpdate = asDate(currentLocation.data().updatedAt).getTime();
          if (Date.now() - lastUpdate < MIN_PUBLISH_INTERVAL_MS) return;
        }
        transaction.set(locationRef(tripId), {
          lat: position.lat,
          lng: position.lng,
          accuracy: Math.max(0, position.accuracy || 0),
          city: (position.city || '').slice(0, 120),
          country: (position.country || '').slice(0, 120),
          updatedAt: serverTimestamp(),
          publisherDeviceId: deviceId,
          status: 'active'
        });
      });
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async pauseOrStop(tripId: string, status: 'paused' | 'stopped'): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Accedi prima di modificare la condivisione.');
    try {
      const locSnapshot = await getDoc(locationRef(tripId));
      const batch = writeBatch(db);
      batch.update(leaseRef(tripId), { status, updatedAt: serverTimestamp() });
      if (locSnapshot.exists()) {
        batch.update(locationRef(tripId), { status, updatedAt: serverTimestamp() });
      }
      await batch.commit();
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async resume(tripId: string, holderUid: string, holderDeviceId: string): Promise<void> {
    await this.assignGuide(tripId, holderUid, holderDeviceId);
  }
};
