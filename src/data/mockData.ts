// ─── REAL TRIP DATA ────────────────────────────────────────────────────────────
// Dati reali importati da honeymoon-roadbookzip/src/lib/seed.ts e transport.tsx
// Viaggio: NZ · AU · PH — 28 nov 2026 → 10 gen 2027
//
// TODO import Gmail/Google: aggiungere source?: "manual"|"gmail"|"google_calendar"
//                            e confirmationCode?: string alle strutture Transport

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
  // Campi pronti per import futuro Gmail/Google:
  source?: "manual" | "gmail" | "google_calendar" | "booking";
  confirmationCode?: string;
  updatedAt?: number;
  startDate?: string; // ISO YYYY-MM-DD
  endDate?: string; // ISO YYYY-MM-DD
  type?: "hotel";
}

export interface Transport {
  id: string;
  date: string; // ISO YYYY-MM-DD — chiave per ordinamento e conflitti futuri
  dateLabel: string;
  time: string; // HH:MM
  from: string;
  to: string;
  type: "plane" | "train" | "ferry" | "car" | "transfer" | "other";
  detail?: string;
  status?: string;
  note?: string;
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
export const DAYS: DayData[] = [
  {
    id: "day-1",
    dayNumber: 1,
    date: "2026-11-28",
    dateLabel: "Sab 28 nov",
    dateShort: "28",
    monthShort: "nov",
    dayShort: "Sab",
    location: "Roma, Italia",
    activities: [
      { id: "d1-1", time: "11:05", type: "transport", title: "Roma Termini → Milano Centrale", subtitle: "Trenitalia Frecciarossa · 1h 55m", status: "futuro", hasQR: true },
    ],
  },
  {
    id: "day-2",
    dayNumber: 2,
    date: "2026-11-29",
    dateLabel: "Dom 29 nov",
    dateShort: "29",
    monthShort: "nov",
    dayShort: "Dom",
    location: "Milano / In volo",
    activities: [
      { id: "d2-1", time: "12:30", type: "transport", title: "Milano MXP → Pechino PEK", subtitle: "Air China CA950 · Volo", hasQR: true },
    ],
  },
  {
    id: "day-3",
    dayNumber: 3,
    date: "2026-11-30",
    dateLabel: "Lun 30 nov",
    dateShort: "30",
    monthShort: "nov",
    dayShort: "Lun",
    location: "Pechino, Cina",
    activities: [
      { id: "d3-1", time: "05:50", type: "transport", title: "Arrivo Pechino PEK", subtitle: "Scalo lungo · Terminal 3" },
      { id: "d3-2", time: "10:00", type: "sightseeing", title: "Transito Pechino (scalo)", subtitle: "Pechino Terminal 3 (scalo 05:50 - 00:25 del 01/12)" },
      { id: "d3-3", time: "00:25", type: "transport", title: "PEK → Auckland AKL", subtitle: "Air China CA783 · volo di notte", hasQR: true },
    ],
  },
  {
    id: "day-4",
    dayNumber: 4,
    date: "2026-12-01",
    dateLabel: "Mar 1 dic",
    dateShort: "1",
    monthShort: "dic",
    dayShort: "Mar",
    location: "Auckland, NZ",
    activities: [
      { id: "d4-1", time: "17:25", type: "transport", title: "Arrivo Auckland AKL", subtitle: "Dogana e ritiro auto a noleggio" },
      { id: "d4-2", time: "20:00", type: "hotel", title: "Check-in Noa Hotel", subtitle: "Auckland CBD" },
    ],
  },
  {
    id: "day-5",
    dayNumber: 5,
    date: "2026-12-02",
    dateLabel: "Mer 2 dic",
    dateShort: "2",
    monthShort: "dic",
    dayShort: "Mer",
    location: "Waitomo, NZ",
    activities: [
      { id: "d5-1", time: "09:00", type: "sightseeing", title: "Ritiro auto a noleggio · Auckland", subtitle: "Auckland Airport" },
      { id: "d5-2", time: "11:15", type: "sightseeing", title: "Hamilton Gardens", subtitle: "Hamilton, Nuova Zelanda (consigliato)", transitTime: "1h 30m" },
      { id: "d5-3", time: "13:30", type: "sightseeing", title: "Otorohanga Kiwi House", subtitle: "20 Alex Telfer Drive, Otorohanga", transitTime: "45m" },
      { id: "d5-4", time: "16:00", type: "sightseeing", title: "Mangapohue Natural Bridge", subtitle: "Te Anga Road, Waitomo", transitTime: "40m" },
      { id: "d5-5", time: "17:30", type: "sightseeing", title: "Waitomo Glowworm Caves", subtitle: "39 Waitomo Village Road — grotte bioluminescenti", transitTime: "15m" },
      { id: "d5-6", time: "22:00", type: "hotel", title: "Waitomo Village Chalets", subtitle: "Hotel Access Road, Waitomo", transitTime: "5m" },
    ],
  },
  {
    id: "day-6",
    dayNumber: 6,
    date: "2026-12-03",
    dateLabel: "Gio 3 dic",
    dateShort: "3",
    monthShort: "dic",
    dayShort: "Gio",
    location: "Rotorua, NZ",
    activities: [
      { id: "d6-1", time: "09:00", type: "sightseeing", title: "Hobbiton Movie Set", subtitle: "501 Buckland Road, Matamata" },
      { id: "d6-2", time: "13:00", type: "food", title: "Big Dog and Sheep — Pranzo a Tirau", subtitle: "Tirau i-SITE Visitor Information Centre" },
      { id: "d6-3", time: "15:00", type: "sightseeing", title: "Te Waihou Blue Spring", subtitle: "Whites Road, Putaruru" },
      { id: "d6-4", time: "17:30", type: "sightseeing", title: "Mitai Maori Village", subtitle: "196 Fairy Springs Road, Rotorua — Spettacolo culturale e cena tipica" },
      { id: "d6-5", time: "22:00", type: "hotel", title: "Wilie Court Motor Lodge", subtitle: "345 Fenton Street, Rotorua" },
    ],
  },
  {
    id: "day-7",
    dayNumber: 7,
    date: "2026-12-04",
    dateLabel: "Ven 4 dic",
    dateShort: "4",
    monthShort: "dic",
    dayShort: "Ven",
    location: "Tongariro NP, NZ",
    activities: [
      { id: "d7-1", time: "09:00", type: "sightseeing", title: "Redwoods Treewalk", subtitle: "1 Long Mile Road, Rotorua" },
      { id: "d7-2", time: "11:00", type: "sightseeing", title: "Polynesian Spa", subtitle: "1000 Hinemoa Street, Rotorua" },
      { id: "d7-3", time: "13:30", type: "sightseeing", title: "Waiotapu Thermal Wonderland", subtitle: "201 Waiotapu Loop Road" },
      { id: "d7-4", time: "15:30", type: "sightseeing", title: "Wairakei Terraces e Thermal Health Spa", subtitle: "Wairakei" },
      { id: "d7-5", time: "16:30", type: "sightseeing", title: "Cascate Huka", subtitle: "Wairakei, Taupo" },
      { id: "d7-6", time: "18:45", type: "hotel", title: "Skotel Alpine Resort", subtitle: "Tongariro National Park" },
    ],
  },
  {
    id: "day-8",
    dayNumber: 8,
    date: "2026-12-05",
    dateLabel: "Sab 5 dic",
    dateShort: "5",
    monthShort: "dic",
    dayShort: "Sab",
    location: "Levin, NZ",
    activities: [
      { id: "d8-1", time: "08:00", type: "sightseeing", title: "Trekking Tongariro Alpine Crossing", subtitle: "Trekking tra i vulcani attivi (19.4 km)" },
      { id: "d8-2", time: "17:00", type: "sightseeing", title: "Spostamento a Levin", subtitle: "Tempo guida: 2h 41m" },
      { id: "d8-3", time: "20:00", type: "hotel", title: "Totara Lodge Motel", subtitle: "15 Devon Street, Levin" },
    ],
  },
  {
    id: "day-9",
    dayNumber: 9,
    date: "2026-12-06",
    dateLabel: "Dom 6 dic",
    dateShort: "6",
    monthShort: "dic",
    dayShort: "Dom",
    location: "Wellington → Kaikoura, NZ",
    activities: [
      { id: "d9-0", time: "08:30", type: "sightseeing", title: "Partenza da Levin", subtitle: "Verso Wellington" },
      { id: "d9-1a", time: "10:00", type: "sightseeing", title: "Museum Te Papa Tongarewa", subtitle: "Wellington — Museo Nazionale Nuova Zelanda" },
      { id: "d9-1", time: "12:30", type: "transport", title: "Traghetto Wellington → Picton", subtitle: "Bluebridge Ferry (Livia) · Check-in tassativo ore 11:30", hasQR: true },
      { id: "d9-2", time: "16:15", type: "transport", title: "Arrivo Picton · Marlborough Sounds", subtitle: "Proseguire verso Kaikoura (Queen Charlotte Drive)" },
      { id: "d9-3", time: "21:00", type: "hotel", title: "Kaikoura Seaside Lodge", subtitle: "268 Esplanade, Kaikoura" },
    ],
  },
  {
    id: "day-10",
    dayNumber: 10,
    date: "2026-12-07",
    dateLabel: "Lun 7 dic",
    dateShort: "7",
    monthShort: "dic",
    dayShort: "Lun",
    location: "Arthur Pass, NZ",
    activities: [
      { id: "d10-1", time: "09:00", type: "sightseeing", title: "Kaikoura → Arthur Pass", subtitle: "Strada panoramica (tempo guida 4h 21m)" },
      { id: "d10-2", time: "18:00", type: "hotel", title: "Otira Stagecoach Hotel", subtitle: "6435 Otira Highway, Otira" },
    ],
  },
  {
    id: "day-11",
    dayNumber: 11,
    date: "2026-12-08",
    dateLabel: "Mar 8 dic",
    dateShort: "8",
    monthShort: "dic",
    dayShort: "Mar",
    // Nota: il docx indica Hokitika prima di Franz Josef in questa giornata
    location: "Hokitika → Franz Josef, NZ",
    activities: [
      { id: "d11-0", time: "09:00", type: "sightseeing", title: "Partenza da Otira", subtitle: "Otira Viaduct Lookout, 14408 Otira Highway" },
      { id: "d11-1", time: "10:00", type: "sightseeing", title: "Hokitika", subtitle: "Hokitika, West Coast NZ" },
      { id: "d11-2", time: "11:30", type: "sightseeing", title: "Hokitika Gorge", subtitle: "Kokatahi 7881 — Gola dal colore turchese" },
      { id: "d11-3", time: "14:00", type: "food", title: "Sosta pranzo a Franz Josef", subtitle: "Full Of Beans, Main Road, Franz Josef" },
      { id: "d11-4", time: "16:00", type: "sightseeing", title: "Franz Josef Glacier Walk", subtitle: "Passeggiata verso il fronte del ghiacciaio" },
      { id: "d11-5", time: "19:00", type: "hotel", title: "Haka House Franz Josef", subtitle: "2/4 Cron Street, Franz Josef Glacier" },
    ],
  },
  {
    id: "day-12",
    dayNumber: 12,
    date: "2026-12-09",
    dateLabel: "Mer 9 dic",
    dateShort: "9",
    monthShort: "dic",
    dayShort: "Mer",
    location: "Fox Glacier, NZ",
    activities: [
      { id: "d12-1", time: "08:30", type: "sightseeing", title: "Fox Glacier Helihike", subtitle: "Salita in elicottero e trekking sul ghiacciaio" },
      { id: "d12-2", time: "15:00", type: "sightseeing", title: "Lake Matheson Walk", subtitle: "Specchio riflesso del Monte Cook" },
      { id: "d12-3", time: "18:00", type: "hotel", title: "Ivorytowers Accommodation", subtitle: "33/35 Sullivans Road, Fox Glacier" },
    ],
  },
  {
    id: "day-13",
    dayNumber: 13,
    date: "2026-12-10",
    dateLabel: "Gio 10 dic",
    dateShort: "10",
    monthShort: "dic",
    dayShort: "Gio",
    location: "Wanaka → Cardrona, NZ",
    activities: [
      { id: "d13-0", time: "08:30", type: "sightseeing", title: "Partenza da Ivory Towers (Fox Glacier)", subtitle: "33/35 Sullivan Road, Franz Josef Glacier" },
      { id: "d13-1", time: "09:00", type: "sightseeing", title: "Lake Matheson", subtitle: "Lake Matheson Road — Specchio del Monte Cook" },
      { id: "d13-2", time: "12:00", type: "sightseeing", title: "Haast Pass", subtitle: "West Coast 9382 — Passo panoramico" },
      { id: "d13-3", time: "12:15", type: "sightseeing", title: "Fantail Falls", subtitle: "Cascata su Haast Pass (consigliato)" },
      { id: "d13-4", time: "13:30", type: "sightseeing", title: "Blue Pools", subtitle: "Blue Pools Track, Otago Region" },
      { id: "d13-5", time: "15:00", type: "sightseeing", title: "Wanaka", subtitle: "Lake Wanaka, Nuova Zelanda" },
      { id: "d13-6", time: "15:30", type: "sightseeing", title: "Roy's Peak Lookout", subtitle: "2 Glendhu Bay Road — Vista panoramica" },
      { id: "d13-7", time: "17:30", type: "hotel", title: "Cardrona Hotel", subtitle: "Cardrona Valley Road, Cardrona" },
    ],
  },
  {
    id: "day-14",
    dayNumber: 14,
    date: "2026-12-11",
    dateLabel: "Ven 11 dic",
    dateShort: "11",
    monthShort: "dic",
    dayShort: "Ven",
    location: "Eglinton Valley, NZ",
    activities: [
      { id: "d14-1", time: "09:00", type: "sightseeing", title: "Avvicinamento Milford Sound", subtitle: "Viaggio attraverso Eglinton Valley (guida 4h 28m)" },
      { id: "d14-2", time: "18:00", type: "hotel", title: "Knobs Flat Accommodation", subtitle: "Eglinton Valley" },
    ],
  },
  {
    id: "day-15",
    dayNumber: 15,
    date: "2026-12-12",
    dateLabel: "Sab 12 dic",
    dateShort: "12",
    monthShort: "dic",
    dayShort: "Sab",
    location: "Arrowtown, NZ",
    activities: [
      { id: "d15-1", time: "10:00", type: "sightseeing", title: "Milford Sound Cruise", subtitle: "Crociera panoramica sui fiordi (Fiordland)" },
      { id: "d15-2", time: "15:00", type: "sightseeing", title: "Milford Sound → Queenstown → Arrowtown", subtitle: "Tempo guida: 3h 54m" },
      { id: "d15-3", time: "19:00", type: "hotel", title: "Arrowtown Lodge", subtitle: "Arrowtown, Queenstown Area" },
    ],
  },
  {
    id: "day-16",
    dayNumber: 16,
    date: "2026-12-13",
    dateLabel: "Dom 13 dic",
    dateShort: "13",
    monthShort: "dic",
    dayShort: "Dom",
    location: "Lake Tekapo, NZ",
    activities: [
      { id: "d16-1", time: "10:00", type: "sightseeing", title: "Arrowtown → Lake Tekapo", subtitle: "Spostamento panoramico (tempo guida 3h 51m)" },
      { id: "d16-2", time: "21:00", type: "sightseeing", title: "Stargazing Monte John Observatory", subtitle: "Cielo stellato UNESCO Lake Tekapo" },
      { id: "d16-3", time: "23:00", type: "hotel", title: "Fairlie Holiday Park / Lodge", subtitle: "Lake Tekapo Area" },
    ],
  },
  {
    id: "day-17",
    dayNumber: 17,
    date: "2026-12-14",
    dateLabel: "Lun 14 dic",
    dateShort: "14",
    monthShort: "dic",
    dayShort: "Lun",
    location: "Christchurch → Adelaide, AU",
    activities: [
      { id: "d17-1", time: "10:00", type: "sightseeing", title: "Lake Tekapo → Christchurch Airport", subtitle: "Rilascio auto (tempo guida 2h 51m)" },
      { id: "d17-2", time: "18:20", type: "transport", title: "Volo Christchurch CHC → Adelaide ADL", subtitle: "Air New Zealand NZ261 · 2h 10m", hasQR: true },
      { id: "d17-3", time: "20:25", type: "transport", title: "Arrivo Adelaide", subtitle: "Ritiro auto e check-in alloggio" },
    ],
  },
  {
    id: "day-18",
    dayNumber: 18,
    date: "2026-12-15",
    dateLabel: "Mar 15 dic",
    dateShort: "15",
    monthShort: "dic",
    dayShort: "Mar",
    location: "Kangaroo Island, AU",
    activities: [
      { id: "d18-1", time: "08:00", type: "sightseeing", title: "Adelaide → Cape Jervis Ferry → KI", subtitle: "Traghetto auto e viaggio (tempo guida 5h 09m)" },
      { id: "d18-2", time: "13:00", type: "sightseeing", title: "Flinders Chase National Park", subtitle: "Remarkable Rocks, Admiral's Arch, Koala & Canguri" },
      { id: "d18-3", time: "19:00", type: "hotel", title: "Kangaroo Island Wilderness Retreat", subtitle: "Flinders Chase Area" },
    ],
  },
  {
    id: "day-19",
    dayNumber: 19,
    date: "2026-12-16",
    dateLabel: "Mer 16 dic",
    dateShort: "16",
    monthShort: "dic",
    dayShort: "Mer",
    location: "Adelaide → Melbourne, AU",
    activities: [
      { id: "d19-1", time: "15:00", type: "sightseeing", title: "Rientro ad Adelaide Airport", subtitle: "Rilascio auto" },
      { id: "d19-2", time: "19:00", type: "transport", title: "Volo Adelaide ADL → Melbourne MEL", subtitle: "Virgin Australia VA218 · 1h 50m", hasQR: true },
      { id: "d19-3", time: "20:45", type: "transport", title: "Arrivo Melbourne", subtitle: "Ritiro Van camperizzato e notte in campeggio" },
    ],
  },
  {
    id: "day-20",
    dayNumber: 20,
    date: "2026-12-17",
    dateLabel: "Gio 17 dic",
    dateShort: "17",
    monthShort: "dic",
    dayShort: "Gio",
    location: "Great Ocean Road, AU",
    activities: [
      { id: "d20-1", time: "09:00", type: "sightseeing", title: "Melbourne → Geelong → Great Ocean Road", subtitle: "Partenza viaggio on-road" },
      { id: "d20-2", time: "16:00", type: "sightseeing", title: "Dodici Apostoli (Twelve Apostles)", subtitle: "Tramonto panoramico (tempo guida 3h 39m)" },
      { id: "d20-3", time: "19:00", type: "hotel", title: "12 Apostles Campground", subtitle: "Port Campbell area" },
    ],
  },
  {
    id: "day-21",
    dayNumber: 21,
    date: "2026-12-18",
    dateLabel: "Ven 18 dic",
    dateShort: "18",
    monthShort: "dic",
    dayShort: "Ven",
    location: "Melbourne via Costa, AU",
    activities: [
      { id: "d21-1", time: "09:00", type: "sightseeing", title: "12 Apostles → Melbourne via Costa", subtitle: "Strada panoramica Great Ocean Road (guida 4h 42m)" },
      { id: "d21-2", time: "16:00", type: "sightseeing", title: "Melbourne City tour", subtitle: "Street art a Hosier Lane e lungofiume Yarra" },
      { id: "d21-3", time: "19:00", type: "hotel", title: "Melbourne Tourist Park", subtitle: "Melbourne Area" },
    ],
  },
  {
    id: "day-22",
    dayNumber: 22,
    date: "2026-12-19",
    dateLabel: "Sab 19 dic",
    dateShort: "19",
    monthShort: "dic",
    dayShort: "Sab",
    location: "Phillip Island, AU",
    activities: [
      { id: "d22-1", time: "10:00", type: "sightseeing", title: "Melbourne → Phillip Island", subtitle: "Spostamento (tempo guida 4h 02m)" },
      { id: "d22-2", time: "20:00", type: "sightseeing", title: "Penguin Parade", subtitle: "Parata dei pinguini nani al tramonto" },
      { id: "d22-3", time: "22:00", type: "hotel", title: "Tidal Campground", subtitle: "Phillip Island" },
    ],
  },
  {
    id: "day-23",
    dayNumber: 23,
    date: "2026-12-20",
    dateLabel: "Dom 20 dic",
    dateShort: "20",
    monthShort: "dic",
    dayShort: "Dom",
    location: "Wilson Promontory, AU",
    activities: [
      { id: "d23-1", time: "08:00", type: "sightseeing", title: "Wilsons Promontory NP hikes", subtitle: "Spiagge e percorsi naturali (tempo guida 0h 32m)" },
      { id: "d23-2", time: "19:00", type: "hotel", title: "Wilson Promontory Campsite", subtitle: "Wilson Promontory" },
    ],
  },
  {
    id: "day-24",
    dayNumber: 24,
    date: "2026-12-21",
    dateLabel: "Lun 21 dic",
    dateShort: "21",
    monthShort: "dic",
    dayShort: "Lun",
    location: "Metà strada Jervis Bay, AU",
    activities: [
      { id: "d24-1", time: "09:00", type: "sightseeing", title: "Wilson Promontory → NSW Coast", subtitle: "Lungo trasferimento stradale (tempo guida 6h 15m)" },
      { id: "d24-2", time: "18:00", type: "hotel", title: "Mid-way Coast Camping", subtitle: "NSW Coast" },
    ],
  },
  {
    id: "day-25",
    dayNumber: 25,
    date: "2026-12-22",
    dateLabel: "Mar 22 dic",
    dateShort: "22",
    monthShort: "dic",
    dayShort: "Mar",
    location: "Jervis Bay, AU",
    activities: [
      { id: "d25-1", time: "09:00", type: "sightseeing", title: "NSW Coast → Jervis Bay", subtitle: "Arrivo a Jervis Bay (tempo guida 5h 40m)" },
      { id: "d25-2", time: "15:00", type: "sightseeing", title: "Hyams Beach", subtitle: "Spiaggia di sabbia finissima bianca" },
      { id: "d25-3", time: "19:00", type: "hotel", title: "Jervis Bay Holiday Park", subtitle: "Jervis Bay" },
    ],
  },
  {
    id: "day-26",
    dayNumber: 26,
    date: "2026-12-23",
    dateLabel: "Mer 23 dic",
    dateShort: "23",
    monthShort: "dic",
    dayShort: "Mer",
    location: "Jervis Bay Tour, AU",
    activities: [
      { id: "d26-1", time: "10:00", type: "sightseeing", title: "Dolphin Watching Tour & Relax", subtitle: "Tour in barca per avvistamento fauna (guida 1h)" },
      { id: "d26-2", time: "19:00", type: "hotel", title: "Jervis Bay Cabin", subtitle: "Jervis Bay" },
    ],
  },
  {
    id: "day-27",
    dayNumber: 27,
    date: "2026-12-24",
    dateLabel: "Gio 24 dic",
    dateShort: "24",
    monthShort: "dic",
    dayShort: "Gio",
    location: "Blue Mountains, AU",
    activities: [
      { id: "d27-1", time: "09:00", type: "sightseeing", title: "Jervis Bay → Blue Mountains", subtitle: "Spostamento montano (tempo guida 3h)" },
      { id: "d27-2", time: "14:00", type: "sightseeing", title: "Tre Sorelle (Three Sisters) & Katoomba", subtitle: "Punti panoramici sulle Blue Mountains" },
      { id: "d27-3", time: "18:00", type: "hotel", title: "Katoomba Campsite", subtitle: "Blue Mountains" },
    ],
  },
  {
    id: "day-28",
    dayNumber: 28,
    date: "2026-12-25",
    dateLabel: "Ven 25 dic",
    dateShort: "25",
    monthShort: "dic",
    dayShort: "Ven",
    location: "Sydney CBD, AU",
    activities: [
      { id: "d28-1", time: "09:00", type: "sightseeing", title: "Consegna Van a Sydney", subtitle: "Fine noleggio camper" },
      { id: "d28-2", time: "13:00", type: "sightseeing", title: "Sydney Opera House & The Rocks", subtitle: "Esplorazione a piedi del porto" },
      { id: "d28-3", time: "18:00", type: "hotel", title: "Sydney Central Hotel", subtitle: "Sydney CBD" },
    ],
  },
  {
    id: "day-29",
    dayNumber: 29,
    date: "2026-12-26",
    dateLabel: "Sab 26 dic",
    dateShort: "26",
    monthShort: "dic",
    dayShort: "Sab",
    location: "Sydney / Bondi Beach, AU",
    activities: [
      { id: "d29-1", time: "10:00", type: "sightseeing", title: "Corso Surf Bondi Beach", subtitle: "Lezione di surf a Bondi Beach" },
      { id: "d29-2", time: "15:00", type: "sightseeing", title: "Bondi to Coogee Coastal Walk", subtitle: "Passeggiata sulle scogliere di Sydney" },
      { id: "d29-3", time: "19:00", type: "hotel", title: "Sydney Central Hotel", subtitle: "Sydney" },
    ],
  },
  {
    id: "day-30",
    dayNumber: 30,
    date: "2026-12-27",
    dateLabel: "Dom 27 dic",
    dateShort: "27",
    monthShort: "dic",
    dayShort: "Dom",
    location: "Sydney → Manila, PH",
    activities: [
      { id: "d30-1", time: "12:15", type: "transport", title: "Volo Sydney SYD → Manila MNL", subtitle: "Cebu Pacific 5J040 · 7h 55m", hasQR: true },
      { id: "d30-2", time: "17:55", type: "transport", title: "Arrivo Manila MNL", subtitle: "Check-in hotel transito aeroporto" },
      { id: "d30-3", time: "20:00", type: "hotel", title: "Manila Transit Hotel", subtitle: "Pasay City, Manila" },
    ],
  },
  {
    id: "day-31",
    dayNumber: 31,
    date: "2026-12-28",
    dateLabel: "Lun 28 dic",
    dateShort: "28",
    monthShort: "dic",
    dayShort: "Lun",
    location: "Manila City, PH",
    activities: [
      { id: "d31-1", time: "10:00", type: "sightseeing", title: "Giro storico Intramuros & Rizal Park", subtitle: "Manila coloniale spagnola" },
      { id: "d31-2", time: "19:00", type: "hotel", title: "Manila Transit Hotel", subtitle: "Manila" },
    ],
  },
  {
    id: "day-32",
    dayNumber: 32,
    date: "2026-12-29",
    dateLabel: "Mar 29 dic",
    dateShort: "29",
    monthShort: "dic",
    dayShort: "Mar",
    location: "Manila, PH",
    activities: [
      { id: "d32-1", time: "12:00", type: "sightseeing", title: "Relax & Preparazione Boracay", subtitle: "Organizzazione bagagli" },
      { id: "d32-2", time: "19:00", type: "hotel", title: "Manila Transit Hotel", subtitle: "Manila" },
    ],
  },
  {
    id: "day-33",
    dayNumber: 33,
    date: "2026-12-30",
    dateLabel: "Mer 30 dic",
    dateShort: "30",
    monthShort: "dic",
    dayShort: "Mer",
    location: "Manila → Boracay, PH",
    activities: [
      { id: "d33-1", time: "08:50", type: "transport", title: "Volo Manila MNL → Caticlan MPH", subtitle: "Cebu Pacific 5J899 · 1h 10m", hasQR: true },
      { id: "d33-2", time: "10:00", type: "transport", title: "Transfer Barca Caticlan → Boracay", subtitle: "Avvicinamento all'isola" },
      { id: "d33-3", time: "13:00", type: "hotel", title: "Check-in Boracay Resort", subtitle: "White Beach, Boracay" },
    ],
  },
  {
    id: "day-34",
    dayNumber: 34,
    date: "2026-12-31",
    dateLabel: "Gio 31 dic",
    dateShort: "31",
    monthShort: "dic",
    dayShort: "Gio",
    location: "Boracay Capodanno, PH",
    activities: [
      { id: "d34-1", time: "10:00", type: "sightseeing", title: "Relax White Beach", subtitle: "Giornata di mare a Boracay" },
      { id: "d34-2", time: "20:00", type: "sightseeing", title: "Cenone e Capodanno in spiaggia", subtitle: "White Beach Boracay" },
      { id: "d34-3", time: "23:00", type: "hotel", title: "Boracay Resort", subtitle: "Boracay" },
    ],
  },
  {
    id: "day-35",
    dayNumber: 35,
    date: "2027-01-01",
    dateLabel: "Ven 1 gen",
    dateShort: "1",
    monthShort: "gen",
    dayShort: "Ven",
    location: "Boracay → El Nido, PH",
    activities: [
      { id: "d35-1", time: "15:50", type: "transport", title: "Volo Caticlan MPH → El Nido ENI", subtitle: "Cebu Pacific DG5411 · 1h 10m", hasQR: true },
      { id: "d35-2", time: "17:00", type: "transport", title: "Arrivo El Nido & Transfer", subtitle: "Hotel check-in" },
      { id: "d35-3", time: "19:00", type: "hotel", title: "El Nido Beach Hotel", subtitle: "El Nido, Palawan" },
    ],
  },
  {
    id: "day-36",
    dayNumber: 36,
    date: "2027-01-02",
    dateLabel: "Sab 2 gen",
    dateShort: "2",
    monthShort: "gen",
    dayShort: "Sab",
    location: "Tao Expedition, PH",
    activities: [
      { id: "d36-1", time: "08:30", type: "sightseeing", title: "Tao Experience Expedition (Giorno 1)", subtitle: "El Nido → Coron (imbarco e inizio navigazione)" },
      { id: "d36-2", time: "17:00", type: "hotel", title: "Tao Island Campsite 1", subtitle: "Isola deserta arcipelago Linapacan" },
    ],
  },
  {
    id: "day-37",
    dayNumber: 37,
    date: "2027-01-03",
    dateLabel: "Dom 3 gen",
    dateShort: "3",
    monthShort: "gen",
    dayShort: "Dom",
    location: "Tao Expedition, PH",
    activities: [
      { id: "d37-1", time: "08:00", type: "sightseeing", title: "Tao Experience Expedition (Giorno 2)", subtitle: "Snorkeling in barriera corallina e relax" },
      { id: "d37-2", time: "17:00", type: "hotel", title: "Tao Island Campsite 2", subtitle: "Isola deserta" },
    ],
  },
  {
    id: "day-38",
    dayNumber: 38,
    date: "2027-01-04",
    dateLabel: "Lun 4 gen",
    dateShort: "4",
    monthShort: "gen",
    dayShort: "Lun",
    location: "Tao Expedition, PH",
    activities: [
      { id: "d38-1", time: "08:00", type: "sightseeing", title: "Tao Experience Expedition (Giorno 3)", subtitle: "Esplorazione isole e villaggi tradizionali" },
      { id: "d38-2", time: "17:00", type: "hotel", title: "Tao Island Campsite 3", subtitle: "Isola deserta" },
    ],
  },
  {
    id: "day-39",
    dayNumber: 39,
    date: "2027-01-05",
    dateLabel: "Mar 5 gen",
    dateShort: "5",
    monthShort: "gen",
    dayShort: "Mar",
    location: "Coron Town, PH",
    activities: [
      { id: "d39-1", time: "08:00", type: "sightseeing", title: "Tao Experience Expedition (Giorno 4)", subtitle: "Ultima navigazione e arrivo a Coron" },
      { id: "d39-2", time: "16:00", type: "hotel", title: "Coron Bay Hotel", subtitle: "Coron Town, Busuanga" },
    ],
  },
  {
    id: "day-40",
    dayNumber: 40,
    date: "2027-01-06",
    dateLabel: "Mer 6 gen",
    dateShort: "6",
    monthShort: "gen",
    dayShort: "Mer",
    location: "Coron Dugonghi, PH",
    activities: [
      { id: "d40-1", time: "07:00", type: "sightseeing", title: "Dugong Watching Quest", subtitle: "Escursione avvistamento dugonghi Coron" },
      { id: "d40-2", time: "19:00", type: "hotel", title: "Coron Bay Hotel", subtitle: "Coron" },
    ],
  },
  {
    id: "day-41",
    dayNumber: 41,
    date: "2027-01-07",
    dateLabel: "Gio 7 gen",
    dateShort: "7",
    monthShort: "gen",
    dayShort: "Gio",
    location: "Coron → Cebu, PH",
    activities: [
      { id: "d41-1", time: "16:55", type: "transport", title: "Busuanga USU → Cebu CEB", subtitle: "Philippine Airlines PR2681 · 1h 15m", hasQR: true },
      { id: "d41-2", time: "18:10", type: "transport", title: "Arrivo Cebu & Check-in", subtitle: "Hotel vicino aeroporto" },
      { id: "d41-3", time: "19:30", type: "hotel", title: "Cebu Airport Hotel", subtitle: "Lapu-Lapu City, Cebu" },
    ],
  },
  {
    id: "day-42",
    dayNumber: 42,
    date: "2027-01-08",
    dateLabel: "Ven 8 gen",
    dateShort: "8",
    monthShort: "gen",
    dayShort: "Ven",
    location: "Cebu City, PH",
    activities: [
      { id: "d42-1", time: "10:00", type: "sightseeing", title: "Giro città & Souvenir", subtitle: "Cebu City historical sites" },
      { id: "d42-2", time: "19:30", type: "hotel", title: "Cebu Airport Hotel", subtitle: "Cebu" },
    ],
  },
  {
    id: "day-43",
    dayNumber: 43,
    date: "2027-01-09",
    dateLabel: "Sab 9 gen",
    dateShort: "9",
    monthShort: "gen",
    dayShort: "Sab",
    location: "Cebu → Roma via Taipei",
    activities: [
      { id: "d43-1", time: "12:10", type: "transport", title: "Cebu CEB → Taipei → Roma FCO", subtitle: "China Airlines · Volo di rientro (17h 35m)", hasQR: true },
    ],
  },
  {
    id: "day-44",
    dayNumber: 44,
    date: "2027-01-10",
    dateLabel: "Dom 10 gen",
    dateShort: "10",
    monthShort: "gen",
    dayShort: "Dom",
    location: "Roma, FCO",
    activities: [
      { id: "d44-1", time: "08:00", type: "sightseeing", title: "Arrivo in Italia", subtitle: "Rientro a Roma (fine viaggio)" },
    ],
  },
];

// ── ACCOMMODATIONS (reali da vecchio progetto / seed.ts) ──────────────────────
// Prenotazioni confermate
export const ACCOMMODATIONS: Accommodation[] = [
  {
    id: "acc-waitomo",
    name: "Waitomo Village Chalets",
    city: "Waitomo",
    area: "Waitomo Village",
    checkIn: "2 dic · 22:00",
    checkOut: "3 dic · 10:00",
    dates: "2 – 3 dicembre 2026",
    note: "€ 69 · prenotazione confermata",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Hotel+Access+Road%2C+Waitomo+3977%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=200&q=80",
    price: 69,
  },
  {
    id: "acc-rotorua",
    name: "Wilie Court Motor Lodge",
    city: "Rotorua",
    area: "Fenton Street",
    checkIn: "3 dic · 22:00",
    checkOut: "4 dic · 10:00",
    dates: "3 – 4 dicembre 2026",
    note: "€ 109",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=345+Fenton+Street%2C+Rotorua+3010%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=80",
    price: 109,
  },
  {
    id: "acc-tongariro",
    name: "National Park Backpackers",
    city: "National Park",
    area: "Tongariro NP",
    checkIn: "4 dic · 20:00",
    checkOut: "5 dic · 09:00",
    dates: "4 – 5 dicembre 2026",
    note: "€ 48 · valutare se cambiare",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=4+Findlay+Street%2C+National+Park%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=200&q=80",
    price: 48,
  },
  {
    id: "acc-levin",
    name: "Totara Lodge Motel",
    city: "Levin",
    checkIn: "5 dic · 20:00",
    checkOut: "6 dic · 09:00",
    dates: "5 – 6 dicembre 2026",
    note: "€ 52",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=15+Devon+Street%2C+Levin+5510%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=200&q=80",
    price: 52,
  },
  {
    id: "acc-kaikoura",
    name: "Kaikoura Seaside Lodge",
    city: "Kaikoura",
    area: "Esplanade",
    checkIn: "6 dic · 21:00",
    checkOut: "7 dic · 10:00",
    dates: "6 – 7 dicembre 2026",
    note: "€ 51",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=268+Esplanade%2C+Kaikoura+7300%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=200&q=80",
    price: 51,
  },
  {
    id: "acc-otira",
    name: "Otira Stagecoach Hotel",
    city: "Otira",
    area: "Arthur Pass",
    checkIn: "7 dic · 20:00",
    checkOut: "8 dic · 09:00",
    dates: "7 – 8 dicembre 2026",
    note: "€ 74",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=6435+Otira+Highway%2C+Otira+7875%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1439130490301-25e322d88054?w=200&q=80",
    price: 74,
  },
  {
    id: "acc-franzjosef",
    name: "Haka House Franz Josef",
    city: "Franz Josef",
    area: "Glacier",
    checkIn: "8 dic · 19:00",
    checkOut: "9 dic · 09:00",
    dates: "8 – 9 dicembre 2026",
    note: "€ 69",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=2%2F4+Cron+Street%2C+Franz+Josef+Glacier+7886%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1544085701-4d42a990fd6d?w=200&q=80",
    price: 69,
  },
  {
    id: "acc-ivorytowers",
    name: "Ivorytowers Accommodation",
    city: "Fox Glacier",
    area: "Sullivans Road",
    checkIn: "9 dic · 19:00",
    checkOut: "10 dic · 09:00",
    dates: "9 – 10 dicembre 2026",
    note: "€ 49,80 · vicino ad Haast Pass",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=33%2F35+Sullivans+Road%2C+Fox+Glacier%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?w=200&q=80",
    price: 49.80,
  },
  {
    id: "acc-cardrona",
    name: "Cardrona Hotel",
    city: "Cardrona",
    area: "Cardrona Valley",
    checkIn: "10 dic · 19:00",
    checkOut: "11 dic · 09:00",
    dates: "10 – 11 dicembre 2026",
    note: "€ 79",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=2310+Cardrona+Valley+Road%2C+Cardrona%2C+New+Zealand",
    imageUrl: "https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=200&q=80",
    price: 79,
  },
];

// ── TRANSPORTS (reali da vecchio progetto / transport.tsx STATIC_TRANSPORT_ITEMS) ──
// Struttura compatibile con conflitti futuri: date ISO + time HH:MM
export const TRANSPORTS: Transport[] = [
  {
    id: "tr-train-1",
    date: "2026-11-28",
    dateLabel: "Sab 28 nov",
    time: "11:05",
    from: "Roma Termini",
    to: "Milano Centrale",
    type: "train",
    detail: "Trenitalia Frecciarossa · 1h 55m",
    arrivalTime: "14:15",
    importantNote: "Prezzo: 59,80 € · Tratta pre-volo",
    price: 59.80,
  },
  {
    id: "tr-flight-mxp-akl",
    date: "2026-11-29",
    dateLabel: "Dom 29 nov",
    time: "12:30",
    from: "Milano MXP",
    to: "Auckland AKL",
    type: "plane",
    detail: "Air China · via Pechino · 18h 35m scalo",
    bookingRef: "1688897340550151",
    importantNote: "Prezzo: 1.074,86 € · Scalo lungo a Pechino (18h 35m) - Terminal 3",
    segments: [
      { from: "MXP", to: "PEK", departure: "2026-11-29 12:30", arrival: "2026-11-30 05:50", operator: "Air China", flightNumber: "CA950" },
      { from: "PEK", to: "AKL", departure: "2026-12-01 00:25", arrival: "2026-12-01 17:25", operator: "Air China", flightNumber: "CA783" },
    ],
    layoverCity: "Pechino",
    price: 1074.86,
  },
  {
    id: "tr-ferry-wlg-pic",
    date: "2026-12-06",
    dateLabel: "Dom 6 dic",
    time: "12:30",
    from: "Wellington",
    to: "Picton",
    type: "ferry",
    detail: "Bluebridge · Nave Livia · 3h 45m",
    arrivalTime: "17:15",
    bookingRef: "1135407",
    baggageNote: "A mano fino 7 kg; bagaglio principale in auto",
    importantNote: "Costo: 356,13 € · Check-in tassativo 1 ora prima (ore 11:30 al terminal)",
    note: "Wellington Passenger Terminal, 50 Waterloo Quay",
    price: 356.13,
  },
  {
    id: "tr-flight-chc-adl",
    date: "2026-12-15",
    dateLabel: "Mar 15 dic",
    time: "15:25",
    from: "Christchurch CHC",
    to: "Adelaide ADL",
    type: "plane",
    detail: "Air New Zealand NZ261 · 2h 10m",
    arrivalTime: "17:35",
    bookingRef: "1688897637489031",
    importantNote: "Prezzo: 355,96 € · Volo modificato, verificare sul sito",
    segments: [
      { from: "CHC", to: "ADL", departure: "2026-12-15 15:25", arrival: "2026-12-15 17:35", operator: "Air New Zealand", flightNumber: "NZ261" },
    ],
    price: 355.96,
  },
  {
    id: "tr-flight-adl-mel",
    date: "2026-12-16",
    dateLabel: "Mer 16 dic",
    time: "19:50",
    from: "Adelaide ADL",
    to: "Melbourne MEL",
    type: "plane",
    detail: "Virgin Australia VA242 · 1h 50m",
    arrivalTime: "21:40",
    bookingRef: "1688897638041991",
    importantNote: "Prezzo: 121,04 €",
    segments: [
      { from: "ADL", to: "MEL", departure: "2026-12-16 19:50", arrival: "2026-12-16 21:40", operator: "Virgin Australia", flightNumber: "VA242" },
    ],
    price: 121.04,
  },
  {
    id: "tr-flight-syd-mnl",
    date: "2026-12-28",
    dateLabel: "Lun 28 dic",
    time: "12:15",
    from: "Sydney SYD",
    to: "Caticlan MPH",
    type: "plane",
    detail: "Cebu Pacific · via Manila · 5J040 + 5J899",
    bookingRef: "1688897853414407",
    baggageNote: "Bagaglio extra acquistato (da verificare)",
    importantNote: "Prezzo: 955,08 €",
    segments: [
      { from: "SYD", to: "MNL", departure: "2026-12-28 12:15", arrival: "2026-12-28 18:10", operator: "Cebu Pacific", flightNumber: "5J040" },
      { from: "MNL", to: "MPH", departure: "2026-12-29 08:50", arrival: "2026-12-29 10:00", operator: "Cebu Pacific", flightNumber: "5J899" },
    ],
    layoverCity: "Manila",
    price: 955.08,
  },
  {
    id: "tr-flight-mph-eni",
    date: "2027-01-01",
    dateLabel: "Ven 1 gen",
    time: "15:50",
    from: "Caticlan MPH",
    to: "El Nido ENI",
    type: "plane",
    detail: "Cebu Pacific DG5411 · 1h 10m",
    arrivalTime: "17:00",
    confirmationCode: "DG5411",
    baggageNote: "20 kg a testa (Go Easy) — Nunzio 11A · Giusy 11B",
    importantNote: "Assicurazione CEB TravelSure (Chubb) inclusa",
    segments: [
      { from: "MPH", to: "ENI", departure: "2027-01-01 15:50", arrival: "2027-01-01 17:00", operator: "Cebu Pacific / Cebgo" },
    ],
  },
  {
    id: "tr-flight-usu-ceb",
    date: "2027-01-08",
    dateLabel: "Ven 8 gen",
    time: "16:55",
    from: "Busuanga USU",
    to: "Cebu CEB",
    type: "plane",
    detail: "Philippine Airlines PR2681 · 1h 15m",
    arrivalTime: "18:10",
    bookingRef: "ZUT8YF",
    confirmationCode: "PR2681",
    baggageNote: "1 bagaglio stiva fino a 15 kg · Posto 06C",
    importantNote: "Giusy Reale Mrs · posto 06C confermato con supplemento",
  },
  {
    id: "tr-flight-ceb-fco",
    date: "2027-01-09",
    dateLabel: "Sab 9 gen",
    time: "12:10",
    from: "Cebu CEB",
    to: "Roma FCO",
    type: "plane",
    detail: "China Airlines · via Taipei · 17h 35m",
    arrivalTime: "07:15",
    bookingRef: "30598518",
    confirmationCode: "X8K0RM",
    baggageNote: "Franchigia da verificare",
    importantNote: "1 scalo a Taipei (8h 30m)",
    segments: [
      { from: "CEB", to: "TPE", departure: "2027-01-09 12:10", arrival: "2027-01-09 14:55", operator: "China Airlines", flightNumber: "CI0706" },
      { from: "TPE", to: "FCO", departure: "2027-01-09 23:25", arrival: "2027-01-10 07:15", operator: "China Airlines", flightNumber: "CI0075" },
    ],
    layoverCity: "Taipei",
  },
];

// ── BUDGET ────────────────────────────────────────────────────────────────────
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

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: "bc-1", label: "Trasporti", icon: "✈️", spent: 2608, budget: 4000 },
  { id: "bc-2", label: "Alloggi", icon: "🏨", spent: 480, budget: 3000 },
  { id: "bc-3", label: "Assicurazione", icon: "🛡️", spent: 294, budget: 300 },
  { id: "bc-4", label: "Cibo & Extra", icon: "🍜", spent: 320, budget: 4700 },
];

export const BUDGET_ENTRIES: BudgetEntry[] = [
  { id: "be-1", date: "18 giu", label: "Assicurazione Heymondo Premium", amount: 294, category: "Assicurazione" },
  { id: "be-2", date: "nov", label: "Volo MXP→PEK→AKL (Air China)", amount: 1075, category: "Trasporti" },
  { id: "be-3", date: "nov", label: "Treno Roma–Milano", amount: 60, category: "Trasporti" },
  { id: "be-4", date: "dic", label: "Volo CHC→ADL (Air NZ)", amount: 356, category: "Trasporti" },
  { id: "be-5", date: "dic", label: "Volo ADL→MEL (Virgin AU)", amount: 121, category: "Trasporti" },
  { id: "be-6", date: "dic", label: "Traghetto Wellington–Picton (Bluebridge)", amount: 356, category: "Trasporti" },
  { id: "be-7", date: "dic", label: "Volo SYD→MNL→Caticlan (Cebu Pacific)", amount: 955, category: "Trasporti" },
];

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

