/**
 * HOUNIGO — CODA MUTAZIONI LOCALE ISOLATA (P0)
 * 
 * Memorizza le mutazioni in sospeso (create offline o durante il lockdown)
 * in un database IndexedDB dedicato ('HounigoLocalQueueDB'), COMPLETAMENTE ISOLATO
 * da 'ViaggiodiNozzeDB' e dallo store 'settings'.
 * 
 * GARANZIE DI SICUREZZA:
 * 1. Nessun leak: la coda non viene MAI sincronizzata con la collection Firestore 'settings'.
 * 2. Nessun accesso Viewer: i Viewer sincronizzano solo le collezioni pubbliche di Firestore.
 * 3. Supporto payload completi: preserva in locale PIN, PNR, prezzi, acconti e allegati.
 * 4. Sopravvivenza: resiste a chiusura PWA, riavvio del dispositivo e navigazione offline.
 */

export interface PendingMutation {
  id: string; // `${entityType}_${dataId}`
  tripId: string;
  entityType: string;
  action: 'save' | 'delete';
  data: any;
  notifyCollaborators?: boolean;
  mutationId?: string;
  timestamp: number;
}

const QUEUE_DB_NAME = 'HounigoLocalQueueDB';
const QUEUE_STORE_NAME = 'pending_mutations';
const QUEUE_DB_VERSION = 1;

// Fallback in memoria per ambienti headless o test Node senza window.indexedDB
const memoryQueue = new Map<string, PendingMutation>();

function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB non disponibile in questo ambiente'));
    }

    const request = window.indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('[LocalQueue] Database bloccato da altra scheda.');
  });
}

export async function savePendingMutation(mutation: Omit<PendingMutation, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Promise<void> {
  const dataId = mutation.data?.id;
  if (!dataId) return;

  const queueId = `${mutation.entityType}_${dataId}`;
  const record: PendingMutation = {
    id: queueId,
    tripId: mutation.tripId,
    entityType: mutation.entityType,
    action: mutation.action,
    data: mutation.data,
    notifyCollaborators: mutation.notifyCollaborators === true,
    mutationId: mutation.mutationId,
    timestamp: mutation.timestamp || Date.now()
  };

  try {
    const db = await openQueueDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // Fallback in-memory per Node / test
    memoryQueue.set(queueId, record);
  }
}

export async function removePendingMutation(entityType: string, dataId: string): Promise<void> {
  if (!dataId) return;
  const queueId = `${entityType}_${dataId}`;

  try {
    const db = await openQueueDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE_NAME);
      const req = store.delete(queueId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    memoryQueue.delete(queueId);
  }
}

export async function getPendingMutations(tripId?: string): Promise<PendingMutation[]> {
  try {
    const db = await openQueueDB();
    const records = await new Promise<PendingMutation[]>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
      const store = tx.objectStore(QUEUE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (tripId) {
      return records.filter(r => !r.tripId || r.tripId === tripId);
    }
    return records;
  } catch {
    const all = Array.from(memoryQueue.values());
    if (tripId) return all.filter(r => !r.tripId || r.tripId === tripId);
    return all;
  }
}

export async function hasPendingMutation(entityType: string, dataId: string): Promise<boolean> {
  if (!dataId) return false;
  const queueId = `${entityType}_${dataId}`;

  try {
    const db = await openQueueDB();
    const exists = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
      const store = tx.objectStore(QUEUE_STORE_NAME);
      const req = store.get(queueId);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => reject(req.error);
    });
    db.close();
    return exists;
  } catch {
    return memoryQueue.has(queueId);
  }
}

export async function clearPendingMutations(tripId?: string): Promise<void> {
  try {
    const db = await openQueueDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE_NAME);
      if (!tripId) {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const items: PendingMutation[] = getAllReq.result || [];
          for (const item of items) {
            if (item.tripId === tripId) {
              store.delete(item.id);
            }
          }
          resolve();
        };
        getAllReq.onerror = () => reject(getAllReq.error);
      }
    });
    db.close();
  } catch {
    if (!tripId) memoryQueue.clear();
    else {
      for (const [k, v] of memoryQueue.entries()) {
        if (v.tripId === tripId) memoryQueue.delete(k);
      }
    }
  }
}

