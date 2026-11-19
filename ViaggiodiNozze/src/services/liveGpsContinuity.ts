import { useEffect, useState } from 'react';
import {
  describeLiveGpsStartError,
  liveGpsService,
  type LiveGpsLease,
} from './liveGpsService';
import {
  getSavedLiveLocation,
  updateRealLocation,
  type GeolocationState,
} from './geolocationService';
import { persistDeviceSession } from '../utils/deviceSession';
import type { CloudRole } from '../utils/useAuthIdentity';

const SHARING_ENABLED_PREFIX = 'hounigo_live_sharing_enabled_';
const SHARING_PAUSED_PREFIX = 'hounigo_live_sharing_paused_';
const SHARING_STOPPED_PREFIX = 'hounigo_live_sharing_stopped_';
const BROWSER_GEO_GRANTED_PREFIX = 'hounigo_live_browser_geo_granted_';
const LAST_KNOWN_LOC_PREFIX = 'hounigo_live_last_known_loc_';

const MIN_WATCH_PUBLISH_INTERVAL_MS = 16_000;
const MIN_RESUME_LOCATION_INTERVAL_MS = 12_000;
const OPTIMISTIC_LEASE_HOURS = 18;

export const LIVE_GPS_CONTINUITY_SYNC_EVENT = 'hounigo_gps_continuity_sync';

export interface LiveGpsContinuityState {
  tripId: string | null;
  currentUid: string | null;
  cloudRole: CloudRole;
  remoteGpsLease: LiveGpsLease | null;
  leaseLoaded: boolean;
  activeWatchId: number | null;
  gpsError: string | null;
  gpsFeedback: string | null;
  liveGpsState: GeolocationState | null;
  lastPublishedAt: number;
}

export interface ContinuityDecisionInput {
  tripId: string | null;
  currentUid: string | null;
  cloudRole: CloudRole;
  isExternalLive?: boolean;
  isVisible: boolean;
  isOnline: boolean;
  hasGeolocation: boolean;
  leaseLoaded: boolean;
  remoteGpsLease: LiveGpsLease | null;
  deviceId: string;
  sharingEnabled: boolean;
  sharingPaused: boolean;
  sharingStopped: boolean;
  nowTs?: number;
}

export interface ContinuityDecision {
  shouldRun: boolean;
  shouldClearWatcher: boolean;
  needsLeaseRenewal: boolean;
  reason:
    | 'ready'
    | 'no_session_or_external'
    | 'role_checking'
    | 'unauthorized_role'
    | 'lease_loading'
    | 'stopped'
    | 'paused'
    | 'not_opted_in'
    | 'delegated_to_other_user'
    | 'held_by_other_device'
    | 'copilota_without_active_lease'
    | 'no_geolocation'
    | 'not_visible'
    | 'offline';
}

export interface UseLiveGpsContinuityOptions {
  enabled: boolean;
  tripId: string | null;
  currentUid: string | null;
  cloudRole: CloudRole;
  isExternalLive?: boolean;
}

let activeWatchId: number | null = null;
let activeWatchTripId: string | null = null;
let lastPublishAt = 0;
let lastResumeAttemptAt = 0;
let inFlightResumePromise: Promise<boolean> | null = null;
const locationContextByTrip = new Map<string, { city?: string; country?: string }>();
const sessionPromptAttemptedTrips = new Set<string>();

let continuityState: LiveGpsContinuityState = {
  tripId: null,
  currentUid: null,
  cloudRole: 'checking',
  remoteGpsLease: null,
  leaseLoaded: false,
  activeWatchId: null,
  gpsError: null,
  gpsFeedback: null,
  liveGpsState: typeof window !== 'undefined' ? getSavedLiveLocation() : null,
  lastPublishedAt: 0,
};

const stateListeners = new Set<(snapshot: LiveGpsContinuityState) => void>();

interface ActiveCoordinator {
  key: string;
  tripId: string;
  currentUid: string;
  cloudRole: CloudRole;
  refCount: number;
  cleanup: () => void;
}

let activeCoordinator: ActiveCoordinator | null = null;

