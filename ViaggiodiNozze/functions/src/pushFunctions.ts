import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import webpush from 'web-push';
import {
  buildDeadlineReminderCandidate,
  buildReminderCandidates,
  containsSensitivePushContent,
  normalizePushPreferences,
  preferenceAllows,
  type PushEntityCollection,
  type PushPreferences,
  type ReminderCandidate,
} from './pushCore';

const vapidPublicKey = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');
const vapidMailto = defineSecret('VAPID_MAILTO');
const PUSH_SECRETS = [vapidPublicKey, vapidPrivateKey, vapidMailto];
const ALLOWED_COLLECTIONS = new Set<PushEntityCollection>(['trasporti', 'attivita', 'alloggi']);
const COLLABORATION_ENTITIES = new Set([
  'giorni', 'attivita', 'activity', 'alloggi', 'alloggio', 'trasporti', 'trasporto',
  'documenti', 'tappe', 'tappa', 'ristoranti', 'ristorante', 'shopping', 'spese',
  'spesa', 'note', 'nota', 'bagagli', 'bagaglio',
]);
const BASE_PATH = '/honeymoon-roadbook/';

interface StoredSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

interface SubscriberData {
  uid: string;
  tripId: string;
  deviceId: string;
  enabled: boolean;
  endpointHash: string;
  subscription: StoredSubscription;
  preferences: PushPreferences;
  role: 'owner' | 'copilota' | 'viewer';
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function expectedSubscriberId(uid: string, tripId: string, deviceId: string): string {
  return hash(`${uid}\n${tripId}\n${deviceId}`).slice(0, 48);
}

function requireString(value: unknown, name: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${name} non valido.`);
  }
  return value.trim();
}

function parseSubscription(value: unknown): StoredSubscription {
  const subscription = value && typeof value === 'object' ? value as Partial<StoredSubscription> : {};
  const endpoint = requireString(subscription.endpoint, 'Subscription endpoint', 2048);
  if (!endpoint.startsWith('https://')) throw new HttpsError('invalid-argument', 'Subscription endpoint non sicuro.');
  const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {} as StoredSubscription['keys'];
  return {
    endpoint,
    expirationTime: typeof subscription.expirationTime === 'number' ? subscription.expirationTime : null,
    keys: {
      p256dh: requireString(keys.p256dh, 'Chiave subscription', 512),
      auth: requireString(keys.auth, 'Autorizzazione subscription', 512),
    },
  };
}

async function getTripRole(db: admin.firestore.Firestore, tripId: string, uid: string): Promise<SubscriberData['role'] | null> {
  const tripRef = db.collection('trips').doc(tripId);
  const member = await tripRef.collection('members').doc(uid).get();
  const trip = await tripRef.get();
  const data = trip.data() || {};
  if (trip.exists && (data.ownerUid === uid || data.ownerId === uid)) return 'owner';
  if (member.exists) {
    const role = member.data()?.role;
    return role === 'owner' || role === 'copilota' ? role : 'viewer';
  }
  if (trip.exists && Array.isArray(data.members) && data.members.includes(uid)) return 'viewer';
  return null;
}

async function assertTripMember(db: admin.firestore.Firestore, tripId: string, uid: string): Promise<SubscriberData['role']> {
  const role = await getTripRole(db, tripId, uid);
  if (role) return role;
  throw new HttpsError('permission-denied', 'Non sei autorizzato per questo viaggio.');
}

function configureWebPush(): void {
  const publicKey = vapidPublicKey.value();
  const privateKey = vapidPrivateKey.value();
  const mailto = vapidMailto.value();
  if (!publicKey || !privateKey || !mailto) throw new HttpsError('failed-precondition', 'Configurazione push server incompleta.');
  webpush.setVapidDetails(mailto.startsWith('mailto:') ? mailto : `mailto:${mailto}`, publicKey, privateKey);
}

function jobId(subscriberId: string, entityKey: string, kind: string): string {
  return hash(`${subscriberId}|${entityKey}|${kind}`).slice(0, 56);
}

function possibleKinds(collection: PushEntityCollection | 'note'): string[] {
  if (collection === 'note') return ['deadline_due'];
  if (collection === 'trasporti') return ['transport_departure', 'rental_return'];
  if (collection === 'attivita') return ['activity_start'];
  return ['lodging_checkin', 'lodging_checkout'];
}

async function listTripSubscribers(db: admin.firestore.Firestore, tripId: string): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const snapshot = await db.collection('push_subscribers')
    .where('tripId', '==', tripId)
    .where('enabled', '==', true)
    .limit(50)
    .get();
  return snapshot.docs;
}

async function replaceEntityJobs(
  db: admin.firestore.Firestore,
  tripId: string,
  collection: PushEntityCollection | 'note',
  entityId: string,
  candidates: ReminderCandidate[]
): Promise<void> {
  const subscribers = await listTripSubscribers(db, tripId);
  const writer = db.bulkWriter();
  const entityKey = `${collection}/${entityId}`;
  for (const subscriber of subscribers) {
    const data = subscriber.data() as SubscriberData;
    const preferences = normalizePushPreferences(data.preferences);
    for (const kind of possibleKinds(collection)) {
      writer.delete(db.collection('push_jobs').doc(jobId(subscriber.id, entityKey, kind)));
    }
    for (const item of candidates) {
      if (!preferenceAllows(preferences, item.kind)) continue;
      const dueAt = item.eventAt - (item.leadMinutes ?? preferences.reminderMinutes) * 60_000;
      if (dueAt <= Date.now()) continue;
      writer.set(db.collection('push_jobs').doc(jobId(subscriber.id, entityKey, item.kind)), {
        kind: 'reminder',
        reminderKind: item.kind,
        tripId,
        subscriberId: subscriber.id,
        entityKey,
        dueAt,
        eventAt: item.eventAt,
        title: item.title,
        body: item.body,
        url: item.url,
        attempts: 0,
        createdAt: Date.now(),
      });
    }
  }
  await writer.close();
}

async function rebuildSubscriberJobs(db: admin.firestore.Firestore, subscriberId: string, subscriber: SubscriberData): Promise<void> {
  const writer = db.bulkWriter();
  const oldJobs = await db.collection('push_jobs').where('subscriberId', '==', subscriberId).limit(500).get();
  oldJobs.docs.forEach(doc => writer.delete(doc.ref));
  const fromDate = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);
  for (const collection of [...ALLOWED_COLLECTIONS]) {
    const dateField = collection === 'alloggi' ? 'checkOut' : 'date';
    const records = await db.collection('trips').doc(subscriber.tripId).collection(collection)
      .where(dateField, '>=', fromDate)
      .orderBy(dateField)
      .limit(100)
      .get();
    for (const record of records.docs) {
      const entityKey = `${collection}/${record.id}`;
      const candidates = buildReminderCandidates(collection, record.data());
      for (const item of candidates) {
        if (!preferenceAllows(subscriber.preferences, item.kind)) continue;
        const dueAt = item.eventAt - (item.leadMinutes ?? subscriber.preferences.reminderMinutes) * 60_000;
        if (dueAt <= Date.now()) continue;
        writer.set(db.collection('push_jobs').doc(jobId(subscriberId, entityKey, item.kind)), {
          kind: 'reminder', reminderKind: item.kind, tripId: subscriber.tripId, subscriberId,
          entityKey, dueAt, eventAt: item.eventAt, title: item.title, body: item.body,
          url: item.url, attempts: 0, createdAt: Date.now(),
        });
      }
    }
  }
  const deadlines = await db.collection('trips').doc(subscriber.tripId).collection('note')
    .where('dueDate', '>=', fromDate)
    .orderBy('dueDate')
    .limit(100)
    .get();
  for (const record of deadlines.docs) {
    const candidates = buildDeadlineReminderCandidate(record.data());
    for (const item of candidates) {
      if (!preferenceAllows(subscriber.preferences, item.kind)) continue;
      const dueAt = item.eventAt - (item.leadMinutes ?? subscriber.preferences.reminderMinutes) * 60_000;
      if (dueAt <= Date.now()) continue;
      const entityKey = `note/${record.id}`;
      writer.set(db.collection('push_jobs').doc(jobId(subscriberId, entityKey, item.kind)), {
        kind: 'reminder', reminderKind: item.kind, tripId: subscriber.tripId, subscriberId,
        entityKey, dueAt, eventAt: item.eventAt, title: item.title, body: item.body,
        url: item.url, attempts: 0, createdAt: Date.now(),
      });
    }
  }
  await writer.close();
}

async function removeSubscriber(db: admin.firestore.Firestore, subscriberId: string): Promise<void> {
  const writer = db.bulkWriter();
  writer.delete(db.collection('push_subscribers').doc(subscriberId));
  const jobs = await db.collection('push_jobs').where('subscriberId', '==', subscriberId).limit(500).get();
  jobs.docs.forEach(doc => writer.delete(doc.ref));
  await writer.close();
}

async function sendPayload(db: admin.firestore.Firestore, subscriberId: string, subscriber: SubscriberData, payload: Record<string, unknown>): Promise<'accepted' | 'stale'> {
  configureWebPush();
  try {
    await webpush.sendNotification(subscriber.subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
    await db.collection('push_subscribers').doc(subscriberId).set({ lastAcceptedAt: Date.now(), lastError: null }, { merge: true });
    return 'accepted';
  } catch (error: unknown) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscriber(db, subscriberId);
      return 'stale';
    }
    await db.collection('push_subscribers').doc(subscriberId).set({ lastError: `push_${statusCode || 'unknown'}`, updatedAt: Date.now() }, { merge: true });
    throw error;
  }
}

export const registerPushSubscription = onCall({ cors: true, enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const uid = request.auth.uid;
  const tripId = requireString(request.data?.tripId, 'tripId', 128);
  const deviceId = requireString(request.data?.deviceId, 'deviceId', 128);
  const subscriberId = requireString(request.data?.subscriberId, 'subscriberId', 64);
  if (subscriberId !== expectedSubscriberId(uid, tripId, deviceId)) throw new HttpsError('permission-denied', 'Identificativo subscription non valido.');
  const subscription = parseSubscription(request.data?.subscription);
  const endpointHash = hash(subscription.endpoint);
  const preferences = normalizePushPreferences(request.data?.preferences);
  const db = admin.firestore();
  const role = await assertTripMember(db, tripId, uid);

  const previousSubscriberId = typeof request.data?.previousSubscriberId === 'string' ? request.data.previousSubscriberId : '';
  if (previousSubscriberId && previousSubscriberId !== subscriberId) {
    const previous = await db.collection('push_subscribers').doc(previousSubscriberId).get();
    if (previous.exists && previous.data()?.uid === uid && previous.data()?.deviceId === deviceId) {
      await removeSubscriber(db, previousSubscriberId);
    }
  }

  const duplicateEndpoints = await db.collection('push_subscribers').where('endpointHash', '==', endpointHash).limit(10).get();
  for (const duplicate of duplicateEndpoints.docs) {
    if (duplicate.id !== subscriberId) await removeSubscriber(db, duplicate.id);
  }

  const data: SubscriberData & Record<string, unknown> = {
    uid, tripId, deviceId, enabled: true, endpointHash, subscription, preferences, role,
    updatedAt: Date.now(), userAgent: requireString(request.data?.userAgent || 'unknown', 'userAgent', 300),
  };
  await db.collection('push_subscribers').doc(subscriberId).set({ ...data, enabled: false }, { merge: true });
  await rebuildSubscriberJobs(db, subscriberId, data);
  await db.collection('push_subscribers').doc(subscriberId).set({ enabled: true, updatedAt: Date.now() }, { merge: true });
  return { active: true, subscriberId, endpointHash, remindersScheduled: true };
});

export const getPushRegistrationStatus = onCall({ cors: true, enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const uid = request.auth.uid;
  const tripId = requireString(request.data?.tripId, 'tripId', 128);
  const deviceId = requireString(request.data?.deviceId, 'deviceId', 128);
  const subscriberId = requireString(request.data?.subscriberId, 'subscriberId', 64);
  const endpointHash = requireString(request.data?.endpointHash, 'endpointHash', 64);
  if (subscriberId !== expectedSubscriberId(uid, tripId, deviceId)) return { active: false, reason: 'identity-mismatch' };
  const db = admin.firestore();
  await assertTripMember(db, tripId, uid);
  const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
  const data = snapshot.data();
  const active = snapshot.exists && data?.enabled === true && data?.uid === uid && data?.tripId === tripId && data?.deviceId === deviceId && data?.endpointHash === endpointHash;
  return { active, reason: active ? 'registered' : 'not-registered', preferences: active ? normalizePushPreferences(data?.preferences) : null };
});

export const unregisterPushSubscription = onCall({ cors: true, enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const subscriberId = requireString(request.data?.subscriberId, 'subscriberId', 64);
  const db = admin.firestore();
  const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
  if (snapshot.exists && snapshot.data()?.uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Subscription non autorizzata.');
  await removeSubscriber(db, subscriberId);
  return { inactive: true };
});

export const sendTestPush = onCall({ cors: true, enforceAppCheck: true, secrets: PUSH_SECRETS }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const subscriberId = requireString(request.data?.subscriberId, 'subscriberId', 64);
  const db = admin.firestore();
  const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Subscription non registrata.');
  const subscriber = snapshot.data() as SubscriberData;
  if (subscriber.uid !== request.auth.uid || !subscriber.enabled) throw new HttpsError('permission-denied', 'Subscription non autorizzata.');
  await assertTripMember(db, subscriber.tripId, request.auth.uid);

  const rateRef = db.collection('push_dispatches').doc(hash(`test|${subscriberId}`).slice(0, 56));
  await db.runTransaction(async transaction => {
    const previous = await transaction.get(rateRef);
    const lastSentAt = Number(previous.data()?.lastSentAt || 0);
    if (Date.now() - lastSentAt < 30_000) throw new HttpsError('resource-exhausted', 'Attendi qualche secondo prima di riprovare.');
    transaction.set(rateRef, { kind: 'test', uid: request.auth?.uid, lastSentAt: Date.now() }, { merge: true });
  });

  const result = await sendPayload(db, subscriberId, subscriber, {
    title: 'Notifica di prova HOUNIGO',
    body: 'Il dispositivo è registrato per le notifiche del viaggio.',
    url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-test-${subscriberId}`, type: 'test',
  });
  return { accepted: result === 'accepted', deliveryConfirmed: false, status: result };
});

