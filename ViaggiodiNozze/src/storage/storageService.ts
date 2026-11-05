import type { Giorno, Attivita, Alloggio, Trasporto, TravelDocument, RoutingCacheItem, Tappa, Ristorante, Shopping, Spesa, DeviceRole, NotaViaggio, Scadenza, Bagaglio, DayMapsRoutes, DayMapRouteEntry, DayRouteTransportMode } from '../types';
import {
  STORES,
  idbGetAll,
  idbGet,
  idbPut,
  idbDelete,
  getActiveTripId,
  MASTER_TRIP_ID
} from './indexedDB';
import { formatDateIT, normalizeTimestamp } from '../utils/tripDates';
import { assertCanMutate } from '../utils/useAuthIdentity';
import { compareTimelineItems } from '../utils/timelineOrdering';
import { sortDeadlines } from '../utils/deadlines';
import { lookupKnownCoordinate } from '../utils/geoCoordinatesHelper';

export const SEED_FLAG_KEY = 'honeymoon_roadbook_seeded_v1';

export function notifyDataChanged(entityType: string, action: 'save' | 'delete', data?: any, source: 'local' | 'cloud' = 'local'): void {
  if (typeof window === 'undefined') return;
  try {
    // 1. Evento specifico retrocompatibile
    window.dispatchEvent(new CustomEvent(`${entityType}_updated`, { detail: { action, data, source } }));
    // 2. Evento globale unificato per tutte le viste
    window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { entityType, action, data, source } }));
  } catch (err) {
    console.error('[StorageService] Errore dispatching notifyDataChanged:', err);
  }
}

/**
 * Unifica le note legacy ('notes', 'nota', 'noteCopilota') nel campo ufficiale 'noteCopilota'.
 * Preserva ogni contenuto senza cancellare nulla: se sono presenti più testi distinti,
 * li combina preservando ogni dettaglio.
 */
export function unifyCopilotNotes(...candidates: (string | undefined | null)[]): string | undefined {
  const clean = candidates
    .filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
    .map(c => c.trim());
  if (clean.length === 0) return undefined;
  const unique = Array.from(new Set(clean));
  return unique.join('\n\n');
}

/**
 * Servizio di persistenza locale astratto.
 * La UI interagisce esclusivamente con questa interfaccia asincrona,
 * garantendo che l'implementazione del database locale possa essere sostituita
 * o estesa per sincronizzazione remota senza intaccare i componenti.
 */
class StorageService {
  private memoryCache: Map<string, any[]> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('roadbook_data_mutated', (e: any) => {
        const entityType = e?.detail?.entityType;
        if (entityType) {
          const storeMap: Record<string, string> = {
            giorni: STORES.GIORNI,
            attivita: STORES.ATTIVITA,
            alloggi: STORES.ALLOGGI,
            trasporti: STORES.TRASPORTI,
            tappe: STORES.TAPPE,
            tappa: STORES.TAPPE,
            ristoranti: STORES.RISTORANTI,
            shopping: STORES.SHOPPING,
            spese: STORES.SPESE,
            documenti: STORES.DOCUMENTI
          };
          const targetStore = storeMap[entityType] || entityType;
          this.memoryCache.delete(targetStore);
        } else {
          this.memoryCache.clear();
        }
      });

      window.addEventListener('roadbook_cloud_synced', () => {
        this.memoryCache.clear();
      });

