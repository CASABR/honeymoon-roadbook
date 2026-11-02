import { useEffect, useRef, useState } from 'react';
import { IMAGE_FILE_ACCEPT, processFileForAttachment } from '../../utils/fileAttachment';
import {
  dismissPredeparturePrompt,
  getJournalUserId,
  getPredeparturePhoto,
  isPredeparturePromptDismissed,
  savePredeparturePhoto,
  setPredepartureLiveUpdate,
  type JournalPhotoRecord
} from '../../services/photoJournalService';

interface PreDeparturePhotoCardProps {
  tripId: string;
  startDate: string;
  canEdit: boolean;
  onOpenLive?: () => void;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function PreDeparturePhotoCard({ tripId, startDate, canEdit, onOpenLive }: PreDeparturePhotoCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [photo, setPhoto] = useState<JournalPhotoRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsVisible(false);
    setPhoto(null);
    setMessage('');
    if (!canEdit || !tripId || !startDate || localDate() !== startDate) return;
    const userId = getJournalUserId();
    if (isPredeparturePromptDismissed(tripId, userId)) return;
    setPhoto(getPredeparturePhoto(tripId, userId));
    setIsVisible(true);
  }, [canEdit, startDate, tripId]);

  if (!isVisible) return null;

  const handleDismiss = () => {
    dismissPredeparturePrompt(tripId);
    setIsVisible(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsSaving(true);
    setMessage('');
    try {
      const attachment = await processFileForAttachment(file);
      const saved = savePredeparturePhoto(tripId, attachment.dataUrl);
      setPhoto(saved);
      setMessage('Foto salvata nel diario di questo dispositivo.');
    } catch {
      setMessage('Non è stato possibile salvare la foto. Riprova con un’immagine più leggera.');
    } finally {
      setIsSaving(false);
      event.target.value = '';
    }
  };

  const handleShare = async () => {
    if (!photo || photo.liveUpdateId) return;
    setIsSharing(true);
    setMessage('');
    try {
      const { liveService } = await import('../../services/liveService');
      const updateId = await liveService.publishToLive(tripId, {
        title: 'Si parte! 📸',
        text: 'La foto pre-partenza è stata aggiunta al nostro diario di viaggio.'
      });
      const updated = setPredepartureLiveUpdate(tripId, updateId);
      if (updated) setPhoto(updated);
      setMessage('Cartolina condivisa in LIVE.');
    } catch {
      setMessage('Condivisione non riuscita. Verifica la connessione e i permessi del viaggio.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveShare = async () => {
    if (!photo?.liveUpdateId) return;
    setIsSharing(true);
    setMessage('');
    try {
      const { liveService } = await import('../../services/liveService');
      await liveService.deleteLiveUpdate(tripId, photo.liveUpdateId);
      const updated = setPredepartureLiveUpdate(tripId, undefined);
      if (updated) setPhoto(updated);
      setMessage('Condivisione rimossa da LIVE; la foto resta nel diario.');
    } catch {
      setMessage('Non è stato possibile rimuovere la condivisione. Riprova online.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#FF6B5F]/25 bg-[#FFF0ED]/70 p-4 shadow-xs dark:bg-rose-950/20 dark:border-[#FF6B5F]/30">
      <button type="button" onClick={handleDismiss} className="absolute right-2.5 top-2.5 h-8 w-8 rounded-full text-slate-400 hover:bg-white/80 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Ignora definitivamente questo suggerimento">×</button>
      <div className="pr-8 flex gap-3">
        {photo ? (
          <img src={photo.url} alt="Foto pre-partenza" className="h-20 w-20 shrink-0 rounded-2xl object-cover border border-white shadow-sm" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="13" r="3.5"/></svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#172033] dark:text-white">Si parte! Vuoi scattare la foto pre-partenza?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">La foto resta nel diario sul dispositivo. Potrai aggiungere altri scatti manualmente dalla sezione LIVE.</p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept={IMAGE_FILE_ACCEPT} capture="environment" onChange={handleFileChange} className="hidden" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isSaving} className="min-h-10 rounded-xl bg-[#FF6B5F] px-3.5 text-xs font-bold text-white shadow-sm disabled:opacity-60">
          {isSaving ? 'Salvataggio…' : photo ? 'Sostituisci foto' : 'Scatta o carica'}
        </button>
        {photo && !photo.liveUpdateId && (
          <button type="button" onClick={handleShare} disabled={isSharing} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#172033] disabled:opacity-60 dark:bg-slate-800 dark:text-white dark:border-slate-700">
            ◉ {isSharing ? 'Condivisione…' : 'Condividi in LIVE'}
          </button>
        )}
        {photo?.liveUpdateId && (
          <button type="button" onClick={handleRemoveShare} disabled={isSharing} className="min-h-10 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-600 disabled:opacity-60 dark:bg-slate-800 dark:border-rose-900">
            {isSharing ? 'Rimozione…' : 'Rimuovi da LIVE'}
          </button>
        )}
        {photo && onOpenLive && <button type="button" onClick={onOpenLive} className="min-h-10 px-2 text-xs font-bold text-slate-500 hover:text-[#172033] dark:hover:text-white">Apri diario LIVE →</button>}
      </div>
      {photo && <p className="mt-2 text-[10px] leading-relaxed text-slate-500">LIVE è il diario pubblico per gli invitati. Viene condivisa la cartolina; la foto resta privata sul dispositivo finché non sarà disponibile lo spazio immagini dedicato.</p>}
      {message && <p className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200" role="status">{message}</p>}
    </section>
  );
}
