import { auth } from '../firebase';
import { HOUNIAI_WORKER_URL } from '../config/freeArchitecture';
import { compressLivePhoto, MAX_COMPRESSED_LIVE_BYTES } from '../utils/livePhotoImage';
export { dataUrlToBlob } from '../utils/fileAttachment';

export const MAX_LIVE_PHOTO_BYTES = MAX_COMPRESSED_LIVE_BYTES;
const configured = (import.meta.env.VITE_LIVE_PHOTOS_WORKER_URL || HOUNIAI_WORKER_URL).trim();
export const LIVE_PHOTO_ORIGIN = /^https:\/\//.test(configured) ? new URL(configured).origin : '';
export interface LivePhotoUploadResult { downloadUrl: string; photoId: string; path: string }

function photoUrl(tripId: string, value: string): URL {
  if (!LIVE_PHOTO_ORIGIN || !/^[A-Za-z0-9_-]{1,128}$/.test(tripId)) throw new Error('Foto LIVE non ancora attivate. La foto resta sul dispositivo.');
  const url = new URL(value);
  if (url.origin !== LIVE_PHOTO_ORIGIN || !new RegExp(`^/v1/live-photos/${tripId}/[a-f0-9]{48}$`).test(url.pathname) || url.search || url.hash) {
    throw new Error('La foto non appartiene allo spazio LIVE di questo viaggio.');
  }
  return url;
}
async function mutate(url: string, method: string, body?: Blob): Promise<any> {
  await auth?.authStateReady?.();
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) throw new Error('Accedi come Owner o Copilota per pubblicare foto.');
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error('Sessione cambiata. La foto resta sul dispositivo.');
  const response = await fetch(url, { method, body, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'image/jpeg' } : {}) } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Foto non pubblicata. La foto resta sul dispositivo; riprova online.');
  return result;
}
/** Explicit publication intent only. Binary upload stays pending/private. */
export async function uploadLivePhoto(tripId: string, source: File | Blob | string, _photoId?: string, expectedUid?: string): Promise<LivePhotoUploadResult> {
  if (!LIVE_PHOTO_ORIGIN || !/^[A-Za-z0-9_-]{1,128}$/.test(tripId)) throw new Error('Foto LIVE non ancora attivate. La foto resta sul dispositivo.');
  await auth?.authStateReady?.();
  const uploadUid = auth?.currentUser?.uid;
  if (!uploadUid || auth.currentUser?.isAnonymous) throw new Error('Accedi come Owner o Copilota per pubblicare foto.');
  if (expectedUid && expectedUid !== uploadUid) throw new Error('Questa foto locale appartiene a un’altra sessione.');
  const compressed = await compressLivePhoto(source);
  if (auth.currentUser?.uid !== uploadUid) throw new Error('Sessione cambiata. La foto resta sul dispositivo.');
  const result = await mutate(`${LIVE_PHOTO_ORIGIN}/v1/live-photos/${tripId}`, 'POST', compressed);
  photoUrl(tripId, result.downloadUrl);
  return result;
}
/** Public only after the server verifies the corresponding Firestore LIVE post. */
export async function confirmLivePhotoPublication(tripId: string, downloadUrl: string, postId: string): Promise<void> {
  const url = photoUrl(tripId, downloadUrl);
  const result = await mutate(`${url}/publish?postId=${encodeURIComponent(postId)}`, 'POST');
  if (result.published !== true) throw new Error('Pubblicazione della foto non confermata.');
}
export function isManagedLivePhoto(value: string): boolean {
  try { const u = new URL(value); return u.origin === LIVE_PHOTO_ORIGIN && u.pathname.startsWith('/v1/live-photos/'); } catch { return false; }
}
export async function deleteLivePhoto(tripId: string, photoIdOrUrl: string): Promise<boolean> {
  const url = photoUrl(tripId, photoIdOrUrl);
  const result = await mutate(String(url), 'DELETE');
  if (result.revoked !== true) throw new Error('Revoca della foto non confermata. Riprova online.');
  return true;
}
