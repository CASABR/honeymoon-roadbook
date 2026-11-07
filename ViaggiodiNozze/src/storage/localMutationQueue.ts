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

// -----------------------------------------------------------------------------
// ARCHIVIO CONFLITTI LOCALE ISOLATO (P0 PRIVACY & RESILIENZA)
// -----------------------------------------------------------------------------
export interface ConflictBackupRecord {
  id: string;
  tripId: string;
  entityType: string;
  dataId: string;
  localData: any;
  serverData?: any;
  conflictType: 'server_newer' | 'remote_tombstone_vs_local_edit' | 'manual' | 'unreliable_timestamp_conflict';
  serverUpdated?: number;
  localUpdated?: number;
  tombstoneDeletedAt?: number;
  savedAt: number;
  status: 'pending_review' | 'resolved_keep_local' | 'resolved_keep_remote' | 'resolved_already_synced';
  resolvedAt?: number;
  resolutionNote?: string;
}

const CONFLICT_DB_NAME = 'HounigoConflictArchiveDB';
const CONFLICT_STORE_NAME = 'conflict_backups';
const CONFLICT_DB_VERSION = 1;
const memoryConflictStore = new Map<string, ConflictBackupRecord>();

function openConflictDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CONFLICT_DB_NAME, CONFLICT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
        db.createObjectStore(CONFLICT_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('[ConflictArchive] Chiudi altre schede per aggiornare il database conflitti.');
  });
}

async function conflictTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  const db = await openConflictDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, mode);
      let val: T;
      tx.oncomplete = () => resolve(val);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Conflict transaction aborted'));
      run(tx.objectStore(CONFLICT_STORE_NAME), result => { val = result; });
    });
  } finally {
    db.close();
  }
}

export async function saveConflictBackup(backup: Omit<ConflictBackupRecord, 'id' | 'savedAt' | 'status'> & { id?: string; savedAt?: number; status?: ConflictBackupRecord['status'] }): Promise<string> {
  const timestamp = backup.savedAt ?? Date.now();
  const id = backup.id || `${backup.tripId}_${backup.entityType}_${backup.dataId}_${timestamp}`;
  const record: ConflictBackupRecord = {
    ...backup,
    id,
    savedAt: timestamp,
    status: backup.status || 'pending_review'
  };

  if (!hasIndexedDB()) {
    memoryConflictStore.set(id, structuredClone(record));
    return id;
  }

  await conflictTx<void>('readwrite', (store, resolve) => {
    store.put(record);
    resolve();
  });
  return id;
}

export async function getConflictBackups(tripId?: string): Promise<ConflictBackupRecord[]> {
  if (!hasIndexedDB()) {
    const list = Array.from(memoryConflictStore.values());
    return (!tripId ? list : list.filter(r => r.tripId === tripId)).sort((a, b) => b.savedAt - a.savedAt);
  }

  const all = await conflictTx<ConflictBackupRecord[]>('readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });

  return (!tripId ? all : all.filter(r => r.tripId === tripId)).sort((a, b) => b.savedAt - a.savedAt);
}

export async function getConflictBackupById(id: string): Promise<ConflictBackupRecord | null> {
  if (!hasIndexedDB()) {
    return memoryConflictStore.get(id) ? structuredClone(memoryConflictStore.get(id)!) : null;
  }

  return conflictTx<ConflictBackupRecord | null>('readonly', (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
  });
}

export async function getPendingConflictBackups(tripId?: string): Promise<ConflictBackupRecord[]> {
  const all = await getConflictBackups(tripId);
  return all.filter(c => c.status === 'pending_review');
}

export async function updateConflictStatus(
  id: string,
  status: ConflictBackupRecord['status'],
  note?: string
): Promise<void> {
  if (!hasIndexedDB()) {
    const rec = memoryConflictStore.get(id);
    if (rec) {
      rec.status = status;
      rec.resolvedAt = Date.now();
      if (note) rec.resolutionNote = note;
    }
    return;
  }

  await conflictTx<void>('readwrite', (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as ConflictBackupRecord | undefined;
      if (rec) {
        rec.status = status;
        rec.resolvedAt = Date.now();
        if (note) rec.resolutionNote = note;
        store.put(rec);
      }
      resolve();
    };
    req.onerror = () => resolve();
  });
}

export async function removeConflictBackup(id: string): Promise<void> {
  if (!hasIndexedDB()) {
    memoryConflictStore.delete(id);
    return;
  }

  await conflictTx<void>('readwrite', (store, resolve) => {
    store.delete(id);
    resolve();
  });
}

export async function clearConflictBackups(tripId?: string): Promise<void> {
  if (!hasIndexedDB()) {
    if (!tripId) {
      memoryConflictStore.clear();
    } else {
      for (const [k, v] of memoryConflictStore.entries()) {
        if (v.tripId === tripId) memoryConflictStore.delete(k);
      }
    }
    return;
  }

  if (!tripId) {
    await conflictTx<void>('readwrite', (store, resolve) => {
      store.clear();
      resolve();
    });
  } else {
    const all = await getConflictBackups(tripId);
    await conflictTx<void>('readwrite', (store, resolve) => {
      for (const r of all) {
        store.delete(r.id);
      }
      resolve();
    });
  }
}
