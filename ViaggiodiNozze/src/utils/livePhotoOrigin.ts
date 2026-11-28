/** Existing public title/text fields provide a deliberately non-sensitive origin marker. */
export const TRIP_PHOTO_TITLE = 'Foto dalla tappa';
export const PREDEPARTURE_PHOTO_TITLE = 'Foto ricordo pre-partenza';
export function publicPhotoCaption(update: { title?: string; text?: string }, fallback: string): string {
  return (update.title === PREDEPARTURE_PHOTO_TITLE ? update.text || update.title : update.title || update.text) || fallback;
}
export function isTripPhotoOrigin(photo: { caption?: string; title?: string; text?: string; kind?: string }): boolean {
  return photo.kind === 'predeparture' || photo.caption === 'Foto pre-partenza'
    || photo.title === PREDEPARTURE_PHOTO_TITLE || photo.title === TRIP_PHOTO_TITLE || photo.caption === TRIP_PHOTO_TITLE
    || photo.title === 'Si parte! 📸' && photo.text === 'La foto ricordo pre-partenza è stata aggiunta al diario di viaggio.';
}
export function localPhotoHiddenKey(tripId: string, userId: string): string {
  return 'hounigo_live_hidden_photos:' + JSON.stringify([tripId, userId]);
}
export function readHiddenLocalPhotos(tripId: string, userId: string): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(localPhotoHiddenKey(tripId,userId)) || '[]');
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}
export function hideLocalPhotos(tripId: string, userId: string, ids: string[]): void {
  localStorage.setItem(localPhotoHiddenKey(tripId,userId), JSON.stringify([...new Set([...readHiddenLocalPhotos(tripId,userId), ...ids])]));
}
