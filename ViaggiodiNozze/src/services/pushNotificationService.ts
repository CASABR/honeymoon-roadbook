import { auth } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';
import { getTripConfig } from '../utils/tripConfig';
import { BACKGROUND_PUSH_ENABLED, PUSH_WORKER_URL } from '../config/freeArchitecture';
import { buildClientPushReminders } from '../utils/pushReminders';

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
const COLLABORATION_ENTITIES = new Set([
  'trasporto', 'trasporti', 'attivita', 'activity', 'alloggio', 'alloggi',
  'tappa', 'tappe', 'ristorante', 'ristoranti', 'shopping', 'note', 'nota', 'documenti'
]);

async function callPush<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!BACKGROUND_PUSH_ENABLED || !PUSH_WORKER_URL) throw new Error('Servizio push gratuito non ancora attivo.');
  const user = auth.currentUser;
  if (!user) throw new Error('Accedi al tuo account prima di usare le notifiche.');
  const token = await user.getIdToken();
  const response = await fetch(`${PUSH_WORKER_URL}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Servizio push non disponibile.');
  return result;
}

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
  const identity = await getPushIdentity(subscription.endpoint);
  const previous = readStoredPushRegistration();
  const data = await callPush<{ active?: boolean }>('register', {
    tripId: identity.tripId,
    deviceId: identity.deviceId,
    subscriberId: identity.subscriberId,
    previousSubscriberId: previous?.subscriberId || null,
    subscription: subscription.toJSON(),
    preferences,
    userAgent: navigator.userAgent,
  });
  if (data.active !== true) throw new Error('Il server non ha confermato la subscription.');
  const stored: StoredPushRegistration = { ...identity, preferences };
  saveStoredPushRegistration(stored);
  return stored;
}

export async function checkPushOnServer(subscription: PushSubscription) {
  const identity = await getPushIdentity(subscription.endpoint);
  const data = await callPush<{ active: boolean; reason?: string; preferences?: PushPreferences | null }>('status', identity);
  return { identity, ...data };
}

export async function unregisterPushOnServer(subscriberId: string): Promise<void> {
  const identity = await getPushIdentity();
  await callPush('unregister', { tripId: identity.tripId, subscriberId });
}

export async function sendPushTestOnServer(subscriberId: string) {
  const identity = await getPushIdentity();
  return callPush<{ accepted: boolean; deliveryConfirmed: false; status: string }>('test', {
    tripId: identity.tripId,
    subscriberId,
  });
}

export async function recordPushMutation(input: {
  tripId: string;
  entityType: string;
  action: 'save' | 'delete';
  entityId: string;
  mutationId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!BACKGROUND_PUSH_ENABLED || !auth.currentUser || !COLLABORATION_ENTITIES.has(input.entityType)) return;
  const reminders = input.action === 'save' && input.data
    ? buildClientPushReminders(input.entityType, input.data)
    : [];
  await callPush('mutation', { ...input, reminders });
}
