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
let firebaseAccessTokenEmail = '';

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

function formatActualLeadText(eventAt, now = Date.now()) {
  const numEventAt = Number(eventAt);
  if (!Number.isFinite(numEventAt)) return '';
  const remainingMin = Math.max(0, Math.round((numEventAt - now) / 60_000));
  if (remainingMin <= 1) return 'Adesso';
  if (remainingMin < 50) return `Tra ${remainingMin} min`;
  if (remainingMin <= 70) return 'Tra circa 1 ora';
  if (remainingMin < 1410) return `Tra ${Math.max(2, Math.round(remainingMin / 60))} ore`;
  const days = Math.max(1, Math.round(remainingMin / 1440));
  return days === 1 ? 'Tra circa 1 giorno' : `Tra ${days} giorni`;
}

function sanitizeEventLabel(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\b(pnr|booking\s*code|ticket\s*id)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function genericPayload(kind, context = {}) {
  if (kind === 'collaboration') return {
    title: 'Viaggio aggiornato', body: 'Il roadbook condiviso contiene un aggiornamento.',
    url: `${BASE_PATH}?pushView=oggi`, type: kind,
  };
  const cleanTitle = sanitizeEventLabel(context?.title);
  const localTime = typeof context?.localTime === 'string' && /^\d{2}:\d{2}$/.test(context.localTime.trim())
    ? context.localTime.trim()
    : '';
  const leadText = context?.eventAt != null ? formatActualLeadText(context.eventAt, context?.now) : '';
  const detailParts = [localTime ? `Alle ${localTime}` : '', leadText].filter(Boolean);
  const detailLine = detailParts.join(' · ');

  if (kind === 'deadline_due') return {
    title: cleanTitle ? `Scadenza: ${cleanTitle}` : 'Scadenza del viaggio',
    body: detailLine || 'Hai un promemoria da controllare in HOUNIGO.',
    url: `${BASE_PATH}?pushView=scadenze`, type: 'reminder',
  };
  const labels = {
    transport_departure: [cleanTitle ? `Partenza: ${cleanTitle}` : 'Trasporto in programma', detailLine || 'Controlla orario e dettagli in HOUNIGO.'],
    rental_return: [cleanTitle ? `Riconsegna: ${cleanTitle}` : 'Riconsegna noleggio', detailLine || 'Controlla orario e luogo di riconsegna in HOUNIGO.'],
    activity_start: [cleanTitle ? `In programma: ${cleanTitle}` : 'Attività in programma', detailLine || 'Controlla orario e dettagli in HOUNIGO.'],
    lodging_checkin: [cleanTitle ? `Check-in: ${cleanTitle}` : 'Check-in in programma', detailLine || 'Controlla orario e indirizzo in HOUNIGO.'],
    lodging_checkout: [cleanTitle ? `Check-out: ${cleanTitle}` : 'Check-out in programma', detailLine || 'Verifica orario e dettagli in HOUNIGO.'],
  };
  const [title, body] = labels[kind] || ['Promemoria HOUNIGO', detailLine || 'Apri HOUNIGO per i dettagli.'];
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

function parseServiceAccountConfig(env) {
  let email = String(env?.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  let rawKey = String(env?.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  if (rawKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawKey);
      if (typeof parsed?.private_key === 'string') rawKey = parsed.private_key.trim();
      if (!email && typeof parsed?.client_email === 'string') email = parsed.client_email.trim();
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_INVALID');
    }
  }
  if (!email || !rawKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED');
  }
  const pem = rawKey
    .replace(/^["']|["']$/g, '')
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_INVALID');
  }
  try {
    const der = Uint8Array.from(atob(b64), char => char.charCodeAt(0));
    return { email, der };
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_INVALID');
  }
}

function safeCronErrorReason(error) {
  const msg = String(error?.message || '');
  if (/^(FIREBASE_SERVICE_ACCOUNT_[A-Z0-9_]+|FIRESTORE_MEMBERSHIP_CHECK_FAILED|VAPID_NOT_CONFIGURED|PUSH_QUOTA_EXHAUSTED)(:[A-Za-z0-9_.-]{1,40})?$/.test(msg)) {
    return msg;
  }
  if (Number.isInteger(error?.statusCode)) return `PUSH_HTTP_${error.statusCode}`;
  return String(error?.name || 'CRON_ERROR').slice(0, 40);
}

export async function getServiceAccountToken(env) {
  const { email, der } = parseServiceAccountConfig(env);
  if (firebaseAccessToken && firebaseAccessTokenEmail === email && firebaseAccessTokenExpiresAt > Date.now() + 60_000) {
    return firebaseAccessToken;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: now,
    exp: now + 3600,
  }));
  let key;
  try {
    key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_INVALID');
  }
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const assertion = `${input}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    const oauthErr = typeof errBody?.error === 'string' ? errBody.error.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32) : '';
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_DENIED:${oauthErr || response.status}`);
  }
  const data = await response.json();
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_DENIED:EMPTY_TOKEN');
  }
  firebaseAccessTokenEmail = email;
  firebaseAccessToken = data.access_token;
  firebaseAccessTokenExpiresAt = Date.now() + Math.min(Number(data.expires_in || 3600), 3600) * 1000;
  return firebaseAccessToken;
}

