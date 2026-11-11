import { auth } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';
import { storageService } from '../storage/storageService';

const GALLERY_KEY = 'hounigo_live_gallery';
const LAST_PHOTO_KEY = 'live_last_photo';
const DISMISS_PREFIX = 'hounigo_predeparture_photo_dismissed';

export interface JournalPhotoRecord {
  id: string;
  url: string;
  caption?: string;
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

export function isPredeparturePromptDismissed(tripId: string, userId = getJournalUserId()): boolean {
  return typeof localStorage !== 'undefined' && (
    localStorage.getItem(dismissKey(tripId, userId)) === 'true' ||
    localStorage.getItem(`${DISMISS_PREFIX}:${tripId}`) === 'true'
  );
}

export async function isPredeparturePromptDismissedAsync(tripId: string, userId = getJournalUserId()): Promise<boolean> {
  if (isPredeparturePromptDismissed(tripId, userId)) return true;
  try {
    const idbDismissed = await storageService.getSetting<boolean>(dismissKey(tripId, userId));
    if (idbDismissed) {
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
    localStorage.setItem(dismissKey(tripId, userId), 'true');
    localStorage.setItem(`${DISMISS_PREFIX}:${tripId}`, 'true');
  }
  storageService.saveSetting(dismissKey(tripId, userId), true).catch(() => {});
}
