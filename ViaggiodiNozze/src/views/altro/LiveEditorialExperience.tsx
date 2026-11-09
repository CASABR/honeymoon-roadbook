import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LiveUpdate, LiveGuestMessage } from '../../services/liveService';
import { GPS_STALE_THRESHOLD_MS, type LiveGpsDevice, type LiveGpsLease, type LiveGpsLocation } from '../../services/liveGpsService';
import type { LiveIntelligenceState } from '../../utils/liveIntelligenceHelper';
import { getTripConfig } from '../../utils/tripConfig';
import { IMAGE_FILE_ACCEPT, isSupportedImageFile } from '../../utils/fileAttachment';
import { FEATURE_FLAGS } from '../../config/featureFlags';

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
  isOnline?: boolean;
  canControlGps: boolean;
  deviceLabel: string;
  onDetectGps?: () => void;
  remoteGpsLease?: LiveGpsLease | null;
  remoteGpsLocation?: LiveGpsLocation | null;
  isGpsHolder?: boolean;
  isDesignatedGuide?: boolean;
  isOwner?: boolean;
  isCopilota?: boolean;
  gpsDevices?: LiveGpsDevice[];
  tripMembers?: { uid: string; name: string; role: string }[];
  membersMap?: Record<string, string>;
  ownerName?: string;
  ownerUid?: string;
  onStartGps?: () => void;
  onPauseGps?: () => void;
  onResumeGps?: () => void;
  onStopGps?: () => void;
  onTransferGps?: (uid: string, deviceId?: string) => Promise<void> | void;
  onRevokeGps?: () => Promise<void> | void;
  liveIntelligence?: LiveIntelligenceState | null;
  mapCenterMode?: 'both' | 'real' | 'planned';
  onChangeMapCenterMode?: (mode: 'both' | 'real' | 'planned') => void;
  realMarkerOffset?: { dx: number; dy: number } | null;
  plannedMarkerOffset?: { dx: number; dy: number } | null;
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
  galleryPhotos?: LiveGalleryPhotoItem[];
  onUploadPhoto?: (file: File, caption?: string) => Promise<void>;
  onDeletePhoto?: (photoId: string) => void;
  onDeleteUpdate?: (updateId: string) => Promise<void>;
  guestMessages?: LiveGuestMessage[];
  onSendGuestMessage?: (authorName: string, message: string) => Promise<void>;
  onModerateGuestMessage?: (messageId: string, action: 'hide' | 'unhide' | 'delete') => Promise<void>;
}

const REACTIONS = ['❤️', '😍', '😂', '👋'];
const PAGE_SIZE = 10;

