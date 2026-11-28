import type { JournalPhotoRecord } from './photoJournalService';

// Device-only archive, independent of the bounded LIVE gallery and cloud settings.
const DB = 'hounigo-private-photo-journal';
const STORE = 'predeparture';
const keyFor = (tripId: string, userId: string) => JSON.stringify([tripId, userId]);

async function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Archivio foto temporaneamente occupato.'));
  });
}

export async function readArchivedPredeparturePhoto(tripId: string, userId: string): Promise<JournalPhotoRecord | null> {
  const db = await openArchive();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyFor(tripId, userId));
      request.onsuccess = () => {
        const photo = request.result as JournalPhotoRecord | undefined;
        resolve(photo?.tripId === tripId && photo.userId === userId && photo.kind === 'predeparture' ? photo : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeArchivedPredeparturePhoto(photo: JournalPhotoRecord): Promise<void> {
  const db = await openArchive();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(photo, keyFor(photo.tripId, photo.userId));
    });
  } finally { db.close(); }
}
