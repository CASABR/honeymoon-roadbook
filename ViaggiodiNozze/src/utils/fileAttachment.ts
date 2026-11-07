import type { TransportAttachment } from '../types';

export const IMAGE_FILE_ACCEPT = 'image/*,.heic,.heif';
export const IMAGE_OR_PDF_FILE_ACCEPT = `${IMAGE_FILE_ACCEPT},application/pdf`;

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
};

export function isSupportedImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();
  return normalizedType.startsWith('image/') || SUPPORTED_IMAGE_EXTENSIONS.some(extension => normalizedName.endsWith(extension));
}

function inferFileMimeType(file: Pick<File, 'name' | 'type'>): string {
  const normalizedType = file.type.toLowerCase();
  if (normalizedType && normalizedType !== 'application/octet-stream') return normalizedType;
  const normalizedName = file.name.toLowerCase();
  const extension = Object.keys(IMAGE_MIME_BY_EXTENSION).find(candidate => normalizedName.endsWith(candidate));
  return extension ? IMAGE_MIME_BY_EXTENSION[extension] : 'application/octet-stream';
}

/**
 * Converte un Data URL (base64) in un oggetto Blob nativo con corretto MIME-type.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Apre in sicurezza un allegato (PDF o immagine) in una nuova scheda del browser
 * convertendo Data URL / Base64 in Object URL Blob temporaneo con corretto MIME-type (application/pdf).
 * Garantisce apertura nativa del visualizzatore PDF del browser (desktop & mobile).
 * Se il browser blocca il popup, propone un fallback esplicito e scarica/apre in sicurezza.
 */
