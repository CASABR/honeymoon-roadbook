import { collection, doc, getDoc, writeBatch, onSnapshot, query, orderBy, where, setDoc, limit, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  toPublicUpcomingTransportsFeedProjection,
  toPublicUpcomingTransportTokens,
  serializePublicUpcomingTransportsProjection,
  type PublicNextTransportInfo,
  type PublicNextTransportFeedProjection,
} from '../utils/liveNextTransport';

/**
 * Feed pubblico: /live_feeds/{tripId} (testata) e /live_feeds/{tripId}/updates/{updateId}.
 * Qui NON devono mai transitare costi, PNR, documenti, note private o identità.
 */

export type LiveFeedStatus = 'in_corso' | 'completato';

export interface LiveFeedHeader {
  title?: string;
  coverPhotoUrl?: string;
  status?: LiveFeedStatus;
  currentCity?: string;
  statusMessage?: string;
  statusUpdatedAt?: number;
  lastUpdateAt?: number;
  nextTransport?: PublicNextTransportFeedProjection | null;
  upcomingTransports?: Array<PublicNextTransportFeedProjection | string> | null;
}

export interface LiveUpdate {
  id: string;
  title: string;
  text?: string;
  photoUrl?: string;
  locationName?: string;
  timestamp: number;
  reactionCounts?: Record<string, number>;
}

/** Unici campi accettati in input per un aggiornamento pubblico. */
export interface LiveUpdateInput {
  title: string;
  text?: string;
  photoUrl?: string;
  locationName?: string;
}

/** Campi opzionali della testata pubblica aggiornabili insieme al post. */
export interface LiveFeedHeaderInput {
  title?: string;
  coverPhotoUrl?: string;
  status?: LiveFeedStatus;
  currentCity?: string;
  statusMessage?: string;
}

export const LIVE_REACTIONS = ['❤️', '😍', '😂', '👋'] as const;

export interface LiveGuestMessage {
  id: string;
  visitorId: string;
  authorName: string;
  message: string;
  createdAt: number;
  hidden?: boolean;
  deleted?: boolean;
}

const MAX_TITLE = 120;
const MAX_TEXT = 1000;
const MAX_LOCATION = 120;
const MAX_URL = 2048;
export const MAX_GUEST_AUTHOR = 40;
export const MAX_GUEST_MESSAGE = 280;
export const GUEST_MESSAGE_COOLDOWN_MS = 30_000;
let volatileVisitorId = '';

const cleanString = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const stripControlAndHtml = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
};

export const sanitizeGuestMessageInput = (authorName: unknown, message: unknown) => ({
  authorName: stripControlAndHtml(authorName, MAX_GUEST_AUTHOR),
  message: stripControlAndHtml(message, MAX_GUEST_MESSAGE),
});

/** Accetta solo URL http(s) (niente data: URL con allegati/biglietti). */
const cleanUrl = (value: unknown): string => {
  const s = cleanString(value, MAX_URL);
  return /^https:\/\/|^http:\/\//i.test(s) ? s : '';
};

export type LiveLegacyClassification = 'v2_verified' | 'legacy_publishable' | 'requires_classification';

const LIVE_UPDATE_PUBLIC_KEYS = new Set([
  'title', 'text', 'photoUrl', 'timestamp', 'locationName',
  'reactionCounts', 'deleted', 'deletedAt', 'deletedBy', 'publicSchemaVersion',
]);

const LIVE_GUEST_MSG_PUBLIC_KEYS = new Set([
  'visitorId', 'authorName', 'message', 'createdAt', 'hidden',
  'deleted', 'deletedAt', 'deletedBy', 'moderatedAt', 'publicSchemaVersion',
]);