function safeGetStorage(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignora errori di quota o browser privati
  }
}

function safeRemoveStorage(key: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignora errori storage
  }
}

function emitStateUpdate(patch: Partial<LiveGpsContinuityState>): void {
  continuityState = { ...continuityState, ...patch };
  stateListeners.forEach((listener) => {
    try {
      listener(continuityState);
    } catch {
      // Non propagare errori dei subscriber UI
    }
  });
}

export function getLiveGpsContinuitySnapshot(): LiveGpsContinuityState {
  return continuityState;
}

export function getActiveGpsWatchId(): number | null {
  return activeWatchId;
}

export function readSharingFlags(tripId: string): {
  sharingEnabled: boolean;
  sharingPaused: boolean;
  sharingStopped: boolean;
  browserGeoGranted: boolean;
  browserGeoDeniedExplicitly: boolean;
} {
  const geoRaw = safeGetStorage(`${BROWSER_GEO_GRANTED_PREFIX}${tripId}`);
  return {
    sharingEnabled: safeGetStorage(`${SHARING_ENABLED_PREFIX}${tripId}`) === 'true',
    sharingPaused: safeGetStorage(`${SHARING_PAUSED_PREFIX}${tripId}`) === 'true',
    sharingStopped: safeGetStorage(`${SHARING_STOPPED_PREFIX}${tripId}`) === 'true',
    browserGeoGranted: geoRaw === 'true',
    browserGeoDeniedExplicitly: geoRaw === 'false',
  };
}

export function markSharingOptedIn(tripId: string): void {
  sessionPromptAttemptedTrips.delete(tripId);
  safeSetStorage(`${SHARING_ENABLED_PREFIX}${tripId}`, 'true');
  safeRemoveStorage(`${SHARING_PAUSED_PREFIX}${tripId}`);
  safeRemoveStorage(`${SHARING_STOPPED_PREFIX}${tripId}`);
  safeSetStorage(`${BROWSER_GEO_GRANTED_PREFIX}${tripId}`, 'true');
}

export function markSharingPaused(tripId: string): void {
  safeSetStorage(`${SHARING_PAUSED_PREFIX}${tripId}`, 'true');
}

export function markSharingStopped(tripId: string): void {
  sessionPromptAttemptedTrips.delete(tripId);
  safeRemoveStorage(`${SHARING_ENABLED_PREFIX}${tripId}`);
  safeRemoveStorage(`${SHARING_PAUSED_PREFIX}${tripId}`);
  safeSetStorage(`${SHARING_STOPPED_PREFIX}${tripId}`, 'true');
  safeRemoveStorage(`${LAST_KNOWN_LOC_PREFIX}${tripId}`);
}

export function setBrowserGeoPermissionCache(tripId: string, granted: boolean): void {
  if (granted) {
    sessionPromptAttemptedTrips.delete(tripId);
    safeSetStorage(`${BROWSER_GEO_GRANTED_PREFIX}${tripId}`, 'true');
  } else {
    safeSetStorage(`${BROWSER_GEO_GRANTED_PREFIX}${tripId}`, 'false');
  }
}

export function syncOptimisticActiveLease(
  tripId: string,
  holderUid: string,
  holderDeviceId: string,
  expiresAt?: Date
): void {
  if (continuityState.tripId && continuityState.tripId !== tripId) return;
  const now = new Date();
  const nextLease: LiveGpsLease = {
    holderUid,
    holderDeviceId,
    status: 'active',
    updatedAt: now,
    expiresAt:
      expiresAt && expiresAt.getTime() > Date.now()
        ? expiresAt
        : new Date(Date.now() + OPTIMISTIC_LEASE_HOURS * 60 * 60 * 1000),
  };
  emitStateUpdate({
    tripId,
    remoteGpsLease: nextLease,
    leaseLoaded: true,
    gpsError: null,
  });
}

export function clearSessionGeoPromptAttempt(tripId?: string): void {
  if (tripId) {
    sessionPromptAttemptedTrips.delete(tripId);
  } else {
    sessionPromptAttemptedTrips.clear();
  }
}

