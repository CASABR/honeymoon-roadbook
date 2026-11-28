import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Camera, BookOpen, MessageCircle, Compass, Clock, Radio, MapPinOff, Reply, X } from 'lucide-react';
import type { LiveUpdate, LiveGuestMessage, LiveReplyTarget } from '../../services/liveService';
import type { LiveOfflineQueueItem } from '../../utils/liveOfflineQueue';
import { GPS_STALE_THRESHOLD_MS, type LiveGpsDevice, type LiveGpsLease, type LiveGpsLocation } from '../../services/liveGpsService';
import type { LiveIntelligenceState } from '../../utils/liveIntelligenceHelper';
import type { PublicNextTransportInfo } from '../../utils/liveNextTransport';
import {
  buildLiveDualClockViewModel,
  formatGpsPositionAge,
  parseSafeGpsDate,
  resolveLiveTravelTimeZone,
  type LiveTravelTimeZoneResolution,
} from '../../utils/liveTimeClock';
import LiveNextTransportCard from './LiveNextTransportCard';
import { getTripConfig } from '../../utils/tripConfig';
import { groupLiveThreads } from '../../utils/liveThreads';
import { IMAGE_FILE_ACCEPT, isSupportedImageFile } from '../../utils/fileAttachment';

export interface LiveGalleryPhotoItem {
  id: string;
  url: string;
  caption?: string;
  location?: string;
  timestamp: number;
  isCustom?: boolean;
  pendingSync?: boolean;
  tripId?: string;
  userId?: string;
}

export interface LivePhotoComment {
  id: string;
  photoId: string;
  authorName: string;
  text: string;
  createdAt: number;
  replyToId?: string;
  replyToAuthor?: string;
  replyToPreview?: string;
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
  lastKnownLocation?: LiveGpsLocation | null;
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
  nextImportantTransport?: PublicNextTransportInfo | null;
  upcomingTransports?: PublicNextTransportInfo[] | null;
  travelTimeZoneResolution?: LiveTravelTimeZoneResolution | null;
  nowMs?: number;
  mapCenterMode?: 'both' | 'real' | 'planned';
  onChangeMapCenterMode?: (mode: 'both' | 'real' | 'planned') => void;
  realMarkerOffset?: { dx: number; dy: number } | null;
  plannedMarkerOffset?: { dx: number; dy: number } | null;
  statusMessage: string;
  statusUpdatedAt: string | Date;
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
  reactionError?: string | null;
  onShare: () => void;
  copiedLink: boolean;
  online: boolean;
  canWriteOffline?: boolean;
  offlineQueueItems?: LiveOfflineQueueItem[];
  onCancelOfflineItem?: (id: string) => void;
  galleryPhotos?: LiveGalleryPhotoItem[];
  onUploadPhoto?: (file: File, caption?: string) => Promise<void>;
  onDeletePhoto?: (photoId: string) => void;
  onDeleteUpdate?: (updateId: string) => Promise<void>;
  guestMessages?: LiveGuestMessage[];
  onSendGuestMessage?: (authorName: string, message: string, replyTo?: LiveReplyTarget | null) => Promise<void>;
  onModerateGuestMessage?: (messageId: string, action: 'hide' | 'unhide' | 'delete') => Promise<void>;
  photoComments?: Record<string, LivePhotoComment[]>;
  onSubscribePhotoComments?: (photoId: string) => (() => void) | void;
  onAddPhotoComment?: (photoId: string, authorName: string, text: string, replyTo?: LiveReplyTarget | null) => Promise<void>;
  onDeletePhotoComment?: (photoId: string, commentId: string) => Promise<void>;
}

const REACTIONS = ['❤️', '😍', '😂', '👋'];
const PAGE_SIZE = 10;

