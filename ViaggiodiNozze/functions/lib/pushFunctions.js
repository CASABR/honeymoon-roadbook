"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchDuePushNotifications = exports.recordPushMutation = exports.sendTestPush = exports.unregisterPushSubscription = exports.getPushRegistrationStatus = exports.registerPushSubscription = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const web_push_1 = __importDefault(require("web-push"));
const pushCore_1 = require("./pushCore");
const vapidPublicKey = (0, params_1.defineSecret)('VAPID_PUBLIC_KEY');
const vapidPrivateKey = (0, params_1.defineSecret)('VAPID_PRIVATE_KEY');
const vapidMailto = (0, params_1.defineSecret)('VAPID_MAILTO');
const PUSH_SECRETS = [vapidPublicKey, vapidPrivateKey, vapidMailto];
const ALLOWED_COLLECTIONS = new Set(['trasporti', 'attivita', 'alloggi']);
const COLLABORATION_ENTITIES = new Set([
    'giorni', 'attivita', 'activity', 'alloggi', 'alloggio', 'trasporti', 'trasporto',
    'documenti', 'tappe', 'tappa', 'ristoranti', 'ristorante', 'shopping', 'spese',
    'spesa', 'note', 'nota', 'bagagli', 'bagaglio',
]);
const BASE_PATH = '/honeymoon-roadbook/';
function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
function expectedSubscriberId(uid, tripId, deviceId) {
    return hash(`${uid}\n${tripId}\n${deviceId}`).slice(0, 48);
}
function requireString(value, name, maxLength = 200) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
        throw new https_1.HttpsError('invalid-argument', `${name} non valido.`);
    }
    return value.trim();
}
function parseSubscription(value) {
    const subscription = value && typeof value === 'object' ? value : {};
    const endpoint = requireString(subscription.endpoint, 'Subscription endpoint', 2048);
    if (!endpoint.startsWith('https://'))
        throw new https_1.HttpsError('invalid-argument', 'Subscription endpoint non sicuro.');
    const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {};
    return {
        endpoint,
        expirationTime: typeof subscription.expirationTime === 'number' ? subscription.expirationTime : null,
        keys: {
            p256dh: requireString(keys.p256dh, 'Chiave subscription', 512),
            auth: requireString(keys.auth, 'Autorizzazione subscription', 512),
        },
    };
}
async function getTripRole(db, tripId, uid) {
    var _a;
    const tripRef = db.collection('trips').doc(tripId);
    const member = await tripRef.collection('members').doc(uid).get();
    const trip = await tripRef.get();
    const data = trip.data() || {};
    if (trip.exists && (data.ownerUid === uid || data.ownerId === uid))
        return 'owner';
    if (member.exists) {
        const role = (_a = member.data()) === null || _a === void 0 ? void 0 : _a.role;
        return role === 'owner' || role === 'copilota' ? role : 'viewer';
    }
    if (trip.exists && Array.isArray(data.members) && data.members.includes(uid))
        return 'viewer';
    return null;
}
async function assertTripMember(db, tripId, uid) {
    const role = await getTripRole(db, tripId, uid);
    if (role)
        return role;
    throw new https_1.HttpsError('permission-denied', 'Non sei autorizzato per questo viaggio.');
}
function configureWebPush() {
    const publicKey = vapidPublicKey.value();
    const privateKey = vapidPrivateKey.value();
    const mailto = vapidMailto.value();
    if (!publicKey || !privateKey || !mailto)
        throw new https_1.HttpsError('failed-precondition', 'Configurazione push server incompleta.');
    web_push_1.default.setVapidDetails(mailto.startsWith('mailto:') ? mailto : `mailto:${mailto}`, publicKey, privateKey);
}
function jobId(subscriberId, entityKey, kind) {
    return hash(`${subscriberId}|${entityKey}|${kind}`).slice(0, 56);
}
function possibleKinds(collection) {
    if (collection === 'note')
        return ['deadline_due'];
    if (collection === 'trasporti')
        return ['transport_departure', 'rental_return'];
    if (collection === 'attivita')
        return ['activity_start'];
    return ['lodging_checkin', 'lodging_checkout'];
}
async function listTripSubscribers(db, tripId) {
    const snapshot = await db.collection('push_subscribers')
        .where('tripId', '==', tripId)
        .where('enabled', '==', true)
        .limit(50)
        .get();
    return snapshot.docs;
}
async function replaceEntityJobs(db, tripId, collection, entityId, candidates) {
    var _a;
    const subscribers = await listTripSubscribers(db, tripId);
    const writer = db.bulkWriter();
    const entityKey = `${collection}/${entityId}`;
    for (const subscriber of subscribers) {
        const data = subscriber.data();
        const preferences = (0, pushCore_1.normalizePushPreferences)(data.preferences);
        for (const kind of possibleKinds(collection)) {
            writer.delete(db.collection('push_jobs').doc(jobId(subscriber.id, entityKey, kind)));
        }
        for (const item of candidates) {
            if (!(0, pushCore_1.preferenceAllows)(preferences, item.kind))
                continue;
            const dueAt = item.eventAt - ((_a = item.leadMinutes) !== null && _a !== void 0 ? _a : preferences.reminderMinutes) * 60000;
            if (dueAt <= Date.now())
                continue;
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
async function rebuildSubscriberJobs(db, subscriberId, subscriber) {
    var _a, _b;
    const writer = db.bulkWriter();
    const oldJobs = await db.collection('push_jobs').where('subscriberId', '==', subscriberId).limit(500).get();
    oldJobs.docs.forEach(doc => writer.delete(doc.ref));
    const fromDate = new Date(Date.now() - 24 * 60 * 60000).toISOString().slice(0, 10);
    for (const collection of [...ALLOWED_COLLECTIONS]) {
        const dateField = collection === 'alloggi' ? 'checkOut' : 'date';
        const records = await db.collection('trips').doc(subscriber.tripId).collection(collection)
            .where(dateField, '>=', fromDate)
            .orderBy(dateField)
            .limit(100)
            .get();
        for (const record of records.docs) {
            const entityKey = `${collection}/${record.id}`;
            const candidates = (0, pushCore_1.buildReminderCandidates)(collection, record.data());
            for (const item of candidates) {
                if (!(0, pushCore_1.preferenceAllows)(subscriber.preferences, item.kind))
                    continue;
                const dueAt = item.eventAt - ((_a = item.leadMinutes) !== null && _a !== void 0 ? _a : subscriber.preferences.reminderMinutes) * 60000;
                if (dueAt <= Date.now())
                    continue;
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
        const candidates = (0, pushCore_1.buildDeadlineReminderCandidate)(record.data());
        for (const item of candidates) {
            if (!(0, pushCore_1.preferenceAllows)(subscriber.preferences, item.kind))
                continue;
            const dueAt = item.eventAt - ((_b = item.leadMinutes) !== null && _b !== void 0 ? _b : subscriber.preferences.reminderMinutes) * 60000;
            if (dueAt <= Date.now())
                continue;
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
async function removeSubscriber(db, subscriberId) {
    const writer = db.bulkWriter();
    writer.delete(db.collection('push_subscribers').doc(subscriberId));
    const jobs = await db.collection('push_jobs').where('subscriberId', '==', subscriberId).limit(500).get();
    jobs.docs.forEach(doc => writer.delete(doc.ref));
    await writer.close();
}
async function sendPayload(db, subscriberId, subscriber, payload) {
    configureWebPush();
    try {
        await web_push_1.default.sendNotification(subscriber.subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
        await db.collection('push_subscribers').doc(subscriberId).set({ lastAcceptedAt: Date.now(), lastError: null }, { merge: true });
        return 'accepted';
    }
    catch (error) {
        const statusCode = Number((error === null || error === void 0 ? void 0 : error.statusCode) || 0);
        if (statusCode === 404 || statusCode === 410) {
            await removeSubscriber(db, subscriberId);
            return 'stale';
        }
        await db.collection('push_subscribers').doc(subscriberId).set({ lastError: `push_${statusCode || 'unknown'}`, updatedAt: Date.now() }, { merge: true });
        throw error;
    }
}
exports.registerPushSubscription = (0, https_1.onCall)({ cors: true, enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticazione richiesta.');
    const uid = request.auth.uid;
    const tripId = requireString((_a = request.data) === null || _a === void 0 ? void 0 : _a.tripId, 'tripId', 128);
    const deviceId = requireString((_b = request.data) === null || _b === void 0 ? void 0 : _b.deviceId, 'deviceId', 128);
    const subscriberId = requireString((_c = request.data) === null || _c === void 0 ? void 0 : _c.subscriberId, 'subscriberId', 64);
    if (subscriberId !== expectedSubscriberId(uid, tripId, deviceId))
        throw new https_1.HttpsError('permission-denied', 'Identificativo subscription non valido.');
    const subscription = parseSubscription((_d = request.data) === null || _d === void 0 ? void 0 : _d.subscription);
    const endpointHash = hash(subscription.endpoint);
    const preferences = (0, pushCore_1.normalizePushPreferences)((_e = request.data) === null || _e === void 0 ? void 0 : _e.preferences);
    const db = admin.firestore();
    const role = await assertTripMember(db, tripId, uid);
    const previousSubscriberId = typeof ((_f = request.data) === null || _f === void 0 ? void 0 : _f.previousSubscriberId) === 'string' ? request.data.previousSubscriberId : '';
    if (previousSubscriberId && previousSubscriberId !== subscriberId) {
        const previous = await db.collection('push_subscribers').doc(previousSubscriberId).get();
        if (previous.exists && ((_g = previous.data()) === null || _g === void 0 ? void 0 : _g.uid) === uid && ((_h = previous.data()) === null || _h === void 0 ? void 0 : _h.deviceId) === deviceId) {
            await removeSubscriber(db, previousSubscriberId);
        }
    }
    const duplicateEndpoints = await db.collection('push_subscribers').where('endpointHash', '==', endpointHash).limit(10).get();
    for (const duplicate of duplicateEndpoints.docs) {
        if (duplicate.id !== subscriberId)
            await removeSubscriber(db, duplicate.id);
    }
    const data = {
        uid, tripId, deviceId, enabled: true, endpointHash, subscription, preferences, role,
        updatedAt: Date.now(), userAgent: requireString(((_j = request.data) === null || _j === void 0 ? void 0 : _j.userAgent) || 'unknown', 'userAgent', 300),
    };
    await db.collection('push_subscribers').doc(subscriberId).set(Object.assign(Object.assign({}, data), { enabled: false }), { merge: true });
    await rebuildSubscriberJobs(db, subscriberId, data);
    await db.collection('push_subscribers').doc(subscriberId).set({ enabled: true, updatedAt: Date.now() }, { merge: true });
    return { active: true, subscriberId, endpointHash, remindersScheduled: true };
});
exports.getPushRegistrationStatus = (0, https_1.onCall)({ cors: true, enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticazione richiesta.');
    const uid = request.auth.uid;
    const tripId = requireString((_a = request.data) === null || _a === void 0 ? void 0 : _a.tripId, 'tripId', 128);
    const deviceId = requireString((_b = request.data) === null || _b === void 0 ? void 0 : _b.deviceId, 'deviceId', 128);
    const subscriberId = requireString((_c = request.data) === null || _c === void 0 ? void 0 : _c.subscriberId, 'subscriberId', 64);
    const endpointHash = requireString((_d = request.data) === null || _d === void 0 ? void 0 : _d.endpointHash, 'endpointHash', 64);
    if (subscriberId !== expectedSubscriberId(uid, tripId, deviceId))
        return { active: false, reason: 'identity-mismatch' };
    const db = admin.firestore();
    await assertTripMember(db, tripId, uid);
    const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
    const data = snapshot.data();
    const active = snapshot.exists && (data === null || data === void 0 ? void 0 : data.enabled) === true && (data === null || data === void 0 ? void 0 : data.uid) === uid && (data === null || data === void 0 ? void 0 : data.tripId) === tripId && (data === null || data === void 0 ? void 0 : data.deviceId) === deviceId && (data === null || data === void 0 ? void 0 : data.endpointHash) === endpointHash;
    return { active, reason: active ? 'registered' : 'not-registered', preferences: active ? (0, pushCore_1.normalizePushPreferences)(data === null || data === void 0 ? void 0 : data.preferences) : null };
});
exports.unregisterPushSubscription = (0, https_1.onCall)({ cors: true, enforceAppCheck: true }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticazione richiesta.');
    const subscriberId = requireString((_a = request.data) === null || _a === void 0 ? void 0 : _a.subscriberId, 'subscriberId', 64);
    const db = admin.firestore();
    const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
    if (snapshot.exists && ((_b = snapshot.data()) === null || _b === void 0 ? void 0 : _b.uid) !== request.auth.uid)
        throw new https_1.HttpsError('permission-denied', 'Subscription non autorizzata.');
    await removeSubscriber(db, subscriberId);
    return { inactive: true };
});
exports.sendTestPush = (0, https_1.onCall)({ cors: true, enforceAppCheck: true, secrets: PUSH_SECRETS }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticazione richiesta.');
    const subscriberId = requireString((_a = request.data) === null || _a === void 0 ? void 0 : _a.subscriberId, 'subscriberId', 64);
    const db = admin.firestore();
    const snapshot = await db.collection('push_subscribers').doc(subscriberId).get();
    if (!snapshot.exists)
        throw new https_1.HttpsError('not-found', 'Subscription non registrata.');
    const subscriber = snapshot.data();
    if (subscriber.uid !== request.auth.uid || !subscriber.enabled)
        throw new https_1.HttpsError('permission-denied', 'Subscription non autorizzata.');
    await assertTripMember(db, subscriber.tripId, request.auth.uid);
    const rateRef = db.collection('push_dispatches').doc(hash(`test|${subscriberId}`).slice(0, 56));
    await db.runTransaction(async (transaction) => {
        var _a, _b;
        const previous = await transaction.get(rateRef);
        const lastSentAt = Number(((_a = previous.data()) === null || _a === void 0 ? void 0 : _a.lastSentAt) || 0);
        if (Date.now() - lastSentAt < 30000)
            throw new https_1.HttpsError('resource-exhausted', 'Attendi qualche secondo prima di riprovare.');
        transaction.set(rateRef, { kind: 'test', uid: (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid, lastSentAt: Date.now() }, { merge: true });
    });
    const result = await sendPayload(db, subscriberId, subscriber, {
        title: 'Notifica di prova HOUNIGO',
        body: 'Il dispositivo è registrato per le notifiche del viaggio.',
        url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-test-${subscriberId}`, type: 'test',
    });
    return { accepted: result === 'accepted', deliveryConfirmed: false, status: result };
});
exports.recordPushMutation = (0, https_1.onCall)({ cors: true, enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticazione richiesta.');
    const tripId = requireString((_a = request.data) === null || _a === void 0 ? void 0 : _a.tripId, 'tripId', 128);
    const entityType = requireString((_b = request.data) === null || _b === void 0 ? void 0 : _b.entityType, 'entityType', 32);
    const action = requireString((_c = request.data) === null || _c === void 0 ? void 0 : _c.action, 'action', 10);
    const entityId = requireString((_d = request.data) === null || _d === void 0 ? void 0 : _d.entityId, 'entityId', 200);
    const mutationId = requireString((_e = request.data) === null || _e === void 0 ? void 0 : _e.mutationId, 'mutationId', 100);
    if (!COLLABORATION_ENTITIES.has(entityType) || !['save', 'delete'].includes(action))
        throw new https_1.HttpsError('invalid-argument', 'Mutazione non notificabile.');
    const db = admin.firestore();
    await assertTripMember(db, tripId, request.auth.uid);
    const dedupeRef = db.collection('push_dispatches').doc(hash(`mutation|${tripId}|${mutationId}`).slice(0, 56));
    const accepted = await db.runTransaction(async (transaction) => {
        var _a;
        const existing = await transaction.get(dedupeRef);
        if (existing.exists)
            return false;
        transaction.create(dedupeRef, { tripId, uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid, entityType, action, createdAt: Date.now() });
        return true;
    });
    if (!accepted)
        return { accepted: true, duplicate: true };
    const collectionMap = {
        trasporto: 'trasporti', trasporti: 'trasporti', activity: 'attivita', attivita: 'attivita', alloggio: 'alloggi', alloggi: 'alloggi',
    };
    const collection = collectionMap[entityType];
    if (collection) {
        const entity = action === 'save' ? await db.collection('trips').doc(tripId).collection(collection).doc(entityId).get() : null;
        const candidates = (entity === null || entity === void 0 ? void 0 : entity.exists) ? (0, pushCore_1.buildReminderCandidates)(collection, entity.data() || {}) : [];
        await replaceEntityJobs(db, tripId, collection, entityId, candidates);
    }
    if (entityType === 'note' || entityType === 'nota') {
        const entity = action === 'save' ? await db.collection('trips').doc(tripId).collection('note').doc(entityId).get() : null;
        const candidates = (entity === null || entity === void 0 ? void 0 : entity.exists) ? (0, pushCore_1.buildDeadlineReminderCandidate)(entity.data() || {}) : [];
        await replaceEntityJobs(db, tripId, 'note', entityId, candidates);
    }
    const batchRef = db.collection('push_jobs').doc(hash(`collaboration|${tripId}|${request.auth.uid}`).slice(0, 56));
    await db.runTransaction(async (transaction) => {
        var _a;
        const current = await transaction.get(batchRef);
        const data = current.data() || {};
        const firstCreatedAt = Number(data.firstCreatedAt || Date.now());
        transaction.set(batchRef, {
            kind: 'collaboration', tripId, actorUid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
            dueAt: Math.min(firstCreatedAt + 5 * 60000, Date.now() + 90000),
            firstCreatedAt, eventCount: Number(data.eventCount || 0) + 1, attempts: 0,
        }, { merge: true });
    });
    return { accepted: true, duplicate: false };
});
exports.dispatchDuePushNotifications = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', timeZone: 'UTC', secrets: PUSH_SECRETS }, async () => {
    var _a;
    const db = admin.firestore();
    const due = await db.collection('push_jobs').where('dueAt', '<=', Date.now()).orderBy('dueAt').limit(100).get();
    for (const job of due.docs) {
        const data = job.data();
        try {
            if (data.kind === 'collaboration') {
                const subscribers = await listTripSubscribers(db, data.tripId);
                await Promise.all(subscribers.map(async (snapshot) => {
                    const subscriber = snapshot.data();
                    if (subscriber.uid === data.actorUid || !(0, pushCore_1.normalizePushPreferences)(subscriber.preferences).collaboration)
                        return;
                    const currentRole = await getTripRole(db, data.tripId, subscriber.uid);
                    if (currentRole !== 'owner' && currentRole !== 'copilota')
                        return;
                    await sendPayload(db, snapshot.id, subscriber, {
                        title: 'Viaggio aggiornato', body: 'Il tuo compagno di viaggio ha modificato il roadbook.',
                        url: `${BASE_PATH}?pushView=oggi`, tag: `hounigo-collab-${data.tripId}`, type: 'collaboration',
                    });
                }));
            }
            else if (data.kind === 'reminder') {
                if ((0, pushCore_1.containsSensitivePushContent)(`${data.title || ''} ${data.body || ''}`))
                    throw new Error('Payload reminder non sicuro');
                const subscriberSnapshot = await db.collection('push_subscribers').doc(data.subscriberId).get();
                if (subscriberSnapshot.exists && ((_a = subscriberSnapshot.data()) === null || _a === void 0 ? void 0 : _a.enabled) === true) {
                    const subscriber = subscriberSnapshot.data();
                    const currentRole = await getTripRole(db, subscriber.tripId, subscriber.uid);
                    if (!currentRole) {
                        await removeSubscriber(db, subscriberSnapshot.id);
                    }
                    else {
                        await sendPayload(db, subscriberSnapshot.id, subscriber, {
                            title: data.title, body: data.body, url: data.url || `${BASE_PATH}?pushView=oggi`,
                            tag: `hounigo-reminder-${job.id}`, type: 'reminder',
                        });
                    }
                }
            }
            await job.ref.delete();
        }
        catch (error) {
            const attempts = Number(data.attempts || 0) + 1;
            if (attempts >= 3)
                await job.ref.delete();
            else
                await job.ref.set({ attempts, dueAt: Date.now() + 5 * 60000, lastError: 'dispatch_failed' }, { merge: true });
            console.error('[Push] Invio differito fallito', { jobId: job.id, attempts, error: error instanceof Error ? error.message : 'unknown' });
        }
    }
});
//# sourceMappingURL=pushFunctions.js.map