import type { Giorno, Attivita, Alloggio, Trasporto, TravelDocument } from '../types';
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

  // --- BACKUP & RIPRISTINO ---

  /** Esporta tutti i dati in una stringa JSON con metadati. */
  async exportAllData(): Promise<string> {
    const [giorni, attivita, alloggi, trasporti, documenti] = await Promise.all([
      idbGetAll<Giorno>(STORES.GIORNI),
      idbGetAll<Attivita>(STORES.ATTIVITA),
      idbGetAll<Alloggio>(STORES.ALLOGGI),
      idbGetAll<Trasporto>(STORES.TRASPORTI),
      idbGetAll<TravelDocument>(STORES.DOCUMENTI),
    ]);
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { giorni, attivita, alloggi, trasporti, documenti },
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
