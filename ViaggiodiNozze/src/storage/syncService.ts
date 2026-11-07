import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { STORES, idbPut, idbDelete, idbGetAll, idbGet, type StoreName } from './indexedDB';
import { notifyDataChanged } from './storageService';
import { normalizeTimestamp } from '../utils/tripDates';
import { isCloudAuthorized } from '../utils/useAuthIdentity';
import { recordPushMutation } from '../services/pushNotificationService';
import {
  splitEntitySecurityData,
  mergeEntitySecurityData,
  getVaultDocId,
  normalizeEntityType,
  sanitizePublicDocument
} from '../utils/securityDataSplitter';
import { savePendingMutation, removePendingMutation, getPendingMutations, hasPendingMutation, normalizeQueueEntityType, type PendingMutation } from './localMutationQueue';

export interface PreActivationSyncReport {
  tripId: string;
  isQueueFlushAuthorized: boolean;
  pendingCount: number;
  pendingByType: Record<string, number>;
  conflictsDetected: number;
  items: Array<{
    id: string;
    entityType: string;
    action: 'save' | 'delete';
    timestamp: number;
    hasPotentialConflict: boolean;
    conflictReason?: string;
  }>;
}

export function isQueueFlushAllowedForTrip0000(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('hounigo_allow_queue_flush_0000') === 'true';
}

export function allowQueueFlushForTrip0000(allow: boolean = true): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('hounigo_allow_queue_flush_0000', allow ? 'true' : 'false');
  }
}

export async function getPreActivationSyncReport(tripId: string): Promise<PreActivationSyncReport> {
  const isAuthorized = tripId === '0000' ? isQueueFlushAllowedForTrip0000() : true;
  const queue = await getPendingMutations(tripId);
  const pendingByType: Record<string, number> = {};
  const items: PreActivationSyncReport['items'] = [];
  let conflictsDetected = 0;

  for (const q of queue) {
    const normType = normalizeQueueEntityType(q.entityType);
    pendingByType[normType] = (pendingByType[normType] || 0) + 1;

    let hasPotentialConflict = false;
    let conflictReason: string | undefined;

    const dataId = q.data?.id;
    if (dataId) {
      // 1. Verifica tombstone locale/remoto
      const tombstoneKey = `tombstone_${normType}_${dataId}`;
      const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, tombstoneKey).catch(() => null);
      if (tombstoneSetting && tombstoneSetting.value) {
        const tombstoneTime = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
        const mutationTime = normalizeTimestamp(q.timestamp || q.data?.updatedAt);
        if (tombstoneTime > mutationTime) {
          hasPotentialConflict = true;
          conflictReason = 'remote_tombstone_newer';
          conflictsDetected++;
        }
      }

      // 2. Se autorizzato, verifica timestamp del server SENZA esporre dati sensibili/credenziali
      if (!hasPotentialConflict && isCloudAuthorized(tripId)) {
        try {
          const { getDoc } = await import('firebase/firestore');
          const docRef = doc(db, 'trips', tripId, normType, dataId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const serverData = snap.data();
            const serverUpdated = normalizeTimestamp(serverData?.updatedAt);
            const localUpdated = normalizeTimestamp(q.data?.updatedAt || q.timestamp);
            if (serverUpdated > 0 && localUpdated > 0 && serverUpdated > localUpdated) {
              hasPotentialConflict = true;
              conflictReason = 'server_newer_modification';
              conflictsDetected++;
            }
          }
        } catch {}
      }
    }

    // Includi SOLO metadati non sensibili (nessun PIN, PNR, note private o prezzi)
    items.push({
      id: dataId || q.id,
      entityType: normType,
      action: q.action,
      timestamp: q.timestamp,
      hasPotentialConflict,
      conflictReason
    });
  }

  return {
    tripId,
    isQueueFlushAuthorized: isAuthorized,
    pendingCount: queue.length,
    pendingByType,
    conflictsDetected,
    items
  };
}