export function setTripLocationContext(
  tripId: string,
  context: { city?: string; country?: string }
): void {
  locationContextByTrip.set(tripId, {
    city: context.city || '',
    country: context.country || '',
  });
}

export function syncPublishedGpsTimestamp(timestamp: number): void {
  lastPublishAt = timestamp;
  emitStateUpdate({ lastPublishedAt: timestamp });
}

export function setContinuityLiveGpsState(state: GeolocationState | null): void {
  emitStateUpdate({ liveGpsState: state });
}

export function setContinuityGpsFeedback(feedback: string | null): void {
  emitStateUpdate({ gpsFeedback: feedback });
}

export function setContinuityGpsError(error: string | null): void {
  emitStateUpdate({ gpsError: error });
}

/**
 * Determina in modo deterministico se questo dispositivo deve trasmettere o fermare il GPS LIVE.
 * Rispetta consenso esplicito, Pausa/Stop, delega al Copilota, device autorizzato,
 * scadenza lease e visibilità/connettività dell'app.
 */
export function evaluateLiveGpsContinuityDecision(
  input: ContinuityDecisionInput
): ContinuityDecision {
  const {
    tripId,
    currentUid,
    cloudRole,
    isExternalLive = false,
    isVisible,
    isOnline,
    hasGeolocation,
    leaseLoaded,
    remoteGpsLease,
    deviceId,
    sharingEnabled,
    sharingPaused,
    sharingStopped,
    nowTs = Date.now(),
  } = input;

  if (!tripId || !currentUid || isExternalLive) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'no_session_or_external',
    };
  }

  if (cloudRole === 'checking') {
    return {
      shouldRun: false,
      shouldClearWatcher: false,
      needsLeaseRenewal: false,
      reason: 'role_checking',
    };
  }

  if (cloudRole !== 'owner' && cloudRole !== 'copilota') {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'unauthorized_role',
    };
  }

  if (!leaseLoaded) {
    return {
      shouldRun: false,
      shouldClearWatcher: false,
      needsLeaseRenewal: false,
      reason: 'lease_loading',
    };
  }

  if (remoteGpsLease?.status === 'stopped' || sharingStopped) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'stopped',
    };
  }

  if (remoteGpsLease?.status === 'paused' || sharingPaused) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'paused',
    };
  }

  if (!sharingEnabled) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'not_opted_in',
    };
  }

  if (remoteGpsLease?.holderUid && remoteGpsLease.holderUid !== currentUid) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'delegated_to_other_user',
    };
  }

  if (
    remoteGpsLease?.holderUid === currentUid &&
    remoteGpsLease.holderDeviceId &&
    remoteGpsLease.holderDeviceId !== deviceId &&
    remoteGpsLease.holderDeviceId !== `delegated_pending_${currentUid}`
  ) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'held_by_other_device',
    };
  }

  const leaseNotExpired = Boolean(
    remoteGpsLease && remoteGpsLease.expiresAt.getTime() > nowTs
  );
  const leaseIsActive = Boolean(remoteGpsLease?.status === 'active' && leaseNotExpired);
  const isOwner = cloudRole === 'owner';
  const isCopilota = cloudRole === 'copilota';

  if (
    isCopilota &&
    (!leaseIsActive ||
      !remoteGpsLease ||
      remoteGpsLease.holderUid !== currentUid ||
      remoteGpsLease.holderDeviceId !== deviceId)
  ) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'copilota_without_active_lease',
    };
  }

  const needsLeaseRenewal =
    isOwner &&
    (!leaseIsActive ||
      remoteGpsLease?.holderUid !== currentUid ||
      remoteGpsLease?.holderDeviceId !== deviceId);

  if (!hasGeolocation) {
    return {
      shouldRun: false,
      shouldClearWatcher: true,
      needsLeaseRenewal: false,
      reason: 'no_geolocation',
    };
  }

  if (!isVisible) {
    return {
      shouldRun: false,
      shouldClearWatcher: false,
      needsLeaseRenewal,
      reason: 'not_visible',
    };
  }

  if (!isOnline) {
    return {
      shouldRun: false,
      shouldClearWatcher: false,
      needsLeaseRenewal,
      reason: 'offline',
    };
  }

  return {
    shouldRun: true,
    shouldClearWatcher: false,
    needsLeaseRenewal,
    reason: 'ready',
  };
}