export const recordPushMutation = onCall({ cors: true, enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  const tripId = requireString(request.data?.tripId, 'tripId', 128);
  const entityType = requireString(request.data?.entityType, 'entityType', 32);
  const action = requireString(request.data?.action, 'action', 10);
  const entityId = requireString(request.data?.entityId, 'entityId', 200);
  const mutationId = requireString(request.data?.mutationId, 'mutationId', 100);
  if (!COLLABORATION_ENTITIES.has(entityType) || !['save', 'delete'].includes(action)) throw new HttpsError('invalid-argument', 'Mutazione non notificabile.');
  const db = admin.firestore();
  await assertTripMember(db, tripId, request.auth.uid);

  const dedupeRef = db.collection('push_dispatches').doc(hash(`mutation|${tripId}|${mutationId}`).slice(0, 56));
  const accepted = await db.runTransaction(async transaction => {
    const existing = await transaction.get(dedupeRef);
    if (existing.exists) return false;
    transaction.create(dedupeRef, { tripId, uid: request.auth?.uid, entityType, action, createdAt: Date.now() });
    return true;
  });
  if (!accepted) return { accepted: true, duplicate: true };

  const collectionMap: Record<string, PushEntityCollection | undefined> = {
    trasporto: 'trasporti', trasporti: 'trasporti', activity: 'attivita', attivita: 'attivita', alloggio: 'alloggi', alloggi: 'alloggi',
  };
  const collection = collectionMap[entityType];
  if (collection) {
    const entity = action === 'save' ? await db.collection('trips').doc(tripId).collection(collection).doc(entityId).get() : null;
    const candidates = entity?.exists ? buildReminderCandidates(collection, entity.data() || {}) : [];
    await replaceEntityJobs(db, tripId, collection, entityId, candidates);
  }
  if (entityType === 'note' || entityType === 'nota') {
    const entity = action === 'save' ? await db.collection('trips').doc(tripId).collection('note').doc(entityId).get() : null;
    const candidates = entity?.exists ? buildDeadlineReminderCandidate(entity.data() || {}) : [];
    await replaceEntityJobs(db, tripId, 'note', entityId, candidates);
  }

  const batchRef = db.collection('push_jobs').doc(hash(`collaboration|${tripId}|${request.auth.uid}`).slice(0, 56));
  await db.runTransaction(async transaction => {
    const current = await transaction.get(batchRef);
    const data = current.data() || {};
    const firstCreatedAt = Number(data.firstCreatedAt || Date.now());
    transaction.set(batchRef, {
      kind: 'collaboration', tripId, actorUid: request.auth?.uid,
      dueAt: Math.min(firstCreatedAt + 5 * 60_000, Date.now() + 90_000),
      firstCreatedAt, eventCount: Number(data.eventCount || 0) + 1, attempts: 0,
    }, { merge: true });
  });
  return { accepted: true, duplicate: false };
});

