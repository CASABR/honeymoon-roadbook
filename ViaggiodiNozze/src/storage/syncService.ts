import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { STORES, idbPut, idbDelete, idbGetAll, idbGet, type StoreName } from './indexedDB';
import { notifyDataChanged } from './storageService';
import { normalizeTimestamp } from '../utils/tripDates';
import { isCloudAuthorized } from '../utils/useAuthIdentity';

export class SyncService {
  private unsubscribes: (() => void)[] = [];
  private domListeners: { target: EventTarget; type: string; listener: EventListener }[] = [];
  private tripId: string;
  private isSyncing = false;
  private pendingSyncRequest = false;
  private autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private pendingSyncTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(tripId: string) {
    this.tripId = tripId;
    this.setupLocalListeners();
    this.setupCloudListeners();
    // Avvia sincronizzazione iniziale solo se già autorizzati, altrimenti il listener houni_cloud_role_changed la avvierà non appena confermato
    if (isCloudAuthorized()) {
      this.syncBidirectional().catch(err => console.warn('[SyncService] Errore sync iniziale:', err));
    } else {
      console.log('[SyncService] Avvio sync iniziale posticipato: in attesa di autorizzazione cloud.');
    }
  }

  public triggerAutomaticSync(reason: string): void {
    if (this.isDestroyed || typeof window === 'undefined') return;
    if (this.autoSyncDebounceTimer) {
      clearTimeout(this.autoSyncDebounceTimer);
    }
    this.autoSyncDebounceTimer = setTimeout(() => {
      this.autoSyncDebounceTimer = null;
      if (this.isDestroyed) return;
      if (!isCloudAuthorized()) {
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
            const localCreated = normalizeTimestamp(localItem.createdAt);
            const tombstoneDeleted = normalizeTimestamp(serverData.deletedAt || serverData.timestamp);

            if (localCreated > 0 && tombstoneDeleted > 0 && localCreated > tombstoneDeleted) {
              // Ricreazione valida intenzionale locale: il tombstone remoto è superato
              console.log(`[SyncService] Rilevata ricreazione valida locale per ${entityType}/${deletedId} - elimino tombstone remoto.`);
              if (isCloudAuthorized()) {
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
          if (!isCloudAuthorized()) {
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
              if (isCloudAuthorized()) {
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

          if (localData && localUpdated > 0 && localUpdated > serverUpdated) {
            // Local is newer: push to cloud solo se autorizzati
            if (!isCloudAuthorized()) {
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
          } else {
            // Cloud is newer or same: store locally, reconstructing chunks if needed
            let itemToStore: any = { ...serverData, id: docId };
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
            if (!isCloudAuthorized()) {
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
    if (!isCloudAuthorized()) {
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
      case 'nota': return STORES.NOTE;
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
        await this.pushToCloud(entityType, action, data);
      } catch (err) {
        console.error('[SyncService] Errore Push to Cloud:', err);
      }
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
        console.log(`[SyncService] Rilevato ruolo autorizzato (${role}): trigger sincronizzazione automatica.`);
        this.triggerAutomaticSync('cloud_role_authorized');
      }
    }) as EventListener);

    // Ripresa automatica al ritorno della connessione online
    this.addDomListener(window, 'online', (() => {
      console.log('[SyncService] Connessione di rete ripristinata (online): verifico autorizzazioni per sync.');
      setTimeout(() => {
        if (isCloudAuthorized()) {
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

  private async pushToCloud(entityType: string, action: 'save' | 'delete', data: any) {
    if (!data || !data.id) return;
    if (!isCloudAuthorized()) {
      console.warn(`[SyncService] Push to cloud annullato: sessione non autorizzata dal Cloud per ${entityType}/${data.id}`);
      return;
    }
    
    const collectionName = this.mapEntityToCollection(entityType);
    if (!collectionName) return;

    const docRef = doc(db, 'trips', this.tripId, collectionName, data.id);

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
      await deleteDoc(docRef);
      console.log(`[Cloud Sync] Eliminato ${entityType} ${data.id}`);
    } else {
      // Protezione tombstone: evita di inviare al Cloud record con tombstone attivo non ricreati lecitamente
      const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${collectionName}_${data.id}`);
      if (tombstoneSetting && tombstoneSetting.value) {
        const itemCreated = normalizeTimestamp(data?.createdAt);
        const tombstoneDeleted = normalizeTimestamp(tombstoneSetting.value.deletedAt || tombstoneSetting.value.timestamp);
        if (!(itemCreated > 0 && tombstoneDeleted > 0 && itemCreated > tombstoneDeleted)) {
          console.warn(`[SyncService] pushToCloud bloccato per ${collectionName}/${data.id}: record con tombstone attivo e createdAt non successivo alla cancellazione.`);
          return;
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

      const cleanPayload = this.cleanUndefinedValues(payloadToSync);
      await setDoc(docRef, cleanPayload, { merge: true });
      if (entityType === 'settings' && typeof data?.id === 'string' && data.id.startsWith('tombstone_')) {
        await idbPut(STORES.SETTINGS, { ...data, value: { ...(data.value || {}), pending: false } }).catch(() => {});
      }
      console.log(`[Cloud Sync] Salvato ${entityType} ${data.id}`);
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
                    if (isCloudAuthorized()) {
                      await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                    } else {
                      console.warn(`[Cloud Sync] Sospesa cancellazione remota per ${fb}/${docId}: in attesa di autorizzazione cloud.`);
                    }
                    return;
                  }
                }

                let localData: any = null;
                try {
                  localData = await idbGet<any>(store, docId);
                  const localUpdated = normalizeTimestamp(localData?.updatedAt);
                  const serverUpdated = normalizeTimestamp(data?.updatedAt);
                  if (localData && localUpdated > 0 && localUpdated > serverUpdated) {
                    console.warn(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Il dato locale e' piu' recente`);
                    if (isCloudAuthorized()) {
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
                    return;
                  }
                } catch (e) {}
                
                let itemToStore: any = { ...data };

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
              idbDelete(store, docId)
                .then(() => {
                  const entityType = this.mapCollectionToEntity(fb) || fb;
                  scheduleRefresh(entityType, 'delete', { id: docId });
                  console.log(`[Cloud Sync] Rimosso ${fb}/${docId}`);
                })
                .catch(err => console.error(`[Cloud Sync] Errore idbDelete ${fb}:`, err))
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
