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
  normalizeAiResponse,
  validateTripId,
} from './core.js';

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

async function assertEditor(uid, tripId, idToken, env) {
  const encodedTripId = encodeURIComponent(tripId);
  const [trip, member] = await Promise.all([
    getFirestoreDocument(`trips/${encodedTripId}`, idToken, env),
    getFirestoreDocument(`trips/${encodedTripId}/members/${encodeURIComponent(uid)}`, idToken, env).catch(() => null),
  ]);
  return Boolean(trip && isAuthorizedEditor(uid, trip, member));
}

async function incrementCounter(database, bucket, identityHash, limit, now) {
  const result = await database.prepare(`
    INSERT INTO ai_rate_limits (bucket, identity_hash, request_count, updated_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(bucket, identity_hash) DO UPDATE SET
      request_count = request_count + 1,
      updated_at = excluded.updated_at
    RETURNING request_count
  `).bind(bucket, identityHash, now).first();
  if (!result || Number(result.request_count) > limit) throw new Error('RATE_LIMITED');
}

async function enforceRateLimits(uid, tripId, env) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60_000);
  const identityHash = await hashIdentity(`${uid}|${tripId}`);
  await incrementCounter(env.RATE_LIMITS, `minute:${minute}`, identityHash, MAX_UID_REQUESTS_PER_MINUTE, now);
  await incrementCounter(env.RATE_LIMITS, `day:${day}`, identityHash, MAX_UID_REQUESTS_PER_DAY, now);
  await incrementCounter(env.RATE_LIMITS, `global:${day}`, 'global', MAX_GLOBAL_REQUESTS_PER_DAY, now);
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
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/houniai') {
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
  if (payload?.consentVersion !== CONSENT_VERSION) {
    return json(origin, env, 428, { error: 'Informativa privacy non accettata.' });
  }
  if (!(await assertEditor(uid, tripId, idToken, env))) {
    return json(origin, env, 403, { error: 'HouniAI è riservata a Owner e Copilota autorizzati.' });
  }

  try {
    await enforceRateLimits(uid, tripId, env);
    const text = await runAi(payload?.requestBody, env);
    return json(origin, env, 200, { text });
  } catch (error) {
    if (error?.message === 'RATE_LIMITED') return json(origin, env, 429, { error: 'Quota HouniAI giornaliera raggiunta.' });
    if (error?.message === 'IMAGE_TOO_LARGE') return json(origin, env, 413, { error: 'Immagine troppo grande per l’analisi gratuita.' });
    return json(origin, env, 503, { error: 'HouniAI non disponibile. Continua con l’inserimento manuale.' });
  }
}

export default { fetch: handleRequest };
