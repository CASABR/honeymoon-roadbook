import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import { getOrCreateDeviceId } from '../utils/deviceSession';
import { getTripConfig } from '../utils/tripConfig';
import { BACKGROUND_PUSH_ENABLED, PUSH_WORKER_URL } from '../config/freeArchitecture';
import { buildClientPushReminders } from '../utils/pushReminders';
import { isCloudAuthorized } from '../utils/useAuthIdentity';

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

/**
 * Garantisce la presenza di un utente Firebase autenticato per le notifiche push.
 * Attende sempre il ripristino della sessione persistente (Google, email, token)
 * e NON sostituisce mai un'identità esistente con un accesso anonimo effimero.
 */
async function ensurePushAuthUser() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return auth.currentUser;
  }

  // 1. Attendi il completamento del ripristino auth locale da IndexedDB (PWA / iOS WebKit)
  if (typeof (auth as any)?.authStateReady === 'function') {
    try {
      await (auth as any).authStateReady();
    } catch { }
  }

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return auth.currentUser;
  }

  // 2. Attesa non distruttiva del listener onAuthStateChanged
  await new Promise<void>((resolve) => {
    let resolved = false;
    const unsub = auth.onAuthStateChanged((user: User | null) => {
      if (!resolved && user && !user.isAnonymous) {
        resolved = true;
        unsub();
        resolve();
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve();
      }
    }, 3000);
  });

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return auth.currentUser;
  }

  // 3. Se è presente un utente la cui identità coincide con l'autorizzazione verificata locale del viaggio:
  if (auth.currentUser) {
    const tripConfig = getTripConfig();
    const tripId = tripConfig?.id?.trim() || '0000';
    const verified = (await import('../utils/useAuthIdentity')).getVerifiedTripAuth(tripId);
    if (verified && verified.uid === auth.currentUser.uid && ['owner', 'copilota'].includes(verified.role)) {
      return auth.currentUser;
    }
  }

  // 4. Se nessun account autorizzato è presente, solleva errore diagnostico dettagliato
  if (!auth.currentUser) {
    throw new Error('Accedi con il tuo account Organizzatore o Copilota (Google o Email) per attivare le notifiche del viaggio.');
  }
  throw new Error('La sessione attiva non è autorizzata come Organizzatore o Copilota del viaggio sul server push.');
}

const PUSH_TEST_COOLDOWN_MS = 30_000;
const PUSH_TEST_STORAGE_KEY = 'hounigo_push_test_last_sent';

export function getPushTestRemainingSeconds(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  const raw = sessionStorage.getItem(PUSH_TEST_STORAGE_KEY);
  if (!raw) return 0;
  const elapsed = Date.now() - Number(raw);
  if (elapsed >= PUSH_TEST_COOLDOWN_MS || isNaN(elapsed)) {
    sessionStorage.removeItem(PUSH_TEST_STORAGE_KEY);
    return 0;
  }
  return Math.max(1, Math.ceil((PUSH_TEST_COOLDOWN_MS - elapsed) / 1000));
}

export function recordPushTestSent(remainingSeconds?: number): void {
  if (typeof sessionStorage === 'undefined') return;
  const targetMs = (typeof remainingSeconds === 'number' && remainingSeconds > 0)
    ? remainingSeconds * 1000
    : PUSH_TEST_COOLDOWN_MS;
  const effectiveTimestamp = Date.now() - (PUSH_TEST_COOLDOWN_MS - targetMs);
  sessionStorage.setItem(PUSH_TEST_STORAGE_KEY, String(effectiveTimestamp));
}

async function callPush<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!BACKGROUND_PUSH_ENABLED || !PUSH_WORKER_URL) throw new Error('Servizio push gratuito non ancora attivo.');
  const user = await ensurePushAuthUser();
  const token = await user.getIdToken();
  const response = await fetch(`${PUSH_WORKER_URL}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; retryAfter?: number };
  if (!response.ok) {
    const rawError = result.error || 'Servizio push non disponibile.';
    let errMessage = rawError;
    const isRateLimited = response.status === 429 || rawError === 'PUSH_RATE_LIMITED' || rawError.includes('RATE_LIMITED');
    const retrySeconds = result.retryAfter || 30;
    if (isRateLimited) {
      errMessage = `Limite anti-spam attivo: attendi ancora ${retrySeconds} secondi prima di richiedere un'altra notifica di prova.`;
    }
    const err: any = new Error(errMessage);
    err.code = isRateLimited ? 'PUSH_RATE_LIMITED' : (result.error || 'PUSH_ERROR');
    err.retryAfter = retrySeconds;
    throw err;
  }
  return result;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Crittografia browser non disponibile.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getPushIdentity(endpoint?: string) {
  const user = await ensurePushAuthUser();
  const uid = user.uid;
  const tripConfig = getTripConfig();
  const tripId = tripConfig?.id?.trim() || '0000';
  const deviceId = getOrCreateDeviceId();
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
  // Non consentire broadcast di notifiche di mutazione a viewer, ospiti sola lettura o non autorizzati
  if (!isCloudAuthorized(input.tripId)) {
    console.warn(`[PushService] Mutazione push ignorata per ${input.entityType}: permessi di scrittura assenti per viaggio ${input.tripId}.`);
    return;
  }
  const reminders = input.action === 'save' && input.data
    ? buildClientPushReminders(input.entityType, input.data)
    : [];
  await callPush('mutation', { ...input, reminders });
}
