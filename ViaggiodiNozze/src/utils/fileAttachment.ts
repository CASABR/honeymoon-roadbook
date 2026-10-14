import type { TransportAttachment } from '../types';

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
 * convertendo data URL in Object URL blob temporaneo per massima compatibilità (desktop & mobile).
 */
export function openAttachmentInNewTab(dataUrl: string, fileName = 'documento.pdf'): void {
  try {
    let targetUrl = dataUrl;
    let revokeNeeded = false;

    if (dataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(dataUrl);
      targetUrl = URL.createObjectURL(blob);
      revokeNeeded = true;
    }

    const win = window.open(targetUrl, '_blank');
    if (!win) {
      // Fallback in caso di blocco popup del browser: download diretto
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    if (revokeNeeded) {
      setTimeout(() => URL.revokeObjectURL(targetUrl), 60000);
    }
  } catch (err) {
    console.error('Errore apertura documento:', err);
    // Fallback estremo download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Converte un File in Base64 Data URL.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
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
 * Elabora un file (immagine o PDF) con limite fino a 25 MB e compressione automatica.
 */
export async function processFileForAttachment(file: File): Promise<TransportAttachment> {
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Megabyte

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Il file "${file.name}" supera il limite massimo di 25 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new Error('Formato non supportato. Carica immagini (PNG, JPG, WebP) o documenti PDF.');
  }

  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const createdAt = new Date().toISOString();

  if (isPdf) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id,
      name: file.name,
      type: 'pdf',
      dataUrl,
      size: file.size,
      createdAt
    };
  }

  // Per immagini: se pesano meno di 600 KB, conserviamo l'originale senza ricodifica
  if (file.size < 600 * 1024) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id,
      name: file.name,
      type: 'image',
      dataUrl,
      size: file.size,
      createdAt
    };
  }

  // Altrimenti ottimizziamo via Canvas ad alta risoluzione
  try {
    const optimized = await compressImageWithCanvas(file, 2048, 0.88);
    return {
      id,
      name: file.name,
      type: 'image',
      dataUrl: optimized.dataUrl,
      size: optimized.size,
      createdAt
    };
  } catch (err) {
    console.warn('Ottimizzazione automatica fallita, salvo file originale:', err);
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id,
      name: file.name,
      type: 'image',
      dataUrl,
      size: file.size,
      createdAt
    };
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