export function parseSafeDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : date;
  if (typeof date === 'number') {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof date === 'object' && typeof date.toDate === 'function') {
    try {
      const parsed = date.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLastDetectedTimestamp(date: any): string | null {
  const parsed = parseSafeDate(date);
  if (!parsed) return null;
  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(parsed);
  const day = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(parsed);
  return `Aggiornata ${time} · ${day}`;
}

function formatUpdateDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 20) return 'ora';
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export default function LiveEditorialExperience(props: LiveEditorialExperienceProps) {
  const tripConfig = getTripConfig();
  const tripTitle = props.isExternal
    ? 'Diario di viaggio'
    : tripConfig?.title || props.location?.city || 'Il nostro viaggio';
  const isOnline = props.isOnline ?? (typeof navigator === 'undefined' || navigator.onLine);
  const rawLeaseActive = props.remoteGpsLease?.status === 'active';
  const isLeaseExpired = Boolean(rawLeaseActive && props.remoteGpsLease && props.remoteGpsLease.expiresAt.getTime() <= Date.now());
  const isLeaseActive = Boolean(rawLeaseActive && !isLeaseExpired);
  const isLeasePaused = props.remoteGpsLease?.status === 'paused';
  const isLeaseStopped = !props.remoteGpsLease || props.remoteGpsLease.status === 'stopped';
  const lastDetectedDate = props.remoteGpsLocation?.updatedAt
    ? parseSafeDate(props.remoteGpsLocation.updatedAt)
    : null;
  const ageMs = lastDetectedDate ? Math.max(0, Date.now() - lastDetectedDate.getTime()) : Number.POSITIVE_INFINITY;
  const isFreshGps = Boolean(
    isLeaseActive &&
    lastDetectedDate &&
    ageMs < GPS_STALE_THRESHOLD_MS
  );
  const isStaleGps = Boolean(
    lastDetectedDate &&
    ageMs >= GPS_STALE_THRESHOLD_MS
  );
  const hasRealLocation = Boolean((isFreshGps || (!props.isExternal && lastDetectedDate && props.remoteGpsLocation?.status !== 'stopped')) && props.remoteGpsLocation);
  const plannedLocation = props.liveIntelligence?.plannedLocation || null;
  const hasPlannedLocation = Boolean(!props.isExternal && plannedLocation?.coords);
  const showRealMarker = hasRealLocation && props.mapCenterMode !== 'planned';
  const showPlannedMarker = hasPlannedMarkerCheck(hasPlannedLocation, props.mapCenterMode);
  const permissionDenied = Boolean(props.gpsError && /permess|denied|negat|autorizzat/i.test(props.gpsError));

  function hasPlannedMarkerCheck(hasPlanned: boolean, mode?: 'both' | 'real' | 'planned') {
    return hasPlanned && mode !== 'real';
  }

  const gpsVisualState = useMemo(() => {
    if (!isOnline || permissionDenied) {
      return { label: 'GPS non disponibile', tone: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' };
    }
    if (props.isDetectingGps) {
      return { label: 'Rilevamento posizione…', tone: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500 motion-safe:animate-pulse' };
    }
    if (isFreshGps) {
      return { label: 'GPS attivo', tone: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' };
    }
    if (isStaleGps && (isLeaseActive || hasRealLocation)) {
      return { label: 'Ultima posizione aggiornata', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
    }
    if (isLeasePaused || isLeaseStopped || isLeaseExpired || props.remoteGpsLease?.status === 'stopped') {
      return { label: 'Condivisione interrotta', tone: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' };
    }
    if (isLeaseActive && !hasRealLocation) {
      return { label: 'GPS non disponibile', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
    }
    return { label: 'Condivisione interrotta', tone: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' };
  }, [isOnline, permissionDenied, props.isDetectingGps, isFreshGps, isStaleGps, isLeaseActive, hasRealLocation, isLeasePaused, isLeaseStopped, isLeaseExpired, props.remoteGpsLease?.status]);

  const currentGuideName = useMemo(() => {
    const holderUid = props.remoteGpsLease?.holderUid;
    if (!holderUid) return props.ownerName || 'Organizzatore';
    if (props.membersMap?.[holderUid]) return props.membersMap[holderUid];
    if (holderUid === props.ownerUid) return props.ownerName || 'Organizzatore';
    return props.tripMembers?.find(member => member.uid === holderUid)?.name || 'Copilota';
  }, [props.remoteGpsLease?.holderUid, props.membersMap, props.ownerUid, props.ownerName, props.tripMembers]);

  const copilots = useMemo(() => {
    const candidates = new Map<string, { uid: string; name: string; deviceId?: string }>();
    props.tripMembers?.forEach(member => {
      if (member.role === 'copilota' && member.uid !== props.ownerUid) {
        candidates.set(member.uid, { uid: member.uid, name: member.name || 'Copilota' });
      }
    });
    props.gpsDevices?.forEach(device => {
      if (device.role !== 'copilota' || !device.uid || device.uid === props.ownerUid) return;
      const current = candidates.get(device.uid);
      candidates.set(device.uid, {
        uid: device.uid,
        name: current?.name || props.membersMap?.[device.uid] || device.label || 'Copilota',
        deviceId: device.deviceId
      });
    });
    return [...candidates.values()];
  }, [props.tripMembers, props.gpsDevices, props.ownerUid, props.membersMap]);

  const displayPhotos = useMemo<LiveGalleryPhotoItem[]>(() => {
    if (props.galleryPhotos?.length) return [...props.galleryPhotos].sort((a, b) => b.timestamp - a.timestamp);
    return props.updates
      .filter(update => Boolean(update.photoUrl))
      .map(update => ({
        id: update.id,
        url: update.photoUrl || '',
        caption: update.title || update.text || 'Scatto dal viaggio',
        location: update.locationName,
        timestamp: update.timestamp || Date.now(),
        isCustom: false
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [props.galleryPhotos, props.updates]);

  const sortedUpdates = useMemo(
    () => [...props.updates].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [props.updates]
  );
  const reactionTotal = useMemo(
    () => sortedUpdates.reduce((total, update) => total + Object.values(update.reactionCounts || {}).reduce((sum, count) => sum + count, 0), 0),
    [sortedUpdates]
  );

  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [isGuideControlsOpen, setIsGuideControlsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [diaryPage, setDiaryPage] = useState(1);
  const [isHandoverLoading, setIsHandoverLoading] = useState(false);
  const [handoverFeedback, setHandoverFeedback] = useState<string | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingUploadItems, setPendingUploadItems] = useState<Array<{ id: string; file: File; preview: string; name: string }>>([]);
  const [pendingCaptionInput, setPendingCaptionInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoRevealVersion, setPhotoRevealVersion] = useState(0);
  const [guestAuthorInput, setGuestAuthorInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('hounigo_guest_author_name') || '';
  });
  const [guestMessageInput, setGuestMessageInput] = useState('');
  const [isSendingGuestMsg, setIsSendingGuestMsg] = useState(false);
  const [guestMsgError, setGuestMsgError] = useState<string | null>(null);
  const [guestMsgSuccess, setGuestMsgSuccess] = useState<string | null>(null);

  const handleGuestMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!props.onSendGuestMessage || isSendingGuestMsg) return;
    setGuestMsgError(null);
    setGuestMsgSuccess(null);
    setIsSendingGuestMsg(true);
    try {
      const cleanAuthor = guestAuthorInput.trim();
      const cleanMsg = guestMessageInput.trim();
      await props.onSendGuestMessage(cleanAuthor, cleanMsg);
      if (typeof window !== 'undefined' && cleanAuthor) {
        try {
          localStorage.setItem('hounigo_guest_author_name', cleanAuthor);
        } catch {}
      }
      setGuestMessageInput('');
      setGuestMsgSuccess('Messaggio inviato agli sposi! ❤️');
    } catch (err: any) {
      setGuestMsgError(err?.message || 'Impossibile inviare il messaggio. Riprova.');
    } finally {
      setIsSendingGuestMsg(false);
    }
  };
  const previousRealMarkerOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const currentRealMarkerDx = props.realMarkerOffset?.dx;
  const currentRealMarkerDy = props.realMarkerOffset?.dy;
  const shouldSmoothRealMarker = Boolean(
    showRealMarker &&
    currentRealMarkerDx !== undefined &&
    currentRealMarkerDy !== undefined &&
    previousRealMarkerOffsetRef.current &&
    (props.remoteGpsLocation?.accuracy ?? Number.POSITIVE_INFINITY) <= 100 &&
    Math.hypot(
      currentRealMarkerDx - previousRealMarkerOffsetRef.current.dx,
      currentRealMarkerDy - previousRealMarkerOffsetRef.current.dy
    ) <= 120
  );

  useEffect(() => {
    if (showRealMarker && currentRealMarkerDx !== undefined && currentRealMarkerDy !== undefined) {
      previousRealMarkerOffsetRef.current = { dx: currentRealMarkerDx, dy: currentRealMarkerDy };
    }
  }, [showRealMarker, currentRealMarkerDx, currentRealMarkerDy]);

  const totalDiaryPages = Math.max(1, Math.ceil(sortedUpdates.length / PAGE_SIZE));
  const paginatedUpdates = useMemo(() => {
    const start = (diaryPage - 1) * PAGE_SIZE;
    return sortedUpdates.slice(start, start + PAGE_SIZE);
  }, [sortedUpdates, diaryPage]);

  useEffect(() => {
    if (activeLightboxIndex === null && pendingUploadItems.length === 0) return;
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeLightboxIndex === null) return;
      if (event.key === 'Escape') setActiveLightboxIndex(null);
      if (event.key === 'ArrowLeft') setActiveLightboxIndex(index => index !== null && index > 0 ? index - 1 : index);
      if (event.key === 'ArrowRight') setActiveLightboxIndex(index => index !== null && index < displayPhotos.length - 1 ? index + 1 : index);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [activeLightboxIndex, displayPhotos.length, pendingUploadItems.length]);

  useEffect(() => {
    if (props.messageSuccess) setIsComposerOpen(false);
  }, [props.messageSuccess]);

  const handlePhotoFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    const valid: Array<{ id: string; file: File; preview: string; name: string }> = [];
    const rejected: string[] = [];
    files.forEach(file => {
      if (!isSupportedImageFile(file) || file.size > 15 * 1024 * 1024) {
        rejected.push(file.name);
        return;
      }
      valid.push({
        id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      });
    });
    setUploadError(rejected.length ? `Non posso usare: ${rejected.slice(0, 2).join(', ')}. Scegli immagini fino a 15 MB.` : null);
    setPendingUploadItems(current => [...current, ...valid]);
    event.target.value = '';
  };

  const clearPendingPhotos = () => {
    pendingUploadItems.forEach(item => URL.revokeObjectURL(item.preview));
    setPendingUploadItems([]);
    setPendingCaptionInput('');
    setUploadError(null);
  };

  const handleConfirmPhotoUpload = async () => {
    if (!pendingUploadItems.length || !props.onUploadPhoto) return;
    setIsUploadingPhoto(true);
    setUploadError(null);
    try {
      for (const item of pendingUploadItems) {
        await props.onUploadPhoto(item.file, pendingCaptionInput.trim() || undefined);
      }
      clearPendingPhotos();
      setPhotoRevealVersion(version => version + 1);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Foto non salvata. Riprova.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const runHandover = async (action: () => Promise<void> | void, success: string) => {
    setIsHandoverLoading(true);
    setHandoverFeedback(null);
    try {
      await action();
      setHandoverFeedback(success);
    } catch (error) {
      setHandoverFeedback(error instanceof Error ? error.message : 'Operazione non riuscita.');
    } finally {
      setIsHandoverLoading(false);
    }
  };

  const visiblePhotos = showAllPhotos ? displayPhotos : displayPhotos.slice(0, 5);

  const renderUpdateCard = (update: LiveUpdate) => (
    <article key={update.id} className="border-b border-slate-200 py-5 last:border-0 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <time className="text-[11px] font-semibold text-slate-400">{formatUpdateDate(update.timestamp)}</time>
          <h3 className="mt-1 text-base font-extrabold leading-snug text-[#172033] dark:text-white">{update.title}</h3>
          {update.locationName && <p className="mt-1 truncate text-xs font-semibold text-[#FF6B5F]">⌖ {update.locationName}</p>}
        </div>
        {props.canPublish && !props.isExternal && props.onDeleteUpdate && (
          <button
            type="button"
            onClick={() => window.confirm('Rimuovere questo ricordo dal diario pubblico?') && props.onDeleteUpdate?.(update.id)}
            className="min-h-10 shrink-0 px-2 text-xs font-bold text-rose-600 hover:text-rose-700"
            aria-label="Elimina ricordo"
          >
            Elimina
          </button>
        )}
      </div>
      {update.text && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{update.text}</p>}
      {update.photoUrl && (
        <button
          type="button"
          onClick={() => {
            const index = displayPhotos.findIndex(photo => photo.url === update.photoUrl || photo.id === update.id);
            setActiveLightboxIndex(index >= 0 ? index : 0);
          }}
          className="mt-4 block w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900"
        >
          <img src={update.photoUrl} alt={update.title} className="max-h-[480px] w-full object-contain" loading="lazy" />
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Reazioni">
        {REACTIONS.map(emoji => {
          const selected = props.reactions[update.id] === emoji;
          const count = update.reactionCounts?.[emoji] || 0;
          return (
            <button
              key={emoji}
              type="button"
              disabled={!isOnline}
              onClick={() => props.onReaction(update.id, emoji)}
              className={`min-h-10 rounded-full border px-3 text-sm transition motion-reduce:transition-none disabled:opacity-40 ${selected ? 'border-[#FF6B5F] bg-[#FFF0ED] text-[#172033]' : 'border-slate-200 bg-transparent text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
              aria-pressed={selected}
              aria-label={`Reazione ${emoji}${count ? `, ${count}` : ''}`}
            >
              {emoji}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>
    </article>
  );

  return (
    <div className="hounigo-live-entry mx-auto w-full max-w-5xl lg:max-w-7xl overflow-x-hidden px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-slate-900 dark:text-slate-100 sm:px-6">
      <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {!props.isExternal && props.onBack && (
              <button type="button" onClick={props.onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800" aria-label="Torna ad Altro">←</button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-[0.18em] text-[#FF6B5F]">LIVE</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${gpsVisualState.tone}`}>
                  <span className={`h-2 w-2 rounded-full ${gpsVisualState.dot}`} />
                  {gpsVisualState.label}
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-[#172033] dark:text-white sm:text-2xl">{tripTitle}</h1>
              <p className="mt-0.5 text-xs text-slate-500">Il viaggio, mentre accade.</p>
            </div>
          </div>
          <button type="button" onClick={props.onShare} className="min-h-11 shrink-0 rounded-full bg-[#172033] px-4 text-xs font-bold text-white dark:bg-white dark:text-[#172033]">
            {props.copiedLink ? 'Copiato ✓' : 'Condividi'}
          </button>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* BANNER DESKTOP ELEGANTE (SOLO VISTA PUBBLICA OSPITI, SOLO DESKTOP) */}
      {/* Su smartphone e tablet: hidden, zero spazio */}
      {/* ───────────────────────────────────────────────────────────── */}
      {props.isExternal && (
        <div data-testid="desktop-live-banner" className="hidden lg:block mt-6 mb-2 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#172033] p-6 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#FF6B5F]/10 via-[#FFF0ED]/40 to-transparent dark:from-[#FF6B5F]/10 dark:via-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] text-xs font-black uppercase tracking-widest mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#FF6B5F] animate-ping" />
                  Segui il viaggio in diretta
                </div>
                <h2 className="text-2xl xl:text-3xl font-black text-[#172033] dark:text-white tracking-tight">
                  {tripTitle}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Benvenuti nella finestra LIVE di HOUNIGO per gli ospiti: segui le tappe, la posizione aggiornata e i ricordi condivisi in tempo reale.
                </p>
              </div>

              {/* Statistiche rapide del Live */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[80px]">
                  <p className="text-xl font-black text-[#172033] dark:text-white">{sortedUpdates.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ricordi</p>
                </div>
                <div className="px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[80px]">
                  <p className="text-xl font-black text-[#172033] dark:text-white">{displayPhotos.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Foto</p>
                </div>
                <div className="px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[80px]">
                  <p className="text-xl font-black text-[#172033] dark:text-white">{reactionTotal}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reazioni</p>
                </div>
              </div>
            </div>

            {/* Tre schede con distinzione chiara fra i 3 stati */}
            <div className="grid grid-cols-3 gap-3.5 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80">
              {/* 1. Posizione Attuale */}
              <div className="rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${hasRealLocation && !isStaleGps ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                      Posizione Attuale (GPS Live)
                    </p>
                  </div>
                  <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                    {hasRealLocation && !isStaleGps
                      ? (props.remoteGpsLocation?.city || 'Trasmessa in tempo reale')
                      : 'Nessuna trasmissione in corso'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {hasRealLocation && !isStaleGps ? 'Segnale GPS live attivo' : 'La guida condivide la posizione a intervalli'}
                </p>
              </div>

              {/* 2. Ultima Posizione Nota */}
              <div className="rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                      Ultima Posizione Nota
                    </p>
                  </div>
                  <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                    {hasRealLocation
                      ? (props.remoteGpsLocation?.city || 'Rilevamento registrato')
                      : 'In attesa del primo fix'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {hasRealLocation && lastDetectedDate ? formatLastDetectedTimestamp(lastDetectedDate) : 'Nessun fix registrato nelle ultime ore'}
                </p>
              </div>

              {/* 3. Itinerario Previsto */}
              <div className="rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                      Itinerario Previsto
                    </p>
                  </div>
                  <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                    {plannedLocation?.title || 'Secondo la tabella di marcia'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {plannedLocation?.coords ? 'Tappa da programma roadbook' : 'Da pianificazione del viaggio'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="sticky top-0 z-30 -mx-3 grid grid-cols-3 border-b border-slate-200 bg-[#F8F7F3]/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-[#172033]/95 sm:-mx-6 sm:px-6" aria-label="Sezioni LIVE">
        <a href="#live-position" className="min-h-10 rounded-full px-2 py-2 text-center text-xs font-bold hover:bg-white dark:hover:bg-slate-800">Posizione</a>
        <a href="#live-diary" className="min-h-10 rounded-full px-2 py-2 text-center text-xs font-bold hover:bg-white dark:hover:bg-slate-800">Diario</a>
        <a href="#live-interactions" className="min-h-10 rounded-full px-2 py-2 text-center text-xs font-bold hover:bg-white dark:hover:bg-slate-800">Interazioni</a>
      </nav>

      {!isOnline && (
        <div className="mt-4 flex items-center gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          <span>Offline.</span><span>Diario disponibile; LIVE in pausa.</span>
        </div>
      )}

      {/* Wrapper panoramico Desktop (2 colonne affiancate su lg:, flusso verticale su mobile/tablet) */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start mt-2">
        {/* Colonna Sinistra Desktop: Mappa in evidenza & Info Posizione */}
        <div className="lg:col-span-7 space-y-6 lg:sticky lg:top-14">
          <section id="live-position" aria-labelledby="live-position-title" className="scroll-mt-16 py-6 lg:py-2">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#FF6B5F]">Posizione</p>
            <h2 id="live-position-title" className="text-2xl font-black tracking-tight text-[#172033] dark:text-white">Dove siamo</h2>
          </div>
          {lastDetectedDate && hasRealLocation && <time className="text-right text-[11px] font-semibold text-slate-500">{formatLastDetectedTimestamp(lastDetectedDate)}</time>}
        </div>

        <div className="relative min-h-[300px] overflow-hidden rounded-[1.75rem] bg-slate-200 dark:bg-slate-900 sm:min-h-[390px]">
          {!props.isExternal && (hasRealLocation || hasPlannedLocation) && (
            <div className="absolute left-3 right-3 top-3 z-20 grid grid-cols-3 gap-1 rounded-full bg-[#172033]/90 p-1 text-[10px] font-bold text-white backdrop-blur" role="group" aria-label="Centra mappa">
              {(['both', 'real', 'planned'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => props.onChangeMapCenterMode?.(mode)}
                  disabled={(mode === 'real' && !hasRealLocation) || (mode === 'planned' && !hasPlannedLocation)}
                  className={`min-h-9 rounded-full px-2 disabled:opacity-35 ${props.mapCenterMode === mode ? 'bg-[#FF6B5F] text-white' : 'text-white/75'}`}
                  aria-pressed={props.mapCenterMode === mode}
                >
                  {mode === 'both' ? 'Insieme' : mode === 'real' ? 'GPS' : 'Programma'}
                </button>
              ))}
            </div>
          )}

          {props.tileGrid && !props.tileLoadFailed ? (
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div
                className="absolute left-1/2 top-1/2 grid h-[768px] w-[768px] -translate-x-1/2 -translate-y-1/2 grid-cols-3 grid-rows-3 opacity-95 dark:opacity-60"
                style={{ marginLeft: -(props.tileGrid.pixelOffset?.x || 0), marginTop: -(props.tileGrid.pixelOffset?.y || 0) }}
              >
                {props.tileGrid.tiles.map((tile: any) => <img key={tile.key} src={tile.url} alt="" onError={props.onTileError} className="h-64 w-64 object-cover" />)}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 px-8 text-center text-sm font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Nessuna coordinata disponibile.
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(15,23,42,.78),transparent_55%)]" />

          {showRealMarker && (
            <div className={`pointer-events-none absolute left-1/2 top-1/2 z-10 flex flex-col items-center ${shouldSmoothRealMarker ? 'hounigo-live-marker-transition' : ''}`} style={{ transform: props.realMarkerOffset ? `translate(calc(-50% + ${props.realMarkerOffset.dx}px), calc(-50% + ${props.realMarkerOffset.dy}px))` : 'translate(-50%, -50%)' }}>
              <span key={lastDetectedDate?.getTime()} className="hounigo-live-gps-confirmed absolute h-12 w-12 rounded-full bg-[#FF6B5F]/30" />
              <span className="relative h-5 w-5 rounded-full border-4 border-white bg-[#FF6B5F] shadow-lg" />
              <span className="mt-2 whitespace-nowrap rounded-full bg-[#FF6B5F] px-2.5 py-1 text-[10px] font-bold text-white">Dove siamo</span>
            </div>
          )}

          {showPlannedMarker && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex flex-col items-center" style={{ transform: props.plannedMarkerOffset ? `translate(calc(-50% + ${props.plannedMarkerOffset.dx}px), calc(-50% + ${props.plannedMarkerOffset.dy}px))` : 'translate(-50%, -50%)' }}>
              <span className="h-5 w-5 rotate-45 rounded-[4px] border-2 border-white bg-[#172033] shadow-lg" />
              <span className="mt-2 whitespace-nowrap rounded-full bg-[#172033] px-2.5 py-1 text-[10px] font-bold text-white">Programma</span>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-3 p-4 text-white">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/70">{props.mapCenterMode === 'planned' ? 'Dove dovremmo essere' : props.mapCenterMode === 'both' ? 'Posizione e programma' : 'Dove siamo'}</p>
              <p className="mt-0.5 truncate text-lg font-black">
                {props.mapCenterMode === 'planned'
                  ? plannedLocation?.title || 'Programma non disponibile'
                  : hasRealLocation
                    ? props.remoteGpsLocation?.city || 'Posizione condivisa'
                    : 'GPS non condiviso'}
              </p>
            </div>
            {(hasRealLocation || hasPlannedLocation) && <a href={props.mapSearchUrl} target="_blank" rel="noreferrer" className="min-h-10 shrink-0 border-b border-white/60 py-2 text-xs font-bold">Apri mappa ↗</a>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border-l-2 border-[#FF6B5F] pl-3">
            <p className="text-[11px] font-bold text-slate-400">
              {hasRealLocation && !isStaleGps ? 'Posizione attuale (GPS Live)' : 'Ultima posizione nota'}
            </p>
            <p className="mt-1 text-sm font-extrabold text-[#172033] dark:text-white">{hasRealLocation ? props.remoteGpsLocation?.city || 'Posizione GPS' : 'Nessuna posizione condivisa'}</p>
            <p className="mt-1 text-xs text-slate-500">{hasRealLocation && lastDetectedDate ? formatRelativeTime(lastDetectedDate) : gpsVisualState.label}</p>
          </div>
          <div className="border-l-2 border-[#172033] pl-3 dark:border-slate-500">
            <p className="text-[11px] font-bold text-slate-400">Itinerario previsto</p>
            <p className="mt-1 text-sm font-extrabold text-[#172033] dark:text-white">{plannedLocation?.title || 'Nessun luogo previsto ora'}</p>
            <p className="mt-1 text-xs text-slate-500">{plannedLocation?.coords ? 'Secondo il programma' : 'Coordinate non disponibili'}</p>
          </div>
        </div>

        {!props.isExternal && props.liveIntelligence && (
          <div className="mt-5 grid gap-3 border-y border-slate-200 py-4 dark:border-slate-800 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold text-[#FF6B5F]">Adesso</p>
              <p className="mt-1 text-sm font-extrabold">{props.liveIntelligence.currentEvent?.title || (props.liveIntelligence.tripStatus === 'pre_trip' ? 'In attesa della partenza' : props.liveIntelligence.tripStatus === 'post_trip' ? 'Viaggio concluso' : 'Tempo libero')}</p>
              {props.liveIntelligence.currentEvent?.timeRange && <p className="mt-1 text-xs text-slate-500">{props.liveIntelligence.currentEvent.timeRange}</p>}
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">Prossima tappa</p>
              <p className="mt-1 text-sm font-extrabold">{props.liveIntelligence.nextEvent?.title || 'Nessun altro appuntamento'}</p>
              {props.liveIntelligence.nextEvent && <p className="mt-1 text-xs text-slate-500">{props.liveIntelligence.nextEvent.time}{props.liveIntelligence.nextEvent.locationName ? ` · ${props.liveIntelligence.nextEvent.locationName}` : ''}</p>}
            </div>
          </div>
        )}

        {!props.isExternal && (props.isOwner || props.isCopilota) && (
          <div className="mt-5 border-b border-slate-200 pb-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                  Chi condivide la posizione?
                </p>
                <p className={`flex items-center gap-2 text-sm font-extrabold ${gpsVisualState.tone}`}>
                  <span className={`h-2 w-2 rounded-full ${gpsVisualState.dot}`} />
                  {isLeaseActive ? `Ora ${currentGuideName} condivide la posizione` : gpsVisualState.label}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Organizzatore: <strong>{props.ownerName || 'Organizzatore'}</strong> · Guida designata: <strong>{currentGuideName}</strong>
                </p>
                {lastDetectedDate && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Ultima posizione ricevuta: {formatLastDetectedTimestamp(lastDetectedDate)} ({formatRelativeTime(lastDetectedDate)})
                    {isStaleGps ? ' · ⚠️ Posizione non aggiornata da oltre 15 minuti' : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(props.isOwner || props.isDesignatedGuide) && (
                  <button type="button" onClick={props.onStartGps} disabled={props.isDetectingGps || !isOnline} className="min-h-11 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white disabled:opacity-40 cursor-pointer">
                    {permissionDenied || isLeaseExpired || isLeaseActive ? 'Aggiorna posizione' : 'Condividi posizione'}
                  </button>
                )}
                {isLeaseActive && (props.isGpsHolder || props.isDesignatedGuide) && (
                  <>
                    <button type="button" onClick={props.onPauseGps} disabled={!isOnline} className="min-h-11 rounded-full border border-amber-300 px-4 text-xs font-bold text-amber-800 dark:border-amber-800 dark:text-amber-200 cursor-pointer">Metti in pausa</button>
                    <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-11 rounded-full border border-rose-300 px-4 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Ferma condivisione</button>
                  </>
                )}
                {isLeaseActive && props.isOwner && !props.isGpsHolder && !props.isDesignatedGuide && (
                  <>
                    <button type="button" onClick={props.onRevokeGps} disabled={!isOnline} className="min-h-11 rounded-full bg-[#172033] px-4 text-xs font-bold text-white dark:bg-white dark:text-[#172033] cursor-pointer">Riprendi la guida</button>
                    <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-11 rounded-full border border-rose-300 px-4 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Ferma condivisione</button>
                  </>
                )}
                {isLeasePaused && (props.isOwner || props.isDesignatedGuide) && (
                  <>
                    <button type="button" onClick={props.onResumeGps} disabled={!isOnline} className="min-h-11 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white cursor-pointer">Riprendi condivisione</button>
                    <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-11 rounded-full border border-rose-300 px-4 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Interrompi</button>
                  </>
                )}
              </div>
            </div>
            {props.gpsFeedback && <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300" role="status">✓ {props.gpsFeedback}</p>}
            {props.gpsError && <p className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-300" role="alert">{props.gpsError}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              ℹ️ <strong>Nota iOS / iPhone PWA:</strong> L&apos;aggiornamento GPS funziona quando la PWA è aperta o viene riaperta, non come un&apos;app nativa con tracciamento continuo in background.
            </p>
            <button type="button" onClick={() => setIsGuideControlsOpen(open => !open)} className="mt-3 min-h-10 text-xs font-bold text-slate-600 underline underline-offset-4 dark:text-slate-300 cursor-pointer" aria-expanded={isGuideControlsOpen}>Gestione Delega Guida GPS {isGuideControlsOpen ? '−' : '+'}</button>

            {isGuideControlsOpen && (
              <div className="mt-3 space-y-4 rounded-2xl bg-white p-4 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                  L&apos;<strong>Organizzatore ({props.ownerName || 'Owner'})</strong> può passare la guida GPS a un Copilota verificato e riprenderla in qualsiasi momento. Un solo dispositivo alla volta trasmette la posizione.
                </p>
                {props.isOwner && (
                  <div className="space-y-2">
                    {props.remoteGpsLease?.holderUid && props.remoteGpsLease.holderUid !== props.ownerUid && (
                      <button type="button" disabled={isHandoverLoading || !isOnline} onClick={() => props.onRevokeGps && runHandover(props.onRevokeGps, 'Guida GPS riportata all’Organizzatore.')} className="min-h-11 rounded-full border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer">Riprendi la guida</button>
                    )}
                    {copilots.map(copilot => {
                      const isCurrent = props.remoteGpsLease?.holderUid === copilot.uid;
                      return (
                        <div key={copilot.uid} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{copilot.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {isCurrent ? '🟢 Ora condivide la posizione' : copilot.deviceId ? 'Dispositivo Copilota registrato' : 'Copilota verificato (attiverà dal suo smartphone)'}
                            </p>
                          </div>
                          {!isCurrent && (
                            <button
                              type="button"
                              disabled={isHandoverLoading || !isOnline}
                              onClick={() => props.onTransferGps && runHandover(() => props.onTransferGps?.(copilot.uid, copilot.deviceId), `Ora ${copilot.name} condivide la posizione.`)}
                              aria-label={`Delega Guida GPS a ${copilot.name}`}
                              title="Delega Guida GPS"
                              className="min-h-10 shrink-0 rounded-full bg-[#172033] px-3.5 text-[11px] font-bold text-white disabled:opacity-35 dark:bg-white dark:text-[#172033] cursor-pointer"
                            >
                              Passa la guida a {copilot.name}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {!copilots.length && <p className="text-xs text-slate-500">Nessun copilota disponibile.</p>}
                  </div>
                )}
                {props.isCopilota && (
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {props.isDesignatedGuide
                      ? '🟢 Hai la guida attiva su questo smartphone: puoi condividere, mettere in pausa o riprendere la posizione.'
                      : 'L’Organizzatore può passarti la guida per condividere la posizione da questo smartphone.'}
                  </p>
                )}
                {handoverFeedback && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200" role="status">{handoverFeedback}</p>}
              </div>
            )}
          </div>
        )}

        {props.isExternal && (
          <details className="mt-4 border-b border-slate-200 pb-4 text-xs dark:border-slate-800">
            <summary className="min-h-10 cursor-pointer py-2 font-bold">Privacy posizione</summary>
            <p className="leading-5 text-slate-500">Vedi solo la posizione che i viaggiatori scelgono di condividere. Quando la condivisione termina, il marker pubblico scompare.</p>
          </details>
        )}
      </section>
    </div>

    {/* Colonna Destra Desktop: Diario, Fotografie, Interazioni */}
    <div className="lg:col-span-5 space-y-8">
      <section id="live-diary" aria-labelledby="live-diary-title" className="scroll-mt-16 border-t border-slate-200 py-7 dark:border-slate-800 lg:border-t-0 lg:py-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#FF6B5F]">Diario</p>
            <h2 id="live-diary-title" className="text-2xl font-black tracking-tight text-[#172033] dark:text-white">Ricordi dal viaggio</h2>
          </div>
          {props.canPublish && !props.isExternal && <button type="button" onClick={() => setIsComposerOpen(open => !open)} className="min-h-11 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white">Nuovo ricordo</button>}
        </div>

        <article className="mt-5 border-l-2 border-[#FF6B5F] pl-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-slate-400">Dagli organizzatori</p>
            {props.canPublish && !props.isExternal && <button type="button" onClick={props.onToggleStatusEdit} className="min-h-10 text-xs font-bold text-[#FF6B5F]">{props.isEditingStatus ? 'Annulla' : 'Modifica'}</button>}
          </div>
          {props.isEditingStatus ? (
            <div className="mt-2">
              <textarea rows={3} value={props.tempStatus} onChange={event => props.onTempStatusChange(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
              <button type="button" onClick={props.onSaveStatus} className="mt-2 min-h-11 rounded-full bg-[#172033] px-4 text-xs font-bold text-white dark:bg-white dark:text-[#172033]">Salva</button>
            </div>
          ) : (
            <><p className="mt-1 text-base font-semibold leading-6 text-[#172033] dark:text-white">{props.statusMessage}</p><time className="mt-2 block text-[11px] text-slate-400">{props.statusUpdatedAt}</time></>
          )}
        </article>

        {isComposerOpen && props.canPublish && !props.isExternal && (
          <form onSubmit={props.onSendMessage} className="mt-5 rounded-2xl bg-white p-4 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2"><label className="text-sm font-extrabold">Nuovo ricordo</label><span className="text-[11px] text-slate-400">{props.liveTextMessage.length}/500</span></div>
            <textarea rows={4} maxLength={500} autoFocus value={props.liveTextMessage} onChange={event => props.onLiveTextChange(event.target.value)} placeholder="Racconta un momento…" className="mt-3 w-full resize-none rounded-2xl border border-slate-300 bg-[#F8F7F3] p-3 text-sm dark:border-slate-700 dark:bg-[#172033]" />
            {props.messageError && <p className="mt-2 text-xs font-semibold text-rose-600">{props.messageError}</p>}
            {props.messageSuccess && <p className="mt-2 text-xs font-semibold text-emerald-600">{props.messageSuccess}</p>}
            <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setIsComposerOpen(false)} className="min-h-11 px-3 text-xs font-bold text-slate-500">Annulla</button><button type="submit" disabled={props.isSendingMessage || !props.liveTextMessage.trim() || !isOnline} className="min-h-11 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white disabled:opacity-40">{props.isSendingMessage ? 'Pubblicazione…' : 'Pubblica'}</button></div>
          </form>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-bold text-slate-400">Fotografie</p><p className="text-sm font-extrabold">{displayPhotos.length ? `${displayPhotos.length} scatti` : 'Nessuno scatto'}</p></div>
          {props.canPublish && !props.isExternal && (
            <><input ref={fileUploadInputRef} type="file" accept={IMAGE_FILE_ACCEPT} multiple className="hidden" onChange={handlePhotoFileSelected} /><button type="button" onClick={() => fileUploadInputRef.current?.click()} className="min-h-11 rounded-full border border-slate-300 px-4 text-xs font-bold dark:border-slate-700">Aggiungi foto</button></>
          )}
        </div>

        {displayPhotos.length ? (
          <div className="mt-4">
            <div key={`photo-grid-${photoRevealVersion}`} className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${photoRevealVersion > 0 ? 'hounigo-photo-saved-reveal' : ''}`}>
              {visiblePhotos.map((photo, index) => {
                const fullIndex = displayPhotos.findIndex(item => item.id === photo.id);
                return (
                  <figure key={photo.id} className={`group relative overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-900 ${index === 0 ? 'col-span-2 aspect-[16/10]' : 'aspect-[4/5]'}`}>
                    <button type="button" onClick={() => setActiveLightboxIndex(fullIndex)} className="absolute inset-0 h-full w-full"><img src={photo.url} alt={photo.caption || 'Foto del viaggio'} className="h-full w-full object-cover" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /></button>
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#172033]/75 p-3 text-white backdrop-blur-sm"><p className="truncate text-xs font-bold">{photo.caption || 'Momento dal viaggio'}</p><p className="mt-0.5 truncate text-[10px] text-white/70">{photo.location ? `${photo.location} · ` : ''}{formatRelativeTime(new Date(photo.timestamp))}</p></figcaption>
                    {props.canPublish && !props.isExternal && props.onDeletePhoto && <button type="button" onClick={() => window.confirm('Eliminare questa foto dal dispositivo?') && props.onDeletePhoto?.(photo.id)} className="absolute right-2 top-2 min-h-10 rounded-full bg-black/65 px-3 text-[11px] font-bold text-white" aria-label="Elimina foto">Elimina</button>}
                  </figure>
                );
              })}
            </div>
            {displayPhotos.length > 5 && <button type="button" onClick={() => setShowAllPhotos(show => !show)} className="mt-3 min-h-10 text-xs font-bold text-[#FF6B5F]">{showAllPhotos ? 'Mostra meno' : `Vedi tutti gli scatti (${displayPhotos.length})`}</button>}
          </div>
        ) : (
          <div className="mt-4 border-y border-dashed border-slate-300 py-7 text-center dark:border-slate-700"><p className="text-sm font-bold">Il primo scatto deve ancora arrivare.</p>{props.canPublish && <p className="mt-1 text-xs text-slate-500">Puoi aggiungerlo quando vuoi.</p>}</div>
        )}

        {props.canPublish && !props.isExternal && <p className="mt-3 text-[11px] text-slate-500">Le foto restano su questo dispositivo. Le cartoline LIVE sono separate.</p>}

        <div className="mt-9 border-t border-slate-200 dark:border-slate-800">
          {sortedUpdates.length === 0 ? (
            <div className="py-8 text-center"><p className="text-sm font-bold">Il diario è ancora vuoto.</p><p className="mt-1 text-xs text-slate-500">I ricordi pubblicati appariranno qui.</p></div>
          ) : (
            <>
              {paginatedUpdates[0] && renderUpdateCard(paginatedUpdates[0])}
              {(isArchiveOpen || diaryPage > 1) && paginatedUpdates.slice(1).map(renderUpdateCard)}
              {paginatedUpdates.length > 1 && diaryPage === 1 && <button type="button" onClick={() => setIsArchiveOpen(open => !open)} className="min-h-11 w-full border-t border-slate-200 text-xs font-bold text-[#FF6B5F] dark:border-slate-800">{isArchiveOpen ? 'Chiudi archivio' : `Altri ricordi (${sortedUpdates.length - 1})`}</button>}
              {totalDiaryPages > 1 && <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={diaryPage === 1} onClick={() => setDiaryPage(page => Math.max(1, page - 1))} className="min-h-11 px-2 text-xs font-bold disabled:opacity-30">← Prima</button><span className="text-xs text-slate-500">{diaryPage} / {totalDiaryPages}</span><button type="button" disabled={diaryPage === totalDiaryPages} onClick={() => setDiaryPage(page => Math.min(totalDiaryPages, page + 1))} className="min-h-11 px-2 text-xs font-bold disabled:opacity-30">Dopo →</button></div>}
            </>
          )}
        </div>
      </section>

      <section id="live-interactions" aria-labelledby="live-interactions-title" className="scroll-mt-16 border-t border-slate-200 py-7 dark:border-slate-800">
        <p className="text-xs font-bold text-[#FF6B5F]">Interazioni</p>
        <h2 id="live-interactions-title" className="text-2xl font-black tracking-tight text-[#172033] dark:text-white">Vicini, anche da lontano</h2>
        <div className="mt-5 grid grid-cols-3 gap-4 border-y border-slate-200 py-4 dark:border-slate-800">
          <div><p className="text-2xl font-black">{reactionTotal}</p><p className="text-xs text-slate-500">Reazioni ricevute</p></div>
          <div><p className="text-2xl font-black">{sortedUpdates.length}</p><p className="text-xs text-slate-500">Ricordi pubblici</p></div>
          <div><p className="text-2xl font-black">{(props.guestMessages || []).filter(m => !m.hidden).length}</p><p className="text-xs text-slate-500">Messaggi ospiti</p></div>
        </div>

        {/* Guestbook / Messaggi dagli Ospiti */}
        <div className="mt-6 space-y-5">
          <div>
            <h3 className="text-base font-extrabold text-[#172033] dark:text-white">Lascia un pensiero agli sposi</h3>
            <p className="mt-0.5 text-xs text-slate-500">I messaggi compaiono nel diario pubblico del viaggio.</p>
          </div>

          {props.onSendGuestMessage && (FEATURE_FLAGS.LIVE_GUEST_MESSAGES_PUBLIC_WRITE || props.isOwner || props.isCopilota) ? (
            <form onSubmit={handleGuestMessageSubmit} className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Il tuo nome</label>
                  <input
                    type="text"
                    maxLength={40}
                    required
                    value={guestAuthorInput}
                    onChange={(e) => setGuestAuthorInput(e.target.value)}
                    placeholder="Es. Zia Maria, Marco..."
                    className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-[#F8F7F3] px-3 text-xs text-[#172033] focus:border-[#FF6B5F] focus:outline-none dark:border-slate-700 dark:bg-[#172033] dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Messaggio o augurio</label>
                    <span className="text-[10px] text-slate-400">{guestMessageInput.length}/280</span>
                  </div>
                  <input
                    type="text"
                    maxLength={280}
                    required
                    value={guestMessageInput}
                    onChange={(e) => setGuestMessageInput(e.target.value)}
                    placeholder="Scrivi un saluto o un augurio per il viaggio…"
                    className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-[#F8F7F3] px-3 text-xs text-[#172033] focus:border-[#FF6B5F] focus:outline-none dark:border-slate-700 dark:bg-[#172033] dark:text-white"
                  />
                </div>
              </div>
              {guestMsgError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">{guestMsgError}</p>}
              {guestMsgSuccess && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400" role="status">{guestMsgSuccess}</p>}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-slate-400">Visibile nel diario pubblico · Moderato dagli organizzatori</span>
                <button
                  type="submit"
                  disabled={isSendingGuestMsg || !isOnline || !guestAuthorInput.trim() || !guestMessageInput.trim()}
                  className="min-h-10 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white transition hover:bg-[#e85c50] disabled:opacity-40"
                >
                  {isSendingGuestMsg ? 'Invio…' : 'Invia messaggio'}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                <span>🛡️</span>
                <span>Bacheca Pensieri dal Pubblico</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                I pensieri pubblicati dagli organizzatori sono visibili qui sotto. L'invio pubblico diretto dal browser è temporaneamente disattivato in modalità lettura per la sicurezza del viaggio.
              </p>
            </div>
          )}

          {/* Lista messaggi ospiti */}
          {(props.guestMessages && props.guestMessages.length > 0) ? (
            <div className="space-y-2.5">
              {props.guestMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    msg.hidden
                      ? 'border-amber-200 bg-amber-50/50 opacity-75 dark:border-amber-900/50 dark:bg-amber-950/20'
                      : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#172033] dark:text-white">{msg.authorName}</span>
                        <span className="text-[10px] text-slate-400">{formatUpdateDate(msg.createdAt)}</span>
                        {msg.hidden && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                            Nascosto al pubblico
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                        {msg.message}
                      </p>
                    </div>
                    {!props.isExternal && (props.isOwner || props.isCopilota) && props.onModerateGuestMessage && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => props.onModerateGuestMessage?.(msg.id, msg.hidden ? 'unhide' : 'hide')}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {msg.hidden ? 'Mostra' : 'Nascondi'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Eliminare il messaggio di "${msg.authorName}"?`)) {
                              props.onModerateGuestMessage?.(msg.id, 'delete');
                            }
                          }}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400"
                        >
                          Elimina
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Nessun messaggio dagli ospiti ancora presente. Sii il primo a lasciare un saluto!</p>
          )}
        </div>

        <button type="button" onClick={props.onShare} className="mt-6 min-h-11 rounded-full bg-[#172033] px-5 text-xs font-bold text-white dark:bg-white dark:text-[#172033]">{props.copiedLink ? 'Link copiato ✓' : 'Condividi link ospiti'}</button>
        <details className="mt-4 text-xs"><summary className="min-h-10 cursor-pointer py-2 font-bold">Cosa vedono gli ospiti</summary><p className="max-w-xl leading-5 text-slate-500">Posizione condivisa, ricordi pubblici, reazioni e messaggi degli ospiti. Itinerario privato, documenti, prenotazioni, spese e contatti restano nascosti.</p></details>
      </section>
    </div>
  </div>

      {pendingUploadItems.length > 0 && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Aggiungi fotografie">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-5 text-[#172033] dark:bg-[#172033] dark:text-white">
            <div className="flex items-center justify-between"><h3 className="text-lg font-black">Aggiungi {pendingUploadItems.length === 1 ? 'foto' : `${pendingUploadItems.length} foto`}</h3><button type="button" onClick={clearPendingPhotos} className="h-11 w-11 rounded-full text-xl" aria-label="Chiudi">×</button></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {pendingUploadItems.map(item => <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100"><img src={item.preview} alt={item.name} className="h-full w-full object-cover" /><button type="button" onClick={() => { URL.revokeObjectURL(item.preview); setPendingUploadItems(items => items.filter(current => current.id !== item.id)); }} className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/70 text-white" aria-label={`Rimuovi ${item.name}`}>×</button></div>)}
            </div>
            <label className="mt-4 block text-xs font-bold">Didascalia</label><input type="text" value={pendingCaptionInput} onChange={event => setPendingCaptionInput(event.target.value)} placeholder="Un luogo o un momento" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Salvataggio locale su questo dispositivo. Nessuna pubblicazione automatica.</p>
            {uploadError && <p className="mt-2 text-xs font-semibold text-rose-600">{uploadError}</p>}
            <div className="mt-4 flex gap-2"><button type="button" onClick={clearPendingPhotos} className="min-h-11 flex-1 rounded-full border border-slate-300 text-xs font-bold dark:border-slate-700">Annulla</button><button type="button" onClick={handleConfirmPhotoUpload} disabled={isUploadingPhoto || !pendingUploadItems.length} className="min-h-11 flex-1 rounded-full bg-[#FF6B5F] text-xs font-bold text-white disabled:opacity-40">{isUploadingPhoto ? 'Salvataggio…' : 'Salva nel diario'}</button></div>
          </div>
        </div>,
        document.body
      )}

      {activeLightboxIndex !== null && displayPhotos[activeLightboxIndex] && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 backdrop-blur-md p-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))] text-white select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Foto a schermo intero"
          data-swipe-navigation="ignore"
          onClick={() => setActiveLightboxIndex(null)}
          onTouchStart={event => setTouchStartX(event.touches[0].clientX)}
          onTouchEnd={event => {
            if (touchStartX === null) return;
            const distance = event.changedTouches[0].clientX - touchStartX;
            if (distance > 45 && activeLightboxIndex > 0) setActiveLightboxIndex(activeLightboxIndex - 1);
            if (distance < -45 && activeLightboxIndex < displayPhotos.length - 1) setActiveLightboxIndex(activeLightboxIndex + 1);
            setTouchStartX(null);
          }}
        >
          <div className="relative z-10 flex shrink-0 items-center justify-between" onClick={event => event.stopPropagation()}>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{activeLightboxIndex + 1} / {displayPhotos.length}</span>
            <div className="flex items-center gap-2">
              {props.canPublish && !props.isExternal && props.onDeletePhoto && (
                <button
                  type="button"
                  onClick={() => {
                    const photo = displayPhotos[activeLightboxIndex];
                    if (window.confirm('Eliminare questa foto dal dispositivo?')) {
                      props.onDeletePhoto?.(photo.id);
                      setActiveLightboxIndex(displayPhotos.length <= 1 ? null : Math.max(0, activeLightboxIndex - 1));
                    }
                  }}
                  className="min-h-11 rounded-full bg-rose-500/20 px-3.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
                >
                  Elimina
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveLightboxIndex(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl hover:bg-white/25"
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>
          </div>

          <div className="relative my-2 flex min-h-0 flex-1 w-full items-center justify-center overflow-hidden">
            <button
              type="button"
              disabled={activeLightboxIndex === 0}
              onClick={event => {
                event.stopPropagation();
                setActiveLightboxIndex(index => index === null ? index : Math.max(0, index - 1));
              }}
              className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 border border-white/15 text-xl text-white backdrop-blur-sm hover:bg-black/75 disabled:opacity-20"
              aria-label="Foto precedente"
            >
              ‹
            </button>

            <img
              src={displayPhotos[activeLightboxIndex].url}
              alt={displayPhotos[activeLightboxIndex].caption || 'Foto del viaggio'}
              onClick={event => event.stopPropagation()}
              className="block h-auto w-auto max-h-[calc(100dvh-9.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-8rem)] mx-auto my-auto object-contain rounded-xl shadow-2xl"
            />

            <button
              type="button"
              disabled={activeLightboxIndex === displayPhotos.length - 1}
              onClick={event => {
                event.stopPropagation();
                setActiveLightboxIndex(index => index === null ? index : Math.min(displayPhotos.length - 1, index + 1));
              }}
              className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 border border-white/15 text-xl text-white backdrop-blur-sm hover:bg-black/75 disabled:opacity-20"
              aria-label="Foto successiva"
            >
              ›
            </button>
          </div>

          <div className="relative z-10 shrink-0 text-center px-4" onClick={event => event.stopPropagation()}>
            <p className="text-sm font-bold">{displayPhotos[activeLightboxIndex].caption || 'Momento dal viaggio'}</p>
            {displayPhotos[activeLightboxIndex].location && (
              <p className="mt-1 text-xs text-white/65">{displayPhotos[activeLightboxIndex].location}</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
