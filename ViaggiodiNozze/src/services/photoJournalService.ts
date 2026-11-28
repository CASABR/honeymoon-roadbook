import { auth } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';
import { storageService } from '../storage/storageService';
import { readArchivedPredeparturePhoto, writeArchivedPredeparturePhoto } from './predeparturePhotoArchive';

const GALLERY_KEY = 'hounigo_live_gallery';
const LAST_PHOTO_KEY = 'live_last_photo';
const DISMISS_PREFIX = 'hounigo_predeparture_photo_dismissed';

export interface JournalPhotoRecord {
  id: string;
  url: string;
  caption?: string;
  captionUpdatedAt?: number;
  location?: string;
  timestamp: number;
  isCustom: true;
  tripId: string;
  userId: string;
  kind?: 'predeparture' | 'journal';
  liveUpdateId?: string;
  exifStripped?: boolean;
}

function readGallery(): JournalPhotoRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGallery(photos: JournalPhotoRecord[]): void {
  const sliced = photos.slice(0, 30);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(sliced));
  }
  // Unshared photographs stay on this device. Only explicit LIVE publication
  // may upload an image; never mirror the private gallery into shared settings.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hounigo_journal_photos_changed'));
  }
}

export function getJournalUserId(): string {
  return auth?.currentUser?.uid || getOrCreateDeviceId();
}

export function getPredeparturePhoto(tripId: string, userId = getJournalUserId()): JournalPhotoRecord | null {
  return readGallery().find((photo) => photo.tripId === tripId && photo.userId === userId && photo.kind === 'predeparture') || null;
}

/** Prefer the independent private archive; migrate only an exactly scoped legacy record. */
export async function loadPredeparturePhoto(tripId: string, userId = getJournalUserId()): Promise<JournalPhotoRecord | null> {
  const archived = await readArchivedPredeparturePhoto(tripId, userId).catch(() => null);
  const gallery = getPredeparturePhoto(tripId, userId);
  const existing = gallery && (!archived || gallery.timestamp > archived.timestamp ||
    (gallery.id === archived.id && (gallery.captionUpdatedAt || 0) > (archived.captionUpdatedAt || 0))) ? gallery : archived || gallery;
  if (existing) {
    if (existing !== archived) await writeArchivedPredeparturePhoto(existing).catch(() => {});
    return existing;
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(LAST_PHOTO_KEY) || 'null');
    if (legacy?.tripId === tripId && legacy.userId === userId && legacy.caption === 'Foto pre-partenza'
      && typeof legacy.dataUrl === 'string' && legacy.dataUrl.startsWith('data:image/')) {
      const recovered: JournalPhotoRecord = {
        id: 'predeparture_recovered', tripId, userId, url: legacy.dataUrl, caption: legacy.caption,
        timestamp: Date.parse(legacy.timestamp) || Date.now(), isCustom: true, kind: 'predeparture', exifStripped: true
      };
      await writeArchivedPredeparturePhoto(recovered).catch(() => {});
      return recovered;
    }
  } catch {}
  return null;
}

async function persistPredepartureRecord(photo: JournalPhotoRecord): Promise<void> {
  // Success requires at least one durable device-local copy. Do not duplicate large images in LAST_PHOTO_KEY.
  let archived = false;
  try { await writeArchivedPredeparturePhoto(photo); archived = true; } catch {}
  try {
    writeGallery([photo, ...readGallery().filter(item => !(item.kind === 'predeparture' && item.tripId === photo.tripId && item.userId === photo.userId))]);
  } catch (error) {
    if (!archived) throw error;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hounigo_journal_photos_changed'));
  }
}

