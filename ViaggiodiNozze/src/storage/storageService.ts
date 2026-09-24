import type { Giorno, Attivita, Alloggio, Trasporto } from '../types';
import {
  STORES,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear
} from './indexedDB';
import { SEED_TRANSPORTS } from './seedTransports';

/**
 * Servizio di persistenza locale astratto.
 * La UI interagisce esclusivamente con questa interfaccia asincrona,
 * garantendo che l'implementazione del database locale possa essere sostituita
 * o estesa per sincronizzazione remota senza intaccare i componenti.
 */
class StorageService {
  // --- GIORNI ---
  async getDays(): Promise<Giorno[]> {
    try {
      const items = await idbGetAll<Giorno>(STORES.GIORNI);
      return items.sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      console.error('[StorageService] Errore lettura giorni:', err);
      return [];
    }
  }

  async saveDay(day: Giorno): Promise<void> {
    const now = Date.now();
    const item: Giorno = {
      ...day,
      createdAt: day.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.GIORNI, item);
  }

  async deleteDay(id: string): Promise<void> {
    await idbDelete(STORES.GIORNI, id);
    try {
      const activities = await this.getActivities(id);
      for (const act of activities) {
        await this.deleteActivity(act.id);
      }
    } catch (err) {
      console.warn('[StorageService] Pulizia attività a cascata parziale:', err);
    }
  }

  // --- ATTIVITA ---
  async getActivities(dayId?: string): Promise<Attivita[]> {
    try {
      const items = await idbGetAll<Attivita>(STORES.ATTIVITA);
      const filtered = dayId ? items.filter(a => a.dayId === dayId) : items;
      return filtered.sort((a, b) => {
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
    const now = Date.now();
    const item: Attivita = {
      ...activity,
      createdAt: activity.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.ATTIVITA, item);
  }

  async deleteActivity(id: string): Promise<void> {
    await idbDelete(STORES.ATTIVITA, id);
  }

  // --- ALLOGGI ---
  async getAccommodations(): Promise<Alloggio[]> {
    try {
      const items = await idbGetAll<Alloggio>(STORES.ALLOGGI);
      return items.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    } catch (err) {
      console.error('[StorageService] Errore lettura alloggi:', err);
      return [];
    }
  }

  async saveAccommodation(acc: Alloggio): Promise<void> {
    const now = Date.now();
    const item: Alloggio = {
      ...acc,
      createdAt: acc.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.ALLOGGI, item);
  }

  async deleteAccommodation(id: string): Promise<void> {
    await idbDelete(STORES.ALLOGGI, id);
  }

  // --- TRASPORTI ---
  async seedTransports(force = false): Promise<void> {
    try {
      const existing = await idbGetAll<Trasporto>(STORES.TRASPORTI);
      const SEED_VERSION = 'v5_mobile_timeline_euro';
      const migrationVersion = typeof localStorage !== 'undefined' ? localStorage.getItem('trasporti_seed_ver') : null;
      const needsMigration = migrationVersion !== SEED_VERSION;

      // Rileva automaticamente se sono presenti dati mockup o versioni obsolete
      const hasMockData = existing.some(t =>
        t.date?.startsWith('2026-10') ||
        (t.carrier && (t.carrier.includes('Qatar') || t.carrier.includes('Apex'))) ||
        (t.notes && t.notes.includes('Doha')) ||
        existing.length !== SEED_TRANSPORTS.length
      );

      if (existing.length === SEED_TRANSPORTS.length && !force && !hasMockData && !needsMigration) return;

      // Svuotamento completo e atomico di IndexedDB per trasporti
      await idbClear(STORES.TRASPORTI);

      const now = Date.now();
      for (const item of SEED_TRANSPORTS) {
        await idbPut(STORES.TRASPORTI, {
          ...item,
          createdAt: now,
          updatedAt: now
        });
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('trasporti_seed_ver', SEED_VERSION);
      }
    } catch (err) {
      console.error('[StorageService] Errore durante il seeding dei trasporti:', err);
    }
  }

  async getTransports(): Promise<Trasporto[]> {
    try {
      await this.seedTransports();
      const items = await idbGetAll<Trasporto>(STORES.TRASPORTI);
      return items.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        if (a.departureTime && b.departureTime) return a.departureTime.localeCompare(b.departureTime);
        return 0;
      });
    } catch (err) {
      console.error('[StorageService] Errore lettura trasporti:', err);
      return [];
    }
  }

  async saveTransport(transport: Trasporto): Promise<void> {
    const now = Date.now();
    const item: Trasporto = {
      ...transport,
      createdAt: transport.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.TRASPORTI, item);
  }

  async deleteTransport(id: string): Promise<void> {
    await idbDelete(STORES.TRASPORTI, id);
  }

  // --- BACKUP & RIPRISTINO ---

  /** Esporta tutti i dati in una stringa JSON con metadati. */
  async exportAllData(): Promise<string> {
    const [giorni, attivita, alloggi, trasporti] = await Promise.all([
      idbGetAll<Giorno>(STORES.GIORNI),
      idbGetAll<Attivita>(STORES.ATTIVITA),
      idbGetAll<Alloggio>(STORES.ALLOGGI),
      idbGetAll<Trasporto>(STORES.TRASPORTI),
    ]);
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { giorni, attivita, alloggi, trasporti },
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

    const backup = parsed as { version: number; data: Record<string, unknown[]> };
    if (backup.version !== 1) {
      throw new Error(`Versione backup non supportata (trovata: ${backup.version}, attesa: 1).`);
    }

    const { data } = backup;
    if (!data || typeof data !== 'object') {
      throw new Error('Struttura dati del backup non valida.');
    }

    // Svuota e reinserisci per ogni store
    const stores = [
      { key: 'giorni', store: STORES.GIORNI },
      { key: 'attivita', store: STORES.ATTIVITA },
      { key: 'alloggi', store: STORES.ALLOGGI },
      { key: 'trasporti', store: STORES.TRASPORTI },
    ] as const;

    for (const { key, store } of stores) {
      const items = Array.isArray(data[key]) ? data[key] : [];
      // Elimina tutti gli esistenti
      const existing = await idbGetAll<{ id: string }>(store);
      for (const item of existing) {
        await idbDelete(store, item.id);
      }
      // Reinserisci dal backup
      for (const item of items) {
        await idbPut(store, item);
      }
    }

    return true;
  }
}

export const storageService = new StorageService();
