import { useEffect, useRef, useState } from 'react';
import { IMAGE_FILE_ACCEPT, processFileForAttachment } from '../../utils/fileAttachment';
import {
  dismissPredeparturePrompt,
  getJournalUserId,
  getPredeparturePhoto,
  isPredeparturePromptDismissed,
  isPredeparturePromptDismissedAsync,
  savePredeparturePhoto,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shareOnLiveToggle, setShareOnLiveToggle] = useState(false);
  const [photo, setPhoto] = useState<JournalPhotoRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsVisible(false);
    setIsFlipped(false);
    setPhoto(null);
    setMessage('');
    if (!canEdit || !tripId || !startDate) return;

    // Compare SOLO nel Giorno 1 (data di partenza effettiva) e solo per viaggi futuri o nel giorno di partenza
    const isDayOneSelected = !selectedDate || selectedDate === startDate;
    const isFutureOrDepartureDay = localDate() <= startDate;
    if (!isDayOneSelected || !isFutureOrDepartureDay) return;

    const userId = getJournalUserId();
    if (isPredeparturePromptDismissed(tripId, userId)) return;

    const existingPhoto = getPredeparturePhoto(tripId, userId);
    setPhoto(existingPhoto);
    setShareOnLiveToggle(Boolean(existingPhoto?.liveUpdateId));
    setIsVisible(true);

    let cancelled = false;
    isPredeparturePromptDismissedAsync(tripId, userId).then((dismissed) => {
      if (!cancelled && dismissed) {
        setIsVisible(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canEdit, startDate, selectedDate, tripId]);

  if (!isVisible) return null;

  const handleDismiss = () => {
    dismissPredeparturePrompt(tripId);
    setIsVisible(false);
  };

  const publishPhotoToLive = async (currentPhoto: JournalPhotoRecord) => {
    if (currentPhoto.liveUpdateId) return;
    setIsSharing(true);
    try {
      const { liveService } = await import('../../services/liveService');
      const updateId = await liveService.publishToLive(tripId, {
        title: 'Si parte! 📸',
        text: 'La foto ricordo pre-partenza è stata aggiunta al diario di viaggio.'
      });
      const updated = setPredepartureLiveUpdate(tripId, updateId);
      if (updated) setPhoto(updated);
      setMessage('Foto salvata (senza dati EXIF) e condivisa in LIVE.');
    } catch {
      setMessage('Foto salvata sul dispositivo. Condivisione LIVE rimandata (verifica connessione).');
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

  return (
    <section
      data-testid="predeparture-photo-card"
      className="relative overflow-hidden rounded-2xl border border-[#FF6B5F]/25 bg-[#FFF0ED]/70 p-4 shadow-xs dark:bg-rose-950/20 dark:border-[#FF6B5F]/30 transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#E11D48] dark:text-[#FF6B5F] bg-white/80 dark:bg-slate-900/60 px-2.5 py-0.5 rounded-full border border-[#FF6B5F]/20">
          📸 Giorno 1 · Ricordo Pre-Partenza
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/90 hover:bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 cursor-pointer transition-colors"
          >
            {isFlipped ? '← Torna alla foto' : 'ℹ️ Cos’è il LIVE?'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2 py-1 rounded-full text-[11px] font-bold text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Non mostrare più questo suggerimento"
            title="Nascondi definitivamente per questo viaggio"
          >
            Non mostrare più ×
          </button>
        </div>
      </div>

      {isFlipped ? (
        <div className="rounded-xl bg-white/90 dark:bg-slate-900/80 p-3.5 border border-slate-200/70 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-200">
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
          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsFlipped(false)}
              className="text-[11px] font-bold text-[#E11D48] dark:text-[#FF6B5F] hover:underline cursor-pointer"
            >
              ← Torna allo scatto ricordo
            </button>
            {onOpenLive && (
              <button
                type="button"
                onClick={onOpenLive}
                className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
              >
                Apri sezione LIVE →
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-3 items-start">
            {photo ? (
              <img src={photo.url} alt="Foto pre-partenza" className="h-20 w-20 shrink-0 rounded-2xl object-cover border border-white shadow-sm" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="13" r="3.5"/></svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[#172033] dark:text-white">Prima di partire, una foto ricordo?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                Scatta o carica una foto dalla libreria: resta salvata offline sul dispositivo senza creare attività nel roadbook.
              </p>
            </div>
          </div>

          <input ref={inputRef} type="file" accept={IMAGE_FILE_ACCEPT} onChange={handleFileChange} className="hidden" />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isSaving}
                className="min-h-9 rounded-xl bg-[#FF6B5F] hover:bg-[#e05b50] px-3.5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60 cursor-pointer transition-colors"
              >
                {isSaving ? 'Salvataggio…' : photo ? '📷 Sostituisci foto' : '📷 Scatta o carica foto'}
              </button>

              {photo && onOpenLive && (
                <button
                  type="button"
                  onClick={onOpenLive}
                  className="min-h-9 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white cursor-pointer"
                >
                  Apri diario LIVE →
                </button>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <input
                type="checkbox"
                checked={shareOnLiveToggle}
                disabled={isSharing}
                onChange={(e) => handleToggleShareLive(e.target.checked)}
                className="rounded border-slate-300 text-[#FF6B5F] focus:ring-[#FF6B5F]"
              />
              <span>Condividi anche nel LIVE</span>
            </label>
          </div>

          {message && <p className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200" role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
