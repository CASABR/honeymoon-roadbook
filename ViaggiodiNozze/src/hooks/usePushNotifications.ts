import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PUSH_PREFERENCES,
  checkPushOnServer,
  clearStoredPushRegistration,
  detectDeviceTimeZoneChange,
  readStoredPushRegistration,
  registerPushOnServer,
  sendPushTestOnServer,
  syncPushRemindersFromStorage,
  unregisterPushOnServer,
  type PushPreferences,
} from '../services/pushNotificationService';
import { PUSH_VAPID_PUBLIC_KEY } from '../config/freeArchitecture';
import { getTripConfig } from '../utils/tripConfig';

const PUBLIC_VAPID_KEY = PUSH_VAPID_PUBLIC_KEY;

// Finestre di coalescing/TTL per evitare burst di /v1/push/status su mount multipli, focus e cambio visibilità
const ACTIVE_STATUS_TTL_MS = 3 * 60 * 1000;
const PASSIVE_CHECK_MIN_INTERVAL_MS = 10_000;
const SERVER_ERROR_BACKOFF_BASE_MS = 15_000;
const SERVER_ERROR_BACKOFF_MAX_MS = 120_000;
const FOCUS_VISIBILITY_DEBOUNCE_MS = 1_500;

export type PushRegistrationState =
  | 'checking'
  | 'unsupported'
  | 'permission-denied'
  | 'inactive'
  | 'browser-only'
  | 'active'
  | 'server-unavailable'
  | 'error';

interface PushSnapshot {
  isSupported: boolean;
  permission: NotificationPermission;
  browserSubscription: PushSubscription | null;
  state: PushRegistrationState;
  diagnostic: string;
  preferences: PushPreferences;
  isSubscribing: boolean;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  raw.split('').forEach((char, index) => { output[index] = char.charCodeAt(0); });
  return output;
}

async function getReadyRegistration(timeoutMs = 7000): Promise<ServiceWorkerRegistration> {
  let timeoutId: number | undefined;
  return Promise.race([
    navigator.serviceWorker.ready.finally(() => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }),
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('Service Worker non pronto. Ricarica la PWA e riprova.')), timeoutMs);
    }),
  ]);
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

