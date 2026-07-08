import { kvStorage } from "./db";
import type { DayData, Transport, Accommodation } from "../data/mockData";

// Tipi per Checklist e Documenti di AltroView
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}
export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}
export interface AttachmentItem {
  id: string;
  name: string;
  type: "image" | "pdf" | "other";
  dataUrl: string;
}
export interface DocumentItem {
  id: string;
  title: string;
  category: any;
  number: string;
  owner: string;
  notes?: string;
  isMockDefault?: boolean;
  attachments?: AttachmentItem[];
}
export interface BudgetEntry {
  id: string;
  date: string;
  label: string;
  amount: number;
  category: "Trasporti" | "Alloggi" | "Attività" | "Cibo & Extra" | "Altro";
}

const MIGRATED_FLAG = "hrb_indexeddb_migrated";

async function checkAndMigrate(): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG) === "true") {
    return;
  }

  const keys = [
    "hrb_trip_days_v2",
    "hrb_completed_activities_v2",
    "hrb_qr_images_v1",
    "hrb_transports_v3",
    "hrb_accommodations_v2",
    "hrb_checklists_v3",
    "hrb_documents_v2",
    "hrb_budget_entries_v2"
  ];

  let hasError = false;

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        await kvStorage.set(key, parsed);
      } catch (e) {
        console.error(`Errore di migrazione per la chiave ${key}:`, e);
        hasError = true;
      }
    }
  }

  if (!hasError) {
    localStorage.setItem(MIGRATED_FLAG, "true");
  }
}

export const repository = {
  // Itinerario Giornaliero
  async getTripDays(fallback: DayData[]): Promise<DayData[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<DayData[]>("hrb_trip_days_v2");
    return data || fallback;
  },
  async saveTripDays(days: DayData[]): Promise<void> {
    await kvStorage.set("hrb_trip_days_v2", days);
  },

  // Attività completate (spunte)
  async getCompletedActivities(): Promise<string[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<string[]>("hrb_completed_activities_v2");
    return data || [];
  },
  async saveCompletedActivities(ids: string[]): Promise<void> {
    await kvStorage.set("hrb_completed_activities_v2", ids);
    window.dispatchEvent(new CustomEvent("hrb_completed_activities_change", { detail: ids }));
  },

  // QR / Biglietti base64 di Oggi
  async getQRImages(): Promise<Record<string, string[]>> {
    await checkAndMigrate();
    const data = await kvStorage.get<Record<string, string[]>>("hrb_qr_images_v1");
    return data || {};
  },
  async saveQRImages(map: Record<string, string[]>): Promise<void> {
    await kvStorage.set("hrb_qr_images_v1", map);
  },

  // Trasporti
  async getTransports(fallback: Transport[]): Promise<Transport[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<Transport[]>("hrb_transports_v3");
    return data || fallback;
  },
  async saveTransports(transports: Transport[]): Promise<void> {
    await kvStorage.set("hrb_transports_v3", transports);
  },

  // Alloggi
  async getAccommodations(fallback: Accommodation[]): Promise<Accommodation[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<Accommodation[]>("hrb_accommodations_v2");
    return data || fallback;
  },
  async saveAccommodations(accommodations: Accommodation[]): Promise<void> {
    await kvStorage.set("hrb_accommodations_v2", accommodations);
  },

  // Checklist
  async getChecklists(fallback: Checklist[]): Promise<Checklist[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<Checklist[]>("hrb_checklists_v3");
    return data || fallback;
  },
  async saveChecklists(checklists: Checklist[]): Promise<void> {
    await kvStorage.set("hrb_checklists_v3", checklists);
  },

  // Documenti
  async getDocuments(fallback: DocumentItem[]): Promise<DocumentItem[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<DocumentItem[]>("hrb_documents_v2");
    return data || fallback;
  },
  async saveDocuments(documents: DocumentItem[]): Promise<void> {
    await kvStorage.set("hrb_documents_v2", documents);
  },

  // Budget Entries
  async getBudgetEntries(fallback: BudgetEntry[]): Promise<BudgetEntry[]> {
    await checkAndMigrate();
    const data = await kvStorage.get<BudgetEntry[]>("hrb_budget_entries_v2");
    if (data) {
      let list = data;
      list = list.map((e) => {
        if ((e.category as any) === "Assicurazione") {
          return { ...e, category: "Altro" };
        }
        return e;
      });
      fallback.forEach((init) => {
        if (!list.some((e) => e.id === init.id)) {
          list.push(init);
        }
      });
      return list;
    }
    return fallback;
  },
  async saveBudgetEntries(entries: BudgetEntry[]): Promise<void> {
    await kvStorage.set("hrb_budget_entries_v2", entries);
  },

  // Note personali
  async getNotes(): Promise<string> {
    await checkAndMigrate();
    const data = await kvStorage.get<string>("hrb_notes_v2");
    return data || "";
  },
  async saveNotes(notes: string): Promise<void> {
    await kvStorage.set("hrb_notes_v2", notes);
  },

  // Reset totale dell'applicazione
  async clearAllData(): Promise<void> {
    await kvStorage.clear();
    localStorage.removeItem("hrb_local_auth_bypass");
    localStorage.removeItem("hrb_intro_seen");
    localStorage.removeItem("hrb_indexeddb_migrated");
  }
};
