import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { STORES, idbPut, idbDelete, idbGetAll, idbGet, type StoreName } from './indexedDB';
import { notifyDataChanged } from './storageService';
import { normalizeTimestamp } from '../utils/tripDates';
import { isCloudAuthorized, isTripAuthRevoked, getAuthoritativeCloudRole } from '../utils/useAuthIdentity';
import { getTripConfig } from '../utils/tripConfig';
import { recordPushMutation } from '../services/pushNotificationService';
import {
  splitEntitySecurityData,
  mergeEntitySecurityData,
  getVaultDocId,
  normalizeEntityType,
  sanitizePublicDocument
} from '../utils/securityDataSplitter';
import {
  savePendingMutation,
  removePendingMutation,
  getPendingMutations,
  hasPendingMutation,
  normalizeQueueEntityType,
  saveConflictBackup,
  getConflictBackups,
  updateConflictStatus,
  getConflictBackupById,
  type PendingMutation
} from './localMutationQueue';

export interface PreActivationSyncReportItem {
  id: string;
  entityType: string;
  action: 'save' | 'delete';
  timestamp: number;
  previewTitle?: string;
  hasPotentialConflict: boolean;
  conflictReason?: string;
  isAlreadySynchronized?: boolean;
}

export interface ConflictReportItem {
  id: string;
  tripId: string;
  entityType: string;
  dataId: string;
  previewTitle?: string;
  conflictType: string;
  status: string;
  savedAt: number;
  serverUpdated?: number;
  localUpdated?: number;
  isEquivalent: boolean;
  differences: Array<{ field: string; localVal: any; remoteVal: any }>;
}

export type UserFriendlySyncStatus =
  | 'Sincronizzazione attiva'
  | 'Modifiche in attesa'
  | 'Nessuna connessione'
  | 'Conflitto da verificare'
  | 'Errore di sincronizzazione'
  | 'In attesa di attivazione';

const lastSyncErrorsByTrip = new Map<string, string>();
const lastSyncTimestampsByTrip = new Map<string, number>();

export function getLastSyncTimestamp(tripId: string): number | null {
  const mem = lastSyncTimestampsByTrip.get(tripId);
  if (mem) return mem;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`hounigo_last_sync_at_${tripId}`);
      const parsed = Number(raw);
      if (parsed > 0) return parsed;
    } catch {}
  }
  return null;
}

export function setLastSyncTimestamp(tripId: string, ts: number = Date.now()): void {
  lastSyncTimestampsByTrip.set(tripId, ts);
  lastSyncErrorsByTrip.delete(tripId);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`hounigo_last_sync_at_${tripId}`, String(ts));
    } catch {}
  }
}

export function getLastSyncError(tripId: string): string | null {
  return lastSyncErrorsByTrip.get(tripId) || null;
}

export function setLastSyncError(tripId: string, errMessage: string | null): void {
  if (!errMessage) {
    lastSyncErrorsByTrip.delete(tripId);
  } else {
    lastSyncErrorsByTrip.set(tripId, errMessage);
  }
}

export interface PreActivationSyncReport {
  tripId: string;
  tripTitle?: string;
  isCloudWriteAllowed: boolean;
  isQueueFlushAuthorized: boolean;
  pendingCount: number;
  pendingByType: Record<string, number>;
  conflictsCount: number;
  conflictsByType: Record<string, number>;
  archivedLocalOnlyCount?: number;
  isOnline?: boolean;
  lastSyncAt?: number | null;
  lastSyncError?: string | null;
  userFriendlyStatus?: UserFriendlySyncStatus;
  hasActiveErrors?: boolean;
  items: PreActivationSyncReportItem[];
  conflictItems: ConflictReportItem[];
}

export function isTrip0000CloudWriteAllowed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('hounigo_allow_cloud_write_0000') === 'true';
}

export function allowCloudWriteForTrip0000(allow: boolean = true): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('hounigo_allow_cloud_write_0000', allow ? 'true' : 'false');
    localStorage.setItem('hounigo_allow_queue_flush_0000', allow ? 'true' : 'false');
  }
}

export function isQueueFlushAllowedForTrip0000(): boolean {
  return isTrip0000CloudWriteAllowed();
}

export function allowQueueFlushForTrip0000(allow: boolean = true): void {
  allowCloudWriteForTrip0000(allow);
}

export interface NormalizedCoordinates {
  lat: number;
  lng: number;
}

export function extractNormalizedCoordinates(val: any): NormalizedCoordinates | null {
  if (!val || typeof val !== 'object') return null;
  const rawLat = val.lat ?? val.latitude;
  const rawLng = val.lng ?? val.longitude ?? val.lon;

  if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) {
    return null;
  }

  const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat));
  const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng));

  if (isNaN(lat) || isNaN(lng)) return null;

  return { lat, lng };
}

export function areCoordinatesEquivalent(coordA: any, coordB: any, epsilon = 0.00001): boolean {
  const normA = extractNormalizedCoordinates(coordA);
  const normB = extractNormalizedCoordinates(coordB);

  // Se entrambi non hanno coordinate valide, sono considerati equivalenti (nessuna discrepanza)
  if (!normA && !normB) return true;
  // Se uno ce l'ha e l'altro no, non sono equivalenti
  if (!normA || !normB) return false;

  return Math.abs(normA.lat - normB.lat) < epsilon && Math.abs(normA.lng - normB.lng) < epsilon;
}

export function formatCoordinateForDisplay(coord: any): string {
  const norm = extractNormalizedCoordinates(coord);
  if (!norm) return typeof coord === 'object' && coord !== null ? JSON.stringify(coord) : String(coord ?? '(non impostate)');
  return `Lat ${norm.lat.toFixed(5)}, Lng ${norm.lng.toFixed(5)}`;
}

export function deepEqualIgnoreKeyOrder(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualIgnoreKeyOrder(a[i], b[i])) return false;
    }
    return true;
  }

  // Se l'oggetto rappresenta una coordinata geografica, confronta strutturalmente con tolleranza
  const normA = extractNormalizedCoordinates(a);
  const normB = extractNormalizedCoordinates(b);
  if (normA && normB) {
    return areCoordinatesEquivalent(a, b);
  }

  const keysA = Object.keys(a).filter(k => a[k] !== undefined);
  const keysB = Object.keys(b).filter(k => b[k] !== undefined);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!deepEqualIgnoreKeyOrder(a[k], b[k])) return false;
  }
  return true;
}

export function compareCandidateWithRemote(
  normType: string,
  tripId: string,
  localData: any,
  remoteData: any
): { isEquivalent: boolean; differences: Array<{ field: string; localVal: any; remoteVal: any }> } {
  if (!localData || !remoteData) {
    return { isEquivalent: false, differences: [{ field: '_root', localVal: localData, remoteVal: remoteData }] };
  }

  const isOperationalWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping', 'documento'].includes(normType);
  const { publicDoc: candidatePublic } = isOperationalWithCreds
    ? splitEntitySecurityData(normType as any, tripId, localData)
    : { publicDoc: localData };

  const differences: Array<{ field: string; localVal: any; remoteVal: any }> = [];
  const ignoredKeys = new Set(['updatedAt', 'lastSanitizedAt', 'lastMigratedAt', 'createdAt']);

  for (const [k, v] of Object.entries(candidatePublic)) {
    if (ignoredKeys.has(k)) continue;
    if (v === undefined) continue;

    const rv = remoteData[k];
    if (rv === undefined) {
      if (v === '' || (Array.isArray(v) && v.length === 0) || v === false) continue;
      differences.push({
        field: k,
        localVal: typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
        remoteVal: '(non impostato)'
      });
      continue;
    }

    // Gestione specifica campi coordinate geografiche
    const isCoordKey = k === 'coordinate' || k === 'coordinates' || k === 'dropoffCoordinate' ||
      (typeof v === 'object' && v !== null && ('lat' in v || 'latitude' in v) && ('lng' in v || 'longitude' in v || 'lon' in v));

    if (isCoordKey) {
      if (areCoordinatesEquivalent(v, rv)) {
        continue;
      }
      differences.push({
        field: k,
        localVal: formatCoordinateForDisplay(v),
        remoteVal: formatCoordinateForDisplay(rv)
      });
      continue;
    }

    if (typeof v === 'object' && v !== null) {
      if (!deepEqualIgnoreKeyOrder(v, rv)) {
        differences.push({
          field: k,
          localVal: JSON.stringify(v),
          remoteVal: typeof rv === 'object' && rv !== null ? JSON.stringify(rv) : String(rv)
        });
      }
    } else if (v !== rv) {
      if ((k === 'orario' || k === 'time') && String(v).trim() === String(rv).trim()) continue;
      if (typeof v === 'number' && typeof rv === 'string' && String(v) === rv.trim()) continue;
      if (typeof v === 'string' && typeof rv === 'number' && v.trim() === String(rv)) continue;

      differences.push({ field: k, localVal: v, remoteVal: rv });
    }
  }

  return { isEquivalent: differences.length === 0, differences };
}

export async function getPreActivationSyncReport(tripId: string): Promise<PreActivationSyncReport> {
  const isAllowed = tripId === '0000' ? isTrip0000CloudWriteAllowed() : true;
  const queue = await getPendingMutations(tripId);
  const allConflictBackups = await getConflictBackups(tripId);
  const pendingConflicts = allConflictBackups.filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record');

  const pendingByType: Record<string, number> = {};
  const conflictsByType: Record<string, number> = {};

  for (const c of pendingConflicts) {
    conflictsByType[c.conflictType] = (conflictsByType[c.conflictType] || 0) + 1;
  }

  const conflictItems: ConflictReportItem[] = [];
  for (const c of pendingConflicts) {
    const cNormType = normalizeQueueEntityType(c.entityType);
    let isEquivalent = false;
    let differences: Array<{ field: string; localVal: any; remoteVal: any }> = [];

    if (typeof navigator !== 'undefined' && navigator.onLine && db) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const remoteDocRef = doc(db, 'trips', tripId, cNormType, c.dataId);
        const remoteSnap = await getDoc(remoteDocRef).catch(() => null);
        if (remoteSnap && remoteSnap.exists()) {
          const remoteData = remoteSnap.data();
          const comp = compareCandidateWithRemote(cNormType, tripId, c.localData, remoteData);
          isEquivalent = comp.isEquivalent;
          differences = comp.differences;
        }
      } catch {}
    } else if (c.serverData) {
      const comp = compareCandidateWithRemote(cNormType, tripId, c.localData, c.serverData);
      isEquivalent = comp.isEquivalent;
      differences = comp.differences;
    }

    const rawTitle = c.localData?.titolo || c.localData?.title || c.localData?.nome || c.localData?.name || '';
    const previewTitle = typeof rawTitle === 'string' && rawTitle.trim().length > 0
      ? (rawTitle.length > 45 ? rawTitle.substring(0, 45) + '…' : rawTitle)
      : c.dataId;

    conflictItems.push({
      id: c.id,
      tripId: c.tripId,
      entityType: cNormType,
      dataId: c.dataId,
      previewTitle,
      conflictType: c.conflictType,
      status: c.status,
      savedAt: c.savedAt,
      serverUpdated: c.serverUpdated,
      localUpdated: c.localUpdated,
      isEquivalent,
      differences
    });
  }

  const items: PreActivationSyncReport['items'] = [];
  for (const q of queue) {
    const normType = normalizeQueueEntityType(q.entityType);
    pendingByType[normType] = (pendingByType[normType] || 0) + 1;

    let hasPotentialConflict = false;
    let conflictReason: string | undefined;
    let isAlreadySynchronized = false;

    const dataId = q.data?.id;
    if (dataId) {
      const tombstoneKey = `tombstone_${normType}_${dataId}`;
      const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, tombstoneKey).catch(() => null);
      if (tombstoneSetting && tombstoneSetting.value) {
        hasPotentialConflict = true;
        conflictReason = 'remote_tombstone_present';
      }
    }

    // Includi SOLO metadati non sensibili (nessun PIN, PNR, note private, prezzi o allegati)
    const rawTitle = q.data?.titolo || q.data?.title || q.data?.nome || q.data?.name || q.data?.label || '';
    const previewTitle = typeof rawTitle === 'string' && rawTitle.trim().length > 0
      ? (rawTitle.length > 45 ? rawTitle.substring(0, 45) + '…' : rawTitle)
      : (dataId || q.id);

    // Controllo preventivo versioni remote sul cloud in sola lettura (se online)
    if (dataId && !hasPotentialConflict && typeof navigator !== 'undefined' && navigator.onLine && db) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const remoteDocRef = doc(db, 'trips', tripId, normType, dataId);
        const remoteSnap = await getDoc(remoteDocRef).catch(() => null);
        if (remoteSnap && remoteSnap.exists()) {
          const remoteData = remoteSnap.data();
          const remoteUpdated = normalizeTimestamp(remoteData?.updatedAt);
          const localUpdated = normalizeTimestamp(q.data?.updatedAt || q.timestamp);

          const { isEquivalent } = compareCandidateWithRemote(normType, tripId, q.data, remoteData);
          if (isEquivalent) {
            isAlreadySynchronized = true;
            hasPotentialConflict = false;
            conflictReason = undefined;
          } else if (remoteUpdated <= 0 || localUpdated <= 0) {
            hasPotentialConflict = true;
            conflictReason = 'unreliable_timestamp_conflict';
          } else if (remoteUpdated > localUpdated) {
            hasPotentialConflict = true;
            conflictReason = 'server_newer';
          }
        }
      } catch {
        // Nessun blocco diagnostico in sola lettura se la connessione è instabile
      }
    }

    items.push({
      id: dataId || q.id,
      entityType: normType,
      action: q.action,
      timestamp: q.timestamp,
      previewTitle,
      hasPotentialConflict,
      conflictReason,
      isAlreadySynchronized
    });
  }

  const currentConfig = getTripConfig();
  const tripTitle = currentConfig?.id === tripId
    ? (currentConfig?.title || (tripId === '0000' ? 'Viaggio di Nozze (0000)' : `Viaggio ${tripId}`))
    : (tripId === '0000' ? 'Viaggio di Nozze (0000)' : `Viaggio ${tripId}`);
  const archivedLocalOnlyCount = allConflictBackups.filter(c => c.conflictType === 'local_only_record' || c.status === 'archived_local_only').length;
  const isOnline = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
  const lastSyncAt = getLastSyncTimestamp(tripId);
  const lastSyncError = getLastSyncError(tripId);
  const hasUnresolvedConflict = pendingConflicts.length > 0 || items.some(i => i.hasPotentialConflict && !i.isAlreadySynchronized);

  let userFriendlyStatus: UserFriendlySyncStatus = 'Sincronizzazione attiva';
  if (!isOnline) {
    userFriendlyStatus = 'Nessuna connessione';
  } else if (hasUnresolvedConflict) {
    userFriendlyStatus = 'Conflitto da verificare';
  } else if (lastSyncError) {
    userFriendlyStatus = 'Errore di sincronizzazione';
  } else if (!isAllowed) {
    userFriendlyStatus = 'In attesa di attivazione';
  } else if (queue.length > 0) {
    userFriendlyStatus = 'Modifiche in attesa';
  } else {
    userFriendlyStatus = 'Sincronizzazione attiva';
  }

  const hasActiveErrors = !isOnline || hasUnresolvedConflict || Boolean(lastSyncError);

  return {
    tripId,
    tripTitle,
    isCloudWriteAllowed: isAllowed,
    isQueueFlushAuthorized: isAllowed,
    pendingCount: queue.length,
    pendingByType,
    conflictsCount: pendingConflicts.length,
    conflictsByType,
    archivedLocalOnlyCount,
    isOnline,
    lastSyncAt,
    lastSyncError,
    userFriendlyStatus,
    hasActiveErrors,
    items,
    conflictItems
  };
}