async function firestoreDocument(path, token, env) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`FIRESTORE_MEMBERSHIP_CHECK_FAILED:${response.status}`);
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
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
}

function canonicalEntityType(entityType) {
  const clean = String(entityType || '').trim().toLowerCase();
  if (clean === 'trasporto' || clean === 'trasporti' || clean === 'transport' || clean === 'transports') return 'trasporti';
  if (clean === 'attivita' || clean === 'attività' || clean === 'activity' || clean === 'activities') return 'attivita';
  if (clean === 'alloggio' || clean === 'alloggi' || clean === 'accommodation' || clean === 'accommodations') return 'alloggi';
  if (clean === 'ristorante' || clean === 'ristoranti' || clean === 'restaurant' || clean === 'restaurants') return 'ristoranti';
  if (clean === 'tappa' || clean === 'tappe' || clean === 'stage' || clean === 'stages') return 'tappe';
  if (clean === 'nota' || clean === 'note' || clean === 'notes' || clean === 'scadenza' || clean === 'scadenze') return 'note';
  if (clean === 'shopping') return 'shopping';
  return clean;
}

async function sentReminderDispatchKey(subscriberId, entityKey, kind, eventAt) {
  return (await sha256(`sent-rem|${subscriberId}|${entityKey}|${kind}|${Number(eventAt)}`)).slice(0, 56);
}

async function runD1Statements(database, statements) {
  if (!statements.length) return;
  if (typeof database.batch === 'function') {
    for (let i = 0; i < statements.length; i += 80) {
      await database.batch(statements.slice(i, i + 80));
    }
    return;
  }
  for (const stmt of statements) {
    await stmt.run();
  }
}