export function classifyLegacyLiveUpdate(data: Record<string, any> | null | undefined): LiveLegacyClassification {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'requires_classification';
  if (data.publicSchemaVersion === 0) return 'requires_classification';
  if (data.deleted === true || data.title === '[Rimosso]' || data.title === '[Eliminato]') return 'requires_classification';
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > MAX_TITLE) return 'requires_classification';
  if (data.timestamp !== undefined && typeof data.timestamp !== 'number') return 'requires_classification';
  if (data.text !== undefined && (typeof data.text !== 'string' || data.text.length > MAX_TEXT)) return 'requires_classification';
  if (data.locationName !== undefined && (typeof data.locationName !== 'string' || data.locationName.length > MAX_LOCATION)) return 'requires_classification';
  if (data.photoUrl !== undefined) {
    if (typeof data.photoUrl !== 'string' || data.photoUrl.length > MAX_URL) return 'requires_classification';
    if (data.photoUrl.trim() && !/^https:\/\/|^http:\/\//i.test(data.photoUrl.trim())) return 'requires_classification';
  }
  if (data.reactionCounts !== undefined) {
    if (!data.reactionCounts || typeof data.reactionCounts !== 'object' || Array.isArray(data.reactionCounts)) {
      return 'requires_classification';
    }
    for (const [k, v] of Object.entries(data.reactionCounts)) {
      if (!(LIVE_REACTIONS as readonly string[]).includes(k) || typeof v !== 'number') return 'requires_classification';
    }
  }
  for (const key of Object.keys(data)) {
    if (!LIVE_UPDATE_PUBLIC_KEYS.has(key)) return 'requires_classification';
  }
  return data.publicSchemaVersion === 2 ? 'v2_verified' : 'legacy_publishable';
}

export function classifyLegacyGuestMessage(data: Record<string, any> | null | undefined): LiveLegacyClassification {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'requires_classification';
  if (data.publicSchemaVersion === 0) return 'requires_classification';
  if (data.deleted === true) return 'requires_classification';
  if (typeof data.authorName !== 'string' || !data.authorName.trim() || data.authorName.length > MAX_GUEST_AUTHOR) return 'requires_classification';
  if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > MAX_GUEST_MESSAGE) return 'requires_classification';
  if (data.visitorId !== undefined && typeof data.visitorId !== 'string') return 'requires_classification';
  if (data.createdAt !== undefined && typeof data.createdAt !== 'number') return 'requires_classification';
  for (const key of Object.keys(data)) {
    if (!LIVE_GUEST_MSG_PUBLIC_KEYS.has(key)) return 'requires_classification';
  }
  return data.publicSchemaVersion === 2 ? 'v2_verified' : 'legacy_publishable';
}

/** Whitelist rigorosa: qualsiasi altro campo passato viene scartato. */
export const sanitizeLiveUpdate = (input: LiveUpdateInput) => ({
  title: cleanString(input?.title, MAX_TITLE),
  text: cleanString(input?.text, MAX_TEXT),
  photoUrl: cleanUrl(input?.photoUrl),
  locationName: cleanString(input?.locationName, MAX_LOCATION),
});

const sanitizeHeader = (input: LiveFeedHeaderInput = {}) => {
  const out: Record<string, any> = {};
  const title = cleanString(input.title, MAX_TITLE);
  if (title) out.title = title;
  const cover = cleanUrl(input.coverPhotoUrl);
  if (cover) out.coverPhotoUrl = cover;
  if (input.status === 'in_corso' || input.status === 'completato') out.status = input.status;
  const city = cleanString(input.currentCity, MAX_LOCATION);
  if (city) out.currentCity = city;
  const msg = cleanString(input.statusMessage, MAX_TEXT);
  if (msg) out.statusMessage = msg;
  return out;
};

async function verifyPrivilegedLivePublisher(
  tripId: string,
  uid: string
): Promise<{ isMember: boolean; tripTitle?: string }> {
  const tripSnap = await getDoc(doc(db, 'trips', tripId));
  const tripData = tripSnap.exists() ? tripSnap.data() : null;
  const isOwner = tripData?.ownerUid === uid || tripData?.ownerId === uid;
  let isMember = isOwner;
  if (!isMember) {
    const memberDoc = await getDoc(doc(db, 'trips', tripId, 'members', uid)).catch(() => null);
    if (memberDoc?.exists() && ['owner', 'copilota'].includes(memberDoc.data()?.role)) {
      isMember = true;
    }
  }
  return {
    isMember,
    tripTitle: typeof tripData?.title === 'string' ? tripData.title : undefined,
  };
}

