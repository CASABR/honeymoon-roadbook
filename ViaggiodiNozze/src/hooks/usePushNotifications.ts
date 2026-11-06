import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PUSH_PREFERENCES,
  checkPushOnServer,
  clearStoredPushRegistration,
  readStoredPushRegistration,
  registerPushOnServer,
  sendPushTestOnServer,
  unregisterPushOnServer,
  type PushPreferences,
} from '../services/pushNotificationService';
import { PUSH_VAPID_PUBLIC_KEY } from '../config/freeArchitecture';
import { getTripConfig } from '../utils/tripConfig';

const PUBLIC_VAPID_KEY = PUSH_VAPID_PUBLIC_KEY;

export type PushRegistrationState =
  | 'checking'
  | 'unsupported'
  | 'permission-denied'
  | 'inactive'
  | 'browser-only'
  | 'active'
  | 'server-unavailable'
  | 'error';

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  raw.split('').forEach((char, index) => { output[index] = char.charCodeAt(0); });
  return output;
}

async function getReadyRegistration(timeoutMs = 7000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      window.setTimeout(() => reject(new Error('Service Worker non pronto. Ricarica la PWA e riprova.')), timeoutMs);
    }),
  ]);
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

export function usePushNotifications() {
  const isSupported = useMemo(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, []);
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === 'undefined' ? 'default' : Notification.permission);
  const [browserSubscription, setBrowserSubscription] = useState<PushSubscription | null>(null);
  const [state, setState] = useState<PushRegistrationState>('checking');
  const [diagnostic, setDiagnostic] = useState('Verifica configurazione in corso…');
  const [preferences, setPreferences] = useState<PushPreferences>(() => readStoredPushRegistration()?.preferences || DEFAULT_PUSH_PREFERENCES);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isSupported) {
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
      setBrowserSubscription(null);
      setState('permission-denied');
      setDiagnostic('Permesso revocato nelle impostazioni del dispositivo.');
      return;
    }
    try {
      const registration = await getReadyRegistration();
      const subscription = await registration.pushManager.getSubscription();
      setBrowserSubscription(subscription);
      if (!subscription) {
        setState('inactive');
        setDiagnostic('Nessuna subscription presente nel browser.');
        return;
      }
      const previous = readStoredPushRegistration();
      if (!previous) {
        setState('browser-only');
        setDiagnostic('Subscription browser presente, ma non confermata dal server.');
        return;
      }
      const activeTripId = getTripConfig()?.id?.trim() || '0000';
      if (previous.tripId && previous.tripId !== activeTripId) {
        setState('browser-only');
        setDiagnostic(`Subscription associata al viaggio ${previous.tripId}. Riattivala per il viaggio ${activeTripId}.`);
        return;
      }
      const status = await checkPushOnServer(subscription);
      if (status.active) {
        const nextPreferences = status.preferences || previous.preferences || DEFAULT_PUSH_PREFERENCES;
        setPreferences(nextPreferences);
        setState('active');
        setDiagnostic('Subscription confermata dal server per questo viaggio e dispositivo.');
      } else {
        setState('browser-only');
        setDiagnostic('Il server non riconosce più questa subscription. Riattivala.');
      }
    } catch (error) {
      setState('server-unavailable');
      setDiagnostic(error instanceof Error ? error.message : 'Server push non raggiungibile.');
    }
  }, [isSupported]);

  useEffect(() => {
    void refreshStatus();
    const handleRefresh = () => { void refreshStatus(); };
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('trip_config_changed', handleRefresh);
    document.addEventListener('visibilitychange', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('trip_config_changed', handleRefresh);
      document.removeEventListener('visibilitychange', handleRefresh);
    };
  }, [refreshStatus]);

  const subscribeToPush = useCallback(async () => {
    if (!isSupported) throw new Error('Notifiche push non supportate in questo browser.');
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
      const stored = await registerPushOnServer(subscription, preferences);
      setBrowserSubscription(subscription);
      setState('active');
      setDiagnostic(`Subscription confermata per il viaggio ${stored.tripId}.`);
      return subscription;
    } catch (error) {
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => false);
      setBrowserSubscription(null);
      setState(Notification.permission === 'denied' ? 'permission-denied' : 'error');
      setDiagnostic(error instanceof Error ? error.message : 'Attivazione push fallita.');
      throw error;
    } finally {
      setIsSubscribing(false);
    }
  }, [isSupported, preferences]);

  const unsubscribeFromPush = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const stored = readStoredPushRegistration();
      if (stored) await unregisterPushOnServer(stored.subscriberId);
      const registration = isSupported ? await getReadyRegistration() : null;
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe();
      clearStoredPushRegistration();
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
  }, [isSupported]);

  const updatePreferences = useCallback(async (next: PushPreferences) => {
    if (!browserSubscription) throw new Error('Attiva prima le notifiche.');
    setIsSubscribing(true);
    try {
      await registerPushOnServer(browserSubscription, next);
      setPreferences(next);
      setState('active');
      setDiagnostic('Preferenze e promemoria confermati dal server.');
    } finally {
      setIsSubscribing(false);
    }
  }, [browserSubscription]);

  const sendTestNotification = useCallback(async () => {
    const stored = readStoredPushRegistration();
    if (state !== 'active' || !stored) throw new Error('Subscription non attiva sul server.');
    return sendPushTestOnServer(stored.subscriberId);
  }, [state]);

  return {
    isSupported,
    permission,
    subscription: state === 'active' ? browserSubscription : null,
    browserSubscription,
    state,
    diagnostic,
    preferences,
    isSubscribing,
    subscribeToPush,
    unsubscribeFromPush,
    updatePreferences,
    sendTestNotification,
    refreshStatus,
  };
}
