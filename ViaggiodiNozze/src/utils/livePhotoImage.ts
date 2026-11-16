import { dataUrlToBlob } from './fileAttachment';
export const MAX_COMPRESSED_LIVE_BYTES = 512000;
/** Redraw pixels: original EXIF and GPS metadata are never copied. */
export async function compressLivePhoto(source: Blob | string): Promise<Blob> {
  const blob = typeof source === 'string' ? dataUrlToBlob(source) : source;
  if (blob.size > 25 * 1024 * 1024) throw new Error('Foto troppo grande. Scegli un’immagine sotto 25 MB.');
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Immagine non leggibile. Usa JPEG, WebP o un formato supportato dal telefono.'));
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('Risoluzione della foto troppo elevata.');
    const canvas = document.createElement('canvas');
    let longest = Math.min(1600, Math.max(image.naturalWidth, image.naturalHeight));
    for (let scale = 0; scale < 4; scale++, longest = Math.round(longest * 0.75)) {
      const ratio = Math.min(1, longest / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Compressione foto non disponibile.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.76, 0.64, 0.5]) {
        const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (result && result.type === 'image/jpeg' && result.size <= MAX_COMPRESSED_LIVE_BYTES) return result;
      }
    }
    throw new Error('Impossibile comprimere la foto sotto 500 KB. Scegli un’immagine più piccola.');
  } finally { URL.revokeObjectURL(url); }
}
export async function compressLivePhotoToDataUrl(source: Blob | string): Promise<string> {
  const blob = await compressLivePhoto(source);
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossibile conservare la foto locale.'));
    reader.readAsDataURL(blob);
  });
}
