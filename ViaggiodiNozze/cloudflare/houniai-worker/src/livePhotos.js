import { hashIdentity, readFirestoreFields, validateTripId } from './core.js';

export const PHOTO_MAX_BYTES = 512000;
export const PHOTO_TOTAL_LIMIT = 400; // Lifetime reservations, including failed/deleted uploads: <= 205 MB.
export const PHOTO_DAY_LIMIT = 80;
export const PHOTO_UID_DAY_LIMIT = 20;
export const PHOTO_UID_MINUTE_LIMIT = 3;
const ID = /^[a-f0-9]{48}$/;
const error = (status, message) => Object.assign(new Error(message), { status });

async function throwFirestoreWriteError(response, endpoint) {
  const body = await response.json().catch(() => ({}));
  const code = String(body?.error?.status || body?.error?.code || 'UNKNOWN')
    .replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48);
  // Do not log user content, credentials, Firestore document paths or personal data.
  console.error('HOUNIGO_LIVE_FIRESTORE_WRITE_FAILED', { endpoint, httpStatus: response.status, code });
  if (response.status === 403) throw error(503, 'Servizio LIVE non autorizzato alla scrittura. Contatta gli organizzatori.');
  throw error(503, 'Salvataggio LIVE non riuscito. Riprova tra poco.');
}

// Only baseline JPEG from the client canvas. Strip ALL APP and comment segments
// again on the server; reject malformed/trailing data, progressive images and huge dimensions.
export function sanitizeJpeg(input) {
  const b = new Uint8Array(input);
  if (b.length < 20 || b.length > PHOTO_MAX_BYTES || b[0] !== 255 || b[1] !== 216) throw error(415, 'Immagine JPEG non valida.');
  let p = 2, dimensions = false;
  const parts = [b.subarray(0, 2)];
  while (p < b.length) {
    const start = p;
    if (b[p++] !== 255) throw error(415, 'Struttura JPEG non valida.');
    const marker = b[p++];
    if (![0xe0,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xeb,0xec,0xed,0xee,0xef,0xfe,0xc0,0xc4,0xdb,0xdd,0xda].includes(marker)) throw error(415, 'Formato JPEG non supportato.');
    const length = (b[p] << 8) | b[p + 1];
    if (length < 2 || p + length > b.length) throw error(415, 'Immagine incompleta.');
    if (marker === 0xc0) {
      const height = (b[p + 3] << 8) | b[p + 4], width = (b[p + 5] << 8) | b[p + 6];
      const channels = b[p + 7];
      if (dimensions || length !== 8 + channels * 3 || ![1,3].includes(channels) || b[p + 2] !== 8
          || !width || !height || width > 2000 || height > 2000 || width * height > 4_000_000) throw error(415, 'Dimensioni immagine non supportate.');
      dimensions = true;
    }
    p += length;
    if (marker === 0xda) {
      if (!dimensions) throw error(415, 'Dimensioni JPEG mancanti.');
      while (p < b.length) {
        if (b[p++] !== 255) continue;
        const next = b[p++];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) continue;
        if (next === 0xd9 && p === b.length) {
          parts.push(b.subarray(start, p));
          const result = new Uint8Array(parts.reduce((n, v) => n + v.length, 0));
          let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
          return result;
        }
        throw error(415, 'Dati JPEG non validi.');
      }
      throw error(415, 'Immagine incompleta.');
    }
    if (marker < 0xe0 || marker > 0xef) { if (marker !== 0xfe) parts.push(b.subarray(start, p)); }
  }
  throw error(415, 'Immagine incompleta.');
}

