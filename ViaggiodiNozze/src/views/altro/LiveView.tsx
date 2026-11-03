import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { storageService } from '../../storage/storageService';
import type { TimelineItem, Alloggio, Giorno, Trasporto, Tappa, DeviceRole, Attivita } from '../../types';
import { deriveLiveIntelligence, type LiveIntelligenceState } from '../../utils/liveIntelligenceHelper';
import { resolveMapUrl, openMapLink } from '../../utils/mapsHelper';
import { generateTripDays, getTripDateRange, formatDateTimeIT, formatDateIT } from '../../utils/tripDates';
import { lookupKnownCoordinate } from '../../services/routingService';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import { persistDeviceSession } from '../../utils/deviceSession';
import {
  updateRealLocation,
  getSavedLiveLocation,
  getCountryFlag,
  getTimezoneFromCoordinates,
  type GeolocationState
} from '../../services/geolocationService';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
}

const getWeatherDescription = (code: number): { description: string; icon: string } => {
  if (code === 0) return { description: 'Sereno / Soleggiato', icon: '☀️' };
  if (code === 1 || code === 2) return { description: 'Poco nuvoloso', icon: '🌤️' };
  if (code === 3) return { description: 'Nuvoloso', icon: '☁️' };
  if (code >= 45 && code <= 48) return { description: 'Nebbia', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { description: 'Pioggia leggera', icon: '🌦️' };
  if (code >= 71 && code <= 77) return { description: 'Neve', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { description: 'Rovesci di pioggia', icon: '🌧️' };
  if (code >= 95) return { description: 'Temporale', icon: '⛈️' };
  return { description: 'Variabile', icon: '⛅' };
};

interface LiveViewProps {
  onBack?: () => void;
  isStandaloneExternal?: boolean;
  tripId?: string;
}

interface DestinationTimezone {
  name: string;
  country: string;
  flag: string;
  timeZone: string;
}

const DESTINATION_ZONES: DestinationTimezone[] = [
  { name: 'Auckland', country: 'Nuova Zelanda', flag: '🇳🇿', timeZone: 'Pacific/Auckland' },
  { name: 'Sydney', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Sydney' },
  { name: 'Adelaide', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Adelaide' },
  { name: 'Melbourne', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Melbourne' },
  { name: 'Manila', country: 'Filippine', flag: '🇵🇭', timeZone: 'Asia/Manila' },
  { name: 'Pechino', country: 'Cina (Scalo)', flag: '🇨🇳', timeZone: 'Asia/Shanghai' },
];

const DEFAULT_STATUS_MESSAGE = "Siamo arrivati! Tutto bene ❤️ Ci stiamo godendo ogni momento di questa avventura incredibile!";
const STATUS_MESSAGE_KEY = "live_travel_status_message";
const STATUS_DATE_KEY = "live_travel_status_updated_at";
const SPOSI_ADMIN_KEY = "is_sposi_admin";
const SPOSI_PIN = "2026";
const LAST_PHOTO_KEY = "live_last_photo";

interface CustomLivePhoto {
  dataUrl: string;
  caption: string;
  timestamp: string;
}

import { liveService, type LiveUpdate } from '../../services/liveService';
import { getTripConfig } from '../../utils/tripConfig';
import { auth } from '../../firebase';
import LiveEditorialExperience, { type LiveGalleryPhotoItem } from './LiveEditorialExperience';
import { describeLiveGpsStartError, liveGpsService, type LiveGpsDevice, type LiveGpsLease, type LiveGpsLocation, type TripMemberInfo } from '../../services/liveGpsService';
import { registerDeviceOnFirestore } from '../../utils/deviceSession';

export default function LiveView({ onBack, isStandaloneExternal = false, tripId }: LiveViewProps) {
  const activeTripId = tripId || getTripConfig()?.id || null;

  const [now, setNow] = useState<Date>(new Date());
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [days, setDays] = useState<Giorno[]>([]);
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [tappe, setTappe] = useState<Tappa[]>([]);
  const [activities, setActivities] = useState<Attivita[]>([]);
  const [mapCenterMode, setMapCenterMode] = useState<'both' | 'real' | 'planned'>('both');
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live Feed Data from Firestore
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdate[]>([]);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        return JSON.parse(localStorage.getItem('hounigo_local_reactions') || '{}');
      } catch {
        return {};
      }
    }
    return {};
  });

  const handleReaction = async (updateId: string, emoji: string) => {
    if (!activeTripId) return;
    const newReactions = { ...localReactions, [updateId]: emoji };
    setLocalReactions(newReactions);
    localStorage.setItem('hounigo_local_reactions', JSON.stringify(newReactions));
    try {
      await liveService.addReaction(activeTripId, updateId, emoji as any);
    } catch (err) {
      console.warn('Salvataggio offline pending', err);
    }
  };

  // Sottoscrizioni a Firestore per il Live
  useEffect(() => {
    if (!activeTripId) return;
    const unsubHeader = liveService.subscribeToLiveHeader(activeTripId, (header) => {
      if (header?.statusMessage) {
        setStatusMessage(header.statusMessage);
      }
      if (header?.statusUpdatedAt) {
        let d: Date | null = null;
        if (typeof header.statusUpdatedAt === 'number') d = new Date(header.statusUpdatedAt);
        else if (typeof header.statusUpdatedAt === 'object' && 'seconds' in (header.statusUpdatedAt as any)) {
          d = new Date((header.statusUpdatedAt as any).seconds * 1000);
        } else if (typeof (header.statusUpdatedAt as any)?.toDate === 'function') {
          d = (header.statusUpdatedAt as any).toDate();
        } else {
          d = new Date(header.statusUpdatedAt);
        }
        if (d && !isNaN(d.getTime())) {
          const timeStr = new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
          }).format(d);
          setStatusUpdatedAt(`Aggiornato alle ${timeStr}`);
        }
      }
    });
    const unsubUpdates = liveService.subscribeToLiveUpdates(activeTripId, (updates) => {
      setLiveUpdates(updates);
    });
    return () => {
      unsubHeader();
      unsubUpdates();
    };
  }, [activeTripId]);

  // Messaggio di stato locale/fallback
  const [statusMessage, setStatusMessage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_MESSAGE_KEY) || DEFAULT_STATUS_MESSAGE;
    }
    return DEFAULT_STATUS_MESSAGE;
  });
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_DATE_KEY) || 'Pochi minuti fa';
    }
    return 'Pochi minuti fa';
  });

  // Posizione GPS Reale rilevata da dispositivo (persistita in localStorage)
  const [liveGpsState, setLiveGpsState] = useState<GeolocationState | null>(() => getSavedLiveLocation());
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsFeedback, setGpsFeedback] = useState<string | null>(null);
  const [remoteGpsLease, setRemoteGpsLease] = useState<LiveGpsLease | null>(null);
  const [remoteGpsLocation, setRemoteGpsLocation] = useState<LiveGpsLocation | null>(null);
  const [gpsDevices, setGpsDevices] = useState<LiveGpsDevice[]>([]);
  const [tripMembers, setTripMembers] = useState<TripMemberInfo[]>([]);
  const gpsWatchRef = useRef<number | null>(null);
  const lastGpsPublishRef = useRef(0);
  const remoteLocationRef = useRef<LiveGpsLocation | null>(null);
  // Toggle chiara visualizzazione: 'reale' (Dove siamo ora) vs 'programmato' (Dove dovremmo essere)
  const [mapLocationMode, setMapLocationMode] = useState<'reale' | 'programmato'>('reale');

  // Widget Meteo Open-Meteo
  const [weatherCurrent, setWeatherCurrent] = useState<WeatherData | null>(null);
  const [weatherNext, setWeatherNext] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Stato interattivo della mappa (pan, drag, zoom)
  const [mapZoom, setMapZoom] = useState(12);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [tileLoadFailed, setTileLoadFailed] = useState(false);
  const [showMyCurrentGps, setShowMyCurrentGps] = useState(true);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const { cloudRole, currentUid } = useAuthIdentity();

  useEffect(() => {
    remoteLocationRef.current = remoteGpsLocation;
  }, [remoteGpsLocation]);

  useEffect(() => {
    if (!activeTripId) return;
    const unsubscribeLocation = liveGpsService.subscribePublicLocation(activeTripId, setRemoteGpsLocation);
    const staleTimer = window.setInterval(() => {
      setRemoteGpsLocation(current => current && Date.now() - current.updatedAt.getTime() < 120_000 ? current : null);
    }, 5000);
    return () => {
      unsubscribeLocation();
      window.clearInterval(staleTimer);
    };
  }, [activeTripId]);

  useEffect(() => {
    if (!activeTripId || (cloudRole !== 'owner' && cloudRole !== 'copilota')) {
      setRemoteGpsLease(null);
      setGpsDevices([]);
      return;
    }
    registerDeviceOnFirestore(activeTripId, deviceRole).catch(() => {});
    const unsubscribeLease = liveGpsService.subscribeLease(activeTripId, setRemoteGpsLease, (err) => setGpsError(err.message));
    const unsubscribeDevices = cloudRole === 'owner'
      ? liveGpsService.subscribeDevices(activeTripId, setGpsDevices)
      : () => {};
    const unsubscribeMembers = liveGpsService.subscribeMembers(activeTripId, setTripMembers);
    return () => {
      unsubscribeLease();
      unsubscribeDevices();
      unsubscribeMembers();
    };
  }, [activeTripId, cloudRole, deviceRole]);

  const activeTripCfg = getTripConfig();
  const membersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (activeTripCfg?.ownerUid) {
      map[activeTripCfg.ownerUid] = activeTripCfg.ownerName || 'Owner';
    }
    tripMembers.forEach(m => {
      if (m.name) map[m.uid] = m.name;
    });
    return map;
  }, [activeTripCfg?.ownerUid, activeTripCfg?.ownerName, tripMembers]);

  useEffect(() => {
    const ownsActiveLease = remoteGpsLease?.status === 'active'
      && remoteGpsLease.holderUid === currentUid
      && remoteGpsLease.holderDeviceId === liveGpsService.getDeviceId()
      && remoteGpsLease.expiresAt.getTime() > Date.now();
    if (!ownsActiveLease && gpsWatchRef.current !== null) {
      navigator.geolocation?.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  }, [remoteGpsLease, currentUid]);

  useEffect(() => () => {
    if (gpsWatchRef.current !== null) navigator.geolocation?.clearWatch(gpsWatchRef.current);
  }, []);

  // Rileva posizione GPS reale su richiesta o automaticamente all'apertura
  const handleDetectGps = useCallback(async (isSilent = false) => {
    // Il GPS autorevole deve seguire l'owner del viaggio verificato dal cloud
    if (cloudRole !== 'owner') {
      if (!isSilent) {
        setGpsError('Solo l’organizzatore del viaggio verificato dal cloud può trasmettere la posizione GPS autorevole.');
        setTimeout(() => setGpsError(null), 4000);
      }
      return;
    }
    try {
      if (!isSilent) setIsDetectingGps(true);
      setGpsError(null);
      const res = await updateRealLocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });
      setLiveGpsState(res);
    } catch (err: unknown) {
      console.warn('[LiveView] Errore acquisizione GPS:', err);
      if (!isSilent) {
        const errMsg = (err as Error)?.message || 'Impossibile acquisire la posizione GPS';
        setGpsError(errMsg);
        setTimeout(() => setGpsError(null), 4000);
      }
    } finally {
      if (!isSilent) setIsDetectingGps(false);
    }
  }, []);

  const publishBrowserPosition = useCallback(async (position: GeolocationPosition) => {
    if (!activeTripId || Date.now() - lastGpsPublishRef.current < 16_000) return;
    lastGpsPublishRef.current = Date.now();
    try {
      await liveGpsService.publishLocation(activeTripId, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        city: remoteLocationRef.current?.city || '',
        country: remoteLocationRef.current?.country || ''
      });
    } catch (err: any) {
      console.warn('[LiveView] Errore pubblicazione periodica GPS:', err);
    }
  }, [activeTripId]);

  const startGpsWatcher = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS non disponibile su questo browser.');
      return;
    }
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      position => publishBrowserPosition(position),
      error => setGpsError(describeLiveGpsStartError(error)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );
  }, [publishBrowserPosition]);

  const handleStartGps = useCallback(async () => {
    if (!activeTripId || !currentUid || (cloudRole !== 'owner' && cloudRole !== 'copilota')) return;
    setIsDetectingGps(true);
    setGpsError(null);
    setGpsFeedback(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Connessione assente.');
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        throw new Error('GPS non disponibile.');
      }
      const deviceId = liveGpsService.getDeviceId();
      const leaseIsCurrent = remoteGpsLease?.status === 'active' && remoteGpsLease.expiresAt.getTime() > Date.now();
      const ownsLease = Boolean(leaseIsCurrent && remoteGpsLease?.holderUid === currentUid && remoteGpsLease.holderDeviceId === deviceId);
      if (leaseIsCurrent && !ownsLease) {
        throw new Error('Un altro dispositivo sta condividendo la posizione.');
      }

      const detected = await updateRealLocation({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 });
      setLiveGpsState(detected);

      if (!ownsLease) {
        if (cloudRole !== 'owner') throw new Error('L’Organizzatore deve prima assegnare la guida a questo dispositivo.');
        await liveGpsService.assignGuide(activeTripId, currentUid, deviceId);
        persistDeviceSession(activeTripId, 'guida').catch(() => {});
      } else if (remoteGpsLease?.status !== 'active') {
        if (cloudRole !== 'owner') throw new Error('Solo l’Organizzatore può riprendere una condivisione sospesa.');
        await liveGpsService.resume(activeTripId, currentUid, deviceId);
      }
      lastGpsPublishRef.current = 0;
      await liveGpsService.publishLocation(activeTripId, {
        lat: detected.coords.lat,
        lng: detected.coords.lng,
        accuracy: detected.accuracy,
        city: detected.city,
        country: detected.country
      }, { force: true });
      lastGpsPublishRef.current = Date.now();
      startGpsWatcher();
      try {
        localStorage.setItem(`hounigo_live_sharing_enabled_${activeTripId}`, 'true');
      } catch {}
      setGpsFeedback('Posizione condivisa e confermata dal server.');
    } catch (error) {
      const candidate = error as { message?: string; name?: string };
      console.warn('[LiveView] Errore avvio GPS:', error);
      const isQuota = candidate.name === 'QuotaExceededError' ||
                      String(candidate.message || '').toLowerCase().includes('quota');
      if (isQuota) {
        setGpsFeedback('Posizione rilevata con successo (spazio cache locale saturo).');
      } else {
        setGpsError(describeLiveGpsStartError(error));
      }
    } finally {
      setIsDetectingGps(false);
    }
  }, [activeTripId, cloudRole, currentUid, remoteGpsLease, startGpsWatcher]);

  const handlePauseOrStopGps = useCallback(async (status: 'paused' | 'stopped') => {
    if (!activeTripId) return;
    setIsDetectingGps(true);
    setGpsError(null);
    try {
      await liveGpsService.pauseOrStop(activeTripId, status);
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
      if (status === 'stopped') {
        try {
          localStorage.removeItem(`hounigo_live_sharing_enabled_${activeTripId}`);
        } catch {}
      }
      setRemoteGpsLocation(null);
      setLiveGpsState(null);
      setGpsFeedback(status === 'paused' ? 'Condivisione sospesa.' : 'Condivisione interrotta.');
    } catch (error) {
      setGpsError((error as Error)?.message || 'Impossibile aggiornare la condivisione.');
    } finally {
      setIsDetectingGps(false);
    }
  }, [activeTripId]);

  const handleTransferGps = useCallback(async (uid: string, deviceId: string) => {
    if (!activeTripId || cloudRole !== 'owner') return;
    setIsDetectingGps(true);
    setGpsError(null);
    try {
      await liveGpsService.assignGuide(activeTripId, uid, deviceId);
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
      setRemoteGpsLocation(null);
      setGpsFeedback('Guida trasferita. Il nuovo dispositivo deve consentire il GPS.');
    } catch (error) {
      setGpsError((error as Error)?.message || 'Trasferimento guida non riuscito.');
    } finally {
      setIsDetectingGps(false);
    }
  }, [activeTripId, cloudRole]);

  // Ruolo del dispositivo: 'guida' | 'copilota' | 'viewer' (default 'viewer')
  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: DeviceRole }>;
      if (customEvent.detail?.role) {
        setDeviceRole(customEvent.detail.role);
      }
    };
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  // La condivisione della posizione NON si attiva mai automaticamente.
  // L'aggiornamento GPS avviene solo su esplicita richiesta dell'utente tramite pulsante dedicato.

  // Modalità Sposi (Admin / Master)
  // Abilitata SOLO se l'utente ha autorizzazione Cloud effettiva (owner o copilota)
  const [isSposiAdminManual, setIsSposiAdminManual] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SPOSI_ADMIN_KEY) === 'true';
    }
    return false;
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // In modalità viewer o in assenza di autorizzazione cloud i comandi sposi rimangono nascosti a prescindere
  const isSposiAdmin = useMemo(() => {
    const isCloudAuthorized = cloudRole === 'owner' || cloudRole === 'copilota';
    if (!isCloudAuthorized) return false;
    if (deviceRole === 'viewer') return false;
    if (deviceRole === 'guida' || deviceRole === 'copilota') return true;
    return isSposiAdminManual;
  }, [deviceRole, cloudRole, isSposiAdminManual]);

  // LIVE Text Messages: invio messaggi testuali da parte dei membri
  const [liveTextMessage, setLiveTextMessage] = useState('');
  const [liveSenderTitle] = useState(() => {
    if (deviceRole === 'guida') return 'Sposi (Guida)';
    if (deviceRole === 'copilota') return 'Sposi (Co-pilota)';
    return 'Amico di Viaggio';
  });
  const [isSendingLiveMsg, setIsSendingLiveMsg] = useState(false);
  const [liveMsgError, setLiveMsgError] = useState<string | null>(null);
  const [liveMsgSuccess, setLiveMsgSuccess] = useState<string | null>(null);
  const [lastLiveMsgSentAt, setLastLiveMsgSentAt] = useState<number>(0);

  const handleSendLiveTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLiveMsgError(null);
    setLiveMsgSuccess(null);

    const cleanMsg = liveTextMessage.trim();
    if (!cleanMsg) {
      setLiveMsgError('Il messaggio non può essere vuoto.');
      return;
    }

    if (cloudRole !== 'owner' && cloudRole !== 'copilota') {
      setLiveMsgError('Solo i membri verificati dal cloud possono pubblicare messaggi nel Live.');
      return;
    }
    if (cleanMsg.length > 500) {
      setLiveMsgError('Il messaggio non può superare i 500 caratteri.');
      return;
    }

    // Anti-spam rate limiting: almeno 5 secondi tra un invio e l'altro
    const now = Date.now();
    if (now - lastLiveMsgSentAt < 5000) {
      const waitSec = Math.ceil((5000 - (now - lastLiveMsgSentAt)) / 1000);
      setLiveMsgError(`Attendi ${waitSec}s prima di inviare un altro messaggio.`);
      return;
    }

    if (!navigator.onLine) {
      setLiveMsgError('Dispositivo offline: impossibile pubblicare sul feed Live.');
      return;
    }

    if (!activeTripId) {
      setLiveMsgError('Viaggio non configurato.');
      return;
    }

    setIsSendingLiveMsg(true);
    try {
      // Determina il titolo del mittente in base all'utente autenticato o al ruolo verificato
      const user = auth.currentUser;
      const derivedTitle = (user?.displayName && user.displayName.trim()) || liveSenderTitle || (deviceRole === 'guida' ? 'Sposi' : 'Co-pilota');

      await liveService.publishToLive(activeTripId, {
        title: derivedTitle.slice(0, 60),
        text: cleanMsg.slice(0, 500),
        locationName: currentLocation?.city || currentLocation?.title || undefined
      });

      setLiveTextMessage('');
      setLastLiveMsgSentAt(Date.now());
      setLiveMsgSuccess('Messaggio pubblicato nel feed Live!');
      setTimeout(() => setLiveMsgSuccess(null), 3500);
    } catch (err: any) {
      console.error('Errore invio messaggio Live:', err);
      setLiveMsgError(err?.message || 'Errore durante la pubblicazione del messaggio.');
    } finally {
      setIsSendingLiveMsg(false);
    }
  };

  // Foto personalizzata per "Ultimo aggiornamento" e Galleria Fotografica Live
  const [customPhoto, setCustomPhoto] = useState<CustomLivePhoto | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LAST_PHOTO_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Galleria fotografica multi-scatto persistita localmente
  const [galleryCustomPhotos, setGalleryCustomPhotos] = useState<LiveGalleryPhotoItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('hounigo_live_gallery');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const legacy = localStorage.getItem(LAST_PHOTO_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed.dataUrl) {
          return [{
            id: 'legacy_custom_photo_1',
            url: parsed.dataUrl,
            caption: parsed.caption || 'Foto scattata dagli sposi ❤️',
            timestamp: new Date(parsed.timestamp || Date.now()).getTime(),
            isCustom: true
          }];
        }
      }
    } catch {}
    return [];
  });

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoCaptionInput, setPhotoCaptionInput] = useState('');
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeViewerIndex, setActiveViewerIndex] = useState<number | null>(null);

  // Unione e sincronizzazione di tutte le foto live (aggiornamenti pubblici + foto caricate)
  const allLiveGalleryPhotos = useMemo<LiveGalleryPhotoItem[]>(() => {
    const map = new Map<string, LiveGalleryPhotoItem>();

    // 1. Dagli aggiornamenti di viaggio sincronizzati
    (liveUpdates || []).forEach(update => {
      if (update.photoUrl && typeof update.photoUrl === 'string' && update.photoUrl.trim()) {
        map.set(update.photoUrl, {
          id: update.id,
          url: update.photoUrl,
          caption: update.title || update.text || 'Scatto dal diario',
          location: update.locationName,
          timestamp: update.timestamp || Date.now(),
          isCustom: false
        });
      }
    });

    // 2. Dalla galleria personalizzata del dispositivo
    galleryCustomPhotos.forEach(p => {
      if (!map.has(p.url)) {
        map.set(p.url, p);
      }
    });

    // 3. Fallback foto singola custom legacy se non ancora inclusa
    if (customPhoto && customPhoto.dataUrl && !map.has(customPhoto.dataUrl)) {
      map.set(customPhoto.dataUrl, {
        id: 'sposi_custom_photo',
        url: customPhoto.dataUrl,
        caption: customPhoto.caption || 'Foto scattata dagli sposi ❤️',
        timestamp: new Date(customPhoto.timestamp || Date.now()).getTime(),
        isCustom: true
      });
    }

    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [liveUpdates, galleryCustomPhotos, customPhoto]);

  // Backward compatibility per vecchio portal viewer
  const publishedLivePhotos = useMemo(() => {
    return allLiveGalleryPhotos.map(p => ({
      id: p.id,
      url: p.url,
      caption: p.caption || '',
      location: p.location,
      timestamp: p.timestamp
    }));
  }, [allLiveGalleryPhotos]);

  // Gestione tastiera per sfogliare la galleria a schermo intero (Frecce Sx/Dx ed Escape)
  useEffect(() => {
    if (activeViewerIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveViewerIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setActiveViewerIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setActiveViewerIndex(prev => (prev !== null && prev < publishedLivePhotos.length - 1 ? prev + 1 : prev));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeViewerIndex, publishedLivePhotos.length]);
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context non disponibile'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          resolve(compressed);
        };
        img.onerror = () => reject(new Error('Errore nel caricamento immagine'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Errore lettura file'));
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingPhoto(true);
      const dataUrl = await compressImage(file);
      setPendingPhotoUrl(dataUrl);
      setPhotoCaptionInput('');
      setShowCaptionModal(true);
    } catch (err) {
      console.error('Errore compressione foto:', err);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveCustomPhoto = () => {
    if (!pendingPhotoUrl) return;
    const photoObj: CustomLivePhoto = {
      dataUrl: pendingPhotoUrl,
      caption: photoCaptionInput.trim() || 'Foto scattata dagli sposi ❤️',
      timestamp: new Date().toISOString()
    };
    setCustomPhoto(photoObj);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_PHOTO_KEY, JSON.stringify(photoObj));
    }
    setShowCaptionModal(false);
    setPendingPhotoUrl(null);
  };

  const handleResetPhoto = () => {
    setCustomPhoto(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LAST_PHOTO_KEY);
    }
  };

  // Caricamento e compressione foto per la Galleria Live
  const handleUploadPhoto = async (file: File, caption?: string) => {
    if (!file) return;
    const compressedDataUrl = await compressImage(file);
    const newPhoto: LiveGalleryPhotoItem = {
      id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: compressedDataUrl,
      caption: caption || 'Foto dal viaggio ❤️',
      location: currentLocation?.city || 'In viaggio',
      timestamp: Date.now(),
      isCustom: true
    };

    setGalleryCustomPhotos(prev => {
      const updated = [newPhoto, ...prev];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('hounigo_live_gallery', JSON.stringify(updated.slice(0, 30)));
          localStorage.setItem(LAST_PHOTO_KEY, JSON.stringify({
            dataUrl: compressedDataUrl,
            caption: newPhoto.caption,
            timestamp: new Date().toISOString()
          }));
        } catch (e) {
          console.warn('Spazio di memorizzazione galleria limitato:', e);
        }
      }
      return updated;
    });

    // Se l'organizzatore è autorizzato, creiamo anche un aggiornamento di viaggio sincronizzato
    if (activeTripId && (cloudRole === 'owner' || cloudRole === 'copilota')) {
      try {
        await liveService.publishToLive(activeTripId, {
          title: caption || 'Nuovo scatto dal vivo 📸',
          text: '',
          locationName: currentLocation?.city || undefined
        });
      } catch (err) {
        console.warn('Errore sync aggiornamento con foto:', err);
      }
    }
  };

  // Eliminazione foto dalla galleria (FASE 1)
  const handleDeletePhoto = (photoId: string) => {
    setGalleryCustomPhotos(prev => {
      const updated = prev.filter(p => p.id !== photoId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('hounigo_live_gallery', JSON.stringify(updated));
        if (updated.length === 0) {
          localStorage.removeItem(LAST_PHOTO_KEY);
        }
      }
      return updated;
    });

    // Se la foto corrisponde a un update remoto, eliminiamo anche l'aggiornamento
    const matchingUpdate = liveUpdates.find(u => u.id === photoId || u.photoUrl === photoId);
    if (matchingUpdate && activeTripId) {
      liveService.deleteLiveUpdate(activeTripId, matchingUpdate.id).catch(err => {
        console.warn('Errore eliminazione update correlato a foto:', err);
      });
      setLiveUpdates(prev => prev.filter(u => u.id !== matchingUpdate.id));
    }
  };

  // Eliminazione cartolina/messaggio dal diario (FASE 2)
  const handleDeleteLiveUpdate = async (updateId: string) => {
    if (!activeTripId || !updateId) return;
    try {
      await liveService.deleteLiveUpdate(activeTripId, updateId);
      setLiveUpdates(prev => prev.filter(u => u.id !== updateId));
      // Preserva la fotografia nella galleria locale (hounigo_live_gallery)
      // in modo che l'eliminazione della cartolina dal feed non distrugga l'unica copia dell'utente
    } catch (err: any) {
      console.error('Errore durante cancellazione messaggio live:', err);
      alert(err?.message || 'Errore durante la cancellazione del messaggio.');
    }
  };

  // Verifica PIN Sposi
  const handleVerifyPin = () => {
    if (pinInput.trim() === SPOSI_PIN) {
      setIsSposiAdminManual(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(SPOSI_ADMIN_KEY, 'true');
      }
      setShowPinModal(false);
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleLogoutSposi = () => {
    setIsSposiAdminManual(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SPOSI_ADMIN_KEY);
    }
  };

  // Modalità modifica messaggio (riservata e discreta per gli sposi)
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [tempStatus, setTempStatus] = useState(statusMessage);

  // Stato feedback copia/condivisione link
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShareLiveLink = async () => {
    if (typeof window === 'undefined') return;

    // Genera l'URL diretto con il parametro live=1, tripId e hash #live
    const url = new URL(window.location.href);
    url.searchParams.set('live', '1');
    if (activeTripId) {
      url.searchParams.set('tripId', activeTripId);
    }
    url.hash = 'live';
    const liveShareUrl = url.toString();

    const shareData = {
      title: 'Hounigo • Live',
      text: 'Segui il nostro viaggio in tempo reale! 🌍',
      url: liveShareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // Se l'utente annulla la condivisione, non fare nulla
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Fallback: Copia link negli appunti
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // In caso di problemi di permessi clipboard
      const input = document.createElement('input');
      input.value = liveShareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Orologio sincronizzato al secondo
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calcola data odierna YYYY-MM-DD
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  // Intervallo date reale calcolato dal DB
  const [tripRange, setTripRange] = useState<{ minTripDate: string; maxTripDate: string } | null>(null);

  // Caricamento dati da IndexedDB
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dList, accList, trList, tpList, actList, range] = await Promise.all([
        storageService.getDays(),
        storageService.getAccommodations(),
        storageService.getTransports(),
        storageService.getTappe(),
        storageService.getActivities(),
        getTripDateRange()
      ]);

      setDays(dList || []);
      setAccommodations(accList || []);
      setTransports(trList || []);
      setTappe(tpList || []);
      setActivities(actList || []);
      setTripRange(range);

      // Se la data odierna rientra nel viaggio usa todayStr, altrimenti usa la prima data programmata
      const tripDaysList = range?.tripDays || [];
      const isInTrip = Array.isArray(tripDaysList) && tripDaysList.some(item => item?.dateStr === todayStr);
      const targetDate = isInTrip ? todayStr : (range?.minTripDate || todayStr);

      if (targetDate) {
        const items = await storageService.getTimelineForDate(targetDate);
        setTimelineItems(items || []);
      }
    } catch (err) {
      console.error('Errore nel caricamento dei dati Live:', err);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    if (!isStandaloneExternal) {
      loadData();
    } else {
      setLoading(false); // Esterni non caricano IndexedDB
    }
  }, [loadData, isStandaloneExternal]);

  // Ascolta l'evento unificato di mutazione dati per ricaricare istantaneamente LiveView
  useEffect(() => {
    if (isStandaloneExternal) return;
    const handleDataMutated = () => {
      loadData();
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // Verifica se il viaggio è già iniziato rispetto a oggi
  const tripCountdown = useMemo(() => {
    const minDate = tripRange?.minTripDate || days[0]?.date || '2026-11-29';
    const tripDaysList = generateTripDays(minDate);
    const firstDateStr = minDate;
    const startDate = new Date(`${firstDateStr}T00:00:00`);
    const today = new Date(`${todayStr}T00:00:00`);
    const diffMs = startDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isPreTrip = diffDays > 0;
    const isInTrip = Array.isArray(tripDaysList) && tripDaysList.some(item => item && item.dateStr === todayStr);

    return {
      isPreTrip,
      isInTrip,
      diffDays,
      firstDateStr
    };
  }, [todayStr, days, tripRange]);

  // Data attiva del viaggio
  const activeDate = useMemo(() => {
    return tripCountdown.isInTrip ? todayStr : tripCountdown.firstDateStr;
  }, [tripCountdown, todayStr]);

  // Alloggio, tappa e trasporto del giorno corrente
  const currentAccommodation = useMemo(() => {
    return accommodations.find((acc) => {
      if (acc.checkIn <= activeDate && acc.checkOut > activeDate) return true;
      if (acc.checkIn === activeDate) return true;
      return false;
    });
  }, [accommodations, activeDate]);

  const currentDay = useMemo(() => {
    return days.find(d => d.date === activeDate);
  }, [days, activeDate]);

  const currentTransport = useMemo(() => {
    return transports.find(t => t.date === activeDate);
  }, [transports, activeDate]);

  // Calcolo volo in partenza (oggi o domani entro le 8)
  const liveFlight = useMemo(() => {
    const today = new Date(todayStr);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    return transports.find(t => {
      if (t.type !== 'volo') return false;
      
      if (t.date === todayStr) return true;
      if (t.date === tomorrowStr && t.departureTime) {
         const time = t.departureTime.split(':');
         if (parseInt(time[0], 10) < 8) return true;
         if (parseInt(time[0], 10) === 8 && parseInt(time[1], 10) === 0) return true;
      }
      return false;
    });
  }, [transports, todayStr]);


  const currentTappa = useMemo(() => {
    return tappe.find(tp => tp.data === activeDate);
  }, [tappe, activeDate]);

  // Posizione GPS Reale
  const realLocation = useMemo(() => {
    if (liveGpsState && liveGpsState.isLiveGps && liveGpsState.coords) {
      const timeAgo = (() => {
        try {
          const diffMs = Date.now() - new Date(liveGpsState.updatedAt).getTime();
          const diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 1) return 'Pochi istanti fa (GPS)';
          if (diffMin < 60) return `${diffMin} min fa (GPS)`;
          const diffHours = Math.floor(diffMin / 60);
          return `${diffHours} ore fa (GPS)`;
        } catch {
          return 'Posizione GPS';
        }
      })();

      return {
        title: liveGpsState.displayName || `${liveGpsState.city || ''}, ${liveGpsState.country || ''}`.trim() || 'Posizione Reale',
        city: liveGpsState.city || 'Posizione Corrente',
        country: liveGpsState.country || 'Reale',
        countryCode: liveGpsState.countryCode || '',
        flag: getCountryFlag(liveGpsState.countryCode),
        coords: liveGpsState.coords,
        isRealGps: true,
        timestamp: liveGpsState.updatedAt,
        updateNotice: `Rilevamento GPS • ${timeAgo}`,
        badgeLabel: `📍 ${liveGpsState.city || 'Posizione Reale'}`
      };
    }
    return null;
  }, [liveGpsState]);

  // Contesto programmato di fallback, senza coordinate o paesi inventati.
  const plannedLocation = useMemo(() => {
    if (tripCountdown.isPreTrip) {
      return {
        title: 'In attesa della partenza',
        city: 'In attesa della partenza',
        country: '',
        countryCode: '',
        flag: '',
        coords: undefined,
        isRealGps: false,
        updateNotice: 'Viaggio non ancora iniziato',
        badgeLabel: 'In attesa della partenza'
      };
    }

    if (currentTappa) {
      const coords = currentTappa.coordinate || lookupKnownCoordinate(currentTappa.titolo) || undefined;
      return {
        title: currentTappa.titolo,
        city: currentTappa.titolo,
        country: '',
        countryCode: '',
        flag: '',
        coords,
        isRealGps: false,
        updateNotice: 'Tappa prevista dal programma',
        badgeLabel: `Programma · ${currentTappa.titolo}`
      };
    }
    if (currentTransport) {
      return {
        title: `${currentTransport.departureLocation} → ${currentTransport.arrivalLocation}`,
        city: 'In viaggio',
        country: '',
        countryCode: '',
        flag: '',
        coords: undefined,
        isRealGps: false,
        updateNotice: 'Trasferimento programmato',
        badgeLabel: 'Trasferimento previsto'
      };
    }
    const defaultTitle = currentDay?.title || 'Nessuna attività prevista';
    const defaultCity = currentDay?.location || '';
    return {
      title: defaultTitle,
      city: defaultCity,
      country: '',
      countryCode: '',
      flag: '',
      coords: defaultCity ? lookupKnownCoordinate(defaultCity) || undefined : undefined,
      isRealGps: false,
      updateNotice: 'Programma non disponibile per questo momento',
      badgeLabel: defaultCity ? `Programma · ${defaultCity}` : 'Programma non disponibile'
    };
  }, [tripCountdown.isPreTrip, currentTappa, currentTransport, currentDay]);



  // Località attiva sulla mappa in base al toggle dell'utente (reale vs programmato) per qualsiasi ruolo
  const currentLocation = useMemo(() => {
    if (mapLocationMode === 'reale' && realLocation) {
      return realLocation;
    }
    return plannedLocation;
  }, [mapLocationMode, realLocation, plannedLocation]);

  // Calcolo distanza (in km) tra la posizione GPS reale e la posizione programmata durante il viaggio
  const distanceToPlannedKm = useMemo(() => {
    if (!realLocation?.coords || !plannedLocation?.coords) return null;
    const lat1 = realLocation.coords.lat;
    const lon1 = realLocation.coords.lng;
    const lat2 = plannedLocation.coords.lat;
    const lon2 = plannedLocation.coords.lng;
    
    const R = 6371; // Raggio terra in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }, [realLocation, plannedLocation]);

  const plannedTimeZone = useMemo(() => {
    if (liveGpsState?.timeZone) return liveGpsState.timeZone;
    if (plannedLocation.coords) {
      return getTimezoneFromCoordinates(plannedLocation.coords.lat, plannedLocation.coords.lng, plannedLocation.countryCode);
    }
    return undefined;
  }, [liveGpsState?.timeZone, plannedLocation.coords, plannedLocation.countryCode]);

  // Motore di Live Intelligence (itinerario in tempo reale, evento in corso, prossima tappa)
  const liveIntelligence = useMemo<LiveIntelligenceState | null>(() => {
    return deriveLiveIntelligence({
      giorni: days,
      attivita: activities,
      tappe,
      alloggi: accommodations,
      trasporti: transports,
      currentDateTime: now,
      tripStartDate: tripRange?.minTripDate,
      tripEndDate: tripRange?.maxTripDate,
      realGpsCoords: remoteGpsLocation ? { lat: remoteGpsLocation.lat, lng: remoteGpsLocation.lng } : (liveGpsState?.coords || null),
      gpsAccuracyMeters: remoteGpsLocation?.accuracy || liveGpsState?.accuracy,
      isExternalGuest: isStandaloneExternal,
      timeZone: plannedTimeZone
    });
  }, [days, activities, tappe, accommodations, transports, now, tripRange, remoteGpsLocation, liveGpsState, isStandaloneExternal, plannedTimeZone]);

  const realCoords = useMemo(() => {
    if (remoteGpsLocation) return { lat: remoteGpsLocation.lat, lng: remoteGpsLocation.lng };
    return null;
  }, [remoteGpsLocation]);

  const plannedCoords = useMemo(() => {
    return liveIntelligence?.plannedLocation?.coords || null;
  }, [liveIntelligence]);

  const effectiveMapCenter = useMemo(() => {
    if (mapCenterMode === 'real') return realCoords || plannedCoords || null;
    if (mapCenterMode === 'planned') return plannedCoords || realCoords || null;
    if (mapCenterMode === 'both' && realCoords && plannedCoords) {
      return {
        lat: (realCoords.lat + plannedCoords.lat) / 2,
        lng: (realCoords.lng + plannedCoords.lng) / 2
      };
    }
    return realCoords || plannedCoords || null;
  }, [mapCenterMode, realCoords, plannedCoords]);

  const effectiveMapZoom = useMemo(() => {
    if (mapCenterMode !== 'both' || !realCoords || !plannedCoords) return mapZoom;
    const span = Math.max(
      Math.abs(realCoords.lat - plannedCoords.lat),
      Math.abs(realCoords.lng - plannedCoords.lng)
    );
    if (span > 60) return 2;
    if (span > 30) return 3;
    if (span > 15) return 4;
    if (span > 8) return 5;
    if (span > 4) return 6;
    if (span > 2) return 7;
    if (span > 1) return 8;
    if (span > 0.4) return 9;
    return Math.min(mapZoom, 10);
  }, [mapCenterMode, mapZoom, plannedCoords, realCoords]);

  const getPixelOffset = (target: { lat: number; lng: number } | null, center: { lat: number; lng: number }, zoom: number) => {
    if (!target) return null;
    const n = Math.pow(2, zoom);
    const tx = ((target.lng + 180) / 360) * n * 256;
    const tLatRad = (target.lat * Math.PI) / 180;
    const ty = (1 - Math.log(Math.tan(tLatRad) + 1 / Math.cos(tLatRad)) / Math.PI) / 2 * n * 256;

    const cx = ((center.lng + 180) / 360) * n * 256;
    const cLatRad = (center.lat * Math.PI) / 180;
    const cy = (1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2 * n * 256;

    return { dx: Math.round(tx - cx), dy: Math.round(ty - cy) };
  };

  const realMarkerOffset = useMemo(() => {
    if (!realCoords || !effectiveMapCenter) return null;
    return getPixelOffset(realCoords, effectiveMapCenter, effectiveMapZoom);
  }, [realCoords, effectiveMapCenter, effectiveMapZoom]);

  const plannedMarkerOffset = useMemo(() => {
    if (!plannedCoords || !effectiveMapCenter) return null;
    return getPixelOffset(plannedCoords, effectiveMapCenter, effectiveMapZoom);
  }, [plannedCoords, effectiveMapCenter, effectiveMapZoom]);

  // Chiamata leggera Open-Meteo per meteo locale e prossima tappa
  useEffect(() => {
    const fetchWeather = async () => {
      const coords = currentLocation.coords;
      if (!coords?.lat || !coords?.lng) return;
      try {
        setWeatherLoading(true);
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current_weather=true`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.current_weather) {
            const desc = getWeatherDescription(data.current_weather.weathercode);
            setWeatherCurrent({
              temperature: Math.round(data.current_weather.temperature),
              weatherCode: data.current_weather.weathercode,
              description: desc.description,
              icon: desc.icon
            });
          }
        }

        // Recupera meteo della prossima tappa programmata (se diversa dalla corrente)
        if (plannedLocation.coords && (plannedLocation.coords.lat !== coords.lat || plannedLocation.coords.lng !== coords.lng)) {
          const resNext = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${plannedLocation.coords.lat}&longitude=${plannedLocation.coords.lng}&current_weather=true`
          );
          if (resNext.ok) {
            const dataNext = await resNext.json();
            if (dataNext.current_weather) {
              const descNext = getWeatherDescription(dataNext.current_weather.weathercode);
              setWeatherNext({
                temperature: Math.round(dataNext.current_weather.temperature),
                weatherCode: dataNext.current_weather.weathercode,
                description: descNext.description,
                icon: descNext.icon
              });
            }
          }
        }
      } catch (err) {
        console.warn('[LiveView] Errore Open-Meteo:', err);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeather();
  }, [currentLocation.coords, plannedLocation.coords]);

  // Risoluzione scientifica del fuso orario di destinazione (Zero Improvvisazione)
  const activeTimezone = useMemo<DestinationTimezone>(() => {
    // 1. Se il GPS è attivo e ha determinato una timezone IANA
    if (liveGpsState?.timeZone) {
      return {
        name: liveGpsState.city || liveGpsState.country || 'Posizione GPS',
        country: liveGpsState.country || '',
        flag: getCountryFlag(liveGpsState.countryCode),
        timeZone: liveGpsState.timeZone
      };
    }

    // 2. Se abbiamo coordinate GPS, ricava timezone scientificamente
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      const tz = getTimezoneFromCoordinates(currentLocation.coords.lat, currentLocation.coords.lng, currentLocation.countryCode);
      return {
        name: currentLocation.city || currentLocation.title,
        country: currentLocation.country,
        flag: currentLocation.flag,
        timeZone: tz
      };
    }

    // 3. Fallback contestuale in base alla località del viaggio
    const locLower = `${currentLocation?.title || ''} ${currentLocation?.city || ''}`.toLowerCase();
    
    if (locLower.includes('filippine') || locLower.includes('manila') || locLower.includes('palawan') || locLower.includes('coron') || locLower.includes('el nido') || locLower.includes('boracay') || locLower.includes('cebu')) {
      return DESTINATION_ZONES[4]; // Manila
    }
    if (locLower.includes('sydney') || locLower.includes('nsw') || locLower.includes('new south wales') || locLower.includes('blue mountains')) {
      return DESTINATION_ZONES[1]; // Sydney
    }
    if (locLower.includes('adelaide') || locLower.includes('kangaroo island') || locLower.includes('barossa') || locLower.includes('south australia') || locLower.includes(' sa')) {
      return DESTINATION_ZONES[2]; // Adelaide
    }
    if (locLower.includes('melbourne') || locLower.includes('victoria') || locLower.includes('great ocean road') || locLower.includes('vic')) {
      return DESTINATION_ZONES[3]; // Melbourne
    }
    if (locLower.includes('pechino') || locLower.includes('beijing') || locLower.includes('china')) {
      return DESTINATION_ZONES[5]; // Pechino
    }
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
    return {
      name: currentLocation?.city || 'Ora locale',
      country: currentLocation?.country || '',
      flag: currentLocation?.flag || '',
      timeZone: localTimeZone
    };
  }, [liveGpsState, currentLocation]);

  // Formattatori orari
  const formatTimeInZone = (date: Date, timeZone: string) => {
    try {
      return new Intl.DateTimeFormat('it-IT', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch {
      return date.toLocaleTimeString('it-IT');
    }
  };

  const formatDateInZone = (date: Date, timeZone: string) => {
    try {
      const parts = new Intl.DateTimeFormat('it-IT', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).formatToParts(date);
      const d = parts.find(p => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
      const m = parts.find(p => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
      const y = parts.find(p => p.type === 'year')?.value || String(date.getFullYear());
      return `${d}-${m}-${y}`;
    } catch {
      return formatDateIT(date);
    }
  };

  const localTimeStr = useMemo(() => formatTimeInZone(now, activeTimezone.timeZone), [now, activeTimezone]);
  const localDateStr = useMemo(() => formatDateInZone(now, activeTimezone.timeZone), [now, activeTimezone]);
  const italyTimeStr = useMemo(() => formatTimeInZone(now, 'Europe/Rome'), [now]);
  const italyDateStr = useMemo(() => formatDateInZone(now, 'Europe/Rome'), [now]);

  // Calcolo matematico preciso del dislivello orario
  const offsetDiffLabel = useMemo(() => {
    try {
      const getOffsetMinutes = (tz: string, d: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset'
        }).formatToParts(d);
        const tzPart = parts.find(p => p.type === 'timeZoneName')?.value;
        if (!tzPart || tzPart === 'GMT') return 0;
        const match = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
        if (!match) return 0;
        const sign = match[1] === '+' ? 1 : -1;
        const h = parseInt(match[2], 10);
        const m = match[3] ? parseInt(match[3], 10) : 0;
        return sign * (h * 60 + m);
      };

      const destMin = getOffsetMinutes(activeTimezone.timeZone, now);
      const italyMin = getOffsetMinutes('Europe/Rome', now);
      const diffMin = destMin - italyMin;
      const diffHours = Math.round(diffMin / 60);
      const signStr = diffHours > 0 ? `+${diffHours}` : `${diffHours}`;
      return `${signStr} ore di differenza rispetto all'Italia`;
    } catch {
      return 'Differenza oraria non disponibile';
    }
  }, [activeTimezone, now]);

  // Coordinate Geografiche Formattate (es. 36°51'S • 174°46'E)
  const formattedCoords = useMemo(() => {
    if (!currentLocation.coords || !currentLocation.coords.lat || !currentLocation.coords.lng) {
      return 'Coordinate non disponibili';
    }
    const { lat, lng } = currentLocation.coords;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latAbs = Math.abs(lat);
    const lngAbs = Math.abs(lng);
    const latDeg = Math.floor(latAbs);
    const latMin = Math.round((latAbs - latDeg) * 60);
    const lngDeg = Math.floor(lngAbs);
    const lngMin = Math.round((lngAbs - lngDeg) * 60);
    return `${latDeg}°${latMin.toString().padStart(2, '0')}'${latDir} • ${lngDeg}°${lngMin.toString().padStart(2, '0')}'${lngDir}`;
  }, [currentLocation.coords]);

  // Calcolo della distanza geodesica dall'Italia (Roma: 41.9028, 12.4964)
  const distanceFromItalyLabel = useMemo(() => {
    if (!currentLocation.coords || !currentLocation.coords.lat || !currentLocation.coords.lng) {
      return 'Distanza non disponibile';
    }
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const lat1 = toRad(41.9028); // Roma
    const lon1 = toRad(12.4964);
    const lat2 = toRad(currentLocation.coords.lat);
    const lon2 = toRad(currentLocation.coords.lng);
    const R = 6371; // raggio Terra in km
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = Math.round(R * c);
    return `~${dist.toLocaleString('it-IT')} km da casa`;
  }, [currentLocation.coords]);

  // Griglia dinamica 3x3 di Tile per la mappa interattiva (Esri ArcGIS World Street Map)
  const tileGrid = useMemo(() => {
    const center = effectiveMapCenter;
    if (!center || !center.lat || !center.lng) {
      return null;
    }
    const { lat, lng } = center;
    const zoom = effectiveMapZoom;
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    
    // Posizione floating (xFloat, yFloat) in unità di tile da 256px
    const xFloat = ((lng + 180) / 360) * n;
    const yFloat = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    
    // Tile centrale
    const centerTileX = Math.floor(xFloat);
    const centerTileY = Math.floor(yFloat);
    
    // Offset in pixel dal centro del tile centrale (da -128 a +128px circa)
    const pixelOffsetX = (xFloat - centerTileX - 0.5) * 256;
    const pixelOffsetY = (yFloat - centerTileY - 0.5) * 256;

    // Genera 3x3 tessere attorno al centro per consentire pan fluido
    const tiles: { key: string; x: number; y: number; url: string }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        const maxTiles = Math.pow(2, zoom);
        // Wrap orizzontale e clamp verticale
        const wrappedX = ((tx % maxTiles) + maxTiles) % maxTiles;
        const clampedY = Math.max(0, Math.min(ty, maxTiles - 1));
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${clampedY}/${wrappedX}`;
        tiles.push({
          key: `${zoom}-${clampedY}-${wrappedX}`,
          x: tx,
          y: ty,
          url
        });
      }
    }

    return {
      tiles,
      pixelOffset: { x: pixelOffsetX, y: pixelOffsetY }
    };
  }, [effectiveMapCenter, effectiveMapZoom]);

  // Link a Google Maps
  const mapSearchUrl = useMemo(() => {
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${currentLocation.coords.lat},${currentLocation.coords.lng}`;
    }
    return resolveMapUrl(currentLocation.title || currentLocation.city);
  }, [currentLocation]);

  // Foto d'ispirazione / copertina per la sezione foto (priorità a foto reale caricata dagli sposi)
  const photoUpdateData = useMemo(() => {
    if (customPhoto) {
      const timeAgo = (() => {
        try {
          const diffMs = Date.now() - new Date(customPhoto.timestamp).getTime();
          const diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 1) return 'Pochi istanti fa';
          if (diffMin < 60) return `${diffMin} min fa`;
          const diffHours = Math.floor(diffMin / 60);
          if (diffHours < 24) return `${diffHours} ore fa`;
          const diffDays = Math.floor(diffHours / 24);
          return `${diffDays} giorni fa`;
        } catch {
          return 'Recente';
        }
      })();

      return {
        url: customPhoto.dataUrl,
        caption: customPhoto.caption,
        tag: `📸 Sposi • ${timeAgo}`,
        isCustom: true
      };
    }

    const locLower = `${currentLocation?.title || ''} ${currentLocation?.city || ''}`.toLowerCase();
    
    if (locLower.includes('filippine') || locLower.includes('coron') || locLower.includes('el nido') || locLower.includes('palawan')) {
      return {
        url: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=80',
        caption: 'Laguna di El Nido • Acque cristalline a Palawan',
        tag: '🇵🇭 Filippine'
      };
    }
    if (locLower.includes('sydney')) {
      return {
        url: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80',
        caption: 'Sydney Harbour & Opera House al tramonto',
        tag: '🇦🇺 Australia'
      };
    }
    if (locLower.includes('kangaroo island') || locLower.includes('adelaide')) {
      return {
        url: 'https://images.unsplash.com/photo-1548263594-a71ea65a8598?auto=format&fit=crop&w=1200&q=80',
        caption: 'Remarkable Rocks & Costa selvaggia • Kangaroo Island',
        tag: '🇦🇺 Australia'
      };
    }
    if (locLower.includes('queenstown') || locLower.includes('milford') || locLower.includes('te anau')) {
      return {
        url: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?auto=format&fit=crop&w=1200&q=80',
        caption: 'Fiordi & Montagne a picco sui laghi • Queenstown',
        tag: '🇳🇿 Nuova Zelanda'
      };
    }
    // Default Auckland & Nuova Zelanda
    return {
      url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
      caption: 'Inizio del viaggio on the road • Verso la baia di Auckland',
      tag: '🇳🇿 Nuova Zelanda'
    };
  }, [currentLocation, customPhoto]);

  // Calcolo stato temporale per la timeline (Completato, ORA, Previsto)
  const evaluatedTimeline = useMemo(() => {
    // Ora corrente locale in minuti dal mattino per comparazione
    let currentLocalMinutes = 12 * 60; // fallback mezzogiorno
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: activeTimezone.timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      currentLocalMinutes = h * 60 + m;
    } catch {
      currentLocalMinutes = now.getHours() * 60 + now.getMinutes();
    }

    // Prepara max 4 elementi chiave per la vista sintetica
    const items = [...timelineItems].slice(0, 4);

    // Se non ci sono attività, o ne abbiamo meno di 4 e c'è l'alloggio notturno, aggiungilo come sosta serale
    if (currentAccommodation && items.length < 4 && !items.some(i => i.type === 'alloggio')) {
      items.push({
        id: `lodging_${currentAccommodation.id}`,
        type: 'alloggio',
        time: currentAccommodation.checkInTime || '20:00',
        title: currentAccommodation.name,
        location: currentAccommodation.location || currentAccommodation.address,
        categoryOrType: 'alloggio',
        originalData: currentAccommodation
      });
    }

    // Converti l'orario di ogni evento in minuti
    const parsed = items.map(item => {
      const timeMatch = (item.time || '12:00').match(/^(\d{1,2}):(\d{2})/);
      const minutes = timeMatch ? parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10) : 12 * 60;
      return { item, minutes };
    });

    // Se il viaggio non è ancora iniziato (oggi < data inizio) o stiamo visualizzando un giorno futuro:
    // NESSUN evento deve avere lo stato "ORA" o "Fatto". Tutti gli eventi devono essere "upcoming" (Previsto).
    if (tripCountdown.isPreTrip || activeDate !== todayStr) {
      return parsed.map(p => ({
        ...p.item,
        status: 'upcoming' as const
      }));
    }

    // Altrimenti (viaggio in corso e data di oggi): calcola evento corrente
    let activeIdx = -1;
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].minutes <= currentLocalMinutes) {
        activeIdx = i;
      } else {
        break;
      }
    }
    if (activeIdx === -1 && parsed.length > 0) {
      activeIdx = 0; // se la giornata è appena iniziata, il primo è attivo/imminente
    }

    return parsed.map((p, idx) => {
      let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
      if (idx < activeIdx) {
        status = 'completed';
      } else if (idx === activeIdx) {
        status = 'current';
      } else {
        status = 'upcoming';
      }
      return {
        ...p.item,
        status
      };
    });
  }, [timelineItems, currentAccommodation, now, activeTimezone, tripCountdown.isPreTrip, activeDate, todayStr]);

  // Salva stato personalizzato
  const handleSaveStatus = async () => {
    const trimmed = tempStatus.trim() || DEFAULT_STATUS_MESSAGE;
    
    // Aggiorna localmente per risposta immediata
    setStatusMessage(trimmed);
    setIsEditingStatus(false);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STATUS_MESSAGE_KEY, trimmed);
    }
    
    // Scrive su Firestore se abbiamo il tripId
    if (activeTripId) {
      try {
        await liveService.updateStatusMessage(activeTripId, trimmed);
      } catch (err) {
        console.error('Errore aggiornamento status message:', err);
      }
    }
  };

  const liveDeviceLabel = cloudRole === 'owner'
    ? `Organizzatore · ${deviceRole === 'guida' ? 'dispositivo guida' : deviceRole}`
    : cloudRole === 'copilota'
      ? 'Copilota verificato · sola pubblicazione diario'
      : 'Viewer / ospite · sola lettura';

  const isGpsHolder = Boolean(
    remoteGpsLease?.status === 'active' &&
    remoteGpsLease.expiresAt.getTime() > Date.now() &&
    remoteGpsLease.holderDeviceId === liveGpsService.getDeviceId()
  );

  if (!activeTripId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-fade-in text-slate-900 dark:text-slate-100">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl mb-4 shadow-sm border border-slate-200/80 dark:border-slate-700">
          🧭
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-950 dark:text-white mb-2">Nessun viaggio selezionato</h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
          Per visualizzare la trasmissione LIVE, il diario di bordo e la posizione satellitare, seleziona o accedi a un viaggio autorizzato.
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            ← Torna indietro
          </button>
        )}
      </div>
    );
  }

  if (typeof document !== 'undefined') return (
    <LiveEditorialExperience
      isExternal={isStandaloneExternal}
      onBack={onBack}
      location={currentLocation}
      realLocation={remoteGpsLocation}
      mapSearchUrl={
        mapCenterMode === 'planned' && liveIntelligence?.plannedLocation?.coords
          ? `https://www.google.com/maps/search/?api=1&query=${liveIntelligence.plannedLocation.coords.lat},${liveIntelligence.plannedLocation.coords.lng}`
          : mapCenterMode === 'real' && realCoords
            ? `https://www.google.com/maps/search/?api=1&query=${realCoords.lat},${realCoords.lng}`
            : mapSearchUrl
      }
      tileGrid={tileGrid}
      tileLoadFailed={tileLoadFailed}
      onTileError={() => setTileLoadFailed(true)}
      gpsError={gpsError}
      gpsFeedback={gpsFeedback}
      isDetectingGps={isDetectingGps}
      isOnline={typeof navigator !== 'undefined' ? navigator.onLine : true}
      canControlGps={cloudRole === 'owner' || isGpsHolder}
      deviceLabel={liveDeviceLabel}
      onDetectGps={() => handleDetectGps(false)}
      remoteGpsLease={remoteGpsLease}
      remoteGpsLocation={remoteGpsLocation}
      isGpsHolder={isGpsHolder}
      isOwner={cloudRole === 'owner'}
      isCopilota={cloudRole === 'copilota'}
      gpsDevices={gpsDevices}
      tripMembers={tripMembers}
      membersMap={membersMap}
      ownerName={activeTripCfg?.ownerName || 'Owner'}
      ownerUid={activeTripCfg?.ownerUid || ''}
      onStartGps={handleStartGps}
      onPauseGps={() => handlePauseOrStopGps('paused')}
      onResumeGps={handleStartGps}
      onStopGps={() => handlePauseOrStopGps('stopped')}
      onTransferGps={handleTransferGps}
      onRevokeGps={() => {
        if (currentUid) return handleTransferGps(currentUid, liveGpsService.getDeviceId());
      }}
      liveIntelligence={liveIntelligence}
      mapCenterMode={mapCenterMode}
      onChangeMapCenterMode={setMapCenterMode}
      realMarkerOffset={realMarkerOffset}
      plannedMarkerOffset={plannedMarkerOffset}
      statusMessage={statusMessage}
      statusUpdatedAt={statusUpdatedAt}
      canPublish={isSposiAdmin && (cloudRole === 'owner' || cloudRole === 'copilota')}
      isEditingStatus={isEditingStatus}
      tempStatus={tempStatus}
      onTempStatusChange={setTempStatus}
      onToggleStatusEdit={() => {
        setTempStatus(statusMessage);
        setIsEditingStatus(value => !value);
      }}
      onSaveStatus={handleSaveStatus}
      liveTextMessage={liveTextMessage}
      onLiveTextChange={(value) => {
        setLiveTextMessage(value);
        if (liveMsgError) setLiveMsgError(null);
      }}
      onSendMessage={handleSendLiveTextMessage}
      isSendingMessage={isSendingLiveMsg}
      messageError={liveMsgError}
      messageSuccess={liveMsgSuccess}
      updates={liveUpdates}
      reactions={localReactions}
      onReaction={handleReaction}
      onShare={handleShareLiveLink}
      copiedLink={copiedLink}
      online={isOnline}
      galleryPhotos={allLiveGalleryPhotos}
      onUploadPhoto={handleUploadPhoto}
      onDeletePhoto={handleDeletePhoto}
      onDeleteUpdate={handleDeleteLiveUpdate}
    />
  );

  return (
    <div className="flex flex-col h-full animate-fade-in pb-12 space-y-4">
      {/* 1. HEADER MINIMALE E PULITO */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          {!isStandaloneExternal && onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Torna ad Altro"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {isStandaloneExternal && (
            <div className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 border border-rose-200/60 text-base">
              💍
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>Live</span>
              {isStandaloneExternal && (
                <span className="text-xs font-semibold text-rose-500">• Hounigo</span>
              )}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Segui il nostro viaggio in tempo reale
            </p>
          </div>
        </div>

        {/* Badge e pulsante condividi */}
        <div className="flex items-center gap-2">
          {!isStandaloneExternal && (
            <button
              type="button"
              onClick={handleShareLiveLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fff0ee] hover:bg-[#ffe3df] text-[#c94e45] text-xs font-bold border border-[#ffc9c3] transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Condividi link Live con amici e parenti"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{copiedLink ? '✓ Link Copiato!' : 'Condividi Live'}</span>
            </button>
          )}

          {/* Pulsante discreto Modalità Sposi (Luchetto / Cuore) */}
          {!isStandaloneExternal && (
            isSposiAdmin ? (
              <button
                type="button"
                onClick={handleLogoutSposi}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-bold border border-rose-300 transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Sei in modalità Sposi • Tocca per uscire"
              >
                <span>💍 Sposi</span>
                <span className="text-[9px] text-rose-600">✕</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPinInput('');
                  setPinError(false);
                  setShowPinModal(true);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all cursor-pointer text-xs"
                title="Accesso riservato Sposi"
              >
                🔒
              </button>
            )
          )}

          {/* Badge discreto con puntino verde pulsante */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF0ED] border border-slate-200/80 text-[#172033] text-[10px] font-bold tracking-wider shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF9A76] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FFF0ED]0" />
            </span>
            <span>● LIVE</span>
          </div>
        </div>
      </header>

      {/* 2. WIDGET VOLO IN PARTENZA / LIVE TRACKING */}
      {liveFlight && (
        <div className="bg-white border-2 border-[#FF6B5F] rounded-2xl p-4 shadow-xl shadow-rose-500/10 mx-1 mb-2 animate-scale-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[#FF6B5F] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
              ● {liveFlight.date === todayStr ? 'Oggi in partenza' : 'In partenza'}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {liveFlight.carrier || 'Volo'} {liveFlight.bookingCode ? `(${liveFlight.bookingCode})` : ''}
            </span>
          </div>
          
          <div className="flex items-center justify-between mb-4">
             <div className="flex-1">
               <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{liveFlight.departureLocation || 'Partenza'}</p>
               <p className="text-[11px] font-semibold text-slate-500">{liveFlight.departureTime || '--:--'}</p>
             </div>
             <div className="flex-1 flex justify-center text-rose-500 px-2">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
               </svg>
             </div>
             <div className="flex-1 text-right">
               <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{liveFlight.arrivalLocation || 'Arrivo'}</p>
               <p className="text-[11px] font-semibold text-slate-500">{liveFlight.arrivalTime || '--:--'} {liveFlight.arrivalDate && liveFlight.arrivalDate !== liveFlight.date ? '(+1)' : ''}</p>
             </div>
          </div>

          <a
            href={liveFlight.carrier ? `https://www.google.com/search?q=${encodeURIComponent('volo ' + liveFlight.carrier)}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition shadow-md"
          >
            <span>✈️</span> Segui questo volo in diretta online ↗
          </a>
        </div>
      )}


      {/* 2. PRIMO ELEMENTO FORTE: OROLOGIO DOPPIO FUSO (Voi siete qui / Noi siamo qui) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col items-center">
        <div className="grid grid-cols-2 gap-4 divide-x divide-slate-100 w-full mb-3.5">
          {/* Colonna Sinistra (Destinazione / Noi siamo qui) */}
          <div className="flex flex-col pr-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-0.5">
              <span className="text-base">{activeTimezone.flag}</span>
              <span className="truncate">{activeTimezone.name}</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mt-1">
              {localTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-1.5">
              {localDateStr}
            </div>
          </div>

          {/* Colonna Destra (Italia / Voi siete qui) */}
          <div className="flex flex-col pl-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-0.5">
              <span className="text-base">🇮🇹</span>
              <span>Roma</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mt-1">
              {italyTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-1.5">
              {italyDateStr}
            </div>
          </div>
        </div>

        {/* Badge centrale inferiore: dislivello esatto */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 text-[11px] font-semibold border border-slate-200/60">
          <span>🕒</span>
          <span>{offsetDiffLabel}</span>
        </div>
      </div>

      {/* 3. CARD GRAFICA CARTOGRAFICA "📍 SIAMO QUI" (Mini-Mappa + Dati di Navigazione) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5 overflow-hidden">
        {/* Intestazione Sezione */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>📍</span>
            <span>POSIZIONE</span>
            {currentLocation.isRealGps ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#FFF0ED] text-[#172033] border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFF0ED]0 animate-pulse" />
                GPS Reale
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">
                Itinerario
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400 font-medium">
            {currentLocation.updateNotice}
          </span>
        </div>

        {/* Toggle Esplicito: Dove siamo ora (GPS) vs Dove dovremmo essere (Itinerario) */}
        <div className="flex items-center p-1 bg-slate-100 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => {
              setMapLocationMode('reale');
              setMapPan({ x: 0, y: 0 });
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mapLocationMode === 'reale'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📍</span>
            <span>Dove siamo ora</span>
            {realLocation && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFF0ED]0 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMapLocationMode('programmato');
              setMapPan({ x: 0, y: 0 });
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mapLocationMode === 'programmato'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🗓️</span>
            <span>Dove dovremmo essere</span>
          </button>
        </div>

        {/* Widget Meteo Compatto Open-Meteo */}
        <div className="grid grid-cols-2 gap-2 bg-[#F0FAF9] rounded-2xl p-2.5 border border-sky-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{weatherCurrent?.icon || '🌤️'}</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                {mapLocationMode === 'reale' ? 'Meteo Attuale' : 'Meteo Tappa'}
              </span>
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>{weatherLoading ? '...' : weatherCurrent ? `${weatherCurrent.temperature}°C` : '–'}</span>
                <span className="text-[10px] font-medium text-slate-500 truncate">
                  {weatherCurrent?.description || 'Locale'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-sky-100">
            <span className="text-2xl">{weatherNext?.icon || '⛅'}</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                Tappa Programmata
              </span>
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>{weatherNext ? `${weatherNext.temperature}°C` : weatherCurrent ? `${weatherCurrent.temperature}°C` : '–'}</span>
                <span className="text-[10px] font-medium text-slate-500 truncate">
                  {weatherNext?.description || weatherCurrent?.description || 'Previsto'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mini-Mappa Cartografica Interattiva con Pan, Zoom e Radar Pulse Pin */}
        <div 
          className="relative h-48 sm:h-52 w-full rounded-2xl overflow-hidden shadow-inner border border-slate-200/80 bg-slate-100 group select-none touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setIsDraggingMap(true);
            dragStartRef.current = { x: e.clientX - mapPan.x, y: e.clientY - mapPan.y };
          }}
          onPointerMove={(e) => {
            if (!isDraggingMap || !dragStartRef.current) return;
            setMapPan({
              x: e.clientX - dragStartRef.current.x,
              y: e.clientY - dragStartRef.current.y
            });
          }}
          onPointerUp={(e) => {
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              // Ignore
            }
            setIsDraggingMap(false);
            dragStartRef.current = null;
          }}
          onPointerCancel={() => {
            setIsDraggingMap(false);
            dragStartRef.current = null;
          }}
          onWheel={(e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
              setMapZoom(z => Math.min(z + 1, 16));
            } else {
              setMapZoom(z => Math.max(z - 1, 4));
            }
          }}
        >
          {/* Griglia di Tile Esri ArcGIS World Street Map reattiva al pan e allo zoom */}
          {tileGrid && !tileLoadFailed ? (
            <div 
              className="absolute pointer-events-none transition-transform duration-75"
              style={{
                width: 3 * 256,
                height: 3 * 256,
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${mapPan.x - tileGrid.pixelOffset.x}px), calc(-50% + ${mapPan.y - tileGrid.pixelOffset.y}px))`
              }}
            >
              <div className="grid grid-cols-3 w-full h-full">
                {tileGrid.tiles.map((t) => (
                  <img
                    key={t.key}
                    src={t.url}
                    alt=""
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-[256px] h-[256px] object-cover filter contrast-[1.02] brightness-[0.99] block"
                    onError={() => setTileLoadFailed(true)}
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Fallback Cartografico Vettoriale Stile Apple Maps (Zero Rete / Offline) */
            <div className="absolute inset-0 bg-slate-50 flex items-center justify-center overflow-hidden">
              <svg className="absolute inset-0 w-full h-full text-slate-200/70" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <path d="M-20 80 Q 80 40 180 90 T 380 60 T 580 120" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
                <path d="M-20 120 Q 90 80 200 130 T 400 90 T 600 150" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                <path d="M-20 160 Q 110 130 220 170 T 420 140 T 620 190" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
              </svg>
            </div>
          )}

          {/* Effetto vignettatura leggera per profondità */}
          <div className="absolute inset-0 bg-transparent pointer-events-none" />

          {/* Pin Radar Pulsante ancorato alla posizione esatta (si muove con il pan) */}
          <div 
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              transform: `translate(calc(-50% + ${mapPan.x}px), calc(-50% + ${mapPan.y}px))`
            }}
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute w-12 h-12 rounded-full bg-[#FF6B5F]/25 animate-ping opacity-75 duration-1000" />
              <span className="absolute w-7 h-7 rounded-full bg-[#FF6B5F]/35 animate-pulse" />
              <span className="relative w-4 h-4 rounded-full bg-[#FF6B5F] border-2 border-white shadow-md flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            </div>
          </div>

          {/* Badge Top/Floating: Località e Bandiera */}
          <div className="absolute top-2.5 left-2.5 max-w-[65%] pointer-events-none">
            <div className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm border border-white/60 truncate">
              <span>{currentLocation.flag}</span>
              <span className="truncate">{currentLocation.badgeLabel || `${currentLocation.city}, ${currentLocation.country}`}</span>
            </div>
          </div>

          {/* Controlli Mappa Micro-Minimali Stile iOS: Zoom In, Zoom Out, Ricentra */}
          <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMapZoom(z => Math.min(z + 1, 16));
              }}
              className="w-7 h-7 rounded-xl bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/80 flex items-center justify-center text-xs font-black transition-all cursor-pointer active:scale-90"
              title="Ingrandisci"
            >
              +
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMapZoom(z => Math.max(z - 1, 4));
              }}
              className="w-7 h-7 rounded-xl bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/80 flex items-center justify-center text-xs font-black transition-all cursor-pointer active:scale-90"
              title="Rimpicciolisci"
            >
              −
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMapPan({ x: 0, y: 0 });
                setMapZoom(12);
              }}
              className="w-7 h-7 rounded-xl bg-white/90 hover:bg-white text-indigo-600 backdrop-blur-md shadow-xs border border-white/80 flex items-center justify-center text-xs font-black transition-all cursor-pointer active:scale-90"
              title="Ricentra su tappa"
            >
              ⌖
            </button>
          </div>

          {/* Micro-tasto Floating in basso a destra "Apri su Maps ↗" */}
          <div className="absolute bottom-2.5 right-2.5 z-10">
            <button
              type="button"
              onClick={() => openMapLink(mapSearchUrl)}
              className="inline-flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 text-white backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95 border border-white/20"
              title="Apri le coordinate su Google Maps"
            >
              <span>Apri su Maps</span>
              <span className="text-[10px]">↗</span>
            </button>
          </div>

          {/* Micro attribution discreta Esri */}
          <div className="absolute bottom-1 left-2 pointer-events-none text-[8px] text-slate-500/80 font-sans drop-shadow-2xs">
            © Esri ArcGIS
          </div>
        </div>

        {/* Toggle Esclusivo Pre-Partenza: Visualizza mia posizione attuale vs Prima Tappa (solo per Telefono Guida) */}
        {tripCountdown.isPreTrip && deviceRole === 'guida' && (
          <div className="px-1 py-1 flex items-center justify-between gap-2 bg-slate-50/80 rounded-2xl p-2.5 border border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">🧭</span>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block truncate">
                  Visualizza la mia posizione attuale
                </span>
                <span className="text-[10px] text-slate-500 block truncate">
                  {showMyCurrentGps ? 'Attivo (mostra segnale GPS reale)' : 'Disattivo (ancorato alla 1ª tappa ad Auckland)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowMyCurrentGps(prev => !prev);
                setMapPan({ x: 0, y: 0 });
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showMyCurrentGps ? 'bg-[#FF6B5F]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showMyCurrentGps ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {/* Dati di Navigazione & Contesto Emozionale */}
        <div className={`grid ${distanceToPlannedKm !== null && !isStandaloneExternal ? 'grid-cols-3' : (!isStandaloneExternal ? 'grid-cols-2' : 'grid-cols-1')} gap-2 pt-0.5`}>
          {/* Coordinate Geografiche (Riservate all'app interna, mai esposte a visitatori esterni) */}
          {!isStandaloneExternal && (
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-sm">🧭</span>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                  Coordinate GPS
                </div>
                <div className="text-[11px] font-bold text-slate-800 font-mono truncate">
                  {formattedCoords}
                </div>
              </div>
            </div>
          )}

          {/* Distanza da Casa / Italia */}
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-sm">🌍</span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                Distanza dall'Italia
              </div>
              <div className="text-[11px] font-bold text-indigo-700 truncate">
                {distanceFromItalyLabel}
              </div>
            </div>
          </div>

          {/* Distanza dalla Tappa Programmata (durante il viaggio) */}
          {distanceToPlannedKm !== null && (
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#FFF0ED]/80 border border-[#FFF0ED]">
              <span className="text-sm">🎯</span>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider font-bold text-[#FF6B5F]">
                  Distanza Tappa
                </div>
                <div className="text-[11px] font-bold text-[#172033] truncate">
                  ~{distanceToPlannedKm.toLocaleString('it-IT')} km
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pulsante di acquisizione GPS reale (riservato al Telefono Guida per non sovrascrivere dal co-pilota o da PC) */}
        {!isStandaloneExternal && (deviceRole === 'guida' || (deviceRole !== 'copilota' && deviceRole !== 'viewer' && isSposiAdmin)) && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleDetectGps(false)}
              disabled={isDetectingGps}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <span>{isDetectingGps ? '🛰️' : '📡'}</span>
              <span>
                {isDetectingGps ? 'Rilevamento satellitare in corso...' : 'Aggiorna GPS da questo telefono'}
              </span>
            </button>

            {gpsError ? (
              <span className="text-[10px] text-rose-500 font-medium">
                {gpsError}
              </span>
            ) : liveGpsState?.accuracy ? (
              <span className="text-[10px] text-slate-400 font-mono">
                Precisione: ±{Math.round(liveGpsState.accuracy)}m
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. CARD "📸 Ultimo Aggiornamento" (La foto del momento con upload per Sposi) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <span>📸</span>
            <span>Ultimo Aggiornamento</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {photoUpdateData.tag}
            </span>
            {/* Pulsanti gestione foto per Sposi (Guida o sbloccato) */}
            {!isStandaloneExternal && isSposiAdmin && deviceRole !== 'viewer' && (
              <div className="flex items-center gap-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/*,.heic,.heif"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                  title="Scatta una foto o sceglila dalla galleria"
                >
                  {isUploadingPhoto ? 'Caricamento...' : '📷 Cambia Foto'}
                </button>
                {photoUpdateData.isCustom && (
                  <button
                    type="button"
                    onClick={handleResetPhoto}
                    className="text-[10px] font-medium text-slate-400 hover:text-slate-600 px-1 py-0.5"
                    title="Ripristina foto predefinita"
                  >
                    ↺
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Riquadro fotografico immersivo */}
        <div 
          onClick={() => {
            const idx = publishedLivePhotos.findIndex(p => p.url === photoUpdateData.url || p.id === 'sposi_custom_photo');
            if (idx >= 0) {
              setActiveViewerIndex(idx);
            } else if (publishedLivePhotos.length > 0) {
              setActiveViewerIndex(0);
            }
          }}
          className="relative rounded-2xl overflow-hidden aspect-video shadow-xs border border-slate-200/70 group cursor-pointer"
          title="Clicca per ingrandire e sfogliare tutte le foto del viaggio"
        >
          <img
            src={photoUpdateData.url}
            alt={photoUpdateData.caption}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          {/* Badge ingrandisci */}
          <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-xs opacity-90 group-hover:opacity-100 transition-opacity">
            <span>🔍</span>
            <span>Espandi ({publishedLivePhotos.length} {publishedLivePhotos.length === 1 ? 'foto' : 'foto'})</span>
          </div>

          {/* Gradiente scuro sul fondo per leggibilità micro-didascalia */}
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-3 pt-6 flex items-center justify-between gap-2">
            <p className="text-white text-xs font-semibold drop-shadow-xs line-clamp-1">
              📷 {photoUpdateData.caption}
            </p>
          </div>
        </div>
      </div>

      {/* 5. CARD "💬 Messaggio da noi" (Protagonista e Naturale) */}
      <div className="bg-rose-50/70 rounded-3xl p-4 border border-rose-200/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="font-bold text-rose-950 text-sm">Messaggio da noi</h3>
          </div>
          {/* Tocco discreto per gli sposi per modificare il testo (solo se in modalità Sposi) */}
          {!isStandaloneExternal && isSposiAdmin && (
            <button
              type="button"
              onClick={() => {
                setTempStatus(statusMessage);
                setIsEditingStatus(prev => !prev);
              }}
              className="text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 transition-colors cursor-pointer px-2 py-0.5 rounded-full"
              title="Modifica messaggio per la famiglia"
            >
              {isEditingStatus ? 'Annulla' : '✏️ Modifica'}
            </button>
          )}
        </div>

        {isEditingStatus ? (
          <div className="space-y-2 pt-1">
            <textarea
              rows={2}
              value={tempStatus}
              onChange={(e) => setTempStatus(e.target.value)}
              placeholder="Scrivi un breve messaggio per chi vi segue da casa..."
              className="w-full p-2.5 bg-white border border-rose-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none shadow-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveStatus}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Salva
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-800 font-medium italic bg-white/80 p-3 rounded-2xl border border-rose-100/90 leading-relaxed shadow-2xs">
              “{statusMessage}”
            </p>
            <span className="text-[10px] text-rose-600/80 font-medium block mt-1.5 text-right">
              {statusUpdatedAt}
            </span>
          </div>
        )}
      </div>

      {/* 6. TIMELINE PROGRAMMA DEL GIORNO (Oggi durante il viaggio, Countdown prima della partenza) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{tripCountdown.isPreTrip ? '⏳' : '📅'}</span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {tripCountdown.isPreTrip ? `Mancano ${tripCountdown.diffDays} giorni alla partenza` : 'Oggi'}
              </h3>
              {tripCountdown.isPreTrip && (
                <p className="text-[10px] text-slate-500 font-medium">
                  Partenza prevista: {tripCountdown.firstDateStr}
                </p>
              )}
            </div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
            {tripCountdown.isPreTrip ? 'Prima Tappa' : activeDate}
          </span>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : evaluatedTimeline.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <span>🏖️</span> Giornata di esplorazione libera o relax
          </div>
        ) : (
          <div className="space-y-2.5">
            {evaluatedTimeline.map((item) => {
              const isCurrent = item.status === 'current';
              const isCompleted = item.status === 'completed';

              const icon = item.type === 'trasporto' ? '✈️' :
                           item.type === 'tappa' ? '📍' :
                           item.type === 'ristorante' ? '🍽️' :
                           item.type === 'shopping' ? '🛍️' :
                           item.type === 'alloggio' ? '🛏️' : '🌿';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-[#FFF0ED]/70 border-slate-300 shadow-xs ring-1 ring-emerald-200'
                      : isCompleted
                      ? 'bg-slate-50/60 border-slate-200/60 opacity-80'
                      : 'bg-white border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-emerald-950 font-extrabold' : 'text-slate-900'}`}>
                          {item.title}
                        </h4>
                      </div>
                      {item.location && item.location !== item.title && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          📍 {item.location}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${
                      item.timeStatus === 'indicativo'
                        ? 'bg-amber-50 text-amber-800 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200/50'
                    }`}>
                      {item.timeStatus === 'indicativo' ? `~${item.time}` : item.time || 'Orario non specificato'}
                    </span>

                    {/* Stato dell'evento */}
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-[#172033] bg-[#FFF0ED]/90 px-1.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F] animate-pulse" />
                        ORA
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1">
                        <span>✓</span>
                        <span>Fatto</span>
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-400">
                        Previsto
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. LIVE FEED PUBBLICO (Gli update espliciti) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📡</span>
            <h3 className="font-bold text-slate-900 text-sm">Aggiornamenti Live</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {liveUpdates.length} {liveUpdates.length === 1 ? 'post' : 'post'}
          </span>
        </div>

        {/* Form Invio Messaggio Testuale nel Live (riservato agli sposi o membri attivi) */}
        {!isStandaloneExternal && isSposiAdmin && (
          <form onSubmit={handleSendLiveTextMessage} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <span>✍️</span> Invia un messaggio dal vivo
              </span>
              <span className={`text-[10px] font-mono font-semibold ${liveTextMessage.length > 450 ? 'text-amber-600' : 'text-slate-400'}`}>
                {liveTextMessage.length}/500
              </span>
            </div>

            <textarea
              rows={2}
              value={liveTextMessage}
              onChange={(e) => {
                setLiveTextMessage(e.target.value);
                if (liveMsgError) setLiveMsgError(null);
              }}
              placeholder="Scrivi una novità o un aneddoto per gli invitati..."
              maxLength={500}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none shadow-2xs"
            />

            {liveMsgError && (
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{liveMsgError}</span>
              </div>
            )}

            {liveMsgSuccess && (
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                <span>✅</span>
                <span>{liveMsgSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                Mittente: {liveSenderTitle}
              </span>
              <button
                type="submit"
                disabled={isSendingLiveMsg || !liveTextMessage.trim()}
                className="px-4 py-1.5 rounded-xl bg-[#FF6B5F] hover:bg-[#ed5d52] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSendingLiveMsg ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Invio...</span>
                  </>
                ) : (
                  <>
                    <span>Invia</span>
                    <span>📨</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
        
        {liveUpdates.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Nessun aggiornamento pubblicato finora
          </div>
        ) : (
          <div className="space-y-4">
            {liveUpdates.map((update) => (
              <div key={update.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 text-sm">{update.title}</h4>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTimeIT(update.timestamp)}
                  </span>
                </div>
                {update.locationName && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>📍</span> {update.locationName}
                  </div>
                )}
                {update.text && (
                  <p className="text-xs text-slate-700 leading-relaxed">{update.text}</p>
                )}

                {update.photoUrl && (
                  <div 
                    onClick={() => {
                      const idx = publishedLivePhotos.findIndex(p => p.url === update.photoUrl);
                      if (idx >= 0) setActiveViewerIndex(idx);
                    }}
                    className="relative rounded-xl overflow-hidden aspect-video border border-slate-200/80 bg-slate-100 group cursor-pointer"
                    title="Clicca per ingrandire la foto"
                  >
                    <img 
                      src={update.photoUrl} 
                      alt={update.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy" 
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <span>🔍</span>
                      <span>Espandi</span>
                    </div>
                  </div>
                )}
                
                {/* Reactions */}
                <div className="flex gap-2 pt-2 border-t border-slate-200/60 mt-2">
                  {['❤️', '😍', '😂', '👋'].map((emoji) => {
                    const isSelected = localReactions[update.id] === emoji;
                    const baseCount = update.reactionCounts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(update.id, emoji)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] cursor-pointer active:scale-95 transition-all shadow-xs ${
                          isSelected 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' 
                            : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="font-semibold">{baseCount + (isSelected ? 1 : 0)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL PIN SPOSI */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mx-auto mb-3">
              🔒
            </div>
            <h3 className="font-extrabold text-slate-800 text-base">Accesso Sposi</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Inserisci il PIN per sbloccare le funzioni di aggiornamento e upload foto.
            </p>
            <form onSubmit={handleVerifyPin} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                placeholder="PIN (es. 2026)"
                autoFocus
                className="w-full text-center text-lg tracking-widest font-mono py-2.5 px-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              {pinError && (
                <p className="text-[11px] text-red-600 font-semibold">PIN non corretto. Riprova.</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-xl transition-colors cursor-pointer"
                >
                  Sblocca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DIDASCALIA FOTO */}
      {showCaptionModal && pendingPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <span>📷</span> Conferma Nuova Foto
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCaptionModal(false);
                  setPendingPhotoUrl(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden aspect-video border border-slate-200 bg-slate-100 shadow-inner">
              <img
                src={pendingPhotoUrl}
                alt="Anteprima"
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Didascalia o Luogo
              </label>
              <input
                type="text"
                value={photoCaptionInput}
                onChange={(e) => setPhotoCaptionInput(e.target.value)}
                placeholder="es. Spiaggia di Muri • Rarotonga"
                className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCaptionModal(false);
                  setPendingPhotoUrl(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveCustomPhoto}
                className="flex-1 py-2 text-xs font-bold text-white bg-[#FF6B5F] hover:bg-[#ed5d52] rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Salva su dispositivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FULLSCREEN LIVE PHOTO GALLERY VIEWER (Portal) ─── */}
      {activeViewerIndex !== null && publishedLivePhotos[activeViewerIndex] && createPortal(
        <div 
          className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-fade-in select-none"
          onClick={() => setActiveViewerIndex(null)}
        >
          {/* Top Bar: Contatore & Pulsante Chiudi */}
          <div 
            className="flex items-center justify-between text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                📸 {activeViewerIndex + 1} di {publishedLivePhotos.length}
              </span>
              {publishedLivePhotos[activeViewerIndex].location && (
                <span className="text-xs text-white/80 hidden sm:inline-flex items-center gap-1">
                  <span>📍</span>
                  <span>{publishedLivePhotos[activeViewerIndex].location}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveViewerIndex(null)}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
              title="Chiudi visualizzatore (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Area Centrale: Immagine e Frecce di Navigazione */}
          <div className="flex-1 flex items-center justify-between gap-2 sm:gap-4 my-auto relative max-h-[82vh]">
            {/* Freccia Sinistra (Precedente) */}
            <button
              type="button"
              disabled={activeViewerIndex <= 0}
              onClick={(e) => {
                e.stopPropagation();
                if (activeViewerIndex > 0) setActiveViewerIndex(activeViewerIndex - 1);
              }}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl transition-all cursor-pointer shrink-0 z-20 ${
                activeViewerIndex > 0
                  ? 'bg-white/20 hover:bg-white/40 active:scale-95'
                  : 'opacity-20 cursor-not-allowed'
              }`}
              title="Foto precedente (Freccia Sinistra)"
            >
              ❮
            </button>

            {/* Immagine attiva centrata senza deformazioni */}
            <div 
              className="flex-1 flex flex-col items-center justify-center max-h-full max-w-full overflow-hidden p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={publishedLivePhotos[activeViewerIndex].url}
                alt={publishedLivePhotos[activeViewerIndex].caption}
                className="max-h-[72vh] max-w-full object-contain rounded-2xl shadow-2xl transition-transform duration-200"
              />
              {publishedLivePhotos[activeViewerIndex].caption && (
                <p className="text-white/90 text-center text-xs sm:text-sm font-medium mt-3 px-4 max-w-xl line-clamp-2">
                  {publishedLivePhotos[activeViewerIndex].caption}
                </p>
              )}
            </div>

            {/* Freccia Destra (Successiva) */}
            <button
              type="button"
              disabled={activeViewerIndex >= publishedLivePhotos.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                if (activeViewerIndex < publishedLivePhotos.length - 1) {
                  setActiveViewerIndex(activeViewerIndex + 1);
                }
              }}
              className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl transition-all cursor-pointer shrink-0 z-20 ${
                activeViewerIndex < publishedLivePhotos.length - 1
                  ? 'bg-white/20 hover:bg-white/40 active:scale-95'
                  : 'opacity-20 cursor-not-allowed'
              }`}
              title="Foto successiva (Freccia Destra)"
            >
              ❯
            </button>
          </div>

          {/* Bottom Bar: Data di pubblicazione e suggerimento tastiera */}
          <div 
            className="flex items-center justify-between text-white/70 text-[11px] z-10 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {publishedLivePhotos[activeViewerIndex].timestamp > 0 && (
                <span>
                  {formatDateTimeIT(publishedLivePhotos[activeViewerIndex].timestamp)}
                </span>
              )}
            </div>
            <span className="hidden sm:inline-block opacity-60">
              Usa le frecce della tastiera ◀ ▶ o Esc per chiudere
            </span>
          </div>
        </div>,
        globalThis.document.body
      )}
    </div>
  );
}
