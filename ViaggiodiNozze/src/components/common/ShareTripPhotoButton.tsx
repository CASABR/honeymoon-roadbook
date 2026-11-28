import { useRef, useState } from 'react';
import type { TransportAttachment } from '../../types';
import { getTripConfig } from '../../utils/tripConfig';
import { useDeviceRole } from '../../utils/useDeviceRole';

export function isShareableTripPhoto(attachment: TransportAttachment): boolean {
  // A voucher, QR code or generic image attachment is never offered for public sharing.
  return attachment.purpose === 'photo' && attachment.type === 'image'
    && /^data:image\/(jpeg|png|webp|heic|heif);base64,/i.test(attachment.dataUrl || '');
}

export default function ShareTripPhotoButton({ photo }: { photo: TransportAttachment }) {
  const { canEdit } = useDeviceRole();
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [shared, setShared] = useState(false);
  const [message, setMessage] = useState('');
  if (!canEdit || !isShareableTripPhoto(photo)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
      <button type="button" data-testid="share-trip-photo-live"
        disabled={sending || shared}
        className="min-h-10 rounded-xl border border-[#FF6B5F]/40 px-3 py-1.5 text-xs font-bold text-[#B83F36] dark:text-[#FF9A90] disabled:opacity-60"
        onClick={async e => {
          e.stopPropagation();
          if (busy.current || shared) return;
          if (!navigator.onLine) { setMessage('Foto conservata nella tappa. Riprova quando sei online.'); return; }
          if (!window.confirm('Pubblicare questa foto nel LIVE pubblico? Controlla che non contenga documenti o informazioni private.')) return;
          const tripId = getTripConfig()?.id;
          if (!tripId) { setMessage('Viaggio non configurato.'); return; }
          busy.current = true;
          setSending(true);
          setMessage('');
          try {
            const { liveService } = await import('../../services/liveService');
            const { uploadLivePhoto } = await import('../../services/liveStorageService');
            const uploaded = await uploadLivePhoto(tripId, photo.dataUrl);
            await liveService.publishToLive(tripId, { title: 'Foto dal viaggio', text: '', photoUrl: uploaded.downloadUrl });
            setShared(true);
            setMessage('Foto pubblicata nel LIVE.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Pubblicazione non riuscita. La foto resta nella tappa.');
          } finally {
            busy.current = false;
            setSending(false);
          }
        }}>
        {sending ? 'Pubblicazione…' : shared ? '✓ Condivisa nel LIVE' : '📡 Invia foto al LIVE'}
      </button>
      {message && <span role="status" className="text-[11px] text-slate-600 dark:text-slate-300">{message}</span>}
    </div>
  );
}

export function TripPhotoShareActions({ attachments }: { attachments?: TransportAttachment[] }) {
  const photos = (attachments || []).filter(isShareableTripPhoto);
  if (!photos.length) return null;
  return <div className="space-y-2">
    {photos.map(photo => <div key={photo.id} className="flex items-center gap-2">
      {photos.length > 1 && <img src={photo.dataUrl} alt="Foto da condividere" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
      <ShareTripPhotoButton photo={photo} />
    </div>)}
  </div>;
}
