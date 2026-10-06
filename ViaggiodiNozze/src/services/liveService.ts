import { collection, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * Feed pubblico: /live_feeds/{tripId} (testata) e /live_feeds/{tripId}/updates/{updateId}.
 * Qui NON devono mai transitare costi, PNR, documenti, note private o identità.
 */

export type LiveFeedStatus = 'in_corso' | 'completato';

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
  const out: Record<string, string> = {};
  const title = cleanString(input.title, MAX_TITLE);
  if (title) out.title = title;
  const cover = cleanUrl(input.coverPhotoUrl);
  if (cover) out.coverPhotoUrl = cover;
  if (input.status === 'in_corso' || input.status === 'completato') out.status = input.status;
  const city = cleanString(input.currentCity, MAX_LOCATION);
  if (city) out.currentCity = city;
  return out;
};

export const liveService = {
  /**
   * Pubblica un aggiornamento nel feed pubblico del viaggio.
   * - Richiede utente autenticato presente in /trips/{tripId}.members (verificato anche dalle rules).
   * - Filtra i dati: solo titolo, testo, foto, località.
   * - Scrive l'update e aggiorna lastUpdateAt sulla testata in un'unica batch atomica.
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
    // ID nuovo e indipendente: non riutilizziamo gli ID dei documenti privati
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
};
