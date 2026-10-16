import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { TransportAttachment } from '../types';

/**
 * Dimensione massima per singolo chunk Base64 (600 KB).
 * Rimane ampiamente al di sotto del limite di 1 MB per documento Firestore.
 */
const CHUNK_SIZE_CHARS = 600 * 1024;

export interface RemoteAttachmentMeta {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  size: number;
  createdAt: string;
  isChunked: boolean;
  totalChunks: number;
}

/**
 * Salva i chunk di un allegato di grandi dimensioni nella sottocollezione documenti di Firestore.
 */
export async function uploadAttachmentChunks(
  tripId: string,
  attachment: TransportAttachment
): Promise<RemoteAttachmentMeta> {
  const dataUrl = attachment.dataUrl || '';
  const totalLength = dataUrl.length;

  // Se è inferiore a CHUNK_SIZE_CHARS e la dimensione totale permette di stare inline nel documento genitore
  // (es. < 300 KB), restituiamo metadato con 0 chunk
  if (totalLength < 300 * 1024) {
    return {
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      createdAt: attachment.createdAt,
      isChunked: false,
      totalChunks: 0
    };
  }

  const numChunks = Math.ceil(totalLength / CHUNK_SIZE_CHARS);

  for (let i = 0; i < numChunks; i++) {
    const chunkStart = i * CHUNK_SIZE_CHARS;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE_CHARS, totalLength);
    const chunkPiece = dataUrl.substring(chunkStart, chunkEnd);

    const chunkDocRef = doc(db, 'trips', tripId, 'documenti', `att_chunk_${attachment.id}_${i}`);
    await setDoc(chunkDocRef, {
      attachmentId: attachment.id,
      index: i,
      totalChunks: numChunks,
      dataPiece: chunkPiece,
      updatedAt: Date.now()
    }, { merge: true });
  }

  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    createdAt: attachment.createdAt,
    isChunked: true,
    totalChunks: numChunks
  };
}

/**
 * Ricompone un allegato scaricando i suoi chunk da Firestore.
 */
export async function downloadAttachmentFromChunks(
  tripId: string,
  meta: RemoteAttachmentMeta
): Promise<TransportAttachment | null> {
  try {
    if (!meta.isChunked || meta.totalChunks <= 0) {
      return null;
    }

    const chunkPromises = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkDocRef = doc(db, 'trips', tripId, 'documenti', `att_chunk_${meta.id}_${i}`);
      chunkPromises.push(getDoc(chunkDocRef));
    }

    const chunkSnaps = await Promise.all(chunkPromises);
    const pieces: string[] = [];

    for (let i = 0; i < chunkSnaps.length; i++) {
      const snap = chunkSnaps[i];
      if (!snap.exists()) {
        console.warn(`[AttachmentChunkService] Chunk mancante att_chunk_${meta.id}_${i}`);
        return null;
      }
      pieces.push(snap.data()?.dataPiece || '');
    }

    const fullDataUrl = pieces.join('');

    return {
      id: meta.id,
      name: meta.name,
      type: meta.type,
      size: meta.size,
      createdAt: meta.createdAt,
      dataUrl: fullDataUrl
    };
  } catch (err) {
    console.error(`[AttachmentChunkService] Errore ricomposizione allegato ${meta.id}:`, err);
    return null;
  }
}

/**
 * Elimina tutti i chunk di un allegato da Firestore.
 */
export async function deleteAttachmentChunks(
  tripId: string,
  attachmentId: string,
  totalChunks: number
): Promise<void> {
  try {
    const deletePromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkDocRef = doc(db, 'trips', tripId, 'documenti', `att_chunk_${attachmentId}_${i}`);
      deletePromises.push(deleteDoc(chunkDocRef).catch(() => {}));
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn(`[AttachmentChunkService] Errore eliminazione chunk ${attachmentId}:`, err);
  }
}
