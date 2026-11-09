import {
  CONSENT_VERSION,
  MAX_BODY_BYTES,
  MAX_GLOBAL_REQUESTS_PER_DAY,
  MAX_UID_REQUESTS_PER_DAY,
  MAX_UID_REQUESTS_PER_MINUTE,
  buildAiRequest,
  decodeBase64Image,
  hashIdentity,
  isAuthorizedEditor,
  readFirestoreFields,
  normalizeAiResponse,
  validateTripId,
} from './core.js';
import { dispatchDuePushJobs, handlePushRequest } from './push.js';

function corsHeaders(origin, env) {
  return {
    'Access-Control-Allow-Origin': origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function json(origin, env, status, body) {
  return Response.json(body, { status, headers: corsHeaders(origin, env) });
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function verifyFirebaseIdentity(idToken, env) {
  if (!idToken || !env.FIREBASE_WEB_API_KEY) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const user = payload?.users?.[0];
  return user?.localId && user.disabled !== true ? user.localId : null;
}

async function getFirestoreDocument(path, idToken, env) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('FIRESTORE_DENIED');
  return response.json();
}

async function assertGlobalAdmin(uid, idToken, env) {
  try {
    // 1. Verifica Secret server-side SYSTEM_ADMIN_UIDS (se configurato su Cloudflare)
    if (env.SYSTEM_ADMIN_UIDS) {
      const allowedUids = String(env.SYSTEM_ADMIN_UIDS).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
      if (allowedUids.includes(uid)) return true;
    }

    // 2. Verifica documento Firestore system_admins/{uid}
    const adminDoc = await getFirestoreDocument(`system_admins/${encodeURIComponent(uid)}`, idToken, env).catch(() => null);
    if (adminDoc && adminDoc.fields) return true;

    // 3. Verifica eventuale custom claim admin nel token JWT
    if (idToken && idToken.includes('.')) {
      try {
        const parts = idToken.split('.');
        const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
        if (payload?.admin === true || payload?.role === 'admin') return true;
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
}

async function assertTripMember(uid, tripId, idToken, env) {
  try {
    const encodedTripId = encodeURIComponent(tripId);
    const [trip, member] = await Promise.all([
      getFirestoreDocument(`trips/${encodedTripId}`, idToken, env).catch(() => null),
      getFirestoreDocument(`trips/${encodedTripId}/members/${encodeURIComponent(uid)}`, idToken, env).catch(() => null),
    ]);
    if (!trip) return false;
    const tripFields = readFirestoreFields(trip.fields || {});
    if (tripFields.ownerUid === uid || tripFields.ownerId === uid) return true;
    const memberFields = readFirestoreFields(member?.fields || {});
    const role = memberFields.role || '';
    return role === 'owner' || role === 'copilota' || role === 'viewer';
  } catch {
    return false;
  }
}

async function assertEditor(uid, tripId, idToken, env) {
  const encodedTripId = encodeURIComponent(tripId);
  const [trip, member] = await Promise.all([
    getFirestoreDocument(`trips/${encodedTripId}`, idToken, env),
    getFirestoreDocument(`trips/${encodedTripId}/members/${encodeURIComponent(uid)}`, idToken, env).catch(() => null),
  ]);
  return Boolean(trip && isAuthorizedEditor(uid, trip, member));
}

function getMidnightUtcIso() {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

async function incrementCounter(database, bucket, identityHash, limit, now, errorType) {
  const result = await database.prepare(`
    INSERT INTO ai_rate_limits (bucket, identity_hash, request_count, updated_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(bucket, identity_hash) DO UPDATE SET
      request_count = request_count + 1,
      updated_at = excluded.updated_at
    RETURNING request_count
  `).bind(bucket, identityHash, now).first();
  const count = Number(result?.request_count || 1);
  if (count > limit) throw new Error(errorType || 'RATE_LIMITED');
  return count;
}

async function enforceRateLimits(uid, tripId, env) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60_000);
  const identityHash = await hashIdentity(`${uid}|${tripId}`);
  await incrementCounter(env.RATE_LIMITS, `minute:${minute}`, identityHash, MAX_UID_REQUESTS_PER_MINUTE, now, 'RATE_LIMITED_MINUTE');
  const userCount = await incrementCounter(env.RATE_LIMITS, `day:${day}`, identityHash, MAX_UID_REQUESTS_PER_DAY, now, 'RATE_LIMITED_USER_DAILY');
  await incrementCounter(env.RATE_LIMITS, `global:${day}`, 'global', MAX_GLOBAL_REQUESTS_PER_DAY, now, 'RATE_LIMITED_GLOBAL_DAILY');

  const remainingToday = Math.max(0, MAX_UID_REQUESTS_PER_DAY - userCount);
  const resetAtUtc = getMidnightUtcIso();

  const rollback = async () => {
    await env.RATE_LIMITS.prepare('UPDATE ai_rate_limits SET request_count = MAX(0, request_count - 1) WHERE bucket = ?1 AND identity_hash = ?2')
      .bind(`day:${day}`, identityHash).run().catch(() => null);
    await env.RATE_LIMITS.prepare('UPDATE ai_rate_limits SET request_count = MAX(0, request_count - 1) WHERE bucket = ?1 AND identity_hash = ?2')
      .bind(`global:${day}`, 'global').run().catch(() => null);
  };

  return { remainingToday, resetAtUtc, rollback };
}

async function runAi(requestBody, env) {
  const prepared = buildAiRequest(requestBody);
  if (prepared.kind === 'vision') decodeBase64Image(prepared.imageBase64);
  const response = await env.AI.run(prepared.model, prepared.input);
  return normalizeAiResponse(response);
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (origin !== env.ALLOWED_ORIGIN) return json(origin, env, 403, { error: 'Origine non autorizzata.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
  const pathname = new URL(request.url).pathname;
  const isAiRequest = pathname === '/v1/houniai';
  const isPushRequest = pathname.startsWith('/v1/push/');
  if (request.method !== 'POST' || (!isAiRequest && !isPushRequest)) {
    return json(origin, env, 404, { error: 'Endpoint non disponibile.' });
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json(origin, env, 413, { error: 'Contenuto troppo grande.' });

  const idToken = bearerToken(request);
  const uid = await verifyFirebaseIdentity(idToken, env);
  if (!uid) return json(origin, env, 401, { error: 'Sessione Firebase non valida.' });

  let payload;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(origin, env, 413, { error: 'Contenuto troppo grande.' });
    }
    payload = JSON.parse(rawBody);
  } catch {
    return json(origin, env, 400, { error: 'Richiesta non valida.' });
  }
  const tripId = validateTripId(payload?.tripId);
  if (!tripId) return json(origin, env, 400, { error: 'Viaggio non valido.' });
  if (isAiRequest && payload?.consentVersion !== CONSENT_VERSION) {
    return json(origin, env, 428, { error: 'Informativa privacy non accettata.' });
  }
  const isAdminPushRequest = pathname.startsWith('/v1/push/admin-');
  if (isAdminPushRequest) {
    const isAdmin = await assertGlobalAdmin(uid, idToken, env);
    if (!isAdmin) {
      return json(origin, env, 403, { error: 'Operazione riservata esclusivamente agli amministratori globali (system_admins).' });
    }
  } else if (isPushRequest) {
    const isMember = await assertTripMember(uid, tripId, idToken, env);
    if (!isMember) {
      return json(origin, env, 403, { error: 'Non sei autorizzato per le notifiche di questo viaggio.' });
    }
  } else if (!(await assertEditor(uid, tripId, idToken, env))) {
    return json(origin, env, 403, { error: 'HouniAI e le modifiche al viaggio sono riservate a Owner e Copilota autorizzati.' });
  }

  if (isPushRequest) {
    try {
      const result = await handlePushRequest(pathname, uid, tripId, payload, env);
      return json(origin, env, 200, result);
    } catch (error) {
      const code = error?.message || 'PUSH_UNAVAILABLE';
      const status = code.includes('NOT_AUTHORIZED') ? 403
        : code.includes('NOT_FOUND') ? 404
        : code.includes('RATE_LIMITED') || code.includes('QUOTA') ? 429
        : code.includes('INVALID') ? 400 : 503;
      const resBody = {
        error: status === 503
          ? 'Notifiche non disponibili. I promemoria nell’app restano attivi.'
          : code
      };
      if (error?.retryAfter) {
        resBody.retryAfter = error.retryAfter;
      }
      return json(origin, env, status, resBody);
    }
  }

  let quotaInfo = null;
  try {
    quotaInfo = await enforceRateLimits(uid, tripId, env);
    const text = await runAi(payload?.requestBody, env);
    return json(origin, env, 200, {
      text,
      remainingToday: quotaInfo.remainingToday,
      resetAtUtc: quotaInfo.resetAtUtc
    });
  } catch (error) {
    if (error?.message === 'RATE_LIMITED_MINUTE') {
      return json(origin, env, 429, {
        error: 'Troppe richieste ravvicinate. Attendi 30 secondi prima di riprovare.',
        reason: 'rate_limited_minute',
        retryAfter: 30
      });
    }
    if (error?.message === 'RATE_LIMITED_USER_DAILY') {
      const resetUtc = getMidnightUtcIso();
      return json(origin, env, 429, {
        error: `Quota giornaliera HouniAI raggiunta (${MAX_UID_REQUESTS_PER_DAY}/${MAX_UID_REQUESTS_PER_DAY}). Reset alle 00:00 UTC (ore 01:00/02:00 italiane).`,
        reason: 'daily_user_limit',
        remainingToday: 0,
        resetAtUtc: resetUtc
      });
    }
    if (error?.message === 'RATE_LIMITED_GLOBAL_DAILY') {
      const resetUtc = getMidnightUtcIso();
      return json(origin, env, 429, {
        error: 'Quota globale del servizio temporaneamente esaurita per oggi. Reset alle 00:00 UTC.',
        reason: 'daily_global_limit',
        resetAtUtc: resetUtc
      });
    }
    if (error?.message === 'RATE_LIMITED') {
      return json(origin, env, 429, { error: 'Quota HouniAI raggiunta. Riprova più tardi.', reason: 'rate_limited' });
    }
    if (error?.message === 'IMAGE_TOO_LARGE') return json(origin, env, 413, { error: 'Immagine troppo grande per l’analisi gratuita.' });
    if (quotaInfo?.rollback) {
      await quotaInfo.rollback().catch(() => null);
    }
    return json(origin, env, 503, { error: 'HouniAI non disponibile. Continua con l’inserimento manuale.' });
  }
}

export default {
  fetch: handleRequest,
  scheduled(_controller, env, context) {
    context.waitUntil(dispatchDuePushJobs(env));
  }
};