export async function savePredeparturePhotoDurably(tripId: string, dataUrl: string, userId = getJournalUserId()): Promise<JournalPhotoRecord> {
  const existing = await loadPredeparturePhoto(tripId, userId);
  if (existing?.url === dataUrl) return existing;
  const photo: JournalPhotoRecord = {
    id: `predeparture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url: dataUrl, caption: 'Foto pre-partenza', timestamp: Date.now(), isCustom: true,
    tripId, userId, kind: 'predeparture', exifStripped: true
  };
  await persistPredepartureRecord(photo);
  return photo;
}

/** Private caption edit: never upload or alter an existing public post implicitly. */
export async function updatePredepartureCaption(photo: JournalPhotoRecord, caption: string): Promise<JournalPhotoRecord> {
  if (photo.userId !== getJournalUserId()) throw new Error('Sessione cambiata.');
  const current = await loadPredeparturePhoto(photo.tripId, photo.userId);
  if (!current || current.id !== photo.id || current.url !== photo.url || current.userId !== getJournalUserId()) {
    throw new Error('Foto ricordo cambiata: riaprila prima di modificare la didascalia.');
  }
  const clean = caption.trim().slice(0, 300);
  const updated = { ...current, caption: clean || 'Foto pre-partenza',
    captionUpdatedAt: Math.max(Date.now(), (current.captionUpdatedAt || 0) + 1) };
  await persistPredepartureRecord(updated);
  return updated;
}

export async function linkPredeparturePhotoToLive(photo: JournalPhotoRecord, liveUpdateId: string): Promise<JournalPhotoRecord> {
  const current = await loadPredeparturePhoto(photo.tripId, photo.userId);
  if (!current || current.id !== photo.id || current.url !== photo.url) throw new Error('Foto ricordo cambiata: controlla il diario LIVE.');
  const updated = { ...current, liveUpdateId };
  await persistPredepartureRecord(updated);
  return updated;
}

export function savePredeparturePhoto(tripId: string, dataUrl: string, userId = getJournalUserId()): JournalPhotoRecord {
  const existing = getPredeparturePhoto(tripId, userId);
  const photo: JournalPhotoRecord = {
    id: existing?.id || `predeparture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url: dataUrl,
    caption: 'Foto pre-partenza',
    timestamp: existing?.timestamp || Date.now(),
    isCustom: true,
    tripId,
    userId,
    kind: 'predeparture',
    liveUpdateId: existing?.liveUpdateId,
    exifStripped: true
  };
  const updated = [photo, ...readGallery().filter((item) => item.id !== photo.id)];
  writeGallery(updated);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_PHOTO_KEY, JSON.stringify({
      tripId,
      userId,
      dataUrl,
      caption: photo.caption,
      timestamp: new Date(photo.timestamp).toISOString()
    }));
  }
  return photo;
}

export function setPredepartureLiveUpdate(tripId: string, liveUpdateId?: string, userId = getJournalUserId()): JournalPhotoRecord | null {
  const photos = readGallery();
  const index = photos.findIndex((photo) => photo.tripId === tripId && photo.userId === userId && photo.kind === 'predeparture');
  if (index < 0) return null;
  const updatedPhoto = { ...photos[index], liveUpdateId };
  photos[index] = updatedPhoto;
  writeGallery(photos);
  return updatedPhoto;
}

function dismissKey(tripId: string, userId: string): string {
  return `${DISMISS_PREFIX}:${tripId}:${userId}`;
}

// Device-local override only: never change the dismissal on another device.
function restoreKey(tripId: string, userId: string): string {
  return `${DISMISS_PREFIX}:restored:${tripId}:${userId}`;
}

export function restorePredeparturePrompt(tripId: string, userId = getJournalUserId()): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(restoreKey(tripId, userId), 'true');
  }
}

function isPredeparturePromptRestored(tripId: string, userId: string): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(restoreKey(tripId, userId)) === 'true';
}

export function isPredeparturePromptDismissed(tripId: string, userId = getJournalUserId()): boolean {
  if (isPredeparturePromptRestored(tripId, userId)) return false;
  return typeof localStorage !== 'undefined' && (
    localStorage.getItem(dismissKey(tripId, userId)) === 'true' ||
    localStorage.getItem(`${DISMISS_PREFIX}:${tripId}`) === 'true'
  );
}

export async function isPredeparturePromptDismissedAsync(tripId: string, userId = getJournalUserId()): Promise<boolean> {
  if (isPredeparturePromptRestored(tripId, userId)) return false;
  if (isPredeparturePromptDismissed(tripId, userId)) return true;
  try {
    const idbDismissed = await storageService.getSetting<boolean>(dismissKey(tripId, userId));
    if (idbDismissed && !isPredeparturePromptRestored(tripId, userId)) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(dismissKey(tripId, userId), 'true');
      }
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function dismissPredeparturePrompt(tripId: string, userId = getJournalUserId()): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(restoreKey(tripId, userId));
    localStorage.setItem(dismissKey(tripId, userId), 'true');
    localStorage.setItem(`${DISMISS_PREFIX}:${tripId}`, 'true');
  }
  storageService.saveSetting(dismissKey(tripId, userId), true).catch(() => {});
}
