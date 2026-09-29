import { storageService } from './storageService';

// Un semplice servizio di sync cloud basato su un endpoint KV REST generico
// (es. JSONBin, KVdb, o Supabase Edge Functions).
// Per il momento usa un bucket pubblico mock o locale, sostituibile con chiavi reali.

// Se non abbiamo un backend reale, usiamo BroadcastChannel per simulare sync tra tab
const syncChannel = new BroadcastChannel('honeymoon_sync_room');

export class SyncService {
  private isSyncing = false;

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // 1. Ascolta eventi di salvataggio/mutazione locale per fare il push al cloud
    window.addEventListener('roadbook_data_mutated', (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail && custom.detail.source !== 'cloud') {
        this.pushToCloud(custom.detail);
      }
    });

    // 2. Ascolta il ritorno attivo sulla pagina (visibilitychange) per fare pull dal cloud
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.pullFromCloud();
      }
    });

    // 3. Simulazione cross-device via BroadcastChannel (funziona tra schede dello stesso browser)
    syncChannel.onmessage = async (event) => {
      if (event.data && event.data.type === 'SYNC_PUSH') {
        await this.pullFromCloud(event.data.payload);
      }
    };
  }

  // PUSH: Invia le modifiche locali al cloud
  public async pushToCloud(mutationDetail: any) {
    if (this.isSyncing) return;
    try {
      this.isSyncing = true;
      // Simuliamo l'invio al cloud o mandiamo via BroadcastChannel
      syncChannel.postMessage({ type: 'SYNC_PUSH', payload: mutationDetail });

      // TODO: Sostituire con vera fetch REST al KV Bin
      console.log('[SyncService] Modifiche inviate al cloud:', mutationDetail);
    } catch (err) {
      console.error('[SyncService] Errore push to cloud:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  // PULL: Scarica le modifiche remote e aggiorna IndexedDB
  public async pullFromCloud(payloadMock?: any) {
    if (this.isSyncing) return;
    try {
      this.isSyncing = true;
      
      // TODO: Sostituire con vera fetch REST al KV Bin
      const payload = payloadMock; // Nel mock usiamo il payload diretto
      
      if (!payload) {
        this.isSyncing = false;
        return;
      }

      console.log('[SyncService] Modifiche ricevute dal cloud:', payload);

      // Aggiorna IndexedDB a seconda dell'entità
      const { entityType, action, data } = payload;
      
      if (action === 'save' || action === 'update') {
        switch (entityType) {
          case 'attivita':
          case 'activity':
            await storageService.saveActivity(data);
            break;
          case 'trasporto':
            await storageService.saveTransport(data);
            break;
          case 'alloggio':
            await storageService.saveAccommodation(data);
            break;
          case 'spesa':
            await storageService.saveSpesa(data);
            break;
          // Aggiungere gli altri se necessario...
        }
      } else if (action === 'delete') {
        switch (entityType) {
          case 'attivita':
          case 'activity':
            await storageService.deleteActivity(data.id);
            break;
          case 'trasporto':
            await storageService.deleteTransport(data.id);
            break;
          case 'alloggio':
            await storageService.deleteAccommodation(data.id);
            break;
          case 'spesa':
            await storageService.deleteSpesa(data.id);
            break;
        }
      }

      // Notifichiamo la UI del cambiamento (senza triggerare un nuovo push)
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { 
        detail: { ...payload, source: 'cloud' } 
      }));
    } catch (err) {
      console.error('[SyncService] Errore pull from cloud:', err);
    } finally {
      this.isSyncing = false;
    }
  }
}

// Inizializza il singleton
export const syncService = new SyncService();
