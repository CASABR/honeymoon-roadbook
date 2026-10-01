import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { STORES, idbPut, idbDelete, idbGetAll } from './indexedDB';
import { notifyDataChanged } from './storageService';

export class SyncService {
  private unsubscribes: (() => void)[] = [];
  private isPushing = false;
  private tripId: string;

  constructor(tripId: string) {
    this.tripId = tripId;
    this.setupLocalListeners();
    this.setupCloudListeners();
  }

  // --- 1. LOCAL TO CLOUD ---
  private setupLocalListeners() {
    window.addEventListener('roadbook_data_mutated', async (e: Event) => {
      const custom = e as CustomEvent;
      const { entityType, action, data, source } = custom.detail;
      
      // Ignoriamo le mutazioni che arrivano già dal cloud per evitare loop infiniti
      if (source === 'cloud') return;
      if (this.isPushing) return; // Debounce basilare (anche se setDoc gestisce bene la concorrenza)
      
      this.isPushing = true;
      try {
        await this.pushToCloud(entityType, action, data);
      } catch (err) {
        console.error('[SyncService] Errore Push to Cloud:', err);
      } finally {
        this.isPushing = false;
      }
    });

    window.addEventListener('force_cloud_sync_requested', async () => {
      console.log('[SyncService] Avvio sincronizzazione forzata verso il cloud...');
      this.isPushing = true;
      try {
        const collectionsToSync = [
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
        ];

        for (const { fb, store } of collectionsToSync) {
          const items = await idbGetAll<any>(store);
          const entityType = this.mapCollectionToEntity(fb);
          if (!entityType) continue;
          
          for (const item of items) {
            await this.pushToCloud(entityType, 'save', item);
          }
        }
        console.log('[SyncService] Sincronizzazione forzata completata!');
      } catch (err) {
        console.error('[SyncService] Errore Sync Forzato:', err);
      } finally {
        this.isPushing = false;
      }
    });
  }

  private async pushToCloud(entityType: string, action: 'save' | 'delete', data: any) {
    if (!data || !data.id) return;
    
    // Mappa l'entityType allo store di Firestore/IndexedDB
    const collectionName = this.mapEntityToCollection(entityType);
    if (!collectionName) return;

    const docRef = doc(db, 'trips', this.tripId, collectionName, data.id);

    if (action === 'delete') {
      await deleteDoc(docRef);
      console.log(`[Cloud Sync] 🗑️ Eliminato ${entityType} ${data.id}`);
    } else {
      // Calcolo approssimativo dimensione payload in stringa
      const payloadString = JSON.stringify(data);
      const sizeKB = payloadString.length / 1024;
      
      let payloadToSync = { ...data };
      
      // Se il payload supera ~900KB (limite Firestore è 1MB), togliamo gli allegati dal sync cloud
      if (sizeKB > 900 && 'attachments' in payloadToSync) {
        console.warn(`[SyncService] Payload ${data.id} troppo grande per Firestore (${sizeKB.toFixed(1)} KB). Rimuovo allegati dal cloud (rimangono in locale).`);
        delete (payloadToSync as any).attachments;
      }

      await setDoc(docRef, payloadToSync, { merge: true });
      console.log(`[Cloud Sync] ☁️ Salvato ${entityType} ${data.id}`);
    }
  }

  // --- 2. CLOUD TO LOCAL ---
  private setupCloudListeners() {
    const collectionsToSync = [
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
    ];

    collectionsToSync.forEach(({ fb, store }) => {
      const colRef = collection(db, 'trips', this.tripId, fb);
      
      const unsub = onSnapshot(colRef, async (snapshot) => {
        // Ignoriamo i cambiamenti causati dai nostri stessi salvataggi locali (pending writes)
        if (snapshot.metadata.hasPendingWrites) return;

        snapshot.docChanges().forEach(async (change) => {
          const data = change.doc.data();
          const docId = change.doc.id;
          
          try {
            if (change.type === 'added' || change.type === 'modified') {
              await idbPut(store, data);
              notifyDataChanged(this.mapCollectionToEntity(fb) || fb, 'save', data, 'cloud');
              console.log(`[Cloud Sync] 📥 Sincronizzato (Pull) ${fb} - ${docId}`);
            } else if (change.type === 'removed') {
              await idbDelete(store, docId);
              notifyDataChanged(this.mapCollectionToEntity(fb) || fb, 'delete', { id: docId }, 'cloud');
              console.log(`[Cloud Sync] 🧹 Rimosso (Pull) ${fb} - ${docId}`);
            }
          } catch (err) {
            console.error(`[Cloud Sync] Errore aggiornamento locale da cloud (${fb}):`, err);
          }
        });
      }, (error) => {
        console.error(`[Cloud Sync] Errore ascolto collezione ${fb}:`, error);
      });

      this.unsubscribes.push(unsub);
    });
  }

  public destroy() {
    this.unsubscribes.forEach(unsub => unsub());
    this.unsubscribes = [];
  }

  // Helpers per le mappature dei nomi (event Type -> Firestore Collection)
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
      default: return null;
    }
  }
}
