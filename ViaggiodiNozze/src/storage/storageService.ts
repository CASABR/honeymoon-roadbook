import type { Giorno, Attivita, Alloggio, Trasporto, TravelDocument, RoutingCacheItem, Tappa, Ristorante, Shopping, Spesa } from '../types';
import {
  STORES,
  idbGetAll,
  idbGet,
  idbPut,
  idbDelete
} from './indexedDB';
import { SEED_TRANSPORTS } from './seedTransports';

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

  async seedMockActivities(): Promise<void> {
    if (!import.meta.env.DEV) return;
    try {
      const MOCK_VERSION = 'v1_mock_milano';
      const migrationVersion = typeof localStorage !== 'undefined' ? localStorage.getItem('mock_seed_ver') : null;
      if (migrationVersion === MOCK_VERSION) return;

      const dateStr = '2026-11-28';
      const days = await idbGetAll<Giorno>(STORES.GIORNI);
      let day = days.find(d => d.date === dateStr);
      
      if (!day) {
        day = {
          id: `day_${dateStr}`,
          date: dateStr,
          title: 'Milano Test',
          location: 'Milano',
          notes: 'Giornata di test routing',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await idbPut(STORES.GIORNI, day);
      }

      const activities = await idbGetAll<Attivita>(STORES.ATTIVITA);
      const hasMock = activities.some(a => a.id === 'mock_novecento' || a.id === 'mock_starita');
      if (!hasMock) {
        const novecento: Attivita = {
          id: 'mock_novecento',
          dayId: day.id,
          title: 'Museo del Novecento',
          time: '14:00',
          location: 'Piazza del Duomo, 8, 20123 Milano MI',
          category: 'cultura',
          link: 'https://share.google/8yp7aQiQ1NeI9yQVx',
          notes: '',
          status: 'completata',
          copilota: true,
          coordinate: { lat: 45.4637, lng: 9.1905 },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const starita: Attivita = {
          id: 'mock_starita',
          dayId: day.id,
          title: 'Starita Milano',
          time: '20:00',
          location: 'Via Gherardini, 1, 20145 Milano MI',
          category: 'cibo',
          link: 'https://share.google/2zCF6CNMyE5xhpnG8',
          notes: '',
          status: 'completata',
          copilota: true,
          coordinate: { lat: 45.4789, lng: 9.1724 },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        await idbPut(STORES.ATTIVITA, novecento);
        await idbPut(STORES.ATTIVITA, starita);
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mock_seed_ver', MOCK_VERSION);
      }
    } catch (err) {
      console.error('[StorageService] Errore seeding mock:', err);
    }
  }

  // --- ATTIVITA ---
  async getActivities(dayId?: string): Promise<Attivita[]> {
    try {
      await this.seedMockActivities();
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
      const SEED_VERSION = 'v6_acconto_trasporti';
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
    const newTappa: Tappa = {
      ...tappa,
      id: tappa.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tappa_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.TAPPE, newTappa);
    return newTappa;
  }

  async updateTappa(id: string, partial: Partial<Tappa>): Promise<void> {
    try {
      const existing = await idbGet<Tappa>(STORES.TAPPE, id);
      if (!existing) throw new Error(`Tappa con id ${id} non trovata`);
      const updated: Tappa = {
        ...existing,
        ...partial,
        id,
        updatedAt: Date.now()
      };
      await idbPut(STORES.TAPPE, updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento tappa:', err);
      throw err;
    }
  }

  async saveTappa(tappa: Tappa): Promise<void> {
    const now = Date.now();
    const item: Tappa = {
      ...tappa,
      createdAt: tappa.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.TAPPE, item);
  }

  async deleteTappa(id: string): Promise<void> {
    await idbDelete(STORES.TAPPE, id);
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
      return all.filter(r => r.data === data);
    } catch (err) {
      console.error('[StorageService] Errore lettura ristoranti per data:', err);
      return [];
    }
  }

  async addRistorante(ristorante: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Ristorante> {
    const now = Date.now();
    const newRistorante: Ristorante = {
      ...ristorante,
      id: ristorante.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ristorante_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.RISTORANTI, newRistorante);
    return newRistorante;
  }

  async updateRistorante(id: string, partial: Partial<Ristorante>): Promise<void> {
    try {
      const existing = await idbGet<Ristorante>(STORES.RISTORANTI, id);
      if (!existing) throw new Error(`Ristorante con id ${id} non trovato`);
      const updated: Ristorante = {
        ...existing,
        ...partial,
        id,
        updatedAt: Date.now()
      };
      await idbPut(STORES.RISTORANTI, updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento ristorante:', err);
      throw err;
    }
  }

  async saveRistorante(r: Ristorante): Promise<void> {
    const now = Date.now();
    const item: Ristorante = {
      ...r,
      createdAt: r.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.RISTORANTI, item);
  }

  async deleteRistorante(id: string): Promise<void> {
    await idbDelete(STORES.RISTORANTI, id);
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
      return all.filter(s => s.data === data);
    } catch (err) {
      console.error('[StorageService] Errore lettura shopping per data:', err);
      return [];
    }
  }

  async addShopping(shopping: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Shopping> {
    const now = Date.now();
    const newShopping: Shopping = {
      ...shopping,
      id: shopping.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shopping_' + now),
      createdAt: now,
      updatedAt: now
    };
    await idbPut(STORES.SHOPPING, newShopping);
    return newShopping;
  }

  async updateShopping(id: string, partial: Partial<Shopping>): Promise<void> {
    try {
      const existing = await idbGet<Shopping>(STORES.SHOPPING, id);
      if (!existing) throw new Error(`Shopping con id ${id} non trovato`);
      const updated: Shopping = {
        ...existing,
        ...partial,
        id,
        updatedAt: Date.now()
      };
      await idbPut(STORES.SHOPPING, updated);
    } catch (err) {
      console.error('[StorageService] Errore aggiornamento shopping:', err);
      throw err;
    }
  }

  async saveShopping(s: Shopping): Promise<void> {
    const now = Date.now();
    const item: Shopping = {
      ...s,
      createdAt: s.createdAt || now,
      updatedAt: now
    };
    await idbPut(STORES.SHOPPING, item);
  }

  async deleteShopping(id: string): Promise<void> {
    await idbDelete(STORES.SHOPPING, id);
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
  }

  async deleteSpesa(id: string): Promise<void> {
    await idbDelete(STORES.SPESE, id);
  }

  // --- BACKUP & RIPRISTINO ---

  /** Esporta tutti i dati in una stringa JSON con metadati. */
  async exportAllData(): Promise<string> {
    const [giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese] = await Promise.all([
      idbGetAll<Giorno>(STORES.GIORNI),
      idbGetAll<Attivita>(STORES.ATTIVITA),
      idbGetAll<Alloggio>(STORES.ALLOGGI),
      idbGetAll<Trasporto>(STORES.TRASPORTI),
      idbGetAll<TravelDocument>(STORES.DOCUMENTI),
      idbGetAll<Tappa>(STORES.TAPPE),
      idbGetAll<Ristorante>(STORES.RISTORANTI),
      idbGetAll<Shopping>(STORES.SHOPPING),
      idbGetAll<Spesa>(STORES.SPESE),
    ]);
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { giorni, attivita, alloggi, trasporti, documenti, tappe, ristoranti, shopping, spese },
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
      { key: 'documenti', store: STORES.DOCUMENTI },
      { key: 'tappe', store: STORES.TAPPE },
      { key: 'ristoranti', store: STORES.RISTORANTI },
      { key: 'shopping', store: STORES.SHOPPING },
      { key: 'spese', store: STORES.SPESE },
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

  // --- TIMELINE OGGI ---
  async getTimelineForDate(dateStr: string): Promise<import('../types').TimelineItem[]> {
    try {
      const [days, transports, tappe, ristoranti, shoppingList] = await Promise.all([
        this.getDays(),
        this.getTransports(),
        this.getTappe(),
        this.getRistoranti(),
        this.getShopping()
      ]);
      const day = days.find(d => d.date === dateStr);
      const activities = day ? await this.getActivities(day.id) : [];
      
      const dayTransports = transports.filter(t => t.date === dateStr);
      const dayTappe = tappe.filter(t => t.data === dateStr);
      const dayRistoranti = ristoranti.filter(r => r.data === dateStr);
      const dayShopping = shoppingList.filter(s => s.data === dateStr);
      
      const timeline: import('../types').TimelineItem[] = [];
      
      // 1. Spostamenti / Trasporti del giorno
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

      // 2. Tappe programmate per la data
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

      // 3. Attività
      activities.forEach(a => {
        timeline.push({
          id: a.id,
          type: 'attivita',
          time: a.time || '14:00',
          title: a.title,
          location: a.location,
          categoryOrType: a.category,
          copilota: a.copilota,
          coordinate: a.coordinate,
          originalData: a
        });
      });

      // 4. Prenotazioni Ristoranti
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

      // 5. Shopping & Acquisti
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
      
      const merged = timeline.sort((a, b) => a.time.localeCompare(b.time));
      
      return merged;
    } catch (err) {
      console.error('[StorageService] Errore lettura timeline:', err);
      return [];
    }
  }
}

export const storageService = new StorageService();
