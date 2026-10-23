import { doc, getDoc } from 'firebase/firestore';
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
 * Verifica sicura e non distruttiva dell'appartenenza al viaggio reale '0000'.
 * NON modifica mai ownerUid, date, titolo o membri del viaggio reale.
 * NON esegue tentativi di scrittura non autorizzati né fallback distruttivi.
 */
export async function ensureMasterTripMembership(
  uid: string,
  _fallbackMeta: MasterTripMeta = {}
): Promise<{ status: ReclaimStatus; data: any }> {
  if (!uid) {
    return { status: 'joined', data: null };
  }

  const ref = doc(db, 'trips', MASTER_TRIP_ID);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const members = Array.isArray(data?.members) ? data.members : [];
      const isOwner = data?.ownerUid === uid;
      const isMember = members.includes(uid) || isOwner;

      if (isMember) {
        return { status: 'already_member', data };
      }
    }
  } catch (err) {
    // Utente non autorizzato o offline: non tentare scritture invasive
    console.warn('[MasterTrip] Lettura "0000" non autorizzata o offline:', err);
  }

  // Nessuna scrittura o alterazione consentita lato client sul viaggio reale '0000'
  return { status: 'joined', data: null };
}
