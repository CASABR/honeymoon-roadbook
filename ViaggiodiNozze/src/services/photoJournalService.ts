import { auth } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';

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
  localStorage.setItem(GALLERY_KEY, JSON.stringify(photos.slice(0, 30)));
  window.dispatchEvent(new CustomEvent('hounigo_journal_photos_changed'));
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
    liveUpdateId: existing?.liveUpdateId
  };
  const updated = [photo, ...readGallery().filter((item) => item.id !== photo.id)];
  writeGallery(updated);
  localStorage.setItem(LAST_PHOTO_KEY, JSON.stringify({
    dataUrl,
    caption: photo.caption,
    timestamp: new Date(photo.timestamp).toISOString()
  }));
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
  return typeof localStorage !== 'undefined' && localStorage.getItem(dismissKey(tripId, userId)) === 'true';
}

export function dismissPredeparturePrompt(tripId: string, userId = getJournalUserId()): void {
  localStorage.setItem(dismissKey(tripId, userId), 'true');
}
