import webpush from 'web-push';
import { isAuthorizedEditor } from './core.js';

const BASE_PATH = '/honeymoon-roadbook/';
const MAX_DAILY_SENDS = 100;
const MAX_JOBS_PER_DISPATCH = 20;
const ALLOWED_KINDS = new Set([
  'transport_departure', 'rental_return', 'activity_start',
  'lodging_checkin', 'lodging_checkout', 'deadline_due', 'collaboration'
]);
const COLLABORATION_ENTITIES = new Set([
  'trasporto', 'trasporti', 'attivita', 'activity', 'alloggio', 'alloggi',
  'tappa', 'tappe', 'ristorante', 'ristoranti', 'shopping', 'note', 'nota', 'documenti'
]);
const REMINDER_MINUTES = new Set([15, 30, 60, 120, 360, 720, 1440]);
let firebaseAccessToken = null;
let firebaseAccessTokenExpiresAt = 0;

function base64Url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const reminderMinutes = Number(input.reminderMinutes);
  return {
    transports: input.transports !== false,
    activities: input.activities !== false,
    lodging: input.lodging !== false,
    deadlines: input.deadlines !== false,
    collaboration: input.collaboration !== false,
    reminderMinutes: REMINDER_MINUTES.has(reminderMinutes) ? reminderMinutes : 60,
  };
}

function preferenceAllows(preferences, kind) {
  if (kind === 'collaboration') return preferences.collaboration;
  if (kind === 'deadline_due') return preferences.deadlines;
  if (kind === 'activity_start') return preferences.activities;
  if (kind === 'lodging_checkin' || kind === 'lodging_checkout') return preferences.lodging;
  return preferences.transports;
}

function genericPayload(kind) {
  if (kind === 'collaboration') return {
    title: 'Viaggio aggiornato', body: 'Il roadbook condiviso contiene un aggiornamento.',
    url: `${BASE_PATH}?pushView=oggi`, type: kind,
  };
  if (kind === 'deadline_due') return {
    title: 'Scadenza del viaggio', body: 'Hai un promemoria da controllare in HOUNIGO.',
    url: `${BASE_PATH}?pushView=scadenze`, type: 'reminder',
  };
  const labels = {
    transport_departure: ['Trasporto in programma', 'Controlla orario e dettagli in HOUNIGO.'],
    rental_return: ['Riconsegna noleggio', 'Controlla orario e luogo di riconsegna in HOUNIGO.'],
    activity_start: ['Attività in programma', 'L’attività inizierà a breve: controlla i dettagli.'],
    lodging_checkin: ['Check-in in programma', 'Controlla orario e indirizzo in HOUNIGO.'],
    lodging_checkout: ['Check-out in programma', 'Il check-out si avvicina: verifica i dettagli.'],
  };
  const [title, body] = labels[kind] || ['Promemoria HOUNIGO', 'Apri HOUNIGO per i dettagli.'];
  return { title, body, url: `${BASE_PATH}?pushView=oggi`, type: 'reminder' };
}

function validSubscription(value) {
  return value && typeof value === 'object'
    && typeof value.endpoint === 'string' && value.endpoint.startsWith('https://')
    && typeof value.keys?.p256dh === 'string' && value.keys.p256dh.length > 20
    && typeof value.keys?.auth === 'string' && value.keys.auth.length > 8;
}

function validReminder(value) {
  return value && ALLOWED_KINDS.has(value.kind) && value.kind !== 'collaboration'
    && Number.isFinite(Number(value.eventAt))
    && Number(value.eventAt) > Date.now()
    && Number(value.eventAt) < Date.now() + 400 * 24 * 60 * 60 * 1000;
}

async function expectedSubscriberId(uid, tripId, deviceId) {
  return (await sha256(`${uid}\n${tripId}\n${deviceId}`)).slice(0, 48);
}