async function upsertReminderJobs({ tripId, entityKey, reminders, subscribers, existingJobsMap, sentKeysSet, pendingStatements, now, env }) {
  let scheduledCount = 0;
  let skippedAlreadySentCount = 0;
  let skippedPastLeadCount = 0;
  const desiredJobIds = new Set();

  for (const subscriber of subscribers) {
    const preferences = normalizePreferences(JSON.parse(subscriber.preferences_json));
    for (const reminder of reminders) {
      if (!preferenceAllows(preferences, reminder.kind)) continue;
      const eventAt = Number(reminder.eventAt);
      if (eventAt <= now) continue;
      let leadMinutes = reminder.kind === 'deadline_due'
        ? Math.max(0, Math.min(Number(reminder.leadMinutes || 0), 43_200))
        : preferences.reminderMinutes;
      let dueAt = eventAt - leadMinutes * 60_000;
      if (dueAt <= now) {
        if (reminder.kind === 'deadline_due') {
          const fallbackDueAt = eventAt - 60 * 60_000;
          if (fallbackDueAt > now) {
            dueAt = fallbackDueAt;
            leadMinutes = 60;
          } else {
            skippedPastLeadCount += 1;
            continue;
          }
        } else {
          skippedPastLeadCount += 1;
          continue;
        }
      }
      const sentKey = await sentReminderDispatchKey(subscriber.subscriber_id, entityKey, reminder.kind, eventAt);
      const alreadySent = sentKeysSet
        ? sentKeysSet.has(sentKey)
        : Boolean(await env.RATE_LIMITS.prepare('SELECT dispatch_key FROM push_dispatches WHERE dispatch_key = ?1')
          .bind(sentKey).first());
      const jobId = (await sha256(`reminder|${subscriber.subscriber_id}|${entityKey}|${reminder.kind}`)).slice(0, 56);
      if (alreadySent) {
        skippedAlreadySentCount += 1;
        continue;
      }
      desiredJobIds.add(jobId);

      const existing = existingJobsMap?.get(jobId);
      if (
        existing
        && Number(existing.event_at) === eventAt
        && Number(existing.lead_minutes) === leadMinutes
        && (Number(existing.due_at) === dueAt || Number(existing.attempts || 0) > 0)
      ) {
        continue;
      }

      const stmt = env.RATE_LIMITS.prepare(`
        INSERT OR REPLACE INTO push_jobs
          (job_id, trip_id, subscriber_id, actor_uid, entity_key, kind, event_at, lead_minutes, due_at, attempts, created_at)
        VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, 0, ?9)
      `).bind(jobId, tripId, subscriber.subscriber_id, entityKey, reminder.kind, eventAt, leadMinutes, dueAt, now);
      if (pendingStatements) pendingStatements.push(stmt);
      else await stmt.run();
      scheduledCount += 1;
    }
  }

  return { desiredJobIds, scheduledCount, skippedAlreadySentCount, skippedPastLeadCount };
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

  const entityKey = `${canonicalEntityType(entityType)}:${entityId}`;
  await env.RATE_LIMITS.prepare("DELETE FROM push_jobs WHERE trip_id = ?1 AND entity_key = ?2 AND kind <> 'collaboration'")
    .bind(tripId, entityKey).run();

  let scheduledCount = 0;
  let skippedPastLeadCount = 0;
  if (action === 'save') {
    const reminders = Array.isArray(payload.reminders) ? payload.reminders.filter(validReminder).slice(0, 3) : [];
    const subscribers = await env.RATE_LIMITS.prepare(
      'SELECT subscriber_id, preferences_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 LIMIT 20'
    ).bind(tripId).all();
    const res = await upsertReminderJobs({
      tripId,
      entityKey,
      reminders,
      subscribers: subscribers.results || [],
      now: Date.now(),
      env,
    });
    scheduledCount = res.scheduledCount;
    skippedPastLeadCount = res.skippedPastLeadCount;
  }

  const collaborationId = (await sha256(`collaboration|${tripId}`)).slice(0, 56);
  await env.RATE_LIMITS.prepare(`
    INSERT INTO push_jobs (job_id, trip_id, subscriber_id, actor_uid, entity_key, kind, event_at, lead_minutes, due_at, attempts, created_at)
    VALUES (?1, ?2, NULL, ?3, ?4, 'collaboration', NULL, NULL, ?5, 0, ?6)
    ON CONFLICT(job_id) DO UPDATE SET due_at = MIN(push_jobs.created_at + 300000, excluded.due_at)
  `).bind(collaborationId, tripId, uid, entityKey, Date.now() + 90_000, Date.now()).run();
  console.info('[push-mutation]', { entityType, action, scheduledCount, skippedPastLeadCount });
  return { accepted: true, duplicate: false, scheduledCount, skippedPastLeadCount };
}

