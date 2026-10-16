import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { STORES, idbPut, idbDelete, idbGetAll, idbGet } from './indexedDB';
import { notifyDataChanged } from './storageService';

export class SyncService {
  private unsubscribes: (() => void)[] = [];
  
  private tripId: string;

  constructor(tripId: string) {
    this.tripId = tripId;
    this.setupLocalListeners();
    this.setupCloudListeners();
    // Avvia sincronizzazione automatica bidirezionale all'avvio (Master e Copilota)
    this.syncBidirectional().catch(err => console.warn('[SyncService] Errore sync iniziale:', err));
  }

  public async syncBidirectional(): Promise<void> {
    try {
      const { getDocs } = await import('firebase/firestore');
      const collectionsToSync = this.getCollectionsToSync();
      let pulledCount = 0;

      for (const { fb, store } of collectionsToSync) {
        try {
          const colRef = collection(db, 'trips', this.tripId, fb);
          const snap = await getDocs(colRef);
          const serverDocIds = new Set<string>();

          for (const docSnap of snap.docs) {
            const serverData = docSnap.data();
            const docId = docSnap.id;
            serverDocIds.add(docId);

            // Se l'elemento è stato contrassegnato come eliminato (tombstone), non scaricarlo in locale
            const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
            if (tombstoneSetting && tombstoneSetting.value) {
              await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
              continue;
            }

            const localData = await idbGet<any>(store, docId);

            if (localData && localData.updatedAt && (localData.updatedAt > (serverData.updatedAt || 0))) {
              // Local is newer: push to cloud using pushToCloud logic
              const entityType = this.mapCollectionToEntity(fb);
              if (entityType) {
                await this.pushToCloud(entityType, 'save', localData);
              } else {
                await setDoc(doc(db, 'trips', this.tripId, fb, docId), this.cleanUndefinedValues(localData), { merge: true });
              }
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

          // Sincronizza verso il cloud eventuali record creati/modificati in locale ma non ancora presenti su Firestore
          if (snap.docs.length > 0 && fb !== 'settings') {
            const localItems = await idbGetAll<any>(store);
            for (const localItem of localItems) {
              if (localItem && localItem.id && !serverDocIds.has(localItem.id)) {
                // Non eliminare record locali validi! Pushali a Firestore per garantire la persistenza remota.
                try {
                  await setDoc(doc(db, 'trips', this.tripId, fb, localItem.id), this.cleanUndefinedValues(localItem), { merge: true });
                  console.log(`[SyncService] Sincronizzato record locale verso Cloud: ${fb}/${localItem.id}`);
                } catch (pushErr) {
                  console.warn(`[SyncService] Impossibile pushare record locale ${fb}/${localItem.id}:`, pushErr);
                }
              }
            }
          }
        } catch (colErr) {
          console.warn(`[SyncService] Errore sync collection ${fb}:`, colErr);
        }
      }

      // Se il device ha dati locali non presenti nel cloud, esegui push
      await this.syncAllLocalToCloud();

      if (pulledCount > 0) {
        window.dispatchEvent(new Event('roadbook_cloud_synced'));
      }
      console.log(`[SyncService] Sync bidirezionale completato (pull: ${pulledCount})`);
    } catch (err) {
      console.warn('[SyncService] Sync bidirezionale iniziale fallito (offline):', err);
    }
  }

  public async syncAllLocalToCloud(): Promise<void> {
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

  // --- 1. LOCAL TO CLOUD ---
  private setupLocalListeners() {
    window.addEventListener('roadbook_data_mutated', async (e: Event) => {
      const custom = e as CustomEvent;
      const { entityType, action, data, source } = custom.detail;
      
      // Ignoriamo le mutazioni che arrivano gia dal cloud per evitare loop infiniti
      if (source === 'cloud') return;
      
      try {
        await this.pushToCloud(entityType, action, data);
      } catch (err) {
        console.error('[SyncService] Errore Push to Cloud:', err);
      }
    });

    window.addEventListener('force_cloud_sync_requested', async () => {
      console.log('[SyncService] Avvio sincronizzazione forzata verso il cloud...');
      try {
        await this.syncAllLocalToCloud();
        console.log('[SyncService] Sincronizzazione forzata completata!');
      } catch (err) {
        console.error('[SyncService] Errore Sync Forzato:', err);
      }
    });
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

          if (change.type === 'added' || change.type === 'modified') {
            promises.push(
              (async () => {
                // Se l'elemento è stato eliminato intenzionalmente (tombstone), non reinserirlo!
                const tombstoneSetting = await idbGet<any>(STORES.SETTINGS, `tombstone_${fb}_${docId}`);
                if (tombstoneSetting && tombstoneSetting.value) {
                  console.log(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Elemento contrassegnato da tombstone (eliminato)`);
                  // Eliminiamo anche da Firestore se ancora presente per allineare il cloud
                  await deleteDoc(doc(db, 'trips', this.tripId, fb, docId)).catch(() => {});
                  return;
                }

                let localData: any = null;
                try {
                  localData = await idbGet<any>(store, docId);
                  if (localData && localData.updatedAt) {
                    const serverUpdatedAt = data.updatedAt || 0;
                    if (localData.updatedAt > serverUpdatedAt) {
                      console.warn(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Il dato locale e' piu' recente`);
                      // Pushiamo il dato locale al server per allinearlo (visto che il server ha dati vecchi)
                      await setDoc(doc(db, 'trips', this.tripId, fb, docId), this.cleanUndefinedValues(localData), { merge: true });
                      return;
                    }
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
    this.unsubscribes.forEach(unsub => unsub());
    this.unsubscribes = [];
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
