import { httpsCallable } from 'firebase/functions';
import { auth, cloudFunctions } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';
import { getTripConfig } from '../utils/tripConfig';

export interface PushPreferences {
  transports: boolean;
  activities: boolean;
  lodging: boolean;
  deadlines: boolean;
  collaboration: boolean;
  reminderMinutes: number;
}

export interface StoredPushRegistration {
  subscriberId: string;
  tripId: string;
  deviceId: string;
  uid: string;
  endpointHash: string;
  preferences: PushPreferences;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  transports: true,
  activities: true,
  lodging: true,
  deadlines: true,
  collaboration: true,
  reminderMinutes: 60,
};

const STORAGE_KEY = 'hounigo_push_registration_v2';

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Crittografia browser non disponibile.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getPushIdentity(endpoint?: string) {
  const uid = auth.currentUser?.uid;
  const tripId = getTripConfig()?.id?.trim();
  const deviceId = getOrCreateDeviceId();
  if (!uid) throw new Error('Accedi al tuo account prima di attivare le notifiche.');
  if (!tripId) throw new Error('Seleziona un viaggio prima di attivare le notifiche.');
  const subscriberId = (await sha256(`${uid}\n${tripId}\n${deviceId}`)).slice(0, 48);
  return {
    uid,
    tripId,
    deviceId,
    subscriberId,
    endpointHash: endpoint ? await sha256(endpoint) : '',
  };
}

export function readStoredPushRegistration(): StoredPushRegistration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPushRegistration : null;
  } catch {
    return null;
  }
}

export function saveStoredPushRegistration(value: StoredPushRegistration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredPushRegistration(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function registerPushOnServer(subscription: PushSubscription, preferences: PushPreferences) {
  if (!cloudFunctions) throw new Error('Servizio push server non configurato.');
  const identity = await getPushIdentity(subscription.endpoint);
  const previous = readStoredPushRegistration();
  const callable = httpsCallable(cloudFunctions, 'registerPushSubscription');
  const response = await callable({
    tripId: identity.tripId,
    deviceId: identity.deviceId,
    subscriberId: identity.subscriberId,
    previousSubscriberId: previous?.subscriberId || null,
    subscription: subscription.toJSON(),
    preferences,
    userAgent: navigator.userAgent,
  });
  const data = response.data as { active?: boolean };
  if (data.active !== true) throw new Error('Il server non ha confermato la subscription.');
  const stored: StoredPushRegistration = { ...identity, preferences };
  saveStoredPushRegistration(stored);
  return stored;
}

export async function checkPushOnServer(subscription: PushSubscription) {
  if (!cloudFunctions) throw new Error('Servizio push server non configurato.');
  const identity = await getPushIdentity(subscription.endpoint);
  const callable = httpsCallable(cloudFunctions, 'getPushRegistrationStatus');
  const response = await callable(identity);
  return { identity, ...(response.data as { active: boolean; reason?: string; preferences?: PushPreferences | null }) };
}

export async function unregisterPushOnServer(subscriberId: string): Promise<void> {
  if (!cloudFunctions) throw new Error('Servizio push server non configurato.');
  const callable = httpsCallable(cloudFunctions, 'unregisterPushSubscription');
  await callable({ subscriberId });
}

export async function sendPushTestOnServer(subscriberId: string) {
  if (!cloudFunctions) throw new Error('Servizio push server non configurato.');
  const callable = httpsCallable(cloudFunctions, 'sendTestPush');
  const response = await callable({ subscriberId });
  return response.data as { accepted: boolean; deliveryConfirmed: false; status: string };
}

export async function recordPushMutation(input: {
  tripId: string;
  entityType: string;
  action: 'save' | 'delete';
  entityId: string;
  mutationId: string;
}): Promise<void> {
  if (!cloudFunctions || !auth.currentUser) return;
  const callable = httpsCallable(cloudFunctions, 'recordPushMutation');
  await callable(input);
}