export function parseSafeDate(date: any): Date | null {
  return parseSafeGpsDate(date);
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

function formatRelativeTime(date: Date, nowMs: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (seconds < 20) return 'ora';
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export default function LiveEditorialExperience(props: LiveEditorialExperienceProps) {
  const [internalNowMs, setInternalNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (typeof props.nowMs === 'number') return;
    const timer = setInterval(() => setInternalNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [props.nowMs]);
  const effectiveNowMs = typeof props.nowMs === 'number' ? props.nowMs : internalNowMs;

  const tripConfig = getTripConfig();
  const tripTitle = props.isExternal
    ? 'Il nostro viaggio'
    : tripConfig?.title || props.location?.city || 'Il nostro viaggio';
  const isOnline = props.isOnline ?? (typeof navigator === 'undefined' || navigator.onLine);
  // Rispetta la scelta dell'utente: se la condivisione è interrotta manualmente (stopped), non mostrare alcuna posizione
  const isStopped = Boolean(
    props.remoteGpsLease?.status === 'stopped' ||
    props.remoteGpsLocation?.status === 'stopped' ||
    props.lastKnownLocation?.status === 'stopped'
  );

  // Posizione da visualizzare: se interrotta manualmente è null, altrimenti usa la posizione remota o l'ultima nota autorizzata
  const displayLocation = isStopped ? null : (props.remoteGpsLocation || props.lastKnownLocation || null);

  const lastDetectedDate = displayLocation?.updatedAt
    ? parseSafeDate(displayLocation.updatedAt)
    : null;
  const ageMs = lastDetectedDate ? Math.max(0, effectiveNowMs - lastDetectedDate.getTime()) : Number.POSITIVE_INFINITY;

  // Per gli ospiti la lease non è accessibile direttamente (protetta da Firestore rules),
  // ma la presenza di remoteGpsLocation attiva certifica che la lease è valida lato server.
  const rawLeaseActive = props.remoteGpsLease
    ? props.remoteGpsLease.status === 'active'
    : (displayLocation?.status === 'active');
  const isLeaseExpired = props.remoteGpsLease
    ? Boolean(props.remoteGpsLease.expiresAt.getTime() <= effectiveNowMs)
    : (ageMs >= GPS_STALE_THRESHOLD_MS);
  const isLeaseActive = Boolean(rawLeaseActive && !isLeaseExpired);
  const isLeasePaused = props.remoteGpsLease?.status === 'paused';
  const isLeaseStopped = isStopped;

  // GPS LIVE: lease attiva, segnale recente (< 15 min), stato active
  const isFreshGps = Boolean(
    isLeaseActive &&
    lastDetectedDate &&
    ageMs < GPS_STALE_THRESHOLD_MS &&
    displayLocation?.status === 'active'
  );

  // ULTIMA POSIZIONE CONOSCIUTA: posizione autorizzata presente ma aggiornamenti non recenti (>= 15 min o disconnessione), non interrotta manualmente
  const isStaleGps = Boolean(
    !isStopped &&
    lastDetectedDate &&
    displayLocation &&
    (ageMs >= GPS_STALE_THRESHOLD_MS || !isLeaseActive)
  );

  // Mostra coordinate reali se live o come ultima posizione nota
  const hasRealLocation = Boolean((isFreshGps || isStaleGps) && displayLocation);
  const positionAgeLabel = hasRealLocation && lastDetectedDate
    ? formatGpsPositionAge(lastDetectedDate, effectiveNowMs)
    : null;

  const effectiveClockResolution = useMemo<LiveTravelTimeZoneResolution>(() => {
    if (props.travelTimeZoneResolution) return props.travelTimeZoneResolution;
    return resolveLiveTravelTimeZone({
      isExternal: props.isExternal,
      realLocation:
        !isStopped && displayLocation
          ? {
            lat: displayLocation.lat,
            lng: displayLocation.lng,
            city: displayLocation.city,
            country: displayLocation.country,
          }
          : null,
      plannedLocation: props.isExternal ? null : props.liveIntelligence?.plannedLocation,
      tripStatus: props.liveIntelligence?.tripStatus,
    });
  }, [props.travelTimeZoneResolution, props.isExternal, isStopped, displayLocation, props.liveIntelligence]);

  const dualClock = useMemo(
    () => buildLiveDualClockViewModel(effectiveNowMs, effectiveClockResolution),
    [effectiveNowMs, effectiveClockResolution]
  );
  const plannedLocation = props.liveIntelligence?.plannedLocation || null;
  const hasPlannedLocation = Boolean(plannedLocation?.coords);
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
      return { label: 'Rilevamento…', tone: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500 motion-safe:animate-pulse' };
    }
    if (isFreshGps) {
      return { label: 'GPS LIVE attivo', tone: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500 animate-pulse' };
    }
    if (isStaleGps) {
      return { label: 'Ultima posizione conosciuta', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
    }
    if (isLeasePaused) {
      return { label: 'GPS in pausa', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
    }
    if (isStopped || isLeaseStopped) {
      return { label: 'Condivisione non attiva', tone: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' };
    }
    if (props.isExternal) {
      return { label: 'Posizione non condivisa', tone: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' };
    }
    return { label: 'Condivisione non attiva', tone: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' };
  }, [isOnline, permissionDenied, props.isDetectingGps, isFreshGps, isStaleGps, isLeasePaused, isStopped, isLeaseStopped, props.isExternal]);

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
  const guestSubmitBusy = useRef(false);
  const [guestMsgError, setGuestMsgError] = useState<string | null>(null);
  const [guestMsgSuccess, setGuestMsgSuccess] = useState<string | null>(null);
  const [photoCommentInput, setPhotoCommentInput] = useState('');
  const [isSendingPhotoComment, setIsSendingPhotoComment] = useState(false);
  const photoCommentSubmitBusy = useRef(false);
  const [photoCommentError, setPhotoCommentError] = useState<string | null>(null);
  const [replyingToGuestMsg, setReplyingToGuestMsg] = useState<LiveReplyTarget | null>(null);
  const [replyingToPhotoComment, setReplyingToPhotoComment] = useState<LiveReplyTarget | null>(null);
  const guestMsgInputRef = useRef<HTMLInputElement | null>(null);
  const photoCommentInputRef = useRef<HTMLInputElement | null>(null);

  type LiveSectionTab = 'mappa' | 'foto' | 'diario' | 'messaggi';
  const [activeTab, setActiveTab] = useState<LiveSectionTab>('mappa');
  const [pendingDeepLinkPhotoId, setPendingDeepLinkPhotoId] = useState<string | null>(null);
  const seenStorageKey = 'hounigo_live_seen_tabs_v1';
  const [seenSignals, setSeenSignals] = useState<Partial<Record<LiveSectionTab, string>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(seenStorageKey) || '{}') || {};
    } catch {
      return {};
    }
  });

  const handleGuestMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!props.onSendGuestMessage || guestSubmitBusy.current) return;
    guestSubmitBusy.current = true;
    setGuestMsgError(null);
    setGuestMsgSuccess(null);
    setIsSendingGuestMsg(true);
    try {
      const cleanAuthor = guestAuthorInput.trim();
      const cleanMsg = guestMessageInput.trim();
      await props.onSendGuestMessage(cleanAuthor, cleanMsg, replyingToGuestMsg);
      if (typeof window !== 'undefined' && cleanAuthor) {
        try {
          localStorage.setItem('hounigo_guest_author_name', cleanAuthor);
        } catch { }
      }
      setGuestMessageInput('');
      setReplyingToGuestMsg(null);
      setGuestMsgSuccess(
        !isOnline && props.canWriteOffline
          ? '🕒 In attesa di invio: verrà inviato al ritorno online.'
          : 'Messaggio inviato agli sposi! ❤️'
      );
    } catch (err: any) {
      setGuestMsgError(err?.message || 'Impossibile inviare il messaggio. Riprova.');
    } finally {
      guestSubmitBusy.current = false;
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

  const diaryUpdates = useMemo(
    () => sortedUpdates.filter(u => !u.photoUrl || !u.photoUrl.trim()),
    [sortedUpdates]
  );
  const totalDiaryPages = Math.max(1, Math.ceil(diaryUpdates.length / PAGE_SIZE));
  const paginatedUpdates = useMemo(() => {
    const start = (diaryPage - 1) * PAGE_SIZE;
    return diaryUpdates.slice(start, start + PAGE_SIZE);
  }, [diaryUpdates, diaryPage]);

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

  const activeLightboxPhoto = activeLightboxIndex !== null ? displayPhotos[activeLightboxIndex] || null : null;
  const activeLightboxPhotoId = activeLightboxPhoto?.id || null;
  const activeLightboxIsPublic = Boolean(activeLightboxPhoto && !activeLightboxPhoto.isCustom && !activeLightboxPhoto.pendingSync);
  const onSubscribePhotoCommentsRef = useRef(props.onSubscribePhotoComments);
  onSubscribePhotoCommentsRef.current = props.onSubscribePhotoComments;

  useEffect(() => {
    setPhotoCommentError(null);
    setReplyingToPhotoComment(null);
    if (!activeLightboxPhotoId || !activeLightboxIsPublic || !onSubscribePhotoCommentsRef.current) return;
    const unsub = onSubscribePhotoCommentsRef.current(activeLightboxPhotoId);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [activeLightboxPhotoId, activeLightboxIsPublic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyDeepLink = (detail?: { liveTab?: string; photoId?: string } | null) => {
      if (!detail) return;
      if (detail.liveTab === 'messaggi' || detail.liveTab === 'foto' || detail.liveTab === 'diario' || detail.liveTab === 'mappa') {
        setActiveTab(detail.liveTab);
      }
      if (detail.photoId) {
        setActiveTab('foto');
        setPendingDeepLinkPhotoId(detail.photoId);
      }
    };
    try {
      const raw = sessionStorage.getItem('hounigo_live_deeplink');
      if (raw) {
        sessionStorage.removeItem('hounigo_live_deeplink');
        const parsed = JSON.parse(raw);
        if (parsed && Date.now() - Number(parsed.ts || 0) < 60_000) {
          applyDeepLink(parsed);
        }
      }
    } catch {}
    const onDeepLink = (e: Event) => {
      applyDeepLink((e as CustomEvent)?.detail);
    };
    window.addEventListener('hounigo_live_deeplink', onDeepLink);
    return () => window.removeEventListener('hounigo_live_deeplink', onDeepLink);
  }, []);

  useEffect(() => {
    if (!pendingDeepLinkPhotoId || displayPhotos.length === 0) return;
    const idx = displayPhotos.findIndex(p => p.id === pendingDeepLinkPhotoId);
    if (idx >= 0) {
      setActiveTab('foto');
      setActiveLightboxIndex(idx);
      setPendingDeepLinkPhotoId(null);
    }
  }, [pendingDeepLinkPhotoId, displayPhotos]);

  const handlePhotoCommentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeLightboxPhotoId || !activeLightboxIsPublic || !props.onAddPhotoComment || photoCommentSubmitBusy.current) return;
    const cleanAuthor = guestAuthorInput.trim();
    const cleanText = photoCommentInput.trim();
    if (!cleanAuthor || !cleanText) {
      setPhotoCommentError('Inserisci il tuo nome e un commento.');
      return;
    }
    setPhotoCommentError(null);
    photoCommentSubmitBusy.current = true;
    setIsSendingPhotoComment(true);
    try {
      await props.onAddPhotoComment(activeLightboxPhotoId, cleanAuthor, cleanText, replyingToPhotoComment);
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('hounigo_guest_author_name', cleanAuthor); } catch { }
      }
      setPhotoCommentInput('');
      setReplyingToPhotoComment(null);
    } catch (err: any) {
      setPhotoCommentError(err?.message || 'Impossibile inviare il commento.');
    } finally {
      photoCommentSubmitBusy.current = false;
      setIsSendingPhotoComment(false);
    }
  };

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
      const errMsg = error instanceof Error ? error.message : 'Foto non salvata. Riprova.';
      if (errMsg.includes('dispositivo') || errMsg.includes('galleria locale')) {
        clearPendingPhotos();
        setPhotoRevealVersion(version => version + 1);
      }
      setUploadError(errMsg);
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

  const latestPhoto = displayPhotos[0] || null;
  const visibleGuestMessages = useMemo(
    () => (props.guestMessages || []).filter(m => !m.hidden),
    [props.guestMessages]
  );

  const latestSignals = useMemo<Record<LiveSectionTab, string>>(() => ({
    mappa: lastDetectedDate ? String(lastDetectedDate.getTime()) : '',
    foto: latestPhoto ? `${latestPhoto.id}:${latestPhoto.timestamp}` : '',
    diario: diaryUpdates[0] ? `${diaryUpdates[0].id}:${diaryUpdates[0].timestamp || 0}` : '',
    messaggi: visibleGuestMessages[0] ? `${visibleGuestMessages[0].id}:${visibleGuestMessages[0].createdAt || 0}` : ''
  }), [lastDetectedDate, latestPhoto, diaryUpdates, visibleGuestMessages]);

  const markTabSeen = (tab: LiveSectionTab) => {
    const latest = latestSignals[tab];
    if (!latest) return;
    setSeenSignals(prev => {
      if (prev[tab] === latest) return prev;
      const next = { ...prev, [tab]: latest };
      try {
        localStorage.setItem(seenStorageKey, JSON.stringify(next));
      } catch { }
      return next;
    });
  };

  useEffect(() => {
    const latest = latestSignals[activeTab];
    if (!latest || seenSignals[activeTab] === latest) return;
    markTabSeen(activeTab);
  }, [activeTab, latestSignals, seenSignals]);

  const handleSelectTab = (tab: LiveSectionTab) => {
    setActiveTab(tab);
    markTabSeen(tab);
  };

  const hasTabNovelty = (tab: LiveSectionTab) =>
    tab !== activeTab && Boolean(latestSignals[tab]) && seenSignals[tab] !== latestSignals[tab];

  const renderUpdateCard = (update: LiveUpdate) => (
    <article key={update.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <time className="text-xs font-medium text-slate-500 dark:text-slate-400">{formatUpdateDate(update.timestamp)}</time>
          <h3 className="mt-0.5 text-base font-extrabold leading-snug text-[#172033] dark:text-white">{update.title}</h3>
          {update.locationName && <p className="mt-1 break-words text-xs font-semibold text-[#C83E31] dark:text-[#FF8C82]">⌖ {update.locationName}</p>}
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
      {update.text && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{update.text}</p>}
      {update.photoUrl && (
        <button
          type="button"
          onClick={() => {
            const index = displayPhotos.findIndex(photo => photo.url === update.photoUrl || photo.id === update.id);
            setActiveLightboxIndex(index >= 0 ? index : 0);
          }}
          className="mt-2.5 block w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900"
        >
          <img src={update.photoUrl} alt={update.title} className="max-h-[420px] min-h-32 w-full object-contain" loading="lazy" />
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800" aria-label="Reazioni">
        {REACTIONS.map(emoji => {
          const selected = props.reactions[update.id] === emoji;
          const count = update.reactionCounts?.[emoji] || 0;
          return (
            <button
              key={emoji}
              type="button"
              disabled={!isOnline}
              onClick={() => props.onReaction(update.id, emoji)}
              className={`min-h-11 min-w-11 rounded-full border px-3 text-sm transition motion-reduce:transition-none disabled:opacity-40 ${selected ? 'border-[#FF6B5F] bg-[#FFF0ED] text-[#172033]' : 'border-slate-200 bg-transparent text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
              aria-pressed={selected}
              aria-label={`Reazione ${emoji}${count ? `, ${count}` : ''}`}
            >
              {emoji}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>
      {props.reactionError && (
        <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">
          {props.reactionError}
        </p>
      )}
    </article>
  );

  return (
    <div className="hounigo-live-entry mx-auto flex min-h-[100dvh] w-full max-w-5xl lg:max-w-7xl flex-col overflow-x-hidden px-3 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] text-slate-900 dark:text-slate-100 sm:px-6">
      {/* A. INTESTAZIONE ESSENZIALE + ORARI ITALIA / LOCALE */}
      <header
        data-testid="live-section-header"
        className="border-b border-slate-200 pb-2 dark:border-slate-800"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {!props.isExternal && props.onBack && (
              <button type="button" onClick={props.onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base dark:bg-slate-800 cursor-pointer" aria-label="Torna ad Altro">←</button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-black tracking-[0.18em] text-[#FF6B5F]">LIVE</span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${gpsVisualState.tone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${gpsVisualState.dot}`} />
                  {gpsVisualState.label}
                </span>
              </div>
              <h1 className="mt-0.5 truncate text-lg font-black leading-tight tracking-tight text-[#172033] dark:text-white sm:text-xl">{tripTitle}</h1>
            </div>
          </div>
          <button type="button" onClick={props.onShare} className="min-h-9 shrink-0 rounded-full bg-[#172033] px-3 text-xs font-bold text-white dark:bg-white dark:text-[#172033] cursor-pointer">
            {props.copiedLink ? 'Copiato ✓' : 'Condividi'}
          </button>
        </div>

        {/* Orari compatti: evita duplicazione se il fuso è identico a quello italiano */}
        <div
          data-testid="live-dual-clock"
          className="mt-2 grid grid-cols-2 gap-2 sm:max-w-lg"
          aria-label="Orario locale del viaggio e orario italiano"
        >
          <div
            data-testid="live-clock-travel"
            className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/70"
          >
            {dualClock.travel && (!dualClock.offsetLabel || dualClock.offsetLabel === '0h') ? (
              <>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Stato viaggio
                  </span>
                  <Compass className="w-3 h-3 shrink-0 text-[#FF6B5F]" aria-hidden="true" />
                </div>
                <p className="mt-0.5 truncate text-sm font-black leading-tight text-[#172033] dark:text-white">
                  {props.liveIntelligence?.tripStatus === 'pre_trip'
                    ? 'In preparazione'
                    : props.liveIntelligence?.tripStatus === 'in_trip'
                      ? 'In viaggio'
                      : props.liveIntelligence?.tripStatus === 'post_trip'
                        ? 'Viaggio concluso'
                        : 'Stato non disponibile'}
                </p>
                <p className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {plannedLocation?.title || 'Stesso fuso dell’Italia'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {dualClock.travelLabel}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {(dualClock.travelSource === 'gps' || dualClock.travelSource === 'planned' || dualClock.travelSource === 'header') && (
                      <span
                        data-testid="live-clock-travel-source"
                        title={dualClock.travelSource === 'gps' ? 'Fuso da posizione GPS reale' : 'Fuso da tappa programmata'}
                        className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          dualClock.travelSource === 'gps'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {dualClock.travelSource === 'gps' ? 'GPS' : 'Programma'}
                      </span>
                    )}
                    {dualClock.travel && (
                      <span
                        data-testid="live-clock-travel-period"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
                        title={dualClock.travel.dayNightLabel}
                      >
                        <span aria-hidden="true">{dualClock.travel.dayNightIcon}</span>
                        <span>{dualClock.travel.dayNightLabel}</span>
                      </span>
                    )}
                  </div>
                </div>
                {dualClock.travel ? (
                  <>
                    <p
                      data-testid="live-clock-travel-time"
                      className="mt-0.5 font-mono text-base font-black leading-tight tracking-tight text-[#172033] tabular-nums dark:text-white sm:text-lg"
                    >
                      {dualClock.travel.timeStr}
                    </p>
                    <p
                      data-testid="live-clock-travel-date"
                      className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      <span className="capitalize">{dualClock.travel.dateStr}</span>
                      {dualClock.offsetLabel && dualClock.offsetLabel !== '0h' ? (
                        <span className={dualClock.isDifferentDate ? ' font-bold text-[#C83E31] dark:text-[#FF8C82]' : ''}>
                          {` · ${dualClock.offsetLabel}${dualClock.dayDiff !== 0 ? ` (${dualClock.dayDiff > 0 ? `+${dualClock.dayDiff}g` : `${dualClock.dayDiff}g`})` : ''}`}
                        </span>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <p
                    data-testid="live-clock-travel-fallback"
                    className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400"
                  >
                    Fuso disponibile con posizione condivisa
                  </p>
                )}
              </>
            )}
          </div>

          <div
            data-testid="live-clock-italy"
            className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/70"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
                🇮🇹 Italia
              </span>
              <span
                data-testid="live-clock-italy-period"
                className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
                title={dualClock.italy.dayNightLabel}
              >
                <span aria-hidden="true">{dualClock.italy.dayNightIcon}</span>
                <span>{dualClock.italy.dayNightLabel}</span>
              </span>
            </div>
            <p
              data-testid="live-clock-italy-time"
              className="mt-0.5 font-mono text-base font-black leading-tight tracking-tight text-[#172033] tabular-nums dark:text-white sm:text-lg"
            >
              {dualClock.italy.timeStr}
            </p>
            <p
              data-testid="live-clock-italy-date"
              className="truncate text-[10px] font-medium capitalize text-slate-500 dark:text-slate-400"
            >
              {dualClock.italy.dateStr}
            </p>
          </div>
        </div>
      </header>

      {/* Navigazione principale a 4 tab: Mappa | Foto | Diario | Messaggi */}
      <nav
        className="mt-2 grid grid-cols-4 gap-1 rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80 lg:max-w-2xl"
        role="tablist"
        aria-label="Sezioni LIVE"
      >
        {([
          { id: 'mappa', Icon: MapPin, label: 'Mappa' },
          { id: 'foto', Icon: Camera, label: 'Foto' },
          { id: 'diario', Icon: BookOpen, label: 'Diario' },
          { id: 'messaggi', Icon: MessageCircle, label: 'Messaggi' }
        ] as const).map(tab => {
          const isActive = activeTab === tab.id;
          const showDot = hasTabNovelty(tab.id);
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`live-tab-${tab.id}`}
              onClick={() => handleSelectTab(tab.id)}
              className={`relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition cursor-pointer ${isActive
                ? 'bg-[#172033] text-white shadow-xs dark:bg-white dark:text-[#172033]'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
            >
              <TabIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap text-[11px] sm:text-xs font-bold leading-tight">{tab.label}</span>
              {showDot && (
                <span
                  data-testid={`live-tab-dot-${tab.id}`}
                  className="hounigo-live-tab-dot absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#FF6B5F]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {!isOnline && (
        <div className="mt-2.5 flex items-center gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          <span>Offline.</span><span>Diario disponibile; LIVE in pausa.</span>
        </div>
      )}

      {/* B. TAB MAPPA (Mappa protagonista + Trasporti accessibili + Controlli GPS) */}
      {activeTab === 'mappa' && (
        <div className="mt-3 flex-1 space-y-4 lg:grid lg:grid-cols-12 lg:gap-4 lg:space-y-0 lg:items-start xl:block xl:space-y-4">
          <div className="min-w-0 lg:col-span-7">
            <section id="live-position" data-testid="live-section-position" aria-labelledby="live-position-title" className="scroll-mt-20 md:scroll-mt-4">
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#FF6B5F]">Posizione</p>
                  <h2 id="live-position-title" className="text-xl sm:text-2xl font-black tracking-tight text-[#172033] dark:text-white">Dove siamo</h2>
                </div>
                {positionAgeLabel && lastDetectedDate && (
                  <time
                    data-testid="live-gps-updated-ago"
                    className="text-right text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                  >
                    {positionAgeLabel}
                  </time>
                )}
              </div>

                    <div className="relative mb-2 grid grid-cols-3 gap-1 rounded-full bg-[#172033]/90 p-1 text-[10px] font-bold text-white backdrop-blur" role="group" aria-label="Centra mappa">
                      {(['both', 'real', 'planned'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => props.onChangeMapCenterMode?.(mode)}
                          disabled={(mode === 'real' && !hasRealLocation) || (mode === 'planned' && !hasPlannedLocation) || (mode === 'both' && !(hasRealLocation && hasPlannedLocation))}
                          className={`min-h-9 rounded-full px-2 disabled:opacity-35 ${props.mapCenterMode === mode ? 'bg-[#FF6B5F] text-white' : 'text-white/75'}`}
                          aria-pressed={props.mapCenterMode === mode}
                        >
                          {mode === 'both' ? 'GPS + Programma' : mode === 'real' ? 'GPS' : 'Programma'}
                        </button>
                      ))}
                    </div>

              {props.tileGrid && !props.tileLoadFailed && (hasRealLocation || hasPlannedLocation) ? (
                <div className="relative min-h-[300px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[420px] lg:min-h-[340px] lg:h-[calc(100dvh-16rem)] lg:max-h-[430px] xl:h-auto xl:min-h-[460px] xl:max-h-none">
                  <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                    <div
                      className="absolute left-1/2 top-1/2 grid h-[768px] w-[768px] -translate-x-1/2 -translate-y-1/2 grid-cols-3 grid-rows-3 opacity-95 dark:opacity-60"
                      style={{ marginLeft: -(props.tileGrid.pixelOffset?.x || 0), marginTop: -(props.tileGrid.pixelOffset?.y || 0) }}
                    >
                      {props.tileGrid.tiles.map((tile: any) => <img key={tile.key} src={tile.url} alt="" onError={props.onTileError} className="h-64 w-64 object-cover" />)}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(15,23,42,.78),transparent_55%)]" />

                  {showRealMarker && (
                    <div className={`pointer-events-none absolute left-1/2 top-1/2 z-10 flex flex-col items-center ${shouldSmoothRealMarker ? 'hounigo-live-marker-transition' : ''}`} style={{ transform: props.realMarkerOffset ? `translate(calc(-50% + ${props.realMarkerOffset.dx}px), calc(-50% + ${props.realMarkerOffset.dy}px))` : 'translate(-50%, -50%)' }}>
                      {isFreshGps ? (
                        <>
                          <span key={lastDetectedDate?.getTime()} className="hounigo-live-gps-confirmed absolute h-14 w-14 rounded-full bg-[#FF6B5F]/30" />
                          <span className="relative h-5 w-5 rounded-full border-3 border-white bg-[#FF6B5F] shadow-lg" />
                          <span className="mt-2 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FF6B5F] px-2.5 py-0.5 text-[10px] font-black text-white shadow-lg tracking-wide uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            Dove siamo · LIVE
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="relative h-5 w-5 rounded-full border-3 border-white bg-amber-500 shadow-lg" />
                          <span className="mt-2 flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-lg">
                            <span>⏱️</span> Ultima posizione nota
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {showPlannedMarker && (
                    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex flex-col items-center" style={{ transform: props.plannedMarkerOffset ? `translate(calc(-50% + ${props.plannedMarkerOffset.dx}px), calc(-50% + ${props.plannedMarkerOffset.dy}px))` : 'translate(-50%, -50%)' }}>
                      <span className="h-5 w-5 rotate-45 rounded-[4px] border-2 border-white bg-[#172033] shadow-lg" />
                      <span className="mt-2 whitespace-nowrap rounded-full bg-[#172033] px-2.5 py-1 text-[10px] font-bold text-white shadow-lg border border-white/20">Programma</span>
                    </div>
                  )}

                  <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2.5 rounded-2xl bg-slate-950/80 p-2.5 sm:p-3 text-white backdrop-blur-md border border-white/15 shadow-xl">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {props.mapCenterMode === 'planned' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-500/30 text-slate-200 text-[10px] font-bold uppercase tracking-wider">
                            Programma
                          </span>
                        ) : isFreshGps ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            GPS LIVE
                          </span>
                        ) : isStaleGps ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                            <span>⏱️</span> Ultima posizione nota
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-500/20 text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                            Programma
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm sm:text-base font-black tracking-tight text-white">
                        {props.mapCenterMode === 'planned'
                          ? plannedLocation?.title || 'Programma non disponibile'
                          : hasRealLocation
                            ? displayLocation?.city || 'Posizione condivisa'
                            : plannedLocation?.title || 'GPS non condiviso'}
                      </p>
                    </div>
                    {(hasRealLocation || hasPlannedLocation) && (
                      <a
                        href={props.mapSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-9 shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold text-white transition backdrop-blur-sm border border-white/20 cursor-pointer"
                      >
                        <span>Apri mappa</span>
                        <span className="text-[10px]">↗</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  data-testid="live-map-empty-state"
                  className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isFreshGps
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : isStaleGps
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                    {isFreshGps ? (
                      <Radio className="w-5 h-5" aria-hidden="true" />
                    ) : isStaleGps ? (
                      <Clock className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <MapPinOff className="w-5 h-5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-[#172033] dark:text-white">
                      {isFreshGps
                        ? `GPS LIVE attivo${displayLocation?.city ? ` · ${displayLocation.city}` : ''}`
                        : isStaleGps
                          ? `Ultima posizione nota${positionAgeLabel ? ` · ${positionAgeLabel}` : ''}`
                          : 'Posizione assente'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {isFreshGps
                        ? 'Segnale attivo; anteprima mappa non disponibile.'
                        : isStaleGps
                          ? 'Nessun aggiornamento recente; anteprima mappa non disponibile.'
                          : plannedLocation?.title
                            ? `Nessuna coordinata GPS condivisa · In programma: ${plannedLocation.title}`
                            : 'Nessuna coordinata disponibile.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5 xl:hidden">
              </div>
            </section>
          </div>
          <div className="min-w-0 lg:col-span-5 space-y-2.5">
            <LiveNextTransportCard item={props.nextImportantTransport} items={props.upcomingTransports} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
                <div className={`border-l-3 pl-3 py-0.5 rounded-r-xl transition ${isFreshGps ? 'border-[#FF6B5F] bg-[#FFF0ED]/20 dark:bg-slate-900/40' : isStaleGps ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/10' : 'border-slate-300 dark:border-slate-700'}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {isFreshGps ? 'Posizione attuale (GPS Live)' : isStaleGps ? 'Ultima posizione conosciuta' : 'Posizione reale'}
                  </p>
                  <p className="mt-0.5 text-sm font-extrabold text-[#172033] dark:text-white">
                    {hasRealLocation ? (displayLocation?.city || 'Posizione salvata') : 'Posizione non condivisa'}
                  </p>
                  <p data-testid="live-gps-card-age" className="mt-0.5 text-xs text-slate-500">
                    {positionAgeLabel && lastDetectedDate
                      ? `${positionAgeLabel} · ${formatLastDetectedTimestamp(lastDetectedDate)?.replace('Aggiornata ', '')}`
                      : (props.isExternal ? 'Nessun segnale condiviso' : gpsVisualState.label)}
                  </p>
                  {isStaleGps && (
                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      Segnale non recente: mostrata l&apos;ultima posizione salvata.
                    </p>
                  )}
                </div>
                <div className="border-l-3 border-[#172033] pl-3 py-0.5 rounded-r-xl bg-slate-50/50 dark:bg-slate-900/40 dark:border-slate-600">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Da programma</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[#172033] dark:text-white">{plannedLocation?.title || 'Nessuna tappa ora'}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{plannedLocation?.coords ? 'Da itinerario · fuso locale' : 'Nessuna coordinata'}</p>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* C. TAB FOTO (Solo ultima foto pubblicata, cliccabile per galleria a schermo intero) */}
      {activeTab === 'foto' && (
        <section data-testid="live-section-photos" aria-labelledby="live-photos-title" className="mt-3 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#FF6B5F]">Fotografie</p>
              <h2 id="live-photos-title" className="text-xl sm:text-2xl font-black tracking-tight text-[#172033] dark:text-white">
                {displayPhotos.length ? `Ultimo scatto (${displayPhotos.length} totali)` : 'Galleria del viaggio'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {displayPhotos.length > 0 && (
                <button
                  type="button"
                  data-testid="live-open-gallery-btn"
                  onClick={() => setActiveLightboxIndex(0)}
                  className="min-h-10 rounded-full bg-[#172033] px-3.5 text-xs font-bold text-white dark:bg-white dark:text-[#172033] cursor-pointer"
                >
                  Apri galleria ({displayPhotos.length})
                </button>
              )}
              {props.canPublish && !props.isExternal && (
                <>
                  <input ref={fileUploadInputRef} type="file" accept={IMAGE_FILE_ACCEPT} multiple className="hidden" onChange={handlePhotoFileSelected} />
                  <button type="button" onClick={() => fileUploadInputRef.current?.click()} className="min-h-10 rounded-full bg-[#FF6B5F] px-3.5 text-xs font-bold text-white cursor-pointer">
                    Aggiungi foto
                  </button>
                </>
              )}
            </div>
          </div>

          {latestPhoto ? (
            <figure
              key={`latest-photo-${photoRevealVersion}`}
              className={`mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${photoRevealVersion > 0 ? 'hounigo-photo-saved-reveal' : ''}`}
            >
              <div className="relative aspect-[4/3] max-h-[58vh] w-full bg-slate-100 dark:bg-slate-950">
                <button
                  type="button"
                  data-testid="live-latest-photo-trigger"
                  onClick={() => setActiveLightboxIndex(0)}
                  className="h-full w-full cursor-pointer"
                  aria-label="Apri galleria fotografica a schermo intero"
                >
                  <img
                    src={latestPhoto.url}
                    alt={latestPhoto.caption || 'Ultima foto del viaggio'}
                    className="h-full w-full object-cover"
                    onError={event => { event.currentTarget.style.display = 'none'; }}
                  />
                </button>
                {latestPhoto.pendingSync && !props.isExternal && (
                  <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                    Solo sul dispositivo
                  </span>
                )}
                {props.canPublish && !props.isExternal && props.onDeletePhoto && (
                  <button
                    type="button"
                    onClick={() => window.confirm('Eliminare questa foto dal dispositivo?') && props.onDeletePhoto?.(latestPhoto.id)}
                    className="absolute right-3 top-3 min-h-9 rounded-full bg-black/65 px-3 text-xs font-bold text-white cursor-pointer"
                    aria-label="Elimina foto"
                  >
                    Elimina
                  </button>
                )}
                <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-xs">
                  Tocca per sfogliare ({displayPhotos.length})
                </span>
              </div>
              <figcaption className="p-3.5 sm:p-4">
                <p className="break-words text-sm sm:text-base font-extrabold text-[#172033] dark:text-white">{latestPhoto.caption || 'Momento dal viaggio'}</p>
                <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                  {latestPhoto.location ? `${latestPhoto.location} · ` : ''}
                  <time title={formatUpdateDate(latestPhoto.timestamp)}>{formatRelativeTime(new Date(latestPhoto.timestamp), effectiveNowMs)}</time>
                </p>
              </figcaption>
            </figure>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
              <p className="text-base font-bold">Nessuno scatto ancora.</p>
              {props.canPublish && <p className="mt-1 text-xs text-slate-500">Puoi aggiungerne quando vuoi con il pulsante in alto.</p>}
            </div>
          )}

          {props.canPublish && !props.isExternal && (
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400">
              📷 Foto salvate sul dispositivo locale. La condivisione su cloud storage non è attiva in questa versione.
            </div>
          )}
        </section>
      )}

      {/* D. TAB DIARIO DI VIAGGIO */}
      {activeTab === 'diario' && (
        <div data-testid="live-section-diary-interactions" className="mt-3 flex-1 space-y-5">
          <section id="live-diary" data-testid="live-section-diary" aria-labelledby="live-diary-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#FF6B5F]">Diario</p>
                <h2 id="live-diary-title" className="text-xl sm:text-2xl font-black tracking-tight text-[#172033] dark:text-white">Ricordi dal viaggio</h2>
              </div>
              {props.canPublish && !props.isExternal && <button type="button" onClick={() => setIsComposerOpen(open => !open)} className="min-h-10 rounded-full bg-[#FF6B5F] px-3.5 text-xs font-bold text-white cursor-pointer">Nuovo ricordo</button>}
            </div>

            <article className="mt-3.5 rounded-2xl border border-slate-200 border-l-[3px] border-l-[#FF6B5F] bg-white p-3.5 dark:border-slate-800 dark:border-l-[#FF6B5F] dark:bg-slate-900/70">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-slate-400">Dagli organizzatori</p>
                {props.canPublish && !props.isExternal && <button type="button" onClick={props.onToggleStatusEdit} className="min-h-9 text-xs font-bold text-[#FF6B5F]">{props.isEditingStatus ? 'Annulla' : 'Modifica'}</button>}
              </div>
              {props.isEditingStatus ? (
                <div className="mt-1.5">
                  <textarea rows={2} value={props.tempStatus} onChange={event => props.onTempStatusChange(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                  <button type="button" onClick={props.onSaveStatus} className="mt-2 min-h-10 rounded-full bg-[#172033] px-4 text-xs font-bold text-white dark:bg-white dark:text-[#172033]">Salva</button>
                </div>
              ) : (
                <>
                  <p className="mt-1 break-words text-sm sm:text-base font-semibold leading-relaxed text-[#172033] dark:text-white">{props.statusMessage}</p>
                  {props.statusUpdatedAt && (
                    <time className="mt-1 block text-[11px] text-slate-400">
                      {typeof props.statusUpdatedAt === 'string'
                        ? props.statusUpdatedAt
                        : (props.statusUpdatedAt instanceof Date
                          ? props.statusUpdatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                          : String(props.statusUpdatedAt))}
                    </time>
                  )}
                </>
              )}
            </article>

            {isComposerOpen && props.canPublish && !props.isExternal && (
              <form onSubmit={props.onSendMessage} className="mt-3.5 rounded-2xl bg-white p-3.5 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2"><label className="text-sm font-extrabold">Nuovo ricordo</label><span className="text-[11px] text-slate-400">{props.liveTextMessage.length}/500</span></div>
                <textarea rows={3} maxLength={500} autoFocus value={props.liveTextMessage} onChange={event => props.onLiveTextChange(event.target.value)} placeholder="Racconta un momento…" className="mt-2 w-full resize-none rounded-2xl border border-slate-300 bg-[#F8F7F3] p-2.5 text-sm dark:border-slate-700 dark:bg-[#172033]" />
                {props.messageError && <p className="mt-2 text-xs font-semibold text-rose-600">{props.messageError}</p>}
                {props.messageSuccess && <p className="mt-2 text-xs font-semibold text-emerald-600">{props.messageSuccess}</p>}
                <div className="mt-2.5 flex justify-end gap-2"><button type="button" onClick={() => setIsComposerOpen(false)} className="min-h-10 px-3 text-xs font-bold text-slate-500">Annulla</button><button type="submit" disabled={props.isSendingMessage || !props.liveTextMessage.trim() || (!isOnline && !props.canWriteOffline)} className="min-h-10 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white disabled:opacity-40">{props.isSendingMessage ? 'Pubblicazione…' : 'Pubblica'}</button></div>
              </form>
            )}

            <div className="mt-5 space-y-3">
              {(props.offlineQueueItems || []).filter(q => q.kind === 'diary_message').map(qItem => (
                <div
                  key={qItem.id}
                  data-testid="live-offline-pending-diary"
                  className="rounded-2xl border border-amber-300/80 bg-amber-50/70 p-3 dark:border-amber-800/70 dark:bg-amber-950/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/70 dark:text-amber-200">
                        🕒 In attesa di invio
                      </span>
                      <p className="mt-1 text-sm font-bold text-[#172033] dark:text-white">{qItem.authorName}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200">{qItem.text}</p>
                    </div>
                    {props.onCancelOfflineItem && (
                      <button
                        type="button"
                        onClick={() => props.onCancelOfflineItem?.(qItem.id)}
                        className="min-h-9 shrink-0 rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 cursor-pointer"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {diaryUpdates.length === 0 && (props.offlineQueueItems || []).filter(q => q.kind === 'diary_message').length === 0 ? (
                <div className="py-5 text-center"><p className="text-sm font-bold">Il diario è ancora vuoto.</p><p className="mt-0.5 text-xs text-slate-500">Gli aggiornamenti pubblici compariranno qui.</p></div>
              ) : (
                <>
                  {paginatedUpdates[0] && renderUpdateCard(paginatedUpdates[0])}
                  {(isArchiveOpen || diaryPage > 1) && paginatedUpdates.slice(1).map(renderUpdateCard)}
                  {paginatedUpdates.length > 1 && diaryPage === 1 && <button type="button" onClick={() => setIsArchiveOpen(open => !open)} className="min-h-10 w-full border-t border-slate-200 text-xs font-bold text-[#FF6B5F] dark:border-slate-800">{isArchiveOpen ? 'Chiudi archivio' : `Altri ricordi (${diaryUpdates.length - 1})`}</button>}
                  {totalDiaryPages > 1 && <div className="mt-3 flex items-center justify-between gap-3"><button type="button" disabled={diaryPage === 1} onClick={() => setDiaryPage(page => Math.max(1, page - 1))} className="min-h-10 px-2 text-xs font-bold disabled:opacity-30">← Prima</button><span className="text-xs text-slate-500">{diaryPage} / {totalDiaryPages}</span><button type="button" disabled={diaryPage === totalDiaryPages} onClick={() => setDiaryPage(page => Math.min(totalDiaryPages, page + 1))} className="min-h-10 px-2 text-xs font-bold disabled:opacity-30">Dopo →</button></div>}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* E. TAB MESSAGGI E INTERAZIONI */}
      {activeTab === 'messaggi' && (
        <section id="live-interactions" data-testid="live-section-messages" aria-labelledby="live-interactions-title" className="mt-3 flex-1 space-y-4">
          <p className="text-xs font-bold text-[#FF6B5F]">Interazioni</p>
          <h2 id="live-interactions-title" className="text-xl sm:text-2xl font-black tracking-tight text-[#172033] dark:text-white">Vicini, anche da lontano</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 xl:gap-4 border-y border-slate-200 py-2.5 dark:border-slate-800">
            <div className="min-w-0"><p className="text-lg xl:text-2xl font-black">{reactionTotal}</p><p className="text-xs text-slate-500">Reazioni</p></div>
            <div className="min-w-0"><p className="text-lg xl:text-2xl font-black">{diaryUpdates.length}</p><p className="text-xs text-slate-500">Ricordi</p></div>
            <div className="min-w-0"><p className="text-lg xl:text-2xl font-black">{(props.guestMessages || []).filter(m => !m.hidden).length}</p><p className="text-xs text-slate-500">Messaggi</p></div>
          </div>

          {/* Guestbook / Messaggi dagli Ospiti */}
          <div className="mt-4 space-y-3">
            <div>
              <h3 className="text-base font-extrabold text-[#172033] dark:text-white">Pensieri dal pubblico</h3>
              <p className="mt-0.5 text-xs text-slate-500">Auguri approvati nel diario del viaggio.</p>
            </div>

            {props.onSendGuestMessage ? (
              <form onSubmit={handleGuestMessageSubmit} className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                {replyingToGuestMsg && (
                  <div
                    data-testid="live-guest-reply-preview"
                    className="flex items-start justify-between gap-2 rounded-xl border-l-3 border-[#FF6B5F] bg-slate-100/90 px-3 py-2 text-xs dark:bg-slate-800/80"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[#FF6B5F]">Risposta a {replyingToGuestMsg.authorName}</p>
                      <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{replyingToGuestMsg.preview}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingToGuestMsg(null)}
                      aria-label="Annulla risposta"
                      className="shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Nome</label>
                    <input
                      type="text"
                      maxLength={40}
                      required
                      value={guestAuthorInput}
                      onChange={(e) => setGuestAuthorInput(e.target.value)}
                      placeholder="Es. Nunzio, Lucia..."
                      className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-[#F8F7F3] px-3 text-xs text-[#172033] focus:border-[#FF6B5F] focus:outline-none dark:border-slate-700 dark:bg-[#172033] dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Messaggio</label>
                      <span className="text-[10px] text-slate-400">{guestMessageInput.length}/280</span>
                    </div>
                    <input
                      ref={guestMsgInputRef}
                      type="text"
                      maxLength={280}
                      required
                      value={guestMessageInput}
                      onChange={(e) => setGuestMessageInput(e.target.value)}
                      placeholder={replyingToGuestMsg ? `Rispondi a ${replyingToGuestMsg.authorName}…` : 'Scrivi un pensiero per il diario…'}
                      className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-[#F8F7F3] px-3 text-xs text-[#172033] focus:border-[#FF6B5F] focus:outline-none dark:border-slate-700 dark:bg-[#172033] dark:text-white"
                    />
                  </div>
                </div>
                {guestMsgError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">{guestMsgError}</p>}
                {guestMsgSuccess && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400" role="status">{guestMsgSuccess}</p>}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[10px] text-slate-400">Visibile nel diario</span>
                  <button
                    type="submit"
                    disabled={isSendingGuestMsg || (!isOnline && !props.canWriteOffline) || !guestAuthorInput.trim() || !guestMessageInput.trim()}
                    className="min-h-10 rounded-full bg-[#FF6B5F] px-4 text-xs font-bold text-white transition hover:bg-[#e85c50] disabled:opacity-40"
                  >
                    {isSendingGuestMsg ? 'Invio…' : 'Invia'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                  <span>🛡️</span>
                  <span>Bacheca Pensieri dal Pubblico (Sola Lettura)</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  L'invio diretto di messaggi pubblici dal browser non è attualmente attivo. Qui trovi quelli approvati.
                </p>
              </div>
            )}

            {/* Coda locale offline (solo Owner e Copiloti) */}
            {(props.offlineQueueItems || []).filter(q => q.kind === 'guest_message').map(qItem => (
              <div
                key={qItem.id}
                data-testid="live-offline-pending-guest-message"
                className="rounded-2xl border border-amber-300/80 bg-amber-50/70 p-3 dark:border-amber-800/70 dark:bg-amber-950/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-extrabold text-[#172033] dark:text-white">{qItem.authorName}</span>
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/70 dark:text-amber-200">
                        🕒 In attesa di invio
                      </span>
                    </div>
                    {qItem.replyTo?.authorName && (
                      <div className="mt-1.5 rounded-lg border-l-2 border-[#FF6B5F] bg-white/70 px-2.5 py-1 text-[11px] dark:bg-slate-900/60">
                        <p className="font-bold text-[#FF6B5F]">{qItem.replyTo.authorName}</p>
                        <p className="truncate text-slate-600 dark:text-slate-300">{qItem.replyTo.preview}</p>
                      </div>
                    )}
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {qItem.text}
                    </p>
                  </div>
                  {props.onCancelOfflineItem && (
                    <button
                      type="button"
                      onClick={() => props.onCancelOfflineItem?.(qItem.id)}
                      className="min-h-9 shrink-0 rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 cursor-pointer"
                    >
                      Annulla
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Lista messaggi ospiti */}
            {(props.guestMessages && props.guestMessages.length > 0) ? (
              <div className="space-y-2">
                {groupLiveThreads(props.guestMessages).map(thread => (
                  <div key={thread[0].item.id} className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" data-testid="live-message-thread">
                  {thread.map(({ item: msg, depth }) => (
                  <div key={msg.id} className={`${depth ? 'mt-2 border-l-2 border-[#FF6B5F]/40 pl-2 pt-1' : ''} ${depth === 2 ? 'ml-3' : ''} ${msg.hidden ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 basis-40">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-extrabold text-[#172033] dark:text-white">{msg.authorName}</span>
                          <span className="text-[10px] text-slate-400">{formatUpdateDate(msg.createdAt)}</span>
                          {msg.hidden && (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                              Nascosto
                            </span>
                          )}
                        </div>
                        {depth === 0 && msg.replyToId && <p className="mt-1 text-[10px] text-slate-500">Risposta a un messaggio non disponibile</p>}
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                          {msg.message}
                        </p>
                        {props.onSendGuestMessage && !msg.hidden && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToGuestMsg({
                                id: msg.id,
                                authorName: msg.authorName,
                                preview: msg.message.slice(0, 100),
                              });
                              guestMsgInputRef.current?.focus();
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6B5F] hover:text-[#e85c50] cursor-pointer"
                          >
                            <Reply className="w-3 h-3" aria-hidden="true" />
                            <span>Rispondi</span>
                          </button>
                        )}
                      </div>
                      {!props.isExternal && (props.isOwner || props.isCopilota) && props.onModerateGuestMessage && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => props.onModerateGuestMessage?.(msg.id, msg.hidden ? 'unhide' : 'hide')}
                            className="min-h-11 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
                            className="min-h-11 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400"
                          >
                            Elimina
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nessun messaggio dagli ospiti per ora.</p>
            )}
          </div>
        </section>
      )}

      {/* E. INFORMAZIONI SECONDARIE E CONTROLLI LIVE (visibile nel tab Mappa) */}
      {activeTab === 'mappa' && (
        <section
          data-testid="live-section-secondary"
          aria-label="Informazioni secondarie e controlli LIVE"
          className="mt-5 space-y-3.5 border-t border-slate-200 pt-4 dark:border-slate-800"
        >
          {!props.isExternal && props.liveIntelligence && (
            <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold text-[#FF6B5F]">Adesso</p>
                <p className="mt-0.5 text-sm font-extrabold">{props.liveIntelligence.currentEvent?.title || (props.liveIntelligence.tripStatus === 'pre_trip' ? 'In attesa della partenza' : props.liveIntelligence.tripStatus === 'post_trip' ? 'Viaggio concluso' : 'Tempo libero')}</p>
                {props.liveIntelligence.currentEvent?.timeRange && <p className="mt-0.5 text-xs text-slate-500">{props.liveIntelligence.currentEvent.timeRange}</p>}
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">Prossima tappa</p>
                <p className="mt-0.5 text-sm font-extrabold">{props.liveIntelligence.nextEvent?.title || 'Nessun altro appuntamento'}</p>
                {props.liveIntelligence.nextEvent && <p className="mt-0.5 text-xs text-slate-500">{props.liveIntelligence.nextEvent.time}{props.liveIntelligence.nextEvent.locationName ? ` · ${props.liveIntelligence.nextEvent.locationName}` : ''}</p>}
              </div>
            </div>
          )}

          {!props.isExternal && (props.isOwner || props.isCopilota) && (
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 dark:border-slate-800 dark:bg-slate-900/65">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                    Guida GPS
                  </p>
                  <p className={`flex items-center gap-2 text-sm font-extrabold ${gpsVisualState.tone}`}>
                    <span className={`h-2 w-2 rounded-full ${gpsVisualState.dot}`} />
                    {isLeaseActive ? `Ora ${currentGuideName} condivide la posizione` : gpsVisualState.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    Organizzatore: <strong>{props.ownerName || 'Organizzatore'}</strong> · Guida: <strong>{currentGuideName}</strong>
                  </p>
                  {lastDetectedDate && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatGpsPositionAge(lastDetectedDate, effectiveNowMs)} · {formatLastDetectedTimestamp(lastDetectedDate)}
                      {isStaleGps ? ' · ⚠️ Oltre 15 min' : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(props.isOwner || props.isDesignatedGuide) && (
                    <button type="button" onClick={props.onStartGps} disabled={props.isDetectingGps || !isOnline} className="min-h-10 rounded-full bg-[#FF6B5F] px-3.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer">
                      {permissionDenied || isLeaseExpired || isLeaseActive ? 'Aggiorna GPS' : 'Condividi GPS'}
                    </button>
                  )}
                  {isLeaseActive && (props.isGpsHolder || props.isDesignatedGuide) && (
                    <>
                      <button type="button" onClick={props.onPauseGps} disabled={!isOnline} className="min-h-10 rounded-full border border-amber-300 px-3.5 text-xs font-bold text-amber-800 dark:border-amber-800 dark:text-amber-200 cursor-pointer">Pausa</button>
                      <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-10 rounded-full border border-rose-300 px-3.5 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Ferma</button>
                    </>
                  )}
                  {isLeaseActive && props.isOwner && !props.isGpsHolder && !props.isDesignatedGuide && (
                    <>
                      <button type="button" onClick={props.onRevokeGps} disabled={!isOnline} className="min-h-10 rounded-full bg-[#172033] px-3.5 text-xs font-bold text-white dark:bg-white dark:text-[#172033] cursor-pointer">Riprendi guida</button>
                      <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-10 rounded-full border border-rose-300 px-3.5 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Ferma</button>
                    </>
                  )}
                  {isLeasePaused && (props.isOwner || props.isDesignatedGuide) && (
                    <>
                      <button type="button" onClick={props.onResumeGps} disabled={!isOnline} className="min-h-10 rounded-full bg-[#FF6B5F] px-3.5 text-xs font-bold text-white cursor-pointer">Riprendi GPS</button>
                      <button type="button" onClick={props.onStopGps} disabled={!isOnline} className="min-h-10 rounded-full border border-rose-300 px-3.5 text-xs font-bold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer">Interrompi</button>
                    </>
                  )}
                </div>
              </div>
              {props.gpsFeedback && <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300" role="status">✓ {props.gpsFeedback}</p>}
              {props.gpsError && <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300" role="alert">{props.gpsError}</p>}
              <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                ℹ️ Su iPhone/PWA il GPS si aggiorna ad app aperta.
              </p>
              <button type="button" onClick={() => setIsGuideControlsOpen(open => !open)} className="mt-2 min-h-9 text-xs font-bold text-slate-600 underline underline-offset-4 dark:text-slate-300 cursor-pointer" aria-expanded={isGuideControlsOpen}>Delega guida GPS {isGuideControlsOpen ? '−' : '+'}</button>

              {isGuideControlsOpen && (
                <div className="mt-2 space-y-2.5 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Trasmette un dispositivo alla volta. L&apos;<strong>Organizzatore ({props.ownerName || 'Owner'})</strong> può passare o riprendere la guida.
                  </p>
                  {props.isOwner && (
                    <div className="space-y-2">
                      {props.remoteGpsLease?.holderUid && props.remoteGpsLease.holderUid !== props.ownerUid && (
                        <button type="button" disabled={isHandoverLoading || !isOnline} onClick={() => props.onRevokeGps && runHandover(props.onRevokeGps, 'Guida GPS riportata all’Organizzatore.')} className="min-h-10 rounded-full border border-slate-300 px-3.5 text-xs font-bold dark:border-slate-700 cursor-pointer">Riprendi la guida</button>
                      )}
                      {copilots.map(copilot => {
                        const isCurrent = props.remoteGpsLease?.holderUid === copilot.uid;
                        return (
                          <div key={copilot.uid} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold">{copilot.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {isCurrent ? '🟢 Guida attiva' : copilot.deviceId ? 'Dispositivo registrato' : 'Copilota verificato'}
                              </p>
                            </div>
                            {!isCurrent && (
                              <button
                                type="button"
                                disabled={isHandoverLoading || !isOnline}
                                onClick={() => props.onTransferGps && runHandover(() => props.onTransferGps?.(copilot.uid, copilot.deviceId), `Ora ${copilot.name} condivide la posizione.`)}
                                aria-label={`Delega Guida GPS a ${copilot.name}`}
                                title="Delega Guida GPS"
                                className="min-h-9 shrink-0 rounded-full bg-[#172033] px-3 text-[11px] font-bold text-white disabled:opacity-35 dark:bg-white dark:text-[#172033] cursor-pointer"
                              >
                                Passa a {copilot.name}
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
                        ? '🟢 Hai la guida GPS attiva su questo telefono.'
                        : 'L’Organizzatore può delegarti la guida GPS.'}
                    </p>
                  )}
                  {handoverFeedback && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200" role="status">{handoverFeedback}</p>}
                </div>
              )}
            </div>
          )}

          {/* Banner riepilogativo desktop per vista ospiti (posizionato in E per non spingere in basso mappa e diario) */}
          {props.isExternal && (
            <div data-testid="desktop-live-banner" className="hidden lg:block rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#172033] p-4 shadow-xs relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] text-[11px] font-black uppercase tracking-widest mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                      Segui il viaggio in diretta
                    </div>
                    <h2 className="text-lg xl:text-xl font-black text-[#172033] dark:text-white tracking-tight">
                      {tripTitle}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      Tappe, posizione e ricordi del viaggio in tempo reale.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[74px]">
                      <p className="text-lg font-black text-[#172033] dark:text-white">{sortedUpdates.length}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ricordi</p>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[74px]">
                      <p className="text-lg font-black text-[#172033] dark:text-white">{displayPhotos.length}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Foto</p>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[74px]">
                      <p className="text-lg font-black text-[#172033] dark:text-white">{reactionTotal}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reazioni</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="rounded-2xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`w-2 h-2 rounded-full ${hasRealLocation && !isStaleGps ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                          Posizione Attuale
                        </p>
                      </div>
                      <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                        {hasRealLocation && !isStaleGps
                          ? (props.remoteGpsLocation?.city || 'In diretta')
                          : 'Non attiva'}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {hasRealLocation && !isStaleGps && positionAgeLabel ? positionAgeLabel : 'Posizione non in diretta'}
                    </p>
                  </div>

                  <div className="rounded-2xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                          Ultima Posizione Nota
                        </p>
                      </div>
                      <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                        {hasRealLocation
                          ? (props.remoteGpsLocation?.city || 'Posizione salvata')
                          : 'Nessun segnale'}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {hasRealLocation && lastDetectedDate
                        ? (positionAgeLabel || formatLastDetectedTimestamp(lastDetectedDate))
                        : 'Nessun rilevamento recente'}
                    </p>
                  </div>

                  <div className="rounded-2xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                          Itinerario Previsto
                        </p>
                      </div>
                      <p className="text-sm font-extrabold text-[#172033] dark:text-white truncate">
                        {plannedLocation?.title || 'Da itinerario'}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {plannedLocation?.coords ? 'Da programma' : 'Da itinerario'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5 text-xs">
              {props.isExternal && (
                <details>
                  <summary className="min-h-9 cursor-pointer py-1 font-bold text-slate-700 dark:text-slate-200">Privacy posizione</summary>
                  <p className="max-w-xl leading-5 text-slate-500">Vedi solo la posizione condivisa dai viaggiatori; quando termina, il marker scompare.</p>
                </details>
              )}
              <details>
                <summary className="min-h-9 cursor-pointer py-1 font-bold text-slate-700 dark:text-slate-200">Cosa vedono gli ospiti</summary>
                <p className="max-w-xl leading-5 text-slate-500">Posizione condivisa, ricordi pubblici, reazioni e auguri. Itinerario, documenti, spese e contatti restano privati.</p>
              </details>
            </div>
            <button type="button" onClick={props.onShare} className="min-h-10 shrink-0 rounded-full bg-[#172033] px-4 text-xs font-bold text-white dark:bg-white dark:text-[#172033] cursor-pointer">
              {props.copiedLink ? 'Link copiato ✓' : 'Condividi link ospiti'}
            </button>
          </div>
        </section>
      )}

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
          className="app-lightbox-overlay fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 backdrop-blur-md text-white select-none"
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
              className="block h-auto w-auto max-h-[calc(100dvh-19rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-8rem)] mx-auto my-auto object-contain rounded-xl shadow-2xl"
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

          <div className="relative z-10 shrink-0 mx-auto w-full max-w-xl px-4 pb-3" onClick={event => event.stopPropagation()}>
            <div className="text-center">
              <p className="text-sm font-bold">{displayPhotos[activeLightboxIndex].caption || 'Momento dal viaggio'}</p>
              {displayPhotos[activeLightboxIndex].location && (
                <p className="mt-0.5 text-xs text-white/65">{displayPhotos[activeLightboxIndex].location}</p>
              )}
            </div>

            {activeLightboxIsPublic && props.onAddPhotoComment && (
              <div data-testid="live-photo-comments-panel" className="mt-2.5 rounded-2xl bg-white/10 p-2.5 backdrop-blur-md">
                <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1 text-left">
                  {(props.offlineQueueItems || [])
                    .filter(q => q.kind === 'photo_comment' && q.photoId === displayPhotos[activeLightboxIndex].id)
                    .map(qItem => (
                      <div
                        key={qItem.id}
                        data-testid="live-offline-pending-photo-comment"
                        className="flex items-start justify-between gap-2 rounded-xl border border-amber-400/50 bg-amber-500/20 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="mr-1.5 inline-block rounded bg-amber-400/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                            🕒 In attesa di invio
                          </span>
                          {qItem.replyTo?.authorName && (
                            <span className="mr-1 text-[10px] text-white/75">↳ {qItem.replyTo.authorName}:</span>
                          )}
                          <span className="font-bold text-white">{qItem.authorName}: </span>
                          <span className="break-words text-white/90">{qItem.text}</span>
                        </div>
                        {props.onCancelOfflineItem && (
                          <button
                            type="button"
                            onClick={() => props.onCancelOfflineItem?.(qItem.id)}
                            className="shrink-0 text-[11px] font-bold text-amber-200 hover:text-white cursor-pointer"
                          >
                            Annulla
                          </button>
                        )}
                      </div>
                    ))}
                  {(props.photoComments?.[displayPhotos[activeLightboxIndex].id] || []).length === 0 &&
                  (props.offlineQueueItems || []).filter(q => q.kind === 'photo_comment' && q.photoId === displayPhotos[activeLightboxIndex].id).length === 0 ? (
                    <p className="text-[11px] text-white/60">Nessun commento ancora su questa foto.</p>
                  ) : (
                    groupLiveThreads(props.photoComments?.[displayPhotos[activeLightboxIndex].id] || [], false).map(thread => (
                      <div key={thread[0].item.id} className="rounded-xl bg-black/30 px-2.5 py-1.5 text-xs" data-testid="live-photo-comment-thread">
                      {thread.map(({ item: comment, depth }) => (
                      <div key={comment.id} className={`flex items-start justify-between gap-2 ${depth ? 'mt-1.5 border-l-2 border-[#FF6B5F]/40 pl-2' : ''} ${depth === 2 ? 'ml-2' : ''}`}>
                        <div className="min-w-0 flex-1">
                          {depth === 0 && comment.replyToId && <p className="text-[10px] text-white/60">Risposta a un commento non disponibile</p>}
                          <div>
                            <span className="font-bold text-white">{comment.authorName}: </span>
                            <span className="break-words text-white/90">{comment.text}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToPhotoComment({
                                id: comment.id,
                                authorName: comment.authorName,
                                preview: comment.text.slice(0, 100),
                              });
                              photoCommentInputRef.current?.focus();
                            }}
                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#FF8C82] hover:text-white cursor-pointer"
                          >
                            <Reply className="w-2.5 h-2.5" aria-hidden="true" />
                            <span>Rispondi</span>
                          </button>
                        </div>
                        {!props.isExternal && (props.isOwner || props.isCopilota || props.canPublish) && props.onDeletePhotoComment && (
                          <button
                            type="button"
                            onClick={() => props.onDeletePhotoComment?.(displayPhotos[activeLightboxIndex].id, comment.id)}
                            className="shrink-0 text-[11px] font-bold text-rose-300 hover:text-rose-200 cursor-pointer"
                            aria-label={`Elimina commento di ${comment.authorName}`}
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                      ))}
                      </div>
                    ))
                  )}
                </div>

                {replyingToPhotoComment && (
                  <div
                    data-testid="live-photo-reply-preview"
                    className="mt-2 flex items-start justify-between gap-2 rounded-xl border-l-2 border-[#FF6B5F] bg-black/40 px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#FF8C82]">Risposta a {replyingToPhotoComment.authorName}</p>
                      <p className="truncate text-white/75">{replyingToPhotoComment.preview}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingToPhotoComment(null)}
                      aria-label="Annulla risposta"
                      className="shrink-0 p-0.5 text-white/60 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <form onSubmit={handlePhotoCommentSubmit} className="mt-2 flex flex-wrap gap-1.5">
                  <input
                    type="text"
                    maxLength={40}
                    required
                    value={guestAuthorInput}
                    onChange={e => setGuestAuthorInput(e.target.value)}
                    placeholder="Tuo nome"
                    aria-label="Il tuo nome"
                    className="min-h-9 w-28 shrink-0 rounded-xl bg-white/15 px-2.5 text-xs text-white placeholder:text-white/55 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <input
                    ref={photoCommentInputRef}
                    type="text"
                    maxLength={280}
                    required
                    value={photoCommentInput}
                    onChange={e => setPhotoCommentInput(e.target.value)}
                    placeholder={replyingToPhotoComment ? `Rispondi a ${replyingToPhotoComment.authorName}…` : 'Scrivi un commento…'}
                    aria-label="Scrivi un commento"
                    className="min-h-9 min-w-0 flex-1 rounded-xl bg-white/15 px-2.5 text-xs text-white placeholder:text-white/55 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <button
                    type="submit"
                    disabled={isSendingPhotoComment || (!isOnline && !props.canWriteOffline)}
                    className="min-h-9 shrink-0 rounded-xl bg-[#FF6B5F] px-3 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
                  >
                    {isSendingPhotoComment ? '…' : 'Invia'}
                  </button>
                </form>
                {photoCommentError && <p className="mt-1 text-[11px] font-semibold text-rose-300" role="alert">{photoCommentError}</p>}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