async function getServiceAccountToken(env) {
  if (firebaseAccessToken && firebaseAccessTokenExpiresAt > Date.now() + 60_000) return firebaseAccessToken;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    sub: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: now,
    exp: now + 3600,
  }));
  const pem = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const assertion = `${input}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error('FIREBASE_SERVICE_ACCOUNT_DENIED');
  const data = await response.json();
  firebaseAccessToken = data.access_token;
  firebaseAccessTokenExpiresAt = Date.now() + Math.min(Number(data.expires_in || 3600), 3600) * 1000;
  return firebaseAccessToken;
}

async function firestoreDocument(path, token, env) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('FIRESTORE_MEMBERSHIP_CHECK_FAILED');
  return response.json();
}

async function stillAuthorized(uid, tripId, env) {
  const token = await getServiceAccountToken(env);
  const encodedTripId = encodeURIComponent(tripId);
  const [trip, member] = await Promise.all([
    firestoreDocument(`trips/${encodedTripId}`, token, env),
    firestoreDocument(`trips/${encodedTripId}/members/${encodeURIComponent(uid)}`, token, env),
  ]);
  return Boolean(trip && isAuthorizedEditor(uid, trip, member));
}

async function reserveSendQuota(env) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.RATE_LIMITS.prepare(`
    INSERT INTO push_daily_usage (usage_day, sent_count, updated_at) VALUES (?1, 1, ?2)
    ON CONFLICT(usage_day) DO UPDATE SET sent_count = sent_count + 1, updated_at = excluded.updated_at
    RETURNING sent_count
  `).bind(day, Date.now()).first();
  if (!row || Number(row.sent_count) > MAX_DAILY_SENDS) throw new Error('PUSH_QUOTA_EXHAUSTED');
}

async function sendPush(subscription, payload, env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new Error('VAPID_NOT_CONFIGURED');
  await reserveSendQuota(env);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
}

async function scheduleMutationJobs(uid, tripId, payload, env) {
  const entityType = String(payload.entityType || '');
  const action = String(payload.action || '');
  const entityId = String(payload.entityId || '');
  const mutationId = String(payload.mutationId || '');
  if (!COLLABORATION_ENTITIES.has(entityType) || !['save', 'delete'].includes(action)
    || !/^[A-Za-z0-9_.:-]{1,200}$/.test(entityId) || !/^[A-Za-z0-9-]{8,100}$/.test(mutationId)) {
    throw new Error('INVALID_MUTATION');
  }
  const dispatchKey = (await sha256(`mutation|${tripId}|${mutationId}`)).slice(0, 56);
  const accepted = await env.RATE_LIMITS.prepare(`
    INSERT OR IGNORE INTO push_dispatches (dispatch_key, trip_id, created_at) VALUES (?1, ?2, ?3)
    RETURNING dispatch_key
  `).bind(dispatchKey, tripId, Date.now()).first();
  if (!accepted) return { accepted: true, duplicate: true };

  const entityKey = `${entityType}:${entityId}`;
  await env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE trip_id = ?1 AND entity_key = ?2')
    .bind(tripId, entityKey).run();

  if (action === 'save') {
    const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter(validReminder).slice(0, 3) : [];
    const subscribers = await env.RATE_LIMITS.prepare(
      'SELECT subscriber_id, preferences_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 LIMIT 20'
    ).bind(tripId).all();
    for (const subscriber of subscribers.results || []) {
      const preferences = normalizePreferences(JSON.parse(subscriber.preferences_json));
      for (const reminder of reminders) {
        if (!preferenceAllows(preferences, reminder.kind)) continue;
        const leadMinutes = reminder.kind === 'deadline_due'
          ? Math.max(0, Math.min(Number(reminder.leadMinutes || 0), 43_200))
          : preferences.reminderMinutes;
        const dueAt = Number(reminder.eventAt) - leadMinutes * 60_000;
        if (dueAt <= Date.now()) continue;
        const jobId = (await sha256(`reminder|${subscriber.subscriber_id}|${entityKey}|${reminder.kind}`)).slice(0, 56);
        await env.RATE_LIMITS.prepare(`
          INSERT OR REPLACE INTO push_jobs
            (job_id, trip_id, subscriber_id, actor_uid, entity_key, kind, event_at, lead_minutes, due_at, attempts, created_at)
          VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, 0, ?9)
        `).bind(jobId, tripId, subscriber.subscriber_id, entityKey, reminder.kind, Number(reminder.eventAt), leadMinutes, dueAt, Date.now()).run();
      }
    }
  }

  const collaborationId = (await sha256(`collaboration|${tripId}`)).slice(0, 56);
  await env.RATE_LIMITS.prepare(`
    INSERT INTO push_jobs (job_id, trip_id, subscriber_id, actor_uid, entity_key, kind, event_at, lead_minutes, due_at, attempts, created_at)
    VALUES (?1, ?2, NULL, ?3, ?4, 'collaboration', NULL, NULL, ?5, 0, ?6)
    ON CONFLICT(job_id) DO UPDATE SET due_at = MIN(push_jobs.created_at + 300000, excluded.due_at)
  `).bind(collaborationId, tripId, uid, entityKey, Date.now() + 90_000, Date.now()).run();
  return { accepted: true, duplicate: false };
}

export async function handlePushRequest(path, uid, tripId, payload, env) {
  if (!env.RATE_LIMITS) throw new Error('PUSH_STORAGE_NOT_CONFIGURED');
  if (path === '/v1/push/register') {
    const deviceId = String(payload.deviceId || '');
    const subscriberId = String(payload.subscriberId || '');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId) || subscriberId !== await expectedSubscriberId(uid, tripId, deviceId)
      || !validSubscription(payload.subscription)) throw new Error('INVALID_SUBSCRIPTION');
    const endpointHash = await sha256(payload.subscription.endpoint);
    const preferences = normalizePreferences(payload.preferences);
    if (payload.previousSubscriberId && payload.previousSubscriberId !== subscriberId) {
      await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE subscriber_id = ?1 AND uid = ?2')
        .bind(String(payload.previousSubscriberId), uid).run();
    }
    await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE endpoint_hash = ?1 AND subscriber_id <> ?2')
      .bind(endpointHash, subscriberId).run();
    await env.RATE_LIMITS.prepare(`
      INSERT OR REPLACE INTO push_subscriptions
        (subscriber_id, trip_id, uid, device_id, endpoint_hash, subscription_json, preferences_json, enabled, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)
    `).bind(subscriberId, tripId, uid, deviceId, endpointHash, JSON.stringify(payload.subscription), JSON.stringify(preferences), Date.now()).run();
    await env.RATE_LIMITS.prepare(`
      UPDATE push_jobs
      SET due_at = event_at - (?2 * 60000), lead_minutes = ?2
      WHERE subscriber_id = ?1 AND kind <> 'deadline_due' AND event_at IS NOT NULL
    `).bind(subscriberId, preferences.reminderMinutes).run();
    return { active: true, subscriberId, endpointHash };
  }

  if (path === '/v1/push/mutation') return scheduleMutationJobs(uid, tripId, payload, env);

  const subscriberId = String(payload.subscriberId || '');
  const registration = subscriberId
    ? await env.RATE_LIMITS.prepare('SELECT * FROM push_subscriptions WHERE subscriber_id = ?1').bind(subscriberId).first()
    : null;
  if (path === '/v1/push/status') {
    const active = Boolean(registration && registration.uid === uid && registration.trip_id === tripId
      && registration.device_id === payload.deviceId && registration.endpoint_hash === payload.endpointHash && registration.enabled === 1);
    return { active, reason: active ? 'registered' : 'not-registered', preferences: active ? normalizePreferences(JSON.parse(registration.preferences_json)) : null };
  }
  if (!registration || registration.uid !== uid || registration.trip_id !== tripId) throw new Error('SUBSCRIPTION_NOT_AUTHORIZED');
  if (path === '/v1/push/unregister') {
    await env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE subscriber_id = ?1').bind(subscriberId).run();
    await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE subscriber_id = ?1').bind(subscriberId).run();
    return { inactive: true };
  }
  if (path === '/v1/push/test') {
    const rateKey = `test:${subscriberId}`;
    const previous = await env.RATE_LIMITS.prepare('SELECT created_at FROM push_dispatches WHERE dispatch_key = ?1').bind(rateKey).first();
    if (previous && Date.now() - Number(previous.created_at) < 30_000) throw new Error('PUSH_RATE_LIMITED');
    await env.RATE_LIMITS.prepare('INSERT OR REPLACE INTO push_dispatches (dispatch_key, trip_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(rateKey, tripId, Date.now()).run();
    await sendPush(JSON.parse(registration.subscription_json), {
      title: 'Notifica di prova HOUNIGO', body: 'Il dispositivo è registrato per le notifiche del viaggio.',
      url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-test-${subscriberId}`, type: 'test',
    }, env);
    return { accepted: true, deliveryConfirmed: false, status: 'accepted' };
  }
  throw new Error('PUSH_ENDPOINT_NOT_FOUND');
}