export const liveService = {
  /**
   * Pubblica un aggiornamento nel feed pubblico del viaggio.
   */
  async publishToLive(
    tripId: string,
    updateData: LiveUpdateInput,
    header: LiveFeedHeaderInput = {}
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Utente non autenticato: impossibile pubblicare nel Live.');
    if (!tripId) throw new Error('Viaggio non configurato.');

    // 1. Verifica membership (difesa client; l'enforcement reale è nelle Firestore rules)
    const { isMember, tripTitle } = await verifyPrivilegedLivePublisher(tripId, user.uid);
    if (!isMember) {
      throw new Error('Solo i membri del viaggio possono pubblicare nel Live.');
    }

    // 2. Filtro whitelist
    const safe = sanitizeLiveUpdate(updateData);
    if (!safe.title) throw new Error('Il titolo è obbligatorio.');

    const now = Date.now();
    const feedRef = doc(db, 'live_feeds', tripId);
    const updateRef = doc(collection(db, 'live_feeds', tripId, 'updates'));

    const feedSnap = await getDoc(feedRef);
    const headerPatch: Record<string, unknown> = { ...sanitizeHeader(header), lastUpdateAt: now };
    if (!feedSnap.exists()) {
      headerPatch.title = headerPatch.title || cleanString(tripTitle, MAX_TITLE) || 'Il nostro viaggio';
      headerPatch.status = headerPatch.status || 'in_corso';
      headerPatch.coverPhotoUrl = headerPatch.coverPhotoUrl || '';
    }
    if (safe.locationName && !headerPatch.currentCity) headerPatch.currentCity = safe.locationName;

    const batch = writeBatch(db);
    batch.set(updateRef, {
      ...safe,
      publicSchemaVersion: 2,
      timestamp: now,
      reactionCounts: { '❤️': 0, '😍': 0, '😂': 0, '👋': 0 },
    });
    batch.set(feedRef, headerPatch, { merge: true });
    await batch.commit();

    if (safe.photoUrl) {
      const { isManagedLivePhoto, confirmLivePhotoPublication, deleteLivePhoto } = await import('./liveStorageService');
      if (isManagedLivePhoto(safe.photoUrl)) {
        try { await confirmLivePhotoPublication(tripId, safe.photoUrl, updateRef.id); }
        catch (err) {
          // Also handle a lost publish acknowledgement: revoke any possibly
          // activated URL before hiding the failed postcard reference.
          await deleteLivePhoto(tripId, safe.photoUrl).catch(() => {});
          await updateDoc(updateRef, { deleted: true, photoUrl: '', title: '[Eliminato]', deletedAt: Date.now(), deletedBy: user.uid }).catch(() => {});
          throw err;
        }
      }
    }

    console.log('[LiveService] Pubblicato aggiornamento:', updateRef.id);
    return updateRef.id;
  },

  /**
   * Modifica il messaggio di stato ("Messaggio da noi").
   */
  async updateStatusMessage(tripId: string, message: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Non autenticato');
    const safeMsg = cleanString(message, MAX_TEXT);
    const feedRef = doc(db, 'live_feeds', tripId);
    
    // Assicuriamoci che il documento esista
    const feedSnap = await getDoc(feedRef);
    if (!feedSnap.exists()) {
       await setDoc(feedRef, { statusMessage: safeMsg, statusUpdatedAt: Date.now() }, { merge: true });
    } else {
       await updateDoc(feedRef, { statusMessage: safeMsg, statusUpdatedAt: Date.now() });
    }
  },

  /**
   * Proietta esclusivamente i campi pubblici sanificati dei prossimi spostamenti importanti
   * nella testata `/live_feeds/{tripId}` (nessun PNR, prenotazione o dato privato) così il LIVE
   * pubblico avanza automaticamente anche a PWA Owner chiusa senza mostrare voli già passati.
   */
  async syncNextTransportProjection(
    tripId: string,
    nextTransports: PublicNextTransportInfo[] | PublicNextTransportInfo | null,
    options: { title?: string } = {}
  ): Promise<boolean> {
    const user = auth?.currentUser;
    if (!user || !tripId) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    const { isMember, tripTitle } = await verifyPrivilegedLivePublisher(tripId, user.uid);
    if (!isMember) return false;

    const projectedList = toPublicUpcomingTransportsFeedProjection(nextTransports);
    const projectedNext = projectedList[0] ?? null;
    const projectedTokens = toPublicUpcomingTransportTokens(nextTransports);
    const feedRef = doc(db, 'live_feeds', tripId);
    const feedSnap = await getDoc(feedRef);

    if (!feedSnap.exists() && projectedTokens.length === 0) {
      return false;
    }

    if (feedSnap.exists()) {
      const data = feedSnap.data() as LiveFeedHeader | undefined;
      const currentSingle = (data?.nextTransport ?? null) as PublicNextTransportFeedProjection | null;
      const currentList = (data?.upcomingTransports ?? null) as Array<PublicNextTransportFeedProjection | string> | null;
      if (
        serializePublicUpcomingTransportsProjection(currentList, currentSingle) ===
        serializePublicUpcomingTransportsProjection(projectedTokens, projectedNext)
      ) {
        return false;
      }
      await setDoc(feedRef, { nextTransport: projectedNext, upcomingTransports: projectedTokens }, { merge: true });
      return true;
    }

    await setDoc(
      feedRef,
      {
        title: cleanString(options.title || tripTitle, MAX_TITLE) || 'Il nostro viaggio',
        status: 'in_corso',
        coverPhotoUrl: '',
        lastUpdateAt: Date.now(),
        nextTransport: projectedNext,
        upcomingTransports: projectedTokens,
      },
      { merge: true }
    );
    return true;
  },

  getVisitorId(): string {
    if (typeof window === 'undefined') return 'server';
    // Some Safari/private-mode contexts block localStorage. This ID is not used
    // for authorization; server-side anti-spam is enforced independently by IP.
    let vid = '';
    try { vid = localStorage.getItem('hounigo_live_visitor_id') || ''; } catch {}
    if (!vid) {
      vid = volatileVisitorId || ('vis_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
      volatileVisitorId = vid;
      try { localStorage.setItem('hounigo_live_visitor_id', vid); } catch {}
    }
    return vid;
  },

  /**
   * Aggiunge o aggiorna una reaction a un aggiornamento tramite backend autoritativo con rate-limit D1
   * e aggiornamento persistente di reactionCounts su Firestore.
   */
  async addReaction(
    tripId: string,
    updateId: string,
    type: typeof LIVE_REACTIONS[number]
  ): Promise<{ reactionCounts?: Record<string, number>; selected: string }> {
    if (!LIVE_REACTIONS.includes(type)) throw new Error('Reazione non valida.');
    if (!tripId || !updateId) throw new Error('Aggiornamento non valido.');
    const visitorId = this.getVisitorId();
    const { LIVE_PHOTO_ORIGIN } = await import('./liveStorageService');
    if (!LIVE_PHOTO_ORIGIN) {
      throw new Error('Servizio reazioni non disponibile.');
    }
    const res = await fetch(`${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateId, type, visitorId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Impossibile salvare la reazione.');
    }
    return {
      reactionCounts: body?.reactionCounts && typeof body.reactionCounts === 'object' ? body.reactionCounts : undefined,
      selected: type,
    };
  },

  /**
   * Sottoscrizione al LiveFeedHeader.
   */
  subscribeToLiveHeader(tripId: string, callback: (header: LiveFeedHeader | null) => void) {
    const ref = doc(db, 'live_feeds', tripId);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as LiveFeedHeader);
      } else {
        callback(null);
      }
    }, (err) => {
      console.warn('[LiveService] Errore sottoscrizione header:', err);
      callback(null);
    });
  },

  /**
   * Registra un tombstone locale persistente per una cartolina eliminata.
   */
  recordLocalUpdateTombstone(tripId: string, updateId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const key = `hounigo_tombstone_updates_${tripId}`;
      const raw = localStorage.getItem(key);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(updateId)) {
        list.push(updateId);
        localStorage.setItem(key, JSON.stringify(list.slice(-200)));
      }
    } catch {}
  },

  /**
   * Legge tutti i tombstone locali di cartoline per un viaggio.
   */
  getLocalUpdateTombstones(tripId: string): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
      const key = `hounigo_tombstone_updates_${tripId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const list: string[] = JSON.parse(raw);
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  },

  /**
   * Sottoscrizione agli updates con classificazione sicura dei record legacy,
   * esclusione automatica di cartoline eliminate/non classificate e fallback v2 su regole restrittive.
   */
  subscribeToLiveUpdates(tripId: string, callback: (updates: LiveUpdate[]) => void, includeUnreviewed = false) {
    const base = collection(db, 'live_feeds', tripId, 'updates');
    let unsubCurrent: (() => void) | null = null;
    let disposed = false;

    const attach = (useStrictV2Query: boolean) => {
      const q = (includeUnreviewed || !useStrictV2Query)
        ? query(base, orderBy('timestamp', 'desc'), limit(50))
        : query(base, where('publicSchemaVersion', '==', 2), orderBy('timestamp', 'desc'), limit(50));

      unsubCurrent = onSnapshot(q, (snap) => {
        const tombstones = this.getLocalUpdateTombstones(tripId);
        const results: LiveUpdate[] = [];
        snap.forEach(doc => {
          const data = doc.data() as any;
          if (tombstones.has(doc.id)) return;
          if (data.deleted === true || data.title === '[Rimosso]' || data.title === '[Eliminato]') return;
          if (!includeUnreviewed && classifyLegacyLiveUpdate(data) === 'requires_classification') return;
          results.push({ id: doc.id, ...data } as LiveUpdate);
        });
        callback(results);
      }, (err: any) => {
        if (!disposed && !includeUnreviewed && !useStrictV2Query && err?.code === 'permission-denied') {
          attach(true);
          return;
        }
        console.warn('[LiveService] Errore sottoscrizione updates:', err);
        callback([]);
      });
    };

    attach(false);
    return () => {
      disposed = true;
      unsubCurrent?.();
    };
  },

  /**
   * Elimina un aggiornamento dal feed pubblico. Consentito solo a membri del viaggio (Owner/Copilota).
   * Registra tombstone locale e garantisce che la cartolina non ricompaia dopo refresh o sincronizzazione.
   */
  async deleteLiveUpdate(tripId: string, updateId: string): Promise<void> {
    const user = auth?.currentUser;
    if (!user) throw new Error('Non autenticato: solo i membri autorizzati possono eliminare messaggi.');
    if (!tripId || !updateId) return;

    if (db) {
      // 1. Verifica autorizzazione con supporto a ownerUid, ownerId e subcollection members
      const { isMember } = await verifyPrivilegedLivePublisher(tripId, user.uid);
      if (!isMember) {
        throw new Error('Solo i membri autorizzati possono eliminare gli aggiornamenti.');
      }

      // Revoke the stored object BEFORE removing its reference. A failed revoke must
      // remain visible/retryable; a local tombstone must never hide an unsuccessful deletion.
      const updateRef = doc(db, 'live_feeds', tripId, 'updates', updateId);
      const existing = await getDoc(updateRef);
      const photoUrl = existing.exists() ? existing.data()?.photoUrl : null;
      if (photoUrl) {
        const { deleteLivePhoto } = await import('./liveStorageService');
        await deleteLivePhoto(tripId, photoUrl);
      }
      if (tripId === '0000') {
        await updateDoc(updateRef, {
          title: '[Eliminato]', text: '', photoUrl: '', deleted: true,
          deletedAt: Date.now(), deletedBy: user.uid,
        });
      } else {
        await deleteDoc(updateRef);
      }
      this.recordLocalUpdateTombstone(tripId, updateId);
    }
  },

  /**
   * Invia un messaggio pubblico dagli ospiti nel LIVE (Guestbook).
   * Protetto da validazione lunghezza, rimozione HTML e rate limit per visitatore.
   */
  async sendGuestMessage(tripId: string, authorName: string, message: string): Promise<string> {
    if (!tripId) throw new Error('Viaggio non configurato.');
    const safe = sanitizeGuestMessageInput(authorName, message);
    if (!safe.authorName) {
      throw new Error('Inserisci il tuo nome (massimo 40 caratteri).');
    }
    if (!safe.message) {
      throw new Error('Inserisci un messaggio (massimo 280 caratteri).');
    }

    if (typeof window !== 'undefined') {
      try {
        const cooldownKey = `hounigo_guest_msg_last_ts_${tripId}`;
        const lastTs = Number(localStorage.getItem(cooldownKey) || '0');
        const elapsed = Date.now() - lastTs;
        if (lastTs > 0 && elapsed < GUEST_MESSAGE_COOLDOWN_MS) {
          const waitSec = Math.ceil((GUEST_MESSAGE_COOLDOWN_MS - elapsed) / 1000);
          throw new Error(`Attendi ${waitSec}s prima di inviare un altro messaggio.`);
        }
      } catch (err: any) {
        if (err?.message?.includes('Attendi')) throw err;
      }
    }

    const visitorId = this.getVisitorId();
    const now = Date.now();
    const user = auth?.currentUser;
    if (user && !user.isAnonymous) {
      const { isMember } = await verifyPrivilegedLivePublisher(tripId, user.uid);
      if (isMember) {
        const msgRef = doc(collection(db, 'live_feeds', tripId, 'guest_messages'));
        await setDoc(msgRef, {
          visitorId,
          authorName: safe.authorName,
          message: safe.message,
          createdAt: now,
          hidden: false,
          deleted: false,
          publicSchemaVersion: 2,
        });
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`hounigo_guest_msg_last_ts_${tripId}`, String(now));
          } catch {}
        }
        return msgRef.id;
      }
    }

    const { LIVE_PHOTO_ORIGIN } = await import('./liveStorageService');
    if (!LIVE_PHOTO_ORIGIN) {
      throw new Error('Invio messaggi pubblici non disponibile.');
    }
    const res = await fetch(`${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/guest-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, authorName: safe.authorName, message: safe.message }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Impossibile inviare il messaggio.');
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`hounigo_guest_msg_last_ts_${tripId}`, String(now));
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hounigo-guest-message-saved'));
    }
    return String(body?.id || '');
  },

  /**
   * Sottoscrizione ai messaggi pubblici degli ospiti nel LIVE, con classificazione sicura dei messaggi legacy.
   */
  subscribeToGuestMessages(
    tripId: string,
    includeHidden: boolean,
    callback: (messages: LiveGuestMessage[]) => void
  ) {
    const base = collection(db, 'live_feeds', tripId, 'guest_messages');
    let unsubCurrent: (() => void) | null = null;
    let disposed = false;
    let firestoreMessages: LiveGuestMessage[] = [];
    let d1Messages: LiveGuestMessage[] = [];
    let d1Loading = false;

    const publishCombined = () => {
      if (disposed) return;
      callback([...d1Messages, ...firestoreMessages]
        .filter(item => !item.deleted && (includeHidden || !item.hidden))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50));
    };

    // The historical Firestore feed remains readable and unchanged.
    const attach = (useStrictV2Query: boolean) => {
      const q = includeHidden
        ? query(base, orderBy('createdAt', 'desc'), limit(50))
        : useStrictV2Query
          ? query(base, where('publicSchemaVersion', '==', 2), where('hidden', '==', false),
              where('deleted', '==', false), orderBy('createdAt', 'desc'), limit(50))
          : query(base, where('hidden', '==', false), orderBy('createdAt', 'desc'), limit(50));

      unsubCurrent = onSnapshot(q, (snap) => {
        firestoreMessages = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.deleted === true || (!includeHidden && data.hidden === true)) return;
          if (!includeHidden && classifyLegacyGuestMessage(data) === 'requires_classification') return;
          firestoreMessages.push({
            id: docSnap.id,
            visitorId: String(data.visitorId || ''),
            authorName: String(data.authorName || 'Ospite'),
            message: String(data.message || ''),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            hidden: Boolean(data.hidden),
          });
        });
        publishCombined();
      }, (err: any) => {
        if (!disposed && !includeHidden && !useStrictV2Query && err?.code === 'permission-denied') {
          unsubCurrent?.();
          attach(true);
          return;
        }
        console.warn('[LiveService] Errore sottoscrizione guest_messages:', err);
        firestoreMessages = [];
        publishCombined();
      });
    };

    const refreshD1 = async () => {
      if (disposed || d1Loading || (typeof document !== 'undefined' && document.hidden)) return;
      d1Loading = true;
      try {
        const { LIVE_PHOTO_ORIGIN } = await import('./liveStorageService');
        if (!LIVE_PHOTO_ORIGIN) return;
        const user = auth?.currentUser;
        const privateView = includeHidden && user && !user.isAnonymous;
        const token = privateView ? await user.getIdToken() : '';
        const url = `${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/guest-messages${token ? '?includeHidden=1' : ''}`;
        const res = await fetch(url, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        if (disposed) return;
        d1Messages = (Array.isArray(result.messages) ? result.messages : [])
          .filter((item: any) => /^d1_[a-f0-9]{32}$/.test(item?.id) && typeof item?.message === 'string')
          .map((item: any) => ({
            id: item.id,
            visitorId: '',
            authorName: String(item.authorName || 'Ospite'),
            message: String(item.message),
            createdAt: Number(item.createdAt) || 0,
            hidden: Boolean(item.hidden),
            deleted: Boolean(item.deleted),
          }));
        publishCombined();
      } catch (err) {
        console.warn('[LiveService] Lettura guestbook D1 temporaneamente non disponibile:', err);
      } finally {
        d1Loading = false;
      }
    };

    attach(false);
    void refreshD1();
    // Poll only while the tab is visible, plus an immediate refresh after a post.
    const timer = typeof window !== 'undefined' ? window.setInterval(() => { void refreshD1(); }, 20_000) : null;
    const handleRefresh = () => { void refreshD1(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('hounigo-guest-message-saved', handleRefresh);
      window.addEventListener('online', handleRefresh);
      document.addEventListener('visibilitychange', handleRefresh);
    }
    return () => {
      disposed = true;
      unsubCurrent?.();
      if (timer !== null) window.clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('hounigo-guest-message-saved', handleRefresh);
        window.removeEventListener('online', handleRefresh);
        document.removeEventListener('visibilitychange', handleRefresh);
      }
    };
  },

  async moderateGuestMessage(
    tripId: string,
    messageId: string,
    action: 'hide' | 'unhide' | 'delete'
  ): Promise<void> {
    const user = auth?.currentUser;
    if (!user) throw new Error('Autenticazione richiesta per moderare i messaggi.');
    if (!tripId || !messageId) return;

    if (/^d1_[a-f0-9]{32}$/.test(messageId)) {
      const { isMember } = await verifyPrivilegedLivePublisher(tripId, user.uid);
      if (!isMember) throw new Error('Solo Owner e Copilota possono moderare.');
      const { LIVE_PHOTO_ORIGIN } = await import('./liveStorageService');
      const token = await user.getIdToken();
      const res = await fetch(`${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/guest-messages/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Moderazione non riuscita.');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('hounigo-guest-message-saved'));
      return;
    }

    const msgRef = doc(db, 'live_feeds', tripId, 'guest_messages', messageId);
    const now = Date.now();

    if (action === 'hide') {
      await updateDoc(msgRef, {
        hidden: true,
        moderatedAt: now,
        moderatedBy: deleteField(),
      });
    } else if (action === 'unhide') {
      await updateDoc(msgRef, {
        hidden: false,
        moderatedAt: now,
        moderatedBy: deleteField(),
      });
    } else if (action === 'delete') {
      if (tripId !== '0000') {
        try {
          await deleteDoc(msgRef);
          return;
        } catch {}
      }
      await updateDoc(msgRef, {
        deleted: true,
        hidden: true,
        message: '[Eliminato]',
        deletedAt: now,
        deletedBy: user.uid,
      });
    }
  },

  subscribeToPhotoComments(
    tripId: string,
    photoId: string,
    callback: (comments: Array<{ id: string; photoId: string; authorName: string; text: string; createdAt: number }>) => void
  ) {
    if (!db || !tripId || !photoId) {
      callback([]);
      return () => {};
    }
    const base = collection(db, 'live_feeds', tripId, 'updates', photoId, 'comments');
    const q = query(
      base,
      where('publicSchemaVersion', '==', 2),
      where('deleted', '==', false),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: Array<{ id: string; photoId: string; authorName: string; text: string; createdAt: number }> = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.deleted === true) return;
          if (typeof data.authorName !== 'string' || typeof data.text !== 'string') return;
          list.push({
            id: docSnap.id,
            photoId,
            authorName: data.authorName,
            text: data.text,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
          });
        });
        callback(list);
      },
      (err) => {
        console.warn('[LiveService] Errore sottoscrizione commenti foto:', err);
        callback([]);
      }
    );
  },

  async addPhotoComment(tripId: string, photoId: string, authorName: string, text: string): Promise<void> {
    if (!tripId || !photoId) throw new Error('Foto non valida.');
    const cleanAuthor = cleanString(authorName, 40);
    const cleanText = cleanString(text, 280);
    if (!cleanAuthor || !cleanText) throw new Error('Inserisci nome e commento.');
    if (/[<>]|javascript:|data:text\/html/i.test(cleanAuthor) || /[<>]|javascript:|data:text\/html/i.test(cleanText)) {
      throw new Error('Caratteri non consentiti nel commento.');
    }
    if (typeof window !== 'undefined') {
      try {
        const lastTs = Number(localStorage.getItem(`hounigo_photo_comment_ts_${tripId}_${photoId}`) || '0');
        if (lastTs > 0 && Date.now() - lastTs < 10_000) {
          throw new Error('Attendi qualche secondo prima di inviare un altro commento.');
        }
      } catch (e: any) {
        if (e?.message?.includes('Attendi')) throw e;
      }
    }

    const user = auth?.currentUser;
    const now = Date.now();
    if (user && !user.isAnonymous) {
      const { isMember } = await verifyPrivilegedLivePublisher(tripId, user.uid);
      if (isMember) {
        const commentRef = doc(collection(db, 'live_feeds', tripId, 'updates', photoId, 'comments'));
        await setDoc(commentRef, {
          authorName: cleanAuthor,
          text: cleanText,
          createdAt: now,
          deleted: false,
          publicSchemaVersion: 2,
        });
        if (typeof window !== 'undefined') {
          try { localStorage.setItem(`hounigo_photo_comment_ts_${tripId}_${photoId}`, String(now)); } catch {}
        }
        return;
      }
    }

    const { LIVE_PHOTO_ORIGIN } = await import('./liveStorageService');
    if (!LIVE_PHOTO_ORIGIN) throw new Error('Commenti pubblici non disponibili.');
    const res = await fetch(`${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: photoId, authorName: cleanAuthor, text: cleanText }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'Impossibile inviare il commento.');
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(`hounigo_photo_comment_ts_${tripId}_${photoId}`, String(now)); } catch {}
    }
  },

  async deletePhotoComment(tripId: string, photoId: string, commentId: string): Promise<void> {
    const user = auth?.currentUser;
    if (!user || user.isAnonymous) throw new Error('Autenticazione richiesta per eliminare i commenti.');
    if (!tripId || !photoId || !commentId) return;
    const { isMember } = await verifyPrivilegedLivePublisher(tripId, user.uid);
    if (!isMember) throw new Error('Solo Owner e Copilota possono eliminare i commenti.');
    const commentRef = doc(db, 'live_feeds', tripId, 'updates', photoId, 'comments', commentId);
    await updateDoc(commentRef, {
      deleted: true,
      text: '[Rimosso]',
      deletedAt: Date.now(),
      deletedBy: user.uid,
    });
  }
};