if (typeof window !== 'undefined') {
  (window as any).__hounigoDiagnostics = {
    getPreActivationSyncReport,
    allowQueueFlushForTrip0000,
    isQueueFlushAllowedForTrip0000
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
    this.cleanupLegacySettingsQueue().catch(() => {});
    this.setupLocalListeners();
    this.setupCloudListeners();
    // Avvia sincronizzazione iniziale solo se già autorizzati, altrimenti il listener houni_cloud_role_changed la avvierà non appena confermato
    if (isCloudAuthorized(this.tripId)) {
      this.requestInitialSync('constructor');
    } else {
      console.log('[SyncService] Avvio sync iniziale posticipato: in attesa di autorizzazione cloud.');
    }
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

            if ((localCreated > 0 && tombstoneDeleted > 0 && localCreated > tombstoneDeleted) ||
                (localUpdated > 0 && tombstoneDeleted > 0 && localUpdated > tombstoneDeleted)) {
              // Ricreazione o modifica valida intenzionale locale: il tombstone remoto è superato
              console.log(`[SyncService] Rilevata ricreazione o modifica valida locale per ${entityType}/${deletedId} - elimino tombstone remoto.`);
              if (isCloudAuthorized(this.tripId)) {
                await deleteDoc(doc(db, 'trips', this.tripId, 'settings', docId)).catch(() => {});
                deletedCount++;
              }
              continue;
            } else {
              // Cancellazione remota valida: elimina l'elemento dallo store IndexedDB locale
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
      } else {
        // Setting ordinario
        await idbPut(STORES.SETTINGS, { id: docId, ...serverData });
        pulledCount++;
      }
    }

    // Push dei tombstone locali non ancora presenti sul server o marcati come pending
    const localSettings = await idbGetAll<any>(STORES.SETTINGS);
    let pendingTombstonePushFailure: Error | null = null;

    for (const s of localSettings) {
      if (s && s.id && s.id.startsWith('tombstone_')) {
        const isPending = !serverDocIds.has(s.id) || s.value?.pending === true;
        if (isPending) {
          if (!isCloudAuthorized(this.tripId)) {
            pendingTombstonePushFailure = new Error(`Sessione non autorizzata per invio tombstone ${s.id}`);
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
              // Elemento cancellato: se autorizzati, elimina da Firestore per pulizia
              if (isCloudAuthorized(this.tripId)) {
                await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                deletedCount++;
              } else {
                console.warn(`[SyncService] Sospesa eliminazione cloud per tombstone ${fb}/${docId}: in attesa di autorizzazione.`);
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
            if (!isCloudAuthorized(this.tripId)) {
              console.warn(`[SyncService] Sospeso push per ${fb}/${docId}: modifiche locali preservate in attesa di autorizzazione cloud.`);
              continue;
            }
            const entityType = this.mapCollectionToEntity(fb);
            if (entityType) {
              await this.pushToCloud(entityType, 'save', localData);
            } else {
              await setDoc(doc(db, 'trips', this.tripId, fb, docId), this.cleanUndefinedValues(localData), { merge: true });
            }
            pushedCount++;
          } else if (localData && localUpdated > 0 && localUpdated === serverUpdated) {
            // Local e Cloud hanno esattamente lo stesso timestamp: il dato locale è già allineato
            continue;
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
                // Elemento eliminato! Rimuovi da IndexedDB ed evita push (nessuna resurrezione)
                await idbDelete(store, localItem.id);
                continue;
              }
            }
            if (!isCloudAuthorized(this.tripId)) {
              continue;
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
    if (!isCloudAuthorized(this.tripId)) {
      console.warn('[SyncService] syncAllLocalToCloud annullato: sessione non autorizzata dal Cloud.');
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
    target.addEventListener(type, listener);
    this.domListeners.push({ target, type, listener });
  }

  // --- 1. LOCAL TO CLOUD ---
  private setupLocalListeners() {
    this.addDomListener(window, 'roadbook_data_mutated', (async (e: Event) => {
      const custom = e as CustomEvent;
      const { entityType, action, data, source } = custom.detail;
      
      // Ignoriamo le mutazioni che arrivano gia dal cloud per evitare loop infiniti
      if (source === 'cloud') return;
      
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
        if (this.tripId !== '0000' || isQueueFlushAllowedForTrip0000()) {
          this.flushPendingPushes().catch(() => {});
        } else {
          console.log('[SyncService] Replay automatico coda sospeso per viaggio 0000 (modalità pre-attivazione protetta).');
        }
        this.requestInitialSync('cloud_role_authorized');
      } else if (role === 'viewer') {
        // La cache locale NON viene bonificata automaticamente per evitare perdite di dati off-line
      }
    }) as EventListener);

    // Ripresa automatica al ritorno della connessione online
    this.addDomListener(window, 'online', (() => {
      console.log('[SyncService] Connessione di rete ripristinata (online): verifico autorizzazioni per sync.');
      setTimeout(() => {
        if (isCloudAuthorized(this.tripId)) {
          this.triggerAutomaticSync('network_online');
        }
      }, 600);
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

  private emitSyncStatus(): void {
    if (typeof window === 'undefined') return;
    this.getPendingPushesFromStore().then(queue => {
      window.dispatchEvent(new CustomEvent('roadbook_sync_status_changed', {
        detail: {
          hasPending: queue.length > 0,
          pendingCount: queue.length,
          status: queue.length > 0 ? 'local_only' : 'synced'
        }
      }));
    }).catch(() => {});
  }

  public async flushPendingQueue(): Promise<void> {
    return this.flushPendingPushes();
  }

  private async flushPendingPushes(): Promise<void> {
    if (!isCloudAuthorized(this.tripId) || this.isFlushingPending || this.isDestroyed) return;
    if (this.tripId === '0000' && !isQueueFlushAllowedForTrip0000()) {
      console.log('[SyncService] Pre-attivazione viaggio 0000: replay automatico coda sospeso in attesa di sblocco esplicito.');
      return;
    }
    this.isFlushingPending = true;
    try {
      const queue = await this.getPendingPushesFromStore();
      if (queue.length === 0) return;
      console.log(`[SyncService] Svuotamento coda push persistente (${queue.length} elementi in attesa)...`);
      for (const item of queue) {
        try {
          await this.pushToCloud(item.entityType, item.action, item.data, {
            notifyCollaborators: item.notifyCollaborators,
            mutationId: item.mutationId,
            fromQueue: true,
          });
        } catch (err) {
          console.warn(`[SyncService] Errore riprova push persistente per ${item.entityType}/${item.data?.id}:`, err);
        }
      }
    } finally { this.isFlushingPending = false; }
  }

  private async pushToCloud(
    entityType: string,
    action: 'save' | 'delete',
    data: any,
    options: { notifyCollaborators?: boolean; mutationId?: string; fromQueue?: boolean } = {}
  ) {
    if (!data || !data.id || this.isDestroyed) return;
    if (options.fromQueue) {
      const current = (await this.getPendingPushesFromStore()).find(item => item.data?.id === data.id && item.entityType === this.mapEntityToCollection(entityType));
      if (!current || current.action !== action || current.mutationId !== options.mutationId || JSON.stringify(current.data) !== JSON.stringify(data)) return;
    } else {
      await this.persistPendingPush({ entityType, action, data, notifyCollaborators: options.notifyCollaborators, mutationId: options.mutationId });
    }
    if (!isCloudAuthorized(this.tripId)) {
      console.warn(`[SyncService] Push to cloud differito (in coda persistente IndexedDB): sessione non ancora autorizzata per ${entityType}/${data.id}`);
      return;
    }
    
    const collectionName = this.mapEntityToCollection(entityType);
    if (!collectionName) return;

    const docRef = doc(db, 'trips', this.tripId, collectionName, data.id);

    const initiatingUid = auth?.currentUser?.uid;
    const assertAuthorized = () => {
      if (this.isDestroyed || !initiatingUid || auth?.currentUser?.uid !== initiatingUid || !isCloudAuthorized(this.tripId)) {
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
      await safeDelete(docRef);
      const normType = normalizeEntityType(collectionName);
      const vaultId = getVaultDocId(normType, data.id);
      await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', vaultId));
      if (vaultId !== data.id) {
        await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', data.id));
      }
      console.log(`[Cloud Sync] Eliminato ${entityType} ${data.id}`);
    } else {
      // Protezione tombstone: se l'elemento ha un tombstone attivo, verifica se è stato ricreato o modificato lecitamente
      const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${collectionName}_${data.id}`);
      if (tombstoneSetting && tombstoneSetting.value) {
        const itemCreated = normalizeTimestamp(data?.createdAt);
        const itemUpdated = normalizeTimestamp(data?.updatedAt);
        const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
        const isLocallyNewer = (itemCreated > 0 && tombstoneDeleted > 0 && itemCreated > tombstoneDeleted) ||
                               (itemUpdated > 0 && tombstoneDeleted > 0 && itemUpdated > tombstoneDeleted);
        if (!isLocallyNewer) {
          console.warn(`[SyncService] pushToCloud bloccato per ${collectionName}/${data.id}: record con tombstone attivo e nessuna modifica successiva alla cancellazione.`);
          return;
        } else {
          // Modifica o ricreazione locale vince: elimina il tombstone obsoleto
          console.log(`[SyncService] Modifica locale posteriore al tombstone per ${collectionName}/${data.id}: supero tombstone.`);
          await idbDelete(STORES.SETTINGS, `tombstone_${collectionName}_${data.id}`);
          if (typeof localStorage !== 'undefined') {
            try { localStorage.removeItem(`tombstone_${collectionName}_${data.id}`); } catch (e) {}
          }
          if (isCloudAuthorized(this.tripId)) {
            await deleteDoc(doc(db, 'trips', this.tripId, 'settings', `tombstone_${collectionName}_${data.id}`)).catch(() => {});
          }
        }
      }

      // Rilevamento e risoluzione conflitti (P0): verifica se il server possiede una versione più recente
      if (isCloudAuthorized(this.tripId)) {
        try {
          const { getDoc } = await import('firebase/firestore');
          const serverSnap = await getDoc(docRef);
          if (serverSnap.exists()) {
            const serverData = serverSnap.data();
            const serverUpdated = normalizeTimestamp(serverData?.updatedAt);
            const localUpdated = normalizeTimestamp(data?.updatedAt);

            if (serverUpdated > 0 && localUpdated > 0 && serverUpdated > localUpdated) {
              console.warn(`[SyncService] Conflitto rilevato per ${collectionName}/${data.id}: il server è più recente (${serverUpdated} > ${localUpdated}). Preservo copia locale di sicurezza.`);
              // Preserva copia di sicurezza locale per evitare qualunque perdita
              await idbPut(STORES.SETTINGS, {
                id: `_conflict_backup_${collectionName}_${data.id}_${Date.now()}`,
                entityType: collectionName,
                dataId: data.id,
                localData: data,
                serverUpdated,
                localUpdated,
                savedAt: Date.now()
              });
              // Allinea IndexedDB locale con il server integrando eventuali dati privati locali
              const store = this.getStoreForEntity(collectionName);
              if (store) {
                const merged = mergeEntitySecurityData({ ...serverData, id: data.id }, data);
                await idbPut(store, merged);
              }
              // Rimuovi la mutazione pendente dalla coda
              await this.removePendingPushFromStore(collectionName, data.id, { action, data, mutationId: options.mutationId });
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('roadbook_conflict_detected', {
                  detail: { entityType: collectionName, id: data.id, resolution: 'server_newer_preserved_local_backup' }
                }));
              }
              return;
            }
          }
        } catch (conflictCheckErr) {
          // Se la verifica remota fallisce (es. lockdown o offline), procedi con il salvataggio protetto
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

        const cleanPublic = this.cleanUndefinedValues(publicDoc);
        await safeSet(docRef, cleanPublic, { merge: true });

        if (privateCredentialsDoc && isCloudAuthorized(this.tripId)) {
          const vaultId = getVaultDocId(normType, data.id);
          const privDocRef = doc(db, 'trips', this.tripId, 'private_credentials', vaultId);
          await safeSet(privDocRef, this.cleanUndefinedValues(privateCredentialsDoc), { merge: true });
        } else if (!privateCredentialsDoc && isCloudAuthorized(this.tripId)) {
          const vaultId = getVaultDocId(normType, data.id);
          await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', vaultId));
          if (vaultId !== data.id) {
            await safeDelete(doc(db, 'trips', this.tripId, 'private_credentials', data.id));
          }
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
    } catch (pushErr: any) {
      console.warn(`[SyncService] pushToCloud non riuscito per ${entityType}/${data.id} (lockdown o offline): memorizzo in coda persistente.`, pushErr?.message || pushErr);
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
                    if (isCloudAuthorized(this.tripId)) {
                      await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                    } else {
                      console.warn(`[Cloud Sync] Sospesa cancellazione remota per ${fb}/${docId}: in attesa di autorizzazione cloud.`);
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
                  const localUpdated = normalizeTimestamp(localData?.updatedAt);
                  const serverUpdated = normalizeTimestamp(data?.updatedAt);
                  if (localData && localUpdated > 0 && localUpdated >= serverUpdated) {
                    if (localUpdated > serverUpdated) {
                      console.warn(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Il dato locale e' piu' recente`);
                      if (isCloudAuthorized(this.tripId)) {
                        // Pushiamo il dato locale al server per allinearlo (visto che il server ha dati vecchi)
                        const entityType = this.mapCollectionToEntity(fb);
                        if (entityType) {
                          await this.pushToCloud(entityType, 'save', localData);
                        } else {
                          await setDoc(doc(db, 'trips', this.tripId, fb, docId), this.cleanUndefinedValues(localData), { merge: true });
                        }
                      } else {
                        console.warn(`[Cloud Sync] Sospeso push per ${fb}/${docId}: sessione non autorizzata, dato locale piu recente conservato.`);
                      }
                    } else {
                      // localUpdated === serverUpdated: snapshot proveniente dal nostro stesso push, ignora per non ricreare lo stato
                      console.log(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Dato locale gia' allineato (echo server)`);
                    }
                    return;
                  }
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

                // Controlla se è un tombstone esplicito intenzionale
                const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
                const isExplicitTombstone = Boolean(tombstoneSetting?.value);

                // Se l'elemento esiste localmente e non ha tombstone esplicito, la rimozione remota
                // è solo un rollback dell'ottimistic write di Firestore (es. 403 durante lockdown).
                // NON eliminare la scadenza o la card creata localmente!
                if (!isExplicitTombstone) {
                  console.log(`[Cloud Sync] Preservato record locale ${fb}/${docId}: respinta cancellazione remota priva di tombstone.`);
                  return;
                }

                await idbDelete(store, docId);
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

  public destroy() {
    this.isDestroyed = true;
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
      case 'nota': return 'note';
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
