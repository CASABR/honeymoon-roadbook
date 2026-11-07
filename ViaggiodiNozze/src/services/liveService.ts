import { collection, doc, getDoc, writeBatch, onSnapshot, query, orderBy, setDoc, limit, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

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
    const tripSnap = await getDoc(doc(db, 'trips', tripId));
    const tripData = tripSnap.exists() ? tripSnap.data() : null;
    const members: string[] = Array.isArray(tripData?.members) ? tripData!.members : [];
    const isOwner = tripData?.ownerUid === user.uid || tripData?.ownerId === user.uid;
    let isMember = isOwner || members.includes(user.uid);
    if (!isMember) {
      const memberDoc = await getDoc(doc(db, 'trips', tripId, 'members', user.uid)).catch(() => null);
      if (memberDoc?.exists() && ['owner', 'copilota'].includes(memberDoc.data()?.role)) {
        isMember = true;
      }
    }
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
      headerPatch.title = headerPatch.title || cleanString(tripData?.title, MAX_TITLE) || 'Il nostro viaggio';
      headerPatch.status = headerPatch.status || 'in_corso';
      headerPatch.coverPhotoUrl = headerPatch.coverPhotoUrl || '';
    }
    if (safe.locationName && !headerPatch.currentCity) headerPatch.currentCity = safe.locationName;

    const batch = writeBatch(db);
    batch.set(updateRef, {
      ...safe,
      timestamp: now,
      reactionCounts: { '❤️': 0, '😍': 0, '😂': 0, '👋': 0 },
    });
    batch.set(feedRef, headerPatch, { merge: true });
    await batch.commit();

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

  getVisitorId(): string {
    if (typeof window === 'undefined') return 'server';
    let vid = localStorage.getItem('hounigo_live_visitor_id');
    if (!vid) {
      vid = 'vis_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('hounigo_live_visitor_id', vid);
    }
    return vid;
  },

  /**
   * Aggiunge o aggiorna una reaction a un aggiornamento. Utenti pubblici possono farlo.
   */
  async addReaction(tripId: string, updateId: string, type: typeof LIVE_REACTIONS[number]): Promise<void> {
    if (!LIVE_REACTIONS.includes(type)) return;
    const visitorId = this.getVisitorId();
    const reactionRef = doc(db, 'live_feeds', tripId, 'updates', updateId, 'reactions', visitorId);
    await setDoc(reactionRef, {
      type,
      visitorId,
      timestamp: Date.now()
    }, { merge: true });
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
   * Sottoscrizione agli updates con esclusione automatica di cartoline eliminate e tombstones.
   */
  subscribeToLiveUpdates(tripId: string, callback: (updates: LiveUpdate[]) => void) {
    const q = query(collection(db, 'live_feeds', tripId, 'updates'), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const tombstones = this.getLocalUpdateTombstones(tripId);
      const results: LiveUpdate[] = [];
      snap.forEach(doc => {
        const data = doc.data() as any;
        if (tombstones.has(doc.id)) return;
        if (data.deleted === true || data.title === '[Rimosso]' || data.title === '[Eliminato]') return;
        results.push({ id: doc.id, ...data } as LiveUpdate);
      });
      callback(results);
    }, (err) => {
      console.warn('[LiveService] Errore sottoscrizione updates:', err);
      callback([]);
    });
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
      const tripSnap = await getDoc(doc(db, 'trips', tripId));
      const tripData = tripSnap.exists() ? tripSnap.data() : null;
      const members: string[] = Array.isArray(tripData?.members) ? tripData!.members : [];
      const isOwner = tripData?.ownerUid === user.uid || tripData?.ownerId === user.uid;
      let isMember = isOwner || members.includes(user.uid);
      if (!isMember) {
        const memberDoc = await getDoc(doc(db, 'trips', tripId, 'members', user.uid)).catch(() => null);
        if (memberDoc?.exists() && ['owner', 'copilota'].includes(memberDoc.data()?.role)) {
          isMember = true;
        }
      }
      if (!isMember) {
        throw new Error('Solo i membri autorizzati possono eliminare gli aggiornamenti.');
      }

      // 2. Registra immediatamente il tombstone locale persistente
      this.recordLocalUpdateTombstone(tripId, updateId);

      // 3. Esecuzione cancellazione su Firestore
      const updateRef = doc(db, 'live_feeds', tripId, 'updates', updateId);
      if (tripId !== '0000') {
        try {
          await deleteDoc(updateRef);
        } catch {
          await updateDoc(updateRef, {
            title: '[Eliminato]',
            text: '',
            deleted: true,
            deletedAt: Date.now(),
            deletedBy: user.uid
          }).catch(() => {});
        }
      } else {
        // Sul viaggio master 0000 applica soft-delete
        await updateDoc(updateRef, {
          title: '[Eliminato]',
          text: '',
          deleted: true,
          deletedAt: Date.now(),
          deletedBy: user.uid
        }).catch(() => {});
      }
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
    const msgRef = doc(collection(db, 'live_feeds', tripId, 'guest_messages'));
    await setDoc(msgRef, {
      visitorId,
      authorName: safe.authorName,
      message: safe.message,
      createdAt: now,
      hidden: false,
    });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`hounigo_guest_msg_last_ts_${tripId}`, String(now));
      } catch {}
    }

    return msgRef.id;
  },

  /**
   * Sottoscrizione ai messaggi pubblici degli ospiti nel LIVE.
   */
  subscribeToGuestMessages(
    tripId: string,
    includeHidden: boolean,
    callback: (messages: LiveGuestMessage[]) => void
  ) {
    const q = query(
      collection(db, 'live_feeds', tripId, 'guest_messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => {
        const results: LiveGuestMessage[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.deleted === true) return;
          if (!includeHidden && data.hidden === true) return;
          results.push({
            id: docSnap.id,
            visitorId: String(data.visitorId || ''),
            authorName: String(data.authorName || 'Ospite'),
            message: String(data.message || ''),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            hidden: Boolean(data.hidden),
          });
        });
        callback(results);
      },
      (err) => {
        console.warn('[LiveService] Errore sottoscrizione guest_messages:', err);
        callback([]);
      }
    );
  },

  /**
   * Modera (nasconde, mostra o elimina) un messaggio degli ospiti.
   * Consentito solo a Owner e Copilota del viaggio.
   */
  async moderateGuestMessage(
    tripId: string,
    messageId: string,
    action: 'hide' | 'unhide' | 'delete'
  ): Promise<void> {
    const user = auth?.currentUser;
    if (!user) throw new Error('Autenticazione richiesta per moderare i messaggi.');
    if (!tripId || !messageId) return;

    const msgRef = doc(db, 'live_feeds', tripId, 'guest_messages', messageId);
    const now = Date.now();

    if (action === 'hide') {
      await updateDoc(msgRef, {
        hidden: true,
        moderatedAt: now,
        moderatedBy: user.uid,
      });
    } else if (action === 'unhide') {
      await updateDoc(msgRef, {
        hidden: false,
        moderatedAt: now,
        moderatedBy: user.uid,
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
  }
};

