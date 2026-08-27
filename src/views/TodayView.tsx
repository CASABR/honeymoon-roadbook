import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  DAYS,
  TODAY_DAY_ID,
  ACCOMMODATIONS,
  TRANSPORTS,
  getDaysToDeparture,
  getTodayLabel,
} from "../data/mockData";
import type { Activity, DayData, Accommodation } from "../data/mockData";
import {
  IcMapPin,
  IcCalendar,
  IcChevronRight,
  IcChevronLeft,
  IcChevronDown,
  IcQR,
  ActivityIcon,
} from "../components/Icons";
import { repository } from "../services/repository";
import type { Checklist } from "../services/repository";
import { EditActivitySheet } from "./TripView";

// ── helpers ───────────────────────────────────────────────────────────────────
function getPriorityActivity(
  activities: Activity[],
  completedIds: string[],
  isToday: boolean
): { activity: Activity | null; isCompletedAll: boolean } {
  if (!activities || activities.length === 0) return { activity: null, isCompletedAll: false };

  const uncompleted = activities.filter((a) => !completedIds.includes(a.id));
  if (uncompleted.length === 0) {
    return { activity: null, isCompletedAll: true };
  }

  // Priority a: status === "in_corso"
  const inCorso = uncompleted.find((a) => a.status === "in_corso");
  if (inCorso) return { activity: inCorso, isCompletedAll: false };

  // Priority b: if today's date, first uncompleted activity with time >= current time
  if (isToday) {
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const upcoming = uncompleted.find((a) => a.time && a.time >= currentHHMM);
    if (upcoming) return { activity: upcoming, isCompletedAll: false };
  }

  // Priority c: first uncompleted activity of the day
  return { activity: uncompleted[0], isCompletedAll: false };
}

function getToday(days: DayData[], dayId: string) {
  return days.find((d) => d.id === dayId) ?? days[0];
}

function getTomorrow(days: DayData[], dayId: string) {
  const idx = days.findIndex((d) => d.id === dayId);
  return idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
}

function getTodayAccommodation(dateISO?: string, accommodations?: Accommodation[], dayActivities?: Activity[]) {
  const list = accommodations && accommodations.length > 0 ? accommodations : ACCOMMODATIONS;
  
  if (dateISO) {
    // 1. Cerca prima negli alloggi confermati per intervallo date o checkIn
    const foundAcc = list.find((acc) => {
      if (acc.startDate && acc.endDate) {
        return dateISO >= acc.startDate && dateISO < acc.endDate; // La notte appartiene all'intervallo prima del checkout
      }
      return acc.checkIn?.includes(dateISO) || acc.dates?.includes(dateISO);
    });
    if (foundAcc) return foundAcc;

    // 2. Cerca nelle attività del giorno se c'è un'attività hotel
    if (dayActivities) {
      const hotelAct = dayActivities.find(a => a.type === "hotel");
      if (hotelAct) {
        return {
          id: hotelAct.id,
          name: hotelAct.title,
          city: hotelAct.subtitle || "In viaggio",
          checkIn: hotelAct.time ? `Check-in ${hotelAct.time}` : "In giornata",
          checkOut: "Giorno successivo",
          dates: dateISO,
          mapsUrl: hotelAct.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotelAct.title)}`,
          imageUrl: hotelAct.imageUrl,
          breakfast: undefined
        };
      }
    }

    // Se per quel giorno siamo in volo, scalo o transito e non c'è alloggio -> restituisce null
    return null;
  }
  return list[0];
}

export function cleanQueryForGeocoding(str: string): string {
  return str
    .replace(/\([^)]*\)/g, "") // Rimuove parentesi tonde e contenuto
    .replace(/\[[^\]]*\]/g, "") // Rimuove parentesi quadre e contenuto
    .replace(/—.*/g, "") // Rimuove trattini e contenuto successivo
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDurationFromText(text?: string): string | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  
  // Riconosce formati come: 1h 30m, 1h30m, 2h, 45m
  const hourMinMatch = clean.match(/(\d+)\s*h\s*(\d+)\s*m/);
  if (hourMinMatch) return `${hourMinMatch[1]}h ${hourMinMatch[2]}m`;
  
  const hourMatch = clean.match(/(\d+)\s*h/);
  if (hourMatch) {
    const minMatch = clean.match(/(\d+)\s*m(?!i)/);
    const minutes = minMatch ? ` ${minMatch[1]}m` : "";
    return `${hourMatch[1]}h${minutes}`;
  }
  
  const minOnlyMatch = clean.match(/(\d+)\s*m(in|inuti)?\b/);
  if (minOnlyMatch && !clean.includes("h")) {
    return `${minOnlyMatch[1]}m`;
  }
  
  // Riconosce formati come: 2 ore, 1 ora, 15 minuti
  const oreMatch = clean.match(/(\d+)\s*or(a|e)/);
  const minutiMatch = clean.match(/(\d+)\s*minut(o|i)/);
  if (oreMatch) {
    const mins = minutiMatch ? ` ${minutiMatch[1]}m` : "";
    return `${oreMatch[1]}h${mins}`;
  }
  if (minutiMatch) {
    return `${minutiMatch[1]}m`;
  }

  // Riconosce formato HH:MM (es. 1:30 o 01:30)
  const hhmmMatch = clean.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1]);
    const m = parseInt(hhmmMatch[2]);
    if (h > 0) {
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${m}m`;
  }

  return null;
}

export function cleanSubtitle(subtitle?: string): string | undefined {
  if (!subtitle) return undefined;
  
  // Se il sottotitolo è interamente una durata, nascondilo
  const duration = extractDurationFromText(subtitle);
  if (duration && subtitle.trim().length <= duration.length + 3) {
    return undefined;
  }
  
  if (duration) {
    // Altrimenti rimuovilo dal testo
    const clean = subtitle
      .replace(new RegExp(duration, "i"), "")
      .replace(/\(\s*\)/g, "") // Parentesi vuote rimaste
      .replace(/—\s*$/g, "") // Trattini pendenti rimasti
      .trim();
    return clean || undefined;
  }
  return subtitle;
}

export function getCachedTransitTime(act: Activity, nextAct?: Activity): string | undefined {
  // 1. Ritorno immediato se l'attività ha un transitTime esplicito (senza controlli successivi)
  if (act.transitTime) {
    if (act.title.includes("Roma Termini")) {
      console.log("[DEBUG] getCachedTransitTime hit act.transitTime per Roma-Milano:", act.transitTime);
    }
    return act.transitTime;
  }

  // 2. Ritorno se dal testo del titolo/sottotitolo è estratta una durata esplicita
  const extractedFromCurrent = extractDurationFromText(act.subtitle) || extractDurationFromText(act.title);
  if (extractedFromCurrent) return extractedFromCurrent;

  if (!nextAct) return undefined;

  // 3. Fallback alla cache OSRM (solo per percorsi sprovvisti di tempo esplicito)
  const fromQuery = cleanQueryForGeocoding(`${act.title}, ${act.subtitle || ""}`);
  const toQuery = cleanQueryForGeocoding(`${nextAct.title}, ${nextAct.subtitle || ""}`);

  const cacheKey = `hrb_route_${encodeURIComponent(fromQuery)}_${encodeURIComponent(toQuery)}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { duration } = JSON.parse(cached);
      return duration;
    } catch (_) {}
  }
  return undefined;
}

export function parseTransitTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const t = timeStr.toLowerCase().trim();
  let total = 0;
  
  const hrMatch = t.match(/(\d+)\s*h/);
  if (hrMatch) {
    total += parseInt(hrMatch[1]) * 60;
  }
  
  const minMatch = t.match(/(\d+)\s*m/);
  if (minMatch) {
    total += parseInt(minMatch[1]);
  }
  
  if (total === 0 && /^\d+$/.test(t)) {
    total = parseInt(t);
  }
  
  return total;
}

export function formatMinutesToHoursAndMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h`;
  }
  return `${minutes}m`;
}

