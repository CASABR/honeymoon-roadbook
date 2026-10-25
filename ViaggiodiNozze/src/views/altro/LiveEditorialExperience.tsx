import { useState, useMemo, useEffect, useRef } from 'react';
import type { LiveUpdate } from '../../services/liveService';
import type { LiveGpsLease, LiveGpsLocation, LiveGpsDevice } from '../../services/liveGpsService';
import type { LiveIntelligenceState } from '../../utils/liveIntelligenceHelper';

export interface LiveGalleryPhotoItem {
  id: string;
  url: string;
  caption?: string;
  location?: string;
  timestamp: number;
  isCustom?: boolean;
}

export interface LiveEditorialExperienceProps {
  isExternal: boolean;
  onBack?: () => void;
  location: any;
  realLocation: any;
  mapSearchUrl: string;
  tileGrid: any;
  tileLoadFailed: boolean;
  onTileError: () => void;
  gpsError: string | null;
  gpsFeedback?: string | null;
  isDetectingGps: boolean;
  canControlGps: boolean;
  deviceLabel: string;
  onDetectGps?: () => void;
  // Remote GPS lease and locations
  remoteGpsLease?: LiveGpsLease | null;
  remoteGpsLocation?: LiveGpsLocation | null;
  isGpsHolder?: boolean;
  isOwner?: boolean;
  isCopilota?: boolean;
  gpsDevices?: LiveGpsDevice[];
  onStartGps?: () => void;
  onPauseGps?: () => void;
  onResumeGps?: () => void;
  onStopGps?: () => void;
  onTransferGps?: (uid: string, deviceId: string) => void;
  onRevokeGps?: () => void;
  // Live Intelligence & Dual Map Markers
  liveIntelligence?: LiveIntelligenceState | null;
  mapCenterMode?: 'both' | 'real' | 'planned';
  onChangeMapCenterMode?: (mode: 'both' | 'real' | 'planned') => void;
  realMarkerOffset?: { dx: number; dy: number } | null;
  plannedMarkerOffset?: { dx: number; dy: number } | null;
  // Status & Diary
  statusMessage: string;
  statusUpdatedAt: string;
  canPublish: boolean;
  isEditingStatus: boolean;
  tempStatus: string;
  onTempStatusChange: (value: string) => void;
  onToggleStatusEdit: () => void;
  onSaveStatus: () => void;
  liveTextMessage: string;
  onLiveTextChange: (value: string) => void;
  onSendMessage: (event: React.FormEvent) => void;
  isSendingMessage: boolean;
  messageError: string | null;
  messageSuccess: string | null;
  updates: LiveUpdate[];
  reactions: Record<string, string>;
  onReaction: (updateId: string, emoji: string) => void;
  onShare: () => void;
  copiedLink: boolean;
  online: boolean;

  // Galleria fotografica e gestione avanzata messaggi
  galleryPhotos?: LiveGalleryPhotoItem[];
  onUploadPhoto?: (file: File, caption?: string) => Promise<void>;
  onDeletePhoto?: (photoId: string) => void;
  onDeleteUpdate?: (updateId: string) => Promise<void>;
}

const REACTIONS = ['❤️', '😍', '😂', '👋'];
const PAGE_SIZE = 10;

export function formatLastDetectedTimestamp(date: Date | number | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const hoursMins = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
  const dateStr = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(d);
  return `Ultima posizione rilevata: ${hoursMins} — ${dateStr}`;
}

const formatUpdateDate = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
};