let activeSyncService: SyncService | null = null;

export function getActiveSyncService(): SyncService | null {
  return activeSyncService;
}

export async function executeControlledReconciliation(tripId: string): Promise<{
  success: boolean;
  pushedCount: number;
  remainingCount: number;
  conflictsCount: number;
  errors: string[];
}> {
  // 1. Controllo revoca autorizzazioni
  if (isTripAuthRevoked(tripId)) {
    throw new Error('Operazione bloccata: autorizzazioni per il viaggio revocate.');
  }

  // 2. Controllo identità Owner verificata (nessun bypass o elevazione)
  const user = auth?.currentUser;
  const config = getTripConfig();
  const authRole = getAuthoritativeCloudRole();
  const isOwnerUid = Boolean(user && !user.isAnonymous && config?.ownerUid && user.uid === config.ownerUid);
  const isOwnerRole = authRole === 'owner';

  if (!user || user.isAnonymous || (!isOwnerRole && !isOwnerUid)) {
    throw new Error('Operazione bloccata: riconciliazione consentita esclusivamente all\'Owner verificato del viaggio.');
  }

  // 3. Controllo connessione di rete
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Operazione bloccata: dispositivo offline, impossibile verificare le versioni remote.');
  }

  // 4. Controllo conflitti attivi pendenti nell'archivio
  const conflictBackups = await getConflictBackups(tripId);
  const activeConflicts = conflictBackups.filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record');
  if (activeConflicts.length > 0) {
    throw new Error(`Operazione bloccata: presenti ${activeConflicts.length} conflitti da risolvere prima di attivare le scritture.`);
  }

  // 5. Controllo preliminare della coda locale
  const beforeQueue = await getPendingMutations(tripId);
  const beforeCount = beforeQueue.length;
  if (beforeCount === 0) {
    // Caso 0 modifiche pendenti: tutti i controlli di sicurezza (Owner verificato, online, zero conflitti attivi)
    // sono superati. L'Owner verificato abilita esplicitamente le scritture cloud per il viaggio!
    allowCloudWriteForTrip0000(true);
    if (activeSyncService && activeSyncService.getTripId() === tripId) {
      activeSyncService.triggerAutomaticSync('owner_activation_unlocked');
    }
    return { success: true, pushedCount: 0, remainingCount: 0, conflictsCount: 0, errors: [] };
  }

  // 5. Controllo preventivo approfondito conflitti e affidabilità timestamp su TUTTI gli elementi in coda
  // Se anche un solo elemento presenta conflitti o timestamp inaffidabili, NON abilitare le scritture e NON inviare nulla!
  for (const q of beforeQueue) {
    const normType = normalizeQueueEntityType(q.entityType);
    const dataId = q.data?.id;
    if (!dataId) continue;

    // Controllo tombstone locale/remoto
    const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${normType}_${dataId}`).catch(() => null);
    if (tombstoneSetting && tombstoneSetting.value) {
      throw new Error(`Conflitto bloccante: rilevato tombstone per ${normType}/${dataId}. Scritture non abilitate.`);
    }

    // Controllo versione remota su Firestore
    if (db) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const remoteDocRef = doc(db, 'trips', tripId, normType, dataId);
        const remoteSnap = await getDoc(remoteDocRef).catch(() => null);
        if (remoteSnap && remoteSnap.exists()) {
          const remoteData = remoteSnap.data();
          const remoteUpdated = normalizeTimestamp(remoteData?.updatedAt);
          const localUpdated = normalizeTimestamp(q.data?.updatedAt || q.timestamp);

          // VERIFICA DI EQUIVALENZA PREVENTIVA (P0):
          // Se la mutazione pendente è già presente in modo equivalente su Firestore,
          // è già sincronizzata. Rimuovila dalla coda e risolvi conflitti pendenti correlati.
          const { isEquivalent } = compareCandidateWithRemote(normType, tripId, q.data, remoteData);
          if (isEquivalent) {
            await removePendingMutation(tripId, normType, dataId);
            const activeConflicts = await getConflictBackups(tripId);
            for (const c of activeConflicts) {
              if (c.dataId === dataId && c.entityType === normType && c.status === 'pending_review') {
                await updateConflictStatus(c.id, 'resolved_already_synced', 'Allineamento verificato durante riconciliazione');
              }
            }
            continue;
          }

          const isUncertain = (remoteUpdated <= 0 || localUpdated <= 0);
          const isServerNewer = (remoteUpdated > 0 && localUpdated > 0 && remoteUpdated > localUpdated);
          const isSameTimeDifferentContent = (remoteUpdated > 0 && localUpdated > 0 && remoteUpdated === localUpdated && !isEquivalent);

          if (isUncertain || isServerNewer || isSameTimeDifferentContent) {
            const reason = isUncertain
              ? `timestamp inaffidabile (server: ${remoteUpdated}, locale: ${localUpdated})`
              : isServerNewer
              ? `versione remota più recente (${remoteUpdated} > ${localUpdated})`
              : `stesso timestamp (${localUpdated}) con contenuti discordanti`;

            // Archiviazione preventiva di sicurezza
            await saveConflictBackup({
              tripId,
              entityType: normType,
              dataId,
              localData: q.data,
              serverData: remoteData,
              conflictType: isServerNewer ? 'server_newer' : 'unreliable_timestamp_conflict',
              serverUpdated: remoteUpdated,
              localUpdated,
              status: 'pending_review'
            });

            throw new Error(`Conflitto bloccante su ${normType}/${dataId}: ${reason}. Scrittura bloccata e versioni preservate.`);
          }
        }
      } catch (checkErr: any) {
        if (checkErr.message?.includes('Conflitto bloccante')) {
          throw checkErr;
        }
        throw new Error(`Impossibile verificare lo stato remoto di ${normType}/${dataId}: ${checkErr.message || checkErr}. Scritture non abilitate.`);
      }
    }
  }

  // Se tutte le mutazioni in coda erano già equivalenti e sono state rimosse:
  const remainingBeforeFlush = await getPendingMutations(tripId);
  if (remainingBeforeFlush.length === 0) {
    allowCloudWriteForTrip0000(true);
    if (activeSyncService && activeSyncService.getTripId() === tripId) {
      activeSyncService.triggerAutomaticSync('owner_activation_unlocked');
    }
    return {
      success: true,
      pushedCount: beforeCount,
      remainingCount: 0,
      conflictsCount: 0,
      errors: []
    };
  }

  // 6. TUTTI i controlli preliminari sono superati: abilita temporaneamente le scritture ed esegui il flush
  allowCloudWriteForTrip0000(true);

  const errors: string[] = [];
  let service = activeSyncService;
  let tempCreated = false;
  if (!service || service.getTripId() !== tripId) {
    service = new SyncService(tripId);
    tempCreated = true;
  }

  try {
    await service.flushPendingQueue();
  } catch (err: any) {
    errors.push(err?.message || String(err));
  } finally {
    if (tempCreated && service) {
      service.destroy();
    }
  }

  const afterQueue = await getPendingMutations(tripId);
  const remainingCount = afterQueue.length;
  const pushedCount = Math.max(0, beforeCount - remainingCount);
  const remainingConflicts = (await getConflictBackups(tripId)).filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record');

  const isSuccess = errors.length === 0 && remainingCount === 0;

  // Punto 2: Non lasciare il flag cloud-write attivo dopo errori o riconciliazioni incomplete!
  if (!isSuccess) {
    allowCloudWriteForTrip0000(false);
    console.warn(`[SyncService] Riconciliazione incompleta o fallita (${remainingCount} pendenti, ${errors.length} errori): flag cloud-write reimpostato su BLOCCATO.`);
  } else if (activeSyncService && activeSyncService.getTripId() === tripId) {
    activeSyncService.triggerAutomaticSync('owner_activation_reconciled');
  }

  return {
    success: isSuccess,
    pushedCount,
    remainingCount,
    conflictsCount: remainingConflicts.length,
    errors
  };
}

export async function resolveControlledConflict(
  tripId: string,
  conflictId: string,
  resolution: 'mark_synced' | 'keep_remote' | 'keep_local'
): Promise<{ success: boolean; message: string; isEquivalent?: boolean }> {
  // 1. Verifica autorizzazioni
  if (isTripAuthRevoked(tripId)) {
    throw new Error('Operazione bloccata: autorizzazioni per il viaggio revocate.');
  }
  const user = auth?.currentUser;
  const config = getTripConfig();
  const authRole = getAuthoritativeCloudRole();
  const isOwnerUid = Boolean(user && !user.isAnonymous && config?.ownerUid && user.uid === config.ownerUid);
  const isOwnerRole = authRole === 'owner';

  if (!user || user.isAnonymous || (!isOwnerRole && !isOwnerUid)) {
    throw new Error('Operazione bloccata: risoluzione conflitti consentita esclusivamente all\'Owner verificato del viaggio.');
  }

  const conflict = await getConflictBackupById(conflictId);
  if (!conflict || conflict.tripId !== tripId) {
    throw new Error(`Conflitto ${conflictId} non trovato o non appartenente al viaggio.`);
  }

  const normType = normalizeQueueEntityType(conflict.entityType);
  const dataId = conflict.dataId;

  if (resolution === 'mark_synced') {
    if (!db) throw new Error('Database Firestore non inizializzato.');
    const { doc, getDoc } = await import('firebase/firestore');
    const remoteDocRef = doc(db, 'trips', tripId, normType, dataId);
    const remoteSnap = await getDoc(remoteDocRef).catch(() => null);
    if (!remoteSnap || !remoteSnap.exists()) {
      throw new Error(`Il documento ${normType}/${dataId} non esiste su Firestore. Impossibile contrassegnare come già sincronizzato.`);
    }

    const remoteData = remoteSnap.data();
    const { isEquivalent, differences } = compareCandidateWithRemote(normType, tripId, conflict.localData, remoteData);
    if (!isEquivalent) {
      const diffFields = differences.map(d => d.field).join(', ');
      throw new Error(`I contenuti differiscono su: ${diffFields}. Scegli se mantenere la versione Cloud o Locale.`);
    }

    // Contenuto verificato equivalente al 100%:
    // 1. Archivia il conflitto come risolto
    await updateConflictStatus(conflictId, 'resolved_already_synced', 'Allineamento verificato con Firestore in sola lettura.');
    // 2. Rimuovi dalla coda locale
    await removePendingMutation(tripId, normType, dataId);
    // NOTA DI SICUREZZA: Nessuna scrittura verso Firestore, nessun tocco a private_credentials.

    return {
      success: true,
      message: '✓ Mutazione verificata e confermata come già sincronizzata su Firestore. Coda liberata senza riscritture.',
      isEquivalent: true
    };
  }

  if (resolution === 'keep_remote') {
    // 1. Archivia il conflitto come resolved_keep_remote
    await updateConflictStatus(conflictId, 'resolved_keep_remote', 'Scelta esplicita Owner: mantenuta versione remota.');
    // 2. Rimuovi dalla coda locale
    await removePendingMutation(tripId, normType, dataId);
    // 3. Se presente serverData, aggiorna lo store locale IndexedDB
    if (conflict.serverData) {
      const storeName = (STORES as any)[normType.toUpperCase()] || normType;
      try {
        const merged = mergeEntitySecurityData({ ...conflict.serverData, id: dataId }, conflict.localData);
        await idbPut(storeName, merged);
      } catch (idbErr) {
        console.warn(`[SyncService] Impossibile aggiornare store locale per ${normType}/${dataId}:`, idbErr);
      }
    }

    return {
      success: true,
      message: '✓ Versione Cloud mantenuta. Mutazione locale scartata e conflitto archiviato.'
    };
  }

  if (resolution === 'keep_local') {
    // Scelta esplicita Owner: forza la versione locale come vincente
    await updateConflictStatus(conflictId, 'resolved_keep_local', 'Scelta esplicita Owner: priorità a versione locale.');
    const now = Date.now();
    await savePendingMutation({
      tripId,
      entityType: normType,
      action: 'save',
      data: {
        ...conflict.localData,
        updatedAt: now
      },
      timestamp: now
    });

    return {
      success: true,
      message: '✓ Versione locale impostata come vincente con timestamp aggiornato. Pronta per la riconciliazione.'
    };
  }

  throw new Error(`Risoluzione '${resolution}' non supportata.`);
}

export async function enableCopilotBidirectionalSync(tripId: string): Promise<{
  success: boolean;
  error?: string;
  isCloudWriteAllowed: boolean;
}> {
  if (isTripAuthRevoked(tripId)) {
    throw new Error('Operazione bloccata: autorizzazioni per il viaggio revocate.');
  }

  const user = auth?.currentUser;
  const authRole = getAuthoritativeCloudRole();

  if (!user || user.isAnonymous) {
    throw new Error('Operazione bloccata: richiesta autenticazione Google.');
  }

  if (authRole !== 'copilota') {
    throw new Error(`Operazione consentita solo per ruolo Copilota verificato (ruolo attuale: ${authRole}). Nessuna elevazione privilegi.`);
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Operazione bloccata: dispositivo offline.');
  }

  // Verifica conflitti esistenti attivi (status: pending_review)
  const conflictBackups = await getConflictBackups(tripId);
  const pendingConflicts = conflictBackups.filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record');
  if (pendingConflicts.length > 0) {
    throw new Error(`Operazione bloccata: presenti ${pendingConflicts.length} conflitti in archivio da verificare prima di attivare le scritture.`);
  }

  // Verifica mutazioni locali pendenti (se presenti sul dispositivo del Copilota)
  const queue = await getPendingMutations(tripId);
  if (queue.length > 0 && db) {
    for (const q of queue) {
      const normType = normalizeQueueEntityType(q.entityType);
      const dataId = q.data?.id;
      if (!dataId) continue;
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'trips', tripId, normType, dataId)).catch(() => null);
      if (snap && snap.exists()) {
        const sData = snap.data();
        const sUp = normalizeTimestamp(sData?.updatedAt);
        const lUp = normalizeTimestamp(q.data?.updatedAt);
        const { isEquivalent } = compareCandidateWithRemote(normType, tripId, q.data, sData);
        if (isEquivalent) {
          await removePendingMutation(tripId, normType, dataId);
          continue;
        }
        if (sUp <= 0 || lUp <= 0 || sUp > lUp) {
          throw new Error(`Conflitto rilevato su ${normType}/${dataId}: sincronizzazione bidirezionale Copilota non abilitata.`);
        }
      }
    }
  }

  // Abilita la sincronizzazione cloud per 0000 sul client del Copilota (privilegi rigorosamente member / copilota)
  allowCloudWriteForTrip0000(true);

  if (activeSyncService && activeSyncService.getTripId() === tripId) {
    activeSyncService.triggerAutomaticSync('copilot_activation_unlocked');
    if (queue.length > 0) {
      activeSyncService.flushPendingQueue().catch((err) => {
        console.warn('[SyncService] Flush iniziale Copilota differito:', err);
      });
    }
  }

  return {
    success: true,
    isCloudWriteAllowed: true
  };
}

if (typeof window !== 'undefined') {
  (window as any).__hounigoDiagnostics = {
    getPreActivationSyncReport,
    allowCloudWriteForTrip0000,
    isTrip0000CloudWriteAllowed,
    allowQueueFlushForTrip0000,
    isQueueFlushAllowedForTrip0000,
    executeControlledReconciliation,
    resolveControlledConflict,
    compareCandidateWithRemote,
    getConflictBackups,
    getPendingMutations,
    enableCopilotBidirectionalSync,
    getActiveSyncService,
    getLastSyncTimestamp,
    setLastSyncTimestamp,
    getLastSyncError,
    setLastSyncError
  };
}

export class SyncService {
  private unsubscribes: (() => void)[] = [];
  private domListeners: { target: EventTarget; type: string; listener: EventListener }[] = [];
  private tripId: string;
  private isSyncing = false;
  private pendingSyncRequest = false;
    private autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private pendingSyncTimeout: ReturnType<typeof setTimeout> | null = null;
  private initialSyncRequested = false;
  private isFlushingPending = false;

  constructor(tripId: string) {
    this.tripId = tripId;
    activeSyncService = this;
    this.cleanupLegacySettingsQueue().catch(() => {});
    this.cleanupLegacyConflictBackupsFromSettings().catch(() => {});
    this.setupLocalListeners();
    this.setupCloudListeners();
    // Avvia sincronizzazione iniziale solo se già autorizzati, altrimenti il listener houni_cloud_role_changed la avvierà non appena confermato
    if (isCloudAuthorized(this.tripId)) {
      this.requestInitialSync('constructor');
    } else {
      console.log('[SyncService] Avvio sync iniziale posticipato: in attesa di autorizzazione cloud.');
    }
  }

  public canWriteToCloud(): boolean {
    if (this.isDestroyed) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (!isCloudAuthorized(this.tripId)) return false;
    if (this.tripId === '0000' && !isTrip0000CloudWriteAllowed()) {
      return false;
    }
    return true;
  }

  private requestInitialSync(reason: string): void {
    if (this.isDestroyed || this.initialSyncRequested) return;
    this.initialSyncRequested = true;
    this.syncBidirectional().catch(err => console.warn(`[SyncService] Errore sync iniziale (${reason}):`, err));
  }

  public triggerAutomaticSync(reason: string): void {
    if (this.isDestroyed || typeof window === 'undefined') return;
    if (this.autoSyncDebounceTimer) {
      clearTimeout(this.autoSyncDebounceTimer);
    }
    this.autoSyncDebounceTimer = setTimeout(() => {
      this.autoSyncDebounceTimer = null;
      if (this.isDestroyed) return;
      if (!isCloudAuthorized(this.tripId)) {
        console.log(`[SyncService] Sincronizzazione automatica sospesa (${reason}): sessione non autorizzata.`);
        return;
      }
      console.log(`[SyncService] Esecuzione sincronizzazione automatica (${reason})...`);
      this.syncBidirectional().catch(err => console.warn(`[SyncService] Errore sync (${reason}):`, err));
    }, 300);
  }

  public async syncBidirectional(): Promise<void> {
    if (this.isDestroyed) return;
    if (this.isSyncing) {
      this.pendingSyncRequest = true;
      console.log('[SyncService] Sync già in corso: richiesta successiva accodata.');
      return;
    }
    this.isSyncing = true;
    try {
      await this.executeSyncBidirectional();
    } finally {
      this.isSyncing = false;
      if (this.pendingSyncRequest && !this.isDestroyed) {
        this.pendingSyncRequest = false;
        if (this.pendingSyncTimeout) clearTimeout(this.pendingSyncTimeout);
        this.pendingSyncTimeout = setTimeout(() => {
          this.pendingSyncTimeout = null;
          if (!this.isDestroyed) {
            this.triggerAutomaticSync('pending_queued');
          }
        }, 100);
      }
    }
  }

  private async executeSyncBidirectional(): Promise<void> {
    if (this.isDestroyed) return;
    let pulledCount = 0;
    let pushedCount = 0;
    let deletedCount = 0;
    let failedCount = 0;

    // --- FASE 1: RICONCILIAZIONE PRELIMINARE SETTINGS E TOMBSTONES (FAIL-FAST) ---
    // I tombstone remoti devono essere acquisiti e applicati PRIMA di qualsiasi push.
    // Se la Fase 1 fallisce, la Fase 2 viene BLOCCATA per evitare di resuscitare entità cancellate.
    try {
      const phase1Result = await this.syncSettingsAndTombstones();
      pulledCount += phase1Result.pulledCount;
      pushedCount += phase1Result.pushedCount;
      deletedCount += phase1Result.deletedCount;
    } catch (phase1Err) {
      console.warn('[SyncService] FASE 1 FALLITA (impossibile riconciliare settings/tombstone): push entità operative bloccato per prevenire resurrezioni!', phase1Err);
      failedCount++;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_sync_error', {
          detail: { failedCount, reason: 'phase1_tombstones_failed', remainingPending: true }
        }));
      }
      return; // BLOCCO FAIL-FAST: nessuna entità operativa viene sincronizzata!
    }

    // --- FASE 2: RICONCILIAZIONE ENTITÀ OPERATIVE ---
    try {
      const phase2Result = await this.syncOperationalEntities();
      pulledCount += phase2Result.pulledCount;
      pushedCount += phase2Result.pushedCount;
      deletedCount += phase2Result.deletedCount;
      failedCount += phase2Result.failedCount;
    } catch (phase2Err) {
      console.warn('[SyncService] Errore durante la sincronizzazione delle entità operative:', phase2Err);
      failedCount++;
    }

    // --- FASE 3: EMISSIONE DEGLI EVENTI DI STATO ---
    if (failedCount > 0) {
      setLastSyncError(this.tripId, `Rilevati ${failedCount} errori durante la sincronizzazione cloud.`);
    } else {
      setLastSyncTimestamp(this.tripId, Date.now());
    }
    this.emitSyncStatus();

    if (typeof window !== 'undefined') {
      if (failedCount > 0) {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_sync_error', {
          detail: { failedCount, remainingPending: true }
        }));
      } else if (pushedCount > 0 || pulledCount > 0 || deletedCount > 0) {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_synced', {
          detail: { pushedCount, pulledCount, deletedCount, timestamp: Date.now() }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_sync_idle', {
          detail: { timestamp: Date.now() }
        }));
      }
    }

    console.log(`[SyncService] Sync bidirezionale completato (pull: ${pulledCount}, push: ${pushedCount}, del: ${deletedCount}, err: ${failedCount})`);
  }

  /**
   * FASE 1: Sincronizzazione atomica preliminare di Settings e Tombstone.
   * Se fallisce, solleva eccezione per impedire l'esecuzione della Fase 2.
   */
  private async syncSettingsAndTombstones(): Promise<{ pulledCount: number; pushedCount: number; deletedCount: number }> {
    const { getDocs } = await import('firebase/firestore');
    const colRef = collection(db, 'trips', this.tripId, 'settings');
    const snap = await getDocs(colRef);

    let pulledCount = 0;
    let pushedCount = 0;
    let deletedCount = 0;
    const serverDocIds = new Set<string>();

    for (const docSnap of snap.docs) {
      const serverData = docSnap.data();
      const docId = docSnap.id;
      serverDocIds.add(docId);

      if (docId.startsWith('tombstone_')) {
        const parts = docId.split('_');
        const entityType = parts[1] || '';
        const deletedId = serverData?.deletedId || parts.slice(2).join('_');
        const store = this.getStoreForEntity(entityType);

        if (store && deletedId) {
          const localItem = await idbGet<any>(store, deletedId);
          if (localItem) {
            // CRITICITÀ 2 RISOLTA: Non cancellare se esiste una mutazione locale pendente in coda
            const hasPending = await hasPendingMutation(this.tripId, entityType, deletedId) ||
                               await hasPendingMutation(this.tripId, this.mapEntityToCollection(entityType) || entityType, deletedId);
            if (hasPending) {
              console.log(`[SyncService] Preservato record locale per ${entityType}/${deletedId} a fronte di tombstone remoto: mutazione locale pendente presente.`);
              continue;
            }

            const localCreated = normalizeTimestamp(localItem.createdAt);
            const localUpdated = normalizeTimestamp(localItem.updatedAt);
            const tombstoneDeleted = normalizeTimestamp(serverData.deletedAt || serverData.timestamp);

            const isLocallyModifiedOrNewer = hasPending ||
              (localCreated > 0 && tombstoneDeleted > 0 && localCreated > tombstoneDeleted) ||
              (localUpdated > 0 && tombstoneDeleted > 0 && localUpdated > tombstoneDeleted);

            if (isLocallyModifiedOrNewer) {
              // CONFLITTO P0: Il server ha un tombstone (cancellato), ma il client ha una modifica locale successiva o pendente.
              // REGOLA FERREA: NON cancellare automaticamente il tombstone remoto (non resuscitare ciecamente),
              // e NON cancellare il dato locale. Conserva entrambe le versioni e archivia il conflitto per riconciliazione esplicita!
              console.warn(`[SyncService] Conflitto tombstone remoto vs modifica locale per ${entityType}/${deletedId}. Conservo entrambe le versioni.`);
              
              await saveConflictBackup({
                tripId: this.tripId,
                entityType,
                dataId: deletedId,
                localData: localItem,
                serverData,
                conflictType: 'remote_tombstone_vs_local_edit',
                localUpdated,
                tombstoneDeletedAt: tombstoneDeleted,
                status: 'pending_review'
              });

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('roadbook_conflict_detected', {
                  detail: { entityType, id: deletedId, conflictType: 'remote_tombstone_vs_local_edit' }
                }));
              }
              // NON cancellare localmente e NON eliminare il tombstone remoto
              continue;
            } else {
              // Cancellazione remota
              const isExplicitAuthorizedDelete = Boolean(
                serverData?.explicitDeleteBy || serverData?.value?.explicitDeleteBy
              );
              if (this.tripId === '0000') {
                // SICUREZZA 0000: Archivia SEMPRE una copia di sicurezza prima di qualsiasi operazione
                await saveConflictBackup({
                  tripId: this.tripId,
                  entityType,
                  dataId: deletedId,
                  localData: localItem,
                  serverData,
                  conflictType: 'remote_tombstone_vs_local_edit',
                  localUpdated,
                  tombstoneDeletedAt: tombstoneDeleted,
                  status: 'archived_remote_delete'
                });
                if (!isExplicitAuthorizedDelete) {
                  // SICUREZZA 0000: I tombstone remoti non verificati non cancellano automaticamente dati locali!
                  console.warn(`[SyncService] Tombstone remoto per ${entityType}/${deletedId} su 0000: copia archiviata, dato locale preservato senza cancellazione automatica.`);
                  continue;
                }
              }
              // Applicazione cancellazione remota esplicita e verificata (o standard per altri viaggi)
              console.log(`[SyncService] Applicazione cancellazione remota: eliminato locale ${entityType}/${deletedId}`);
              await idbDelete(store, deletedId);
              deletedCount++;
            }
          }
        }

        // Salva il tombstone in STORES.SETTINGS locale e in localStorage
        await idbPut(STORES.SETTINGS, { id: docId, value: { ...serverData, pending: false } });
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(docId, 'true'); } catch (e) {}
        }
        pulledCount++;
      } else if (!docId.startsWith('device_role_backup') && !docId.startsWith('device_session_backup') && !docId.startsWith('trip_config_backup')) {
        // Setting ordinario (escludendo sempre chiavi strettamente per-dispositivo)
        await idbPut(STORES.SETTINGS, { id: docId, ...serverData });
        pulledCount++;
      }
    }

    // Push dei tombstone locali non ancora presenti sul server o marcati come pending
    const localSettings = await idbGetAll<any>(STORES.SETTINGS);
    let pendingTombstonePushFailure: Error | null = null;

    for (const s of localSettings) {
      if (s && s.id && s.id.startsWith('tombstone_')) {
        if (this.tripId === '0000') {
          // SICUREZZA 0000: I tombstone locali storici NON devono mai essere pubblicati massivamente su Firestore!
          // I tombstone rimangono isolati in IndexedDB locale.
          continue;
        }
        const isPending = !serverDocIds.has(s.id) || s.value?.pending === true;
        if (isPending) {
          if (!this.canWriteToCloud()) {
            // In modalità pre-attivazione (o offline) i tombstone locali restano memorizzati senza causare errore bloccante
            continue;
          }
          try {
            await setDoc(doc(db, 'trips', this.tripId, 'settings', s.id), this.cleanUndefinedValues(s.value || s), { merge: true });
            await idbPut(STORES.SETTINGS, { ...s, value: { ...(s.value || {}), pending: false } });
            pushedCount++;
            console.log(`[SyncService] Sincronizzato tombstone locale verso Cloud: settings/${s.id}`);
          } catch (err: any) {
            console.warn(`[SyncService] Impossibile inviare tombstone locale ${s.id}:`, err);
            if (!pendingTombstonePushFailure) {
              pendingTombstonePushFailure = err instanceof Error ? err : new Error(String(err));
            }
          }
        }
      }
    }

    if (pendingTombstonePushFailure) {
      throw new Error(`Sincronizzazione tombstone fallita o incompleta: ${pendingTombstonePushFailure.message}`);
    }

    return { pulledCount, pushedCount, deletedCount };
  }

  /**
   * FASE 2: Sincronizzazione delle entità operative (giorni, attività, trasporti, ecc.).
   * Eseguita ESCLUSIVAMENTE se la Fase 1 ha avuto successo.
   */
  private async syncOperationalEntities(): Promise<{ pulledCount: number; pushedCount: number; deletedCount: number; failedCount: number }> {
    const { getDocs } = await import('firebase/firestore');
    const operationalCollections = this.getOperationalCollections();
    const credentialsMap = new Map<string, any>();
    if (isCloudAuthorized(this.tripId)) {
      try {
        const privSnap = await getDocs(collection(db, 'trips', this.tripId, 'private_credentials'));
        for (const pDoc of privSnap.docs) {
          const pData = pDoc.data();
          credentialsMap.set(pDoc.id, pData);
          if (pData.entityId) {
            credentialsMap.set(pData.entityId, pData);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Lettura private_credentials non autorizzata o non disponibile:', err);
      }
    }
    let pulledCount = 0;
    let pushedCount = 0;
    let deletedCount = 0;
    let failedCount = 0;

    for (const { fb, store } of operationalCollections) {
      try {
        const colRef = collection(db, 'trips', this.tripId, fb);
        const snap = await getDocs(colRef);
        const serverDocIds = new Set<string>();

        for (const docSnap of snap.docs) {
          const serverData = docSnap.data();
          const docId = docSnap.id;
          serverDocIds.add(docId);

          if (fb === 'documenti' && docId.startsWith('att_chunk_')) {
            continue;
          }

          // Controllo tombstone locale
          const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
          if (tombstoneSetting && tombstoneSetting.value) {
            const serverCreated = normalizeTimestamp(serverData.createdAt);
            const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);

            if (serverCreated > 0 && tombstoneDeleted > 0 && serverCreated > tombstoneDeleted) {
              // Ricreazione valida sul cloud: rimuovo tombstone locale e consento pull
              console.log(`[SyncService] Rilevata ricreazione valida su Cloud per ${fb}/${docId} - rimuovo tombstone locale.`);
              await idbDelete(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
              if (typeof localStorage !== 'undefined') {
                try { localStorage.removeItem(`tombstone_${fb}_${docId}`); } catch (e) {}
              }
            } else {
              // Elemento cancellato localmente
              if (this.tripId === '0000') {
                // SICUREZZA 0000: VIETATO cancellare automaticamente documenti su Firestore da tombstone locali!
                // Le cancellazioni su 0000 possono avvenire SOLO da azioni utente esplicite in coda.
                console.warn(`[SyncService] Sospesa cancellazione cloud per ${fb}/${docId} sul viaggio 0000: cancellazioni automatiche disabilitate.`);
                continue;
              }
              if (this.canWriteToCloud()) {
                await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                deletedCount++;
              } else {
                console.warn(`[SyncService] Sospesa eliminazione cloud per tombstone ${fb}/${docId}: in attesa di autorizzazione o sblocco pre-attivazione.`);
              }
              continue;
            }
          }

          const localData = await idbGet<any>(store, docId);
          const localUpdated = normalizeTimestamp(localData?.updatedAt);
          const serverUpdated = normalizeTimestamp(serverData?.updatedAt);

          // CRITICITÀ 3 RISOLTA: La verifica della mutazione pendente DEVE avvenire PRIMA di needsPrivateReconstruction
          // per impedire che il merge con la cassaforte remota sovrascriva modifiche locali/economiche non ancora sincronizzate!
          const hasPendingQueueItem = await hasPendingMutation(this.tripId, fb, docId) ||
                                      await hasPendingMutation(this.tripId, this.mapCollectionToEntity(fb) || fb, docId);
          if (hasPendingQueueItem) {
            console.log(`[SyncService] Conservo mutazione locale pendente in coda per ${fb}/${docId} - ignorato pull e ricostruzione cloud.`);
            continue;
          }

          const normType = normalizeEntityType(fb);
          const vaultId = getVaultDocId(normType, docId);
          const privData = credentialsMap.get(vaultId) || credentialsMap.get(docId);

          // VERIFICA RECUPERO PREZZI P0: Se l'utente è Owner/Copilota e la copia locale ha perso i prezzi
          // (cache precedentemente sanitizzata), ricostruisci automaticamente dalla cassaforte ANCHE a timestamp uguali!
          const needsPrivateReconstruction = Boolean(privData && localData && (
            (privData.cost !== undefined && localData.cost === undefined && localData.costo === undefined) ||
            (privData.costo !== undefined && localData.cost === undefined && localData.costo === undefined) ||
            (privData.acconto !== undefined && localData.acconto === undefined) ||
            (privData.depositPaid !== undefined && localData.depositPaid === undefined) ||
            (privData.deposit !== undefined && localData.deposit === undefined) ||
            (privData.budget !== undefined && localData.budget === undefined) ||
            (privData.paymentStatus !== undefined && localData.paymentStatus === undefined) ||
            (privData.bookingCode !== undefined && localData.bookingCode === undefined && localData.pnr === undefined && localData.codicePrenotazione === undefined) ||
            (privData.pnr !== undefined && localData.pnr === undefined && localData.bookingCode === undefined) ||
            (privData.pinCode !== undefined && localData.pinCode === undefined && localData.pin === undefined) ||
            (privData.noteCopilota !== undefined && localData.noteCopilota === undefined) ||
            (Array.isArray(privData.attachments) && (!Array.isArray(localData.attachments) || localData.attachments.length < privData.attachments.length))
          ));

          if (needsPrivateReconstruction) {
            console.log(`[SyncService] Recupero automatico prezzi da cassaforte per ${fb}/${docId} (timestamp uguale)`);
            let reconstructed = mergeEntitySecurityData(localData, privData);
            if (Array.isArray(reconstructed.attachments) && reconstructed.attachments.length > 0) {
              const resolved = [];
              for (const att of reconstructed.attachments) {
                if (att.isChunked && !att.dataUrl) {
                  const localAtt = (localData as any)?.attachments?.find((la: any) => la.id === att.id);
                  if (localAtt && localAtt.dataUrl) {
                    resolved.push({ ...att, dataUrl: localAtt.dataUrl });
                  } else {
                    try {
                      const { downloadAttachmentFromChunks } = await import('./attachmentChunkService');
                      const rec = await downloadAttachmentFromChunks(this.tripId, att);
                      resolved.push(rec?.dataUrl ? rec : att);
                    } catch {
                      resolved.push(att);
                    }
                  }
                } else {
                  resolved.push(att);
                }
              }
              reconstructed.attachments = resolved;
            }
            await idbPut(store, reconstructed);
            pulledCount++;
            continue;
          }

          if (localData && localUpdated > 0 && localUpdated > serverUpdated) {
            // Local is newer: push to cloud solo se autorizzati
            if (!this.canWriteToCloud()) {
              console.warn(`[SyncService] Sospeso push per ${fb}/${docId}: modifiche locali preservate in attesa di sblocco cloud/pre-attivazione.`);
              continue;
            }

            // Un documento Firestore privo di updatedAt (serverUpdated <= 0) NON deve essere considerato automaticamente vecchio!
            if (serverUpdated <= 0) {
              const normType = normalizeEntityType(fb);
              const { isEquivalent } = compareCandidateWithRemote(normType, this.tripId, localData, serverData);
              if (!isEquivalent) {
                console.warn(`[SyncService] Documento remoto ${fb}/${docId} privo di updatedAt e discordante dal dato locale: preservo entrambe le copie e isolo il record.`);
                await saveConflictBackup({
                  tripId: this.tripId,
                  entityType: normType,
                  dataId: docId,
                  localData,
                  serverData,
                  conflictType: 'unreliable_timestamp_conflict',
                  serverUpdated,
                  localUpdated,
                  status: 'pending_review'
                });
              }
              continue;
            }

            // SICUREZZA 0000: NESSUN push automatico non richiesto di dati storici locali!
            if (this.tripId === '0000') {
              const hasExplicitMutation = await hasPendingMutation(this.tripId, fb, docId) ||
                                          await hasPendingMutation(this.tripId, this.mapCollectionToEntity(fb) || fb, docId);
              if (!hasExplicitMutation) {
                // Il dato locale ha updatedAt > serverUpdated ma NON proviene da una mutazione esplicita in coda:
                // Confronta strutturalmente con la versione remota
                const normType = normalizeEntityType(fb);
                const { isEquivalent } = compareCandidateWithRemote(normType, this.tripId, localData, serverData);
                if (isEquivalent) {
                  // Contenuto già equivalente, nessun push necessario
                  continue;
                }
                // Contenuto discordante non autorizzato esplicitamente: NON sovrascrivere Firestore!
                // Preserva entrambe le versioni e archivia il conflitto per revisione esplicita dell'utente.
                console.warn(`[SyncService] Modifica locale storica discordante per ${fb}/${docId} su 0000: push automatico bloccato e versioni preservate.`);
                await saveConflictBackup({
                  tripId: this.tripId,
                  entityType: normType,
                  dataId: docId,
                  localData,
                  serverData,
                  conflictType: 'unreliable_timestamp_conflict',
                  serverUpdated,
                  localUpdated,
                  status: 'pending_review'
                });
                continue;
              }
            }

            const hasPendingPush = await hasPendingMutation(this.tripId, fb, docId) ||
                                   await hasPendingMutation(this.tripId, this.mapCollectionToEntity(fb) || fb, docId);
            if (this.tripId !== '0000' || hasPendingPush) {
              const entityType = this.mapCollectionToEntity(fb);
              if (entityType) {
                await this.pushToCloud(entityType, 'save', localData);
              } else {
                await setDoc(doc(db, 'trips', this.tripId, fb, docId), this.cleanUndefinedValues(localData), { merge: true });
              }
              pushedCount++;
              continue;
            }
          } else if (localData && localUpdated > 0 && localUpdated === serverUpdated) {
            // Se localUpdated === serverUpdated, verifichiamo equivalenza strutturale:
            const normType = normalizeEntityType(fb);
            const { isEquivalent } = compareCandidateWithRemote(normType, this.tripId, localData, serverData);
            if (isEquivalent) {
              continue;
            }
            const hasExplicit = await hasPendingMutation(this.tripId, fb, docId) ||
                                await hasPendingMutation(this.tripId, this.mapCollectionToEntity(fb) || fb, docId);
            if (hasExplicit) {
              continue;
            }
          } else {
            // Cloud is newer or local item missing: store locally, reconstructing chunks if needed
            let itemToStore: any = { ...serverData, id: docId };
            const normType = normalizeEntityType(fb);
            const vaultId = getVaultDocId(normType, docId);
            const privData = credentialsMap.get(vaultId) || credentialsMap.get(docId);
            if (privData) {
              itemToStore = mergeEntitySecurityData(itemToStore, privData);
            } else if (localData) {
              // PRESERVAZIONE DATI PRIVATI: Se la cassaforte remota non è accessibile (lockdown o offline),
              // non azzerare mai i dati economici e sensibili già presenti nella copia locale!
              itemToStore = mergeEntitySecurityData(itemToStore, localData);
            }
            if (Array.isArray(itemToStore.attachments) && itemToStore.attachments.length > 0) {
              const resolved = [];
              for (const att of itemToStore.attachments) {
                if (att.isChunked && !att.dataUrl) {
                  const localAtt = (localData as any)?.attachments?.find((la: any) => la.id === att.id);
                  if (localAtt && localAtt.dataUrl) {
                    resolved.push({ ...att, dataUrl: localAtt.dataUrl });
                  } else {
                    try {
                      const { downloadAttachmentFromChunks } = await import('./attachmentChunkService');
                      const reconstructed = await downloadAttachmentFromChunks(this.tripId, att);
                      resolved.push(reconstructed?.dataUrl ? reconstructed : att);
                    } catch {
                      resolved.push(att);
                    }
                  }
                } else {
                  resolved.push(att);
                }
              }
              itemToStore.attachments = resolved;
            }

            await idbPut(store, itemToStore);
            pulledCount++;
          }
        }

        // Secondo loop: elementi locali non presenti su Firestore
        const localItems = await idbGetAll<any>(store);
        for (const localItem of localItems) {
          if (localItem && localItem.id && !serverDocIds.has(localItem.id)) {
            // Non sincronizzare se eliminato intenzionalmente da tombstone
            const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${localItem.id}`);
            if (tombstoneSetting && tombstoneSetting.value) {
              const localCreated = normalizeTimestamp(localItem.createdAt);
              const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
              if (!(localCreated > 0 && tombstoneDeleted > 0 && localCreated > tombstoneDeleted)) {
                // Elemento eliminato
                if (this.tripId === '0000') {
                  // SICUREZZA 0000: Nessuna cancellazione automatica di dati locali non verificati
                  await saveConflictBackup({
                    tripId: this.tripId,
                    entityType: normalizeEntityType(fb),
                    dataId: localItem.id,
                    localData: localItem,
                    serverData: tombstoneSetting.value,
                    conflictType: 'remote_tombstone_vs_local_edit',
                    localUpdated: localCreated,
                    tombstoneDeletedAt: tombstoneDeleted,
                    status: 'archived_remote_delete'
                  });
                  continue;
                }
                await idbDelete(store, localItem.id);
                continue;
              }
            }
            if (!this.canWriteToCloud()) {
              continue;
            }

            // SICUREZZA 0000: NESSUN push automatico di elementi locali non presenti su Firestore!
            // I record solo locali storici non devono inquinare il Cloud né rischiare di sovrascrivere dati.
            if (this.tripId === '0000') {
              const hasExplicitMutation = await hasPendingMutation(this.tripId, fb, localItem.id) ||
                                          await hasPendingMutation(this.tripId, this.mapCollectionToEntity(fb) || fb, localItem.id);
              if (!hasExplicitMutation) {
                console.warn(`[SyncService] Record solo locale ${fb}/${localItem.id} su 0000: preservato localmente, NESSUN push automatico a Firestore.`);
                await saveConflictBackup({
                  tripId: this.tripId,
                  entityType: normalizeEntityType(fb),
                  dataId: localItem.id,
                  localData: localItem,
                  serverData: null,
                  conflictType: 'local_only_record',
                  localUpdated: normalizeTimestamp(localItem.updatedAt || localItem.createdAt),
                  status: 'archived_local_only'
                });
                continue;
              }
            }

            try {
              const entityType = this.mapCollectionToEntity(fb);
              if (entityType) {
                await this.pushToCloud(entityType, 'save', localItem);
              } else {
                await setDoc(doc(db, 'trips', this.tripId, fb, localItem.id), this.cleanUndefinedValues(localItem), { merge: true });
              }
              pushedCount++;
              console.log(`[SyncService] Sincronizzato record locale verso Cloud: ${fb}/${localItem.id}`);
            } catch (pushErr) {
              console.warn(`[SyncService] Impossibile pushare record locale ${fb}/${localItem.id}:`, pushErr);
              failedCount++;
            }
          }
        }
      } catch (colErr) {
        console.warn(`[SyncService] Errore sync collection ${fb}:`, colErr);
        failedCount++;
      }
    }

    return { pulledCount, pushedCount, deletedCount, failedCount };
  }


  public async syncAllLocalToCloud(): Promise<void> {
    if (this.tripId === '0000') {
      console.warn('[SyncService] syncAllLocalToCloud annullato: operazione massiva VIETATA categoricamente per il viaggio 0000.');
      return;
    }
    if (!this.canWriteToCloud()) {
      console.warn('[SyncService] syncAllLocalToCloud annullato: scrittura cloud non autorizzata (pre-attivazione attiva).');
      return;
    }
    const collectionsToSync = this.getCollectionsToSync();
    const pushedCounts: Record<string, number> = {};

    for (const { fb, store } of collectionsToSync) {
      const items = await idbGetAll<any>(store);
      pushedCounts[fb] = items.length;
      const entityType = this.mapCollectionToEntity(fb);
      if (!entityType) continue;

      for (const item of items) {
        await this.pushToCloud(entityType, 'save', item);
      }
    }

    console.log(`[SyncService] Push completo IndexedDB -> Firestore /trips/${this.tripId}`, pushedCounts);
  }

  private getOperationalCollections() {
    return [
      { fb: 'giorni', store: STORES.GIORNI },
      { fb: 'attivita', store: STORES.ATTIVITA },
      { fb: 'alloggi', store: STORES.ALLOGGI },
      { fb: 'trasporti', store: STORES.TRASPORTI },
      { fb: 'documenti', store: STORES.DOCUMENTI },
      { fb: 'tappe', store: STORES.TAPPE },
      { fb: 'ristoranti', store: STORES.RISTORANTI },
      { fb: 'shopping', store: STORES.SHOPPING },
      { fb: 'spese', store: STORES.SPESE },
      { fb: 'note', store: STORES.NOTE },
      { fb: 'bagagli', store: STORES.BAGAGLI }
    ] as const;
  }

  private getStoreForEntity(entity: string): StoreName | null {
    switch(entity) {
      case 'giorni': return STORES.GIORNI;
      case 'attivita':
      case 'activity': return STORES.ATTIVITA;
      case 'alloggi':
      case 'alloggio': return STORES.ALLOGGI;
      case 'trasporti':
      case 'trasporto': return STORES.TRASPORTI;
      case 'documenti': return STORES.DOCUMENTI;
      case 'tappe':
      case 'tappa': return STORES.TAPPE;
      case 'ristoranti':
      case 'ristorante': return STORES.RISTORANTI;
      case 'shopping': return STORES.SHOPPING;
      case 'spese':
      case 'spesa': return STORES.SPESE;
      case 'note':
      case 'nota':
      case 'notes':
      case 'scadenza':
      case 'scadenze': return STORES.NOTE;
      case 'bagagli':
      case 'bagaglio': return STORES.BAGAGLI;
      default: return null;
    }
  }

  private getCollectionsToSync() {
    return [
      { fb: 'giorni', store: STORES.GIORNI },
      { fb: 'attivita', store: STORES.ATTIVITA },
      { fb: 'alloggi', store: STORES.ALLOGGI },
      { fb: 'trasporti', store: STORES.TRASPORTI },
      { fb: 'documenti', store: STORES.DOCUMENTI },
      { fb: 'tappe', store: STORES.TAPPE },
      { fb: 'ristoranti', store: STORES.RISTORANTI },
      { fb: 'shopping', store: STORES.SHOPPING },
      { fb: 'spese', store: STORES.SPESE },
      { fb: 'note', store: STORES.NOTE },
      { fb: 'bagagli', store: STORES.BAGAGLI },
      { fb: 'settings', store: STORES.SETTINGS }
    ] as const;
  }

  private addDomListener(target: EventTarget, type: string, listener: EventListener) {
    if (target && typeof (target as any).addEventListener === 'function') {
      target.addEventListener(type, listener);
      this.domListeners.push({ target, type, listener });
    }
  }

  // --- 1. LOCAL TO CLOUD ---
  private setupLocalListeners() {
    this.addDomListener(window, 'roadbook_data_mutated', (async (e: Event) => {
      const custom = e as CustomEvent;
      const detail = custom?.detail || {};
      const { source } = detail;
      
      // Ignoriamo le mutazioni che arrivano gia dal cloud per evitare loop infiniti
      if (source === 'cloud') return;

      const rawEntity = detail.entityType || (typeof detail.action === 'string' && detail.action.includes('_') ? detail.action.split('_')[1] : '');
      const entityType = normalizeQueueEntityType(rawEntity) || rawEntity;
      const action = detail.action === 'delete' || (typeof detail.action === 'string' && detail.action.startsWith('delete_')) ? 'delete' : 'save';
      const data = detail.data || detail.item;
      if (!data || !data.id) return;
      
      try {
        const mutationId = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `mutation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        await this.pushToCloud(entityType, action, data, { notifyCollaborators: true, mutationId });
      } catch (err) {
        console.error('[SyncService] Errore Push to Cloud:', err);
      }
    }) as EventListener);

    this.addDomListener(window, 'houni_trip_auth_revoked', (async (e: Event) => {
      const revokedTripId = (e as CustomEvent)?.detail?.tripId;
      console.log(`[SyncService] Ricevuta revoca autorizzazioni per viaggio ${revokedTripId}: bonifica cache e conservazione della coda isolata.`);
      if (revokedTripId !== this.tripId) return;
      await this.purgeSensitiveLocalCache();
      // Retain pending edits; verified authorization is required before replay.
    }) as EventListener);

    this.addDomListener(window, 'force_cloud_sync_requested', (async () => {
      console.log('[SyncService] Avvio sincronizzazione forzata verso il cloud...');
      if (!this.canWriteToCloud()) {
        console.warn(`[SyncService] Sincronizzazione forzata verso il cloud sospesa per ${this.tripId}: modalità pre-attivazione protetta.`);
        return;
      }
      try {
        await this.syncAllLocalToCloud();
        console.log('[SyncService] Sincronizzazione forzata completata!');
      } catch (err) {
        console.error('[SyncService] Errore Sync Forzato:', err);
      }
    }) as EventListener);

    // Ripresa automatica al cambio di ruolo cloud verificato (owner / copilota)
    this.addDomListener(window, 'houni_cloud_role_changed', ((e: Event) => {
      const role = (e as CustomEvent)?.detail?.cloudRole;
      if (role === 'owner' || role === 'copilota') {
        console.log(`[SyncService] Rilevato ruolo autorizzato (${role}): verifica sincronizzazione.`);
        if (this.canWriteToCloud()) {
          this.flushPendingPushes().catch(() => {});
        } else {
          console.log('[SyncService] Replay automatico coda sospeso per viaggio 0000 (modalità pre-attivazione protetta).');
        }
        this.requestInitialSync('cloud_role_authorized');
      } else if (role === 'viewer') {
        // La cache locale NON viene bonificata automaticamente per evitare perdite di dati off-line
      }
    }) as EventListener);

    // Ripresa automatica al ritorno della connessione online con flush immediato della coda persistente
    this.addDomListener(window, 'online', (() => {
      console.log('[SyncService] Connessione di rete ripristinata (online): verifico autorizzazioni per sync.');
      setTimeout(() => {
        if (this.canWriteToCloud()) {
          this.flushPendingPushes().catch(() => {});
          this.triggerAutomaticSync('network_online');
        }
      }, 300);
    }) as EventListener);

    // Ripresa automatica al resume PWA (quando la finestra torna in primo piano / schermo sbloccato su iPhone)
    if (typeof document !== 'undefined') {
      this.addDomListener(document, 'visibilitychange', (() => {
        if (document.visibilityState === 'visible') {
          console.log('[SyncService] PWA in primo piano (visible): verifico autorizzazioni e coda pendente.');
          if (this.canWriteToCloud()) {
            this.flushPendingPushes().catch(() => {});
            this.triggerAutomaticSync('pwa_visible');
          }
        }
      }) as EventListener);
    }

    this.addDomListener(window, 'focus', (() => {
      if (this.canWriteToCloud()) {
        this.flushPendingPushes().catch(() => {});
      }
    }) as EventListener);
  }

  // Rimuove ricorsivamente le chiavi con valore undefined
  private cleanUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(v => this.cleanUndefinedValues(v));
    }
    const result: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        result[key] = this.cleanUndefinedValues(obj[key]);
      }
    }
    return result;
  }


  private async getPendingPushesFromStore(): Promise<PendingMutation[]> {
    return getPendingMutations(this.tripId);
  }

  private async persistPendingPush(item: { entityType: string; action: 'save' | 'delete'; data: any; notifyCollaborators?: boolean; mutationId?: string }): Promise<void> {
    await savePendingMutation({
      tripId: this.tripId,
      entityType: item.entityType,
      action: item.action,
      data: item.data,
      notifyCollaborators: item.notifyCollaborators,
      mutationId: item.mutationId
    });
    this.emitSyncStatus();
  }

  private async removePendingPushFromStore(entityType: string, dataId: string, expected: Pick<PendingMutation, 'action' | 'data' | 'mutationId'>): Promise<void> {
    await removePendingMutation(this.tripId, entityType, dataId, expected);
    this.emitSyncStatus();
  }

  private async cleanupLegacySettingsQueue(): Promise<void> {
    try {
      const allSettings = await idbGetAll<any>(STORES.SETTINGS);
      for (const s of allSettings) {
        if (s && typeof s.id === 'string' && s.id.startsWith('pending_push_')) {
          if ((s.tripId && s.tripId !== this.tripId) || !s.data?.id || !['save', 'delete'].includes(s.action)) continue;
          // Se contiene dati validi, migra e verifica nella nuova coda isolata prima di eliminare da settings
          if (s.data && s.data.id && s.action) {
            const rawEntity = s.entityType || s.collectionName || 'notes';
            const collectionName = this.mapEntityToCollection(rawEntity) || rawEntity;
            const alreadyInQueue = await hasPendingMutation(this.tripId, collectionName, s.data.id);
            if (alreadyInQueue) {
              const queued = (await getPendingMutations(this.tripId)).find(item => item.data?.id === s.data.id && item.entityType === collectionName);
              // A conflicting legacy payload stays intact until it can be reconciled explicitly.
              if (!queued || queued.action !== s.action || JSON.stringify(queued.data) !== JSON.stringify(s.data)) continue;
            }
            if (!alreadyInQueue) {
              await savePendingMutation({
                tripId: this.tripId,
                entityType: collectionName,
                action: s.action,
                data: s.data,
                notifyCollaborators: Boolean(s.notifyCollaborators),
                mutationId: s.mutationId,
                timestamp: s.timestamp
              });
              const verified = await hasPendingMutation(this.tripId, collectionName, s.data.id);
              if (!verified) {
                console.warn(`[SyncService] Fallita verifica migrazione mutazione legacy ${s.id}, conservo in settings.`);
                continue;
              }
            }
          }
          await idbDelete(STORES.SETTINGS, s.id);
        }
      }
    } catch {}
  }

  private async cleanupLegacyConflictBackupsFromSettings(): Promise<void> {
    try {
      const allSettings = await idbGetAll<any>(STORES.SETTINGS);
      for (const s of allSettings) {
        if (s && typeof s.id === 'string' && s.id.startsWith('_conflict_backup_')) {
          try {
            const savedId = await saveConflictBackup({
              tripId: s.tripId || this.tripId,
              entityType: s.entityType || 'unknown',
              dataId: s.dataId || s.id,
              localData: s.localData || s,
              conflictType: 'server_newer',
              serverUpdated: s.serverUpdated,
              localUpdated: s.localUpdated,
              savedAt: s.savedAt || Date.now()
            });
            // Verifica effettiva persistenza e integrità prima di eliminare da settings
            const verified = await getConflictBackupById(savedId);
            if (!verified) {
              console.warn(`[SyncService] Fallita verifica migrazione conflict backup ${s.id}: conservo in settings.`);
              continue;
            }
            await idbDelete(STORES.SETTINGS, s.id);
            console.log(`[SyncService] Migrato e verificato con successo conflict backup da settings: ${s.id}`);
          } catch (migrateErr) {
            console.error(`[SyncService] Errore migrazione conflict backup ${s.id}, conservo in settings:`, migrateErr);
            continue;
          }
        }
      }
    } catch {}
  }

  private emitSyncStatus(): void {
    if (typeof window === 'undefined') return;
    Promise.all([
      this.getPendingPushesFromStore(),
      getConflictBackups(this.tripId).catch(() => [])
    ]).then(([queue, conflicts]) => {
      const activeConflicts = (conflicts || []).filter(c => c.status === 'pending_review' && c.conflictType !== 'local_only_record');
      const isOnline = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
      const lastError = getLastSyncError(this.tripId);
      const isAllowed = this.tripId === '0000' ? isTrip0000CloudWriteAllowed() : true;
      let friendlyStatus: UserFriendlySyncStatus = 'Sincronizzazione attiva';
      if (!isOnline) friendlyStatus = 'Nessuna connessione';
      else if (activeConflicts.length > 0) friendlyStatus = 'Conflitto da verificare';
      else if (lastError) friendlyStatus = 'Errore di sincronizzazione';
      else if (!isAllowed) friendlyStatus = 'In attesa di attivazione';
      else if (queue.length > 0) friendlyStatus = 'Modifiche in attesa';

      window.dispatchEvent(new CustomEvent('roadbook_sync_status_changed', {
        detail: {
          tripId: this.tripId,
          hasPending: queue.length > 0,
          pendingCount: queue.length,
          conflictsCount: activeConflicts.length,
          lastSyncError: lastError,
          lastSyncAt: getLastSyncTimestamp(this.tripId),
          userFriendlyStatus: friendlyStatus,
          status: !isOnline ? 'offline' : (lastError || activeConflicts.length > 0) ? 'error' : queue.length > 0 ? 'local_only' : 'synced'
        }
      }));
    }).catch(() => {});
  }

  public async flushPendingQueue(): Promise<void> {
    const pushErrors = await this.flushPendingPushes();
    if (Array.isArray(pushErrors) && pushErrors.length > 0) {
      throw new Error(`Push non riuscito per: ${pushErrors.join(' | ')}`);
    }
  }

  private async flushPendingPushes(): Promise<string[]> {
    if (!this.canWriteToCloud() || this.isFlushingPending || this.isDestroyed) return [];
    this.isFlushingPending = true;
    const pushErrors: string[] = [];
    try {
      const queue = await this.getPendingPushesFromStore();
      if (queue.length === 0) return [];
      console.log(`[SyncService] Svuotamento coda push persistente (${queue.length} elementi in attesa)...`);
      for (const item of queue) {
        try {
          await this.pushToCloud(item.entityType, item.action, item.data, {
            notifyCollaborators: item.notifyCollaborators,
            mutationId: item.mutationId,
            fromQueue: true,
          });
        } catch (err: any) {
          const errMsg = `${item.entityType}/${item.data?.id}: ${err?.message || String(err)}`;
          pushErrors.push(errMsg);
          console.warn(`[SyncService] Errore riprova push persistente per ${item.entityType}/${item.data?.id}:`, err);
        }
      }
    } finally {
      this.isFlushingPending = false;
      this.emitSyncStatus();
    }
    return pushErrors;
  }

  private async pushToCloud(
    entityType: string,
    action: 'save' | 'delete',
    data: any,
    options: { notifyCollaborators?: boolean; mutationId?: string; fromQueue?: boolean } = {}
  ) {
    if (!data || !data.id || this.isDestroyed) return;
    if (action === 'save' && !data.updatedAt) {
      data.updatedAt = Date.now();
    }
    if (options.fromQueue) {
      const current = (await this.getPendingPushesFromStore()).find(item => item.data?.id === data.id && item.entityType === this.mapEntityToCollection(entityType));
      if (!current || current.action !== action || current.mutationId !== options.mutationId || JSON.stringify(current.data) !== JSON.stringify(data)) return;
    } else {
      await this.persistPendingPush({ entityType, action, data, notifyCollaborators: options.notifyCollaborators, mutationId: options.mutationId });
    }
    if (!this.canWriteToCloud()) {
      console.warn(`[SyncService] Push to cloud differito (in coda persistente IndexedDB): scrittura cloud non autorizzata per ${entityType}/${data.id}`);
      return;
    }
    
    const collectionName = this.mapEntityToCollection(entityType);
    if (!collectionName) return;

    const docRef = doc(db, 'trips', this.tripId, collectionName, data.id);

    const initiatingUid = auth?.currentUser?.uid;
    const assertAuthorized = () => {
      if (this.isDestroyed || !initiatingUid || auth?.currentUser?.uid !== initiatingUid || !this.canWriteToCloud()) {
        throw new Error('Cloud authorization changed; pending edit retained');
      }
    };
    const safeSet: typeof setDoc = ((...args: Parameters<typeof setDoc>) => { assertAuthorized(); return setDoc(...args); }) as typeof setDoc;
    const safeDelete = (ref: Parameters<typeof deleteDoc>[0]) => { assertAuthorized(); return deleteDoc(ref); };
    try {

    if (action === 'delete') {
      // Se l'elemento eliminato conteneva allegati chunked, ripuliamo i chunk da Firestore
      if (Array.isArray(data?.attachments)) {
        for (const att of data.attachments) {
          if (att.isChunked && att.totalChunks > 0) {
            import('./attachmentChunkService').then(({ deleteAttachmentChunks }) => {
              deleteAttachmentChunks(this.tripId, att.id, att.totalChunks);
            }).catch(() => {});
          }
        }
      }
      if (collectionName !== 'settings') {
        const tombstoneId = `tombstone_${collectionName}_${data.id}`;
        const nowTs = Date.now();
        const tombstonePayload = {
          id: tombstoneId,
          value: {
            deletedAt: nowTs,
            timestamp: nowTs,
            pending: false,
            explicitDeleteBy: initiatingUid
          }
        };
        await safeSet(doc(db, 'trips', this.tripId, 'settings', tombstoneId), tombstonePayload, { merge: true });
        await idbPut(STORES.SETTINGS, tombstonePayload).catch(() => {});
      }
      await safeDelete(docRef);
      const normType = normalizeEntityType(collectionName);
      const vaultId = getVaultDocId(normType, data.id);
      await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', vaultId));
      if (vaultId !== data.id) {
        await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', data.id));
      }
      console.log(`[Cloud Sync] Eliminato ${entityType} ${data.id}`);
    } else {
      // Protezione tombstone e gestione conflitti (P0): se l'elemento ha un tombstone attivo
      const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${collectionName}_${data.id}`);
      if (tombstoneSetting && tombstoneSetting.value) {
        const itemCreated = normalizeTimestamp(data?.createdAt);
        const itemUpdated = normalizeTimestamp(data?.updatedAt);
        const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
        const isLocallyNewer = (itemCreated > 0 && tombstoneDeleted > 0 && itemCreated > tombstoneDeleted) ||
                               (itemUpdated > 0 && tombstoneDeleted > 0 && itemUpdated > tombstoneDeleted);
        if (isLocallyNewer) {
          // CONFLITTO P0: La modifica locale è posteriore al tombstone.
          // NON cancellare automaticamente il tombstone remoto e non resuscitare ciecamente sul cloud.
          // Conserva entrambe le versioni e archivia il conflitto nell'archivio isolato HounigoConflictArchiveDB!
          console.warn(`[SyncService] Conflitto tombstone vs modifica locale per ${collectionName}/${data.id}: conservo entrambe le versioni.`);
          await saveConflictBackup({
            tripId: this.tripId,
            entityType: collectionName,
            dataId: data.id,
            localData: data,
            serverData: tombstoneSetting.value,
            conflictType: 'remote_tombstone_vs_local_edit',
            localUpdated: itemUpdated,
            tombstoneDeletedAt: tombstoneDeleted,
            status: 'pending_review'
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('roadbook_conflict_detected', {
              detail: { entityType: collectionName, id: data.id, conflictType: 'remote_tombstone_vs_local_edit' }
            }));
          }
          return;
        } else {
          console.warn(`[SyncService] pushToCloud bloccato per ${collectionName}/${data.id}: record con tombstone attivo e nessuna modifica posteriore.`);
          return;
        }
      }

      // Rilevamento e risoluzione conflitti (P0): verifica se il server possiede una versione più recente
      if (this.canWriteToCloud()) {
        try {
          const { getDoc } = await import('firebase/firestore');
          const serverSnap = await getDoc(docRef);
          if (serverSnap.exists()) {
            const serverData = serverSnap.data();
            const serverUpdated = normalizeTimestamp(serverData?.updatedAt);
            const localUpdated = normalizeTimestamp(data?.updatedAt);

            // --- REQUISITI P0 CHECKPOINT 5: Riconoscimento idempotente e conservazione cassaforte ---
            // 1. Una modifica esclusivamente pubblica NON deve mai cancellare private_credentials.
            // 2. Se il documento remoto contiene già esattamente la modifica pendente, riconoscila
            //    come sincronizzata e rimuovi soltanto la voce corrispondente dalla coda locale,
            //    senza riscrivere inutilmente né il documento né la cassaforte.
            // 3. Se i dati non coincidono o la verifica fallisce, preserva la mutazione in coda.
            const normType = normalizeEntityType(collectionName);
            const isOperationalWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping', 'documento'].includes(normType);
            const { privateCredentialsDoc: candidatePriv } = isOperationalWithCreds
              ? splitEntitySecurityData(normType as any, this.tripId, data)
              : { privateCredentialsDoc: null };

            const { isEquivalent } = compareCandidateWithRemote(normType, this.tripId, data, serverData);

            let isAlreadySynchronized = false;
            if (isEquivalent) {
              if (!candidatePriv) {
                // Nessuna presenza di dati privati modificati nel payload: il dato pubblico remoto è già perfettamente sincronizzato
                isAlreadySynchronized = true;
              } else if (isCloudAuthorized(this.tripId)) {
                // Se il payload locale include credenziali private, verifichiamo la corrispondenza con la cassaforte
                try {
                  const vaultId = getVaultDocId(normType, data.id);
                  const privDocRef = doc(db, 'trips', this.tripId, 'private_credentials', vaultId);
                  const privSnap = await getDoc(privDocRef);
                  if (privSnap.exists()) {
                    const privData = privSnap.data();
                    const cleanPriv = this.cleanUndefinedValues(candidatePriv);
                    let privMatches = true;
                    for (const [pk, pv] of Object.entries(cleanPriv)) {
                      if (pk === 'updatedAt' || pk === 'lastMigratedAt') continue;
                      if (pv === undefined) continue;
                      const spv = privData[pk];
                      if (typeof pv === 'object' && pv !== null) {
                        if (JSON.stringify(pv) !== JSON.stringify(spv)) { privMatches = false; break; }
                      } else if (pv !== spv) {
                        privMatches = false; break;
                      }
                    }
                    if (privMatches) isAlreadySynchronized = true;
                  }
                } catch {
                  isAlreadySynchronized = false;
                }
              }
            }

            if (isAlreadySynchronized) {
              console.log(`[SyncService] Documento remoto ${collectionName}/${data.id} contiene già esattamente la modifica pendente: rimuovo dalla coda senza riscritture.`);
              assertAuthorized();
              await this.removePendingPushFromStore(collectionName, data.id, { action, data, mutationId: options.mutationId });
              return;
            }

            // Solo se NON è già sincronizzato, valuta versioni o conflitti:
            // 1. Se serverUpdated <= 0, il documento remoto Firestore non ha un timestamp affidabile:
            //    NON deve essere automaticamente considerato più vecchio e sovrascritto!
            //    Preserva entrambe le copie nell'archivio conflitti e isola soltanto questo record.
            // 2. Se serverUpdated > localUpdated, il server è più recente (conflitto concorrente).
            // 3. Se serverUpdated === localUpdated e i dati divergono, timestamp identico ma contenuto divergente.
            // 4. Se localUpdated > serverUpdated ed entrambi > 0, la modifica locale è affidabilmente più recente.
            const isServerReliable = serverUpdated > 0;
            const isLocalReliable = localUpdated > 0;

            const isServerNewer = (isServerReliable && isLocalReliable && serverUpdated > localUpdated);
            const isSameTimeDifferent = (isServerReliable && isLocalReliable && serverUpdated === localUpdated && !isEquivalent);
            const isUnreliable = (!isServerReliable || !isLocalReliable) && !isEquivalent;

            if (isServerNewer || isSameTimeDifferent || isUnreliable) {
              const conflictType = isServerNewer ? 'server_newer' : 'unreliable_timestamp_conflict';
              console.warn(`[SyncService] Conflitto rilevato per ${collectionName}/${data.id}: ${conflictType} (server: ${serverUpdated}, local: ${localUpdated}). Preservo copia nell'archivio isolato.`);
              // Preserva copia di sicurezza nell'archivio isolato HounigoConflictArchiveDB (zero leak in settings)
              await saveConflictBackup({
                tripId: this.tripId,
                entityType: collectionName,
                dataId: data.id,
                localData: data,
                serverData,
                conflictType,
                serverUpdated,
                localUpdated,
                status: 'pending_review'
              });

              if (isServerNewer) {
                // Allinea IndexedDB locale con il server integrando eventuali dati privati locali
                const store = this.getStoreForEntity(collectionName);
                if (store) {
                  const merged = mergeEntitySecurityData({ ...serverData, id: data.id }, data);
                  await idbPut(store, merged);
                }
                // Rimuovi la mutazione pendente dalla coda poiché il dato locale è archiviato in sicurezza
                await this.removePendingPushFromStore(collectionName, data.id, { action, data, mutationId: options.mutationId });
              } else {
                // In caso di incertezza timestamp (serverUpdated <= 0 o timestamp non affidabile):
                // BLOCCA LA SCRITTURA SU FIRESTORE, CONSERVA ENTRAMBE LE VERSIONI!
                // Isola SOLO questo record lasciandolo in attesa di revisione esplicita,
                // senza lanciare eccezioni fatali che blocchino lo svuotamento degli altri elementi in coda!
                console.warn(`[SyncService] Scrittura bloccata per incertezza timestamp su ${collectionName}/${data.id}: entrambe le versioni conservate, record isolato.`);
              }

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('roadbook_conflict_detected', {
                  detail: { entityType: collectionName, id: data.id, conflictType }
                }));
              }
              return;
            }

            // GESTIONE TIMESTAMP MONOTONO ED IDENTITÀ AUTORE:
            // La modifica locale è legittimamente più recente: garantiamo un timestamp monotono crescente
            // e tracciamo l'autore per prevenire problemi di clock skew sui dispositivi destinatari.
            const resolvedUpdated = Math.max(localUpdated, serverUpdated + 1, Date.now());
            data.updatedAt = resolvedUpdated;
            if (initiatingUid) {
              data.updatedBy = initiatingUid;
            }
            const localStore = this.getStoreForEntity(collectionName);
            if (localStore) {
              await idbPut(localStore, data).catch(() => {});
            }
          }
        } catch (conflictCheckErr: any) {
          if (conflictCheckErr?.message?.includes('Cloud authorization changed')) {
            throw conflictCheckErr;
          }
          console.warn(`[SyncService] Verifica remota non riuscita per ${collectionName}/${data.id}:`, conflictCheckErr?.message || conflictCheckErr);
        }
      }

      const payloadString = JSON.stringify(data);
      const sizeKB = payloadString.length / 1024;
      
      let payloadToSync = { ...data };

      // Se il documento ha allegati e supera ~700 KB, sincronizziamo gli allegati via chunk
      // nella sottocollezione protetta 'documenti', evitando il limite di 1 MB di Firestore
      // e garantendo che nessun allegato venga mai eliminato silenziosamente!
      if (Array.isArray(payloadToSync.attachments) && payloadToSync.attachments.length > 0) {
        if (sizeKB > 700) {
          try {
            const { uploadAttachmentChunks } = await import('./attachmentChunkService');
            const sanitizedAttachments = [];

            for (const att of payloadToSync.attachments) {
              // Se l'allegato ha già dataUrl di grandi dimensioni, salviamo i chunk
              let effectiveDataUrl = att.dataUrl;

              // Se l'allegato locale per qualche ragione non ha dataUrl nell'oggetto passato ma è chunked,
              // recuperalo da IndexedDB per assicurarsi che i dati non vadano persi
              if (!effectiveDataUrl && att.isChunked) {
                const store = this.getCollectionsToSync().find(c => c.fb === collectionName)?.store;
                if (store) {
                  const localRecord = await idbGet<any>(store, data.id);
                  const foundAtt = localRecord?.attachments?.find((a: any) => a.id === att.id);
                  if (foundAtt?.dataUrl) effectiveDataUrl = foundAtt.dataUrl;
                }
              }

              if (effectiveDataUrl && effectiveDataUrl.length > 300 * 1024) {
                const chunkMeta = await uploadAttachmentChunks(this.tripId, {
                  ...att,
                  dataUrl: effectiveDataUrl
                });
                sanitizedAttachments.push({
                  id: att.id,
                  name: att.name,
                  type: att.type,
                  size: att.size,
                  createdAt: att.createdAt,
                  isChunked: true,
                  totalChunks: chunkMeta.totalChunks
                });
              } else {
                sanitizedAttachments.push(att);
              }
            }

            payloadToSync.attachments = sanitizedAttachments;
          } catch (chunkErr) {
            console.error(`[SyncService] Errore chunking allegati per ${data.id}:`, chunkErr);
          }
        }
      }

      const normType = normalizeEntityType(collectionName);
      const isOperationalWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping', 'documento'].includes(normType);

      if (isOperationalWithCreds) {
        const { publicDoc, privateCredentialsDoc } = splitEntitySecurityData(
          normType as any,
          this.tripId,
          payloadToSync
        );

        // SCRITTURA ATOMICA E SICUREZZA CASSAFORTE (P0):
        // Se la modifica contiene sia dati pubblici sia private_credentials, usa scrittura atomica batch
        // per evitare salvataggi parziali. Se è solo pubblica, NON tocca la cassaforte.
        if (privateCredentialsDoc && isCloudAuthorized(this.tripId)) {
          const vaultId = getVaultDocId(normType, data.id);
          const privDocRef = doc(db, 'trips', this.tripId, 'private_credentials', vaultId);
          const cleanPrivate = this.cleanUndefinedValues(privateCredentialsDoc);
          const cleanPublic = this.cleanUndefinedValues(publicDoc);

          if (typeof writeBatch === 'function') {
            assertAuthorized();
            const batch = writeBatch(db);
            batch.set(privDocRef, cleanPrivate, { merge: true });
            batch.set(docRef, cleanPublic, { merge: true });
            await batch.commit();
          } else {
            // Fallback verificabile e sicuro per ambienti privi di writeBatch:
            // Scrivi cassaforte prima del documento pubblico; se il documento pubblico fallisce, rilancia per mantenere in coda
            assertAuthorized();
            await safeSet(privDocRef, cleanPrivate, { merge: true });
            try {
              assertAuthorized();
              await safeSet(docRef, cleanPublic, { merge: true });
            } catch (pubErr) {
              console.error(`[SyncService] Fallimento scrittura documento pubblico dopo cassaforte per ${collectionName}/${data.id}: rilancio per conservare in coda.`, pubErr);
              throw pubErr;
            }
          }
        } else {
          // Modifica SOLO pubblica: NON tocca la cassaforte private_credentials
          const cleanPublic = this.cleanUndefinedValues(publicDoc);
          await safeSet(docRef, cleanPublic, { merge: true });
        }
      } else {
        const cleanPayload = this.cleanUndefinedValues(payloadToSync);
        await safeSet(docRef, cleanPayload, { merge: true });
      }
      if (entityType === 'settings' && typeof data?.id === 'string' && data.id.startsWith('tombstone_')) {
        await idbPut(STORES.SETTINGS, { ...data, value: { ...(data.value || {}), pending: false } }).catch(() => {});
      }
      console.log(`[Cloud Sync] Salvato ${entityType} ${data.id}`);
    }
      assertAuthorized();
      await this.removePendingPushFromStore(collectionName, data.id, { action, data, mutationId: options.mutationId });
      setLastSyncTimestamp(this.tripId, Date.now());
      setLastSyncError(this.tripId, null);
      this.emitSyncStatus();
    } catch (pushErr: any) {
      const errMsg = pushErr?.message || String(pushErr);
      setLastSyncError(this.tripId, errMsg);
      this.emitSyncStatus();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('roadbook_cloud_sync_error', {
          detail: { tripId: this.tripId, entityType, id: data?.id, error: errMsg }
        }));
      }
      console.warn(`[SyncService] pushToCloud non riuscito per ${entityType}/${data.id} (lockdown o offline): memorizzo in coda persistente.`, errMsg);
      throw pushErr;
    }

    if (options.notifyCollaborators && options.mutationId) {
      void recordPushMutation({
        tripId: this.tripId,
        entityType,
        action,
        entityId: data.id,
        mutationId: options.mutationId,
        data: action === 'save' ? data : undefined,
      }).catch(() => undefined);
    }
  }

  // --- 2. CLOUD TO LOCAL ---
  private setupCloudListeners() {
    const collectionsToSync = this.getCollectionsToSync();

    // Debounce globale: evita di inondare l'UI con notifiche su bulk sync iniziale
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (entityType: string, action: 'save' | 'delete', data: any) => {
      notifyDataChanged(entityType, action, data, 'cloud');
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        // Evento globale per far ricaricare tutte le view
        window.dispatchEvent(new Event('roadbook_cloud_synced'));
        refreshTimer = null;
      }, 600);
    };

    collectionsToSync.forEach(({ fb, store }) => {
      const colRef = collection(db, 'trips', this.tripId, fb);
      
      const unsub = onSnapshot(colRef, async (snapshot) => {
        // Ignoriamo i nostri stessi salvataggi locali non ancora confermati dal server
        const promises: Promise<void>[] = [];

        snapshot.docChanges().forEach((change) => {
          if (change.doc.metadata.hasPendingWrites) return;
          const data = change.doc.data();
          const docId = change.doc.id;

          // Ignoriamo i chunk degli allegati per non inquinare lo store dei documenti
          if (fb === 'documenti' && docId.startsWith('att_chunk_')) {
            return;
          }
          // Ignoriamo sempre chiavi strettamente per-dispositivo in settings
          if (fb === 'settings' && (docId.startsWith('device_role_backup') || docId.startsWith('device_session_backup') || docId.startsWith('trip_config_backup'))) {
            return;
          }

          if (change.type === 'added' || change.type === 'modified') {
            promises.push(
              (async () => {
                // Se l'elemento è stato eliminato intenzionalmente (tombstone), verifica se è una ricreazione valida
                const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
                if (tombstoneSetting && tombstoneSetting.value) {
                  const serverCreated = normalizeTimestamp(data?.createdAt);
                  const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
                  if (serverCreated > 0 && tombstoneDeleted > 0 && serverCreated > tombstoneDeleted) {
                    console.log(`[Cloud Sync] Rilevata ricreazione valida su Cloud per ${fb}/${docId} - rimuovo tombstone locale.`);
                    await idbDelete(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
                    if (typeof localStorage !== 'undefined') {
                      try { localStorage.removeItem(`tombstone_${fb}_${docId}`); } catch (e) {}
                    }
                  } else {
                    console.log(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Elemento contrassegnato da tombstone (eliminato)`);
                    if (this.tripId === '0000') {
                      // SICUREZZA 0000: VIETATO cancellare automaticamente documenti su Firestore!
                      console.warn(`[Cloud Sync] Sospesa cancellazione remota per ${fb}/${docId} sul viaggio 0000: cancellazioni automatiche disabilitate.`);
                      return;
                    }
                    if (this.canWriteToCloud()) {
                      await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                    } else {
                      console.warn(`[Cloud Sync] Sospesa cancellazione remota per ${fb}/${docId}: in attesa di autorizzazione o sblocco pre-attivazione.`);
                    }
                    return;
                  }
                }

                let localData: any = null;
                try {
                  const isPendingInQueue = await hasPendingMutation(this.tripId, fb, docId);
                  if (isPendingInQueue) {
                    console.log(`[Cloud Sync] Conservo mutazione locale pendente in coda per ${fb}/${docId} - ignorato snapshot.`);
                    return;
                  }

                  localData = await idbGet<any>(store, docId);
                  const normType = normalizeEntityType(fb);

                  // 1. Se il dato locale esiste, controlla l'equivalenza strutturale:
                  // Se sono già identici, è un vero echo o dato già allineato.
                  if (localData) {
                    const { isEquivalent } = compareCandidateWithRemote(normType, this.tripId, localData, data);
                    if (isEquivalent) {
                      console.log(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Dato locale gia' allineato (echo server)`);
                      return;
                    }
                  }

                  const localUpdated = normalizeTimestamp(localData?.updatedAt);
                  const serverUpdated = normalizeTimestamp(data?.updatedAt);

                  // 2. Protezione da documenti remoti privi di timestamp valido su 0000:
                  if (localData && localUpdated > 0 && serverUpdated <= 0 && this.tripId === '0000') {
                    console.warn(`[Cloud Sync] Rilevata divergenza su documento remoto privo di timestamp valido per ${fb}/${docId}: preservo entrambe le versioni.`);
                    await saveConflictBackup({
                      tripId: this.tripId,
                      entityType: normType,
                      dataId: docId,
                      localData,
                      serverData: data,
                      conflictType: 'unreliable_timestamp_conflict',
                      serverUpdated,
                      localUpdated,
                      status: 'pending_review'
                    });
                    return;
                  }

                  // 3. Il dato remoto differisce dal dato locale (!isEquivalent) e questo dispositivo NON ha mutazioni pendenti in coda.
                  // Anche se localUpdated >= serverUpdated a causa di clock skew tra dispositivi,
                  // la modifica remota proveniente da Firestore (da un collaboratore autorizzato) è legittima.
                  // Procedi con il pull.
                } catch (e) {}
                
                let itemToStore: any = { ...data, id: docId };
                let mergedPrivate = false;
                if (isCloudAuthorized(this.tripId)) {
                  const normType = normalizeEntityType(fb);
                  const vaultId = getVaultDocId(normType, docId);
                  try {
                    const { getDoc } = await import('firebase/firestore');
                    const privDocSnap = await getDoc(doc(db, 'trips', this.tripId, 'private_credentials', vaultId)).catch(() => null);
                    if (privDocSnap && privDocSnap.exists()) {
                      itemToStore = mergeEntitySecurityData(itemToStore, privDocSnap.data() as any);
                      mergedPrivate = true;
                    }
                  } catch (e) {}
                }
                if (!mergedPrivate && localData) {
                  // Preserva sempre i dati economici e sensibili locali già presenti in IndexedDB
                  itemToStore = mergeEntitySecurityData(itemToStore, localData);
                }

                // Se l'item dal cloud ha allegati salvati in chunk, ricomponiamo i dataUrl
                // preservando sempre i dataUrl locali se già presenti
                if (Array.isArray(itemToStore.attachments) && itemToStore.attachments.length > 0) {
                  const resolvedAttachments = [];
                  for (const att of itemToStore.attachments) {
                    if (att.isChunked && !att.dataUrl) {
                      // Prova a recuperare il dataUrl dal record locale
                      const localAtt = localData?.attachments?.find((la: any) => la.id === att.id);
                      if (localAtt && localAtt.dataUrl) {
                        resolvedAttachments.push({ ...att, dataUrl: localAtt.dataUrl });
                      } else {
                        try {
                          const { downloadAttachmentFromChunks } = await import('./attachmentChunkService');
                          const reconstructed = await downloadAttachmentFromChunks(this.tripId, att);
                          if (reconstructed && reconstructed.dataUrl) {
                            resolvedAttachments.push(reconstructed);
                          } else {
                            resolvedAttachments.push(att);
                          }
                        } catch (reconstructErr) {
                          console.warn(`[Cloud Sync] Errore ricomposizione chunk per ${att.id}:`, reconstructErr);
                          resolvedAttachments.push(att);
                        }
                      }
                    } else {
                      resolvedAttachments.push(att);
                    }
                  }
                  itemToStore.attachments = resolvedAttachments;
                }
                
                await idbPut(store, itemToStore);
                if (fb === 'settings' && docId.startsWith('tombstone_')) {
                  const isAuthorizedTombstone = Boolean(itemToStore?.value?.explicitDeleteBy || itemToStore?.explicitDeleteBy || this.tripId !== '0000');
                  if (isAuthorizedTombstone) {
                    const parts = docId.split('_');
                    if (parts.length >= 3) {
                      const targetCol = parts[1];
                      const targetId = parts.slice(2).join('_');
                      const targetStore = this.getStoreForEntity(targetCol);
                      if (targetStore) {
                        const hasPending = await hasPendingMutation(this.tripId, targetCol, targetId);
                        const existingTarget = await idbGet<any>(targetStore, targetId);
                        if (existingTarget && !hasPending) {
                          if (this.tripId === '0000') {
                            await saveConflictBackup({
                              tripId: this.tripId,
                              entityType: targetCol,
                              dataId: targetId,
                              localData: existingTarget,
                              serverData: itemToStore?.value || itemToStore,
                              conflictType: 'remote_tombstone_vs_local_edit',
                              localUpdated: normalizeTimestamp(existingTarget?.updatedAt),
                              tombstoneDeletedAt: normalizeTimestamp(itemToStore?.value?.deletedAt || itemToStore?.value?.timestamp),
                              status: 'archived_remote_delete'
                            });
                          }
                          await idbDelete(targetStore, targetId);
                          const targetEntity = this.mapCollectionToEntity(targetCol) || targetCol;
                          scheduleRefresh(targetEntity, 'delete', { id: targetId });
                        }
                      }
                    }
                  }
                }
                setLastSyncTimestamp(this.tripId, Date.now());
                this.emitSyncStatus();
                const entityType = this.mapCollectionToEntity(fb) || fb;
                scheduleRefresh(entityType, 'save', itemToStore);
                console.log(`[Cloud Sync] Pull ${fb}/${docId}`);
              })().catch(err => console.error(`[Cloud Sync] Errore idbPut ${fb}:`, err))
            );
          } else if (change.type === 'removed') {
            promises.push(
              (async () => {
                const localItem = await idbGet<any>(store, docId);
                if (!localItem) return;

                // Controlla se c'è una mutazione pendente in coda per questo item
                const pendingPush = await hasPendingMutation(this.tripId, fb, docId);
                if (pendingPush) {
                  console.log(`[Cloud Sync] Preservato record locale per ${fb}/${docId}: mutazione pendente presente.`);
                  return;
                }

                // Controlla se è un tombstone esplicito intenzionale (locale o remoto)
                let tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
                if (!tombstoneSetting?.value && db) {
                  try {
                    const { getDoc } = await import('firebase/firestore');
                    const tsSnap = await getDoc(doc(db, 'trips', this.tripId, 'settings', `tombstone_${fb}_${docId}`)).catch(() => null);
                    if (tsSnap && tsSnap.exists()) {
                      tombstoneSetting = tsSnap.data();
                      await idbPut(STORES.SETTINGS, { ...tombstoneSetting, id: `tombstone_${fb}_${docId}` }).catch(() => {});
                    }
                  } catch {}
                }
                const isExplicitTombstone = this.tripId === '0000'
                  ? Boolean(tombstoneSetting?.value?.explicitDeleteBy || tombstoneSetting?.explicitDeleteBy)
                  : Boolean(tombstoneSetting?.value);

                // Se l'elemento esiste localmente e non ha tombstone esplicito, la rimozione remota
                // è solo un rollback dell'ottimistic write di Firestore (es. 403 durante lockdown).
                // NON eliminare la scadenza o la card creata localmente!
                if (!isExplicitTombstone) {
                  console.log(`[Cloud Sync] Preservato record locale ${fb}/${docId}: respinta cancellazione remota priva di tombstone autorizzato.`);
                  return;
                }

                if (this.tripId === '0000') {
                  await saveConflictBackup({
                    tripId: this.tripId,
                    entityType: fb,
                    dataId: docId,
                    localData: localItem,
                    serverData: tombstoneSetting?.value || tombstoneSetting,
                    conflictType: 'remote_tombstone_vs_local_edit',
                    localUpdated: normalizeTimestamp(localItem?.updatedAt),
                    tombstoneDeletedAt: normalizeTimestamp(tombstoneSetting?.value?.deletedAt || tombstoneSetting?.value?.timestamp),
                    status: 'archived_remote_delete'
                  });
                }

                await idbDelete(store, docId);
                setLastSyncTimestamp(this.tripId, Date.now());
                this.emitSyncStatus();
                const entityType = this.mapCollectionToEntity(fb) || fb;
                scheduleRefresh(entityType, 'delete', { id: docId });
                console.log(`[Cloud Sync] Rimosso confermato ${fb}/${docId}`);
              })().catch(err => console.error(`[Cloud Sync] Errore idbDelete ${fb}:`, err))
            );
          }
        });

        await Promise.all(promises);
      }, (error) => {
        console.error(`[Cloud Sync] Errore ascolto ${fb}:`, error);
      });

      this.unsubscribes.push(unsub);
    });
  }

  public getTripId(): string {
    return this.tripId;
  }

  public destroy() {
    this.isDestroyed = true;
    if (activeSyncService === this) {
      activeSyncService = null;
    }
    if (this.autoSyncDebounceTimer) {
      clearTimeout(this.autoSyncDebounceTimer);
      this.autoSyncDebounceTimer = null;
    }
    if (this.pendingSyncTimeout) {
      clearTimeout(this.pendingSyncTimeout);
      this.pendingSyncTimeout = null;
    }
    this.unsubscribes.forEach(unsub => unsub());
    this.unsubscribes = [];
    this.domListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.domListeners = [];
  }

  public async purgeSensitiveLocalCache(): Promise<void> {
    const storesToPurge = [
      STORES.ALLOGGI,
      STORES.TRASPORTI,
      STORES.ATTIVITA,
      STORES.TAPPE,
      STORES.RISTORANTI,
      STORES.SHOPPING,
      STORES.SPESE
    ];

    for (const store of storesToPurge) {
      try {
        const records = await idbGetAll<any>(store);
        for (const rec of records) {
          if (!rec || !rec.id) continue;
          if (store === STORES.SPESE) {
            await idbDelete(store, rec.id);
          } else {
            const sanitized = sanitizePublicDocument(rec);
            await idbPut(store, sanitized);
          }
        }
      } catch (err) {
        console.warn(`[SyncService] Errore bonifica cache locale per store ${store}:`, err);
      }
    }
    console.log('[SyncService] Bonifica cache locale completata: rimosse credenziali sensibili da IndexedDB.');
  }

  private mapEntityToCollection(entity: string): string | null {
    switch(entity) {
      case 'giorni': return 'giorni';
      case 'attivita':
      case 'activity': return 'attivita';
      case 'alloggi':
      case 'alloggio': return 'alloggi';
      case 'trasporti':
      case 'trasporto': return 'trasporti';
      case 'documenti': return 'documenti';
      case 'tappe':
      case 'tappa': return 'tappe';
      case 'ristoranti':
      case 'ristorante': return 'ristoranti';
      case 'shopping': return 'shopping';
      case 'spese':
      case 'spesa': return 'spese';
      case 'note':
      case 'nota':
      case 'notes':
      case 'scadenza':
      case 'scadenze': return 'note';
      case 'bagagli':
      case 'bagaglio': return 'bagagli';
      case 'settings': return 'settings';
      default: return null;
    }
  }

  private mapCollectionToEntity(col: string): string | null {
    switch(col) {
      case 'giorni': return 'giorni';
      case 'attivita': return 'attivita';
      case 'alloggi': return 'alloggi';
      case 'trasporti': return 'trasporti';
      case 'documenti': return 'documenti';
      case 'tappe': return 'tappe';
      case 'ristoranti': return 'ristoranti';
      case 'shopping': return 'shopping';
      case 'spese': return 'spese';
      case 'note': return 'note';
      case 'bagagli': return 'bagagli';
      case 'settings': return 'settings';
      default: return null;
    }
  }
}
