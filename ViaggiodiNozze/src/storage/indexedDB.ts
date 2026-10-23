/**
 * Wrapper asincrono e leggero per IndexedDB nativo (0 dipendenze esterne).
 * Isolato all'interno del layer di storage.
 */
const DB_NAME = 'ViaggiodiNozzeDB';
const MASTER_TRIP_ID = '0000';
const DB_VERSION = 8;

export const STORES = {
  GIORNI: 'giorni',
  ATTIVITA: 'attivita',
  ALLOGGI: 'alloggi',
  TRASPORTI: 'trasporti',
  DOCUMENTI: 'documenti',
  ROUTES: 'routes',
  TAPPE: 'tappe',
  RISTORANTI: 'ristoranti',
  SHOPPING: 'shopping',
  SPESE: 'spese',
  NOTE: 'note',
  BAGAGLI: 'bagagli',
  SETTINGS: 'settings'
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

const dbPromises = new Map<string, Promise<IDBDatabase>>();

function getActiveTripId(): string {
  if (typeof localStorage === 'undefined') return MASTER_TRIP_ID;
  try {
    const config = JSON.parse(localStorage.getItem('roadbook_trip_config') || '{}');
    const tripId = String(config?.id || MASTER_TRIP_ID).trim();
    return tripId || MASTER_TRIP_ID;
  } catch {
    return MASTER_TRIP_ID;
  }
}

function getDatabaseName(tripId: string): string {
  // Il database storico non cambia nome: nessuna migrazione o scrittura sui dati di 0000.
  if (tripId === MASTER_TRIP_ID || tripId === 'default') return DB_NAME;
  return `${DB_NAME}_${encodeURIComponent(tripId)}`;
}

function openDatabase(tripIdOverride?: string): Promise<IDBDatabase> {
  const tripId = tripIdOverride || getActiveTripId();
  const dbName = getDatabaseName(tripId);
  const existing = dbPromises.get(dbName);
  if (existing) return existing;

  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB non disponibile in questo ambiente'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout connessione IndexedDB (2000ms)'));
    }, 2000);

    const request = window.indexedDB.open(dbName, DB_VERSION);

    request.onblocked = () => {
      console.warn('IndexedDB bloccato da una versione precedente aperta.');
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.GIORNI)) {
        const store = db.createObjectStore(STORES.GIORNI, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ATTIVITA)) {
        const store = db.createObjectStore(STORES.ATTIVITA, { keyPath: 'id' });
        store.createIndex('dayId', 'dayId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ALLOGGI)) {
        const store = db.createObjectStore(STORES.ALLOGGI, { keyPath: 'id' });
        store.createIndex('checkIn', 'checkIn', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.TRASPORTI)) {
        const store = db.createObjectStore(STORES.TRASPORTI, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.DOCUMENTI)) {
        const store = db.createObjectStore(STORES.DOCUMENTI, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ROUTES)) {
        db.createObjectStore(STORES.ROUTES, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.TAPPE)) {
        const store = db.createObjectStore(STORES.TAPPE, { keyPath: 'id' });
        store.createIndex('data', 'data', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.RISTORANTI)) {
        const store = db.createObjectStore(STORES.RISTORANTI, { keyPath: 'id' });
        store.createIndex('data', 'data', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SHOPPING)) {
        const store = db.createObjectStore(STORES.SHOPPING, { keyPath: 'id' });
        store.createIndex('data', 'data', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SPESE)) {
        const store = db.createObjectStore(STORES.SPESE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.NOTE)) {
        const store = db.createObjectStore(STORES.NOTE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.BAGAGLI)) {
        const store = db.createObjectStore(STORES.BAGAGLI, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve(request.result);
    };

    request.onerror = () => {
      clearTimeout(timeoutId);
      reject(request.error || new Error('Impossibile aprire il database IndexedDB'));
    };
  });

  dbPromises.set(dbName, dbPromise);
  return dbPromise;
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(storeName: StoreName, id: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Legge un backup dal database del viaggio indicato, senza alterare il viaggio attivo. */
export async function idbGetForTrip<T>(tripId: string, storeName: StoreName, id: string): Promise<T | undefined> {
  const db = await openDatabase(tripId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPut<T>(storeName: StoreName, item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function idbDelete(storeName: StoreName, id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function idbClear(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await openDatabase();
  const allStores = Object.values(STORES);
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(allStores, 'readwrite');
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    
    allStores.forEach(storeName => {
      tx.objectStore(storeName).clear();
    });
  });
}