async function boundedBody(request) {
  if (Number(request.headers.get('Content-Length')) > PHOTO_MAX_BYTES) throw error(413, 'Foto troppo grande: massimo 500 KB.');
  const reader = request.body?.getReader();
  if (!reader) throw error(400, 'Foto mancante.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > PHOTO_MAX_BYTES) { await reader.cancel(); throw error(413, 'Foto troppo grande: massimo 500 KB.'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}

async function gate(database, bucket, limit, expiry) {
  const row = await database.prepare(`INSERT INTO live_photo_requests(bucket,count,expires_at) VALUES (?1,1,?3)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ?2 RETURNING count`)
    .bind(bucket, limit, expiry).first();
  if (!row) throw error(429, 'Limite foto gratuito raggiunto. Riprova più tardi; la foto resta sul dispositivo.');
  return Number(row.count);
}

export async function handleLivePhotoRequest(request, env, security) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin', 'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const reply = (status, body) => Response.json(body, { status, headers });
  try {
    if (env.LIVE_PHOTOS_ENABLED !== 'true' || env.LIVE_PHOTOS_FREE_PLAN_CONFIRMED !== 'true' || !env.LIVE_PHOTOS || !env.RATE_LIMITS) {
      throw error(503, 'Foto LIVE non ancora attivate. La foto resta sul dispositivo.');
    }
    const url = new URL(request.url), segments = url.pathname.split('/').filter(Boolean);
    const tripId = validateTripId(segments[2]), id = segments[3], action = segments[4];
    const isPublicEndpoint = (id === 'comments' || id === 'reactions' || id === 'guest-messages' || id === 'last-location') && !action;
    const isLastLocationGet = request.method === 'GET' && id === 'last-location' && !action;
    const isCommentPost = request.method === 'POST' && id === 'comments' && !action;
    const isReactionPost = request.method === 'POST' && id === 'reactions' && !action;
    const isGuestMessagePost = request.method === 'POST' && id === 'guest-messages' && !action;
    if (!tripId || (id && !isPublicEndpoint && !ID.test(id)) || segments.length > 5 || (action && action !== 'publish')) throw error(404, 'Foto non disponibile.');
    if (request.method === 'OPTIONS') {
      if (origin !== env.ALLOWED_ORIGIN) throw error(403, 'Origine non autorizzata.');
      return new Response(null, { status: 204, headers });
    }
    const read = request.method === 'GET' && id && !action;
    if (!read && origin !== env.ALLOWED_ORIGIN) throw error(403, 'Origine non autorizzata.');
    if (!read && !['POST','DELETE'].includes(request.method)) throw error(405, 'Operazione non supportata.');
    // Always start at D1 primary. A stale KV replica must never bypass a revocation.
    const database = env.RATE_LIMITS.withSession('first-primary');
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const ip = await hashIdentity(request.headers.get('CF-Connecting-IP') || 'unknown');
    const dailyCount = await gate(database, `${read ? 'read' : 'mutation'}:${day}`, read ? 20000 : 1000, now + 172800000);
    if (dailyCount % 100 === 0) {
      // Bounded cleanup of THIS module's counters only, even after the upload
      // budget is full. Never touch AI/push counters or scan their tables.
      await database.prepare('DELETE FROM live_photo_requests WHERE bucket IN (SELECT bucket FROM live_photo_requests WHERE expires_at < ?1 LIMIT 1000)').bind(now).run();
    }
    await gate(database, `ip:${Math.floor(now / 60000)}:${ip}`, 120, now + 120000);
    const key = id ? `photo:${tripId}:${id}` : null;
    if (isLastLocationGet) {
      if (typeof security.getServiceAccountToken !== 'function') throw error(503, 'Posizione non disponibile.');
      const token = await security.getServiceAccountToken(env);
      const feed = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}`, token, env);
      const publicFeed = readFirestoreFields(feed?.fields || {});
      if (!feed?.fields || publicFeed.deleted === true || publicFeed.status === 'disabled') {
        throw error(404, 'Feed LIVE non disponibile.');
      }
      const [lease, location] = await Promise.all([
        security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/gps_control/current`, token, env),
        security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/locations/current`, token, env),
      ]);
      const leaseData = readFirestoreFields(lease?.fields || {});
      const locData = readFirestoreFields(location?.fields || {});
      // A deliberate pause/stop revokes the public projection. Never return private lease fields.
      if (leaseData.status === 'stopped' || leaseData.status === 'paused'
          || locData.status === 'stopped' || locData.status === 'paused') {
        return reply(200, { available: false, stopped: true });
      }
      const leaseExpiry = Date.parse(lease?.fields?.expiresAt?.timestampValue || '');
      const capturedAt = location?.fields?.updatedAt?.timestampValue || '';
      const latitude = Number(locData.lat), longitude = Number(locData.lng);
      const validCoords = Number.isFinite(latitude) && Math.abs(latitude) <= 90
        && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
      if (leaseData.status !== 'active' || !Number.isFinite(leaseExpiry) || leaseExpiry <= now
          || locData.status !== 'active' || !location?.fields || !validCoords
          || !Number.isFinite(Date.parse(capturedAt))
          || !leaseData.holderDeviceId || leaseData.holderDeviceId !== locData.publisherDeviceId) {
        return reply(200, { available: false, stopped: false });
      }
      return reply(200, {
        available: true, stopped: false,
        location: {
          lat: latitude, lng: longitude,
          accuracy: Number.isFinite(Number(locData.accuracy)) ? Number(locData.accuracy) : 0,
          city: typeof locData.city === 'string' ? locData.city.slice(0, 120) : '',
          country: typeof locData.country === 'string' ? locData.country.slice(0, 120) : '',
          updatedAt: capturedAt,
          status: 'active',
        },
      });
    }
    if (read) {
      const row = await database.prepare('SELECT status FROM live_photo_objects WHERE id=?1 AND trip_id=?2').bind(id, tripId).first();
      if (row?.status !== 'published') throw error(404, 'Foto non disponibile.');
      const data = await env.LIVE_PHOTOS.get(key, { type: 'arrayBuffer' });
      if (!data) throw error(404, 'Foto in propagazione o non disponibile. Riprova tra poco.');
      const current = await database.prepare('SELECT status FROM live_photo_objects WHERE id=?1 AND trip_id=?2').bind(id, tripId).first();
      if (current?.status !== 'published') throw error(404, 'Foto non disponibile.');
      return new Response(data, { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
    }
    if (isCommentPost) {
      await gate(database, `comment_day:${day}`, 500, now + 172800000);
      await gate(database, `comment_ip:${Math.floor(now / 60000)}:${ip}`, 5, now + 120000);
      const rawText = await request.text();
      if (!rawText || rawText.length > 2048) throw error(400, 'Richiesta commento non valida.');
      let body;
      try { body = JSON.parse(rawText); } catch { throw error(400, 'JSON non valido.'); }
      const postId = validateTripId(body?.postId);
      const cleanAuthor = String(body?.authorName || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const cleanText = String(body?.text || '').trim().replace(/\s+/g, ' ').slice(0, 280);
      if (!postId || !cleanAuthor || !cleanText || /[<>]|javascript:|data:text\/html/i.test(`${cleanAuthor} ${cleanText}`)) {
        throw error(400, 'Nome o commento non validi.');
      }
      if (typeof security.getServiceAccountToken !== 'function') throw error(503, 'Servizio commenti non configurato.');
      const saToken = await security.getServiceAccountToken(env);
      const post = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(postId)}`, saToken, env);
      const postData = readFirestoreFields(post?.fields || {});
      if (postData.publicSchemaVersion !== 2 || postData.deleted === true || !postData.photoUrl) {
        throw error(404, 'Foto pubblica non trovata.');
      }
      const fsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(postId)}/comments`;
      const fsRes = await fetch(fsUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            authorName: { stringValue: cleanAuthor },
            text: { stringValue: cleanText },
            createdAt: { integerValue: String(now) },
            deleted: { booleanValue: false },
            publicSchemaVersion: { integerValue: '2' }
          }
        })
      });
      if (!fsRes.ok) await throwFirestoreWriteError(fsRes, 'photo-comment');
      const created = await fsRes.json();
      return reply(201, { id: created.name?.split('/').at(-1) || '', createdAt: now });
    }
    if (isReactionPost) {
      await gate(database, `reaction_day:${day}`, 2000, now + 172800000);
      await gate(database, `reaction_ip:${Math.floor(now / 60000)}:${ip}`, 20, now + 120000);
      const rawText = await request.text();
      if (!rawText || rawText.length > 1024) throw error(400, 'Richiesta reazione non valida.');
      let body;
      try { body = JSON.parse(rawText); } catch { throw error(400, 'JSON non valido.'); }
      const ALLOWED_REACTIONS = ['❤️', '😍', '😂', '👋'];
      const updateId = validateTripId(body?.updateId);
      const type = String(body?.type || '');
      const visitorId = typeof body?.visitorId === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(body.visitorId) ? body.visitorId : null;
      if (!updateId || !ALLOWED_REACTIONS.includes(type) || !visitorId) throw error(400, 'Reazione o visitatore non validi.');
      if (typeof security.getServiceAccountToken !== 'function') throw error(503, 'Servizio reazioni non configurato.');
      const saToken = await security.getServiceAccountToken(env);
      const feedDoc = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}`, saToken, env);
      const feedData = readFirestoreFields(feedDoc?.fields || {});
      if (!feedDoc?.fields || feedData.deleted === true || feedData.status === 'disabled') {
        throw error(404, 'Feed LIVE non attivo.');
      }
      const updateDoc = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(updateId)}`, saToken, env);
      const updateData = readFirestoreFields(updateDoc?.fields || {});
      if (!updateDoc?.fields || updateData.publicSchemaVersion !== 2 || updateData.deleted === true) {
        throw error(404, 'Aggiornamento pubblico non trovato.');
      }
      let prevType = null;
      const existingReaction = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(updateId)}/reactions/${encodeURIComponent(visitorId)}`, saToken, env);
      if (existingReaction?.fields) prevType = readFirestoreFields(existingReaction.fields).type || null;
      const currentCounts = updateData.reactionCounts && typeof updateData.reactionCounts === 'object' ? updateData.reactionCounts : {};
      const nextCounts = {};
      for (const emoji of ALLOWED_REACTIONS) {
        const n = Number(currentCounts[emoji]);
        nextCounts[emoji] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
      }
      if (prevType === type) {
        return reply(200, { reactionCounts: nextCounts, selected: type, unchanged: true });
      }
      if (prevType && ALLOWED_REACTIONS.includes(prevType) && nextCounts[prevType] > 0) {
        nextCounts[prevType] -= 1;
      }
      nextCounts[type] = (nextCounts[type] || 0) + 1;

      const reactionUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(updateId)}/reactions/${encodeURIComponent(visitorId)}`;
      const rRes = await fetch(reactionUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            type: { stringValue: type },
            visitorId: { stringValue: visitorId },
            timestamp: { integerValue: String(now) }
          }
        })
      });
      if (!rRes.ok) await throwFirestoreWriteError(rRes, 'reaction');

      const countFields = Object.fromEntries(ALLOWED_REACTIONS.map(emoji => [emoji, { integerValue: String(nextCounts[emoji]) }]));
      const updatePatchUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(updateId)}?updateMask.fieldPaths=reactionCounts`;
      const uRes = await fetch(updatePatchUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            reactionCounts: { mapValue: { fields: countFields } }
          }
        })
      });
      if (!uRes.ok) await throwFirestoreWriteError(uRes, 'reaction-count');
      return reply(200, { reactionCounts: nextCounts, selected: type });
    }
    if (isGuestMessagePost) {
      await gate(database, `guest_msg_day:${day}`, 300, now + 172800000);
      await gate(database, `guest_msg_ip:${Math.floor(now / 60000)}:${ip}`, 3, now + 120000);
      await gate(database, `guest_msg_trip_ip:${tripId}:${day}:${ip}`, 15, now + 172800000);
      const rawText = await request.text();
      if (!rawText || rawText.length > 2048) throw error(400, 'Richiesta messaggio non valida.');
      let body;
      try { body = JSON.parse(rawText); } catch { throw error(400, 'JSON non valido.'); }
      const cleanAuthor = String(body?.authorName || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const cleanMsg = String(body?.message || '').trim().replace(/\s+/g, ' ').slice(0, 280);
      const rawVisitor = typeof body?.visitorId === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(body.visitorId) ? body.visitorId : `vis_${ip.slice(0, 24)}`;
      if (!cleanAuthor || !cleanMsg || /[<>]|javascript:|data:text\/html/i.test(`${cleanAuthor} ${cleanMsg}`)) {
        throw error(400, 'Nome o messaggio non validi.');
      }
      if (typeof security.getServiceAccountToken !== 'function') throw error(503, 'Servizio messaggi non configurato.');
      const saToken = await security.getServiceAccountToken(env);
      const feedDoc = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}`, saToken, env);
      const feedData = readFirestoreFields(feedDoc?.fields || {});
      if (!feedDoc?.fields || feedData.deleted === true || feedData.status === 'disabled') {
        throw error(404, 'Feed LIVE non attivo.');
      }
      const msgUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/live_feeds/${encodeURIComponent(tripId)}/guest_messages`;
      const fsRes = await fetch(msgUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            visitorId: { stringValue: rawVisitor },
            authorName: { stringValue: cleanAuthor },
            message: { stringValue: cleanMsg },
            createdAt: { integerValue: String(now) },
            hidden: { booleanValue: false },
            deleted: { booleanValue: false },
            publicSchemaVersion: { integerValue: '2' }
          }
        })
      });
      if (!fsRes.ok) await throwFirestoreWriteError(fsRes, 'guest-message');
      const created = await fsRes.json();
      return reply(201, { id: created.name?.split('/').at(-1) || '', createdAt: now });
    }
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!token || token.length > 8192) throw error(401, 'Sessione Firebase non valida.');
    await gate(database, `auth:${Math.floor(now / 60000)}:${ip}`, 12, now + 120000);
    const uid = await security.verifyFirebaseIdentity(token, env);
    if (!uid) throw error(401, 'Accedi con il tuo account per pubblicare foto.');
    try {
      const part = token.split('.')[1];
      const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.sub !== uid || claims.aud !== env.FIREBASE_PROJECT_ID
          || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
          || !claims.firebase?.sign_in_provider || claims.firebase.sign_in_provider === 'anonymous') throw new Error();
    } catch { throw error(401, 'Sessione Firebase non valida o anonima.'); }
    await gate(database, `mutation:${Math.floor(now / 60000)}:${await hashIdentity(uid)}`, 10, now + 120000);
    if (!await security.assertEditor(uid, tripId, token, env)) throw error(403, 'Solo Owner e Copilota possono pubblicare o rimuovere foto.');
    if (request.method === 'POST' && !id) {
      if (request.headers.get('Content-Type') !== 'image/jpeg') throw error(415, 'Formato richiesto: JPEG.');
      const image = sanitizeJpeg(await boundedBody(request));
      const photoId = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
      // One atomic conditional insert: no eventually-consistent KV counters.
      // Reservations are NEVER refunded, including failed uploads or deletion.
      const reserved = await database.prepare(`INSERT INTO live_photo_objects(id,trip_id,owner_hash,bytes,status,created_at)
        SELECT ?1,?2,?3,?4,'pending',?5 WHERE
        (SELECT COUNT(*) FROM live_photo_objects) < 400 AND
        (SELECT COUNT(*) FROM live_photo_objects WHERE created_at >= ?6) < 80 AND
        (SELECT COUNT(*) FROM live_photo_objects WHERE owner_hash=?3 AND created_at >= ?6) < 20 AND
        (SELECT COUNT(*) FROM live_photo_objects WHERE owner_hash=?3 AND created_at >= ?7) < 3 RETURNING id`)
        .bind(photoId, tripId, await hashIdentity(uid), image.length, now, Date.parse(day + 'T00:00:00Z'), now - 60000).first();
      if (!reserved) throw error(429, 'Spazio o quota foto gratuita esauriti (massimo 400 caricamenti). La foto resta sul dispositivo.');
      try { await env.LIVE_PHOTOS.put(`photo:${tripId}:${photoId}`, image, { expirationTtl: 90 * 86400 }); }
      catch { await database.prepare("UPDATE live_photo_objects SET status='failed' WHERE id=?1").bind(photoId).run(); throw error(503, 'Archivio foto gratuito non disponibile o esaurito. La foto resta sul dispositivo.'); }
      await database.prepare('DELETE FROM live_photo_requests WHERE expires_at < ?1').bind(now).run();
      return reply(201, { photoId, downloadUrl: `${url.origin}/v1/live-photos/${tripId}/${photoId}`, path: `photo:${tripId}:${photoId}` });
    }
    if (!id) throw error(404, 'Foto non disponibile.');
    const row = await database.prepare('SELECT status,post_id,owner_hash FROM live_photo_objects WHERE id=?1 AND trip_id=?2').bind(id, tripId).first();
    if (!row) throw error(404, 'Foto non disponibile.');
    if (request.method === 'DELETE' && !action) {
      await database.prepare("UPDATE live_photo_objects SET status='deleted' WHERE id=?1 AND trip_id=?2").bind(id, tripId).run();
      let storageCleanupPending = false;
      try { await env.LIVE_PHOTOS.delete(key); } catch { storageCleanupPending = true; }
      return reply(200, { revoked: true, storageCleanupPending });
    }
    if (request.method === 'POST' && action === 'publish') {
      if (row.owner_hash !== await hashIdentity(uid)) throw error(403, 'Solo chi ha caricato la foto può confermarne la pubblicazione.');
      const postId = validateTripId(url.searchParams.get('postId'));
      if (!postId || row.status === 'deleted' || row.status === 'failed') throw error(409, 'Foto non pubblicabile.');
      const post = await security.getFirestoreDocument(`live_feeds/${encodeURIComponent(tripId)}/updates/${encodeURIComponent(postId)}`, token, env);
      const data = readFirestoreFields(post?.fields || {});
      if (data.publicSchemaVersion !== 2 || data.deleted === true || data.photoUrl !== `${url.origin}/v1/live-photos/${tripId}/${id}`) throw error(409, 'Pubblicazione LIVE non confermata. La foto resta privata.');
      const published = await database.prepare("UPDATE live_photo_objects SET status='published',post_id=?3 WHERE id=?1 AND trip_id=?2 AND status IN ('pending','published') RETURNING id")
        .bind(id, tripId, postId).first();
      if (!published) throw error(409, 'Foto rimossa o non pubblicabile.');
      return reply(200, { published: true });
    }
    throw error(405, 'Operazione non supportata.');
  } catch (err) {
    return reply(err.status || 503, { error: err.status ? err.message : 'Servizio foto gratuito temporaneamente non disponibile. La foto resta sul dispositivo.' });
  }
}