export type BrowserGeolocationPermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported';

export interface BrowserGeolocationPermissionReport {
  state: BrowserGeolocationPermissionState;
  canResume: boolean;
}

async function queryRawBrowserGeolocationPermission(): Promise<BrowserGeolocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'denied';
  if (navigator.permissions?.query) {
    try {
      const perm = await navigator.permissions.query({
        name: 'geolocation' as PermissionName,
      });
      if (perm.state === 'granted' || perm.state === 'prompt' || perm.state === 'denied') {
        return perm.state;
      }
    } catch {
      // Alcuni browser legacy o WebKit rigettano permissions.query su geolocation
    }
  }
  return 'unsupported';
}

/**
 * Distingue in modo rigoroso permesso OS ('granted' | 'prompt' | 'denied' | 'unsupported')
 * e consenso precedentemente salvato per questo viaggio:
 * - 'denied' (o rifiuto esplicito in cache): blocca sempre qualsiasi chiamata GPS.
 * - 'granted': ripresa silenziosa garantita.
 * - 'prompt' (tipico riapertura PWA iOS): consente un solo tentativo per sessione solo se
 *   la condivisione e il consenso browser erano già attivi prima della chiusura.
 */
export async function inspectBrowserGeolocationPermission(
  tripId: string,
  options: { hasActiveSameDeviceLease?: boolean } = {}
): Promise<BrowserGeolocationPermissionReport> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { state: 'denied', canResume: false };
  }

  const rawState = await queryRawBrowserGeolocationPermission();
  const flags = readSharingFlags(tripId);

  if (rawState === 'denied') {
    setBrowserGeoPermissionCache(tripId, false);
    return { state: 'denied', canResume: false };
  }

  if (rawState === 'granted') {
    setBrowserGeoPermissionCache(tripId, true);
    return { state: 'granted', canResume: true };
  }

  if (flags.browserGeoDeniedExplicitly) {
    return { state: rawState, canResume: false };
  }

  const hasPriorConsent =
    flags.browserGeoGranted ||
    (flags.sharingEnabled &&
      !flags.sharingPaused &&
      !flags.sharingStopped &&
      Boolean(options.hasActiveSameDeviceLease));

  if (!hasPriorConsent) {
    return { state: rawState, canResume: false };
  }

  if (rawState === 'prompt' && sessionPromptAttemptedTrips.has(tripId)) {
    return { state: 'prompt', canResume: false };
  }

  return { state: rawState, canResume: true };
}

/**
 * Compatibilità: verifica se il permesso di geolocalizzazione del browser risulta concesso.
 * Ritorna false su 'denied' o 'prompt' privo di conferma.
 */
export async function hasGrantedBrowserGeolocationPermission(
  tripId: string
): Promise<boolean> {
  const report = await inspectBrowserGeolocationPermission(tripId);
  return report.state === 'granted' || (report.state === 'unsupported' && report.canResume);
}

/**
 * Arresta il watcher GPS singleton, opzionalmente solo se associato a tripId.
 */
export function clearSingleGpsWatcher(tripId?: string): void {
  if (activeWatchId === null) return;
  if (tripId && activeWatchTripId && activeWatchTripId !== tripId) return;

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      navigator.geolocation.clearWatch(activeWatchId);
    } catch {
      // Ignora eventuali errori di cleanup del browser
    }
  }
  activeWatchId = null;
  activeWatchTripId = null;
  emitStateUpdate({ activeWatchId: null });
}

