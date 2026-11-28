import { auth } from '../firebase';
import { liveService, getStableLivePhoto, ensureStablePhotoVisible, verifyPrivilegedLivePublisher } from './liveService';
import { uploadLivePhoto, deleteLivePhoto } from './liveStorageService';
import { getTripConfig } from '../utils/tripConfig';

type Result = { postId: string; downloadUrl: string };
type PhotoInfo = { title: string; text?: string; locationName?: string };
const inFlight = new Map<string, Promise<Result>>();

export async function stableLivePhotoId(normalizedDataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedDataUrl);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'photo_' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Explicit publication only; same normalized image shares one post per trip, including retries. */
export async function publishLivePhotoOnce(tripId: string, normalizedDataUrl: string, info: PhotoInfo,
  expectedUid: string, mayContinue: () => boolean = () => true): Promise<Result> {
  await auth.authStateReady?.();
  const validSession = () => Boolean(auth.currentUser && !auth.currentUser.isAnonymous
    && auth.currentUser.uid === expectedUid && getTripConfig()?.id === tripId && mayContinue());
  if (!validSession()) throw new Error('Sessione o viaggio cambiato. La foto resta sul dispositivo.');
  const { isMember } = await verifyPrivilegedLivePublisher(tripId, expectedUid);
  if (!isMember || !validSession()) throw new Error('Solo Owner e Copilota possono pubblicare nel LIVE.');
  const postId = await stableLivePhotoId(normalizedDataUrl);
  const key = JSON.stringify([tripId, expectedUid, postId]);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = (async () => {
    const existing = await getStableLivePhoto(tripId, postId);
    if (!validSession()) throw new Error('Pubblicazione annullata.');
    if (existing) {
      if (existing.deleted || !existing.photoUrl) throw new Error('Foto già rimossa dal LIVE.');
      await ensureStablePhotoVisible(tripId, existing.photoUrl, postId);
      return { postId, downloadUrl: existing.photoUrl };
    }
    const uploaded = await uploadLivePhoto(tripId, normalizedDataUrl, postId, expectedUid);
    if (!validSession()) {
      if (auth.currentUser?.uid === expectedUid) await deleteLivePhoto(tripId, uploaded.downloadUrl).catch(() => {});
      throw new Error('Pubblicazione annullata o sessione cambiata.');
    }
    await liveService.publishToLive(tripId, { ...info, photoUrl: uploaded.downloadUrl }, {}, postId);
    const published = await getStableLivePhoto(tripId, postId);
    if (!published || published.deleted || !published.photoUrl) throw new Error('Pubblicazione non confermata.');
    return { postId, downloadUrl: published.photoUrl };
  })();
  inFlight.set(key, work);
  try { return await work; } finally { if (inFlight.get(key) === work) inFlight.delete(key); }
}