async function syncTripReminders(tripId, payload, env) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : null;
  if (!rawItems || rawItems.length > 200) throw new Error('INVALID_REMINDER_SYNC');

  const now = Date.now();
  const subscribersRes = await env.RATE_LIMITS.prepare(
    'SELECT subscriber_id, preferences_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 LIMIT 20'
  ).bind(tripId).all();
  const subscribers = subscribersRes.results || [];
  if (subscribers.length === 0) {
    return { synced: true, scheduledCount: 0, skippedAlreadySentCount: 0, removedCount: 0 };
  }

  const [existingRes, sentRes] = await Promise.all([
    env.RATE_LIMITS.prepare(
      "SELECT job_id, entity_key, kind, event_at, lead_minutes, due_at, attempts FROM push_jobs WHERE trip_id = ?1 AND kind <> 'collaboration'"
    ).bind(tripId).all(),
    env.RATE_LIMITS.prepare(
      'SELECT dispatch_key FROM push_dispatches WHERE trip_id = ?1'
    ).bind(tripId).all(),
  ]);
  const existingJobsMap = new Map((existingRes.results || []).map(row => [row.job_id, row]));
  const sentKeysSet = new Set((sentRes.results || []).map(row => row.dispatch_key));

  const desiredAll = new Set();
  const pendingStatements = [];
  let scheduledCount = 0;
  let skippedAlreadySentCount = 0;
  let skippedPastLeadCount = 0;

  for (const item of rawItems) {
    const entityType = String(item?.entityType || '');
    const entityId = String(item?.entityId || '');
    if (!COLLABORATION_ENTITIES.has(entityType) || !/^[A-Za-z0-9_.:-]{1,200}$/.test(entityId)) continue;
    const reminders = Array.isArray(item?.reminders) ? item.reminders.filter(validReminder).slice(0, 3) : [];
    const entityKey = `${canonicalEntityType(entityType)}:${entityId}`;
    const res = await upsertReminderJobs({
      tripId,
      entityKey,
      reminders,
      subscribers,
      existingJobsMap,
      sentKeysSet,
      pendingStatements,
      now,
      env,
    });
    res.desiredJobIds.forEach(id => desiredAll.add(id));
    scheduledCount += res.scheduledCount;
    skippedAlreadySentCount += res.skippedAlreadySentCount;
    skippedPastLeadCount += res.skippedPastLeadCount;
  }

  let removedCount = 0;
  if (payload?.pruneRemoved !== false) {
    for (const [jobId] of existingJobsMap) {
      if (!desiredAll.has(jobId)) {
        pendingStatements.push(env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE job_id = ?1').bind(jobId));
        removedCount += 1;
      }
    }
  }

  await runD1Statements(env.RATE_LIMITS, pendingStatements);
  console.info('[push-sync]', { itemsCount: rawItems.length, scheduledCount, skippedAlreadySentCount, skippedPastLeadCount, removedCount });

  return { synced: true, scheduledCount, skippedAlreadySentCount, skippedPastLeadCount, removedCount };
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
    const nowReg = Date.now();
    await env.RATE_LIMITS.prepare(`
      DELETE FROM push_jobs
      WHERE subscriber_id = ?1 AND kind <> 'deadline_due' AND event_at IS NOT NULL AND event_at - (?2 * 60000) <= ?3
    `).bind(subscriberId, preferences.reminderMinutes, nowReg).run();
    await env.RATE_LIMITS.prepare(`
      UPDATE push_jobs
      SET due_at = event_at - (?2 * 60000), lead_minutes = ?2
      WHERE subscriber_id = ?1 AND kind <> 'deadline_due' AND event_at IS NOT NULL
    `).bind(subscriberId, preferences.reminderMinutes).run();
    return { active: true, subscriberId, endpointHash };
  }

  if (path === '/v1/push/mutation') return scheduleMutationJobs(uid, tripId, payload, env);
  if (path === '/v1/push/sync-reminders') return syncTripReminders(tripId, payload, env);

  if (path === '/v1/push/admin-send') {
    const title = String(payload.title || '').trim().slice(0, 100);
    const body = String(payload.body || '').trim().slice(0, 250);
    const target = payload.target || 'all_subscribers';
    const isDryRun = Boolean(payload.dryRun);

    if (!title || !body) throw new Error('INVALID_PAYLOAD');

    // Anti-spam globale giornaliero: max 100 invii al giorno per Cloudflare Free
    const dailyCount = await env.RATE_LIMITS.prepare(
      'SELECT count(*) as total FROM push_dispatches WHERE trip_id = ?1 AND created_at > ?2'
    ).bind(tripId, Date.now() - 86_400_000).first();
    if (dailyCount && Number(dailyCount.total) >= MAX_DAILY_SENDS) {
      throw new Error('DAILY_PUSH_QUOTA_EXCEEDED');
    }

    // Deduplicazione: stesso titolo e testo inviati entro 60 secondi
    const dispatchTargetKey = target === 'all_trips_broadcast' ? 'all_trips' : tripId;
    const dispatchHash = (await sha256(`admin|${dispatchTargetKey}|${title}|${body}`)).slice(0, 48);
    const recent = await env.RATE_LIMITS.prepare(
      'SELECT created_at FROM push_dispatches WHERE dispatch_key = ?1'
    ).bind(dispatchHash).first();
    if (recent && Date.now() - Number(recent.created_at) < 60_000) {
      return { success: true, duplicate: true, recipientCount: 0, message: 'Notifica identica già registrata di recente (deduplicazione attiva).' };
    }

    // Selezione destinatari autorizzati con consenso esplicito (enabled = 1)
    let queryStr;
    let params = [];
    if (target === 'all_trips_broadcast') {
      // Broadcast globale multi-viaggio con deduplicazione su endpoint_hash
      queryStr = 'SELECT subscriber_id, subscription_json, trip_id FROM push_subscriptions WHERE enabled = 1 GROUP BY endpoint_hash';
    } else if (target === 'custom_uid' && payload.customUid) {
      queryStr = 'SELECT subscriber_id, subscription_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 AND uid = ?2';
      params = [tripId, String(payload.customUid).trim()];
    } else {
      queryStr = 'SELECT subscriber_id, subscription_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1';
      params = [tripId];
    }
    const subscribers = await env.RATE_LIMITS.prepare(queryStr).bind(...params).all();
    const recipientCount = subscribers.results ? subscribers.results.length : 0;

    if (isDryRun) {
      return {
        success: true,
        dryRun: true,
        recipientCount,
        message: `Simulazione dry-run verificata con successo: ${recipientCount} dispositivi con consenso rilevati. Nessuna notifica reale inviata.`
      };
    }

    // Registra nel log dispatches
    await env.RATE_LIMITS.prepare(
      'INSERT OR REPLACE INTO push_dispatches (dispatch_key, trip_id, created_at) VALUES (?1, ?2, ?3)'
    ).bind(dispatchHash, tripId, Date.now()).run();

    let sentCount = 0;
    for (const sub of subscribers.results || []) {
      try {
        await sendPush(JSON.parse(sub.subscription_json), {
          title,
          body,
          url: `${BASE_PATH}?pushView=oggi`,
          tag: `admin-broadcast-${Date.now()}`,
          type: 'announcement'
        }, env);
        sentCount++;
      } catch (err) {
        console.warn('Errore invio singolo push:', err);
      }
    }

    return {
      success: true,
      dryRun: false,
      recipientCount: sentCount,
      message: `Notifica manuale inviata con successo a ${sentCount} dispositivi autorizzati.`
    };
  }

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
    const elapsed = previous ? Date.now() - Number(previous.created_at) : Infinity;
    if (elapsed < 30_000) {
      const waitSeconds = Math.max(1, Math.ceil((30_000 - elapsed) / 1000));
      const err = new Error('PUSH_RATE_LIMITED');
      err.retryAfter = waitSeconds;
      throw err;
    }
    await sendPush(JSON.parse(registration.subscription_json), {
      title: 'Notifica di prova HOUNIGO', body: 'Il dispositivo è registrato per le notifiche del viaggio.',
      url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-test-${subscriberId}-${Date.now()}`, type: 'test',
    }, env);
    await env.RATE_LIMITS.prepare('INSERT OR REPLACE INTO push_dispatches (dispatch_key, trip_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(rateKey, tripId, Date.now()).run();
    return { accepted: true, deliveryConfirmed: false, status: 'accepted' };
  }
  throw new Error('PUSH_ENDPOINT_NOT_FOUND');
}

async function processJob(job, env, membershipCache) {
  if (job.kind !== 'collaboration' && job.event_at != null && Number(job.event_at) <= Date.now()) {
    console.info('[push-cron]', { kind: job.kind, outcome: 'skipped_expired' });
    return;
  }
  const subscribers = job.subscriber_id
    ? { results: [await env.RATE_LIMITS.prepare('SELECT * FROM push_subscriptions WHERE subscriber_id = ?1 AND enabled = 1').bind(job.subscriber_id).first()].filter(Boolean) }
    : await env.RATE_LIMITS.prepare('SELECT * FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1 LIMIT 20').bind(job.trip_id).all();
  for (const subscriber of subscribers.results || []) {
    if (job.kind === 'collaboration' && subscriber.uid === job.actor_uid) {
      console.info('[push-cron]', { kind: job.kind, outcome: 'skipped_actor' });
      continue;
    }
    const preferences = normalizePreferences(JSON.parse(subscriber.preferences_json));
    if (!preferenceAllows(preferences, job.kind)) {
      console.info('[push-cron]', { kind: job.kind, outcome: 'skipped_preference' });
      continue;
    }
    const membershipKey = `${subscriber.trip_id}:${subscriber.uid}`;
    if (!membershipCache.has(membershipKey)) {
      membershipCache.set(membershipKey, await stillAuthorized(subscriber.uid, subscriber.trip_id, env));
    }
    if (!membershipCache.get(membershipKey)) {
      console.info('[push-cron]', { kind: job.kind, outcome: 'skipped_membership' });
      await env.RATE_LIMITS.prepare('DELETE FROM push_subscriptions WHERE subscriber_id = ?1').bind(subscriber.subscriber_id).run();
      continue;
    }
    try {
      await sendPush(JSON.parse(subscriber.subscription_json), {
        ...genericPayload(job.kind, {
          eventAt: job.event_at,
          title: job.event_title,
          localTime: job.local_time,
        }),
        tag: `hounigo-${job.kind}-${job.job_id}`,
      }, env);
      console.info('[push-cron]', { kind: job.kind, outcome: 'sent' });
      if (job.kind !== 'collaboration' && job.event_at != null && job.entity_key) {
        const sentKey = await sentReminderDispatchKey(subscriber.subscriber_id, job.entity_key, job.kind, Number(job.event_at));
        await env.RATE_LIMITS.prepare('INSERT OR IGNORE INTO push_dispatches (dispatch_key, trip_id, created_at) VALUES (?1, ?2, ?3)')
          .bind(sentKey, job.trip_id, Date.now()).run();
      }
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        console.info('[push-cron]', { kind: job.kind, outcome: `apns_gone_${error.statusCode}` });
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
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      console.warn('[push-cron] job deferred', {
        kind: job.kind,
        attempts,
        reason: safeCronErrorReason(error),
      });
      if (attempts >= 3) await env.RATE_LIMITS.prepare('DELETE FROM push_jobs WHERE job_id = ?1').bind(job.job_id).run();
      else await env.RATE_LIMITS.prepare('UPDATE push_jobs SET attempts = ?2, due_at = ?3 WHERE job_id = ?1')
        .bind(job.job_id, attempts, Date.now() + 5 * 60_000).run();
    }
  }
}

export const pushTestHelpers = {
  normalizePreferences,
  preferenceAllows,
  validSubscription,
  validReminder,
  genericPayload,
  formatActualLeadText,
  upsertReminderJobs,
  parseServiceAccountConfig,
  safeCronErrorReason,
  stillAuthorized,
};
