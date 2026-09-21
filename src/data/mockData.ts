// ─── REAL TRIP DATA ────────────────────────────────────────────────────────────
// Dati reali importati da honeymoon-roadbookzip/src/lib/seed.ts e transport.tsx
// Viaggio: NZ · AU · PH — 28 nov 2026 → 10 gen 2027
//
// TODO import Gmail/Google: aggiungere source?: "manual"|"gmail"|"google_calendar"
//                            e confirmationCode?: string alle strutture Transport

import itineraryData from "./itinerary.json";
import accommodationsData from "./accommodations.json";
import transportsData from "./transports.json";

export type ActivityType =
  | "transport"
  | "food"
  | "sightseeing"
  | "shopping"
  | "hotel"
  | "other";

export interface Activity {
  id: string;
  time: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  status?: "in_corso" | "completato" | "futuro";
  hasQR?: boolean;
  imageUrl?: string;
  note?: string;
  transitTime?: string;
  price?: number; // Prezzo dell'attività
  isPaid?: boolean; // Stato di pagamento
  isBooked?: boolean; // Stato di prenotazione
  howToGetThere?: string; // Come arrivare
  timeBeforehand?: string; // Quanto prima presentarsi
  duration?: string; // Durata
  bookingRef?: string; // Codice/Riferimento prenotazione
  ticketUrl?: string; // Link per biglietti / info
  isManaged?: boolean; // Se è un'attività gestita
  mapsUrl?: string; // Posizione su Google Maps
}

export interface DayData {
  id: string;
  dayNumber: number;
  date: string; // ISO YYYY-MM-DD
  dateLabel: string;
  dateShort: string;
  monthShort: string;
  dayShort: string;
  location: string;
  timezone?: string;
  activities: Activity[];
}

export interface Accommodation {
  id: string;
  name: string;
  city: string;
  area?: string;
  checkIn: string;
  checkOut: string;
  dates: string;
  note?: string;
  mapsUrl?: string;
  imageUrl?: string;
  price?: number; // Prezzo dell'alloggio
  isPaid?: boolean; // Stato di pagamento
  // Campi pronti per import futuro Gmail/Google:
  source?: "manual" | "gmail" | "google_calendar" | "booking";
  confirmationCode?: string;
  cancellationDeadline?: string; // Data ultima cancellazione
  updatedAt?: number;
  startDate?: string; // ISO YYYY-MM-DD
  endDate?: string; // ISO YYYY-MM-DD
  type?: "hotel";
  status?: string;
  breakfast?: string;
}

export interface Transport {
  id: string;
  date: string; // ISO YYYY-MM-DD — chiave per ordinamento e conflitti futuri
  dateLabel: string;
  time: string; // HH:MM
  from: string;
  to: string;
  type: "plane" | "train" | "ferry" | "car" | "taxi" | "transfer" | "other";
  detail?: string;
  status?: string;
  note?: string;
  isPaid?: boolean; // Stato di pagamento
  // Campi dettaglio (da vecchio progetto)
  arrivalTime?: string;
  bookingRef?: string;
  confirmationCode?: string;
  baggageNote?: string;
  importantNote?: string;
  // Segmenti per voli con scalo
  segments?: { from: string; to: string; departure: string; arrival: string; operator?: string; flightNumber?: string }[];
  layoverCity?: string;
  // Campi extra richiesti per personalizzazioni, inserimenti e modifiche complete:
  baggageHand?: string;
  baggageCabin?: string;
  baggageExtra?: string;
  terminal?: string;
  gate?: string;
  seat?: string;
  duration?: string;
  carrierCode?: string; // Numero volo / tratta
  airline?: string; // Compagnia
  qrCodeData?: string; // QR o riferimento documento
  qrCodes?: string[]; // Lista di QR code o riferimenti a documenti associati
  price?: number; // Prezzo della tratta
  source?: "manual" | "imported" | "gmail" | "google_calendar" | "booking";
  
  // Campi noleggio auto/van:
  rentalProvider?: string;
  rentalVehicle?: string;
  pickupTime?: string;
  pickupLocation?: string;
  returnTime?: string;
  returnLocation?: string;
  pricePaid?: number;
  priceToPay?: string;
  insurancePolicy?: string;
  flightNumber?: string;
}

export interface BudgetCategory {
  id: string;
  label: string;
  icon: string;
  spent: number;
  budget: number;
}

export interface BudgetEntry {
  id: string;
  date: string;
  label: string;
  amount: number;
  category: string;
}

