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
  id: string; // JSON tuple [tripId, entityType, dataId]
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
const QUEUE_DB_VERSION = 2;

// Fallback in memoria per ambienti headless o test Node senza window.indexedDB
const memoryQueue = new Map<string, PendingMutation>();

export function normalizeQueueEntityType(entityType: string): string {
  const clean = String(entityType || '').trim().toLowerCase();
  if (clean === 'nota' || clean === 'notes') return 'note';
  if (clean === 'spesa') return 'spese';
  if (clean === 'bagaglio') return 'bagagli';
  if (clean === 'attivita' || clean === 'attività') return 'attivita';
  if (clean === 'alloggio') return 'alloggi';
  if (clean === 'trasporto') return 'trasporti';
  if (clean === 'tappa') return 'tappe';
  if (clean === 'ristorante') return 'ristoranti';
  return clean;
}

export function mutationQueueKey(tripId: string, entityType: string, dataId: string): string {
  return JSON.stringify([tripId, normalizeQueueEntityType(entityType), dataId]);
}
const hasIndexedDB = () => typeof window !== 'undefined' && Boolean(window.indexedDB);
function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' });
        return;
      }
      const tx = request.transaction!;
      const store = tx.objectStore(QUEUE_STORE_NAME);
      const read = store.getAll();
      read.onsuccess = () => {
        const migrated = new Map<string, PendingMutation>();
        for (const record of read.result as PendingMutation[]) {
          // Abort ambiguous migrations atomically, preserving every original record.
          if (!record.tripId || !record.entityType || !record.data?.id) { tx.abort(); return; }
          const id = mutationQueueKey(record.tripId, record.entityType, record.data.id);
          if (migrated.has(id)) { tx.abort(); return; }
          migrated.set(id, { ...record, id, entityType: normalizeQueueEntityType(record.entityType) });
        }
        store.clear();
        for (const record of migrated.values()) store.put(record);
      };
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('[LocalQueue] Close other tabs to upgrade the queue.');
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openQueueDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE_NAME, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Queue transaction aborted'));
      run(tx.objectStore(QUEUE_STORE_NAME), result => { value = result; });
    });
  } finally { db.close(); }
}
export async function savePendingMutation(mutation: Omit<PendingMutation, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Promise<void> {
  const dataId = mutation.data?.id;
  if (!dataId || !mutation.tripId) throw new Error('Mutation requires tripId and data.id');
  const entityType = normalizeQueueEntityType(mutation.entityType);
  const id = mutationQueueKey(mutation.tripId, entityType, dataId);
  const record: PendingMutation = { ...mutation, id, entityType, timestamp: mutation.timestamp ?? Date.now() };
  if (!hasIndexedDB()) { memoryQueue.set(id, structuredClone(record)); return; }
  // Browser storage errors propagate: volatile memory cannot replace durable writes.
  await transaction<void>('readwrite', store => { store.put(record); });
}
export async function removePendingMutation(tripId: string, entityType: string, dataId: string,
  expected?: Pick<PendingMutation, 'action' | 'data' | 'mutationId'>): Promise<void> {
  const id = mutationQueueKey(tripId, entityType, dataId);
  const matches = (record?: PendingMutation) => record && (!expected ||
    (record.action === expected.action && record.mutationId === expected.mutationId && JSON.stringify(record.data) === JSON.stringify(expected.data)));
  if (!hasIndexedDB()) { if (matches(memoryQueue.get(id))) memoryQueue.delete(id); return; }
  await transaction<void>('readwrite', store => {
    const req = store.get(id);
    req.onsuccess = () => { if (matches(req.result)) store.delete(id); };
  });
}
export async function getPendingMutations(tripId?: string): Promise<PendingMutation[]> {
  const records = hasIndexedDB()
    ? await transaction<PendingMutation[]>('readonly', (store, result) => {
      const req = store.getAll(); req.onsuccess = () => result(req.result);
    }) : structuredClone(Array.from(memoryQueue.values()));
  return records.filter(record => !tripId || record.tripId === tripId).sort((a, b) => a.timestamp - b.timestamp);
}
export async function hasPendingMutation(tripId: string, entityType: string, dataId: string): Promise<boolean> {
  const id = mutationQueueKey(tripId, entityType, dataId);
  if (!hasIndexedDB()) return memoryQueue.has(id);
  return transaction<boolean>('readonly', (store, result) => {
    const req = store.get(id); req.onsuccess = () => result(Boolean(req.result));
  });
}
export async function clearPendingMutations(tripId?: string): Promise<void> {
  if (!hasIndexedDB()) {
    for (const [id, record] of memoryQueue) if (!tripId || record.tripId === tripId) memoryQueue.delete(id);
    return;
  }
  await transaction<void>('readwrite', store => {
    const req = store.getAll();
    req.onsuccess = () => {
      for (const record of req.result as PendingMutation[]) if (!tripId || record.tripId === tripId) store.delete(record.id);
    };
  });
}
