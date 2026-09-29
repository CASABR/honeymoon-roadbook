import type { Giorno, Attivita, Alloggio, Trasporto, TravelDocument, RoutingCacheItem, Tappa, Ristorante, Shopping, Spesa, DeviceRole } from '../types';
import {
  STORES,
  idbGetAll,
  idbGet,
  idbPut,
  idbDelete
} from './indexedDB';
import { SEED_TRANSPORTS } from './seedTransports';

export const SEED_FLAG_KEY = 'honeymoon_roadbook_seeded_v1';

export const DEFAULT_DOCUMENTS: TravelDocument[] = [
  {
    id: 'doc_assicurazione',
    category: 'assicurazione',
    title: 'Polizza Assicurazione Viaggio',
    description: 'Polizza Europ Assistance Viaggi No-Stop, massimale illimitato spese mediche e assistenza h24.',
    status: 'Valido',
    validity: 'Valida per l\'intero viaggio (28 Nov 2026 – 12 Gen 2027)',
    attachments: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'doc_passaporti',
    category: 'passaporto',
    title: 'Passaporti Elettronici (Sposo & Sposa)',
    description: 'Scansioni dei passaporti biometrici validi per espatrio con scadenza superiore a 6 mesi.',
    status: 'Valido',
    validity: 'Validi (> 6 mesi oltre il rientro, fino al 2036)',
    attachments: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'doc_visto_nzeta',
    category: 'visto',
    title: 'Visto NZeTA + Tassa IVL (Nuova Zelanda)',
    description: 'Autorizzazione elettronica di viaggio e conservazione turistica per ingresso in Nuova Zelanda.',
    status: 'Valido',
    validity: 'Valido 2 anni (ingressi multipli)',
    attachments: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'doc_visto_australia',
    category: 'visto',
    title: 'Visto eVisitor Subclass 651 (Australia)',
    description: 'Visto turistico australiano collegato al passaporto europeo, valido 12 mesi.',
    status: 'Valido',
    validity: 'Valido 12 mesi (max 3 mesi per soggiorno)',
    attachments: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'doc_visto_filippine',
    category: 'visto',
    title: 'Registrazione eTravel (Filippine)',
    description: 'QR Code eTravel da compilare nelle 72 ore precedenti il volo per le Filippine.',
    status: 'Da richiedere',
    validity: 'Da compilare 72 ore prima del volo (Dicembre 2026)',
    attachments: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'doc_patente',
    category: 'patente',
    title: 'Patente Internazionale di Guida (IDP)',
    description: 'Permesso internazionale di guida convenzione Ginevra 1949 / Vienna 1968 per campervan e auto.',
    status: 'Valido',
    validity: 'Valida 1 anno (Convenzione Ginevra 1949)',
    attachments: [],
    updatedAt: new Date().toISOString()
  }
];