async function processJob(job, env, membershipCache) {
  const subscribers = job.subscriber_id
    ? { results: [await env.RATE_LIMITS.prepare('SELECT * FROM push_subscriptions WHERE subscriber_id = ?1 AND enabled = 1').bind(job.subscriber_id).first()].filter(Boolean) }
    : await env.RATE_LIMITS.prepare('SELECT * FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 LIMIT 20').bind(job.trip_id).all();
  for (const subscriber of subscribers.results || []) {
    if (job.kind === 'collaboration' && subscriber.uid === job.actor_uid) continue;
    const preferences = normalizePreferences(JSON.parse(subscriber.preferences_json));
    if (!preferenceAllows(preferences, job.kind)) continue;
    const membershipKey = `${subscriber.trip_id}:${subscriber.uid}`;
    if (!membershipCache.has(membershipKey)) {
      membershipCache.set(membershipKey, await stillAuthorized(subscriber.uid, subscriber.trip_id, env));
    }
    if (!membershipCache.get(membershipKey)) {
      await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE subscriber_id = ?1').bind(subscriber.subscriber_id).run();
      continue;
    }
    try {
      await sendPush(JSON.parse(subscriber.subscription_json), {
        ...genericPayload(job.kind), tag: `hounigo-${job.kind}-${job.job_id}`,
      }, env);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE subscriber_id = ?1').bind(subscriber.subscriber_id).run();
        continue;
      }
      throw error;
    }
  }
}

export async function dispatchDuePushJobs(env) {
  const jobs = await env.RATE_LIMITS.prepare('SELECT * FROM push_jobs WHERE due_at <= ?1 ORDER BY due_at LIMIT ?2')
    .bind(Date.now(), MAX_JOBS_PER_DISPATCH).all();
  const membershipCache = new Map();
  for (const job of jobs.results || []) {
    try {
      await processJob(job, env, membershipCache);
      await env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE job_id = ?1').bind(job.job_id).run();
    } catch {
      const attempts = Number(job.attempts || 0) + 1;
      if (attempts >= 3) await env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE job_id = ?1').bind(job.job_id).run();
      else await env.RATE_LIMITS.prepare('UPDATE push_jobs SET attempts = ?2, due_at = ?3 WHERE job_id = ?1')
        .bind(job.job_id, attempts, Date.now() + 5 * 60_000).run();
    }
  }
}

export const pushTestHelpers = { normalizePreferences, preferenceAllows, validSubscription, validReminder, genericPayload };