// ── Dati assicurazione (reali da vecchio progetto) ────────────────────────────
export const INSURANCE = {
  provider: "IMA Italia Assistance S.p.A.",
  brand: "Heymondo",
  policyNumber: "HEY2101185",
  plan: "Viaggio Premium",
  insured: "Nunzio Belardo; Giusy Reale",
  startDate: "29 nov 2026",
  endDate: "10 gen 2027",
  coverage: "Mondo escluso USA/Canada",
  cost: "€ 294,21",
  phone24h: "+39 02 2412 8782",
  phoneClaims: "+39 02 2412 8788",
  emailClaims: "sinistri.heymondo@imaitalia.it",
  claimsPortal: "http://www.heymondo.sinistri.imaitalia.it",
  medicalExpenses: "Illimitato",
  luggage: "4.000 €",
  flightDelay: "300 € (75 € ogni 8 ore)",
  personalLiability: "150.000 €",
};

// ── Contatti emergenza per paese (reali da vecchio progetto) ──────────────────
export const EMERGENCY_CONTACTS = [
  { country: "Nuova Zelanda 🇳🇿", number: "111", note: "Emergenza, ambulanza, polizia, pompieri" },
  { country: "Australia 🇦🇺", number: "000", note: "Emergenza, ambulanza, polizia, pompieri" },
  { country: "Filippine 🇵🇭", number: "911", note: "Emergenza, ambulanza, polizia, pompieri" },
  { country: "IMA Assistenza 24/7", number: "+39 02 2412 8782", note: "Assistenza medica internazionale Heymondo" },
];

// ── TODAY config ───────────────────────────────────────────────────────────────
// Partenza reale: 28 novembre 2026 da Roma
export const DEPARTURE_DATE = (() => {
  const stored = localStorage.getItem("hrb_departure_date");
  return stored ? new Date(stored + "T00:00:00") : new Date("2026-11-28T00:00:00");
})();

export const TRIP_NAME = (() => {
  return localStorage.getItem("hrb_trip_name") || "Honeymoon NZ · AU · PH";
})();

export const TRIP_DURATION = (() => {
  return localStorage.getItem("hrb_trip_duration") || "43 giorni";
})();

// Calcolati dinamicamente (vedi helpers in TodayView)
export function getDaysToDeparture(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dep = new Date(DEPARTURE_DATE);
  dep.setHours(0, 0, 0, 0);
  const diff = Math.round((dep.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function getTodayLabel(): string {
  return new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

// ID del giorno "oggi" — da mantenere come override manuale durante il viaggio
// Impostato sul primo giorno del viaggio (28 nov 2026)
export const TODAY_DAY_ID = "day-1";

// ── DAYS (giorni chiave del viaggio) ─────────────────────────────────────────
// Solo giorni con attività definite. I giorni "di guida" sono sintetici.
export const DAYS = itineraryData as DayData[];

export const ACCOMMODATIONS = accommodationsData as Accommodation[];

export const TRANSPORTS = transportsData as Transport[];

export const BUDGET_TOTAL = 12000;
export const BUDGET_SPENT = 3240;

export interface BudgetCategory {
  id: string;
  label: string;
  icon: string;
  spent: number;
  budget: number;
}

export interface BudgetEntry {
  id: string;
  date: string;
  label: string;
  amount: number;
  category: string;
}

// ── Gestione Completamento Attività ──────────────────────────────────────────
const LS_COMPLETED_KEY = "hrb_completed_activities_v2";

export function loadCompletedActivities(): string[] {
  try {
    const raw = localStorage.getItem(LS_COMPLETED_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

export function saveCompletedActivities(list: string[]) {
  try {
    localStorage.setItem(LS_COMPLETED_KEY, JSON.stringify(list));
    // Notifica alle viste attive lo stato aggiornato delle attività spuntate
    window.dispatchEvent(new CustomEvent("hrb_completed_activities_change", { detail: list }));
  } catch { /* ignore */ }
}

const LS_TRIP_DAYS_KEY = "hrb_trip_days_v2";

export function loadTripDays(): DayData[] {
  try {
    const raw = localStorage.getItem(LS_TRIP_DAYS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as DayData[];
      if (list.length !== DAYS.length) {
        const merged = DAYS.map((d) => {
          const savedDay = list.find((s) => s.date === d.date);
          if (savedDay) {
            const userActs = savedDay.activities.filter((a) => a.id.startsWith("act-user-"));
            if (userActs.length > 0) {
              return { ...d, activities: [...d.activities, ...userActs] };
            }
          }
          return d;
        });
        localStorage.setItem(LS_TRIP_DAYS_KEY, JSON.stringify(merged));
        return merged;
      }
      return list;
    }
  } catch { /* ignore */ }
  return DAYS;
}

export function saveTripDays(list: DayData[]) {
  try {
    localStorage.setItem(LS_TRIP_DAYS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