export function notifyDataChanged(entityType: string, action: 'save' | 'delete', data?: any): void {
  if (typeof window === 'undefined') return;
  try {
    // 1. Evento specifico retrocompatibile
    window.dispatchEvent(new CustomEvent(`${entityType}_updated`, { detail: { action, data } }));
    // 2. Evento globale unificato per tutte le viste
    window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { entityType, action, data } }));
  } catch (err) {
    console.error('[StorageService] Errore dispatching notifyDataChanged:', err);
  }
}

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
    notifyDataChanged('giorni', 'save', item);
  }

  async deleteDay(id: string): Promise<void> {
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

  /**
   * Seeding iniziale dei dati mock/default (tappe, attività, trasporti, documenti).
   * Viene eseguito ESCLUSIVAMENTE se e solo se l'app non è mai stata seedata
   * (verifica tramite SEED_FLAG_KEY in localStorage) o se lo store è TOTALMENTE VUOTO.
   */
  async initInitialSeedData(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(SEED_FLAG_KEY)) {
      return; // Già seedato in precedenza, non toccare assolutamente nulla!
    }

    try {
      const [days, activities, transports, tappe, docs] = await Promise.all([
        idbGetAll<Giorno>(STORES.GIORNI),
        idbGetAll<Attivita>(STORES.ATTIVITA),
        idbGetAll<Trasporto>(STORES.TRASPORTI),
        idbGetAll<Tappa>(STORES.TAPPE),
        idbGetAll<TravelDocument>(STORES.DOCUMENTI)
      ]);

      // Se esiste già un qualsiasi dato salvato in IndexedDB, consideriamo l'app inizializzata
      // e NON TOCCARE MAI PIÙ NESSUN DATO per evitare di ripristinare il 29 al posto del 28
      if (days.length > 0 || activities.length > 0 || transports.length > 0 || tappe.length > 0 || docs.length > 0) {
        localStorage.setItem(SEED_FLAG_KEY, 'true');
        return;
      }

      // Procedi al primissimo seeding iniziale assoluto
      // 1. Giorno 29 Novembre 2026 e attività di partenza
      const dateStr = '2026-11-29';
      const day: Giorno = {
        id: `day_${dateStr}`,
        date: dateStr,
        title: 'Milano',
        location: 'Milano',
        notes: 'Partenza viaggio di nozze',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await idbPut(STORES.GIORNI, day);

      const novecento: Attivita = {
        id: 'real_novecento_nov29',
        dayId: day.id,
        date: dateStr,
        title: 'Museo del Novecento',
        time: '17:00',
        location: 'Piazza del Duomo, 8, Milano',
        category: 'cultura',
        status: 'completata',
        copilota: true,
        coordinate: { lat: 45.4637, lng: 9.1905 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const starita: Attivita = {
        id: 'real_starita_nov29',
        dayId: day.id,
        date: dateStr,
        title: 'Starita Milano',
        time: '20:00',
        location: 'Via Gherardini, 1, Milano',
        category: 'cibo',
        status: 'completata',
        copilota: true,
        coordinate: { lat: 45.4789, lng: 9.1724 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await idbPut(STORES.ATTIVITA, novecento);
      await idbPut(STORES.ATTIVITA, starita);

      // 2. Trasporti certificati iniziali
      const now = Date.now();
      for (const item of SEED_TRANSPORTS) {
        await idbPut(STORES.TRASPORTI, {
          ...item,
          attachments: item.attachments || [],
          copilota: item.copilota,
          depositPaid: item.depositPaid,
          createdAt: now,
          updatedAt: now
        });
      }

      // 3. Documenti predefiniti
      for (const doc of DEFAULT_DOCUMENTS) {
        await idbPut(STORES.DOCUMENTI, doc);
      }

      // Segna il flag definitivo di avvenuto seeding iniziale
      localStorage.setItem(SEED_FLAG_KEY, 'true');
      notifyDataChanged('all', 'save');
    } catch (err) {
      console.error('[StorageService] Errore initInitialSeedData:', err);
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
    let finalDayId = activity.dayId;
    let finalDate = activity.date;

    // Se l'attività ha una proprietà date valida, assicurati che dayId sia coerente
    if (finalDate && (!finalDayId || finalDayId.startsWith('day_'))) {
      finalDayId = `day_${finalDate}`;
    } else if (!finalDate && finalDayId && finalDayId.startsWith('day_')) {
      finalDate = finalDayId.replace('day_', '');
    }

    const item: Attivita = {
      ...activity,
      dayId: finalDayId,
      date: finalDate,
      createdAt: activity.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.ATTIVITA, item);
    notifyDataChanged('attivita', 'save', item);
  }

  async deleteActivity(id: string): Promise<void> {
    await idbDelete(STORES.ATTIVITA, id);
    notifyDataChanged('attivita', 'delete', { id });
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
    notifyDataChanged('alloggi', 'save', item);
  }

  async deleteAccommodation(id: string): Promise<void> {
    await idbDelete(STORES.ALLOGGI, id);
    notifyDataChanged('alloggi', 'delete', { id });
  }

  // --- TRASPORTI ---
  async seedTransports(force = false): Promise<void> {
    try {
      const existing = await idbGetAll<Trasporto>(STORES.TRASPORTI);
      const isAlreadySeeded = typeof localStorage !== 'undefined' && localStorage.getItem(SEED_FLAG_KEY);

      // Se non è forzato dall'utente e abbiamo già fatto il seed iniziale o ci sono trasporti, non toccare nulla
      if (!force && (isAlreadySeeded || existing.length > 0)) {
        return;
      }

      const existingMap = new Map(existing.map(t => [t.id, t]));
      const now = Date.now();
      for (const item of SEED_TRANSPORTS) {
        const prev = existingMap.get(item.id);
        await idbPut(STORES.TRASPORTI, {
          ...item,
          attachments: (prev?.attachments && prev.attachments.length > 0) ? prev.attachments : (item.attachments || []),
          copilota: prev?.copilota ?? item.copilota,
          depositPaid: item.depositPaid || prev?.depositPaid,
          createdAt: prev?.createdAt || now,
          updatedAt: now
        });
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SEED_FLAG_KEY, 'true');
      }
      notifyDataChanged('trasporti', 'save');
    } catch (err) {
      console.error('[StorageService] Errore durante il seeding dei trasporti:', err);
    }
  }

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
    notifyDataChanged('trasporti', 'save', item);
  }

  async deleteTransport(id: string): Promise<void> {
    await idbDelete(STORES.TRASPORTI, id);
    notifyDataChanged('trasporti', 'delete', { id });
  }

  // --- DOCUMENTI ---
  async getDocuments(): Promise<TravelDocument[]> {
    try {
      const items = await idbGetAll<TravelDocument>(STORES.DOCUMENTI);
      if (items.length === 0) {
        // Inizializza con i documenti predefiniti
        for (const doc of DEFAULT_DOCUMENTS) {
          await idbPut(STORES.DOCUMENTI, doc);
        }
        return DEFAULT_DOCUMENTS;
      }
      // Assicura che tutti i documenti standard esistano se ne mancano alcuni
      const existingIds = new Set(items.map(d => d.id));
      for (const defDoc of DEFAULT_DOCUMENTS) {
        if (!existingIds.has(defDoc.id)) {
          await idbPut(STORES.DOCUMENTI, defDoc);
          items.push(defDoc);
        }
      }
      // Integra status o validity predefiniti se assenti
      for (let i = 0; i < items.length; i++) {
        const doc = items[i];
        const defDoc = DEFAULT_DOCUMENTS.find(d => d.id === doc.id);
        if (defDoc && (!doc.validity || !doc.status)) {
          const updated: TravelDocument = {
            ...doc,
            status: doc.status || defDoc.status,
            validity: doc.validity || defDoc.validity
          };
          await idbPut(STORES.DOCUMENTI, updated);
          items[i] = updated;
        }
      }
      return items;
    } catch (err) {
      console.error('[StorageService] Errore lettura documenti:', err);
      return DEFAULT_DOCUMENTS;
    }
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
    const item: TravelDocument = {
      ...doc,
      updatedAt: new Date().toISOString()
    };
    await idbPut(STORES.DOCUMENTI, item);
  }

  async deleteDocument(id: string): Promise<void> {
    await idbDelete(STORES.DOCUMENTI, id);
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
      const items = await idbGetAll<Tappa>(STORES.TAPPE);
      return items.sort((a, b) => {
        if (a.data && b.data) return a.data.localeCompare(b.data);
        if (a.data) return -1;
        if (b.data) return 1;
        return a.titolo.localeCompare(b.titolo);
      });
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
    const now = Date.now();
    const cleanDate = tappa.data || tappa.date || '';
    const dayId = tappa.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const newTappa: Tappa = {
      ...tappa,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: tappa.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tappa_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.TAPPE, newTappa);
    notifyDataChanged('tappe', 'save', newTappa);
    return newTappa;
  }

  async updateTappa(id: string, partial: Partial<Tappa>): Promise<void> {
    try {
      const existing = await idbGet<Tappa>(STORES.TAPPE, id);
      if (!existing) throw new Error(`Tappa con id ${id} non trovata`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const updated: Tappa = {
        ...existing,
        ...partial,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // Garantisce che l'ID primario non venga alterato
        updatedAt: Date.now()
      };
      await idbPut(STORES.TAPPE, updated);
      notifyDataChanged('tappe', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento tappa:', err);
      throw err;
    }
  }

  async saveTappa(tappa: Tappa): Promise<void> {
    const now = Date.now();
    const cleanDate = tappa.data || tappa.date || '';
    const dayId = tappa.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const item: Tappa = {
      ...tappa,
      data: cleanDate,
      date: cleanDate,
      dayId,
      createdAt: tappa.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.TAPPE, item);
    notifyDataChanged('tappe', 'save', item);
  }

  async deleteTappa(id: string): Promise<void> {
    await idbDelete(STORES.TAPPE, id);
    notifyDataChanged('tappe', 'delete', { id });
  }

  // --- RISTORANTI ---
  async getRistoranti(): Promise<Ristorante[]> {
    try {
      const items = await idbGetAll<Ristorante>(STORES.RISTORANTI);
      return items.sort((a, b) => {
        if (a.data && b.data) return a.data.localeCompare(b.data);
        if (a.data) return -1;
        if (b.data) return 1;
        return a.nome.localeCompare(b.nome);
      });
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
    const now = Date.now();
    const cleanDate = ristorante.data || ristorante.date || '';
    const dayId = ristorante.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const newRistorante: Ristorante = {
      ...ristorante,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: ristorante.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ristorante_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.RISTORANTI, newRistorante);
    notifyDataChanged('ristoranti', 'save', newRistorante);
    return newRistorante;
  }

  async updateRistorante(id: string, partial: Partial<Ristorante>): Promise<void> {
    try {
      const existing = await idbGet<Ristorante>(STORES.RISTORANTI, id);
      if (!existing) throw new Error(`Ristorante con id ${id} non trovato`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const updated: Ristorante = {
        ...existing,
        ...partial,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // ID primario preservato
        updatedAt: Date.now()
      };
      await idbPut(STORES.RISTORANTI, updated);
      notifyDataChanged('ristoranti', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento ristorante:', err);
      throw err;
    }
  }

  async saveRistorante(r: Ristorante): Promise<void> {
    const now = Date.now();
    const cleanDate = r.data || r.date || '';
    const dayId = r.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const item: Ristorante = {
      ...r,
      data: cleanDate,
      date: cleanDate,
      dayId,
      createdAt: r.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.RISTORANTI, item);
    notifyDataChanged('ristoranti', 'save', item);
  }

  async deleteRistorante(id: string): Promise<void> {
    await idbDelete(STORES.RISTORANTI, id);
    notifyDataChanged('ristoranti', 'delete', { id });
  }

  // --- SHOPPING ---
  async getShopping(): Promise<Shopping[]> {
    try {
      const items = await idbGetAll<Shopping>(STORES.SHOPPING);
      return items.sort((a, b) => {
        if (a.data && b.data) return a.data.localeCompare(b.data);
        if (a.data) return -1;
        if (b.data) return 1;
        return a.nome.localeCompare(b.nome);
      });
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
    const now = Date.now();
    const cleanDate = shopping.data || shopping.date || '';
    const dayId = shopping.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const newShopping: Shopping = {
      ...shopping,
      data: cleanDate,
      date: cleanDate,
      dayId,
      id: shopping.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shopping_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.SHOPPING, newShopping);
    notifyDataChanged('shopping', 'save', newShopping);
    return newShopping;
  }

  async updateShopping(id: string, partial: Partial<Shopping>): Promise<void> {
    try {
      const existing = await idbGet<Shopping>(STORES.SHOPPING, id);
      if (!existing) throw new Error(`Shopping con id ${id} non trovato`);
      const cleanDate = partial.data !== undefined ? partial.data : (partial.date !== undefined ? partial.date : existing.data);
      const dayId = partial.dayId || (cleanDate ? `day_${cleanDate}` : existing.dayId);
      const updated: Shopping = {
        ...existing,
        ...partial,
        data: cleanDate,
        date: cleanDate,
        dayId,
        id, // ID primario preservato
        updatedAt: Date.now()
      };
      await idbPut(STORES.SHOPPING, updated);
      notifyDataChanged('shopping', 'save', updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento shopping:', err);
      throw err;
    }
  }

  async saveShopping(s: Shopping): Promise<void> {
    const now = Date.now();
    const cleanDate = s.data || s.date || '';
    const dayId = s.dayId || (cleanDate ? `day_${cleanDate}` : undefined);
    const item: Shopping = {
      ...s,
      data: cleanDate,
      date: cleanDate,
      dayId,
      createdAt: s.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.SHOPPING, item);
    notifyDataChanged('shopping', 'save', item);
  }

  async deleteShopping(id: string): Promise<void> {
    await idbDelete(STORES.SHOPPING, id);
    notifyDataChanged('shopping', 'delete', { id });
  }

  // --- SPESE & BUDGET ---
  async getSpese(): Promise<Spesa[]> {
    try {
      const items = await idbGetAll<Spesa>(STORES.SPESE);
      return items.sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      console.error('[StorageService] Errore lettura spese:', err);
      return [];
    }
  }

  async saveSpesa(spesa: Spesa): Promise<void> {
    const now = Date.now();
    const item: Spesa = {
      ...spesa,
      createdAt: spesa.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.SPESE, item);
    notifyDataChanged('spese', 'save', item);
  }

  async deleteSpesa(id: string): Promise<void> {
    await idbDelete(STORES.SPESE, id);
    notifyDataChanged('spese', 'delete', { id });
  }

  // --- BACKUP & RIPRISTINO ---

  /** Esporta tutti i dati in una stringa JSON con metadati. */
  async exportAllData(): Promise<string> {
    const [giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese, routes] = await Promise.all([
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
      exportedAt: new Date().toISOString(),
      data: { giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese, routes },
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

    const backup = parsed as { version: number; data: Record<string, unknown[]>; live_status?: Record<string, any> };
    if (backup.version !== 1) {
      throw new Error(`Versione backup non supportata (trovata: ${backup.version}, attesa: 1).`);
    }

    const { data, live_status } = backup;
    if (!data || typeof data !== 'object') {
      throw new Error('Struttura dati del backup non valida.');
    }

    // Svuota e reinserisci per ogni store
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
      const dayTransports = transports.filter(t => {
        if (t.date === dateStr) return true;
        // Gestione noleggi e tratte con dropoffDate o arrivo trans-data
        if (t.dropoffDate && t.date && t.date <= dateStr && t.dropoffDate >= dateStr) return true;
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
      
      // Trasporti del giorno
      dayTransports.forEach(t => {
        const time = t.departureTime || '08:00';
        const title = t.carrier ? `${t.type.toUpperCase()} • ${t.carrier}` : t.type.toUpperCase();
        const loc = t.departureLocation ? `${t.departureLocation} ➔ ${t.arrivalLocation}` : t.arrivalLocation;
        timeline.push({
          id: t.id,
          type: 'trasporto',
          time,
          title,
          location: loc,
          categoryOrType: t.type,
          copilota: t.copilota,
          coordinate: t.coordinate,
          originalData: t
        });
      });

      // Tappe programmate per la data
      dayTappe.forEach(t => {
        timeline.push({
          id: t.id,
          type: 'tappa',
          time: '10:00', // Orario indicativo mattutino per le soste di viaggio se non specificato
          title: t.titolo,
          location: t.titolo,
          categoryOrType: 'tappa',
          copilota: t.copilota,
          coordinate: t.coordinate,
          originalData: t
        });
      });

      // Attività
      activities.forEach(a => {
        timeline.push({
          id: a.id,
          type: 'attivita',
          time: a.time || '14:00',
          title: a.title,
          location: a.location,
          categoryOrType: a.category,
          copilota: a.copilota,
          copilotNotes: a.copilotNotes,
          coordinate: a.coordinate,
          originalData: a
        });
      });

      // Prenotazioni Ristoranti
      dayRistoranti.forEach(r => {
        timeline.push({
          id: r.id,
          type: 'ristorante',
          time: r.orario || '19:30',
          title: r.nome,
          location: r.indirizzo || r.nome,
          categoryOrType: 'ristorante',
          copilota: r.copilota,
          coordinate: r.coordinate,
          originalData: r
        });
      });

      // Shopping & Acquisti
      dayShopping.forEach(s => {
        timeline.push({
          id: s.id,
          type: 'shopping',
          time: s.orario || '16:00',
          title: s.nome,
          location: s.indirizzo || s.nome,
          categoryOrType: 'shopping',
          copilota: s.copilota,
          coordinate: s.coordinate,
          originalData: s
        });
      });

      // Alloggi notturni (singolo promemoria a fine giornata alle 21:00)
      const seenAccIds = new Set<string>();
      dayAccommodations.forEach(acc => {
        if (!seenAccIds.has(acc.id)) {
          seenAccIds.add(acc.id);
          timeline.push({
            id: acc.id,
            type: 'alloggio',
            time: '21:00',
            title: `Pernottamento presso: ${acc.name}`,
            location: acc.address || acc.location,
            categoryOrType: 'alloggio',
            coordinate: undefined,
            originalData: acc
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

      const merged = Array.from(uniqueMap.values()).sort((a, b) => a.time.localeCompare(b.time));
      
      return merged;
    } catch (err) {
      console.error('[StorageService] Errore lettura timeline:', err);
      return [];
    }
  }

  // Device Role Management ('guida' | 'copilota' | 'viewer')
  getDeviceRole(): DeviceRole {
    if (typeof window === 'undefined') return 'viewer';
    try {
      const role = localStorage.getItem('app_device_role') as DeviceRole | null;
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
      localStorage.setItem('app_device_role', role);
      // Dispatch custom event to notify listeners across the app
      window.dispatchEvent(new CustomEvent('device_role_changed', { detail: { role } }));
    } catch (e) {
      console.error('[StorageService] Errore salvataggio device role:', e);
    }
  }
}

export const storageService = new StorageService();