async function publishBrowserPosition(
  tripId: string,
  position: GeolocationPosition
): Promise<void> {
  if (!tripId) return;
  const now = Date.now();
  if (now - lastPublishAt < MIN_WATCH_PUBLISH_INTERVAL_MS) return;

  const snap = continuityState;
  const deviceId = liveGpsService.getDeviceId();
  const ownsActiveLease =
    snap.tripId === tripId &&
    (snap.cloudRole === 'owner' || snap.cloudRole === 'copilota') &&
    snap.remoteGpsLease?.status === 'active' &&
    Boolean(snap.currentUid) &&
    snap.remoteGpsLease.holderUid === snap.currentUid &&
    snap.remoteGpsLease.holderDeviceId === deviceId &&
    snap.remoteGpsLease.expiresAt.getTime() > now;

  if (!ownsActiveLease) {
    clearSingleGpsWatcher(tripId);
    return;
  }

  lastPublishAt = now;
  markBrowserGeoPermissionCache(tripId, true);
  const ctx = locationContextByTrip.get(tripId);

  try {
    await liveGpsService.publishLocation(tripId, {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      city: ctx?.city || '',
      country: ctx?.country || '',
    });
    emitStateUpdate({ gpsError: null, lastPublishedAt: now });
  } catch (err) {
    console.warn('[LiveGpsContinuity] Errore pubblicazione periodica GPS:', err);
  }
}

function markBrowserGeoPermissionCache(tripId: string, granted: boolean): void {
  setBrowserGeoPermissionCache(tripId, granted);
}

/**
 * Avvia o riusa l'unico watchPosition attivo per questo tripId (massimo 1 watcher globale).
 */
export function startSingleGpsWatcher(tripId: string): number | null {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    emitStateUpdate({ gpsError: 'GPS non disponibile su questo browser.' });
    return null;
  }

  if (activeWatchId !== null && activeWatchTripId === tripId) {
    return activeWatchId;
  }

  if (activeWatchId !== null) {
    clearSingleGpsWatcher();
  }

  const id = navigator.geolocation.watchPosition(
    (position) => {
      void publishBrowserPosition(tripId, position);
    },
    (error) => {
      if (error.code === 1) {
        setBrowserGeoPermissionCache(tripId, false);
        clearSingleGpsWatcher(tripId);
      }
      emitStateUpdate({ gpsError: describeLiveGpsStartError(error) });
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
  );

  activeWatchId = id;
  activeWatchTripId = tripId;
  emitStateUpdate({ activeWatchId: id });
  return id;
}

function evaluateCurrentRuntimeDecision(params: {
  tripId: string;
  currentUid: string | null;
  cloudRole: CloudRole;
  isExternalLive: boolean;
  remoteGpsLease: LiveGpsLease | null;
  leaseLoaded: boolean;
}): ContinuityDecision {
  const { tripId, currentUid, cloudRole, isExternalLive, remoteGpsLease, leaseLoaded } = params;
  const flags = readSharingFlags(tripId);
  return evaluateLiveGpsContinuityDecision({
    tripId,
    currentUid,
    cloudRole,
    isExternalLive,
    isVisible: typeof document !== 'undefined' && document.visibilityState === 'visible',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    hasGeolocation: typeof navigator !== 'undefined' && Boolean(navigator.geolocation),
    leaseLoaded,
    remoteGpsLease,
    deviceId: liveGpsService.getDeviceId(),
    sharingEnabled: flags.sharingEnabled,
    sharingPaused: flags.sharingPaused,
    sharingStopped: flags.sharingStopped,
  });
}

/**
 * Valuta se riprendere il GPS LIVE in background/riapertura PWA senza duplicare watcher
 * né provocare popup OS se il permesso non è già concesso.
 */