const formatRelativeTime = (date: Date) => {
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 20) return 'pochi istanti fa';
    if (diffSec < 60) return `${diffSec}s fa`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min fa`;
    return `${Math.floor(diffMin / 60)}h fa`;
  } catch {
    return 'poco fa';
  }
};

export default function LiveEditorialExperience(props: LiveEditorialExperienceProps) {
  // ─── STATO GALLERIA FOTOGRAFICA & LIGHTBOX ──────────────────────────
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingUploadPreview, setPendingUploadPreview] = useState<string | null>(null);
  const [pendingCaptionInput, setPendingCaptionInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ─── STATO PAGINAZIONE DIARIO ───────────────────────────────────────
  const [diaryPage, setDiaryPage] = useState(1);

  // ─── STATO COPILOTA ────────────────────────────────────────────────
  const [selectedCopilotDevice, setSelectedCopilotDevice] = useState<string>('');

  // ─── CALCOLO FOTOGRAFIE GALLERIA ────────────────────────────────────
  const displayPhotos = useMemo<LiveGalleryPhotoItem[]>(() => {
    if (props.galleryPhotos && props.galleryPhotos.length > 0) {
      return props.galleryPhotos;
    }
    // Fallback: estrai fotografie dagli updates
    const extracted: LiveGalleryPhotoItem[] = [];
    (props.updates || []).forEach(u => {
      if (u.photoUrl && typeof u.photoUrl === 'string' && u.photoUrl.trim()) {
        extracted.push({
          id: u.id,
          url: u.photoUrl,
          caption: u.title || u.text || 'Scatto dal viaggio',
          location: u.locationName,
          timestamp: u.timestamp || Date.now(),
          isCustom: false
        });
      }
    });
    return extracted.sort((a, b) => b.timestamp - a.timestamp);
  }, [props.galleryPhotos, props.updates]);

  // Gestione tastiera per sfogliare la galleria a schermo intero (◀ ▶ Esc)
  useEffect(() => {
    if (activeLightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setActiveLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setActiveLightboxIndex(prev => (prev !== null && prev < displayPhotos.length - 1 ? prev + 1 : prev));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxIndex, displayPhotos.length]);

  // ─── STATI GPS E TIMESTAMP ──────────────────────────────────────────
  const isLeaseActive = props.remoteGpsLease?.status === 'active';
  const isLeasePaused = props.remoteGpsLease?.status === 'paused';
  const isLeaseStopped = !props.remoteGpsLease || props.remoteGpsLease?.status === 'stopped';
  const hasFreshRemoteLocation = Boolean(props.remoteGpsLocation && isLeaseActive);

  // Data e ora dell'ultima rilevazione satellitare effettiva
  const lastDetectedDate: Date | null = props.remoteGpsLocation?.updatedAt
    ? (props.remoteGpsLocation.updatedAt instanceof Date
        ? props.remoteGpsLocation.updatedAt
        : new Date(props.remoteGpsLocation.updatedAt))
    : props.realLocation?.timestamp
      ? new Date(props.realLocation.timestamp)
      : null;

  const lastDetectedTimestampStr = formatLastDetectedTimestamp(lastDetectedDate);

  const isFreshGps = Boolean(
    lastDetectedDate &&
    (Date.now() - lastDetectedDate.getTime() < 120000) &&
    (hasFreshRemoteLocation || (props.isGpsHolder && props.realLocation))
  );

  const hasStaleGps = Boolean(
    lastDetectedDate &&
    !isFreshGps &&
    (props.remoteGpsLocation || props.realLocation)
  );

  // Classificazione esplicita dello stato GPS (FASE 3)
  const gpsVisualState = isFreshGps
    ? {
        label: 'Posizione GPS aggiornata',
        sublabel: props.realLocation ? 'Rilevata localmente' : 'LIVE in trasmissione satellitare',
        tone: 'text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500 animate-pulse',
        badgeBg: 'bg-emerald-500/10 border-emerald-500/20'
      }
    : hasStaleGps || isLeasePaused
      ? {
          label: 'Ultima posizione nota (non più aggiornata)',
          sublabel: isLeasePaused ? 'Trasmissione in pausa temporanea' : 'Segnale guida momentaneamente fermo',
          tone: 'text-amber-700 dark:text-amber-300',
          dot: 'bg-amber-500',
          badgeBg: 'bg-amber-500/10 border-amber-500/20'
        }
      : props.gpsError
        ? {
            label: 'Non disponibile',
            sublabel: props.gpsError,
            tone: 'text-rose-700 dark:text-rose-300',
            dot: 'bg-rose-500',
            badgeBg: 'bg-rose-500/10 border-rose-500/20'
          }
        : {
            label: 'Non attivata',
            sublabel: 'Posizione prevista dall\'itinerario (in attesa di trasmissione satellitare)',
            tone: 'text-slate-600 dark:text-slate-300',
            dot: 'bg-slate-400',
            badgeBg: 'bg-slate-500/10 border-slate-500/20'
          };

  // ─── ORDINAMENTO E PAGINAZIONE DIARIO (FASE 2) ──────────────────────
  const sortedUpdates = useMemo(() => {
    return [...(props.updates || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [props.updates]);

  const totalDiaryPages = Math.max(1, Math.ceil(sortedUpdates.length / PAGE_SIZE));
  const paginatedUpdates = useMemo(() => {
    const start = (diaryPage - 1) * PAGE_SIZE;
    return sortedUpdates.slice(start, start + PAGE_SIZE);
  }, [sortedUpdates, diaryPage]);

  // Copilot devices available for transfer
  const eligibleCopilots = (props.gpsDevices || []).filter(d => d.role === 'copilota');

  // Gestione selezione foto da fotocamera / rullino
  const handlePhotoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setPendingUploadFile(file);
    try {
      const preview = URL.createObjectURL(file);
      setPendingUploadPreview(preview);
    } catch {
      // Fallback
    }
  };

  const handleConfirmPhotoUpload = async () => {
    if (!pendingUploadFile || !props.onUploadPhoto) return;
    try {
      setIsUploadingPhoto(true);
      setUploadError(null);
      await props.onUploadPhoto(pendingUploadFile, pendingCaptionInput.trim());
      setPendingUploadFile(null);
      setPendingUploadPreview(null);
      setPendingCaptionInput('');
      if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
    } catch (err: any) {
      setUploadError(err?.message || 'Errore durante il caricamento della foto.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleCancelPhotoUpload = () => {
    if (pendingUploadPreview) {
      try { URL.revokeObjectURL(pendingUploadPreview); } catch {}
    }
    setPendingUploadFile(null);
    setPendingUploadPreview(null);
    setPendingCaptionInput('');
    setUploadError(null);
    if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
  };

  return (
    <div className="mx-auto w-full max-w-5xl pb-16 px-3 sm:px-6 animate-fade-in text-slate-900 dark:text-slate-100">
      {/* ─── HEADER EDITORIALE ─────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          {!props.isExternal && props.onBack && (
            <button
              type="button"
              onClick={props.onBack}
              className="hounigo-button-ghost shrink-0 px-3 py-2 text-sm"
              aria-label="Torna ad Altro"
            >
              ←
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FF6B5F]">
                Hounigo · Live Experience
              </p>
              {props.isExternal && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Ospite
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white mt-0.5 truncate">
              Il viaggio, mentre accade
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Posizione satellitare, scatti sul campo e partecipazione in tempo reale.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={props.onShare}
          className="hounigo-button-secondary shrink-0 px-3.5 py-2 text-xs font-bold"
        >
          {props.copiedLink ? '✓ Link copiato' : 'Condividi LIVE'}
        </button>
      </header>

      {!props.online && (
        <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <span>⚠️</span>
          <span>Sei offline. Il diario resta leggibile, ma GPS, pubblicazione e reazioni richiedono connessione.</span>
        </div>
      )}

      {/* ─── 01 · DOVE SIAMO: GPS AFFIDABILE ──────────────────────────── */}
      <section aria-labelledby="live-position-title" className="mb-12">
        <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              01 · Posizione
            </p>
            <h2 id="live-position-title" className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white">
              Dove siamo
            </h2>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${gpsVisualState.badgeBg} ${gpsVisualState.tone}`}>
            <span className={`w-2 h-2 rounded-full ${gpsVisualState.dot}`} />
            <span>{gpsVisualState.label}</span>
          </div>
        </div>

        {/* MAPPA CARTOGRAFICA EDITORIALE */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 min-h-[340px] sm:min-h-[440px] shadow-sm">
          {/* CAMERA FOCUS CONTROLS */}
          {!props.isExternal && props.liveIntelligence?.plannedLocation?.coords && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-slate-900/85 backdrop-blur-md p-1 rounded-xl border border-white/20 text-[11px] font-bold text-white shadow-lg">
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('both')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'both' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Entrambi
              </button>
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('real')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'real' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                GPS
              </button>
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('planned')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'planned' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Itinerario
              </button>
            </div>
          )}

          {/* TILES MAPPA */}
          {props.tileGrid && !props.tileLoadFailed ? (
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute left-1/2 top-1/2 w-[768px] h-[768px] -translate-x-1/2 -translate-y-1/2 grid grid-cols-3 grid-rows-3 opacity-90 dark:opacity-60">
                {props.tileGrid.tiles.map((tile: any) => (
                  <img key={tile.key} src={tile.url} alt="" onError={props.onTileError} className="w-64 h-64 object-cover" />
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,.14)_25%,transparent_25%,transparent_50%,rgba(148,163,184,.14)_50%,rgba(148,163,184,.14)_75%,transparent_75%)] bg-[length:28px_28px]" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />

          {/* MARKER 1: POSIZIONE GPS REALE (CORAL CIRCLE + PING) */}
          {(hasFreshRemoteLocation || props.realLocation) && (
            <div
              className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none z-10"
              style={{
                transform: props.realMarkerOffset
                  ? `translate(calc(-50% + ${props.realMarkerOffset.dx}px), calc(-50% + ${props.realMarkerOffset.dy}px))`
                  : 'translate(-50%, -50%)'
              }}
            >
              {isFreshGps && (
                <span className="absolute w-12 h-12 rounded-full bg-[#FF6B5F]/40 animate-ping" />
              )}
              <div className="w-5 h-5 rounded-full bg-[#FF6B5F] border-3 border-white shadow-xl relative z-10 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <span className="mt-1 px-2.5 py-0.5 rounded-md bg-[#FF6B5F] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap">
                {props.isGpsHolder ? 'Sei qui (Dispositivo guida)' : 'Posizione GPS'}
              </span>
            </div>
          )}

          {/* MARKER 2: POSIZIONE PREVISTA SECONDO ITINERARIO */}
          {!props.isExternal && props.liveIntelligence?.plannedLocation?.coords && (
            <div
              className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none z-10"
              style={{
                transform: props.plannedMarkerOffset
                  ? `translate(calc(-50% + ${props.plannedMarkerOffset.dx}px), calc(-50% + ${props.plannedMarkerOffset.dy}px))`
                  : (hasFreshRemoteLocation || props.realLocation) ? 'translate(calc(-50% + 40px), calc(-50% - 40px))' : 'translate(-50%, -50%)'
              }}
            >
              <div className="w-6 h-6 rounded-lg rotate-45 bg-[#172033] border-2 border-white shadow-xl relative z-10 flex items-center justify-center">
                <span className="-rotate-45 text-[10px]">🗓️</span>
              </div>
              <span className="mt-1 px-2.5 py-0.5 rounded-md bg-[#172033] text-white text-[10px] font-extrabold tracking-wider shadow-md whitespace-nowrap border border-white/20">
                Secondo itinerario
              </span>
            </div>
          )}

          {/* OVERLAY INFORMAZIONI POSIZIONE CON TIMESTAMP OBBLIGATORIO (FASE 3) */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white z-10">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B5F]">
                {gpsVisualState.sublabel}
              </span>
              {lastDetectedDate && (
                <span className="text-[11px] text-white/70">
                  · rilevato {formatRelativeTime(lastDetectedDate)}
                </span>
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-black leading-tight">
              {props.remoteGpsLocation?.city
                ? `${props.remoteGpsLocation.city}${props.remoteGpsLocation.country ? `, ${props.remoteGpsLocation.country}` : ''}`
                : props.location?.city || props.location?.title || 'Posizione programmata'}
            </h3>

            {/* CHIP PRIMARIO: "Ultima posizione rilevata: HH:mm — data" */}
            {lastDetectedTimestampStr && (
              <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 text-white text-xs font-bold shadow-xs">
                <span className="text-sm">🕒</span>
                <span>{lastDetectedTimestampStr}</span>
                {props.remoteGpsLocation?.accuracy && (
                  <span className="text-[10px] text-white/75 font-normal">
                    (±{Math.round(props.remoteGpsLocation.accuracy)}m)
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <a
                href={props.mapSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border-b border-white/60 pb-0.5 text-xs font-bold text-white hover:text-[#FF6B5F] hover:border-[#FF6B5F] transition-colors"
              >
                <span>Apri coordinate su Google Maps</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>

        {/* NOTA TECNICA E LIMITI IOS WEBKIT (FASE 3) */}
        <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
          <span className="text-xs shrink-0 mt-0.5">ℹ️</span>
          <div>
            <strong className="text-slate-800 dark:text-slate-200 font-bold">Comportamento GPS su iOS e browser mobile:</strong>{' '}
            Apple WebKit sospende l&apos;acquisizione della posizione in background quando lo schermo viene bloccato o Safari viene minimizzato. L&apos;app mostra l&apos;ultima posizione satellitare effettiva con relativo orario di rilevazione e riprende la trasmissione in tempo reale non appena la schermata torna attiva.
          </div>
        </div>

        {/* ─── LIVE INTELLIGENCE: ADESSO, PROGRAMMA E CONFRONTO ─── */}
        {!props.isExternal && props.liveIntelligence && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B5F]">
                  ADESSO
                </span>
                {props.liveIntelligence.currentEvent?.timeRange && (
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    {props.liveIntelligence.currentEvent.timeRange}
                  </span>
                )}
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                {props.liveIntelligence.currentEvent?.title || 'Nessuna attività programmata in questo orario'}
              </h4>
              {props.liveIntelligence.currentEvent?.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {props.liveIntelligence.currentEvent.subtitle}
                </p>
              )}
              {props.liveIntelligence.currentEvent?.transportDetails && (
                <div className="mt-2.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800/50">
                  ✈️ {props.liveIntelligence.currentEvent.transportDetails.message}
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  PROSSIMA ATTIVITÀ
                </span>
                {props.liveIntelligence.nextEvent?.time && (
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    {props.liveIntelligence.nextEvent.time}
                  </span>
                )}
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                {props.liveIntelligence.nextEvent?.title || 'Nessuna attività futura registrata'}
              </h4>
              {props.liveIntelligence.nextEvent?.locationName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  📍 {props.liveIntelligence.nextEvent.locationName}
                </p>
              )}
            </div>

            {/* CONFRONTO REALE VS PREVISTO */}
            <div className="md:col-span-2 p-3.5 rounded-2xl bg-[#F8F7F3] dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#172033] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  ⚖️
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-slate-900 dark:text-white font-bold text-xs">
                      {props.liveIntelligence.comparison ? props.liveIntelligence.comparison.label : 'Posizione prevista'}
                    </strong>
                    {props.liveIntelligence.comparison?.status === 'coincident' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[10px]">
                        In linea con il programma
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {props.remoteGpsLocation
                      ? `GPS reale attivo (±${Math.round(props.remoteGpsLocation.accuracy)}m)`
                      : 'Posizione satellitare non attiva'}
                    {' · '}
                    Previsto: {props.liveIntelligence.plannedLocation?.title || props.liveIntelligence.plannedLocation?.locationName || 'Nessuna'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FEEDBACK GPS */}
        {props.gpsFeedback && (
          <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <span>✓</span>
            <span>{props.gpsFeedback}</span>
          </div>
        )}
        {props.gpsError && (
          <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <span>⚠️</span>
            <span>{props.gpsError}</span>
          </div>
        )}

        {/* PANNELLO DI CONTROLLO TRASMISSIONE GUIDA */}
        <div className="mt-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          {props.isExternal ? (
            <div className="rounded-2xl bg-[#F8F7F3] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white font-bold block mb-1">Privacy e trasparenza per gli ospiti:</strong>
              Gli ospiti possono visualizzare la posizione solo quando il viaggiatore avvia esplicitamente la condivisione satellitare. Le coordinate vengono rimosse automaticamente al termine della guida.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8F7F3] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-xs">
                <div>
                  <strong className="text-slate-900 dark:text-white font-bold">Dispositivo autorizzato: </strong>
                  <span className="text-slate-700 dark:text-slate-300">{props.deviceLabel}</span>
                  {props.remoteGpsLease && (
                    <span className="block mt-0.5 text-[11px] text-slate-500">
                      Titolare guida: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">{props.remoteGpsLease.holderDeviceId.slice(0, 10)}…</code>
                    </span>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Il GPS rilevato resta locale e non viene trasmesso agli ospiti fino all&apos;avvio esplicito della condivisione LIVE.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isLeaseStopped && (
                    <>
                      {props.isOwner ? (
                        <button
                          type="button"
                          disabled={props.isDetectingGps || !props.online}
                          onClick={props.onStartGps}
                          className="hounigo-button-primary px-4 py-2 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <span>📡</span>
                          <span>{props.isDetectingGps ? 'Avvio in corso…' : 'Avvia condivisione LIVE'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500 italic">
                          In attesa dell&apos;Organizzatore per avviare la condivisione.
                        </span>
                      )}
                    </>
                  )}

                  {isLeaseActive && (
                    <>
                      {props.isGpsHolder ? (
                        <>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onPauseGps}
                            className="hounigo-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏸️</span>
                            <span>Metti in pausa</span>
                          </button>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {props.isOwner && (
                            <button
                              type="button"
                              disabled={props.isDetectingGps || !props.online}
                              onClick={props.onRevokeGps}
                              className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              <span>🔄</span>
                              <span>Riprendi guida</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {isLeasePaused && (
                    <>
                      {props.isOwner ? (
                        <>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onResumeGps}
                            className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>▶️</span>
                            <span>Riprendi trasmissione</span>
                          </button>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500 italic">
                          In pausa (la ripresa richiede l&apos;Organizzatore).
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* TRASFERIMENTO GUIDA AL COPILOTA */}
              {props.isOwner && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 bg-white dark:bg-slate-900/40 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>🤝</span>
                        <span>Trasferimento temporaneo guida GPS</span>
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Consente a un Copilota di trasmettere la posizione dal proprio telefono senza cedere la proprietà.
                      </p>
                    </div>

                    {eligibleCopilots.length > 0 ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={selectedCopilotDevice}
                          onChange={(e) => setSelectedCopilotDevice(e.target.value)}
                          className="hounigo-card-subtle text-xs py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">Seleziona dispositivo copilota…</option>
                          {eligibleCopilots.map(dev => (
                            <option key={dev.deviceId} value={`${dev.uid}:::${dev.deviceId}`}>
                              {dev.label} ({dev.deviceId.slice(0, 6)}…)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedCopilotDevice || props.isDetectingGps || !props.online}
                          onClick={() => {
                            const [copilotUid, copilotDeviceId] = selectedCopilotDevice.split(':::');
                            if (copilotUid && copilotDeviceId && props.onTransferGps) {
                              props.onTransferGps(copilotUid, copilotDeviceId);
                            }
                          }}
                          className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                        >
                          Trasferisci guida
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Nessun copilota online collegato.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── 02 · GALLERIA FOTOGRAFICA LIVE (FASE 1) ──────────────────── */}
      <section aria-labelledby="live-gallery-title" className="mb-12">
        <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              02 · Scatti dal vivo
            </p>
            <h2 id="live-gallery-title" className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white">
              Galleria fotografica
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {displayPhotos.length} {displayPhotos.length === 1 ? 'fotografia' : 'fotografie'}
            </span>

            {/* PULSANTE CARICA FOTO PER ORGANIZZATORE */}
            {props.canPublish && !props.isExternal && (
              <>
                <input
                  type="file"
                  ref={fileUploadInputRef}
                  onChange={handlePhotoFileSelected}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileUploadInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="hounigo-button-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
                  title="Scatta o carica una foto dallo smartphone"
                >
                  <span>📷</span>
                  <span>{isUploadingPhoto ? 'Caricamento…' : '+ Aggiungi foto'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* MODAL DI ANTEPRIMA E CONFERMA DIDASCALIA FOTO */}
        {pendingUploadPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
            <div className="bg-white dark:bg-[#172033] rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <span>📷</span> Nuova Foto per la Galleria
                </h3>
                <button
                  type="button"
                  onClick={handleCancelPhotoUpload}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden aspect-video border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                <img
                  src={pendingUploadPreview}
                  alt="Anteprima caricamento"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Didascalia o Luogo
                </label>
                <input
                  type="text"
                  value={pendingCaptionInput}
                  onChange={(e) => setPendingCaptionInput(e.target.value)}
                  placeholder="es. Spiaggia di Muri • Rarotonga"
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6B5F]"
                />
              </div>

              {uploadError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{uploadError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelPhotoUpload}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={handleConfirmPhotoUpload}
                  className="flex-1 py-2 text-xs font-bold text-white bg-[#FF6B5F] hover:bg-[#ed5d52] rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isUploadingPhoto ? 'Salvataggio…' : 'Salva e Condividi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SLIDER CAROUSEL ORIZZONTALE TOUCH-FRIENDLY */}
        {displayPhotos.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-8 sm:p-12 text-center bg-slate-50/50 dark:bg-slate-900/30">
            <span className="text-3xl block mb-2">📸</span>
            <p className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
              Nessuna fotografia condivisa finora
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              {props.canPublish && !props.isExternal
                ? 'Tocca "+ Aggiungi foto" per scattare una fotografia o selezionarla dal rullino e condividerla istantaneamente con gli ospiti.'
                : 'Gli organizzatori pubblicheranno qui gli scatti più emozionanti durante il percorso.'}
            </p>
          </div>
        ) : (
          <div className="relative">
            <div
              className="flex gap-3.5 sm:gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scroll-smooth no-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {displayPhotos.map((photo, idx) => (
                <div
                  key={photo.id || idx}
                  className="group relative flex-none w-[260px] sm:w-[300px] aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-sm snap-start cursor-pointer select-none"
                  onClick={() => setActiveLightboxIndex(idx)}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Scatto del viaggio'}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=75';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent pointer-events-none" />

                  {/* BADGES SUPERIORI */}
                  <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1 z-10">
                    <span className="px-2 py-0.5 rounded-full bg-slate-950/70 backdrop-blur-md text-white text-[10px] font-bold border border-white/20">
                      📸 {idx + 1} di {displayPhotos.length}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* PULSANTE ELIMINAZIONE FOTO PER ORGANIZZATORE (FASE 1) */}
                      {props.canPublish && !props.isExternal && props.onDeletePhoto && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Vuoi davvero eliminare questa fotografia dalla galleria?')) {
                              props.onDeletePhoto!(photo.id);
                            }
                          }}
                          className="px-2 py-1 rounded-full bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white text-[10px] font-bold backdrop-blur-md transition-colors cursor-pointer border border-rose-500/30 flex items-center gap-1"
                          title="Elimina fotografia"
                        >
                          <span>🗑️</span>
                          <span className="hidden sm:inline">Elimina</span>
                        </button>
                      )}

                      <span className="p-1 rounded-full bg-slate-950/70 backdrop-blur-md text-white text-xs border border-white/20 opacity-90 group-hover:opacity-100 transition-opacity">
                        🔍
                      </span>
                    </div>
                  </div>

                  {/* DIDASCALIA E DATA INFERIORI */}
                  <div className="absolute inset-x-0 bottom-0 p-3 z-10 text-white">
                    {photo.location && (
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF6B5F] truncate">
                        📍 {photo.location}
                      </p>
                    )}
                    <p className="text-xs font-bold text-white truncate mt-0.5">
                      {photo.caption || 'Momento dal vivo'}
                    </p>
                    {photo.timestamp > 0 && (
                      <span className="text-[10px] text-white/70 block mt-0.5">
                        {formatRelativeTime(new Date(photo.timestamp))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 text-center sm:text-left">
              Scorri orizzontalmente per vedere tutti gli scatti · Tocca una foto per ingrandirla a schermo intero
            </p>
          </div>
        )}
      </section>

      {/* ─── 03 · CARTOLINA DI VIAGGIO: DIARIO PUBBLICO (FASE 2) ──────── */}
      <section aria-labelledby="live-diary-title" className="mb-12">
        <div className="flex items-end justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 mb-5 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              02 · Diario
            </p>
            <h2 id="live-diary-title" className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white">
              Cartoline dal viaggio
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {sortedUpdates.length} {sortedUpdates.length === 1 ? 'messaggio' : 'messaggi'}
          </span>
        </div>

        {/* MESSAGGIO IN EVIDENZA DAGLI ORGANIZZATORI */}
        <article className="border-l-3 border-[#FF6B5F] pl-4 sm:pl-5 mb-8 bg-slate-50/70 dark:bg-slate-900/40 py-3 rounded-r-2xl pr-4 border-y border-r border-slate-200/60 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Messaggio dagli organizzatori
            </h3>
            {props.canPublish && !props.isExternal && (
              <button
                type="button"
                onClick={props.onToggleStatusEdit}
                className="text-xs font-bold text-[#FF6B5F] hover:underline cursor-pointer"
              >
                {props.isEditingStatus ? 'Annulla' : '✏️ Modifica'}
              </button>
            )}
          </div>
          {props.isEditingStatus ? (
            <div className="mt-3 space-y-2">
              <textarea
                rows={3}
                value={props.tempStatus}
                onChange={(event) => props.onTempStatusChange(event.target.value)}
                className="w-full hounigo-card-subtle rounded-xl p-3 text-sm resize-none border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={props.onSaveStatus}
                className="hounigo-button-primary px-4 py-2 text-xs font-bold"
              >
                Pubblica messaggio
              </button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm sm:text-base leading-relaxed font-serif italic text-slate-800 dark:text-slate-100">
                “{props.statusMessage}”
              </p>
              <time className="mt-2 block text-[11px] text-slate-400 dark:text-slate-500">
                Aggiornato: {props.statusUpdatedAt}
              </time>
            </>
          )}
        </article>

        {/* FORM NUOVO AGGIORNAMENTO PUBBLICO (SOLO PER ORGANIZZATORE) */}
        {props.canPublish && !props.isExternal && (
          <form onSubmit={props.onSendMessage} className="mb-8 p-4 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex justify-between items-center gap-2 mb-2">
              <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>✍️</span>
                <span>Nuova cartolina dal vivo</span>
              </label>
              <span className="text-[10px] text-slate-400">{props.liveTextMessage.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={props.liveTextMessage}
              onChange={(event) => props.onLiveTextChange(event.target.value)}
              placeholder="Un luogo, un incontro, un momento da condividere con chi vi segue da casa…"
              className="w-full rounded-xl p-3 text-sm resize-none border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6B5F]"
            />
            {props.messageError && <p className="mt-2 text-xs font-semibold text-rose-600">{props.messageError}</p>}
            {props.messageSuccess && <p className="mt-2 text-xs font-semibold text-emerald-600">{props.messageSuccess}</p>}
            <div className="mt-2.5 flex justify-end">
              <button
                type="submit"
                disabled={props.isSendingMessage || !props.liveTextMessage.trim() || !props.online}
                className="hounigo-button-primary px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                {props.isSendingMessage ? 'Pubblicazione…' : 'Pubblica cartolina'}
              </button>
            </div>
          </form>
        )}

        {/* LISTA DEI MESSAGGI PAGINATA (10 PER PAGINA) */}
        {sortedUpdates.length === 0 ? (
          <div className="hounigo-empty-state py-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <p className="font-extrabold text-slate-800 dark:text-slate-100">Il diario è ancora vuoto</p>
            <p className="mt-1 text-xs text-slate-500">Gli aggiornamenti pubblici compariranno qui in ordine cronologico.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedUpdates.map((update) => (
              <article
                key={update.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <time className="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500">
                        {formatUpdateDate(update.timestamp)}
                      </time>
                      {update.locationName && (
                        <span className="text-[11px] font-bold text-[#FF6B5F] bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200/60 dark:border-rose-900/40">
                          📍 {update.locationName}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-slate-950 dark:text-white mt-1">
                      {update.title}
                    </h3>
                  </div>

                  {/* PULSANTE ELIMINA AGGIORNAMENTO PER ORGANIZZATORE (FASE 2) */}
                  {props.canPublish && !props.isExternal && props.onDeleteUpdate && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Sei sicuro di voler eliminare questa cartolina dal diario pubblico? L'operazione non può essere annullata.")) {
                          props.onDeleteUpdate!(update.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 px-2.5 py-1 rounded-lg border border-rose-200/80 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                      title="Elimina messaggio dal diario"
                    >
                      <span>🗑️</span>
                      <span>Elimina</span>
                    </button>
                  )}
                </div>

                {update.text && (
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {update.text}
                  </p>
                )}

                {update.photoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      const idx = displayPhotos.findIndex(p => p.url === update.photoUrl || p.id === update.id);
                      setActiveLightboxIndex(idx >= 0 ? idx : 0);
                    }}
                    className="mt-3.5 block w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 max-h-[380px] group cursor-pointer"
                  >
                    <img
                      src={update.photoUrl}
                      alt={update.title}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      loading="lazy"
                    />
                  </button>
                )}

                {/* REAZIONI */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {REACTIONS.map((emoji) => {
                      const selected = props.reactions[update.id] === emoji;
                      const count = (update.reactionCounts?.[emoji] || 0) + (selected ? 1 : 0);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          disabled={!props.online}
                          onClick={() => props.onReaction(update.id, emoji)}
                          className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                            selected
                              ? 'border-[#FF6B5F] bg-[#FFF0ED] text-slate-900 font-bold shadow-2xs'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {emoji}{count > 0 ? ` ${count}` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}

            {/* CONTROLLI DI PAGINAZIONE REALE (10 ELEMENTI PER PAGINA) */}
            {totalDiaryPages > 1 && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Pagina <strong>{diaryPage}</strong> di <strong>{totalDiaryPages}</strong> · {sortedUpdates.length} aggiornamenti
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={diaryPage <= 1}
                    onClick={() => setDiaryPage(prev => Math.max(1, prev - 1))}
                    className="hounigo-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Precedenti
                  </button>

                  {/* Pills delle pagine */}
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: totalDiaryPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setDiaryPage(page)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          page === diaryPage
                            ? 'bg-[#FF6B5F] text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={diaryPage >= totalDiaryPages}
                    onClick={() => setDiaryPage(prev => Math.min(totalDiaryPages, prev + 1))}
                    className="hounigo-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Successivi →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── 03 · INTERAZIONI E LINEE GUIDA OSPITI ────────────────────── */}
      <section aria-labelledby="live-interactions-title" className="border-t border-slate-200 dark:border-slate-800 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          03 · Interazioni
        </p>
        <h2 id="live-interactions-title" className="text-xl font-extrabold text-slate-950 dark:text-white">
          Segui e partecipa
        </h2>
        <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Il link LIVE funziona senza registrazione. Gli ospiti possono leggere il diario e usare le reazioni consentite; non possono vedere documenti, prenotazioni, spese o inviare messaggi testuali.
        </p>
        <button
          type="button"
          onClick={props.onShare}
          className="hounigo-button-secondary mt-4 px-4 py-2.5 text-xs font-bold"
        >
          {props.copiedLink ? '✓ Link copiato!' : 'Copia o condividi il link per gli ospiti'}
        </button>
      </section>

      {/* ─── FULLSCREEN TOUCH-FRIENDLY LIGHTBOX SLIDER ────────────────── */}
      {activeLightboxIndex !== null && displayPhotos[activeLightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-fade-in select-none"
          onClick={() => setActiveLightboxIndex(null)}
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const diffX = e.changedTouches[0].clientX - touchStartX;
            if (diffX > 45 && activeLightboxIndex > 0) {
              setActiveLightboxIndex(activeLightboxIndex - 1);
            } else if (diffX < -45 && activeLightboxIndex < displayPhotos.length - 1) {
              setActiveLightboxIndex(activeLightboxIndex + 1);
            }
            setTouchStartX(null);
          }}
        >
          {/* Top Bar: Contatore & Pulsanti */}
          <div
            className="flex items-center justify-between text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                📸 {activeLightboxIndex + 1} di {displayPhotos.length}
              </span>
              {displayPhotos[activeLightboxIndex].location && (
                <span className="text-xs text-white/80 hidden sm:inline-flex items-center gap-1">
                  <span>📍</span>
                  <span>{displayPhotos[activeLightboxIndex].location}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Elimina foto dentro lightbox (per organizzatore) */}
              {props.canPublish && !props.isExternal && props.onDeletePhoto && (
                <button
                  type="button"
                  onClick={() => {
                    const currentPhoto = displayPhotos[activeLightboxIndex];
                    if (window.confirm('Vuoi davvero eliminare questa fotografia dalla galleria?')) {
                      props.onDeletePhoto!(currentPhoto.id);
                      if (displayPhotos.length <= 1) {
                        setActiveLightboxIndex(null);
                      } else {
                        setActiveLightboxIndex(Math.max(0, activeLightboxIndex - 1));
                      }
                    }
                  }}
                  className="px-3 py-1 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
                  title="Elimina fotografia"
                >
                  🗑️ Elimina foto
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveLightboxIndex(null)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                title="Chiudi (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Immagine centrata con frecce laterali */}
          <div className="flex-1 flex items-center justify-between gap-2 sm:gap-4 my-auto relative max-h-[80vh]">
            <button
              type="button"
              disabled={activeLightboxIndex <= 0}
              onClick={(e) => {
                e.stopPropagation();
                if (activeLightboxIndex > 0) setActiveLightboxIndex(activeLightboxIndex - 1);
              }}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl transition-all cursor-pointer shrink-0 z-20 ${
                activeLightboxIndex > 0
                  ? 'bg-white/20 hover:bg-white/40 active:scale-95'
                  : 'opacity-20 cursor-not-allowed'
              }`}
              title="Foto precedente (◀)"
            >
              ❮
            </button>

            <div
              className="flex-1 flex flex-col items-center justify-center max-h-full max-w-full overflow-hidden p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={displayPhotos[activeLightboxIndex].url}
                alt={displayPhotos[activeLightboxIndex].caption || 'Fotografia del viaggio'}
                className="max-h-[72vh] max-w-full object-contain rounded-2xl shadow-2xl transition-transform duration-200"
              />
              {displayPhotos[activeLightboxIndex].caption && (
                <p className="text-white/95 text-center text-xs sm:text-sm font-semibold mt-3 px-4 max-w-xl line-clamp-2">
                  {displayPhotos[activeLightboxIndex].caption}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={activeLightboxIndex >= displayPhotos.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                if (activeLightboxIndex < displayPhotos.length - 1) {
                  setActiveLightboxIndex(activeLightboxIndex + 1);
                }
              }}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl transition-all cursor-pointer shrink-0 z-20 ${
                activeLightboxIndex < displayPhotos.length - 1
                  ? 'bg-white/20 hover:bg-white/40 active:scale-95'
                  : 'opacity-20 cursor-not-allowed'
              }`}
              title="Foto successiva (▶)"
            >
              ❯
            </button>
          </div>

          {/* Bottom Bar: Data e suggerimenti swipe/tastiera */}
          <div
            className="flex items-center justify-between text-white/70 text-[11px] z-10 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {displayPhotos[activeLightboxIndex].timestamp > 0 && (
                <span>
                  {formatUpdateDate(displayPhotos[activeLightboxIndex].timestamp)}
                </span>
              )}
            </div>
            <span className="opacity-75">
              Scorri con il dito ↔ o usa le frecce della tastiera ◀ ▶ · Esc per chiudere
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