      window.addEventListener('trip_config_changed', () => {
        this.memoryCache.clear();
      });
    }
  }

  getCurrentTripId(): string {
    return getActiveTripId();
  }

  clearMemoryCache(store?: string): void {
    if (store) this.memoryCache.delete(store);
    else this.memoryCache.clear();
  }

  // --- GIORNI ---
  async getDays(): Promise<Giorno[]> {
    try {
      if (this.memoryCache.has(STORES.GIORNI)) {
        return [...this.memoryCache.get(STORES.GIORNI)!];
      }
      const items = await idbGetAll<Giorno>(STORES.GIORNI);
      const sorted = items.sort((a, b) => ((a.date || '').split('-').length === 3 && (a.date || '').split('-')[0].length === 2 ? (a.date || '').split('-').reverse().join('-') : (a.date || '')).localeCompare(((b.date || '').split('-').length === 3 && (b.date || '').split('-')[0].length === 2 ? (b.date || '').split('-').reverse().join('-') : (b.date || ''))));
      this.memoryCache.set(STORES.GIORNI, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura giorni:', err);
      return [];
    }
  }

  async saveDay(day: Giorno): Promise<void> {
    assertCanMutate('giorni');
    const now = Date.now();
    const item: Giorno = {
      ...day,
      createdAt: day.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('giorni', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.GIORNI);
    await idbPut(STORES.GIORNI, item);
    notifyDataChanged('giorni', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('giorni', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione giorni:', err);
    }
  }

  async deleteDay(id: string): Promise<void> {
    assertCanMutate('giorni');
    this.memoryCache.delete(STORES.GIORNI);
    await this.recordTombstone('giorni', id);
    await idbDelete(STORES.GIORNI, id);
    notifyDataChanged('giorni', 'delete', { id });
    try {
      const activities = await this.getActivities(id);
      for (const act of activities) {
        await this.deleteActivity(act.id);
      }
    } catch (err) {
      console.warn('[StorageService] Pulizia attività a cascata parziale:', err);
    }
  }

  // --- DAY MAPS ROUTES (Auto & Piedi con retrocompatibilità assoluta) ---
  async getDayMapsRoutes(date: string): Promise<DayMapsRoutes> {
    const routesSetting = await idbGet<any>(STORES.SETTINGS, `day_maps_routes_${date}`);
    let routes: DayMapsRoutes = routesSetting?.value || {};

    // Migrazione / Fallback retrocompatibile trasparente:
    // Se non c'è una configurazione nuova per questa data, controlla se esiste il vecchio link legacy
    if (!routes.driving && !routes.walking) {
      const legacySetting = await idbGet<any>(STORES.SETTINGS, `day_maps_link_${date}`);
      if (legacySetting?.value && typeof legacySetting.value === 'string' && legacySetting.value.trim()) {
        const legacyUrl = legacySetting.value.trim();
        const isWalking = legacyUrl.toLowerCase().includes('travelmode=walking') || legacyUrl.toLowerCase().includes('dirflg=w');
        const mode: DayRouteTransportMode = isWalking ? 'walking' : 'driving';
        const entry: DayMapRouteEntry = {
          url: legacyUrl,
          mode,
          isComplete: false,
          updatedAt: Date.now()
        };
        if (mode === 'walking') {
          routes = { walking: entry };
        } else {
          routes = { driving: entry };
        }
      }
    }
    return routes;
  }

  async saveDayMapsRoutes(date: string, routes: DayMapsRoutes): Promise<void> {
    assertCanMutate('settings');
    const id = `day_maps_routes_${date}`;
    const data = { id, value: routes };
    await idbPut(STORES.SETTINGS, data);
    notifyDataChanged('settings', 'save', data);

    // Manteniamo sincronizzato anche il link legacy 'day_maps_link_${date}'
    // per massima retrocompatibilità con parti di codice o esportazioni preesistenti
    const primaryUrl = routes.driving?.url || routes.walking?.url || '';
    const legacyId = `day_maps_link_${date}`;
    if (primaryUrl) {
      const legacyData = { id: legacyId, value: primaryUrl };
      await idbPut(STORES.SETTINGS, legacyData);
      notifyDataChanged('settings', 'save', legacyData);
    } else {
      await idbDelete(STORES.SETTINGS, legacyId);
      notifyDataChanged('settings', 'delete', { id: legacyId });
    }
  }

  async getDayMapLink(date: string): Promise<string | null> {
    const routes = await this.getDayMapsRoutes(date);
    if (routes.driving?.url) return routes.driving.url;
    if (routes.walking?.url) return routes.walking.url;
    const setting = await idbGet<any>(STORES.SETTINGS, `day_maps_link_${date}`);
    return setting ? setting.value : null;
  }

  async saveDayMapLink(date: string, link: string): Promise<void> {
    assertCanMutate('settings');
    const currentRoutes = await this.getDayMapsRoutes(date);
    const updatedRoutes: DayMapsRoutes = {
      ...currentRoutes,
      driving: link ? { url: link, mode: 'driving', updatedAt: Date.now() } : null
    };
    await this.saveDayMapsRoutes(date, updatedRoutes);
  }

  // --- GENERIC SETTINGS & TOMBSTONES ---
  async getSetting<T = any>(key: string): Promise<T | null> {
    const setting = await idbGet<any>(STORES.SETTINGS, key);
    return setting ? setting.value : null;
  }

  async saveSetting(key: string, value: any): Promise<void> {
    assertCanMutate('settings');
    if (value === null || value === undefined) {
      await idbDelete(STORES.SETTINGS, key);
      notifyDataChanged('settings', 'delete', { id: key });
    } else {
      const data = { id: key, value };
      await idbPut(STORES.SETTINGS, data);
      notifyDataChanged('settings', 'save', data);
    }
  }

  /**
   * Registra una pietra tombale (tombstone) per un elemento eliminato intenzionalmente dall'utente.
   * Evita che seed o sinc reintroducano l'elemento cancellato.
   */
  async recordTombstone(entityType: string, id: string): Promise<void> {
    if (!id) return;
    const now = Date.now();
    const tombstoneKey = `tombstone_${entityType}_${id}`;
    const tombstoneData = {
      id: tombstoneKey,
      value: {
        entityType,
        deletedId: id,
        timestamp: now,
        deletedAt: now,
        pending: true
      }
    };
    await idbPut(STORES.SETTINGS, tombstoneData);
    notifyDataChanged('settings', 'save', tombstoneData);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(tombstoneKey, 'true');
      } catch (e) {}
    }
  }

  /**
   * Valida se un salvataggio è lecito in presenza di un eventuale tombstone attivo.
   * Criterio coerente con removeTombstoneIfRecreated e pushToCloud:
   * Consente il salvataggio solo se l'elemento è una ricreazione intenzionale con data di creazione
   * strettamente posteriore alla data di eliminazione registrata (createdAt > deletedAt).
   * Blocca il salvataggio di copie obsolete o zombie memorizzati prima della cancellazione.
   */
  async validateSaveAgainstTombstone(entityType: string, id: string, createdAt?: number): Promise<boolean> {
    if (!id) return true;
    const tombstoneKey = `tombstone_${entityType}_${id}`;
    const setting = await idbGet<any>(STORES.SETTINGS, tombstoneKey);
    if (!setting || !setting.value) return true;

    const deletedAt = normalizeTimestamp(setting.value.deletedAt || setting.value.timestamp);
    const itemCreatedAt = normalizeTimestamp(createdAt);

    if (itemCreatedAt > 0 && deletedAt > 0 && itemCreatedAt > deletedAt) {
      return true;
    }

    console.warn(`[StorageService] Rifiutato salvataggio per ${entityType}/${id}: tombstone attivo (cancellato a ${new Date(deletedAt).toISOString()}), elemento creato a ${itemCreatedAt > 0 ? new Date(itemCreatedAt).toISOString() : 'sconosciuto'}.`);
    return false;
  }

  /**
   * Rimuove il tombstone se l'elemento è stato ricreato intenzionalmente con timestamp successivo alla cancellazione.
   * Ritorna true se il tombstone è stato rimosso, false altrimenti.
   */
  async removeTombstoneIfRecreated(entityType: string, id: string, createdAt?: number): Promise<boolean> {
    if (!id) return false;
    const tombstoneKey = `tombstone_${entityType}_${id}`;
    const setting = await idbGet<any>(STORES.SETTINGS, tombstoneKey);
    if (!setting || !setting.value) return false;

    const deletedAt = normalizeTimestamp(setting.value.deletedAt || setting.value.timestamp);
    const itemCreatedAt = normalizeTimestamp(createdAt);

    // Se l'elemento ha una data di creazione valida e successiva alla cancellazione, è una ricreazione valida
    if (itemCreatedAt > 0 && deletedAt > 0 && itemCreatedAt > deletedAt) {
      await idbDelete(STORES.SETTINGS, tombstoneKey);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem(tombstoneKey); } catch (e) {}
      }
      // Non inviamo notifyDataChanged('settings', 'delete') sul Cloud qui:
      // il tombstone condiviso su Firestore non deve essere rimosso prima che tutti i dispositivi
      // abbiano potuto sincronizzare e scartare le proprie copie zombie pre-cancellazione.
      return true;
    }
    return false;
  }


  /**
   * Verifica se un elemento è stato eliminato intenzionalmente.
   */
  async isItemDeleted(entityType: string, id: string): Promise<boolean> {
    if (!id) return false;
    const tombstoneKey = `tombstone_${entityType}_${id}`;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(tombstoneKey) === 'true') {
      return true;
    }
    const setting = await idbGet<any>(STORES.SETTINGS, tombstoneKey);
    return Boolean(setting && setting.value);
  }

  /**
   * Seeding iniziale dei dati mock/default (tappe, attività, trasporti, documenti).
   * Viene eseguito ESCLUSIVAMENTE se e solo se l'app non è mai stata seedata
   * (verifica tramite SEED_FLAG_KEY in localStorage) o se lo store è TOTALMENTE VUOTO.
   *
   * VERIFICA DI INTEGRITÀ (fail-safe): se il flag è presente ma il DB è vuoto
   * (es. wipe dopo upgrade IndexedDB), esegue il re-seed di emergenza.
   */
  async initInitialSeedData(): Promise<void> {
    // No-op: il sistema non inietta più alcun mock data.
    // L'app partirà completamente vuota in caso di nuovo codice vacanza.
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEED_FLAG_KEY, 'true');
    }
    await this.migrateNotesToCopilotNotes();
    return;
  }

  /**
   * Migrazione sicura: copia e unifica tutte le note legacy nel campo 'noteCopilota'
   * per tutte le categorie in IndexedDB, garantendo l'assoluta preservazione di ogni dato.
   */
  async migrateNotesToCopilotNotes(): Promise<void> {
    try {
      const stores = [
        STORES.ATTIVITA,
        STORES.ALLOGGI,
        STORES.TRASPORTI,
        STORES.TAPPE,
        STORES.RISTORANTI,
        STORES.SHOPPING
      ];
      for (const store of stores) {
        const items = await idbGetAll<any>(store);
        let hasChanges = false;
        for (const item of items) {
          let itemChanged = false;
          if (store === STORES.TAPPE) {
            if (item.sottocategoria === 'Sosta fotografica') {
              item.sottocategoria = 'Spot fotografico';
              itemChanged = true;
            } else if (item.sottocategoria === 'Sosta' || item.sottocategoria === 'Sosta generica') {
              item.sottocategoria = 'Sosta tecnica';
              itemChanged = true;
            }
          }
          if (itemChanged) {
            await idbPut(store, item);
            hasChanges = true;
          }
        }
        if (hasChanges) {
          this.memoryCache.delete(store);
        }
      }
    } catch (err) {
      console.warn('[StorageService] Errore migrazione:', err);
    }
  }

  async ensureMasterTripSeedData(): Promise<void> {
    return;
  }

  async ensureRefuels(): Promise<void> {
    return;
  }

  async logLocalDataCounts(prefix = '[StorageService] Conteggio IndexedDB'): Promise<void> {
    const [giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese, note, bagagli] = await Promise.all([
      idbGetAll(STORES.GIORNI),
      idbGetAll(STORES.ATTIVITA),
      idbGetAll(STORES.ALLOGGI),
      idbGetAll(STORES.TRASPORTI),
      idbGetAll(STORES.DOCUMENTI),
      idbGetAll(STORES.TAPPE),
      idbGetAll(STORES.RISTORANTI),
      idbGetAll(STORES.SHOPPING),
      idbGetAll(STORES.SPESE),
      idbGetAll(STORES.NOTE),
      idbGetAll(STORES.BAGAGLI)
    ]);
    console.log(prefix, {
      giorni: giorni.length,
      attivita: attivita.length,
      alloggi: alloggi.length,
      trasporti: trasporti.length,
      documenti: documenti.length,
      tappe: tappe.length,
      ristoranti: ristoranti.length,
      shopping: shopping.length,
      spese: spese.length,
      note: note.length,
      bagagli: bagagli.length
    });
  }

  // --- ATTIVITA ---
  async getActivities(dayId?: string): Promise<Attivita[]> {
    try {
      let items = this.memoryCache.get(STORES.ATTIVITA);
      if (!items) {
        items = await idbGetAll<Attivita>(STORES.ATTIVITA);
        this.memoryCache.set(STORES.ATTIVITA, items);
      }
      const filtered = dayId ? items.filter(a => a.dayId === dayId) : items;
      return [...filtered].map(a => {
        const cleanCopilot = (a.noteCopilota || '').trim() || undefined;
        const cleanNotes = (a.notes || (a as any).nota || '').trim() || undefined;
        return {
          ...a,
          noteCopilota: cleanCopilot,
          notes: cleanNotes,
          nota: cleanNotes,
          copilota: Boolean(cleanCopilot) || a.copilota || undefined
        };
      }).sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return a.title.localeCompare(b.title);
      });
    } catch (err) {
      console.error('[StorageService] Errore lettura attività:', err);
      return [];
    }
  }

  async saveActivity(activity: Attivita): Promise<void> {
    assertCanMutate('attivita');
    const now = Date.now();
    let finalDayId = activity.dayId;
    let finalDate = activity.date;

    // Se l'attività ha una proprietà date valida, assicurati che dayId sia coerente
    if (finalDate && (!finalDayId || finalDayId.startsWith('day_'))) {
      finalDayId = `day_${finalDate}`;
    } else if (!finalDate && finalDayId && finalDayId.startsWith('day_')) {
      finalDate = finalDayId.replace('day_', '');
    }

    // Normalizza e sincronizza orario, orarioInizio, orarioRitrovo e time
    const rawTime = (activity.time || activity.orarioInizio || (activity as any).orario || activity.orarioRitrovo || '').trim();
    const effectiveTime = rawTime || undefined;
    const finalRitrovo = (activity.orarioRitrovo || rawTime || '').trim() || undefined;
    const finalInizio = (activity.orarioInizio || rawTime || '').trim() || undefined;

    const cleanCopilot = (activity.noteCopilota || '').trim() || undefined;
    const cleanNotes = (activity.notes || (activity as any).nota || '').trim() || undefined;

    const item: Attivita = {
      ...activity,
      dayId: finalDayId,
      date: finalDate,
      data: finalDate,
      time: effectiveTime,
      orarioInizio: finalInizio,
      orarioRitrovo: finalRitrovo,
      orario: effectiveTime, // Mantenuto allineato per compatibilità totale
      noteCopilota: cleanCopilot,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || activity.copilota || undefined,
      createdAt: activity.createdAt || now,
      updatedAt: now
    } as any;
    if (!await this.validateSaveAgainstTombstone('attivita', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.ATTIVITA);
    await idbPut(STORES.ATTIVITA, item);
    notifyDataChanged('attivita', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('attivita', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione attivita:', err);
    }
  }

  async deleteActivity(id: string): Promise<void> {
    assertCanMutate('attivita');
    try {
      const tappe = await this.getTappe();
      const linked = tappe.filter(t => t.passeggiataId === id);
      for (const t of linked) {
        await this.updateTappa(t.id, { passeggiataId: undefined });
      }
    } catch (err) {
      console.warn('[StorageService] Errore scollegamento tappe figlie da passeggiata rimossa:', err);
    }
    this.memoryCache.delete(STORES.ATTIVITA);
    await this.recordTombstone('attivita', id);
    await idbDelete(STORES.ATTIVITA, id);
    notifyDataChanged('attivita', 'delete', { id });
  }

  // --- ALLOGGI ---
  async getAccommodations(): Promise<Alloggio[]> {
    try {
      if (this.memoryCache.has(STORES.ALLOGGI)) {
        return [...this.memoryCache.get(STORES.ALLOGGI)!];
      }
      const items = await idbGetAll<Alloggio>(STORES.ALLOGGI);
      const normalized = items.map(acc => {
        const cleanCopilot = (acc.noteCopilota || '').trim() || undefined;
      const cleanNotes = (acc.notes || (acc as any).nota || '').trim() || undefined;
      return {
        ...acc,
        noteCopilota: cleanCopilot,
        notes: cleanNotes,
        nota: cleanNotes,
        copilota: Boolean(cleanCopilot) || acc.copilota || undefined
      };
      });
      const sorted = normalized.sort((a, b) => ((a.checkIn || '').split('-').length === 3 && (a.checkIn || '').split('-')[0].length === 2 ? (a.checkIn || '').split('-').reverse().join('-') : (a.checkIn || '')).localeCompare(((b.checkIn || '').split('-').length === 3 && (b.checkIn || '').split('-')[0].length === 2 ? (b.checkIn || '').split('-').reverse().join('-') : (b.checkIn || ''))));
      this.memoryCache.set(STORES.ALLOGGI, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura alloggi:', err);
      return [];
    }
  }

  async getAlloggi(): Promise<Alloggio[]> {
    return this.getAccommodations();
  }

  async saveAccommodation(acc: Alloggio): Promise<void> {
    assertCanMutate('alloggi');
    const now = Date.now();
    const cleanCopilot = (acc.noteCopilota || '').trim() || undefined;
    const cleanNotes = (acc.notes || (acc as any).nota || '').trim() || undefined;
    const cleanAcconto = acc.acconto || acc.depositPaid || undefined;
    const item: Alloggio = {
      ...acc,
      acconto: cleanAcconto,
      depositPaid: cleanAcconto,
      deposit: acc.deposit || (acc as any).cauzione || undefined,
      cauzione: (acc as any).cauzione || acc.deposit || undefined,
      noteCopilota: cleanCopilot,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || acc.copilota || undefined,
      createdAt: acc.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('alloggi', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.ALLOGGI);
    await idbPut(STORES.ALLOGGI, item);
    notifyDataChanged('alloggi', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('alloggi', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione alloggi:', err);
    }
  }

  async saveAlloggio(acc: Alloggio): Promise<void> {
    return this.saveAccommodation(acc);
  }

  async deleteAccommodation(id: string): Promise<void> {
    assertCanMutate('alloggi');
    this.memoryCache.delete(STORES.ALLOGGI);
    await this.recordTombstone('alloggi', id);
    await idbDelete(STORES.ALLOGGI, id);
    notifyDataChanged('alloggi', 'delete', { id });
  }

  async deleteAlloggio(id: string): Promise<void> {
    return this.deleteAccommodation(id);
  }

  // --- TRASPORTI ---
  async seedTransports(force = false): Promise<void> {
    void force;
    return;
  }
  async getTransports(): Promise<Trasporto[]> {
    try {
      if (this.memoryCache.has(STORES.TRASPORTI)) {
        return [...this.memoryCache.get(STORES.TRASPORTI)!];
      }
      const items = await idbGetAll<Trasporto>(STORES.TRASPORTI);
      const normalized = items.map(tr => {
        const cleanCopilot = (tr.noteCopilota || '').trim() || undefined;
      const cleanNotes = ((tr as any).notes || (tr as any).nota || '').trim() || undefined;
      return {
        ...tr,
        noteCopilota: cleanCopilot,
        notes: cleanNotes,
        nota: cleanNotes,
        copilota: Boolean(cleanCopilot) || tr.copilota || undefined
      };
      });
      
      const sorted = normalized.sort((a, b) => {
        const dateCompare = ((a.date || '').split('-').length === 3 && (a.date || '').split('-')[0].length === 2 ? (a.date || '').split('-').reverse().join('-') : (a.date || '')).localeCompare(((b.date || '').split('-').length === 3 && (b.date || '').split('-')[0].length === 2 ? (b.date || '').split('-').reverse().join('-') : (b.date || '')));
        if (dateCompare !== 0) return dateCompare;
        if (a.departureTime && b.departureTime) return a.departureTime.localeCompare(b.departureTime);
        return 0;
      });
      this.memoryCache.set(STORES.TRASPORTI, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura trasporti:', err);
      return [];
    }
  }

  async saveTransport(transport: Trasporto): Promise<void> {
    assertCanMutate('trasporti');
    const now = Date.now();
    const cleanCopilot = (transport.noteCopilota || '').trim() || undefined;
    const cleanNotes = ((transport as any).notes || (transport as any).nota || '').trim() || undefined;
    const cleanAcconto = (transport as any).acconto || transport.depositPaid || (transport as any).amountPaid || undefined;
    const item: Trasporto = {
      ...transport,
      data: transport.date,
      acconto: cleanAcconto,
      depositPaid: cleanAcconto,
      amountPaid: cleanAcconto,
      noteCopilota: cleanCopilot,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || transport.copilota || undefined,
      createdAt: transport.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('trasporti', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.TRASPORTI);
    await idbPut(STORES.TRASPORTI, item);
    notifyDataChanged('trasporti', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('trasporti', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione trasporti:', err);
    }
  }

  async deleteTransport(id: string): Promise<void> {
    assertCanMutate('trasporti');
    this.memoryCache.delete(STORES.TRASPORTI);
    await this.recordTombstone('trasporti', id);
    await idbDelete(STORES.TRASPORTI, id);
    notifyDataChanged('trasporti', 'delete', { id });
  }

  // --- DOCUMENTI ---
  async getDocuments(): Promise<TravelDocument[]> {
    try {
      const rawItems = await idbGetAll<any>(STORES.DOCUMENTI);
      const validItems: TravelDocument[] = [];

      for (const doc of rawItems) {
        if (!doc || !doc.id) continue;
        // Purge proattivo di vecchi chunk scaricati erroneamente nello store documenti
        if (typeof doc.id === 'string' && doc.id.startsWith('att_chunk_')) {
          await idbDelete(STORES.DOCUMENTI, doc.id).catch(() => {});
          continue;
        }
        validItems.push(doc as TravelDocument);
      }

      return validItems;
    } catch (err) {
      console.error('[StorageService] Errore lettura documenti:', err);
      return [];
    }
  }

  async ensureGenericDocumentTemplates(): Promise<TravelDocument[]> {
    const tripId = (() => {
      try {
        return JSON.parse(localStorage.getItem('roadbook_trip_config') || '{}')?.id || '0000';
      } catch {
        return '0000';
      }
    })();
    const existing = await this.getDocuments();
    if (tripId === '0000' || existing.length > 0) return existing;

    const now = new Date().toISOString();
    const templates: TravelDocument[] = [
      { id: 'doc_template_passaporto', category: 'passaporto', title: 'Passaporto', description: '', status: 'Da verificare', attachments: [], updatedAt: now },
      { id: 'doc_template_identita', category: 'altro', title: "Carta d'identità", description: '', status: 'Da verificare', attachments: [], updatedAt: now }
    ];
    for (const template of templates) await this.saveDocument(template);
    return templates;
  }

  async getDocumentById(id: string): Promise<TravelDocument | undefined> {
    try {
      return await idbGet<TravelDocument>(STORES.DOCUMENTI, id);
    } catch (err) {
      console.error('[StorageService] Errore lettura documento:', err);
      return undefined;
    }
  }

  async saveDocument(doc: TravelDocument): Promise<void> {
    assertCanMutate('documenti');
    const now = Date.now();
    const item: TravelDocument = {
      ...doc,
      createdAt: (doc as any).createdAt || now,
      updatedAt: new Date().toISOString()
    };
    if (!await this.validateSaveAgainstTombstone('documenti', item.id, (item as any).createdAt)) {
      return;
    }
    await idbPut(STORES.DOCUMENTI, item);
    notifyDataChanged('documenti', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('documenti', item.id, (item as any).createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione documenti:', err);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    assertCanMutate('documenti');
    await this.recordTombstone('documenti', id);
    await idbDelete(STORES.DOCUMENTI, id);
    notifyDataChanged('documenti', 'delete', { id });
  }

  // --- ROUTING CACHE ---
  async getRouteCache(id: string): Promise<RoutingCacheItem | undefined> {
    try {
      return await idbGet<RoutingCacheItem>(STORES.ROUTES, id);
    } catch (err) {
      console.error('[StorageService] Errore lettura cache percorso:', err);
      return undefined;
    }
  }

  async getAllRouteCaches(): Promise<RoutingCacheItem[]> {
    try {
      return await idbGetAll<RoutingCacheItem>(STORES.ROUTES);
    } catch (err) {
      console.error('[StorageService] Errore lettura percorsi:', err);
      return [];
    }
  }

  async saveRouteCache(item: RoutingCacheItem): Promise<void> {
    try {
      await idbPut(STORES.ROUTES, {
        ...item,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('[StorageService] Errore salvataggio cache percorso:', err);
    }
  }

  // --- TAPPE ---
  async getTappe(): Promise<Tappa[]> {
    try {
      if (this.memoryCache.has(STORES.TAPPE)) {
        return [...this.memoryCache.get(STORES.TAPPE)!];
      }
      const items = await idbGetAll<Tappa>(STORES.TAPPE);
      const normalized = items.map(t => {
        const cleanCopilot = (t.noteCopilota || '').trim() || undefined;
      const cleanNotes = ((t as any).notes || t.nota || '').trim() || undefined;
      return {
        ...t,
        noteCopilota: cleanCopilot,
        notes: cleanNotes,
        nota: cleanNotes,
        copilota: Boolean(cleanCopilot) || t.copilota || undefined
      };
      });
      const sorted = normalized.sort((a, b) => {
        const dateA = a.data || a.date || '';
        const dateB = b.data || b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        const timeA = a.orario || (a as any).time || '';
        const timeB = b.orario || (b as any).time || '';
        if (timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
        if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
          return a.order - b.order;
        }
        return a.titolo.localeCompare(b.titolo);
      });
      this.memoryCache.set(STORES.TAPPE, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura tappe:', err);
      return [];
    }
  }

  async getTappePerData(data: string): Promise<Tappa[]> {
    try {
      const all = await this.getTappe();
      return all.filter(t => t.data === data);
    } catch (err) {
      console.error('[StorageService] Errore lettura tappe per data:', err);
      return [];
    }
  }

  async addTappa(tappa: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Tappa> {
    assertCanMutate('tappe');
    const now = Date.now();
    const cleanDate = tappa.data || tappa.date || '';
    const dayId = tappa.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const targetId = tappa.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tappa_' + now);
    if (tappa.id && !await this.validateSaveAgainstTombstone('tappe', targetId, undefined)) {
      throw new Error(`Impossibile aggiungere la tappa: ID ${targetId} contrassegnato da tombstone attivo.`);
    }
    const rawTime = (tappa.orario || (tappa as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (tappa.noteCopilota || '').trim() || undefined;
    const cleanNotes = (tappa.nota || (tappa as any).notes || '').trim() || undefined;
    const rawSub = tappa.sottocategoria;
    const cleanSub = rawSub === 'Sosta fotografica' ? 'Spot fotografico' : (rawSub === 'Sosta' || rawSub === 'Sosta generica' ? 'Sosta tecnica' : (rawSub || 'Tappa'));
    const newTappa: Tappa = {
      ...tappa,
      sottocategoria: cleanSub,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: targetId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || tappa.copilota || undefined,
      createdAt: now,
      updatedAt: now
    };
    this.memoryCache.delete(STORES.TAPPE);
    await idbPut(STORES.TAPPE, newTappa);
    notifyDataChanged('tappe', 'save', newTappa);
    return newTappa;
  }

  async updateTappa(id: string, partial: Partial<Tappa>): Promise<void> {
    assertCanMutate('tappe');
    try {
      const existing = await idbGet<Tappa>(STORES.TAPPE, id);
      if (!existing) throw new Error(`Tappa con id ${id} non trovata`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const rawTime = partial.orario !== undefined 
        ? partial.orario 
        : (partial.time !== undefined ? partial.time : (existing.orario || (existing as any).time || ''));
      const effectiveTime = (typeof rawTime === 'string' ? rawTime.trim() : rawTime) || undefined;
      const cleanCopilot = partial.noteCopilota !== undefined ? (partial.noteCopilota || '').trim() || undefined : existing.noteCopilota;
      const cleanNotes = partial.nota !== undefined ? (partial.nota || '').trim() || undefined : ((partial as any).notes !== undefined ? ((partial as any).notes || '').trim() || undefined : (existing.nota || (existing as any).notes));
      const rawSub = partial.sottocategoria !== undefined ? partial.sottocategoria : existing.sottocategoria;
      const cleanSub = rawSub === 'Sosta fotografica' ? 'Spot fotografico' : (rawSub === 'Sosta' || rawSub === 'Sosta generica' ? 'Sosta tecnica' : (rawSub || 'Tappa'));
      const updated: Tappa = {
        ...existing,
        ...partial,
        sottocategoria: cleanSub,
        orario: effectiveTime,
        time: effectiveTime,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // Garantisce che l'ID primario non venga alterato
        noteCopilota: cleanCopilot,
        nota: cleanNotes,
        notes: cleanNotes,
        copilota: Boolean(cleanCopilot) || partial.copilota || existing.copilota || undefined,
        updatedAt: Date.now()
      };
      this.memoryCache.delete(STORES.TAPPE);
      await idbPut(STORES.TAPPE, updated);
      notifyDataChanged('tappe', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento tappa:', err);
      throw err;
    }
  }

  async saveTappa(tappa: Tappa): Promise<void> {
    assertCanMutate('tappe');
    const now = Date.now();
    const cleanDate = tappa.data || tappa.date || '';
    const dayId = tappa.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const rawTime = (tappa.orario || (tappa as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (tappa.noteCopilota || '').trim() || undefined;
    const cleanNotes = (tappa.nota || (tappa as any).notes || '').trim() || undefined;
    const rawSub = tappa.sottocategoria;
    const cleanSub = rawSub === 'Sosta fotografica' ? 'Spot fotografico' : (rawSub === 'Sosta' || rawSub === 'Sosta generica' ? 'Sosta tecnica' : (rawSub || 'Tappa'));
    const item: Tappa = {
      ...tappa,
      sottocategoria: cleanSub,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || tappa.copilota || undefined,
      createdAt: tappa.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('tappe', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.TAPPE);
    await idbPut(STORES.TAPPE, item);
    notifyDataChanged('tappe', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('tappe', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione tappe:', err);
    }
  }

  async deleteTappa(id: string): Promise<void> {
    assertCanMutate('tappe');
    this.memoryCache.delete(STORES.TAPPE);
    await this.recordTombstone('tappe', id);
    await idbDelete(STORES.TAPPE, id);
    notifyDataChanged('tappe', 'delete', { id });
  }

  // --- RISTORANTI ---
  async getRistoranti(): Promise<Ristorante[]> {
    try {
      if (this.memoryCache.has(STORES.RISTORANTI)) {
        return [...this.memoryCache.get(STORES.RISTORANTI)!];
      }
      const items = await idbGetAll<Ristorante>(STORES.RISTORANTI);
      const normalized = items.map(r => {
        const cleanCopilot = (r.noteCopilota || '').trim() || undefined;
      const cleanNotes = ((r as any).notes || r.nota || '').trim() || undefined;
      return {
        ...r,
        noteCopilota: cleanCopilot,
        notes: cleanNotes,
        nota: cleanNotes,
        copilota: Boolean(cleanCopilot) || r.copilota || undefined
      };
      });
      const sorted = normalized.sort((a, b) => {
        if (a.data && b.data) return ((a.data || '').split('-').length === 3 && (a.data || '').split('-')[0].length === 2 ? (a.data || '').split('-').reverse().join('-') : (a.data || '')).localeCompare(((b.data || '').split('-').length === 3 && (b.data || '').split('-')[0].length === 2 ? (b.data || '').split('-').reverse().join('-') : (b.data || '')));
        if (a.data) return -1;
        if (b.data) return 1;
        return a.nome.localeCompare(b.nome);
      });
      this.memoryCache.set(STORES.RISTORANTI, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura ristoranti:', err);
      return [];
    }
  }

  async getRistorantiPerData(data: string): Promise<Ristorante[]> {
    try {
      const all = await this.getRistoranti();
      return all.filter(r => r.data === data || r.date === data || r.dayId === `day_${data}`);
    } catch (err) {
      console.error('[StorageService] Errore lettura ristoranti per data:', err);
      return [];
    }
  }

  async addRistorante(ristorante: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Ristorante> {
    assertCanMutate('ristoranti');
    const now = Date.now();
    const cleanDate = ristorante.data || ristorante.date || '';
    const dayId = ristorante.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const targetId = ristorante.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ristorante_' + now);
    if (ristorante.id && !await this.validateSaveAgainstTombstone('ristoranti', targetId, undefined)) {
      throw new Error(`Impossibile aggiungere il ristorante: ID ${targetId} contrassegnato da tombstone attivo.`);
    }
    const rawTime = (ristorante.orario || (ristorante as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (ristorante.noteCopilota || '').trim() || undefined;
    const cleanNotes = (ristorante.nota || (ristorante as any).notes || '').trim() || undefined;
    const newRistorante: Ristorante = {
      ...ristorante,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: targetId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || ristorante.copilota || undefined,
      createdAt: now,
      updatedAt: now
    } as any;
    this.memoryCache.delete(STORES.RISTORANTI);
    await idbPut(STORES.RISTORANTI, newRistorante);
    notifyDataChanged('ristoranti', 'save', newRistorante);
    return newRistorante;
  }

  async updateRistorante(id: string, partial: Partial<Ristorante>): Promise<void> {
    assertCanMutate('ristoranti');
    try {
      const existing = await idbGet<Ristorante>(STORES.RISTORANTI, id);
      if (!existing) throw new Error(`Ristorante con id ${id} non trovato`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const rawTime = partial.orario !== undefined
        ? partial.orario
        : ((partial as any).time !== undefined ? (partial as any).time : (existing.orario || (existing as any).time || ''));
      const effectiveTime = (typeof rawTime === 'string' ? rawTime.trim() : rawTime) || undefined;
      const cleanCopilot = partial.noteCopilota !== undefined ? (partial.noteCopilota || '').trim() || undefined : existing.noteCopilota;
      const cleanNotes = partial.nota !== undefined ? (partial.nota || '').trim() || undefined : ((partial as any).notes !== undefined ? ((partial as any).notes || '').trim() || undefined : (existing.nota || (existing as any).notes));
      const updated: Ristorante = {
        ...existing,
        ...partial,
        orario: effectiveTime,
        time: effectiveTime,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // ID primario preservato
        noteCopilota: cleanCopilot,
        nota: cleanNotes,
        notes: cleanNotes,
        copilota: Boolean(cleanCopilot) || partial.copilota || existing.copilota || undefined,
        updatedAt: Date.now()
      } as any;
      this.memoryCache.delete(STORES.RISTORANTI);
      await idbPut(STORES.RISTORANTI, updated);
      notifyDataChanged('ristoranti', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento ristorante:', err);
      throw err;
    }
  }

  async saveRistorante(r: Ristorante): Promise<void> {
    assertCanMutate('ristoranti');
    const now = Date.now();
    const cleanDate = r.data || r.date || '';
    const dayId = r.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const rawTime = (r.orario || (r as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (r.noteCopilota || '').trim() || undefined;
    const cleanNotes = (r.nota || (r as any).notes || '').trim() || undefined;
    const item: Ristorante = {
      ...r,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || r.copilota || undefined,
      createdAt: r.createdAt || now,
      updatedAt: now
    } as any;
    if (!await this.validateSaveAgainstTombstone('ristoranti', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.RISTORANTI);
    await idbPut(STORES.RISTORANTI, item);
    notifyDataChanged('ristoranti', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('ristoranti', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione ristoranti:', err);
    }
  }

  async deleteRistorante(id: string): Promise<void> {
    assertCanMutate('ristoranti');
    this.memoryCache.delete(STORES.RISTORANTI);
    await this.recordTombstone('ristoranti', id);
    await idbDelete(STORES.RISTORANTI, id);
    notifyDataChanged('ristoranti', 'delete', { id });
  }

  // --- SHOPPING ---
  async getShopping(): Promise<Shopping[]> {
    try {
      if (this.memoryCache.has(STORES.SHOPPING)) {
        return [...this.memoryCache.get(STORES.SHOPPING)!];
      }
      const items = await idbGetAll<Shopping>(STORES.SHOPPING);
      const normalized = items.map(s => {
        const cleanCopilot = (s.noteCopilota || '').trim() || undefined;
      const cleanNotes = ((s as any).notes || s.nota || '').trim() || undefined;
      return {
        ...s,
        noteCopilota: cleanCopilot,
        notes: cleanNotes,
        nota: cleanNotes,
        copilota: Boolean(cleanCopilot) || s.copilota || undefined
      };
      });
      const sorted = normalized.sort((a, b) => {
        if (a.data && b.data) return ((a.data || '').split('-').length === 3 && (a.data || '').split('-')[0].length === 2 ? (a.data || '').split('-').reverse().join('-') : (a.data || '')).localeCompare(((b.data || '').split('-').length === 3 && (b.data || '').split('-')[0].length === 2 ? (b.data || '').split('-').reverse().join('-') : (b.data || '')));
        if (a.data) return -1;
        if (b.data) return 1;
        return a.nome.localeCompare(b.nome);
      });
      this.memoryCache.set(STORES.SHOPPING, sorted);
      return [...sorted];
    } catch (err) {
      console.error('[StorageService] Errore lettura shopping:', err);
      return [];
    }
  }

  async getShoppingPerData(data: string): Promise<Shopping[]> {
    try {
      const all = await this.getShopping();
      return all.filter(s => s.data === data || s.date === data || s.dayId === `day_${data}`);
    } catch (err) {
      console.error('[StorageService] Errore lettura shopping per data:', err);
      return [];
    }
  }

  async addShopping(shopping: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Shopping> {
    assertCanMutate('shopping');
    const now = Date.now();
    const cleanDate = shopping.data || shopping.date || '';
    const dayId = shopping.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const targetId = shopping.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shopping_' + now);
    if (shopping.id && !await this.validateSaveAgainstTombstone('shopping', targetId, undefined)) {
      throw new Error(`Impossibile aggiungere lo shopping: ID ${targetId} contrassegnato da tombstone attivo.`);
    }
    const rawTime = (shopping.orario || (shopping as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (shopping.noteCopilota || '').trim() || undefined;
    const cleanNotes = (shopping.nota || (shopping as any).notes || '').trim() || undefined;
    const newShopping: Shopping = {
      ...shopping,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: targetId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || shopping.copilota || undefined,
      createdAt: now,
      updatedAt: now
    } as any;
    this.memoryCache.delete(STORES.SHOPPING);
    await idbPut(STORES.SHOPPING, newShopping);
    notifyDataChanged('shopping', 'save', newShopping);
    return newShopping;
  }

  async updateShopping(id: string, partial: Partial<Shopping>): Promise<void> {
    assertCanMutate('shopping');
    try {
      const existing = await idbGet<Shopping>(STORES.SHOPPING, id);
      if (!existing) throw new Error(`Shopping con id ${id} non trovato`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const rawTime = partial.orario !== undefined
        ? partial.orario
        : ((partial as any).time !== undefined ? (partial as any).time : (existing.orario || (existing as any).time || ''));
      const effectiveTime = (typeof rawTime === 'string' ? rawTime.trim() : rawTime) || undefined;
      const cleanCopilot = partial.noteCopilota !== undefined ? (partial.noteCopilota || '').trim() || undefined : existing.noteCopilota;
      const cleanNotes = partial.nota !== undefined ? (partial.nota || '').trim() || undefined : ((partial as any).notes !== undefined ? ((partial as any).notes || '').trim() || undefined : (existing.nota || (existing as any).notes));
      const updated: Shopping = {
        ...existing,
        ...partial,
        orario: effectiveTime,
        time: effectiveTime,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // ID primario preservato
        noteCopilota: cleanCopilot,
        nota: cleanNotes,
        notes: cleanNotes,
        copilota: Boolean(cleanCopilot) || partial.copilota || existing.copilota || undefined,
        updatedAt: Date.now()
      } as any;
      this.memoryCache.delete(STORES.SHOPPING);
      await idbPut(STORES.SHOPPING, updated);
      notifyDataChanged('shopping', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento shopping:', err);
      throw err;
    }
  }

  async saveShopping(s: Shopping): Promise<void> {
    assertCanMutate('shopping');
    const now = Date.now();
    const cleanDate = s.data || s.date || '';
    const dayId = s.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const rawTime = (s.orario || (s as any).time || '').trim();
    const effectiveTime = rawTime || undefined;
    const cleanCopilot = (s.noteCopilota || '').trim() || undefined;
    const cleanNotes = (s.nota || (s as any).notes || '').trim() || undefined;
    const cleanAcconto = (s as any).acconto || (s as any).depositPaid || undefined;
    const item: Shopping = {
      ...s,
      acconto: cleanAcconto,
      depositPaid: cleanAcconto,
      budget: (s.budget || '').trim() || undefined,
      costo: (s as any).costo !== undefined ? (s as any).costo : (s as any).cost,
      cost: (s as any).cost !== undefined ? (s as any).cost : (s as any).costo,
      orario: effectiveTime,
      time: effectiveTime,
      data: cleanDate,
      date: cleanDate,
      dayId,
      noteCopilota: cleanCopilot,
      nota: cleanNotes,
      notes: cleanNotes,
      copilota: Boolean(cleanCopilot) || s.copilota || undefined,
      createdAt: s.createdAt || now,
      updatedAt: now
    } as any;
    if (!await this.validateSaveAgainstTombstone('shopping', item.id, item.createdAt)) {
      return;
    }
    this.memoryCache.delete(STORES.SHOPPING);
    await idbPut(STORES.SHOPPING, item);
    notifyDataChanged('shopping', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('shopping', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione shopping:', err);
    }
  }

  async deleteShopping(id: string): Promise<void> {
    assertCanMutate('shopping');
    this.memoryCache.delete(STORES.SHOPPING);
    await this.recordTombstone('shopping', id);
    await idbDelete(STORES.SHOPPING, id);
    notifyDataChanged('shopping', 'delete', { id });
  }

  // --- SPESE & BUDGET ---
  async getSpese(): Promise<Spesa[]> {
    try {
      const items = await idbGetAll<Spesa>(STORES.SPESE);
      return items.sort((a, b) => ((b.date || '').split('-').length === 3 && (b.date || '').split('-')[0].length === 2 ? (b.date || '').split('-').reverse().join('-') : (b.date || '')).localeCompare(((a.date || '').split('-').length === 3 && (a.date || '').split('-')[0].length === 2 ? (a.date || '').split('-').reverse().join('-') : (a.date || ''))));
    } catch (err) {
      console.error('[StorageService] Errore lettura spese:', err);
      return [];
    }
  }

  async saveSpesa(spesa: Spesa): Promise<void> {
    assertCanMutate('spese');
    const now = Date.now();
    const item: Spesa = {
      ...spesa,
      createdAt: spesa.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('spese', item.id, item.createdAt)) {
      return;
    }
    await idbPut(STORES.SPESE, item);
    notifyDataChanged('spese', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('spese', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione spese:', err);
    }
  }

  async deleteSpesa(id: string): Promise<void> {
    assertCanMutate('spese');
    await this.recordTombstone('spese', id);
    await idbDelete(STORES.SPESE, id);
    notifyDataChanged('spese', 'delete', { id });
  }

  async getTripBudget(): Promise<{ amount: number; updatedAt: number } | null> {
    try {
      const setting = await idbGet<{ id: string; amount: number; updatedAt: number }>(STORES.SETTINGS, 'trip_budget_goal');
      if (!setting || typeof setting.amount !== 'number') return null;
      return { amount: setting.amount, updatedAt: setting.updatedAt || Date.now() };
    } catch {
      return null;
    }
  }

  async saveTripBudget(amount: number | null): Promise<void> {
    try {
      if (amount === null) {
        await idbDelete(STORES.SETTINGS, 'trip_budget_goal');
      } else {
        await idbPut(STORES.SETTINGS, { id: 'trip_budget_goal', amount, updatedAt: Date.now() });
      }
      notifyDataChanged('settings', 'save', { key: 'trip_budget_goal', amount });
    } catch (err) {
      console.error('[StorageService] Errore salvataggio budget target:', err);
    }
  }

  // --- NOTE DI VIAGGIO (Post-it) ---
  async getNote(): Promise<NotaViaggio[]> {
    try {
      const records = await idbGetAll<NotaViaggio | Scadenza>(STORES.NOTE);
      const items = records.filter((item): item is NotaViaggio => item.recordKind !== 'scadenza');
      return items.sort((a, b) => {
        const orderA = Number.isFinite(a.order) ? Number(a.order) : null;
        const orderB = Number.isFinite(b.order) ? Number(b.order) : null;
        if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
        if (orderA !== null) return -1;
        if (orderB !== null) return 1;
        return normalizeTimestamp(b.updatedAt) - normalizeTimestamp(a.updatedAt);
      });
    } catch (err) {
      console.error('[StorageService] Errore lettura note:', err);
      return [];
    }
  }

  async saveNota(nota: NotaViaggio): Promise<void> {
    const now = Date.now();
    const item: NotaViaggio = {
      ...nota,
      createdAt: nota.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('note', item.id, item.createdAt)) {
      return;
    }
    await idbPut(STORES.NOTE, item);
    notifyDataChanged('note', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('note', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione note:', err);
    }
  }

  async reorderNote(noteIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(noteIds.filter(Boolean)));
    const now = Date.now();
    for (let index = 0; index < uniqueIds.length; index++) {
      const existing = await idbGet<NotaViaggio>(STORES.NOTE, uniqueIds[index]);
      if (!existing) continue;
      const updated: NotaViaggio = { ...existing, order: index, updatedAt: now + index };
      await idbPut(STORES.NOTE, updated);
      notifyDataChanged('note', 'save', updated);
    }
  }

  async deleteNota(id: string): Promise<void> {
    await this.recordTombstone('note', id);
    await idbDelete(STORES.NOTE, id);
    notifyDataChanged('note', 'delete', { id });
  }

  // --- SCADENZE (record tipizzati nella raccolta note, già autorizzata e sincronizzata) ---
  async getScadenze(): Promise<Scadenza[]> {
    try {
      const records = await idbGetAll<NotaViaggio | Scadenza>(STORES.NOTE);
      return sortDeadlines(records.filter((item): item is Scadenza => item.recordKind === 'scadenza'));
    } catch (err) {
      console.error('[StorageService] Errore lettura scadenze:', err);
      return [];
    }
  }

  async saveScadenza(scadenza: Scadenza): Promise<void> {
    assertCanMutate('note');
    const now = Date.now();
    const item: Scadenza = {
      ...scadenza,
      recordKind: 'scadenza',
      color: 'rose',
      createdAt: scadenza.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('note', item.id, item.createdAt)) return;
    await idbPut(STORES.NOTE, item);
    notifyDataChanged('note', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('note', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone scadenza:', err);
    }
  }

  async deleteScadenza(id: string): Promise<void> {
    assertCanMutate('note');
    await this.recordTombstone('note', id);
    await idbDelete(STORES.NOTE, id);
    notifyDataChanged('note', 'delete', { id });
  }

  // --- BACKUP & RIPRISTINO ---

  /** Esporta tutti i dati in una stringa JSON con metadati. */
  async exportAllData(): Promise<string> {
    const [giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese, routes, bagagli, note] = await Promise.all([
      idbGetAll<Giorno>(STORES.GIORNI),
      idbGetAll<Attivita>(STORES.ATTIVITA),
      idbGetAll<Alloggio>(STORES.ALLOGGI),
      idbGetAll<Trasporto>(STORES.TRASPORTI),
      idbGetAll<TravelDocument>(STORES.DOCUMENTI),
      idbGetAll<Tappa>(STORES.TAPPE),
      idbGetAll<Ristorante>(STORES.RISTORANTI),
      idbGetAll<Shopping>(STORES.SHOPPING),
      idbGetAll<Spesa>(STORES.SPESE),
      idbGetAll<RoutingCacheItem>(STORES.ROUTES),
      idbGetAll<Bagaglio>(STORES.BAGAGLI),
      idbGetAll<NotaViaggio>(STORES.NOTE),
    ]);

    // Include live_status e preferenze da localStorage per un backup a 360 gradi
    let liveStatus: Record<string, any> = {};
    if (typeof localStorage !== 'undefined') {
      try {
        liveStatus = {
          live_travel_status_message: localStorage.getItem('live_travel_status_message'),
          live_travel_status_updated_at: localStorage.getItem('live_travel_status_updated_at'),
          live_last_photo: localStorage.getItem('live_last_photo'),
          live_current_location: localStorage.getItem('live_current_location'),
          app_device_role: localStorage.getItem('app_device_role')
        };
      } catch (e) {
        console.warn('[StorageService] Errore lettura local storage per backup live:', e);
      }
    }

    const backup = {
      version: 1,
      tripId: this.getCurrentTripId(),
      exportedAt: new Date().toISOString(),
      data: { giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese, routes, bagagli, note },
      live_status: liveStatus
    };
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Importa dati da una stringa JSON.
   * Valida la struttura, svuota gli store e reinserisce i dati.
   * Restituisce true se l'importazione ha avuto successo.
   */
  async importAllData(jsonString: string): Promise<boolean> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('File JSON non valido o corrotto.');
    }

    // Validazione struttura minima
    if (
      typeof parsed !== 'object' || parsed === null ||
      !('version' in parsed) || !('data' in parsed)
    ) {
      throw new Error('Formato backup non riconosciuto (campi version/data mancanti).');
    }

    const backup = parsed as { version: number; tripId?: string; data: Record<string, unknown[]>; live_status?: Record<string, any> };
    if (backup.version !== 1) {
      throw new Error(`Versione backup non supportata (trovata: ${backup.version}, attesa: 1).`);
    }

    if (this.getCurrentTripId() === MASTER_TRIP_ID && backup.tripId && backup.tripId !== MASTER_TRIP_ID) {
      throw new Error(`Operazione bloccata: impossibile importare un backup del viaggio "${backup.tripId}" all'interno del viaggio protetto 0000.`);
    }

    const { data, live_status } = backup;
    if (!data || typeof data !== 'object') {
      throw new Error('Struttura dati del backup non valida.');
    }

    // Svuota e reinserisci per ogni store dopo pre-validazione
    const stores = [
      { key: 'giorni', store: STORES.GIORNI },
      { key: 'attivita', store: STORES.ATTIVITA },
      { key: 'alloggi', store: STORES.ALLOGGI },
      { key: 'trasporti', store: STORES.TRASPORTI },
      { key: 'documenti', store: STORES.DOCUMENTI },
      { key: 'tappe', store: STORES.TAPPE },
      { key: 'ristoranti', store: STORES.RISTORANTI },
      { key: 'shopping', store: STORES.SHOPPING },
      { key: 'spese', store: STORES.SPESE },
      { key: 'routes', store: STORES.ROUTES },
      { key: 'bagagli', store: STORES.BAGAGLI },
      { key: 'note', store: STORES.NOTE },
    ] as const;

    // FASE 1: Pre-validazione, sanificazione e filtraggio tombstone in memoria (staging)
    // Se la struttura generale è corrotta o contiene elementi non validi, non tocchiamo né svuotiamo alcuno store IndexedDB!
    const stagedData = new Map<string, any[]>();

    for (const { key } of stores) {
      const rawList = (data as Record<string, unknown>)[key];
      if (rawList === undefined || rawList === null) {
        continue;
      }
      if (!Array.isArray(rawList)) {
        console.warn(`[StorageService] importAllData: Valore non array per store "${key}", saltato.`);
        continue;
      }

      const validItems: any[] = [];
      for (const item of rawList) {
        // 1. Validazione tipo: deve essere un oggetto valido (non null, non primitivo, non array)
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          console.warn(`[StorageService] importAllData: Scartato elemento non valido in "${key}" (non è un oggetto):`, item);
          continue;
        }

        // 2. Validazione chiave primaria obbligatoria (keyPath 'id' deve essere una stringa non vuota)
        const itemObj = item as Record<string, any>;
        if (!itemObj.id || typeof itemObj.id !== 'string' || itemObj.id.trim() === '') {
          console.warn(`[StorageService] importAllData: Scartato elemento in "${key}" senza ID valido:`, itemObj);
          continue;
        }

        // 3. Controllo tombstone attivo
        const isAllowed = await this.validateSaveAgainstTombstone(key, itemObj.id, itemObj.createdAt);
        if (!isAllowed) {
          console.warn(`[StorageService] importAllData: Scartato elemento ${key}/${itemObj.id} da backup perché contrassegnato da tombstone.`);
          continue;
        }

        validItems.push(itemObj);
      }

      stagedData.set(key, validItems);
    }

    // FASE 2: Applicazione sequenziale agli store IndexedDB
    // Nota architetturale: il ripristino è sequenziale per singolo store e non costituisce una singola transazione atomica multi-store.
    for (const { key, store } of stores) {
      if (!stagedData.has(key)) {
        continue; // Se lo store non era presente o valido nel backup, preserva i dati locali esistenti
      }
      const validItems = stagedData.get(key) || [];

      // Svuota i record correnti dello store
      const existing = await idbGetAll<{ id: string }>(store);
      for (const item of existing) {
        await idbDelete(store, item.id);
      }

      // Inserisci gli elementi pre-validati
      for (const item of validItems) {
        await idbPut(store, item);
      }
    }

    // Ripristina live status se presente
    if (live_status && typeof localStorage !== 'undefined') {
      try {
        if (live_status.live_travel_status_message) localStorage.setItem('live_travel_status_message', live_status.live_travel_status_message);
        if (live_status.live_travel_status_updated_at) localStorage.setItem('live_travel_status_updated_at', live_status.live_travel_status_updated_at);
        if (live_status.live_last_photo) localStorage.setItem('live_last_photo', live_status.live_last_photo);
        if (live_status.live_current_location) localStorage.setItem('live_current_location', live_status.live_current_location);
        if (live_status.app_device_role) localStorage.setItem('app_device_role', live_status.app_device_role);
      } catch (e) {
        console.warn('[StorageService] Errore ripristino live_status in local storage:', e);
      }
    }

    notifyDataChanged('all', 'save');
    return true;
  }

  // --- TIMELINE OGGI ---
  async getTimelineForDate(dateStr: string): Promise<import('../types').TimelineItem[]> {
    try {
      const [days, allActivities, transports, tappe, ristoranti, shoppingList, accommodations] = await Promise.all([
        this.getDays(),
        this.getActivities(), // Prendi tutte le attività per filtraggio tollerante
        this.getTransports(),
        this.getTappe(),
        this.getRistoranti(),
        this.getShopping(),
        this.getAccommodations()
      ]);
      const day = days.find(d => d.date === dateStr);
      
      // 1. Filtra le attività includendo tutti gli elementi che soddisfano:
      // item.dayId === day?.id || item.dayId === 'day_' + dateStr || item.date === dateStr
      const activities = allActivities.filter(a => {
        if (day && a.dayId === day.id) return true;
        if (a.dayId === `day_${dateStr}`) return true;
        if (a.date === dateStr) return true;
        return false;
      });
      
      // 2. Filtra Trasporti: data di partenza corrispondente a targetDate
      // oppure volo notturno / noleggio continuativo che include targetDate
      // oppure volo con scalo (layover) che attraversa o riparte in questa data
      const dayTransports = transports.filter(t => {
        if (t.date === dateStr) return true;
        if (t.arrivalDate === dateStr) return true;
        
        // Noleggi (pickupDate = t.date, dropoffDate = t.dropoffDate)
        if (t.dropoffDate && t.date && t.date < dateStr && t.dropoffDate >= dateStr) return true;
        
        // Scali multi-tratta o voli notturni
        if (t.layover) {
           // Giorno di arrivo finale
           if (t.layover.arrivalDate === dateStr) return true;
           // Giorno di ripartenza (non serve più una card separata, ma per sicurezza filtriamo)
           if (t.layover.departureDate === dateStr) return true;
           // Giorno intermedio
           if (t.layover.departureDate && t.date < dateStr && t.layover.departureDate > dateStr) return true;
        }
        return false;
      });

      // 3. Filtra Tappe: data corrispondente o dayId 'day_' + dateStr
      const dayTappe = tappe.filter(t => {
        if (t.data === dateStr || t.date === dateStr) return true;
        if (t.dayId === `day_${dateStr}`) return true;
        if (day && t.dayId === day.id) return true;
        return false;
      });

      // 4. Filtra Ristoranti: data corrispondente o dayId 'day_' + dateStr
      const dayRistoranti = ristoranti.filter(r => {
        if (r.data === dateStr || r.date === dateStr) return true;
        if (r.dayId === `day_${dateStr}`) return true;
        if (day && r.dayId === day.id) return true;
        return false;
      });

      // 5. Filtra Shopping: data corrispondente o dayId 'day_' + dateStr
      const dayShopping = shoppingList.filter(s => {
        if (s.data === dateStr || s.date === dateStr) return true;
        if (s.dayId === `day_${dateStr}`) return true;
        if (day && s.dayId === day.id) return true;
        return false;
      });

      // 6. Alloggi Notturni: l'alloggio deve comparire nella serata se targetDate >= checkIn && targetDate < checkOut
      // oppure se checkIn === targetDate (checkIn day)
      const dayAccommodations = accommodations.filter(acc => {
        if (!acc.checkIn) return false;
        if (acc.checkOut) {
          return dateStr >= acc.checkIn && dateStr < acc.checkOut;
        }
        return acc.checkIn === dateStr;
      });
      
      const timeline: import('../types').TimelineItem[] = [];
      
      // Trasporti del giorno e segmenti volo
      dayTransports.forEach(t => {
        const isRental = t.type === 'auto' || t.type === 'camper';
        const isShortTransfer = t.type === 'transfer' || t.type === 'taxi';
        
        if (isRental) {
          // Giorno di ritiro -> Card completa
          if (t.date === dateStr) {
            const pickupCoord = t.coordinate || (t.departureLocation ? lookupKnownCoordinate(t.departureLocation) : undefined) || undefined;
            timeline.push({
              id: `${t.id}_pickup`,
              type: 'trasporto',
              time: t.departureTime || '',
              title: `Ritiro ${t.type === 'camper' ? 'camper' : 'auto'}${t.carrier ? ` (${t.carrier.split('(')[0].trim()})` : ''}`,
              location: t.departureLocation || '',
              categoryOrType: t.type,
              copilota: t.copilota,
              completed: t.completed,
              noteCopilota: t.noteCopilota,
              coordinate: pickupCoord,
              originalData: t,
              displayMode: 'full',
              effectiveDate: t.date,
              physicalLocation: true
            });
          } 
          // Giorno di riconsegna -> Card completa o compatta
          else if (t.dropoffDate === dateStr) {
            const dropoffLoc = t.dropoffLocation || t.arrivalLocation || '';
            const dropoffCoord = t.dropoffCoordinate || (dropoffLoc ? lookupKnownCoordinate(dropoffLoc) : undefined) || undefined;
            timeline.push({
              id: `${t.id}_dropoff`,
              type: 'trasporto',
              time: t.dropoffTime || t.arrivalTime || '',
              title: `Riconsegna ${t.type === 'camper' ? 'camper' : 'auto'}${t.carrier ? ` (${t.carrier.split('(')[0].trim()})` : ''}`,
              location: dropoffLoc,
              categoryOrType: t.type,
              copilota: t.copilota,
              completed: t.completed,
              noteCopilota: t.noteCopilota,
              coordinate: dropoffCoord,
              originalData: t,
              displayMode: 'full',
              effectiveDate: t.dropoffDate,
              physicalLocation: true
            });
          } 
          // Giorni intermedi -> Solo stato
          else if (dateStr > t.date && (!t.dropoffDate || dateStr < t.dropoffDate)) {
            timeline.push({
              id: `${t.id}_state`,
              type: 'trasporto',
              time: '',
              title: '',
              location: '',
              categoryOrType: t.type,
              originalData: t,
              displayMode: 'state',
              effectiveDate: dateStr,
              informational: true,
              physicalLocation: false,
              stateLabel: `${t.type === 'auto' ? '🚗' : '🚐'} Veicolo attivo: ${t.carrier?.split('(')[0]?.trim() || 'Veicolo'} • Riconsegna il ${t.dropoffDate ? formatDateIT(t.dropoffDate) : '...'} a ${t.dropoffLocation?.split('(')[0]?.trim() || t.arrivalLocation || 'destinazione'}`
            });
          }
          return;
        }
        
        // --- VOLI E ALTRI TRASPORTI ---
        
        // 1. Partenza (genera un'unica card principale nel giorno di partenza)
        if (t.date === dateStr) {
          const departureTime = t.departureTime || '';
          const timeStatus = t.timeStatus || (departureTime ? 'confermato' : 'non_specificato');
          timeline.push({
            id: t.id,
            type: 'trasporto',
            time: departureTime,
            timeStatus,
            timeIsDefault: timeStatus === 'indicativo' || !departureTime,
            title: t.carrier ? `${t.type.toUpperCase()} • ${t.carrier}` : t.type.toUpperCase(),
            location: t.departureLocation ? `${t.departureLocation} ➔ ${t.arrivalLocation}` : t.arrivalLocation,
            categoryOrType: t.type,
            copilota: t.copilota,
            completed: t.completed,
            noteCopilota: t.noteCopilota,
            coordinate: t.coordinate,
            originalData: t,
            displayMode: isShortTransfer ? 'compact' : 'full',
            effectiveDate: t.date,
            segmentContext: 'leg1',
            physicalLocation: true
          });
        }
        
        // 2. Arrivi notturni / multi-giorno (crea un item compatto nel giorno di arrivo)
        const finalArrivalDate = t.layover?.arrivalDate || t.arrivalDate || t.date;
        const layoverDepartureDate = t.layover?.departureDate;

        // Se la tratta cade nel giorno dello scalo
        if (t.layover && (t.arrivalDate === dateStr || layoverDepartureDate === dateStr)) {
             timeline.push({
               id: `${t.id}_state`,
               type: 'trasporto',
               time: t.layover.departureTime || t.layover.arrivalTime || '',
               title: '',
               location: '',
               categoryOrType: 'scalo',
               originalData: t,
               displayMode: 'state',
               effectiveDate: dateStr,
               segmentContext: 'scalo',
               informational: true,
               physicalLocation: false,
               stateLabel: `🛬 Scalo a ${t.layover.airport.split(' ')[0]} ${t.layover.duration ? `• Attesa ${t.layover.duration}` : ''}`
             });
        }
        // L'arrivo finale e' un evento autonomo: non deve essere sostituito dal banner di scalo.
        if (finalArrivalDate === dateStr && finalArrivalDate !== t.date) {
             timeline.push({
               id: `${t.id}_arrival`,
               type: 'trasporto',
               time: t.layover?.arrivalTime || t.arrivalTime || '',
               title: `Arrivo a ${t.arrivalLocation}`,
               location: `Da ${t.departureLocation}`,
               categoryOrType: t.type,
               completed: t.completed,
               copilota: t.copilota,
               noteCopilota: t.noteCopilota,
               coordinate: t.coordinate,
               originalData: t,
               displayMode: 'compact',
               effectiveDate: finalArrivalDate,
               segmentContext: 'arrival',
               physicalLocation: true
             });
        }
        
        // 3. Stati intermedi di scalo (giorni interi passati in aeroporto senza voli)
        if (t.layover && t.layover.departureDate) {
           if (dateStr > t.date && dateStr < t.layover.departureDate) {
              timeline.push({
                id: `${t.id}_state`,
                type: 'trasporto',
                time: '',
                title: '',
                location: '',
                categoryOrType: 'scalo',
                originalData: t,
                displayMode: 'state',
                effectiveDate: dateStr,
                segmentContext: 'scalo',
                informational: true,
                physicalLocation: false,
                stateLabel: `⏳ In scalo a ${t.layover.airport.split(' ')[0]}`
              });
           }
        }
      });

      // Tappe programmate per la data:
      // se una tappa è subordinata a una Passeggiata del giorno, viene raggruppata come figlia
      // ed esclusa dalle card autonome di primo livello (evitando duplicazioni nella timeline).
      const childTappeMap = new Map<string, Tappa[]>();
      const standaloneTappe: Tappa[] = [];

      dayTappe.forEach(t => {
        if (t.passeggiataId && activities.some(a => a.id === t.passeggiataId)) {
          const list = childTappeMap.get(t.passeggiataId) || [];
          list.push(t);
          childTappeMap.set(t.passeggiataId, list);
        } else {
          standaloneTappe.push(t);
        }
      });

      // Associa le tappe figlie ordinate cronologicamente all'attività genitore
      childTappeMap.forEach((list, parentId) => {
        list.sort((a, b) => {
          const timeA = a.orario || (a as any).time || '';
          const timeB = b.orario || (b as any).time || '';
          if (timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
          if (a.order !== undefined && b.order !== undefined && a.order !== b.order) return a.order - b.order;
          return (a.titolo || '').localeCompare(b.titolo || '');
        });
        const parentAct = activities.find(a => a.id === parentId);
        if (parentAct) {
          parentAct.childTappe = list;
        }
      });

      // Tappe autonome di primo livello
      standaloneTappe.forEach(t => {
        const time = t.orario || (t as any).time || '';
        const timeStatus = t.timeStatus || (time ? 'indicativo' : 'non_specificato');
        timeline.push({
          id: t.id,
          type: 'tappa',
          time,
          timeStatus,
          timeIsDefault: timeStatus === 'indicativo' || !time,
          title: t.titolo,
          location: t.indirizzo || t.titolo,
          categoryOrType: 'tappa',
          copilota: t.copilota,
          completed: t.completed,
          noteCopilota: t.noteCopilota,
          coordinate: t.coordinate,
          originalData: t,
          effectiveDate: dateStr,
          sortOrder: t.order,
          physicalLocation: true
        });
      });

      // Attività
      activities.forEach(a => {
        const time = a.time || a.orarioInizio || a.orarioRitrovo || '';
        const timeStatus = a.timeStatus || (time ? (a.status === 'prenotato' ? 'confermato' : 'indicativo') : 'non_specificato');
        timeline.push({
          id: a.id,
          type: 'attivita',
          time,
          timeStatus,
          timeIsDefault: timeStatus === 'indicativo' || !time,
          title: a.title,
          location: a.location,
          categoryOrType: a.category,
          copilota: a.copilota,
          completed: a.completed,
          noteCopilota: a.noteCopilota,
          coordinate: a.coordinate,
          originalData: a,
          effectiveDate: a.date || dateStr,
          physicalLocation: true
        });
      });

      // Prenotazioni Ristoranti
      dayRistoranti.forEach(r => {
        const time = r.orario || '';
        const timeStatus = r.timeStatus || (time ? 'indicativo' : 'non_specificato');
        timeline.push({
          id: r.id,
          type: 'ristorante',
          time: r.orario || '',
          timeStatus,
          timeIsDefault: timeStatus === 'indicativo' || !time,
          title: r.nome,
          location: r.indirizzo || r.nome,
          categoryOrType: 'ristorante',
          copilota: r.copilota,
          completed: r.completed,
          noteCopilota: r.noteCopilota,
          coordinate: r.coordinate,
          originalData: r,
          effectiveDate: r.data || r.date || dateStr,
          physicalLocation: true
        });
      });

      // Shopping & Acquisti
      dayShopping.forEach(s => {
        const time = s.orario || '';
        const timeStatus = s.timeStatus || (time ? 'indicativo' : 'non_specificato');
        timeline.push({
          id: s.id,
          type: 'shopping',
          time,
          timeStatus,
          timeIsDefault: timeStatus === 'indicativo' || !time,
          title: s.nome,
          location: s.indirizzo || s.nome,
          categoryOrType: 'shopping',
          copilota: s.copilota,
          completed: s.completed,
          noteCopilota: s.noteCopilota,
          coordinate: s.coordinate,
          originalData: s,
          effectiveDate: s.data || s.date || dateStr,
          physicalLocation: true
        });
      });

      // Alloggi notturni (singolo promemoria a fine giornata alle 21:00)
      const seenAccIds = new Set<string>();
      dayAccommodations.forEach(acc => {
        if (!seenAccIds.has(acc.id)) {
          seenAccIds.add(acc.id);
          const time = acc.arrivalTime || acc.checkInTime || '';
          const timeStatus = acc.timeStatus || (time ? 'indicativo' : 'non_specificato');
          timeline.push({
            id: acc.id,
            type: 'alloggio',
            time,
            timeStatus,
            timeIsDefault: timeStatus === 'indicativo' || !time,
            title: `Pernottamento presso: ${acc.name}`,
            location: acc.address || acc.location,
            categoryOrType: 'alloggio',
            completed: acc.completed,
            copilota: acc.copilota,
            noteCopilota: acc.noteCopilota,
            coordinate: undefined,
            originalData: acc,
            effectiveDate: dateStr,
            informational: true,
            physicalLocation: false
          });
        }
      });
      
      // Deduplicazione stringente per item.id complessivo
      const uniqueMap = new Map<string, import('../types').TimelineItem>();
      timeline.forEach(item => {
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      });

      const merged = Array.from(uniqueMap.values()).sort(compareTimelineItems);
      
      return merged;
    } catch (err) {
      console.error('[StorageService] Errore lettura timeline:', err);
      return [];
    }
  }

  // --- BAGAGLI ---
  async getBagagli(): Promise<Bagaglio[]> {
    try {
      const items = await idbGetAll<Bagaglio>(STORES.BAGAGLI);
      return items.sort((a, b) => normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt));
    } catch (err) {
      console.error('[StorageService] Errore lettura bagagli:', err);
      return [];
    }
  }

  async saveBagaglio(bagaglio: Bagaglio): Promise<void> {
    assertCanMutate('bagagli');
    const now = Date.now();
    const item: Bagaglio = {
      ...bagaglio,
      createdAt: bagaglio.createdAt || now,
      updatedAt: now
    };
    if (!await this.validateSaveAgainstTombstone('bagagli', item.id, item.createdAt)) {
      return;
    }
    await idbPut(STORES.BAGAGLI, item);
    notifyDataChanged('bagagli', 'save', item);
    try {
      await this.removeTombstoneIfRecreated('bagagli', item.id, item.createdAt);
    } catch (err) {
      console.warn('[StorageService] Errore rimozione tombstone post-ricreazione bagagli:', err);
    }
  }

  async deleteBagaglio(id: string): Promise<void> {
    assertCanMutate('bagagli');
    await this.recordTombstone('bagagli', id);
    await idbDelete(STORES.BAGAGLI, id);
    notifyDataChanged('bagagli', 'delete', { id });
  }

  async toggleBagaglioVerificato(id: string): Promise<void> {
    assertCanMutate('bagagli');
    try {
      const item = await idbGet<Bagaglio>(STORES.BAGAGLI, id);
      if (item) {
        const updated: Bagaglio = {
          ...item,
          verificato: !item.verificato,
          updatedAt: Date.now()
        };
        await idbPut(STORES.BAGAGLI, updated);
        notifyDataChanged('bagagli', 'save', updated);
      }
    } catch (err) {
      console.error('[StorageService] Errore toggle bagaglio verificato:', err);
    }
  }

  // Device Role Management ('guida' | 'copilota' | 'viewer')
  getDeviceRole(): DeviceRole {
    if (typeof window === 'undefined') return 'viewer';
    try {
      const role = (localStorage.getItem('houni_device_role') || localStorage.getItem('app_device_role')) as DeviceRole | null;
      if (role === 'guida' || role === 'copilota' || role === 'viewer') {
        return role;
      }
      return 'viewer';
    } catch {
      return 'viewer';
    }
  }

  setDeviceRole(role: DeviceRole): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('houni_device_role', role);
      localStorage.setItem('app_device_role', role);
      idbPut(STORES.SETTINGS, { id: 'device_role_backup', value: role }).catch(() => {});
      // Dispatch custom event to notify listeners across the app
      window.dispatchEvent(new CustomEvent('device_role_changed', { detail: { role } }));
    } catch (e) {
      console.error('[StorageService] Errore salvataggio device role:', e);
    }
  }

  getOrCreateDeviceId(): string {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return 'node-device-id';
    }
    let deviceId = localStorage.getItem('houni_device_id');
    if (!deviceId || deviceId.trim() === '') {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        deviceId = crypto.randomUUID();
      } else {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      }
      localStorage.setItem('houni_device_id', deviceId);
    }
    return deviceId;
  }

  // --- SEED ATTIVITÀ REALI ---
  async seedRealActivities(): Promise<void> {
    return;
  }

}

export const storageService = new StorageService();

// Esposto globalmente per chiamare `window.storageService.seedRealActivities()` da console
if (typeof window !== 'undefined') {
  (window as any).storageService = storageService;
}
