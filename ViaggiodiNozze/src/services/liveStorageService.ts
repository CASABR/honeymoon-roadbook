import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

export const MAX_LIVE_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    throw new Error('Formato immagine non valido.');
  }
  const match = parts[0].match(/:(.*?);/);
  const mime = match ? match[1] : 'image/jpeg';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

export interface LivePhotoUploadResult {
  downloadUrl: string;
  photoId: string;
  path: string;
}

/**
 * Carica un'immagine su Firebase Storage nel percorso dedicato del viaggio.
 * L'URL pubblico generato è compatibile con le regole di sicurezza Storage e con Firestore live updates.
 */
export async function uploadLivePhoto(
  tripId: string,
  source: File | Blob | string,
  photoId?: string
): Promise<LivePhotoUploadResult> {
  if (!tripId || !tripId.trim()) {
    throw new Error('Identificativo viaggio mancante: impossibile caricare la foto.');
  }

  if (!storage) {
    throw new Error('Servizio di archiviazione foto non inizializzato.');
  }

  let blob: Blob;
  let mimeType = 'image/jpeg';

  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      blob = dataUrlToBlob(source);
      mimeType = blob.type || 'image/jpeg';
    } else {
      throw new Error('Formato sorgente foto non supportato.');
    }
  } else {
    blob = source;
    mimeType = source.type || 'image/jpeg';
  }

  if (blob.size >= MAX_LIVE_PHOTO_BYTES) {
    throw new Error(`L'immagine (${Math.round(blob.size / 1024)} KB) supera il limite consentito di 5 MB.`);
  }

  // Normalizza MIME per restrizioni storage.rules (jpeg, png, webp, gif)
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) {
    throw new Error('Formato immagine non supportato. Usa JPEG, PNG, WebP o GIF.');
  }

  const cleanPhotoId = (photoId || `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `trips/${tripId}/live_photos/${cleanPhotoId}.${extension}`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, {
    contentType: mimeType,
    cacheControl: 'private, no-store, max-age=0',
    customMetadata: {
      tripId,
      uploadedAt: new Date().toISOString()
    }
  });

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    downloadUrl,
    photoId: cleanPhotoId,
    path: storagePath
  };
}

/**
 * Rimuove un'immagine caricata nel percorso Live su Firebase Storage (es. revoca condivisione).
 */
export async function deleteLivePhoto(tripId: string, photoIdOrUrl: string): Promise<boolean> {
  if (!tripId || !photoIdOrUrl || !storage) throw new Error('Impossibile revocare la foto: Storage non disponibile.');
  try {
    let storageRef;
    if (photoIdOrUrl.startsWith('https://')
        || (import.meta.env.DEV && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(photoIdOrUrl))) {
      storageRef = ref(storage, photoIdOrUrl);
    } else {
      const cleanPhotoId = photoIdOrUrl.replace(/[^a-zA-Z0-9_-]/g, '_');
      storageRef = ref(storage, `trips/${tripId}/live_photos/${cleanPhotoId}.jpg`);
    }
    const prefix = `trips/${tripId}/live_photos/`;
    if (storageRef.bucket !== ref(storage).bucket || !storageRef.fullPath.startsWith(prefix)
        || storageRef.fullPath.slice(prefix.length).includes('/')) {
      throw new Error('La foto non appartiene allo spazio LIVE di questo viaggio.');
    }
    await deleteObject(storageRef);
    return true;
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') return true;
    throw new Error('Revoca della foto non confermata. Riprova online.', { cause: err });
  }
}


