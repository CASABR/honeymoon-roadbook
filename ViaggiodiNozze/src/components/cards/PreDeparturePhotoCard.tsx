import { useEffect, useRef, useState } from 'react';
import { IMAGE_FILE_ACCEPT, processFileForAttachment } from '../../utils/fileAttachment';
import {
  dismissPredeparturePrompt,
  getJournalUserId,
  getPredeparturePhoto,
  isPredeparturePromptDismissed,
  isPredeparturePromptDismissedAsync,
  savePredeparturePhoto,
  restorePredeparturePrompt,
  setPredepartureLiveUpdate,
  type JournalPhotoRecord
} from '../../services/photoJournalService';

interface PreDeparturePhotoCardProps {
  tripId: string;
  startDate: string;
  selectedDate?: string;
  canEdit: boolean;
  onOpenLive?: () => void;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function PreDeparturePhotoCard({ tripId, startDate, selectedDate, canEdit, onOpenLive }: PreDeparturePhotoCardProps) {
  const journalUserId = getJournalUserId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shareOnLiveToggle, setShareOnLiveToggle] = useState(false);
  const [photo, setPhoto] = useState<JournalPhotoRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsVisible(false);
    setCanRestore(false);
    setIsFlipped(false);
    setPhoto(null);
    setMessage('');
    if (!canEdit || !tripId || !startDate) return;

    // Compare SOLO nel Giorno 1 (data di partenza effettiva) e solo per viaggi futuri o nel giorno di partenza
    const isDayOneSelected = !selectedDate || selectedDate === startDate;
    const isFutureOrDepartureDay = localDate() <= startDate;
    if (!isDayOneSelected || !isFutureOrDepartureDay) return;

    const userId = journalUserId;
    if (isPredeparturePromptDismissed(tripId, userId)) {
      setCanRestore(localDate() === startDate);
      return;
    }

    const existingPhoto = getPredeparturePhoto(tripId, userId);
    setPhoto(existingPhoto);
    setShareOnLiveToggle(Boolean(existingPhoto?.liveUpdateId));
    setIsVisible(true);