function detectPushSupport(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function createInitialSnapshot(): PushSnapshot {
  return {
    isSupported: detectPushSupport(),
    permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
    browserSubscription: null,
    state: 'checking',
    diagnostic: 'Verifica configurazione in corso…',
    preferences: readStoredPushRegistration()?.preferences || DEFAULT_PUSH_PREFERENCES,
    isSubscribing: false,
  };
}

let snapshot: PushSnapshot = createInitialSnapshot();
const subscribers = new Set<() => void>();
let detachGlobalListeners: (() => void) | null = null;
let inFlightRefresh: Promise<void> | null = null;
let inFlightIsForced = false;
let queuedForcedRefresh = false;
let lastForceStartedAt = 0;
let lastVerifiedKey = '';
let lastVerifiedAt = 0;
let lastPassiveCheckAt = 0;
let lastEventTriggerAt = 0;
let serverBackoffUntil = 0;
let consecutiveServerErrors = 0;

function emitSnapshot(): void {
  subscribers.forEach(listener => listener());
}

function patchSnapshot(partial: Partial<PushSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emitSnapshot();
}

function setState(state: PushRegistrationState): void {
  patchSnapshot({ state });
}

function setDiagnostic(diagnostic: string): void {
  patchSnapshot({ diagnostic });
}

function setPermission(permission: NotificationPermission): void {
  patchSnapshot({ permission });
}

function setBrowserSubscription(browserSubscription: PushSubscription | null): void {
  patchSnapshot({ browserSubscription });
}

function setPreferences(preferences: PushPreferences): void {
  patchSnapshot({ preferences });
}

function setIsSubscribing(isSubscribing: boolean): void {
  patchSnapshot({ isSubscribing });
}

function invalidateStatusCache(): void {
  lastVerifiedKey = '';
  lastVerifiedAt = 0;
  lastPassiveCheckAt = 0;
  serverBackoffUntil = 0;
  consecutiveServerErrors = 0;
}

function isAuthOrMembershipError(error: unknown): boolean {
  const err = error as { status?: number; message?: string } | null;
  if (err?.status === 401 || err?.status === 403) return true;
  if (err?.status === 429 || (typeof err?.status === 'number' && err.status >= 500)) return false;
  const msg = error instanceof Error ? error.message : '';
  return (
    msg.includes('Accesso come Owner') ||
    msg.includes('Non sei autorizzato') ||
    msg.includes('Sessione Firebase non valida') ||
    msg.includes('La sessione attiva non è autorizzata') ||
    msg.includes('Accedi con il tuo account')
  );
}

function isServiceUnavailableError(error: unknown): boolean {
  const err = error as { status?: number; name?: string } | null;
  if (typeof err?.status === 'number') {
    return err.status === 429 || err.status >= 500;
  }
  return err?.name === 'TypeError';
}

function buildVerificationKey(
  tripId: string,
  permission: NotificationPermission,
  subscription: PushSubscription,
  subscriberId: string,
): string {
  return `${tripId}|${permission}|${subscription.endpoint}|${subscriberId}`;
}

async function executeRefreshStatus(force: boolean): Promise<void> {
  const supported = detectPushSupport();
  if (supported !== snapshot.isSupported) {
    patchSnapshot({ isSupported: supported });
  }
  if (!supported) {
    setState('unsupported');
    setDiagnostic('Push API non disponibile in questo browser.');
    return;
  }

  const currentPermission = Notification.permission;
  setPermission(currentPermission);
  if (currentPermission === 'denied') {
    const stored = readStoredPushRegistration();
    if (stored) {
      try {
        await unregisterPushOnServer(stored.subscriberId);
        clearStoredPushRegistration();
      } catch {}
    }
    lastVerifiedKey = '';
    lastVerifiedAt = 0;
    setBrowserSubscription(null);
    setState('permission-denied');
    setDiagnostic('Permesso revocato nelle impostazioni del dispositivo.');
    return;
  }

  const now = Date.now();
  if (!force && now - lastPassiveCheckAt < PASSIVE_CHECK_MIN_INTERVAL_MS && lastPassiveCheckAt > 0) {
    return;
  }

  try {
    const registration = await getReadyRegistration();
    const subscription = await registration.pushManager.getSubscription();
    setBrowserSubscription(subscription);
    if (!subscription) {
      lastVerifiedKey = '';
      lastVerifiedAt = 0;
      lastPassiveCheckAt = Date.now();
      setState('inactive');
      setDiagnostic('Nessuna subscription presente nel browser.');
      return;
    }

    const previous = readStoredPushRegistration();
    if (!previous) {
      lastVerifiedKey = '';
      lastVerifiedAt = 0;
      lastPassiveCheckAt = Date.now();
      setState('browser-only');
      setDiagnostic('Subscription browser presente, ma non confermata dal server.');
      return;
    }

    const activeTripId = getTripConfig()?.id?.trim() || '0000';
    if (previous.tripId && previous.tripId !== activeTripId) {
      lastVerifiedKey = '';
      lastVerifiedAt = 0;
      lastPassiveCheckAt = Date.now();
      setState('browser-only');
      setDiagnostic(`Subscription associata al viaggio ${previous.tripId}. Riattivala per il viaggio ${activeTripId}.`);
      return;
    }

    const cacheKey = buildVerificationKey(activeTripId, currentPermission, subscription, previous.subscriberId);
    if (
      !force &&
      snapshot.state === 'active' &&
      lastVerifiedKey === cacheKey &&
      Date.now() - lastVerifiedAt < ACTIVE_STATUS_TTL_MS
    ) {
      return;
    }

    if (!force && Date.now() < serverBackoffUntil) {
      return;
    }

    lastPassiveCheckAt = Date.now();
    const status = await checkPushOnServer(subscription);
    consecutiveServerErrors = 0;
    serverBackoffUntil = 0;

    if (status.active) {
      const nextPreferences = status.preferences || previous.preferences || DEFAULT_PUSH_PREFERENCES;
      lastVerifiedKey = cacheKey;
      lastVerifiedAt = Date.now();
      setPreferences(nextPreferences);
      setState('active');
      setDiagnostic('Subscription confermata dal server per questo viaggio e dispositivo.');
      void syncPushRemindersFromStorage({ preferences: nextPreferences });
    } else {
      lastVerifiedKey = '';
      lastVerifiedAt = 0;
      setState('browser-only');
      setDiagnostic('Il server non riconosce più questa subscription. Riattivala.');
    }
  } catch (error) {
    lastPassiveCheckAt = Date.now();
    lastVerifiedKey = '';
    lastVerifiedAt = 0;
    const msg = error instanceof Error ? error.message : 'Server push non raggiungibile.';
    if (isAuthOrMembershipError(error)) {
      consecutiveServerErrors = 0;
      serverBackoffUntil = 0;
      setState('browser-only');
      setDiagnostic(msg);
    } else {
      consecutiveServerErrors += 1;
      const errRetryAfterMs = Number((error as { retryAfter?: number } | null)?.retryAfter || 0) * 1000;
      const expBackoffMs = Math.min(
        SERVER_ERROR_BACKOFF_MAX_MS,
        SERVER_ERROR_BACKOFF_BASE_MS * Math.pow(2, consecutiveServerErrors - 1),
      );
      serverBackoffUntil = Date.now() + Math.max(expBackoffMs, errRetryAfterMs);
      setState('server-unavailable');
      setDiagnostic(msg);
    }
  }
}

async function refreshStatusShared(forceInput?: boolean | { force?: boolean }): Promise<void> {
  const force = typeof forceInput === 'boolean' ? forceInput : Boolean(forceInput?.force);

  if (inFlightRefresh) {
    const isDuplicateForcedBurst = inFlightIsForced && Date.now() - lastForceStartedAt < 250;
    if (force && !isDuplicateForcedBurst) {
      queuedForcedRefresh = true;
    }
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    let runForce = force;
    do {
      queuedForcedRefresh = false;
      inFlightIsForced = runForce;
      if (runForce) lastForceStartedAt = Date.now();
      await executeRefreshStatus(runForce);
      runForce = queuedForcedRefresh;
    } while (runForce);
  })().finally(() => {
    inFlightRefresh = null;
    inFlightIsForced = false;
  });

  return inFlightRefresh;
}

