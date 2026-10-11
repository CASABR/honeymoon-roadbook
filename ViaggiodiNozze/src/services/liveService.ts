import { collection, doc, getDoc, writeBatch, onSnapshot, query, orderBy, setDoc, limit, updateDoc } from 'firebase/firestore';
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

const MAX_TITLE = 120;
const MAX_TEXT = 1000;
const MAX_LOCATION = 120;
const MAX_URL = 2048;

const cleanString = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

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
    if (!members.includes(user.uid)) {
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
    });
  },

  /**
   * Sottoscrizione agli updates.
   */
  subscribeToLiveUpdates(tripId: string, callback: (updates: LiveUpdate[]) => void) {
    const q = query(collection(db, 'live_feeds', tripId, 'updates'), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const results: LiveUpdate[] = [];
      snap.forEach(doc => {
        results.push({ id: doc.id, ...doc.data() } as LiveUpdate);
      });
      callback(results);
    });
  }
};