export async function resumeLiveGpsIfEligible(params?: {
  tripId?: string | null;
  currentUid?: string | null;
  cloudRole?: CloudRole;
  isExternalLive?: boolean;
  remoteGpsLease?: LiveGpsLease | null;
  leaseLoaded?: boolean;
}): Promise<boolean> {
  if (inFlightResumePromise) {
    return inFlightResumePromise;
  }

  const tripId = params?.tripId !== undefined ? params.tripId : continuityState.tripId;
  const currentUid =
    params?.currentUid !== undefined ? params.currentUid : continuityState.currentUid;
  const cloudRole =
    params?.cloudRole !== undefined ? params.cloudRole : continuityState.cloudRole;
  const remoteGpsLease =
    params?.remoteGpsLease !== undefined
      ? params.remoteGpsLease
      : continuityState.remoteGpsLease;
  const leaseLoaded =
    params?.leaseLoaded !== undefined ? params.leaseLoaded : continuityState.leaseLoaded;
  const isExternalLive = params?.isExternalLive ?? false;

  if (!tripId) {
    clearSingleGpsWatcher();
    return false;
  }

  const decision = evaluateCurrentRuntimeDecision({
    tripId,
    currentUid,
    cloudRole,
    isExternalLive,
    remoteGpsLease,
    leaseLoaded,
  });

  if (decision.shouldClearWatcher) {
    clearSingleGpsWatcher(tripId);
    return false;
  }

  if (!decision.shouldRun || !currentUid) {
    return false;
  }

  const nowTs = Date.now();
  const hasWatcher = activeWatchId !== null && activeWatchTripId === tripId;
  if (
    hasWatcher &&
    !decision.needsLeaseRenewal &&
    nowTs - Math.max(lastPublishAt, lastResumeAttemptAt) < MIN_RESUME_LOCATION_INTERVAL_MS
  ) {
    return true;
  }

  const run = async (): Promise<boolean> => {
    const deviceId = liveGpsService.getDeviceId();
    const hasActiveSameDeviceLease = Boolean(
      remoteGpsLease?.status === 'active' &&
      remoteGpsLease.holderUid === currentUid &&
      remoteGpsLease.holderDeviceId === deviceId
    );
    let permReport: BrowserGeolocationPermissionReport | null = null;
    try {
      permReport = await inspectBrowserGeolocationPermission(tripId, {
        hasActiveSameDeviceLease,
      });
      if (permReport.state === 'denied') {
        clearSingleGpsWatcher(tripId);
        emitStateUpdate({
          gpsError: 'Attiva la posizione nelle impostazioni del browser e riprova.',
        });
        return false;
      }
      if (!permReport.canResume) {
        clearSingleGpsWatcher(tripId);
        return false;
      }

      const preStartSnap = continuityState;
      const preStartDecision = evaluateCurrentRuntimeDecision({
        tripId,
        currentUid,
        cloudRole,
        isExternalLive,
        remoteGpsLease: preStartSnap.tripId === tripId ? preStartSnap.remoteGpsLease : remoteGpsLease,
        leaseLoaded: preStartSnap.tripId === tripId ? preStartSnap.leaseLoaded : leaseLoaded,
      });
      if (!preStartDecision.shouldRun) {
        if (preStartDecision.shouldClearWatcher) clearSingleGpsWatcher(tripId);
        return false;
      }

      const ensureOwnerLeaseActive = async (needsRenewal: boolean) => {
        if (needsRenewal && cloudRole === 'owner') {
          await liveGpsService.assignGuide(tripId, currentUid, deviceId);
          syncOptimisticActiveLease(tripId, currentUid, deviceId);
          persistDeviceSession(tripId, 'guida').catch(() => {});
        }
      };

      // Su iOS WebKit la Permissions API può restituire 'prompt' alla riapertura della PWA:
      // eseguiamo una sola rilevazione standard prima di avviare watchPosition e prima di rinnovare la lease,
      // così un eventuale rifiuto del dialog OS blocca subito senza aggiramenti né loop di popup.
      if (permReport.state !== 'granted') {
        if (permReport.state === 'prompt') {
          sessionPromptAttemptedTrips.add(tripId);
        }
        lastResumeAttemptAt = Date.now();
        const detected = await updateRealLocation({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 15_000,
        });
        const postGeoSnap = continuityState;
        const postDecision = evaluateCurrentRuntimeDecision({
          tripId,
          currentUid,
          cloudRole,
          isExternalLive,
          remoteGpsLease: postGeoSnap.tripId === tripId ? postGeoSnap.remoteGpsLease : remoteGpsLease,
          leaseLoaded: postGeoSnap.tripId === tripId ? postGeoSnap.leaseLoaded : leaseLoaded,
        });
        if (!postDecision.shouldRun) {
          if (postDecision.shouldClearWatcher) clearSingleGpsWatcher(tripId);
          return false;
        }
        setBrowserGeoPermissionCache(tripId, true);
        await ensureOwnerLeaseActive(postDecision.needsLeaseRenewal);
        setTripLocationContext(tripId, {
          city: detected.city,
          country: detected.country,
        });
        emitStateUpdate({ liveGpsState: detected, gpsError: null });
        startSingleGpsWatcher(tripId);
        await liveGpsService.publishLocation(tripId, {
          lat: detected.coords.lat,
          lng: detected.coords.lng,
          accuracy: detected.accuracy,
          city: detected.city,
          country: detected.country,
        });
        syncPublishedGpsTimestamp(Date.now());
        return true;
      }

      await ensureOwnerLeaseActive(preStartDecision.needsLeaseRenewal);
      startSingleGpsWatcher(tripId);

      const elapsedSincePublish = Date.now() - lastPublishAt;
      if (elapsedSincePublish >= MIN_RESUME_LOCATION_INTERVAL_MS) {
        lastResumeAttemptAt = Date.now();
        const detected = await updateRealLocation({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 15_000,
        });
        const postGeoSnap = continuityState;
        const postDecision = evaluateCurrentRuntimeDecision({
          tripId,
          currentUid,
          cloudRole,
          isExternalLive,
          remoteGpsLease: postGeoSnap.tripId === tripId ? postGeoSnap.remoteGpsLease : remoteGpsLease,
          leaseLoaded: postGeoSnap.tripId === tripId ? postGeoSnap.leaseLoaded : leaseLoaded,
        });
        if (!postDecision.shouldRun) {
          if (postDecision.shouldClearWatcher) clearSingleGpsWatcher(tripId);
          return false;
        }
        setTripLocationContext(tripId, {
          city: detected.city,
          country: detected.country,
        });
        emitStateUpdate({ liveGpsState: detected, gpsError: null });
        await liveGpsService.publishLocation(tripId, {
          lat: detected.coords.lat,
          lng: detected.coords.lng,
          accuracy: detected.accuracy,
          city: detected.city,
          country: detected.country,
        });
        syncPublishedGpsTimestamp(Date.now());
      }

      return true;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 1) {
        setBrowserGeoPermissionCache(tripId, false);
        clearSingleGpsWatcher(tripId);
        emitStateUpdate({ gpsError: describeLiveGpsStartError(err) });
      } else if (permReport && permReport.state !== 'granted') {
        const postErrState = await queryRawBrowserGeolocationPermission();
        if (postErrState === 'denied') {
          setBrowserGeoPermissionCache(tripId, false);
          clearSingleGpsWatcher(tripId);
          emitStateUpdate({ gpsError: describeLiveGpsStartError(err) });
        } else if (
          postErrState === 'granted' ||
          (postErrState === 'unsupported' && readSharingFlags(tripId).browserGeoGranted)
        ) {
          const latestSnap = continuityState;
          const postErrDecision = evaluateCurrentRuntimeDecision({
            tripId,
            currentUid,
            cloudRole,
            isExternalLive,
            remoteGpsLease: latestSnap.tripId === tripId ? latestSnap.remoteGpsLease : remoteGpsLease,
            leaseLoaded: latestSnap.tripId === tripId ? latestSnap.leaseLoaded : leaseLoaded,
          });
          if (postErrDecision.shouldRun) {
            if (postErrDecision.needsLeaseRenewal && cloudRole === 'owner') {
              await liveGpsService.assignGuide(tripId, currentUid, deviceId).catch(() => {});
              syncOptimisticActiveLease(tripId, currentUid, deviceId);
            }
            startSingleGpsWatcher(tripId);
            return true;
          }
        }
      }
      console.warn('[LiveGpsContinuity] Auto-resume GPS non riuscito (silenzioso):', err);
      return false;
    } finally {
      inFlightResumePromise = null;
    }
  };

  inFlightResumePromise = run();
  return inFlightResumePromise;
}

