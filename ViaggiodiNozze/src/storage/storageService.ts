import type { Giorno, Attivita, Alloggio, Trasporto } from '../types';
import {
  STORES,
  idbGetAll,
  idbPut,
  idbDelete
} from './indexedDB';

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
  async getTransports(): Promise<Trasporto[]> {
    try {
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
}

export const storageService = new StorageService();