export const dispatchDuePushNotifications = onSchedule({ schedule: 'every 5 minutes', timeZone: 'UTC', secrets: PUSH_SECRETS }, async () => {
  const db = admin.firestore();
  const due = await db.collection('push_jobs').where('dueAt', '<=', Date.now()).orderBy('dueAt').limit(100).get();
  for (const job of due.docs) {
    const data = job.data();
    try {
      if (data.kind === 'collaboration') {
        const subscribers = await listTripSubscribers(db, data.tripId);
        await Promise.all(subscribers.map(async snapshot => {
          const subscriber = snapshot.data() as SubscriberData;
          if (subscriber.uid === data.actorUid || !normalizePushPreferences(subscriber.preferences).collaboration) return;
          const currentRole = await getTripRole(db, data.tripId, subscriber.uid);
          if (currentRole !== 'owner' && currentRole !== 'copilota') return;
          await sendPayload(db, snapshot.id, subscriber, {
            title: 'Viaggio aggiornato', body: 'Il tuo compagno di viaggio ha modificato il roadbook.',
            url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-collab-${data.tripId}`, type: 'collaboration',
          });
        }));
      } else if (data.kind === 'reminder') {
        if (containsSensitivePushContent(`${data.title || ''} ${data.body || ''}`)) throw new Error('Payload reminder non sicuro');
        const subscriberSnapshot = await db.collection('push_subscribers').doc(data.subscriberId).get();
        if (subscriberSnapshot.exists && subscriberSnapshot.data()?.enabled === true) {
          const subscriber = subscriberSnapshot.data() as SubscriberData;
          const currentRole = await getTripRole(db, subscriber.tripId, subscriber.uid);
          if (!currentRole) {
            await removeSubscriber(db, subscriberSnapshot.id);
          } else {
            await sendPayload(db, subscriberSnapshot.id, subscriber, {
              title: data.title, body: data.body, url: data.url || `${BASE_PATH}?pushView=oggi`,
              tag: `hounigo-reminder-${job.id}`, type: 'reminder',
            });
          }
        }
      }
      await job.ref.delete();
    } catch (error) {
      const attempts = Number(data.attempts || 0) + 1;
      if (attempts >= 3) await job.ref.delete();
      else await job.ref.set({ attempts, dueAt: Date.now() + 5 * 60_000, lastError: 'dispatch_failed' }, { merge: true });
      console.error('[Push] Invio differito fallito', { jobId: job.id, attempts, error: error instanceof Error ? error.message : 'unknown' });
    }
  }
});