function teardownActiveCoordinator(): void {
  if (!activeCoordinator) return;
  const { cleanup, tripId } = activeCoordinator;
  activeCoordinator = null;
  cleanup();
  clearSingleGpsWatcher(tripId);
  emitStateUpdate({
    remoteGpsLease: null,
    leaseLoaded: false,
  });
}

function acquireCoordinator(
  tripId: string,
  currentUid: string,
  cloudRole: CloudRole
): () => void {
  const key = `${tripId}:${currentUid}:${cloudRole}`;

  if (activeCoordinator && activeCoordinator.key === key) {
    activeCoordinator.refCount += 1;
    const retainedKey = key;
    return () => {
      if (activeCoordinator && activeCoordinator.key === retainedKey) {
        activeCoordinator.refCount -= 1;
        if (activeCoordinator.refCount <= 0) {
          teardownActiveCoordinator();
        }
      }
    };
  }

  if (activeCoordinator) {
    teardownActiveCoordinator();
  }

  emitStateUpdate({
    tripId,
    currentUid,
    cloudRole,
    remoteGpsLease: null,
    leaseLoaded: false,
  });

  const unsubscribeLease = liveGpsService.subscribeLease(
    tripId,
    (lease) => {
      emitStateUpdate({
        tripId,
        currentUid,
        cloudRole,
        remoteGpsLease: lease,
        leaseLoaded: true,
      });
      void resumeLiveGpsIfEligible({
        tripId,
        currentUid,
        cloudRole,
        remoteGpsLease: lease,
        leaseLoaded: true,
      });
    },
    (err) => {
      emitStateUpdate({ gpsError: err.message });
    }
  );

  const handleForegroundOrOnline = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void resumeLiveGpsIfEligible();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleForegroundOrOnline);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleForegroundOrOnline);
    window.addEventListener('pageshow', handleForegroundOrOnline);
    window.addEventListener('online', handleForegroundOrOnline);
    window.addEventListener(LIVE_GPS_CONTINUITY_SYNC_EVENT, handleForegroundOrOnline);
  }

  const cleanup = () => {
    unsubscribeLease();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleForegroundOrOnline);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleForegroundOrOnline);
      window.removeEventListener('pageshow', handleForegroundOrOnline);
      window.removeEventListener('online', handleForegroundOrOnline);
      window.removeEventListener(LIVE_GPS_CONTINUITY_SYNC_EVENT, handleForegroundOrOnline);
    }
  };

  activeCoordinator = {
    key,
    tripId,
    currentUid,
    cloudRole,
    refCount: 1,
    cleanup,
  };

  return () => {
    if (activeCoordinator && activeCoordinator.key === key) {
      activeCoordinator.refCount -= 1;
      if (activeCoordinator.refCount <= 0) {
        teardownActiveCoordinator();
      }
    }
  };
}

