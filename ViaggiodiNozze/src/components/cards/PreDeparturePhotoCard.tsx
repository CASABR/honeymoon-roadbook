import { useEffect, useRef, useState } from 'react';
import { IMAGE_FILE_ACCEPT } from '../../utils/fileAttachment';
import { compressLivePhotoToDataUrl } from '../../utils/livePhotoImage';
import { publishLivePhotoOnce } from '../../services/livePhotoPublication';
import {
  dismissPredeparturePrompt,
  getJournalUserId,
  getPredeparturePhoto,
  isPredeparturePromptDismissed,
  isPredeparturePromptDismissedAsync,
  loadPredeparturePhoto,
  savePredeparturePhotoDurably,
  restorePredeparturePrompt,
  linkPredeparturePhotoToLive,
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
  const [photoLoading, setPhotoLoading] = useState(true);
  const busy = useRef(false);
  const [photo, setPhoto] = useState<JournalPhotoRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsVisible(false);
    setCanRestore(false);
    setIsFlipped(false);
    setPhoto(null);
    setPhotoLoading(true);
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
    setIsVisible(true);

    let cancelled = false;
    void loadPredeparturePhoto(tripId, userId).then(saved => {
      if (!cancelled) { setPhoto(saved); setPhotoLoading(false); }
    });
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
        setPhotoLoading(true);
        void loadPredeparturePhoto(tripId, journalUserId).then(saved => {
          if (getJournalUserId() === journalUserId) { setPhoto(saved); setPhotoLoading(false); }
        });
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
    if (busy.current || currentPhoto.liveUpdateId || photoLoading) return;
    if (!navigator.onLine) { setMessage('Foto salvata sul dispositivo. Riprova quando sei online.'); return; }
    busy.current = true;
    setIsSharing(true);
    setMessage('');
    try {
      if (currentPhoto.userId !== getJournalUserId()) throw new Error('Sessione cambiata: riapri la tua foto prima di condividerla.');
      const result = await publishLivePhotoOnce(tripId, currentPhoto.url, {
        title: 'Si parte! 📸', text: 'La foto ricordo pre-partenza è stata aggiunta al diario di viaggio.'
      }, currentPhoto.userId);
      const updated = await linkPredeparturePhotoToLive(currentPhoto, result.postId);
      if (getJournalUserId() === currentPhoto.userId) setPhoto(updated);
      setMessage('Foto pubblicata nel LIVE.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Foto salvata. Condivisione non riuscita.');
    } finally {
      busy.current = false;
      setIsSharing(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || busy.current || photoLoading) return;
    busy.current = true;
    setIsSaving(true);
    setMessage('');
    try {
      // Same normalized JPEG as the LIVE uploader, with EXIF removed by canvas.
      const dataUrl = await compressLivePhotoToDataUrl(file);
      if (getJournalUserId() !== journalUserId) throw new Error('Sessione cambiata.');
      const saved = await savePredeparturePhotoDurably(tripId, dataUrl, journalUserId);
      setPhoto(saved);
      setMessage('Foto ricordo salvata sul dispositivo.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Non è stato possibile salvare la foto.');
    } finally {
      busy.current = false;
      setIsSaving(false);
      event.target.value = '';
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
              <li><strong>Zero automatismi:</strong> questa card non crea attività fittizie nel roadbook e pubblica nel LIVE solo quando premi il pulsante dedicato.</li>
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
          {photoLoading ? (
            <p className="py-3 text-xs text-slate-500" role="status">Caricamento foto ricordo…</p>
          ) : photo ? (
            <div className="space-y-2">
              <img data-testid="predeparture-photo-preview" src={photo.url} alt="Foto ricordo pre-partenza" className="w-full max-h-64 rounded-xl bg-white/70 object-contain dark:bg-slate-900/60" />
              <p className="text-sm font-extrabold text-[#172033] dark:text-white">La nostra foto ricordo</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Salvata sul dispositivo, disponibile anche offline.</p>
            </div>
          ) : (
            <div className="flex gap-3 items-start">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-[#FF6B5F] text-white flex items-center justify-center" aria-hidden="true">📷</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[#172033] dark:text-white">Prima di partire, una foto ricordo?</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Scatta o carica una foto da conservare anche offline.</p>
              </div>
            </div>
          )}

          <input ref={inputRef} type="file" accept={IMAGE_FILE_ACCEPT} onChange={handleFileChange} className="hidden" />

          <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isSaving || isSharing || photoLoading}
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

            {photo && (photo.liveUpdateId ? (
              <span data-testid="predeparture-published" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">✓ Pubblicata nel LIVE</span>
            ) : (
              <button type="button" disabled={isSharing || isSaving || photoLoading} onClick={() => void publishPhotoToLive(photo)}
                className="w-full min-h-10 rounded-xl border border-[#FF6B5F]/40 bg-white px-3 py-2 text-xs font-bold text-[#B83F36] dark:bg-slate-900 dark:text-[#FF9A90] disabled:opacity-60">
                {isSharing ? 'Pubblicazione…' : 'Condividi nel LIVE'}
              </button>
            ))}
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
