import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TrailPdf } from '../icons/TrailIcons';
import { getTripConfig } from '../../utils/tripConfig';
import { useDeviceRole } from '../../utils/useDeviceRole';
import {
  type PdfExportOptions,
  getPdfPreviewStats,
  generateRoadbookPdf,
  downloadPdfDirectly,
  sharePdfNatively,
  isMobileOrTabletDevice,
  canSharePdfFile
} from '../../services/pdfExportService';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
}

export default function PdfExportModal({
  isOpen,
  onClose,
  defaultDate
}: PdfExportModalProps) {
  const tripConfig = getTripConfig();
  const configStartDate = tripConfig?.startDate || new Date().toISOString().split('T')[0];
  const configEndDate = tripConfig?.endDate || configStartDate;

  // Opzioni Contenuto
  const [includeTappe, setIncludeTappe] = useState(true);
  const [includeActivities, setIncludeActivities] = useState(true);
  const [includeTransports, setIncludeTransports] = useState(true);
  const [includeAccommodations, setIncludeAccommodations] = useState(true);
  const [includeBookingRefs, setIncludeBookingRefs] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeSpese, setIncludeSpese] = useState(false);

  // Periodo
  const [periodType, setPeriodType] = useState<'all' | 'range' | 'single'>('all');
  const [startDate, setStartDate] = useState(configStartDate);
  const [endDate, setEndDate] = useState(configEndDate);
  const [singleDate, setSingleDate] = useState(defaultDate || configStartDate);

  // Dettaglio
  const [detailLevel, setDetailLevel] = useState<'compact' | 'detailed'>('compact');

  const { canSeePrivateInfo, isViewer } = useDeviceRole();
  const canExportPrivate = canSeePrivateInfo && !isViewer;

  // Stato generazione e anteprima
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMsg, setGenerationMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; blob: Blob; fileName: string; pageCount: number } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    daysCount: number;
    totalEventsCount: number;
    estimatedPages: number;
    dateRangeStr: string;
  } | null>(null);

  // Rilevamento stato online e capacità condivisione mobile
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const isMobile = isMobileOrTabletDevice();
  const canNativeShare = isMobile && canSharePdfFile();

  const clearPreviewPdf = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewPdf(null);
  };

  useEffect(() => {
    if (!isOpen) {
      clearPreviewPdf();
    }
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [isOpen]);

  // Calcolo opzioni correnti (con rispetto rigoroso permessi Owner/Copilota vs Viewer)
  const getCurrentOptions = (): PdfExportOptions => ({
    includeTappe,
    includeActivities,
    includeTransports,
    includeAccommodations,
    includeBookingRefs: canExportPrivate ? includeBookingRefs : false,
    includeNotes: canExportPrivate ? includeNotes : false,
    includeSpese: canExportPrivate ? includeSpese : false,
    periodType,
    startDate: periodType === 'range' ? startDate : undefined,
    endDate: periodType === 'range' ? endDate : undefined,
    singleDate: periodType === 'single' ? singleDate : undefined,
    detailLevel,
    allowPrivateInfo: canExportPrivate
  });

  // Aggiornamento dinamico dell'anteprima sintetica al variare delle impostazioni
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const updatePreview = async () => {
      try {
        const stats = await getPdfPreviewStats(getCurrentOptions());
        if (!isCancelled) {
          setPreviewStats(stats);
        }
      } catch (err) {
        console.warn('[PdfExportModal] Errore calcolo statistiche anteprima:', err);
      }
    };

    updatePreview();
    return () => { isCancelled = true; };
  }, [
    isOpen,
    includeTappe,
    includeActivities,
    includeTransports,
    includeAccommodations,
    includeBookingRefs,
    includeNotes,
    includeSpese,
    periodType,
    startDate,
    endDate,
    singleDate,
    detailLevel
  ]);

  if (!isOpen) return null;

  const handlePreview = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setGenerationMsg('Generazione anteprima PDF…');
    try {
      const { blob, fileName, pageCount } = await generateRoadbookPdf(getCurrentOptions());
      clearPreviewPdf();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewPdf({ url, blob, fileName, pageCount });
      setIsGenerating(false);
      setGenerationMsg('');
    } catch (err: any) {
      console.error('[PdfExportModal] Errore anteprima PDF:', err);
      setErrorMessage(err?.message || 'Si è verificato un errore durante la creazione dell’anteprima PDF.');
      setIsGenerating(false);
      setGenerationMsg('');
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setGenerationMsg('Preparazione PDF locale…');

    try {
      const target = previewPdf || await generateRoadbookPdf(getCurrentOptions());
      setGenerationMsg('Download sul dispositivo…');
      downloadPdfDirectly(target.blob, target.fileName);

      setTimeout(() => {
        setIsGenerating(false);
        setGenerationMsg('');
      }, 350);
    } catch (err: any) {
      console.error('[PdfExportModal] Errore generazione PDF:', err);
      setErrorMessage(err?.message || 'Si è verificato un errore durante la creazione del PDF.');
      setIsGenerating(false);
      setGenerationMsg('');
    }
  };

  const handleShare = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setGenerationMsg('Preparazione condivisione…');

    try {
      const target = previewPdf || await generateRoadbookPdf(getCurrentOptions());
      setGenerationMsg('Apertura condivisione nativa…');
      await sharePdfNatively(target.blob, target.fileName);
      setIsGenerating(false);
      setGenerationMsg('');
    } catch (err: any) {
      console.error('[PdfExportModal] Errore condivisione PDF:', err);
      setErrorMessage(err?.message || 'Si è verificato un errore durante la condivisione del PDF.');
      setIsGenerating(false);
      setGenerationMsg('');
    }
  };

  return createPortal(
    <div
      className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm animate-fade-in font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose();
      }}
    >
      <div className="app-modal-panel w-full max-w-lg bg-white dark:bg-[#172033] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xl p-5 sm:p-6 overflow-hidden flex flex-col space-y-4">
        
        {/* Intestazione */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF0ED] dark:bg-[#FF6B5F]/15 text-[#FF6B5F] flex items-center justify-center shrink-0 border border-[#FF6B5F]/20 shadow-2xs">
              <TrailPdf size={22} active />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#172033] dark:text-white font-brand-title leading-tight">
                Esporta Itinerario PDF
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Roadbook cartaceo A4 per viaggio, stampa e consultazione offline
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Corpo configurazione a scorrimento */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1">
          
          {/* Avviso sincronizzazione / offline */}
          {!isOnline && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2 shadow-2xs">
              <span className="text-sm shrink-0">⚠️</span>
              <p className="text-[11px] leading-relaxed">
                Il PDF include i dati salvati su questo dispositivo. Alcune modifiche potrebbero non essere ancora sincronizzate nel cloud.
              </p>
            </div>
          )}

          {/* 1. SELEZIONE CONTENUTI */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-brand-title">
              Contenuti da Includere
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <input
                  type="checkbox"
                  checked={includeTappe}
                  onChange={e => setIncludeTappe(e.target.checked)}
                  className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Tappe e destinazioni</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <input
                  type="checkbox"
                  checked={includeActivities}
                  onChange={e => setIncludeActivities(e.target.checked)}
                  className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Attività & orari</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <input
                  type="checkbox"
                  checked={includeTransports}
                  onChange={e => setIncludeTransports(e.target.checked)}
                  className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Trasporti & voli</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <input
                  type="checkbox"
                  checked={includeAccommodations}
                  onChange={e => setIncludeAccommodations(e.target.checked)}
                  className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Alloggi & check-in</span>
              </label>

              {canExportPrivate ? (
                <>
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <input
                      type="checkbox"
                      checked={includeBookingRefs}
                      onChange={e => setIncludeBookingRefs(e.target.checked)}
                      className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">Riferimenti prenotazione</span>
                      <span className="text-[10px] text-slate-400 block">Disattivati per privacy; abilita solo se servono</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <input
                      type="checkbox"
                      checked={includeNotes}
                      onChange={e => setIncludeNotes(e.target.checked)}
                      className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Note personali</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={includeSpese}
                      onChange={e => setIncludeSpese(e.target.checked)}
                      className="rounded text-[#FF6B5F] focus:ring-[#FF6B5F] accent-[#FF6B5F] w-4 h-4 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Spese previste & budget giornaliero</span>
                  </label>
                </>
              ) : (
                <div className="sm:col-span-2 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] text-slate-600 dark:text-slate-300">
                  Accesso in sola lettura: riferimenti di prenotazione, note private e spese sono esclusi dal PDF.
                </div>
              )}
            </div>
          </div>

          {/* 2. SELEZIONE PERIODO */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-brand-title">
              Periodo di Viaggio
            </span>
            <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPeriodType('all')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  periodType === 'all'
                    ? 'bg-white dark:bg-[#172033] text-[#172033] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tutto il viaggio
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('range')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  periodType === 'range'
                    ? 'bg-white dark:bg-[#172033] text-[#172033] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Intervallo date
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('single')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  periodType === 'single'
                    ? 'bg-white dark:bg-[#172033] text-[#172033] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Singolo giorno
              </button>
            </div>

            {/* Input per intervallo date */}
            {periodType === 'range' && (
              <div className="grid grid-cols-2 gap-2 pt-1 animate-fade-in text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Data Inizio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Data Fine</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            )}

            {/* Input per singolo giorno */}
            {periodType === 'single' && (
              <div className="pt-1 animate-fade-in text-xs">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Giorno da Esportare</label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={e => setSingleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                />
              </div>
            )}
          </div>

          {/* 3. LIVELLO DI DETTAGLIO */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-brand-title">
              Livello di Dettaglio
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDetailLevel('compact')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  detailLevel === 'compact'
                    ? 'border-[#FF6B5F] bg-[#FFF0ED]/60 dark:bg-[#FF6B5F]/15 text-[#172033] dark:text-white shadow-2xs'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Compatto</span>
                  {detailLevel === 'compact' && <span className="text-[#FF6B5F] font-bold">✓</span>}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Orario, titolo e luogo principale. Ideale per consultazione tascabile.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDetailLevel('detailed')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  detailLevel === 'detailed'
                    ? 'border-[#FF6B5F] bg-[#FFF0ED]/60 dark:bg-[#FF6B5F]/15 text-[#172033] dark:text-white shadow-2xs'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Dettagliato</span>
                  {detailLevel === 'detailed' && <span className="text-[#FF6B5F] font-bold">✓</span>}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Indirizzi completi, tratte dei trasporti, note e riferimenti.
                </p>
              </button>
            </div>
          </div>

          {/* ANTEPRIMA SINTETICA RAPIDA */}
          {previewStats && (
            <div className="p-3.5 rounded-2xl bg-[#F8F7F3] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-brand-title">
                Anteprima Selezione
              </span>
              <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 text-[11px] pt-0.5">
                <span>Giorni: <strong>{previewStats.daysCount}</strong></span>
                <span>Eventi inclusi: <strong>{previewStats.totalEventsCount}</strong></span>
                <span>Stima: <strong>~{previewStats.estimatedPages} pag. A4</strong></span>
              </div>
              <p className="text-[10px] text-slate-400 pt-0.5">
                Periodo: {previewStats.dateRangeStr}
              </p>
            </div>
          )}

          {/* ANTEPRIMA PDF INTEGRATA */}
          {previewPdf && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden space-y-2 p-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                  Anteprima · {previewPdf.pageCount} pag. ({previewPdf.fileName})
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={previewPdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#FF6B5F] hover:underline"
                  >
                    Apri ↗
                  </a>
                  <button
                    type="button"
                    onClick={clearPreviewPdf}
                    className="font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
              <iframe
                src={previewPdf.url}
                title="Anteprima PDF Roadbook"
                className="w-full h-56 sm:h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
              />
            </div>
          )}

          {/* Errore eventuale */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              ⚠️ {errorMessage}
            </div>
          )}
        </div>

        {/* Footer con anteprima, download e condivisione */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="px-3.5 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Annulla
          </button>

          <button
            type="button"
            disabled={isGenerating || previewStats?.daysCount === 0}
            onClick={handlePreview}
            className="px-3.5 py-2.5 rounded-xl font-bold text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            Anteprima
          </button>

          {canNativeShare && (
            <button
              type="button"
              disabled={isGenerating || previewStats?.daysCount === 0}
              onClick={handleShare}
              className="px-3.5 py-2.5 rounded-xl font-bold text-xs border border-[#FF6B5F]/40 bg-[#FFF0ED] dark:bg-[#FF6B5F]/15 text-[#FF6B5F] hover:bg-[#ffe3dd] transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              Condividi
            </button>
          )}

          <button
            type="button"
            disabled={isGenerating || previewStats?.daysCount === 0}
            onClick={handleDownload}
            className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{generationMsg || 'Generazione in corso…'}</span>
              </>
            ) : (
              <>
                <span>Scarica PDF</span>
                <span>↓</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
