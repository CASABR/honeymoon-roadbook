/**
 * tripStorageService.ts
 *
 * Servizio dedicato alla misurazione efficiente dello spazio occupato dai viaggi
 * e delle relative sottocollezioni su Cloud Firestore.
 *
 * Linee guida prestazioni e costi:
 * - Nessuna scansione automatica aggressiva o continua.
 * - Calcolo dettagliato on-demand con cache in sessionStorage.
 * - Deduplicazione assoluta: ogni documento viene conteggiato una sola volta (Set di percorsi).
 * - Distinzione esplicita tra dimensione documenti calcolata e overhead indici.
 */

import { collection, getDocs, doc, getDoc, type Firestore } from 'firebase/firestore';
import { KNOWN_ADMIN_DELETION_SUBCOLLECTIONS } from '../views/altro/AdminDashboardView';
import {
  calculateFirestoreDocSize,
  calculateTripRootDocSize,
  calculateQuotaPercentage
} from '../utils/firestoreStorageCalculator';

export interface TripStorageDetail {
  tripId: string;
  totalBytes: number;
  docsCount: number;
  status: 'calcolata' | 'parziale';
  quotaPercentage: number;
  subcollectionsBreakdown: Record<string, { docsCount: number; bytes: number }>;
  calculatedAt: number; // timestamp ms
}

const CACHE_PREFIX = 'houni_admin_trip_storage_v1_';

/** Recupera una stima precedentemente memorizzata in cache per il viaggio */
export function getTripStorageFromCache(tripId: string): TripStorageDetail | null {
  if (typeof sessionStorage === 'undefined' || !tripId) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${tripId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validità cache: 24 ore
    if (Date.now() - (parsed.calculatedAt || 0) < 24 * 60 * 60 * 1000) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Salva una stima dettagliata in cache di sessione */
export function saveTripStorageToCache(detail: TripStorageDetail): void {
  if (typeof sessionStorage === 'undefined' || !detail?.tripId) return null as any;
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${detail.tripId}`, JSON.stringify(detail));
  } catch {
    // ignore quota/private mode
  }
}

/** Svuota la cache locale delle stime */
export function clearTripStorageCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Calcola in modo efficiente e controllato lo spazio reale occupato da un singolo viaggio
 * e da tutte le sue sottocollezioni Firestore effettive.
 */
export async function calculateDetailedTripStorage(
  firestoreDb: Firestore,
  tripId: string,
  existingTripDocData?: Record<string, any>
): Promise<TripStorageDetail> {
  const cleanId = String(tripId || '').trim();
  if (!cleanId) {
    throw new Error('Identificativo viaggio non valido');
  }

  const countedDocPaths = new Set<string>();
  const breakdown: Record<string, { docsCount: number; bytes: number }> = {};
  let totalBytes = 0;
  let totalDocs = 0;

  // 1. Documento principale trips/{tripId}
  const rootPath = `trips/${cleanId}`;
  let rootData = existingTripDocData;
  if (!rootData) {
    try {
      const rootSnap = await getDoc(doc(firestoreDb, 'trips', cleanId));
      if (rootSnap.exists()) {
        rootData = rootSnap.data();
      }
    } catch (err) {
      console.warn(`[tripStorageService] Impossibile leggere root doc per ${cleanId}:`, err);
    }
  }

  if (rootData) {
    const rootBytes = calculateTripRootDocSize(cleanId, rootData);
    countedDocPaths.add(rootPath);
    breakdown['_root'] = { docsCount: 1, bytes: rootBytes };
    totalBytes += rootBytes;
    totalDocs += 1;
  }

  // 2. Scansione delle sottocollezioni note del viaggio
  for (const subcol of KNOWN_ADMIN_DELETION_SUBCOLLECTIONS) {
    try {
      const colRef = collection(firestoreDb, 'trips', cleanId, subcol);
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        let subcolBytes = 0;
        let subcolDocs = 0;

        snap.docs.forEach(docSnap => {
          const path = `trips/${cleanId}/${subcol}/${docSnap.id}`;
          // Controllo rigoroso deduplicazione: conta ciascun documento una sola volta
          if (!countedDocPaths.has(path)) {
            countedDocPaths.add(path);
            const docBytes = calculateFirestoreDocSize(path, docSnap.data());
            subcolBytes += docBytes;
            subcolDocs += 1;
          }
        });

        if (subcolDocs > 0) {
          breakdown[subcol] = { docsCount: subcolDocs, bytes: subcolBytes };
          totalBytes += subcolBytes;
          totalDocs += subcolDocs;
        }
      }
    } catch (err) {
      // Ignora sottocollezioni opzionali non presenti o inaccessibili
      console.warn(`[tripStorageService] Sottocollezione ${subcol} per ${cleanId} saltata:`, err);
    }
  }

  // 3. Verifica live_feeds associato al viaggio (se presente per questo tripId)
  try {
    const feedRef = doc(firestoreDb, 'live_feeds', cleanId);
    const feedSnap = await getDoc(feedRef);
    if (feedSnap.exists()) {
      const feedPath = `live_feeds/${cleanId}`;
      if (!countedDocPaths.has(feedPath)) {
        countedDocPaths.add(feedPath);
        const feedBytes = calculateFirestoreDocSize(feedPath, feedSnap.data());
        totalBytes += feedBytes;
        totalDocs += 1;
        breakdown['live_feed'] = { docsCount: 1, bytes: feedBytes };
      }
    }

    const updatesRef = collection(firestoreDb, 'live_feeds', cleanId, 'updates');
    const updatesSnap = await getDocs(updatesRef);
    if (!updatesSnap.empty) {
      let updatesBytes = 0;
      let updatesCount = 0;
      updatesSnap.docs.forEach(d => {
        const uPath = `live_feeds/${cleanId}/updates/${d.id}`;
        if (!countedDocPaths.has(uPath)) {
          countedDocPaths.add(uPath);
          const uBytes = calculateFirestoreDocSize(uPath, d.data());
          updatesBytes += uBytes;
          updatesCount += 1;
        }
      });
      if (updatesCount > 0) {
        totalBytes += updatesBytes;
        totalDocs += updatesCount;
        breakdown['live_feed_updates'] = { docsCount: updatesCount, bytes: updatesBytes };
      }
    }
  } catch (feedErr) {
    // live_feeds opzionale
  }

  const result: TripStorageDetail = {
    tripId: cleanId,
    totalBytes,
    docsCount: totalDocs,
    status: 'calcolata',
    quotaPercentage: calculateQuotaPercentage(totalBytes),
    subcollectionsBreakdown: breakdown,
    calculatedAt: Date.now()
  };

  saveTripStorageToCache(result);
  return result;
}