function attachSharedListeners(): void {
  if (detachGlobalListeners || typeof window === 'undefined' || typeof document === 'undefined') return;

  const handleResumeRefresh = () => {
    const now = Date.now();
    if (now - lastEventTriggerAt < FOCUS_VISIBILITY_DEBOUNCE_MS) return;
    lastEventTriggerAt = now;
    const tzCheck = detectDeviceTimeZoneChange();
    if (tzCheck.changed && snapshot.state === 'active') {
      void syncPushRemindersFromStorage({
        force: true,
        preferences: snapshot.preferences,
        recoveryReason: 'device_tz_changed',
      });
    }
    void refreshStatusShared(false);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    handleResumeRefresh();
  };

  const handleTripConfigChanged = () => {
    invalidateStatusCache();
    void refreshStatusShared(true);
  };

  const handleRemindersBackfillTrigger = (event?: Event) => {
    if (event?.type === 'houni_cloud_role_changed') {
      const role = (event as CustomEvent<{ cloudRole?: string }>).detail?.cloudRole;
      if (role !== 'owner' && role !== 'copilota') return;
    }
    if (snapshot.state === 'active') {
      void syncPushRemindersFromStorage({ preferences: snapshot.preferences });
    } else {
      void refreshStatusShared(false);
    }
  };

  window.addEventListener('focus', handleResumeRefresh);
  window.addEventListener('trip_config_changed', handleTripConfigChanged);
  window.addEventListener('roadbook_cloud_synced', handleRemindersBackfillTrigger);
  window.addEventListener('houni_cloud_role_changed', handleRemindersBackfillTrigger);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  detachGlobalListeners = () => {
    window.removeEventListener('focus', handleResumeRefresh);
    window.removeEventListener('trip_config_changed', handleTripConfigChanged);
    window.removeEventListener('roadbook_cloud_synced', handleRemindersBackfillTrigger);
    window.removeEventListener('houni_cloud_role_changed', handleRemindersBackfillTrigger);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    detachGlobalListeners = null;
  };
}