// ── QR / Dettaglio trasporto Modal ────────────────────────────────────────────
function QRModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const [qrImages, setQrImages] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const images = qrImages[activity.id] ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    repository.getQRImages().then((data) => {
      setQrImages(data);
      setIsLoading(false);
    });
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File troppo grande (max 10 MB). Le immagini sono salvate solo nel browser locale.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const updatedList = [...images, dataUrl];
      const updated = { ...qrImages, [activity.id]: updatedList };
      setQrImages(updated);
      await repository.saveQRImages(updated);
      setCurrentIndex(updatedList.length - 1);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleRemove() {
    if (images.length === 0) return;
    const updatedList = images.filter((_, idx) => idx !== currentIndex);
    const updated = { ...qrImages };
    if (updatedList.length === 0) {
      delete updated[activity.id];
    } else {
      updated[activity.id] = updatedList;
    }
    setQrImages(updated);
    await repository.saveQRImages(updated);
    setCurrentIndex(Math.max(0, currentIndex - 1));
  }

  if (isLoading) return null;

  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Trasporto</p>
        <h2 className="text-[18px] font-extrabold text-gray-900 mb-1">{activity.title}</h2>
        <p className="text-[13px] text-gray-500 mb-4">{activity.subtitle}</p>

        {/* Area QR / Biglietto */}
        {images.length > 0 ? (
          <div className="mb-4">
            <div className="relative border border-gray-100 rounded-2xl overflow-hidden bg-gray-50 flex items-center justify-center min-h-[200px]">
              <img
                src={images[currentIndex]}
                alt={`Biglietto ${currentIndex + 1}`}
                className="w-full object-contain max-h-64"
              />
              {images.length > 1 && (
                <div className="absolute inset-y-0 inset-x-0 flex items-center justify-between px-2 pointer-events-none">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1)); }}
                    className="w-8 h-8 rounded-full bg-black/60 text-white font-bold flex items-center justify-center hover:bg-black/80 pointer-events-auto active:scale-90"
                  >
                    ‹
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0)); }}
                    className="w-8 h-8 rounded-full bg-black/60 text-white font-bold flex items-center justify-center hover:bg-black/80 pointer-events-auto active:scale-90"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === currentIndex ? "bg-blue-600 w-3" : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 mt-3">
              <label className="cursor-pointer text-[12px] bg-blue-50 text-blue-600 font-extrabold px-3 py-2 rounded-xl flex-1 text-center hover:bg-blue-100 transition-colors">
                ➕ Aggiungi altro
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <button
                onClick={handleRemove}
                className="text-[12px] bg-red-50 text-red-500 font-extrabold px-3 py-2 rounded-xl flex-1 text-center hover:bg-red-100 transition-colors"
              >
                🗑 Rimuovi corrente
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center mt-2.5">
              File {currentIndex + 1} di {images.length}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-5 flex flex-col items-center gap-3 mb-4 border border-dashed border-gray-200">
            <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center">
              <IcQR size={48} className="text-gray-400" />
            </div>
            <p className="text-[12px] text-gray-400 text-center">Nessuna foto biglietto allegata</p>
            <label className="cursor-pointer bg-blue-600 text-white text-[12px] font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
              📷 Aggiungi foto biglietto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
              ⚠️ Salvata solo nel browser locale (max 10 MB).
              Si perde se si pulisce la cache.
            </p>
          </div>
        )}

        {activity.status === "in_corso" && (
          <span className="badge-in-corso mb-4 block w-fit">In corso</span>
        )}
        <button
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── Selettore data (calendario leggero) ───────────────────────────────────────
function DatePickerSheet({
  selectedDayId,
  onSelect,
  onClose,
}: {
  selectedDayId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900 mb-1">Seleziona giorno</h2>
        <p className="text-[12px] text-gray-400 mb-5">
          Scegli il giorno del viaggio da visualizzare in "Oggi"
        </p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto hide-scrollbar">
          {DAYS.map((d, idx) => {
            const isToday = d.id === TODAY_DAY_ID;
            const isSelected = d.id === selectedDayId;
            return (
              <button
                key={d.id}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                  isToday
                    ? "bg-emerald-50 border-2 border-emerald-500 shadow-sm"
                    : isSelected
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-gray-50"
                }`}
                onClick={() => {
                  onSelect(d.id);
                  onClose();
                }}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  isToday ? "bg-emerald-600 text-white font-black" : "bg-white border border-gray-200"
                }`}>
                  <span className={`text-[12px] font-bold ${isToday ? "text-white" : "text-gray-700"}`}>{idx + 1}</span>
                </div>
                <div>
                  <p className={`text-[13px] font-semibold ${isToday ? "text-emerald-950 font-bold" : "text-gray-900"}`}>{d.dateLabel}</p>
                  <p className={`text-[11px] ${isToday ? "text-emerald-700 font-medium" : "text-gray-400"}`}>{d.location}</p>
                </div>
                {isToday && (
                  <span className="ml-auto text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    META CORRENTE / OGGI
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── Modal riepilogo giorno completo ───────────────────────────────────────────
function DayFullModal({
  activities,
  dayLabel,
  onClose,
}: {
  activities: Activity[];
  dayLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900 mb-4">{dayLabel}</h2>
        <div className="space-y-2">
          {activities.map((act) => (
            <div key={act.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
              <span className="text-[12px] font-bold text-blue-700 w-10 flex-shrink-0 pt-0.5">{act.time}</span>
              <ActivityIcon type={act.type} size={14} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 leading-snug truncate">{act.title}</p>
                <p className="text-[11px] text-gray-400 truncate">{act.subtitle}</p>
              </div>
              {act.hasQR && <IcQR size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />}
            </div>
          ))}
        </div>
        <button
          className="w-full mt-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── Classificazione esplicita delle tappe in 3 Categorie ─────────────────────────
export type RoutingCategory = "REAL_DRIVING" | "MAP_POINT_ONLY" | "TOTAL_EXCLUSION";

export function getActivityRoutingCategory(activity: Activity): RoutingCategory {
  const title = (activity.title || "").toLowerCase();
  const subtitle = (activity.subtitle || "").toLowerCase();
  const combined = `${title} ${subtitle}`;

  // 1. Esclusioni Totali dal routing (Treni, Voli, Traghetto, Note Aeroportuali e Pause astratte)
  const totalExclusions = [
    "treno", "frecciarossa", "train", "ferrovia",
    "volo", "flight", "scalo", "air china", "cebu pacific", "virgin", "philippine", "air new zealand",
    "traghetto", "ferry", "bluebridge",
    "scalo tecnico", "notte in volo", "dogana e ritiro", "tempo libero", "relax", "riposo"
  ];
  if (activity.type === "transport" && (title.includes("treno") || title.includes("volo") || title.includes("traghetto"))) {
    return "TOTAL_EXCLUSION";
  }
  if (totalExclusions.some(k => combined.includes(k))) {
    return "TOTAL_EXCLUSION";
  }

  // 2. Alloggi (Hotel / Resort / Motor Lodge): appartengono SEMPRE al routing stradale se sono partenza/arrivo del giorno
  if (activity.type === "hotel" || combined.includes("hotel") || combined.includes("resort") || combined.includes("lodge") || combined.includes("hostel") || combined.includes("chalet") || combined.includes("motel")) {
    return "REAL_DRIVING";
  }

  // 3. Punti Mappa / Soste Informative (Da mostrare su Maps, ma NON da calcolare come tratti auto)
  const mapPointKeywords = [
    "check-in", "check in", "check-out", "check out",
    "colazione", "pranzo", "cena", "ristorante", "trattoria", "pizzeria", "aperitivo",
    "passeggiata", "spesa", "shopping"
  ];
  if (mapPointKeywords.some(k => combined.includes(k))) {
    return "MAP_POINT_ONLY";
  }

  // 4. Tappe vere da routing auto (Spostamenti stradali reali tra mete georiferibili)
  const actAny = activity as any;
  const hasGeoData = !!(actAny.lat || actAny.latitude || actAny.mapsUrl);
  const hasNumbers = /\d+/.test(subtitle);
  const streetIndicators = ["road", "street", "drive", "avenue", "way", "highway", "via", "piazza", "viale", "corso", "park", "grotte", "caves", "village"];
  const hasStreet = streetIndicators.some(ind => subtitle.includes(ind) || title.includes(ind));

  if (hasGeoData || hasNumbers || hasStreet || activity.type === "sightseeing" || title.length > 3) {
    return "REAL_DRIVING";
  }

  return "MAP_POINT_ONLY";
}

function hasAddress(activity: Activity): boolean {
  return getActivityRoutingCategory(activity) === "REAL_DRIVING";
}

export function isAttraction(activity: Activity): boolean {
  if (activity.type === "transport" || activity.type === "hotel") return false;
  
  const title = activity.title ? activity.title.toLowerCase() : "";
  const subtitle = activity.subtitle ? activity.subtitle.toLowerCase() : "";
  const combined = `${title} ${subtitle}`;

  // Escludi cene, colazioni, pranzi, ristoranti
  const foodKeywords = ["cena", "pranzo", "colazione", "ristorante", "trattoria", "pizzeria", "aperitivo", "bistrot", "dinner", "lunch", "breakfast", "restaurant"];
  if (foodKeywords.some(k => combined.includes(k))) return false;

  // Escludi passeggiate generiche, tempo libero, relax
  const genericKeywords = ["passeggiata", "camminata", "tempo libero", "relax", "riposo", "giro libero", "shopping", "spesa"];
  if (genericKeywords.some(k => combined.includes(k))) return false;

  // Escludi check-in, check-out, noleggio auto
  const logisticsKeywords = ["check-in", "check in", "check-out", "check out", "noleggio", "ritiro auto", "consegna auto"];
  if (logisticsKeywords.some(k => combined.includes(k))) return false;

  // Includi attrazioni reali: tipo sightseeing, o con prenotazione/ticket/howToGetThere/price o keyword di attrazione
  if (activity.type === "sightseeing") return true;
  if (activity.bookingRef || activity.ticketUrl || activity.isBooked || activity.howToGetThere || activity.price || activity.hasQR) return true;

  // Keyword per attrazioni o visite reali
  const attractionKeywords = ["visita", "grotta", "grotte", "escursione", "tour", "parco", "museo", "museum", "ingresso", "ticket", "biglietto", "tempio", "temple", "cascata", "falls", "geyser", "sanctuary", "island", "isola", "spiaggia", "beach", "cruise", "crociera", "helihike", "stargazing"];
  if (attractionKeywords.some(k => combined.includes(k))) return true;

  return false;
}

export function shouldCalculateDriving(act: Activity, nextAct: Activity): boolean {
  if (getActivityRoutingCategory(act) !== "REAL_DRIVING" || getActivityRoutingCategory(nextAct) !== "REAL_DRIVING") {
    return false;
  }
  
  const combined = `${act.title} ${act.subtitle || ""} ${nextAct.title} ${nextAct.subtitle || ""}`.toLowerCase();
  
  // Escludi passaggi tra nazioni non confinanti
  const isNZ = combined.includes("nz") || combined.includes("auckland") || combined.includes("waitomo") || combined.includes("rotorua") || combined.includes("tongariro") || combined.includes("levin") || combined.includes("wellington") || combined.includes("picton") || combined.includes("kaikoura") || combined.includes("arthur pass") || combined.includes("hokitika") || combined.includes("franz josef") || combined.includes("fox glacier") || combined.includes("wanaka") || combined.includes("cardrona") || combined.includes("milford") || combined.includes("queenstown") || combined.includes("arrowtown") || combined.includes("tekapo") || combined.includes("christchurch");
  const isAU = combined.includes("adelaide") || combined.includes("kangaroo") || combined.includes("melbourne") || combined.includes("great ocean") || combined.includes("apostles") || combined.includes("phillip island") || combined.includes("wilsons prom") || combined.includes("jervis") || combined.includes("blue mountains") || combined.includes("sydney") || combined.includes("jervis bay") || combined.includes("katoomba");
  const isPH = combined.includes("manila") || combined.includes("boracay") || combined.includes("caticlan") || combined.includes("el nido") || combined.includes("coron") || combined.includes("cebu") || combined.includes("busuanga") || combined.includes("linapacan");
  
  let regions = 0;
  if (isNZ) regions++;
  if (isAU) regions++;
  if (isPH) regions++;
  
  if (regions > 1) return false;
  
  return true;
}

export function isDrivingTransit(act: Activity, nextAct?: Activity, transportsList?: any[], dayDate?: string): boolean {
  if (!nextAct) return false;
  
  if (transportsList && dayDate) {
    const matchTr1 = act.type === "transport" ? transportsList.find(tr => {
      if (tr.date !== dayDate) return false;
      const actTitleLower = act.title.toLowerCase();
      const trFromLower = tr.from.toLowerCase();
      const trToLower = tr.to.toLowerCase();
      return actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
    }) : null;

    const matchTr2 = nextAct.type === "transport" ? transportsList.find(tr => {
      if (tr.date !== dayDate) return false;
      const actTitleLower = nextAct.title.toLowerCase();
      const trFromLower = tr.from.toLowerCase();
      const trToLower = tr.to.toLowerCase();
      return actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
    }) : null;

    const t1 = matchTr1?.type;
    const t2 = matchTr2?.type;
    
    if (t1 === "plane" || t2 === "plane" || t1 === "train" || t2 === "train" || t1 === "ferry" || t2 === "ferry") {
      return false; // Structured data says it's a flight, train, or ferry
    }
  }

  const combinedText = `${act.title} ${act.subtitle || ""} ${nextAct.title} ${nextAct.subtitle || ""}`.toLowerCase();
  const nonDrivingIndicators = [
    "volo", "flight", "scalo", "air china", "cebu", "virgin", "philippine", "air new zealand",
    "treno", "frecciarossa", "train", "ferrovia",
    "traghetto", "ferry", "nave", "boat",
    "layover", "transito",
    "cammino", "piedi", "walk", "trekking"
  ];
  
  return !nonDrivingIndicators.some(indicator => combinedText.includes(indicator));
}

function buildMapsUrl(activity: Activity, dayLocation?: string) {
  const actAny = activity as any;
  if (actAny.mapsUrl) return actAny.mapsUrl;
  const queryParts = [activity.title];
  if (activity.subtitle && activity.subtitle !== "Attività del giorno" && !activity.subtitle.includes("Dettagli") && !activity.subtitle.includes("noleggio")) {
    queryParts.push(activity.subtitle);
  } else if (dayLocation) {
    queryParts.push(dayLocation);
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(", ").trim())}`;
}

/*
function buildDayItineraryUrl(activities: Activity[], filter: "all" | "morning" | "afternoon" = "all"): string {
  const filtered = activities.filter(a => {
    if (!a.time) return filter === "all";
    const hourMatch = a.time.match(/^(\d{1,2})/);
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : 12;
    if (filter === "morning") return hour < 13;
    if (filter === "afternoon") return hour >= 13;
    return true;
  });
  const withLocation = filtered.filter(a => {
    const q = a.subtitle && a.subtitle !== "Attività del giorno" ? a.subtitle : a.title;
    return q && q.trim().length > 2;
  });
  if (withLocation.length === 0) return "https://www.google.com/maps";
  const makeQ = (a: Activity) =>
    a.subtitle && a.subtitle !== "Attività del giorno"
      ? `${a.title}, ${a.subtitle}`
      : a.title;
  if (withLocation.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(makeQ(withLocation[0]).trim())}`;
  }
  const origin = encodeURIComponent(makeQ(withLocation[0]));
  const destination = encodeURIComponent(makeQ(withLocation[withLocation.length - 1]));
  const waypoints = withLocation
    .slice(1, -1)
    .map(a => encodeURIComponent(makeQ(a)))
    .join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}
*/

// ── Popup dedicato Indicazioni Copilota ───────────────────────────────────────
function CopilotaPopup({
  activity,
  onClose,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-widest text-blue-600 uppercase mb-0.5">
              🚗 Indicazioni Copilota
            </p>
            <h2 className="text-[16px] font-extrabold text-gray-900 leading-snug line-clamp-2">
              {activity.title}
            </h2>
            {activity.time && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Ore {activity.time}
              </p>
            )}
          </div>
        </div>

        {/* Corpo: solo howToGetThere */}
        {activity.howToGetThere ? (
          <div className="bg-blue-50/60 border border-blue-100/80 rounded-2xl p-4 mb-5">
            <p className="text-[11px] font-black text-blue-700 uppercase tracking-wider mb-2">
              Come arrivare / Indicazioni
            </p>
            <p className="text-[13.5px] text-blue-950 font-medium leading-relaxed">
              {activity.howToGetThere}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-5 mb-5 text-center">
            <p className="text-[13px] text-gray-400 font-medium">
              Nessuna indicazione inserita.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Premi "Modifica" per aggiungere le indicazioni per il copilota.
            </p>
          </div>
        )}

        {/* Azioni */}
        {confirmDelete ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-3 mb-3 text-center space-y-2">
            <p className="text-[12px] font-bold text-red-700">
              Cancellare le indicazioni copilota per questa attività?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold text-[13px]"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  onDelete?.();
                  onClose();
                }}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white font-bold text-[13px]"
              >
                Sì, elimina
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-11 h-11 flex items-center justify-center rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors active:scale-95"
                title="Elimina indicazioni copilota"
              >
                🗑️
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="flex-1 h-11 rounded-2xl bg-blue-600 text-white font-semibold text-[14px] hover:bg-blue-700 transition-colors active:scale-95"
            >
              ✏️ Modifica
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px] hover:bg-gray-200 transition-colors"
            >
              Chiudi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline row ──────────────────────────────────────────────────────────────
const VISIBLE_COUNT = 4;

function TimelineRow({
  activity,
  nextActivity,
  transitTime,
  prevAccommodation,
  isActive,
  isFirst,
  isLast,
  onQRTap,
  onEdit,
  completed,
  onToggle,
  dayLocation,
  dayDate,
  transportsList,
  accommodationsList,
}: {
  activity: Activity;
  nextActivity?: Activity;
  transitTime?: string;
  prevAccommodation?: any;
  isActive: boolean;
  isFirst?: boolean;
  isLast: boolean;
  onQRTap: (act: Activity) => void;
  onEdit: () => void;
  completed: boolean;
  onToggle: () => void;
  dayLocation?: string;
  dayDate?: string;
  transportsList?: any[];
  accommodationsList?: any[];
}) {
  const [copiedPnr, setCopiedPnr] = useState(false);
  const [copilotaOpen, setCopilotaOpen] = useState(false);
  const isTransport = activity.type === "transport";
  const showMaps = hasAddress(activity);
  const mapsUrl = buildMapsUrl(activity, dayLocation);

  const matchedTr = transportsList && dayDate && activity.type === "transport"
    ? transportsList.find(tr => {
        if (tr.date !== dayDate) return false;
        const actTitleLower = activity.title.toLowerCase();
        const actSubLower = activity.subtitle.toLowerCase();
        const trFromLower = tr.from.toLowerCase();
        const trToLower = tr.to.toLowerCase();
        const cityMatch = actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
        const codeMatch = tr.carrierCode && (actTitleLower.includes(tr.carrierCode.toLowerCase()) || actSubLower.includes(tr.carrierCode.toLowerCase()));
        return cityMatch || codeMatch;
      })
    : undefined;

  const matchedAcc = accommodationsList && dayDate && activity.type === "hotel"
    ? accommodationsList.find(acc => {
        const dateMatch = acc.startDate === dayDate || acc.endDate === dayDate;
        if (!dateMatch) return false;
        const actTitleLower = activity.title.toLowerCase();
        const accNameLower = acc.name.toLowerCase();
        return actTitleLower.includes(accNameLower) || accNameLower.includes(actTitleLower) || actTitleLower.includes("hotel") || actTitleLower.includes("alloggio");
      })
    : undefined;

  const pnr = activity.bookingRef || matchedTr?.bookingRef || matchedTr?.confirmationCode || matchedAcc?.bookingRef || matchedAcc?.confirmationCode;
  const timeBefore = activity.timeBeforehand;
  const carrierCode = matchedTr?.carrierCode;
  const seat = matchedTr?.seat;
  const gate = matchedTr?.gate;
  const terminal = matchedTr?.terminal;
  const logistics = activity.howToGetThere;
  const baggageNote = matchedTr?.baggageNote || matchedTr?.baggageCabin || matchedTr?.baggageHand;

  return (
    <div className="space-y-0">
      {/* Distanza da alloggio precedente se prima tappa */}
      {isFirst && prevAccommodation && (
        <div className="my-1.5 flex items-center gap-2 text-[10px] font-extrabold tracking-wider uppercase pl-12 pb-1">
          <span className="text-blue-600/90 shrink-0">🏨 Da alloggio ({prevAccommodation.name || prevAccommodation.city}):</span>
          <span className="px-2 py-0.5 rounded-full font-black text-[10px] border bg-blue-50 border-blue-100/60 text-blue-600">
            {transitTime || "—"}
          </span>
          <div className="flex-1 border-t border-dashed border-blue-200/60" />
        </div>
      )}

      <div className={`flex gap-2 items-start transition-opacity ${completed ? "opacity-50" : ""}`}>
        <div className="w-8 pt-1 flex-shrink-0 text-right">
          <span className={`font-semibold ${isActive ? "text-blue-700 text-[13px] font-black" : "text-gray-450 text-[11.5px]"} ${completed ? "line-through text-gray-300" : ""}`}>
            {activity.time}
          </span>
        </div>
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 24, marginTop: 4 }}>
        <div className={`rounded-full flex-shrink-0 transition-all duration-300 ${
          isActive ? "bg-blue-600 w-5 h-5 shadow-md shadow-blue-500/20 ring-4 ring-blue-100/50"
            : isTransport ? "bg-blue-500 w-3.5 h-3.5"
            : "bg-white border-2 border-gray-300 w-3.5 h-3.5"
        } ${completed ? "!border-emerald-500 !bg-emerald-500 shadow-none ring-0" : ""}`} />
        {!isLast && <div className="flex-1 w-0.5 bg-gray-200 mt-1" style={{ minHeight: 32 }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`min-w-0 mb-2 app-card p-3 cursor-pointer transition-all duration-300 border ${
            isActive
              ? "border-l-4 border-l-blue-500 border-blue-200 bg-blue-50/5 shadow-md shadow-blue-500/5"
              : "bg-white border-gray-150/70"
          }`}
          onClick={onEdit}
        >
          {isActive && isTransport ? (
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">Trasporto</p>
                <p className={`font-bold text-[15px] text-gray-900 leading-snug ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                {activity.status === "in_corso" && <span className="badge-in-corso mt-1">In corso</span>}
              </div>
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {showMaps && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Apri posizione su Google Maps"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-90 transition-transform flex items-center justify-center shrink-0 border border-blue-100/50"
                  >
                    <IcMapPin size={13} className="text-blue-600" />
                  </a>
                )}
                {activity.hasQR && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQRTap(activity);
                    }}
                    className={`active:scale-95 transition-transform flex items-center justify-center shrink-0 ${
                      isActive
                        ? "p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-200/80 ring-4 ring-blue-100/70"
                        : "p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl"
                    }`}
                    title="Visualizza Biglietti"
                  >
                    <IcQR size={isActive ? 24 : 20} className={isActive ? "text-white" : "text-gray-600"} />
                  </button>
                )}
                <IcChevronRight size={16} className="text-gray-400" />
              </div>
            </div>
          ) : isTransport ? (
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ActivityIcon type={activity.type} size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isActive && !completed && (
                      <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-widest shrink-0">
                        Ora / Prossimo
                      </span>
                    )}
                    <p className={`text-[13px] font-semibold text-gray-700 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                    {activity.price !== undefined && (
                      <span className={`text-[8.5px] font-extrabold px-1 py-0.2 rounded uppercase shrink-0 ${
                        activity.isPaid
                          ? "bg-green-55 text-green-600 border border-green-100"
                          : "bg-red-50 text-red-500 border border-red-100"
                      }`}>
                        €{activity.price} · {activity.isPaid ? "Pagato" : "Da pagare"}
                      </span>
                    )}
                  </div>
                  <p className={`text-[12px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {showMaps && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Apri posizione su Google Maps"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-90 transition-transform flex items-center justify-center shrink-0 border border-blue-100/50"
                  >
                    <IcMapPin size={13} className="text-blue-600" />
                  </a>
                )}
                {activity.hasQR && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQRTap(activity);
                    }}
                    className={`active:scale-95 transition-transform flex items-center justify-center shrink-0 ${
                      isActive
                        ? "p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-200/80 ring-4 ring-blue-100/70"
                        : "p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                    }`}
                    title="Visualizza Biglietti"
                  >
                    <IcQR size={isActive ? 24 : 18} className={isActive ? "text-white" : "text-gray-500"} />
                  </button>
                )}
              </div>
            </div>
          ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                  <ActivityIcon type={activity.type} size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isActive && !completed && (
                        <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-widest shrink-0">
                          Ora / Prossimo
                        </span>
                      )}
                      <p className={`text-[13px] font-semibold text-gray-700 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                      {activity.price !== undefined && (
                        <span className={`text-[8.5px] font-extrabold px-1 py-0.2 rounded uppercase shrink-0 ${
                          activity.isPaid
                            ? "bg-green-55 text-green-600 border border-green-100"
                            : "bg-red-50 text-red-500 border border-red-100"
                        }`}>
                          €{activity.price} · {activity.isPaid ? "Pagato" : "Da pagare"}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11.5px] text-gray-400 truncate mt-0.5 ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {showMaps && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Apri posizione su Google Maps"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-90 transition-transform flex items-center justify-center shrink-0 border border-blue-100/50"
                    >
                      <IcMapPin size={13} className="text-blue-600" />
                    </a>
                  )}
                {activity.hasQR && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQRTap(activity);
                    }}
                    className={`active:scale-95 transition-transform flex items-center justify-center shrink-0 ${
                      isActive
                        ? "p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-200/80 ring-4 ring-blue-100/70"
                        : "p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                    }`}
                    title="Visualizza Biglietti"
                  >
                    <IcQR size={isActive ? 24 : 18} className={isActive ? "text-white" : "text-gray-500"} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className="w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95"
                  style={{
                    borderColor: completed ? "#10b981" : "#d1d5db",
                    backgroundColor: completed ? "#10b981" : "transparent"
                  }}
                >
                  {completed && <span className="text-white text-[10px] font-bold">✓</span>}
                </button>
              </div>
            </div>
          )}

          {/* Dati pratici a colpo d'occhio (Copilota & Offline) */}
          {(pnr || timeBefore || carrierCode || seat || gate || terminal || logistics || baggageNote) && (
            <div className="mt-2.5 pt-2 border-t border-slate-100/80 space-y-2 text-[11px] text-gray-500">
              {/* Riga PNR, Volo e Posti */}
              {(pnr || carrierCode || seat) && (
                <div className="flex flex-wrap items-center gap-2 justify-between bg-slate-50/60 border border-slate-100/80 rounded-lg px-2 py-1.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {carrierCode && (
                      <span className="font-extrabold text-blue-600 bg-blue-50 border border-blue-100/50 px-1 rounded text-[10px] tracking-wider uppercase shrink-0">
                        ✈️ {carrierCode} {terminal ? `(T${terminal})` : ""}
                      </span>
                    )}
                    {seat && (
                      <span className="font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1 rounded text-[10px] shrink-0">
                        💺 Posto {seat}
                      </span>
                    )}
                    {gate && (
                      <span className="font-bold text-amber-700 bg-amber-50 border border-amber-100/50 px-1 rounded text-[10px] shrink-0">
                        🚪 Gate {gate}
                      </span>
                    )}
                  </div>
                  {pnr && (
                    <div className="flex items-center gap-1 ml-auto shrink-0 min-w-0">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">PNR:</span>
                      <span className="font-mono font-black text-[11.5px] text-gray-800 bg-white border border-slate-200 px-1.5 py-0.2 rounded shrink-0">
                        {pnr}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(pnr);
                          setCopiedPnr(true);
                          setTimeout(() => setCopiedPnr(false), 2000);
                        }}
                        className={`p-1 rounded-md border transition-all active:scale-95 shrink-0 ${
                          copiedPnr
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-white text-gray-405 border-slate-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-100"
                        }`}
                        title="Copia codice prenotazione"
                      >
                        {copiedPnr ? (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Orario e Bagagli */}
              {(timeBefore || baggageNote) && (
                <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                  {timeBefore && (
                    <span className="font-bold text-amber-800 bg-amber-50/50 border border-amber-100/70 px-1.5 py-0.2 rounded">
                      ⏱ Presentarsi: {timeBefore}
                    </span>
                  )}
                  {baggageNote && (
                    <span className="text-gray-500 bg-slate-100/80 px-1.5 py-0.2 rounded font-medium">
                      🧳 {baggageNote}
                    </span>
                  )}
                </div>
              )}

              {/* Indicazioni logistiche — Copilota */}
              {logistics && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCopilotaOpen(true);
                  }}
                  className="w-full text-left text-[11px] bg-blue-50/40 hover:bg-blue-50 border border-blue-100/60 rounded-lg p-2 mt-0.5 leading-relaxed cursor-pointer transition-all active:scale-[0.99] flex items-center gap-2"
                  title="Indicazioni copilota"
                >
                  <span className="text-[13px]">🚗</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-[8.5px] text-blue-600 block uppercase tracking-wider leading-none mb-0.5">
                      Indicazioni Copilota
                    </span>
                    <p className="line-clamp-2 text-slate-700 text-[11.5px] font-medium">{logistics}</p>
                  </div>
                  <span className="text-[9px] font-black text-blue-500 shrink-0 px-1.5 py-0.5 bg-blue-100/60 rounded-md">
                    Apri
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Popup Copilota dedicato */}
        {copilotaOpen && (
          <CopilotaPopup
            activity={activity}
            onClose={() => setCopilotaOpen(false)}
            onEdit={onEdit}
            onDelete={activity.howToGetThere ? () => {
              // Cancella solo le indicazioni copilota mantenendo il resto
              onEdit(); // Lasciamo all'utente di cancellare via form per sicurezza
            } : undefined}
          />
        )}

        {/* Transition to next activity */}
        {nextActivity && (() => {
          const displayTransitTime = transitTime || (activity.type === "hotel" || nextActivity?.type === "hotel" ? "—" : "N/D");
          const matchTr1 = transportsList && dayDate && activity.type === "transport" ? transportsList.find(tr => {
            if (tr.date !== dayDate) return false;
            const actTitleLower = activity.title.toLowerCase();
            const trFromLower = tr.from.toLowerCase();
            const trToLower = tr.to.toLowerCase();
            return actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
          }) : null;

          const matchTr2 = transportsList && dayDate && nextActivity.type === "transport" ? transportsList.find(tr => {
            if (tr.date !== dayDate) return false;
            const actTitleLower = nextActivity.title.toLowerCase();
            const trFromLower = tr.from.toLowerCase();
            const trToLower = tr.to.toLowerCase();
            return actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
          }) : null;

          const t1 = matchTr1?.type;
          const t2 = matchTr2?.type;

          let transportEmoji = "🚗";
          let transportLabel = "Guida";

          const actTitleLower = activity.title.toLowerCase();
          const actSubLower = (activity.subtitle || "").toLowerCase();
          const isTrainAct = actTitleLower.includes("treno") || actTitleLower.includes("frecciarossa") || actSubLower.includes("frecciarossa") || actSubLower.includes("treno");

          if (isTrainAct || t1 === "train" || t2 === "train") {
            transportEmoji = "🚆";
            transportLabel = "Treno";
          } else if (t1 === "plane" || t2 === "plane") {
            transportEmoji = "✈️";
            transportLabel = "Volo";
          } else if (t1 === "ferry" || t2 === "ferry") {
            transportEmoji = "🚢";
            transportLabel = "Traghetto";
          } else {
            const combinedText = `${activity.title} ${activity.subtitle || ""} ${nextActivity.title} ${nextActivity.subtitle || ""}`.toLowerCase();
            if (combinedText.includes("treno") || combinedText.includes("frecciarossa") || combinedText.includes("train") || combinedText.includes("ferrovia")) {
              transportEmoji = "🚆";
              transportLabel = "Treno";
            } else if (combinedText.includes("volo") || combinedText.includes("flight") || combinedText.includes("air china") || combinedText.includes("cebu") || combinedText.includes("virgin") || combinedText.includes("philippine") || combinedText.includes("air new zealand")) {
              transportEmoji = "✈️";
              transportLabel = "Volo";
            } else if (combinedText.includes("traghetto") || combinedText.includes("ferry") || combinedText.includes("nave") || combinedText.includes("boat")) {
              transportEmoji = "🚢";
              transportLabel = "Traghetto";
            } else if (combinedText.includes("scalo") || combinedText.includes("layover") || combinedText.includes("transito")) {
              transportEmoji = "⏳";
              transportLabel = "Scalo";
            } else if (combinedText.includes("cammino") || combinedText.includes("piedi") || combinedText.includes("walk") || combinedText.includes("trekking")) {
              transportEmoji = "🚶";
              transportLabel = "A piedi";
            }
          }
          
          const isDrive = transportLabel === "Guida";

          // Calcola eventuale tempo di scalo/pausa basato sugli orari se non c'est un tempo di guida attivo o in aggiunta
          const parseMinutes = (tStr?: string) => {
            if (!tStr) return null;
            const match = tStr.match(/^(\d{1,2}):(\d{2})/);
            if (!match) return null;
            return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
          };

          const m1 = parseMinutes(activity.time);
          const m2 = parseMinutes(nextActivity.time);
          let layoverTimeStr: string | null = null;
          
          if (m1 !== null && m2 !== null) {
            let diffMin = m2 - m1;
            if (diffMin < 0) diffMin += 24 * 60; // Cambio giorno (es. da 23:30 a 05:50)
            const driveMin = parseTransitTimeToMinutes(displayTransitTime);
            const pauseMin = diffMin - driveMin;
            if (pauseMin >= 15 && (transportLabel === "Scalo" || transportLabel === "Volo" || activity.title.toLowerCase().includes("scalo") || nextActivity.title.toLowerCase().includes("scalo"))) {
              const h = Math.floor(pauseMin / 60);
              const m = pauseMin % 60;
              layoverTimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
            }
          }

          return (
            <div className="my-2.5 flex items-center gap-2 text-[10px] font-extrabold tracking-wider uppercase pl-1 flex-wrap">
              <span className={`flex-shrink-0 ${isDrive ? "text-blue-600/90" : "text-amber-800 font-black"}`}>
                {transportEmoji} {transportLabel}:
              </span>
              <span className={`px-2 py-0.5 rounded-full font-black text-[10.5px] border ${
                isDrive 
                  ? "bg-blue-50 border-blue-100/60 text-blue-600" 
                  : "bg-amber-50 border-amber-200/80 text-amber-900 shadow-sm"
              }`}>
                {displayTransitTime}
              </span>
              {layoverTimeStr && (
                <span className="px-2 py-0.5 rounded-full font-black text-[10px] bg-purple-50 border border-purple-200 text-purple-800">
                  ⏳ Pausa/Scalo: {layoverTimeStr}
                </span>
              )}
              <div className={`flex-1 border-t border-dashed ${isDrive ? "border-blue-200/60" : "border-amber-200"}`} />
              <span className="text-[9.5px] text-gray-400 font-bold normal-case shrink-0">
                Fino alle {nextActivity.time}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
    </div>
  );
}

/*
// ── Quick card ────────────────────────────────────────────────────────────────
function QuickCard({ icon, bgColor, label, desc, onClick }: {
  icon: string; bgColor: string; label: string; desc: string; onClick?: () => void;
}) {
  return (
    <button className="quick-card" onClick={onClick}>
      <div className="qc-icon" style={{ background: bgColor }}>{icon}</div>
      <span className="text-[12px] font-bold text-gray-900 text-center leading-tight">{label}</span>
      <span className="text-[10.5px] text-gray-400 text-center leading-tight px-1">{desc}</span>
    </button>
  );
}

// ── Banner alloggio stasera ───────────────────────────────────────────────────
function AccoBanner({ acc, onClick }: { acc?: any; onClick?: () => void }) {
  if (!acc) {
    return (
      <div className="card p-4 text-center bg-slate-50/60 border border-slate-200/60 rounded-2xl">
        <span className="text-xl block mb-1">✈️ 🛌</span>
        <p className="text-[13px] font-bold text-gray-700">Nessun pernottamento in hotel per stanotte</p>
        <p className="text-[11.5px] text-gray-400 mt-0.5">Notte in volo, transito o scalo programmato.</p>
      </div>
    );
  }

  const hasBreakfast = acc.breakfast && !acc.breakfast.toLowerCase().includes("non inclusa") && !acc.breakfast.toLowerCase().includes("no");

  return (
    <div className="card overflow-hidden cursor-pointer hover:border-blue-200 transition-all shadow-xs" onClick={onClick}>
      <div className="flex">
        {acc.imageUrl ? (
          <img src={acc.imageUrl} alt={acc.name} className="w-[100px] h-auto object-cover flex-shrink-0" />
        ) : (
          <div className="w-[100px] bg-slate-100 flex items-center justify-center flex-shrink-0 text-3xl">
            🏨
          </div>
        )}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className="font-extrabold text-[13px] text-gray-900 leading-snug line-clamp-2 min-w-0 flex-1">{acc.name}</p>
              <IcChevronRight size={15} className="text-gray-300 shrink-0 mt-0.5" />
            </div>
            <p className="text-[11.5px] text-gray-400 truncate mt-0.5">{acc.area ? `${acc.area}, ${acc.city}` : acc.city}</p>
          </div>

          <div className="space-y-1 mt-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="font-bold text-blue-700 bg-blue-50/80 border border-blue-100/60 px-1.5 py-0.5 rounded-md shrink-0">
                🔑 Check-in: {acc.checkIn || "14:00 (N/D)"}
              </span>
              <span className="font-semibold text-slate-600 bg-slate-100/80 border border-slate-200/60 px-1.5 py-0.5 rounded-md shrink-0">
                🚪 Check-out: {acc.checkOut || "10:00 (N/D)"}
              </span>
            </div>

            <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 border ${
              hasBreakfast
                ? "text-amber-800 bg-amber-50 border-amber-200/70"
                : "text-slate-500 bg-slate-50 border-slate-200/60"
            }`}>
              <span>🥐</span>
              <span>Colazione: {acc.breakfast || "Non indicata / Da verificare"}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-center gap-1.5 bg-slate-50/50">
        <IcMapPin size={13} className="text-blue-600" />
        {acc.mapsUrl ? (
          <a href={acc.mapsUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11.5px] font-bold text-blue-600 hover:underline">
            Apri posizione su Maps
          </a>
        ) : (
          <span className="text-[11.5px] font-bold text-blue-600">Posizione su Maps (N/D)</span>
        )}
      </div>
    </div>
  );
}
*/

async function fetchDrivingDuration(fromQuery: string, toQuery: string): Promise<string | null> {
  const cleanFrom = cleanQueryForGeocoding(fromQuery);
  const cleanTo = cleanQueryForGeocoding(toQuery);
  if (!cleanFrom || !cleanTo) return null;

  const cacheKey = `hrb_route_${encodeURIComponent(cleanFrom)}_${encodeURIComponent(cleanTo)}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { duration, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
        return duration;
      }
    } catch (_) {}
  }

  if (!navigator.onLine) return null;

  try {
    const fromRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanFrom)}&limit=1`, {
      headers: { "User-Agent": "HoneymoonRoadbookApp/1.0" }
    }).catch(() => null);
    
    if (!fromRes || !fromRes.ok) return null;
    const fromData = await fromRes.json().catch(() => null);
    if (!fromData || fromData.length === 0) return null;
    const fromLon = fromData[0].lon;
    const fromLat = fromData[0].lat;

    const toRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanTo)}&limit=1`, {
      headers: { "User-Agent": "HoneymoonRoadbookApp/1.0" }
    }).catch(() => null);
    
    if (!toRes || !toRes.ok) return null;
    const toData = await toRes.json().catch(() => null);
    if (!toData || toData.length === 0) return null;
    const toLon = toData[0].lon;
    const toLat = toData[0].lat;

    const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`).catch(() => null);
    if (!routeRes || !routeRes.ok) return null;
    const routeData = await routeRes.json().catch(() => null);
    if (routeData && routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
      const durationSeconds = routeData.routes[0].duration;
      const minutes = Math.round(durationSeconds / 60);
      let durationStr = "";
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        durationStr = remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
      } else {
        durationStr = `${minutes}m`;
      }

      localStorage.setItem(cacheKey, JSON.stringify({
        duration: durationStr,
        timestamp: Date.now()
      }));

      return durationStr;
    }
  } catch (e) {
    console.error("Errore nel calcolo del percorso:", e);
  }
  return null;
}

// ── Main TodayView ────────────────────────────────────────────────────────────
export default function TodayView() {
  const navigate = useNavigate();
  const [selectedDayId, setSelectedDayId] = useState(TODAY_DAY_ID);
  const [tripDays, setTripDays] = useState<DayData[]>([]);
  const [completedActs, setCompletedActs] = useState<string[]>([]);
  const [transportsList, setTransportsList] = useState<any[]>([]);
  const [accommodationsList, setAccommodationsList] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);
  const [calculatedTransits, setCalculatedTransits] = useState<Record<string, string>>({});

  useEffect(() => {
    async function initData() {
      try {
        const days = await repository.getTripDays(DAYS);
        const completed = await repository.getCompletedActivities();
        const trs = await repository.getTransports(TRANSPORTS);
        const accs = await repository.getAccommodations(ACCOMMODATIONS);
        const chks = await repository.getChecklists([]);
        setTripDays(days);
        setCompletedActs(completed);
        setTransportsList(trs);
        setAccommodationsList(accs);
        setChecklists(chks);
        isLoadedRef.current = true;
      } catch (e) {
        console.error("Errore durante il caricamento dei dati in TodayView:", e);
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

  useEffect(() => {
    if (tripDays.length === 0) return;

    let isCancelled = false;

    const calculateAllTransits = async () => {
      // Scorriamo tutti i giorni del viaggio
      for (let dayIdx = 0; dayIdx < tripDays.length; dayIdx++) {
        const day = tripDays[dayIdx];
        if (!day.activities || day.activities.length === 0) continue;

        // ── Caso speciale: hotel giorno precedente → prima tappa del giorno corrente ──
        if (dayIdx > 0) {
          const prevDay = tripDays[dayIdx - 1];
          const firstAct = day.activities[0];
          const prevDayAcc = getTodayAccommodation(prevDay.date, accommodationsList, prevDay.activities);
          
          if (prevDayAcc && firstAct) {
            const routeKey = `${prevDayAcc.id}_to_${firstAct.id}`;
            if (!calculatedTransits[routeKey]) {
              const hotelQuery = `${prevDayAcc.name}, ${prevDayAcc.city}`;
              const firstActQuery = `${firstAct.title}, ${firstAct.subtitle || ""}`;
              const cleanFrom = cleanQueryForGeocoding(hotelQuery);
              const cleanTo = cleanQueryForGeocoding(firstActQuery);
              const cacheKey = `hrb_route_${encodeURIComponent(cleanFrom)}_${encodeURIComponent(cleanTo)}`;
              const cached = localStorage.getItem(cacheKey);
              if (cached) {
                try {
                  const { duration } = JSON.parse(cached);
                  setCalculatedTransits((prev) => ({ ...prev, [routeKey]: duration }));
                } catch (_) {}
              }
            }
          }
        }

        // ── Loop normale: attività consecutive ──
        if (day.activities.length < 2) continue;

        for (let i = 0; i < day.activities.length - 1; i++) {
          if (isCancelled) return;

          const act = day.activities[i];
          const nextAct = day.activities[i + 1];

          const routeKey = `${act.id}_to_${nextAct.id}`;

          // Se una delle due attività è un hotel, usa solo transitTime manuale/testo o cache localStorage (zero fetch Nominatim)
          if (act.type === "hotel" || nextAct.type === "hotel") {
            const manualOrText = act.transitTime || extractDurationFromText(act.subtitle) || extractDurationFromText(act.title);
            if (manualOrText) {
              if (!calculatedTransits[routeKey]) {
                setCalculatedTransits((prev) => ({ ...prev, [routeKey]: manualOrText }));
              }
            } else if (!calculatedTransits[routeKey]) {
              const fromQuery = `${act.title}, ${act.subtitle || ""}`;
              const toQuery = `${nextAct.title}, ${nextAct.subtitle || ""}`;
              const cleanFrom = cleanQueryForGeocoding(fromQuery);
              const cleanTo = cleanQueryForGeocoding(toQuery);
              const cacheKey = `hrb_route_${encodeURIComponent(cleanFrom)}_${encodeURIComponent(cleanTo)}`;
              const cached = localStorage.getItem(cacheKey);
              if (cached) {
                try {
                  const { duration } = JSON.parse(cached);
                  setCalculatedTransits((prev) => ({ ...prev, [routeKey]: duration }));
                } catch (_) {}
              }
            }
            continue;
          }

          // Se una delle due attività non è di categoria REAL_DRIVING, blocca immediatamente il tentativo di fetch
          if (getActivityRoutingCategory(act) !== "REAL_DRIVING" || getActivityRoutingCategory(nextAct) !== "REAL_DRIVING") {
            continue;
          }

          // Se l'attività stessa o la successiva ha già una durata esplicita, registra ed avanza
          if (act.transitTime || extractDurationFromText(act.subtitle) || extractDurationFromText(act.title)) {
            continue;
          }

          if (act.type === "sightseeing" && nextAct.type === "sightseeing") {
            continue;
          }

          if (!shouldCalculateDriving(act, nextAct) || !isDrivingTransit(act, nextAct, transportsList, day.date)) {
            continue;
          }

          const fromQuery = `${act.title}, ${act.subtitle || ""}`;
          const toQuery = `${nextAct.title}, ${nextAct.subtitle || ""}`;

          const cleanFrom = cleanQueryForGeocoding(fromQuery);
          const cleanTo = cleanQueryForGeocoding(toQuery);
          const cacheKey = `hrb_route_${encodeURIComponent(cleanFrom)}_${encodeURIComponent(cleanTo)}`;
          
          if (calculatedTransits[routeKey] || localStorage.getItem(cacheKey)) {
            if (!calculatedTransits[routeKey]) {
              const cached = localStorage.getItem(cacheKey);
              if (cached) {
                try {
                  const { duration } = JSON.parse(cached);
                  setCalculatedTransits((prev) => ({ ...prev, [routeKey]: duration }));
                } catch (_) {}
              }
            }
            continue;
          }

          // Attendi un piccolo delay per la richiesta in background
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (isCancelled) return;

          try {
            const duration = await fetchDrivingDuration(fromQuery, toQuery);
            if (duration) {
              setCalculatedTransits((prev) => ({
                ...prev,
                [routeKey]: duration,
              }));
            }
          } catch (err) {
            // Continua sulle tappe successive anche in caso di errore sulla singola tratta
          }
        }
      }
    };

    calculateAllTransits();

    return () => {
      isCancelled = true;
    };
  }, [tripDays, accommodationsList]);

  const [expanded, setExpanded] = useState(false);
  const [qrActivity, setQrActivity] = useState<Activity | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTomorrowFull, setShowTomorrowFull] = useState(false);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [ticketModalIndex, setTicketModalIndex] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setCompletedActs((current) => {
          if (JSON.stringify(current) === JSON.stringify(detail)) return current;
          return detail;
        });
      }
    };
    window.addEventListener("hrb_completed_activities_change", handler as EventListener);

    const tripDaysHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setTripDays((current) => {
          if (JSON.stringify(current) === JSON.stringify(detail)) return current;
          return detail;
        });
      }
    };
    window.addEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);

    return () => {
      window.removeEventListener("hrb_completed_activities_change", handler as EventListener);
      window.removeEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);
    };
  }, []);

  async function toggleActivity(id: string) {
    const next = completedActs.includes(id)
      ? completedActs.filter((item) => item !== id)
      : [...completedActs, id];
    setCompletedActs(next);
    await repository.saveCompletedActivities(next);
  }

  async function toggleChecklistItem(checklistId: string, itemId: string) {
    const updated = checklists.map((c) => {
      if (c.id === checklistId) {
        return {
          ...c,
          items: c.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
        };
      }
      return c;
    });
    setChecklists(updated);
    await repository.saveChecklists(updated);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60dvh] gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold">Caricamento roadbook...</span>
      </div>
    );
  }

  const today = getToday(tripDays, selectedDayId);
  const tomorrow = getTomorrow(tripDays, selectedDayId);
  const acco = getTodayAccommodation(today?.date, accommodationsList, today?.activities);

  const currentIdx = tripDays.findIndex((d) => d.id === selectedDayId);

  function handlePrevDay() {
    if (currentIdx > 0) {
      setSelectedDayId(tripDays[currentIdx - 1].id);
    }
  }

  function handleNextDay() {
    if (currentIdx < tripDays.length - 1) {
      setSelectedDayId(tripDays[currentIdx + 1].id);
    }
  }

  function handleEditActivity(dayId: string, updated: Activity) {
    const nextDays = tripDays.map((day) => {
      if (day.id === dayId) {
        const oldAct = day.activities.find((a) => a.id === updated.id);
        const nextActs = day.activities.map((a) => (a.id === updated.id ? updated : a));
        if (oldAct && oldAct.time !== updated.time) {
          nextActs.sort((a, b) => a.time.localeCompare(b.time));
        }
        return { ...day, activities: nextActs };
      }
      return day;
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
  }

  function handleDeleteActivity(dayId: string, actId: string) {
    const nextDays = tripDays.map((day) => {
      if (day.id === dayId) {
        return { ...day, activities: day.activities.filter((a) => a.id !== actId) };
      }
      return day;
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
  }

  const daysLeft = getDaysToDeparture();
  const todayLabel = getTodayLabel();

  const totalDriveMinutes = today ? today.activities.reduce((sum, act, idx) => {
    const nextAct = today.activities[idx + 1];
    if (!nextAct || !isDrivingTransit(act, nextAct, transportsList, today.date)) return sum;
    const routeKey = `${act.id}_to_${nextAct?.id}`;
    const timeStr = calculatedTransits[routeKey] ?? getCachedTransitTime(act, nextAct);
    return sum + parseTransitTimeToMinutes(timeStr);
  }, 0) : 0;

  const totalNonDriveMinutes = today ? today.activities.reduce((sum, act, idx) => {
    const nextAct = today.activities[idx + 1];
    if (!nextAct || isDrivingTransit(act, nextAct, transportsList, today.date)) return sum;
    const routeKey = `${act.id}_to_${nextAct?.id}`;
    const timeStr = calculatedTransits[routeKey] ?? getCachedTransitTime(act, nextAct);
    return sum + parseTransitTimeToMinutes(timeStr);
  }, 0) : 0;

  const totalDriveTimeStr = formatMinutesToHoursAndMinutes(totalDriveMinutes);
  const totalNonDriveTimeStr = formatMinutesToHoursAndMinutes(totalNonDriveMinutes);

  const visibleActivities = expanded ? (today?.activities || []) : (today?.activities || []).slice(0, VISIBLE_COUNT);
  const hasMore = (today?.activities || []).length > VISIBLE_COUNT;
  const tomorrowActivities = tomorrow?.activities ?? [];

  const priorityInfo = getPriorityActivity(today?.activities || [], completedActs, selectedDayId === TODAY_DAY_ID);
  const priorityAct = priorityInfo.activity;

  const imminentTransport = (() => {
    if (!today?.date) return null;
    const targetDates = [today.date];
    if (tomorrow?.date) targetDates.push(tomorrow.date);
    return (transportsList || []).find((t) => {
      if (!t.date || typeof t.date !== "string") return false;
      return targetDates.includes(t.date);
    });
  })();

  const pendingChecklistItems = checklists.flatMap((c) =>
    c.items.filter((i) => !i.checked).map((i) => ({ item: i, checklistId: c.id }))
  ).slice(0, 3);

  const prevDay = currentIdx > 0 ? tripDays[currentIdx - 1] : null;
  const prevDayAcc = prevDay ? getTodayAccommodation(prevDay.date, accommodationsList, prevDay.activities) : null;

  return (
    <>
      <div className="px-4 pt-5 pb-4 space-y-4">
        {/* 1. HEADER ESSENZIALE */}
        <div>
          {daysLeft > 0 && (
            <div className="mb-2">
              <span
                className="text-[12px] font-bold px-3 py-1 rounded-full border"
                style={{ color: "#e07b55", borderColor: "#f4c2a4", background: "#fff5f0" }}
              >
                {daysLeft} giorni alla partenza
              </span>
            </div>
          )}
          {daysLeft === 0 && (
            <div className="mb-2">
              <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-blue-600 text-white">
                🎉 Oggi si parte!
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <h1 className="text-[20px] font-bold text-gray-900 leading-tight truncate">
                Oggi &middot; {todayLabel}
              </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <IcMapPin size={13} className="text-green-500 flex-shrink-0" />
                <span className="text-[13px] text-green-600 font-semibold truncate">{today.location}</span>
              </div>
            </div>
            {/* Navigazione giorno e Calendario */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className={`w-9 h-9 rounded-xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-center transition-opacity ${
                  currentIdx <= 0 ? "opacity-35 cursor-not-allowed" : "hover:bg-gray-50 active:scale-95"
                }`}
                onClick={handlePrevDay}
                disabled={currentIdx <= 0}
                aria-label="Giorno precedente"
              >
                <IcChevronLeft size={16} className="text-gray-600" />
              </button>

              <button
                className="w-10 h-10 rounded-xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-center hover:bg-gray-50 active:scale-95"
                onClick={() => setShowDatePicker(true)}
                aria-label="Seleziona giorno"
              >
                <IcCalendar size={18} className="text-gray-600" />
              </button>

              <button
                className={`w-9 h-9 rounded-xl bg-white shadow-xs border border-gray-200/80 flex items-center justify-center transition-opacity ${
                  currentIdx >= tripDays.length - 1 ? "opacity-35 cursor-not-allowed" : "hover:bg-gray-50 active:scale-95"
                }`}
                onClick={handleNextDay}
                disabled={currentIdx >= tripDays.length - 1}
                aria-label="Giorno successivo"
              >
                <IcChevronRight size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. CARD PRIORITARIA "ADESSO / PROSSIMA TAPPA" */}
        <section className="card p-4 border border-blue-100/90 shadow-sm bg-gradient-to-b from-blue-50/30 to-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-black text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
              {priorityAct?.status === "in_corso" ? "⚡ IN CORSO" : "📍 PROSSIMA TAPPA"}
            </span>
            {priorityAct && (
              <span className="text-[11.5px] font-extrabold text-blue-900">
                {priorityAct.time}
              </span>
            )}
          </div>

          {priorityAct ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-[16px] font-black text-gray-900 leading-snug">
                  {priorityAct.title}
                </h2>
                {priorityAct.subtitle && (
                  <p className="text-[12px] text-gray-500 font-semibold mt-0.5 truncate">
                    {priorityAct.subtitle}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                {priorityAct.mapsUrl ? (
                  <a
                    href={priorityAct.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 h-10 rounded-xl bg-blue-600 text-white font-extrabold text-[12px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-blue-700 active:scale-98 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span>Apri Mappe</span>
                  </a>
                ) : null}

                <button
                  onClick={() => setEditingActivity({ dayId: today.id, activity: priorityAct, dayLabel: today.dateLabel })}
                  className="px-3.5 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] flex items-center justify-center transition-all shrink-0"
                >
                  Dettagli
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1 text-center">
              <p className="text-[13px] font-extrabold text-emerald-700">
                {priorityInfo.isCompletedAll ? "🎉 Programma di oggi completato!" : "Nessuna attività programmata per oggi."}
              </p>
            </div>
          )}
        </section>

        {/* 3. CARD TRASPORTO IMMINENTE (Condizionale) */}
        {imminentTransport && (
          <section
            onClick={() => navigate("/trasporti")}
            className="card p-3.5 border border-purple-100 bg-purple-50/30 hover:bg-purple-50 transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-black text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md">
                ✈️ TRASPORTO IMMINENTE ({imminentTransport.date === today.date ? "Oggi" : "Domani"})
              </span>
              <span className="text-[11px] font-extrabold text-purple-900">
                {imminentTransport.time} {imminentTransport.arrivalTime ? `➔ ${imminentTransport.arrivalTime}` : ""}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-gray-900 leading-tight truncate">
                  {imminentTransport.from} ➔ {imminentTransport.to}
                </p>
                <p className="text-[11.5px] text-gray-500 font-semibold truncate mt-0.5">
                  {imminentTransport.detail || imminentTransport.type}
                </p>
              </div>

              {imminentTransport.mapsUrl ? (
                <a
                  href={imminentTransport.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 h-8 rounded-lg bg-purple-600 text-white font-bold text-[11px] flex items-center justify-center gap-1 shrink-0"
                >
                  Mappe
                </a>
              ) : (
                <IcChevronRight size={18} className="text-purple-400 shrink-0" />
              )}
            </div>
          </section>
        )}

        {/* 4. CARD DOVE DORMIAMO STANOTTE */}
        {acco && (
          <section className="card p-3.5 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                🏨 DOVE DORMIAMO STANOTTE
              </span>
              {acco.checkIn && (
                <span className="text-[11px] font-extrabold text-slate-600">
                  Check-in {acco.checkIn}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div
                onClick={() => navigate("/accommodations")}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <h3 className="text-[14px] font-black text-gray-900 leading-tight truncate">
                  {acco.name}
                </h3>
                <p className="text-[11.5px] text-gray-500 font-semibold truncate mt-0.5">
                  📍 {acco.city}{acco.area ? `, ${acco.area}` : ""}
                </p>
              </div>

              {acco.mapsUrl ? (
                <a
                  href={acco.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3.5 h-9 rounded-xl bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs hover:bg-slate-800 active:scale-95 transition-all shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>Mappe</span>
                </a>
              ) : (
                <button
                  onClick={() => navigate("/accommodations")}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <IcChevronRight size={18} />
                </button>
              )}
            </div>
          </section>
        )}

        {/* 5. CARD DA RICORDARE OGGI (Checklist non completate) */}
        {pendingChecklistItems.length > 0 && (
          <section className="card p-3.5 border border-amber-200/80 bg-amber-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                📋 DA RICORDARE OGGI
              </span>
              <button
                onClick={() => navigate("/altro?open=checklist")}
                className="text-[11px] font-extrabold text-amber-800 hover:underline flex items-center gap-0.5"
              >
                Vedi tutto <IcChevronRight size={12} />
              </button>
            </div>

            <div className="space-y-1 pt-0.5">
              {pendingChecklistItems.map(({ item, checklistId }) => (
                <div
                  key={item.id}
                  onClick={() => toggleChecklistItem(checklistId, item.id)}
                  className="flex items-center gap-2 p-2 bg-white/90 rounded-xl border border-amber-100 cursor-pointer active:scale-[0.99] transition-all"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[12px] font-semibold text-gray-800 truncate">
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. TIMELINE RESTO DELLA GIORNATA */}
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-2">
            <div>
              <span className="section-label mb-0 block text-[13px] font-black text-gray-900 tracking-tight">Timeline della giornata</span>
              <p className="text-[11.5px] text-gray-400 mt-0.5 font-medium">{today.dateLabel}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {totalDriveTimeStr && (
                <span className="text-[10px] font-black text-blue-700 bg-blue-50/70 px-2 py-1 rounded-lg border border-blue-100 flex items-center gap-1">
                  🚗 Guida: {totalDriveTimeStr}
                </span>
              )}
              {totalNonDriveTimeStr && (
                <span className="text-[10px] font-black text-slate-700 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1">
                  🚆 Transfer: {totalNonDriveTimeStr}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-0">
            {visibleActivities.map((act, idx) => {
              const nextAct = today.activities[idx + 1];
              let transitTime: string | undefined;
              if (idx === 0 && prevDayAcc) {
                const routeKey = `${prevDayAcc.id}_to_${act.id}`;
                transitTime = calculatedTransits[routeKey];
              } else {
                const routeKey = `${act.id}_to_${nextAct?.id}`;
                transitTime = calculatedTransits[routeKey] ?? getCachedTransitTime(act, nextAct);
              }
              const isActive = act.id === priorityAct?.id;
              return (
                <TimelineRow
                  key={act.id}
                  activity={act}
                  nextActivity={nextAct}
                  transitTime={transitTime}
                  prevAccommodation={prevDayAcc}
                  isActive={isActive}
                  isFirst={idx === 0}
                  isLast={idx === visibleActivities.length - 1}
                  onQRTap={setQrActivity}
                  onEdit={() => setEditingActivity({ dayId: today.id, activity: act, dayLabel: today.dateLabel })}
                  completed={completedActs.includes(act.id)}
                  onToggle={() => toggleActivity(act.id)}
                  dayLocation={today.location}
                  dayDate={today.date}
                  transportsList={transportsList}
                  accommodationsList={accommodationsList}
                />
              );
            })}
          </div>
          {hasMore && (
            <button
              className="w-full mt-2 flex items-center justify-center gap-1 text-[12.5px] font-bold text-blue-600 py-1.5"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostra meno" : "Vedi tutta la giornata"}
              <IcChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </section>

        {/* Anteprima di domani — scorrevole orizzontale */}
        {tomorrow && tomorrowActivities.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <span className="section-label">Anteprima di domani</span>
              <button
                className="text-[12px] font-bold text-blue-600"
                onClick={() => setShowTomorrowFull(true)}
              >
                Vedi tutto
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {tomorrowActivities.map((act) => (
                <div
                  key={act.id}
                  className="flex-shrink-0 w-44 bg-white border border-gray-150 rounded-xl p-2.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-blue-600 mb-1">
                      <ActivityIcon type={act.type} size={12} />
                      <span>{act.time}</span>
                    </div>
                    <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-2">
                      {act.title}
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 truncate">{act.subtitle}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">{tomorrow.location}</p>
          </section>
        )}
      </div>

      {/* Modali */}
      {qrActivity && <QRModal activity={qrActivity} onClose={() => setQrActivity(null)} />}
      {showDatePicker && (
        <DatePickerSheet
          selectedDayId={selectedDayId}
          onSelect={setSelectedDayId}
          onClose={() => setShowDatePicker(false)}
        />
      )}
      {showTomorrowFull && tomorrow && (
        <DayFullModal
          activities={tomorrowActivities}
          dayLabel={`${tomorrow.dateLabel} · ${tomorrow.location}`}
          onClose={() => setShowTomorrowFull(false)}
        />
      )}
      {editingActivity && (
        <EditActivitySheet
          activity={editingActivity.activity}
          dayLabel={editingActivity.dayLabel}
          onSave={(updated) => handleEditActivity(editingActivity.dayId, updated)}
          onDelete={() => handleDeleteActivity(editingActivity.dayId, editingActivity.activity.id)}
          onClose={() => setEditingActivity(null)}
        />
      )}

      {/* Modal sfogliabile Attrazioni & Visite di oggi */}
      {showTicketsModal && today && (() => {
        const attractions = today.activities.filter(isAttraction);
        if (attractions.length === 0) return null;
        const currentAttraction = attractions[ticketModalIndex] || attractions[0];
        return (
          <div className="bottom-sheet-backdrop" onClick={() => setShowTicketsModal(false)}>
            <div className="bottom-sheet-container" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              
              {/* Header Modal sfogliabile */}
              <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-3">
                <div>
                  <span className="text-[10px] font-black tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100/50">
                    Attrazione ({ticketModalIndex + 1} di {attractions.length})
                  </span>
                  <h3 className="text-[16px] font-black text-gray-900 mt-1 flex items-center gap-2">
                    <span>{currentAttraction.title}</span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowTicketsModal(false);
                      setEditingActivity({ dayId: today.id, activity: currentAttraction, dayLabel: today.dateLabel });
                    }}
                    className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-[13px] border border-blue-100 flex items-center justify-center shrink-0"
                    title="Modifica o cancella questa attrazione"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => setShowTicketsModal(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 hover:bg-gray-200"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Contenuto Dettagli Attrazione */}
              <div className="space-y-3.5 overflow-y-auto max-h-[60dvh] pr-1">
                {currentAttraction.bookingRef && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-gray-400 block uppercase tracking-wider">Codice Prenotazione (PNR)</span>
                      <span className="font-mono font-black text-[14px] text-slate-800 mt-0.5 block">{currentAttraction.bookingRef}</span>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(currentAttraction.bookingRef || "")}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10.5px] font-bold text-slate-600 active:scale-95 transition-all"
                    >
                      📋 Copia
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-150">
                    <span className="text-[9px] font-bold text-gray-400 block uppercase">Orario previsto</span>
                    <span className="font-bold text-gray-800 text-[13px]">{currentAttraction.time}</span>
                  </div>
                  {currentAttraction.price !== undefined && (
                    <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-150">
                      <span className="text-[9px] font-bold text-gray-400 block uppercase">Costo</span>
                      <span className="font-bold text-gray-800 text-[13px]">
                        €{currentAttraction.price} {currentAttraction.isPaid ? "(Pagato ✓)" : "(Da pagare)"}
                      </span>
                    </div>
                  )}
                  {currentAttraction.timeBeforehand && (
                    <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-100 col-span-2">
                      <span className="text-[9px] font-bold text-amber-800 block uppercase">Anticipo consigliato</span>
                      <span className="font-bold text-amber-900">⏱ {currentAttraction.timeBeforehand}</span>
                    </div>
                  )}
                </div>

                {/* Sezione Biglietti & QR Code caricati per l'attrazione corrente */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[9.5px] font-black text-slate-500 block uppercase tracking-wider">Biglietti / QR Code</span>
                    <span className="text-[12px] font-bold text-slate-800">
                      {currentAttraction.hasQR ? "Biglietti e QR code digitali" : "Foto biglietto o QR code"}
                    </span>
                  </div>
                  <button
                    onClick={() => setQrActivity(currentAttraction)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold active:scale-95 transition-all shadow-xs flex items-center gap-1 shrink-0"
                  >
                    <IcQR size={14} className="text-white" />
                    <span>Visualizza / Aggiungi QR 🖼️</span>
                  </button>
                </div>

                {currentAttraction.howToGetThere && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                    <span className="text-[9.5px] font-black text-blue-800 block uppercase tracking-wider mb-1">Come Arrivare / Logistica</span>
                    <p className="text-[12px] text-blue-950 font-medium leading-relaxed">{currentAttraction.howToGetThere}</p>
                  </div>
                )}

                {currentAttraction.note && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <span className="text-[9.5px] font-black text-slate-500 block uppercase tracking-wider mb-1">Note Operative</span>
                    <p className="text-[12px] text-slate-700 leading-relaxed">{currentAttraction.note}</p>
                  </div>
                )}

                {currentAttraction.ticketUrl && (
                  <a
                    href={currentAttraction.ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center py-3 bg-blue-600 text-white rounded-xl text-[13px] font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    🔗 Apri Biglietto / Sito Ufficiale
                  </a>
                )}
              </div>

              {/* Footer per sfogliare se multipli */}
              {attractions.length > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <button
                    disabled={ticketModalIndex === 0}
                    onClick={() => setTicketModalIndex(prev => Math.max(0, prev - 1))}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                      ticketModalIndex === 0 ? "opacity-30 border-gray-200 text-gray-400" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    ← Precedente
                  </button>
                  <span className="text-[11px] font-bold text-gray-400">
                    {ticketModalIndex + 1} / {attractions.length}
                  </span>
                  <button
                    disabled={ticketModalIndex === attractions.length - 1}
                    onClick={() => setTicketModalIndex(prev => Math.min(attractions.length - 1, prev + 1))}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                      ticketModalIndex === attractions.length - 1 ? "opacity-30 border-gray-200 text-gray-400" : "bg-blue-600 border-blue-600 text-white shadow-sm"
                    }`}
                  >
                    Successivo →
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