/**
 * Hook condiviso per mantenere la continuità del GPS LIVE tra tutte le schermate
 * e alla riapertura della PWA senza duplicare watcher o sottoscrizioni Firestore.
 */
export function useLiveGpsContinuity(
  options: UseLiveGpsContinuityOptions
): LiveGpsContinuityState {
  const { enabled, tripId, currentUid, cloudRole, isExternalLive = false } = options;
  const [snapshot, setSnapshot] = useState<LiveGpsContinuityState>(() => continuityState);

  useEffect(() => {
    const listener = (next: LiveGpsContinuityState) => {
      setSnapshot(next);
    };
    stateListeners.add(listener);
    setSnapshot(continuityState);
    return () => {
      stateListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const isAuthorizedRole = cloudRole === 'owner' || cloudRole === 'copilota';
    if (!enabled || isExternalLive || !tripId || !currentUid || !isAuthorizedRole) {
      if (
        cloudRole !== 'checking' ||
        !enabled ||
        isExternalLive ||
        !tripId ||
        !currentUid
      ) {
        clearSingleGpsWatcher(tripId || undefined);
      }
      return;
    }

    const release = acquireCoordinator(tripId, currentUid, cloudRole);
    return () => {
      release();
    };
  }, [enabled, isExternalLive, tripId, currentUid, cloudRole]);

  return snapshot;
}
