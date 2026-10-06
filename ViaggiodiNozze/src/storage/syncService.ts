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
      await deleteDoc(docRef);
      console.log(`[Cloud Sync] Eliminato ${entityType} ${data.id}`);
    } else {
      const payloadString = JSON.stringify(data);
      const sizeKB = payloadString.length / 1024;
      
      let payloadToSync = { ...data };
      
      if (sizeKB > 900 && 'attachments' in payloadToSync) {
        console.warn(`[SyncService] Payload ${data.id} troppo grande (${sizeKB.toFixed(1)} KB). Rimuovo allegati.`);
        delete (payloadToSync as any).attachments;
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
                try {
                  const localData = await idbGet<any>(store, docId);
                  if (localData && localData.updatedAt && data.updatedAt && localData.updatedAt > data.updatedAt) {
                    console.warn(`[Cloud Sync] Ignorato Pull per ${fb}/${docId} - Il dato locale e' piu' recente`);
                    return;
                  }
                } catch (e) {}
                
                await idbPut(store, data);
                const entityType = this.mapCollectionToEntity(fb) || fb;
                scheduleRefresh(entityType, 'save', data);
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