export function openAttachmentInNewTab(dataUrl: string, fileName = 'documento.pdf'): boolean {
  if (!dataUrl) {
    console.warn('openAttachmentInNewTab: dataUrl non fornito');
    return false;
  }

  try {
    let targetUrl = dataUrl;
    let revokeNeeded = false;

    // Se è un data URL, converti in Blob con mime type esplicito
    if (dataUrl.startsWith('data:')) {
      const isPdfByName = fileName.toLowerCase().endsWith('.pdf');
      let blob = dataUrlToBlob(dataUrl);
      // Se il nome indica chiaramente che è un PDF ma il MIME era errato o generic octet-stream, forza application/pdf
      if (isPdfByName && blob.type !== 'application/pdf') {
        blob = new Blob([blob], { type: 'application/pdf' });
      }
      targetUrl = URL.createObjectURL(blob);
      revokeNeeded = true;
    }

    // Tenta apertura immediata (sincrona) per non perdere il context dello user gesture
    const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    
    if (!win || win.closed || typeof win.closed === 'undefined') {
      // Il browser ha bloccato il popup: usa fallback con link <a> nascosto
      console.warn('Popup bloccato dal browser per:', fileName);
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Notifica l'interfaccia dell'avvenuto fallback o blocco
      window.dispatchEvent(new CustomEvent('roadbook_attachment_popup_blocked', {
        detail: { fileName, targetUrl }
      }));
    }

    // Mantieni il blob URL in vita per 5 minuti (tempo ampiamente sufficiente per il rendering PDF nativo)
    if (revokeNeeded) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(targetUrl);
        } catch {
          // ignore
        }
      }, 5 * 60 * 1000);
    }

    return true;
  } catch (err) {
    console.error('Errore apertura documento in nuova scheda:', err);
    // Fallback estremo download diretto
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Converte un File in Base64 Data URL.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const inferredMime = inferFileMimeType(file);
      resolve(result.replace(/^data:(?:application\/octet-stream)?;/, `data:${inferredMime};`));
    };
    reader.onerror = () => reject(new Error('Errore durante la lettura del file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Comprime un'immagine usando HTML5 Canvas mantenendo i dettagli e la nitidezza del QR code.
 */
function compressImageWithCanvas(
  file: File,
  maxDimension = 2048,
  quality = 0.88
): Promise<{ dataUrl: string; size: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      // Scala se supera la dimensione massima
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Impossibile ottenere il contesto 2D del Canvas'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Scegli MIME appropriato: PNG preserva nitidezza assoluta, JPEG per foto
      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(outputMime, quality);

      // Calcola dimensione approssimativa in byte dal Base64
      const base64Index = dataUrl.indexOf(';base64,');
      const base64Length = dataUrl.length - (base64Index + 8);
      const calculatedSize = Math.round((base64Length * 3) / 4);

      resolve({ dataUrl, size: calculatedSize });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Impossibile caricare l\'immagine selezionata.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Limite massimo supportato per singolo allegato (5 MB originali).
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_SOURCE_SIZE_BYTES = 20 * 1024 * 1024;

export type AttachmentErrorCode = 
  | 'FILE_TOO_LARGE'
  | 'INVALID_FORMAT'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'READ_ERROR';

export class AttachmentError extends Error {
  code: AttachmentErrorCode;
  constructor(message: string, code: AttachmentErrorCode) {
    super(message);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

/**
 * Verifica affidabile dello spazio di archiviazione locale del browser via StorageManager API.
 * Non inventa percentuali: interroga navigator.storage.estimate().
 */
export async function checkStorageAvailability(requiredBytes: number = 0): Promise<{
  isAvailable: boolean;
  isLowSpace: boolean;
  remainingBytes?: number;
  message?: string;
}> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return { isAvailable: true, isLowSpace: false };
  }

  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota !== undefined && estimate.usage !== undefined) {
      const remainingBytes = Math.max(0, estimate.quota - estimate.usage);

      // Se lo spazio residuo è inferiore a quanto richiesto dal file
      if (requiredBytes > 0 && remainingBytes < requiredBytes) {
        return {
          isAvailable: false,
          isLowSpace: true,
          remainingBytes,
          message: `Spazio di archiviazione locale sul dispositivo insufficiente (${formatFileSize(remainingBytes)} disponibili sul browser, richiesti ${formatFileSize(requiredBytes)}). Libera spazio sul dispositivo per salvare il file.`
        };
      }

      // Se lo spazio residuo è inferiore a 10 MB, segnala spazio quasi esaurito
      if (remainingBytes < 10 * 1024 * 1024) {
        return {
          isAvailable: true,
          isLowSpace: true,
          remainingBytes,
          message: `Spazio di archiviazione locale sul browser in esaurimento (${formatFileSize(remainingBytes)} liberi sul dispositivo).`
        };
      }

      return { isAvailable: true, isLowSpace: false, remainingBytes };
    }
  } catch (err) {
    console.warn('[StorageCheck] Impossibile verificare quota storage:', err);
  }

  return { isAvailable: true, isLowSpace: false };
}

/**
 * Elabora un file (immagine o PDF) con limite di almeno 5 MB e controllo reale dello spazio.
 * Se options.stripExif è true, forza la ricodifica via Canvas per rimuovere metadati EXIF sensibili (GPS, dispositivo).
 */
export async function processFileForAttachment(
  file: File,
  options?: { stripExif?: boolean }
): Promise<TransportAttachment> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = isSupportedImageFile(file);

  if (!isPdf && !isImage) {
    throw new AttachmentError(
      'Formato file non supportato. Carica documenti PDF o immagini (PNG, JPG, WebP, HEIC/HEIF).',
      'INVALID_FORMAT'
    );
  }

  const sourceSizeLimit = isImage ? MAX_IMAGE_SOURCE_SIZE_BYTES : MAX_ATTACHMENT_SIZE_BYTES;
  if (file.size > sourceSizeLimit) {
    throw new AttachmentError(
      `Il file "${file.name}" supera il limite di ${Math.round(sourceSizeLimit / (1024 * 1024))} MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      'FILE_TOO_LARGE'
    );
  }

  // Verifica lo spazio sul browser per accogliere il file
  const storageCheck = await checkStorageAvailability(file.size * 1.5); // margine per Base64
  if (!storageCheck.isAvailable) {
    throw new AttachmentError(
      storageCheck.message || 'Spazio di memoria locale esaurito sul browser.',
      'STORAGE_QUOTA_EXCEEDED'
    );
  }

  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const createdAt = new Date().toISOString();

  if (isPdf) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id,
        name: file.name,
        type: 'pdf',
        dataUrl,
        size: file.size,
        createdAt
      };
    } catch (err) {
      throw new AttachmentError('Impossibile leggere il file PDF selezionato.', 'READ_ERROR');
    }
  }

  // Per immagini: se pesano meno di 600 KB e non è richiesta rimozione EXIF, conserviamo l'originale senza ricodifica
  if (file.size < 600 * 1024 && !options?.stripExif) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id,
        name: file.name,
        type: 'image',
        dataUrl,
        size: file.size,
        createdAt
      };
    } catch (err) {
      throw new AttachmentError('Impossibile leggere l\'immagine selezionata.', 'READ_ERROR');
    }
  }

  // Altrimenti ottimizziamo via Canvas ad alta risoluzione mantenendo ottima nitidezza per QR code
  try {
    const optimized = await compressImageWithCanvas(file, 2048, 0.88);
    if (optimized.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AttachmentError('La foto resta troppo grande dopo l’ottimizzazione. Scegli una versione fino a 5 MB.', 'FILE_TOO_LARGE');
    }
    return {
      id,
      name: file.name,
      type: 'image',
      dataUrl: optimized.dataUrl,
      size: optimized.size,
      createdAt
    };
  } catch (err) {
    if (err instanceof AttachmentError) throw err;
    console.warn('Ottimizzazione automatica fallita, salvo file originale:', err);
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AttachmentError('Il browser non riesce a ottimizzare questa foto. Esportala come JPG/PNG oppure scegline una fino a 5 MB.', 'READ_ERROR');
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id,
        name: file.name,
        type: 'image',
        dataUrl,
        size: file.size,
        createdAt
      };
    } catch (readErr) {
      throw new AttachmentError('Impossibile leggere l\'immagine selezionata.', 'READ_ERROR');
    }
  }
}

/**
 * Formatta i byte in stringa leggibile (KB o MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
