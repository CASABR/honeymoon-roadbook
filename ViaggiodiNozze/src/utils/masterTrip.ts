import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * ⚠️ TEMPORANEO — SOLO SVILUPPO / TEST.
 * Riallineamento del viaggio master "0000" quando l'UID anonimo cambia
 * (nuova sessione, cache pulita, altro browser). Va rimosso prima del rilascio
 * pubblico insieme al passaggio di joinTrip a Cloud Function.
 */
export const MASTER_TRIP_ID = '0000';
export const MASTER_TRIP_START_DATE = '2026-11-28';
export const MASTER_TRIP_END_DATE = '2027-01-10';
export const MASTER_TRIP_TOTAL_DAYS = 44;

export const isMasterTripCode = (code: string | null | undefined) =>
  (code || '').trim() === MASTER_TRIP_ID;

export interface MasterTripMeta {
  title?: string;
  startDate?: string;
  endDate?: string;
}

export type ReclaimStatus = 'already_member' | 'joined' | 'claimed_legacy' | 'created';

/**
 * Garantisce che `uid` sia nei members di /trips/0000.
 * Ordine dei tentativi (ognuno ammesso esplicitamente dalle Firestore rules):
 *  1. lettura → se riesce, siamo già membri;
 *  2. arrayUnion(uid) sui members → caso "nuovo membro";
 *  3. documento inesistente → creazione con noi come owner;
 *  4. documento legacy senza ownerUid → claim dell'owner (regola temporanea dedicata a "0000").
 */
export async function ensureMasterTripMembership(
  uid: string,
  fallbackMeta: MasterTripMeta = {}
): Promise<{ status: ReclaimStatus; data: any }> {
  const ref = doc(db, 'trips', MASTER_TRIP_ID);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return { status: 'already_member', data: snap.data() };
  } catch {
    // permission-denied: non siamo (ancora) membri, oppure il doc non esiste
  }

  let status: ReclaimStatus = 'joined';
  try {
    await updateDoc(ref, { members: arrayUnion(uid) });
  } catch (err: any) {
    if (err?.code === 'not-found') {
      status = 'created';
      await setDoc(ref, {
        ownerUid: uid,
        members: [uid],
        title: fallbackMeta.title || 'Viaggio Originale',
        startDate: MASTER_TRIP_START_DATE,
        endDate: MASTER_TRIP_END_DATE,
        totalDays: MASTER_TRIP_TOTAL_DAYS,
        createdAt: Date.now()
      });
    } else {
      // Documento legacy privo di ownerUid: claim esplicito (regola temporanea)
      status = 'claimed_legacy';
      await updateDoc(ref, { ownerUid: uid, members: arrayUnion(uid) });
    }
  }

  await setDoc(ref, {
    title: fallbackMeta.title || 'Viaggio Originale',
    startDate: MASTER_TRIP_START_DATE,
    endDate: MASTER_TRIP_END_DATE,
    totalDays: MASTER_TRIP_TOTAL_DAYS,
    updatedAt: Date.now()
  }, { merge: true });

  const snap = await getDoc(ref);
  console.log(`[MasterTrip] Riallineamento "0000": ${status} (uid ${uid})`);
  return { status, data: snap.data() };
}