    let cancelled = false;
    isPredeparturePromptDismissedAsync(tripId, userId).then((dismissed) => {
      if (!cancelled && dismissed) {
        setIsVisible(false);
        setCanRestore(localDate() === startDate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canEdit, startDate, selectedDate, tripId, journalUserId]);

  if (!isVisible) {
    if (!canRestore || !canEdit || localDate() !== startDate || (selectedDate && selectedDate !== startDate)) return null;
    return <button type="button" data-testid="restore-predeparture-photo" className="min-h-10 w-full rounded-xl border border-[#FF6B5F]/30 px-3 py-2 text-xs font-bold text-[#B83F36] dark:text-[#FF9A90]" onClick={() => {
      try {
        restorePredeparturePrompt(tripId, journalUserId);
        const existingPhoto = getPredeparturePhoto(tripId, journalUserId);
        setPhoto(existingPhoto);
        setShareOnLiveToggle(Boolean(existingPhoto?.liveUpdateId));
        setCanRestore(false);
        setIsVisible(true);
      } catch { setMessage('Impossibile ripristinare la foto su questo dispositivo.'); }
    }}>📸 Mostra di nuovo la foto ricordo{message && <span role="status"> · {message}</span>}</button>;
  }

  const handleDismiss = () => {
    dismissPredeparturePrompt(tripId);
    setIsVisible(false);
    setCanRestore(localDate() === startDate);
  };

  const publishPhotoToLive = async (currentPhoto: JournalPhotoRecord) => {
    if (currentPhoto.liveUpdateId) return;
    setIsSharing(true);
    try {
      if (currentPhoto.userId !== getJournalUserId()) throw new Error('Sessione cambiata: riapri la tua foto prima di condividerla.');
      const { liveService } = await import('../../services/liveService');
      const { uploadLivePhoto } = await import('../../services/liveStorageService');
      const photoId = `predeparture_${Date.now()}`;
      const uploadRes = await uploadLivePhoto(tripId, currentPhoto.url, photoId, currentPhoto.userId);
      const updateId = await liveService.publishToLive(tripId, {
        title: 'Si parte! 📸',
        text: 'La foto ricordo pre-partenza è stata aggiunta al diario di viaggio.',
        photoUrl: uploadRes.downloadUrl
      });
      const updated = setPredepartureLiveUpdate(tripId, updateId, currentPhoto.userId);
      if (updated) setPhoto(updated);
      setMessage('Foto salvata (senza dati EXIF) e condivisa in LIVE.');
    } catch (err) {
      setShareOnLiveToggle(false);
      setMessage(err instanceof Error ? `Foto salvata sul dispositivo. ${err.message}` : 'Foto salvata sul dispositivo. Condivisione LIVE non riuscita.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsSaving(true);
    setMessage('');
    try {
      // Ricodifica via Canvas con rimozione garantita dei metadati EXIF sensibili (GPS/dispositivo)
      const attachment = await processFileForAttachment(file, { stripExif: true });
      const saved = savePredeparturePhoto(tripId, attachment.dataUrl);
      setPhoto(saved);
      if (shareOnLiveToggle) {
        await publishPhotoToLive(saved);
      } else {
        setMessage('Foto salvata nel diario di questo dispositivo (metadati EXIF rimossi).');
      }
    } catch {
      setMessage('Non è stato possibile salvare la foto. Riprova con un’immagine più leggera.');
    } finally {
      setIsSaving(false);
      event.target.value = '';
    }
  };

  const handleToggleShareLive = async (checked: boolean) => {
    setShareOnLiveToggle(checked);
    if (!photo) return;
    if (checked && !photo.liveUpdateId) {
      await publishPhotoToLive(photo);
    } else if (!checked && photo.liveUpdateId) {
      setIsSharing(true);
      setMessage('');
      try {
        const { liveService } = await import('../../services/liveService');
        await liveService.deleteLiveUpdate(tripId, photo.liveUpdateId);
        const updated = setPredepartureLiveUpdate(tripId, undefined);
        if (updated) setPhoto(updated);
        setMessage('Condivisione rimossa da LIVE; la foto resta salvata sul dispositivo.');
      } catch {
        setMessage('Non è stato possibile rimuovere la condivisione. Riprova online.');
      } finally {
        setIsSharing(false);
      }
    }
  };

  const dismissButton = (
    <button
      type="button"
      onClick={handleDismiss}
      className="inline-flex items-center gap-1 min-h-8 px-2 -mr-2 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-white/75 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/75 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
      aria-label="Non mostrare più questo suggerimento"
      title="Nascondi definitivamente per questo viaggio"
    >
      <span>Non mostrare più</span>
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );

  return (
    <section
      data-testid="predeparture-photo-card"
      className="relative overflow-hidden rounded-2xl border border-[#FF6B5F]/25 bg-[#FFF0ED]/75 p-3.5 sm:p-4 shadow-xs dark:bg-rose-950/20 dark:border-[#FF6B5F]/30 transition-all"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#E11D48] dark:text-[#FF6B5F] bg-white/85 dark:bg-slate-900/60 px-2.5 py-1 rounded-full border border-[#FF6B5F]/20 whitespace-nowrap">
          📸 Giorno 1 · Ricordo Pre-Partenza
        </span>
      </div>

      {isFlipped ? (
        <>
          <div className="rounded-xl bg-white/95 dark:bg-slate-900/80 p-3.5 border border-slate-200/70 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-200">
            <p className="font-extrabold text-[#172033] dark:text-white flex items-center gap-1.5">
              <span>◉</span> Come funziona il diario LIVE durante il viaggio
            </p>
            <p className="leading-relaxed text-[11px] text-slate-600 dark:text-slate-300">
              <strong>HOUNIGO LIVE</strong> è la vetrina pubblica e sola-lettura del vostro viaggio per amici e familiari: mostra la tappa del giorno, le cartoline che scegliete di pubblicare e i saluti degli ospiti.
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              <li><strong>Privacy garantita:</strong> nessun costo, PNR, PIN, documento o nota privata viene mai esposto nel LIVE.</li>
              <li><strong>Zero automatismi:</strong> questa card non crea attività fittizie nel roadbook e pubblica nel LIVE solo se attivi il toggle dedicato.</li>
              <li><strong>Protezione EXIF:</strong> le foto caricate vengono ripulite dai metadati GPS del telefono.</li>
            </ul>
            {onOpenLive && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={onOpenLive}
                  className="min-h-8 inline-flex items-center text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                >
                  Apri sezione LIVE →
                </button>
              </div>
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#FF6B5F]/15 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsFlipped(false)}
              className="inline-flex items-center gap-1 min-h-8 px-2 -ml-2 rounded-lg text-[11px] font-bold text-[#E11D48] dark:text-[#FF6B5F] hover:bg-white/75 dark:hover:bg-slate-800/75 whitespace-nowrap cursor-pointer transition-colors"
            >
              ← Torna allo scatto ricordo
            </button>
            {dismissButton}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-3 items-start">
            {photo ? (
              <img src={photo.url} alt="Foto pre-partenza" className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-2xl object-cover border border-white shadow-sm" />
            ) : (
              <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-sm mt-0.5">
                <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="13" r="3.5"/></svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[#172033] dark:text-white leading-snug">Prima di partire, una foto ricordo?</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Scatta o carica una foto dalla libreria: resta salvata offline sul dispositivo senza creare attività nel roadbook.
              </p>
            </div>
          </div>

          <input ref={inputRef} type="file" accept={IMAGE_FILE_ACCEPT} onChange={handleFileChange} className="hidden" />

          <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isSaving}
                className="w-full sm:w-auto min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FF6B5F] hover:bg-[#e05b50] px-3.5 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-60 cursor-pointer transition-colors whitespace-nowrap"
              >
                {isSaving ? 'Salvataggio…' : photo ? '📷 Sostituisci foto' : '📷 Scatta o carica foto'}
              </button>

              {photo && onOpenLive && (
                <button
                  type="button"
                  onClick={onOpenLive}
                  className="w-full sm:w-auto min-h-10 inline-flex items-center justify-center px-3 py-2 rounded-xl bg-white/85 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white cursor-pointer whitespace-nowrap"
                >
                  Apri diario LIVE →
                </button>
              )}
            </div>

            <label className="w-full sm:w-auto min-h-10 inline-flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none bg-white/85 dark:bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={shareOnLiveToggle}
                disabled={isSharing}
                onChange={(e) => handleToggleShareLive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#FF6B5F] focus:ring-[#FF6B5F] shrink-0"
              />
              <span>Condividi nel LIVE</span>
            </label>
          </div>

          {message && <p className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200" role="status">{message}</p>}

          <div className="mt-3 pt-2 border-t border-[#FF6B5F]/15 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsFlipped(true)}
              className="inline-flex items-center gap-1 min-h-8 px-2 -ml-2 rounded-lg text-[11px] font-bold text-slate-700 hover:text-[#172033] hover:bg-white/75 dark:text-slate-200 dark:hover:bg-slate-800/75 whitespace-nowrap cursor-pointer transition-colors"
            >
              ℹ️ Cos’è il LIVE?
            </button>
            {dismissButton}
          </div>
        </>
      )}
    </section>
  );
}