export function usePushNotifications() {
  const [current, setCurrent] = useState<PushSnapshot>(() => snapshot);

  useEffect(() => {
    const sync = () => setCurrent(snapshot);
    subscribers.add(sync);
    sync();

    if (subscribers.size === 1) {
      attachSharedListeners();
      void refreshStatusShared(false);
    }

    return () => {
      subscribers.delete(sync);
      if (subscribers.size === 0) {
        detachGlobalListeners?.();
      }
    };
  }, []);

  const refreshStatus = useCallback((options?: boolean | { force?: boolean }) => {
    return refreshStatusShared(options);
  }, []);

  const subscribeToPush = useCallback(async () => {
    const supported = detectPushSupport();
    if (!supported) throw new Error('Notifiche push non supportate in questo browser.');
    if (!PUBLIC_VAPID_KEY) throw new Error('Chiave push pubblica non configurata.');

    setIsSubscribing(true);
    let createdSubscription: PushSubscription | null = null;
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') throw new Error('Permesso notifiche non concesso.');
      const registration = await getReadyRegistration();
      const expectedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !sameApplicationServerKey(subscription, expectedKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
        createdSubscription = subscription;
      }
      const { preferences } = snapshot;
      const stored = await registerPushOnServer(subscription, preferences);
      consecutiveServerErrors = 0;
      serverBackoffUntil = 0;
      lastVerifiedKey = buildVerificationKey(stored.tripId, permissionResult, subscription, stored.subscriberId);
      lastVerifiedAt = Date.now();
      lastPassiveCheckAt = lastVerifiedAt;
      setBrowserSubscription(subscription);
      setState('active');
      setDiagnostic(`Subscription confermata per il viaggio ${stored.tripId}.`);
      void syncPushRemindersFromStorage({ force: true, preferences });
      return subscription;
    } catch (error) {
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => false);
      try {
        const reg = await getReadyRegistration(2000).catch(() => null);
        const existingSub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
        setBrowserSubscription(existingSub);
      } catch {
        setBrowserSubscription(null);
      }
      const isDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
      if (isDenied) {
        setState('permission-denied');
      } else if (isServiceUnavailableError(error)) {
        setState('server-unavailable');
      } else {
        setState('error');
      }
      setDiagnostic(error instanceof Error ? error.message : 'Attivazione push fallita.');
      throw error;
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  const unsubscribeFromPush = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const stored = readStoredPushRegistration();
      if (stored) {
        await unregisterPushOnServer(stored.subscriberId).catch((err) => {
          console.warn('[Push] Errore unregister server non bloccante:', err);
        });
      }
      const registration = detectPushSupport() ? await getReadyRegistration().catch(() => null) : null;
      const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
      if (subscription) await subscription.unsubscribe().catch(() => false);
      clearStoredPushRegistration();
      invalidateStatusCache();
      setBrowserSubscription(null);
      setState('inactive');
      setDiagnostic('Subscription rimossa dal server e dal browser.');
      return true;
    } catch (error) {
      setState('error');
      setDiagnostic(error instanceof Error ? error.message : 'Disattivazione non completata.');
      throw error;
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  const updatePreferences = useCallback(async (next: PushPreferences) => {
    const activeSubscription = snapshot.browserSubscription;
    if (!activeSubscription) throw new Error('Attiva prima le notifiche.');
    setIsSubscribing(true);
    try {
      const stored = await registerPushOnServer(activeSubscription, next);
      lastVerifiedKey = buildVerificationKey(
        stored.tripId,
        typeof Notification === 'undefined' ? snapshot.permission : Notification.permission,
        activeSubscription,
        stored.subscriberId,
      );
      lastVerifiedAt = Date.now();
      setPreferences(next);
      setState('active');
      setDiagnostic('Preferenze e promemoria confermati dal server.');
      void syncPushRemindersFromStorage({ force: true, preferences: next });
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    const stored = readStoredPushRegistration();
    if (snapshot.state !== 'active' || !stored) throw new Error('Subscription non attiva sul server.');
    return sendPushTestOnServer(stored.subscriberId);
  }, []);

  return {
    isSupported: current.isSupported,
    permission: current.permission,
    subscription: current.state === 'active' ? current.browserSubscription : null,
    browserSubscription: current.browserSubscription,
    state: current.state,
    diagnostic: current.diagnostic,
    preferences: current.preferences,
    isSubscribing: current.isSubscribing,
    subscribeToPush,
    unsubscribeFromPush,
    updatePreferences,
    sendTestNotification,
    refreshStatus,
  };
}
