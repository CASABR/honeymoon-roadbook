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
import { EditActivitySheet, AddActivitySheet } from "./TripView";
import {
  calculateDrivingRoute,
  getCachedDrivingRoute,
  buildSegmentCacheKey,
  delayMs,
  type DrivingRoute,
  type DrivingRouteResult,
} from "../services/routingService";

export interface CandidateSegment {
  originUrl: string;
  originFallback?: string;
  destUrl: string;
  destFallback?: string;
  fromId: string;
  toId: string;
}

export type SegmentTravelType = "driving" | "walking" | "flight" | "train" | "ferry" | "manual" | "unknown";

interface SegmentTravelClassification {
  type: SegmentTravelType;
  reason: string;
  relatedTransportId?: string;
}

export function classifySegmentTravel(
  act: Activity,
  nextAct: Activity,
  transportsList?: any[],
  dayDate?: string
): SegmentTravelClassification {
  const findRelatedTransport = (activity: Activity) => {
    if (!transportsList || !dayDate || activity.type !== "transport") return undefined;
    const text = `${activity.title || ""} ${activity.subtitle || ""}`.toLowerCase();
    return transportsList.find((tr) => {
      if (tr.date !== dayDate) return false;
      const from = String(tr.from || "").toLowerCase();
      const to = String(tr.to || "").toLowerCase();
      const carrierCode = String(tr.carrierCode || "").toLowerCase();
      return (!!from && text.includes(from)) || (!!to && text.includes(to)) || (!!carrierCode && text.includes(carrierCode));
    });
  };

  const relatedTransport = findRelatedTransport(act) || findRelatedTransport(nextAct);
  if (relatedTransport?.type === "plane") return { type: "flight", reason: "related transport type is plane", relatedTransportId: relatedTransport.id };
  if (relatedTransport?.type === "train") return { type: "train", reason: "related transport type is train", relatedTransportId: relatedTransport.id };
  if (relatedTransport?.type === "ferry") return { type: "ferry", reason: "related transport type is ferry", relatedTransportId: relatedTransport.id };
  if (["car", "taxi", "transfer"].includes(relatedTransport?.type)) {
    return { type: "driving", reason: `related transport type is ${relatedTransport.type}`, relatedTransportId: relatedTransport.id };
  }

  const combinedText = `${act.title || ""} ${act.subtitle || ""} ${nextAct.title || ""} ${nextAct.subtitle || ""}`.toLowerCase();
  if (/\b(volo|flight|scalo)\b|air china|cebu pacific|virgin|philippine|air new zealand/.test(combinedText)) {
    return { type: "flight", reason: "flight keyword in segment text" };
  }
  if (/\b(treno|frecciarossa|train|ferrovia)\b/.test(combinedText)) {
    return { type: "train", reason: "train keyword in segment text" };
  }
  if (/\b(traghetto|ferry|bluebridge|nave)\b/.test(combinedText)) {
    return { type: "ferry", reason: "ferry keyword in segment text" };
  }
  if (/\b(a piedi|piedi|walk|walking|trekking|cammino)\b/.test(combinedText)) {
    return { type: "walking", reason: "walking keyword in segment text" };
  }
  if (/\b(taxi|transfer|noleggio|ritiro auto|consegna auto|spostamento|strada|road|drive|airport)\b/.test(combinedText)) {
    return { type: "driving", reason: "road keyword in segment text" };
  }
  if ((act as any).mapsUrl && (nextAct as any).mapsUrl) {
    return { type: "driving", reason: "both nodes have mapsUrl and no non-road indicators" };
  }

  return { type: "unknown", reason: "no reliable transport or routing indicators" };
}

export function buildRoutingFallbackQuery(act?: Activity, dayLocation?: string, acco?: Accommodation): string | undefined {
  if (acco) {
    const parts = [acco.name];
    if (acco.city) parts.push(acco.city);
    return parts.join(", ");
  }

  if (!act) return undefined;

  const cleanText = (str?: string) => {
    if (!str) return "";
    return str
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/PNR:?\s*[A-Z0-9]+/gi, "")
      .replace(/€\d+/g, "")
      .replace(/⏱️?\s*Orari:?\s*[\d:➔\s–-]+/gi, "")
      .replace(/Durata:?\s*[^·,]+/gi, "")
      .replace(/Presentarsi:?\s*[^·,]+/gi, "")
      .trim();
  };

  const cleanSub = cleanText(cleanSubtitle(act.subtitle));
  let cleanTitle = cleanText(act.title);

  const parenMatch = cleanTitle.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].trim().length > 2) {
    cleanTitle = parenMatch[1].trim();
  } else {
    cleanTitle = cleanTitle.replace(/^(cena|pranzo|colazione)\s+(da|a|in)\s+/i, "").trim();
  }

  // Se la subtitle ha un indirizzo o nome luogo valido (es. "Auckland Airport", "20 Alex Telfer Drive")
  if (cleanSub && cleanSub.length > 2) {
    const subLower = cleanSub.toLowerCase();
    const isGenericSub = subLower === "in viaggio" || subLower === "dettagli";
    if (!isGenericSub) {
      if (cleanTitle.toLowerCase().includes(subLower)) {
        return cleanTitle;
      }
      return `${cleanTitle}, ${cleanSub}`;
    }
  }

  if (cleanTitle && cleanTitle.length > 2) {
    const queryParts = [cleanTitle];
    if (dayLocation) queryParts.push(dayLocation);
    return queryParts.join(", ");
  }

  return undefined;
}

export function getDrivingCandidateSegments(
  day: DayData,
  prevDayAcc?: Accommodation | null,
  accommodationsList?: Accommodation[],
  transportsList?: any[]
): CandidateSegment[] {
  if (!day) return [];

  const processed = dedupeDayActivities(day.activities || [], day.date, accommodationsList);
  const points: { id: string; mapsUrl: string; fallback?: string; act?: Activity }[] = [];

  // 1. Alloggio notte precedente
  if (prevDayAcc) {
    const url = prevDayAcc.mapsUrl?.trim() || "";
    const fallback = buildRoutingFallbackQuery(undefined, undefined, prevDayAcc);
    if (url || fallback) {
      const syntheticAct: Activity = {
        id: "prev_acc",
        time: "00:00",
        type: "hotel",
        title: prevDayAcc.name,
        subtitle: prevDayAcc.city || "Hotel",
        mapsUrl: url,
      };
      points.push({ id: "prev_acc", mapsUrl: url, fallback, act: syntheticAct });
    }
  }

  // 2. Attività della giornata
  for (const act of processed) {
    const actAny = act as any;
    const url = typeof actAny.mapsUrl === "string" ? actAny.mapsUrl.trim() : "";
    const fallback = buildRoutingFallbackQuery(act, day.location);
    if (url || fallback) {
      if (
        points.length === 0 ||
        points[points.length - 1].mapsUrl !== url ||
        points[points.length - 1].fallback !== fallback
      ) {
        points.push({ id: act.id, mapsUrl: url, fallback, act });
      }
    }
  }

  // 3. Alloggio notte corrente
  const todayAcc = getTodayAccommodation(day.date, accommodationsList, day.activities);
  if (todayAcc) {
    const url = todayAcc.mapsUrl?.trim() || "";
    const fallback = buildRoutingFallbackQuery(undefined, undefined, todayAcc);
    if (url || fallback) {
      if (
        points.length === 0 ||
        points[points.length - 1].mapsUrl !== url ||
        points[points.length - 1].fallback !== fallback
      ) {
        const syntheticAct: Activity = {
          id: "today_acc",
          time: "23:59",
          type: "hotel",
          title: todayAcc.name,
          subtitle: todayAcc.city || "Hotel",
          mapsUrl: url,
        };
        points.push({ id: "today_acc", mapsUrl: url, fallback, act: syntheticAct });
      }
    }
  }

  if (points.length < 2) return [];

  const segments: CandidateSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const act1 = p1.act;
    const act2 = p2.act;

    if (act1 && act2) {
      const segmentType = classifySegmentTravel(act1, act2, transportsList, day.date);

      if (import.meta.env.DEV) {
        console.debug("[ROUTING DEBUG] segment-type", {
          dayId: day.id,
          originId: p1.id,
          destinationId: p2.id,
          type: segmentType.type,
          reason: segmentType.reason,
          relatedTransportId: segmentType.relatedTransportId,
        });
      }

      if (segmentType.type !== "driving") {
        if (import.meta.env.DEV) {
          const logName = segmentType.type === "walking"
            ? "[ROUTING DEBUG] walking-detected"
            : ["flight", "train", "ferry", "manual"].includes(segmentType.type)
            ? "[ROUTING DEBUG] manual-transport"
            : "[ROUTING DEBUG] unknown-segment";
          console.debug(logName, {
            dayId: day.id,
            originId: p1.id,
            destinationId: p2.id,
            reason: segmentType.reason,
          });
        }
        continue;
      }

      if (import.meta.env.DEV) {
        console.debug("[ROUTING DEBUG] driving-start", {
          dayId: day.id,
          originId: p1.id,
          destinationId: p2.id,
        });
      }
    }

    segments.push({
      originUrl: p1.mapsUrl,
      originFallback: p1.fallback,
      destUrl: p2.mapsUrl,
      destFallback: p2.fallback,
      fromId: p1.id,
      toId: p2.id,
    });
  }

  return segments;
}

// ── helpers ───────────────────────────────────────────────────────────────────


function getToday(days: DayData[], dayId: string) {
  return days.find((d) => d.id === dayId) ?? days[0];
}

function getTomorrow(days: DayData[], dayId: string) {
  const idx = days.findIndex((d) => d.id === dayId);
  return idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
}

export function getTodayAccommodation(dateISO?: string, accommodations?: Accommodation[], dayActivities?: Activity[]) {
  const list = accommodations && accommodations.length > 0 ? accommodations : ACCOMMODATIONS;
  
  if (dateISO) {
    // 1. Cerca prima negli alloggi confermati per intervallo date: startDate <= dateISO < endDate
    const foundAcc = list.find((acc) => {
      if (acc.startDate && acc.endDate) {
        return dateISO >= acc.startDate && dateISO < acc.endDate; // La notte appartiene all'intervallo prima del checkout
      }
      return false;
    });
    if (foundAcc) return foundAcc;

    // 2. Se non trova per startDate/endDate, cerca se acc.dates o acc.checkIn contengono esplicitamente dateISO
    const fallbackAcc = list.find((acc) => {
      if (acc.dates && acc.dates.includes(dateISO)) return true;
      if (acc.checkIn && acc.checkIn.includes(dateISO)) return true;
      return false;
    });
    if (fallbackAcc) return fallbackAcc;

    // 3. Cerca nelle attività del giorno se c'è un'attività hotel che NON sia un check-out
    if (dayActivities) {
      const hotelAct = dayActivities.find(a => {
        if (a.type !== "hotel") return false;
        const t = a.title.toLowerCase();
        return !t.includes("check-out") && !t.includes("checkout") && !t.includes("partenza") && !t.includes("lasciare");
      });
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
  return null;
}

export function dedupeDayActivities(
  activities: Activity[],
  dayDate?: string,
  accommodationsList?: Accommodation[]
): Activity[] {
  if (!activities || activities.length === 0) return [];

  const seenKeys = new Set<string>();

  return activities.filter((act) => {
    if (act.type !== "hotel") {
      if (seenKeys.has(act.id)) return false;
      seenKeys.add(act.id);
      return true;
    }

    const titleLower = act.title.toLowerCase();
    const isCheckout = titleLower.includes("check-out") || titleLower.includes("checkout") || titleLower.includes("partenza");
    const isCheckin = titleLower.includes("check-in") || titleLower.includes("checkin") || titleLower.includes("arrivo");

    const matchedAcc = accommodationsList && dayDate ? accommodationsList.find((acc) => {
      const accNameLower = acc.name.toLowerCase();
      return titleLower.includes(accNameLower) || accNameLower.includes(titleLower) || (act.subtitle && act.subtitle.toLowerCase().includes(accNameLower));
    }) : undefined;

    if (matchedAcc && dayDate) {
      if (isCheckout && matchedAcc.endDate && dayDate !== matchedAcc.endDate) {
        return false;
      }
      if (isCheckin && matchedAcc.startDate && dayDate !== matchedAcc.startDate) {
        return false;
      }
    }

    const hotelKey = `hotel_${act.title.trim().toLowerCase()}_${act.time}`;
    if (seenKeys.has(hotelKey)) return false;
    seenKeys.add(hotelKey);
    seenKeys.add(act.id);
    return true;
  });
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

export function formatTransitTime(rawTime?: string): string | undefined {
  if (!rawTime) return undefined;
  const cleaned = rawTime.trim();
  if (!cleaned || cleaned === "N/D" || cleaned === "—" || cleaned === "0" || cleaned === "0m") return undefined;

  const totalMin = parseTransitTimeToMinutes(cleaned);
  if (totalMin <= 0) return undefined;

  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getReliableTransitTime(
  act: Activity,
  nextAct?: Activity,
  dayDate?: string,
  transportsList?: any[]
): string | undefined {
  // 1. Priorità 1: transitTime manuale dell'attività corrente
  if (act.transitTime) {
    const formatted = formatTransitTime(act.transitTime);
    if (formatted) return formatted;
  }

  // 2. Priorità 2: Transport chiaramente associato alla tratta con una duration valida
  if (transportsList && dayDate) {
    const targetAct = act.type === "transport" ? act : (nextAct?.type === "transport" ? nextAct : null);
    if (targetAct) {
      const matchTr = transportsList.find((tr) => {
        if (tr.date !== dayDate) return false;
        const actTitleLower = targetAct.title.toLowerCase();
        const trFromLower = tr.from.toLowerCase();
        const trToLower = tr.to.toLowerCase();
        const cityMatch = actTitleLower.includes(trFromLower) || actTitleLower.includes(trToLower);
        const codeMatch = tr.carrierCode && actTitleLower.includes(tr.carrierCode.toLowerCase());
        return cityMatch || codeMatch;
      });

      if (matchTr?.duration) {
        const formatted = formatTransitTime(matchTr.duration);
        if (formatted) return formatted;
      }
    }
  }

  // 3. Nessuna durata esplicita e affidabile -> undefined (niente N/D, niente stime)
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

        {/* Box PNR & Dettagli Biglietto integrato nel popup QR */}
        {(activity.bookingRef || activity.title) && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-4 space-y-2 text-[12px]">
            {activity.bookingRef && (
              <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-150 shadow-2xs">
                <div>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Codice Prenotazione (PNR)</span>
                  <span className="font-mono font-black text-[14px] text-slate-850 block mt-0.5">{activity.bookingRef}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activity.bookingRef || "");
                    alert(`Codice PNR "${activity.bookingRef}" copiato negli appunti!`);
                  }}
                  className="px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-lg text-[10.5px] font-bold text-blue-700 active:scale-95 transition-all shrink-0"
                >
                  📋 Copia
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">Tratta / Attività</span>
                <span className="font-bold text-slate-800 text-[12px] block truncate">{activity.title}</span>
              </div>
              {activity.time && (
                <div>
                  <span className="text-[9px] font-bold text-gray-400 block uppercase">Orario previsto</span>
                  <span className="font-bold text-slate-800 text-[12px] block">{activity.time}</span>
                </div>
              )}
            </div>
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

export function _hasAddress(activity: Activity): boolean {
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

export function _buildMapsUrl(activity: Activity, dayLocation?: string) {
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

export function buildDayItineraryUrl(activities: Activity[], filter: "all" | "morning" | "afternoon" = "all"): string {
  const filtered = activities.filter(a => {
    if (!a.time) return filter === "all";
    const hourMatch = a.time.match(/^(\d{1,2})/);
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : 12;
    if (filter === "morning") return hour < 13;
    if (filter === "afternoon") return hour >= 13;
    return true;
  });
  const withLocation = filtered.filter(a => {
    const q = cleanSubtitle(a.subtitle) || a.title;
    return q && q.trim().length > 2;
  });
  if (withLocation.length === 0) return "";
  const makeQ = (a: Activity) =>
    cleanSubtitle(a.subtitle)
      ? `${a.title}, ${cleanSubtitle(a.subtitle)}`
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

// ── Sheet / Modal per scegliere la fascia dell'itinerario Google Maps ───────────
export function MapsPeriodSheet({
  allUrl,
  morningUrl,
  afternoonUrl,
  onClose,
}: {
  allUrl?: string;
  morningUrl?: string;
  afternoonUrl?: string;
  onClose: () => void;
}) {
  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-2 mb-1">
          <IcMapPin size={20} className="text-blue-600" />
          <h2 className="text-[17px] font-extrabold text-gray-900">Apri itinerario su Google Maps</h2>
        </div>
        <p className="text-[12px] text-gray-400 mb-5">
          Scegli quale fascia oraria della giornata desideri visualizzare sulla mappa:
        </p>

        <div className="space-y-2.5 mb-4">
          {allUrl && (
            <a
              href={allUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-extrabold text-[13px] flex items-center justify-between hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span>🗺️</span>
                <span>Giornata intera</span>
              </div>
              <span>➔</span>
            </a>
          )}

          {morningUrl && (
            <a
              href={morningUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 font-bold text-[13px] flex items-center justify-between hover:bg-gray-100 active:scale-95 transition-all"
            >
              <div className="flex items-center gap-2">
                <span>🌅</span>
                <span>Mattina (fino alle 13:00)</span>
              </div>
              <span className="text-gray-400">➔</span>
            </a>
          )}

          {afternoonUrl && (
            <a
              href={afternoonUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 font-bold text-[13px] flex items-center justify-between hover:bg-gray-100 active:scale-95 transition-all"
            >
              <div className="flex items-center gap-2">
                <span>🌆</span>
                <span>Pomeriggio (dalle 13:00 in poi)</span>
              </div>
              <span className="text-gray-400">➔</span>
            </a>
          )}
        </div>

        <button
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
          onClick={onClose}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

export function DayMapsButton({ activities }: { activities: Activity[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const allUrl = buildDayItineraryUrl(activities, "all");
  const morningUrl = buildDayItineraryUrl(activities, "morning");
  const afternoonUrl = buildDayItineraryUrl(activities, "afternoon");

  const hasAll = !!allUrl && allUrl !== "";
  const hasMorning = !!morningUrl && morningUrl !== "" && morningUrl !== allUrl;
  const hasAfternoon = !!afternoonUrl && afternoonUrl !== "" && afternoonUrl !== allUrl;

  if (!hasAll) return null;

  const hasMultiple = hasMorning || hasAfternoon;

  const handleClick = (e: React.MouseEvent) => {
    if (hasMultiple) {
      e.preventDefault();
      setSheetOpen(true);
    }
  };

  return (
    <>
      <a
        href={hasMultiple ? "#" : allUrl}
        target={hasMultiple ? undefined : "_blank"}
        rel={hasMultiple ? undefined : "noreferrer"}
        onClick={handleClick}
        className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 font-extrabold text-[10.5px] flex items-center gap-1 active:scale-95 transition-all shrink-0"
        title="Apri itinerario su Google Maps"
      >
        <IcMapPin size={11} className="text-blue-600" />
        <span>Apri mappa</span>
      </a>

      {sheetOpen && (
        <MapsPeriodSheet
          allUrl={hasAll ? allUrl : undefined}
          morningUrl={hasMorning ? morningUrl : undefined}
          afternoonUrl={hasAfternoon ? afternoonUrl : undefined}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

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
  dayLocation: _dayLocation,
  dayDate,
  transportsList,
  accommodationsList,
  drivingRoutesMap,
  drivingRouteErrorsMap,
}: {
  activity: Activity;
  nextActivity?: Activity;
  transitTime?: string;
  prevAccommodation?: any;
  isActive: boolean;
  isFirst?: boolean;
  isLast: boolean;
  onQRTap: (act: Activity) => void;
  onEdit: (focusMapsUrl?: boolean) => void;
  completed: boolean;
  onToggle: () => void;
  dayLocation?: string;
  dayDate?: string;
  transportsList?: any[];
  accommodationsList?: any[];
  drivingRoutesMap?: Record<string, DrivingRoute>;
  drivingRouteErrorsMap?: Record<string, Extract<DrivingRouteResult, { ok: false }>>;
}) {
  const [copiedPnr, setCopiedPnr] = useState(false);
  const [copilotaOpen, setCopilotaOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isTransport = activity.type === "transport";
  const hasSavedMapsUrl = !!((activity as any)?.mapsUrl?.trim());

  const prevAccMapsUrl = prevAccommodation?.mapsUrl?.trim();
  const actMapsUrl = (activity as any)?.mapsUrl?.trim();
  const nextMapsUrl = (nextActivity as any)?.mapsUrl?.trim();

  const prevAccFallback = prevAccommodation ? buildRoutingFallbackQuery(undefined, undefined, prevAccommodation) : undefined;
  const actFallback = buildRoutingFallbackQuery(activity, _dayLocation);
  const nextFallback = nextActivity ? buildRoutingFallbackQuery(nextActivity, _dayLocation) : undefined;

  const prevAccKey = buildSegmentCacheKey(prevAccMapsUrl, prevAccFallback, actMapsUrl, actFallback);
  const nextKey = buildSegmentCacheKey(actMapsUrl, actFallback, nextMapsUrl, nextFallback);

  const prevAccRoute = drivingRoutesMap ? drivingRoutesMap[prevAccKey] : undefined;
  const calculatedNextRoute = drivingRoutesMap ? drivingRoutesMap[nextKey] : undefined;
  const nextRouteError = drivingRouteErrorsMap ? drivingRouteErrorsMap[nextKey] : undefined;

  if (import.meta.env.DEV && nextActivity) {
    const isDriving = isDrivingTransit(activity, nextActivity, transportsList, dayDate);
    console.debug("[ROUTING DEBUG] render-check", {
      cacheKey: nextKey,
      segmentType: isDriving ? "driving" : "non-driving",
      hasRoute: !!calculatedNextRoute,
      hasRouteError: !!nextRouteError,
      routeErrorReason: nextRouteError?.reason,
      reasonShown: calculatedNextRoute
        ? "route"
        : nextRouteError?.reason
        ? nextRouteError.reason
        : "not_calculated_yet",
    });
  }

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
  const hasSecondaryDetails = !!(pnr || timeBefore || carrierCode || seat || gate || terminal || logistics || baggageNote || activity.duration || activity.note || activity.ticketUrl);

  // ── Risoluzione dinamica dei titoli e delle tratte per Trasporti e Alloggi ──
  const isHotel = activity.type === "hotel";
  const isGenericTitle = !activity.title || activity.title.trim().length <= 2 || activity.title.trim().toUpperCase() === "T." || activity.title.toLowerCase().startsWith("treno:");

  const transportRouteTitle = matchedTr?.from && matchedTr?.to
    ? `${matchedTr.from} → ${matchedTr.to}`
    : (cleanSubtitle(activity.subtitle) && isGenericTitle
        ? cleanSubtitle(activity.subtitle)
        : activity.title);

  const accFullName = (isHotel && matchedAcc?.name && matchedAcc.name.length > activity.title.length)
    ? matchedAcc.name
    : activity.title;

  const displayTitle = isTransport
    ? (transportRouteTitle && transportRouteTitle.length > 0 ? transportRouteTitle : activity.title)
    : isHotel
    ? accFullName
    : activity.title;

  const displaySubtitle = isTransport
    ? (displayTitle === cleanSubtitle(activity.subtitle)
        ? (matchedTr?.detail || undefined)
        : (activity.subtitle && !activity.subtitle.includes(displayTitle) ? cleanSubtitle(activity.subtitle) : matchedTr?.detail))
    : isHotel
    ? (matchedAcc?.address ? `${matchedAcc.address}${matchedAcc.city ? `, ${matchedAcc.city}` : ""}` : cleanSubtitle(activity.subtitle))
    : cleanSubtitle(activity.subtitle);

  const categoryBadgeLabel = isTransport
    ? (matchedTr?.type ? (matchedTr.type.charAt(0).toUpperCase() + matchedTr.type.slice(1)) : "Trasporto")
    : isHotel
    ? "Alloggio"
    : activity.type === "sightseeing" ? "Visita"
    : activity.type === "food" ? "Pasto"
    : activity.type === "shopping" ? "Shopping"
    : "Altro";

  const transportSchedule = isTransport && matchedTr?.time
    ? `${matchedTr.time}${matchedTr.arrivalTime ? ` → ${matchedTr.arrivalTime}` : ""}`
    : undefined;

  const detailsToggleLabel = isTransport
    ? (showDetails ? "▲ Nascondi dettagli trasporto" : "⌄ Dettagli trasporto")
    : isHotel
    ? (showDetails ? "▲ Nascondi dettagli alloggio" : "⌄ Dettagli alloggio")
    : (showDetails ? "▲ Nascondi dettagli" : "⌄ Dettagli");

  return (
    <div className="space-y-0">
      {/* Distanza da alloggio precedente se prima tappa */}
      {isFirst && prevAccommodation && (
        <div className="my-2 flex items-center gap-2 pl-11 pb-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50/90 border border-blue-100/80 text-blue-900 max-w-[88%] shadow-2xs">
            <span className="text-[11px] shrink-0">🏨</span>
            <span className="text-[11px] font-extrabold leading-snug line-clamp-2 [overflow-wrap:anywhere]">
              DA {prevAccommodation.name ? `${prevAccommodation.name}${prevAccommodation.city ? ` (${prevAccommodation.city})` : ""}` : prevAccommodation.city || "alloggio notte precedente"}
            </span>
            {transitTime ? (
              <span className="px-1.5 py-0.2 rounded-md font-black text-[9.5px] bg-blue-100/70 border border-blue-200/60 text-blue-700 shrink-0 ml-1">
                ⏱️ {transitTime}
              </span>
            ) : prevAccRoute ? (
              <span className="px-1.5 py-0.2 rounded-md font-black text-[9.5px] bg-blue-100/70 border border-blue-200/60 text-blue-700 shrink-0 ml-1">
                🚗 {prevAccRoute.formattedText}
              </span>
            ) : null}
          </div>
          <div className="flex-1 border-t border-dashed border-blue-200/60" />
        </div>
      )}

      <div className={`grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 items-start transition-opacity ${completed ? "opacity-50" : ""}`}>
        {/* Colonna 1: Timeline Sinistra (Orario, Pallino, Linea) */}
        <div className="flex flex-col items-center flex-shrink-0 w-11 pt-0.5 self-stretch">
          <span className={`text-[11px] leading-none font-extrabold tracking-tight text-center ${
            isActive ? "text-blue-700 font-black" : "text-gray-500"
          } ${completed ? "line-through text-gray-300" : ""}`}>
            {activity.time}
          </span>
          <div className="my-1.5 flex items-center justify-center min-h-[20px]">
            <div className={`rounded-full flex-shrink-0 transition-all duration-300 ${
              isActive ? "bg-blue-600 w-4.5 h-4.5 shadow-md shadow-blue-500/20 ring-4 ring-blue-100/50"
                : isTransport ? "bg-blue-500 w-3 h-3"
                : "bg-emerald-500 w-3 h-3"
            }`} />
          </div>
          {!isLast && <div className="w-0.5 flex-1 bg-gray-200" />}
        </div>

        {/* Colonna 2: Card Contenuto Principale + Connettore sottostante */}
        <div className="min-w-0 flex-1 w-full pb-1">
          <div
            className={`w-full min-w-0 mb-1.5 app-card p-3 cursor-pointer transition-all duration-300 border ${
              isActive
                ? "border-l-4 border-l-blue-500 border-blue-200 bg-blue-50/5 shadow-xs"
                : "bg-white border-gray-150/70"
            }`}
            onClick={() => onEdit()}
          >
            {/* RIGA 1: Categoria/Tipo a sinistra, Cerchio completamento a destra */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <ActivityIcon type={activity.type} size={15} />
                {isActive && !completed && (
                  <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-widest shrink-0">
                    Ora / Prossimo
                  </span>
                )}
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0 border ${
                  activity.type === "sightseeing" ? "bg-blue-50 text-blue-700 border-blue-100" :
                  activity.type === "food" ? "bg-orange-50 text-orange-700 border-orange-100" :
                  activity.type === "hotel" ? "bg-purple-50 text-purple-700 border-purple-100" :
                  activity.type === "shopping" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                  activity.type === "transport" ? "bg-blue-50 text-blue-700 border-blue-100" :
                  "bg-gray-100 text-gray-600 border-gray-200"
                }`}>
                  {categoryBadgeLabel}
                </span>
              </div>

              {/* Pulsante completamento allineato in alto a destra nella riga della categoria */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 shrink-0"
                style={{
                  borderColor: completed ? "#10b981" : "#d1d5db",
                  backgroundColor: completed ? "#10b981" : "transparent"
                }}
                aria-label={completed ? "Segna come da completare" : "Segna come completata"}
                title={completed ? "Completata" : "Segna completata"}
              >
                {completed && <span className="text-white text-[10px] font-black">✓</span>}
              </button>
            </div>

            {/* RIGA 2: Titolo Attività */}
            <h3 className={`font-extrabold text-[14.5px] leading-snug line-clamp-2 ${completed ? "line-through text-gray-400" : "text-gray-900"}`}>
              {displayTitle}
            </h3>

            {/* RIGA 3: Località se presente */}
            {displaySubtitle && (
              <p className="text-[12px] text-gray-500 font-semibold line-clamp-1 mt-0.5">
                {displaySubtitle}
              </p>
            )}

            {/* Orario di trasporto se disponibile */}
            {transportSchedule && (
              <p className="text-[11px] font-extrabold text-blue-700 mt-1">
                ⏱ {transportSchedule}
              </p>
            )}

            {/* Azioni rapide: Maps / Biglietto / PNR */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {hasSavedMapsUrl ? (
                <a
                  href={(activity as any).mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md active:scale-95 transition-all flex items-center gap-1 text-[10px] font-bold shrink-0 border border-blue-100/80"
                  title="Apri posizione su Google Maps"
                >
                  <IcMapPin size={11} className="text-blue-600" />
                  <span>Mappa</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(true);
                  }}
                  className="px-2 py-0.5 bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50/60 rounded-md active:scale-95 transition-all flex items-center gap-1 text-[10px] font-bold shrink-0 border border-slate-200/60"
                  title="Aggiungi link Google Maps"
                >
                  <IcMapPin size={11} className="text-slate-400" />
                  <span>+ Aggiungi mappa</span>
                </button>
              )}

              {activity.hasQR && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQRTap(activity);
                  }}
                  className={`active:scale-95 transition-transform flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200/60"
                  }`}
                  title="Visualizza Biglietto QR"
                  aria-label="Visualizza Biglietto QR"
                >
                  <IcQR size={13} className={isActive ? "text-white" : "text-gray-600"} />
                  <span>Biglietto</span>
                </button>
              )}

              {pnr && (
                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200/70 shrink-0">
                  PNR: {pnr}
                </span>
              )}
            </div>

            {/* RIGA 4: Controllo compatto "⌄ Dettagli" */}
            {hasSecondaryDetails && (
              <div className="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails((prev) => !prev);
                  }}
                  className="text-[10px] font-extrabold text-gray-500 hover:text-blue-600 flex items-center gap-1 transition-colors py-0.5"
                >
                  <span>{detailsToggleLabel}</span>
                </button>
              </div>
            )}

            {/* Dettagli Espandibili */}
            {showDetails && hasSecondaryDetails && (
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-2 text-[11px] text-gray-600" onClick={(e) => e.stopPropagation()}>
                {pnr && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9.5px] font-black text-gray-400 uppercase">Codice Prenotazione:</span>
                      <span className="font-mono font-black text-[12px] text-gray-900">{pnr}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(pnr);
                        setCopiedPnr(true);
                        setTimeout(() => setCopiedPnr(false), 2000);
                      }}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-[9.5px] font-bold text-gray-700 hover:bg-slate-50 transition-all active:scale-95"
                    >
                      {copiedPnr ? "Copiato ✓" : "Copia PNR"}
                    </button>
                  </div>
                )}
                {(carrierCode || seat || gate || terminal || baggageNote) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    {carrierCode && <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">✈️ {carrierCode} {terminal ? `(T${terminal})` : ""}</span>}
                    {seat && <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">💺 Posto {seat}</span>}
                    {gate && <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">🚪 Gate {gate}</span>}
                    {baggageNote && <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium">🧳 {baggageNote}</span>}
                  </div>
                )}
                {(activity.duration || timeBefore) && (
                  <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                    {activity.duration && <span className="font-semibold text-slate-700">⏱ Durata: {activity.duration}</span>}
                    {timeBefore && <span className="font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/60">⌛ Presentarsi: {timeBefore}</span>}
                  </div>
                )}
                {activity.ticketUrl && (
                  <div>
                    <a href={activity.ticketUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
                      🎟️ Apri biglietto / documento
                    </a>
                  </div>
                )}
                {activity.note && (
                  <div className="p-2 bg-slate-50 rounded-lg text-[11px] italic text-slate-600 border border-slate-150">
                    📝 {activity.note}
                  </div>
                )}
                {logistics && (
                  <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg space-y-1">
                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider block">🚗 Indicazioni Copilota</span>
                    <p className="text-[11.5px] text-slate-700 leading-relaxed font-medium">{logistics}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connettore transito */}
          {nextActivity && (() => {
            const displayTransitTime = getReliableTransitTime(activity, nextActivity, dayDate, transportsList);
            if (displayTransitTime) {
              return (
                <div className="my-2.5 flex items-center gap-2 text-[10.5px] font-bold text-slate-700 flex-wrap w-full">
                  <span className="px-2 py-0.5 rounded-full font-extrabold text-[10.5px] border bg-amber-50 border-amber-200 text-amber-900 shadow-2xs">
                    ⏱️ Tratta: {displayTransitTime}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-200 min-w-[20px]" />
                  <span className="text-[10px] text-gray-400 font-bold shrink-0">Fino alle {nextActivity.time}</span>
                </div>
              );
            }

            if (calculatedNextRoute) {
              return (
                <div className="my-2.5 flex items-center gap-2 text-[10.5px] font-bold text-slate-700 flex-wrap w-full">
                  <span className="px-2 py-0.5 rounded-full font-extrabold text-[10.5px] border bg-blue-50 border-blue-100/80 text-blue-700 shrink-0">
                    🚗 Guida · {calculatedNextRoute.formattedText}
                  </span>
                  <div className="flex-1 border-t border-dashed border-blue-200 min-w-[20px]" />
                  <span className="text-[10px] text-gray-400 font-bold shrink-0">Fino alle {nextActivity.time}</span>
                </div>
              );
            }

            const isDriving = isDrivingTransit(activity, nextActivity, transportsList, dayDate);

            if (isDriving) {
              let errorBadgeLabel = "";
              let errorBadgeTooltip = "";

              if (nextRouteError?.reason === "origin_not_found") {
                errorBadgeLabel = "⚠️ Partenza non localizzata";
                errorBadgeTooltip = "Impossibile trovare le coordinate per il punto di partenza.";
              } else if (nextRouteError?.reason === "destination_not_found") {
                errorBadgeLabel = "⚠️ Destinazione non localizzata";
                errorBadgeTooltip = "Impossibile trovare le coordinate per la destinazione.";
              } else if (nextRouteError?.reason === "geocode_mismatch") {
                errorBadgeLabel = "⚠️ Località incoerente: verifica indirizzo o Maps";
                errorBadgeTooltip = "I punti geografici trovati non sembrano coerenti con il percorso.";
              } else if (nextRouteError?.reason === "routing_unavailable" || nextRouteError?.reason === "routing_failed") {
                errorBadgeLabel = "⚠️ Routing stradale non disponibile";
                errorBadgeTooltip = "Non è stato possibile calcolare un percorso stradale tra i due punti.";
              }

              if (errorBadgeLabel) {
                return (
                  <div className="my-2 flex items-center gap-2 w-full flex-wrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(true);
                      }}
                      className="px-2 py-0.5 rounded-full font-bold text-[9.5px] bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 shrink-0 flex items-center gap-1 active:scale-95 transition-all"
                      title={errorBadgeTooltip}
                    >
                      <span>{errorBadgeLabel}</span>
                    </button>
                    <div className="flex-1 border-t border-dashed border-gray-200 min-w-[20px]" />
                    <span className="text-[10px] text-gray-400 font-bold shrink-0">Fino alle {nextActivity.time}</span>
                    <div className="flex-1 border-t border-dashed border-gray-200 min-w-[20px]" />
                  </div>
                );
              }

              return (
                <div className="my-2 flex items-center gap-2 w-full flex-wrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(true);
                    }}
                    className="px-2 py-0.5 rounded-full font-bold text-[9.5px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 shrink-0 flex items-center gap-1 active:scale-95 transition-all"
                    title="Premi 'Calcola guida' per stimare la durata e la distanza di questa tratta."
                  >
                    <span>Calcola guida per stimare la tratta</span>
                  </button>
                  <div className="flex-1 border-t border-dashed border-gray-200 min-w-[20px]" />
                  <span className="text-[10px] text-gray-400 font-bold shrink-0">
                    Fino alle {nextActivity.time}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-200 min-w-[20px]" />
                </div>
              );
            }

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
              } else if (combinedText.includes("cammino") || combinedText.includes("piedi") || combinedText.includes("walk") || combinedText.includes("trekking")) {
                transportEmoji = "🚶";
                transportLabel = "A piedi";
              }
            }
            
            const isDrive = transportLabel === "Guida";

            return (
              <div className="my-2.5 flex items-center gap-2 text-[10.5px] font-bold text-slate-700 flex-wrap w-full">
                <span className={`px-2 py-0.5 rounded-full font-extrabold text-[10.5px] border shrink-0 ${
                  isDrive 
                    ? "bg-blue-50 border-blue-100 text-blue-700" 
                    : "bg-amber-50 border-amber-200 text-amber-900 shadow-2xs"
                }`}>
                  {transportEmoji} {transportLabel} · {displayTransitTime}
                </span>
                <div className={`flex-1 border-t border-dashed ${isDrive ? "border-blue-200" : "border-amber-200"} min-w-[20px]`} />
                <span className="text-[10px] text-gray-400 font-bold shrink-0">
                  Fino alle {nextActivity.time}
                </span>
              </div>
            );
          })()}
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

// ── Main TodayView ────────────────────────────────────────────────────────────
export default function TodayView() {
  const navigate = useNavigate();
  const [selectedDayId, setSelectedDayId] = useState(TODAY_DAY_ID);
  const [tripDays, setTripDays] = useState<DayData[]>([]);
  const [completedActs, setCompletedActs] = useState<string[]>([]);
  const [transportsList, setTransportsList] = useState<any[]>([]);
  const [accommodationsList, setAccommodationsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string; focusMapsUrl?: boolean } | null>(null);
  const [addingToDay, setAddingToDay] = useState<{ id: string; label: string } | null>(null);

  const [drivingRoutesMap, setDrivingRoutesMap] = useState<Record<string, DrivingRoute>>({});
  const [drivingRouteErrorsMap, setDrivingRouteErrorsMap] = useState<
    Record<string, Extract<DrivingRouteResult, { ok: false }>>
  >({});
  const [isCalculatingDriving, setIsCalculatingDriving] = useState(false);
  const [hasRunCalculation, setHasRunCalculation] = useState(false);
  const [calcProgress, setCalcProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    async function initData() {
      try {
        const days = await repository.getTripDays(DAYS);
        const completed = await repository.getCompletedActivities();
        const trs = await repository.getTransports(TRANSPORTS);
        const accs = await repository.getAccommodations(ACCOMMODATIONS);
        setTripDays(days);
        setCompletedActs(completed);
        setTransportsList(trs);
        setAccommodationsList(accs);
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
    if (isLoading || tripDays.length === 0) return;

    const currentDay = tripDays.find((d) => d.id === selectedDayId) ?? tripDays[0];
    const currIdx = tripDays.findIndex((d) => d.id === selectedDayId);
    const pDay = currIdx > 0 ? tripDays[currIdx - 1] : null;
    const pDayAcc = pDay ? getTodayAccommodation(pDay.date, accommodationsList, pDay.activities) : null;
    const candidateSegs = currentDay ? getDrivingCandidateSegments(currentDay, pDayAcc, accommodationsList, transportsList) : [];
    if (candidateSegs.length === 0) return;

    let isMounted = true;

    async function loadCachedRoutes() {
      const loaded: Record<string, DrivingRoute> = {};
      for (const seg of candidateSegs) {
        const cached = await getCachedDrivingRoute(
          seg.originUrl || seg.originFallback || "",
          seg.destUrl || seg.destFallback || ""
        );
        if (cached && isMounted) {
          const cacheKey = buildSegmentCacheKey(seg.originUrl, seg.originFallback, seg.destUrl, seg.destFallback);
          loaded[cacheKey] = cached;
        }
      }
      if (isMounted && Object.keys(loaded).length > 0) {
        setDrivingRoutesMap((prev) => ({ ...prev, ...loaded }));
      }
    }

    loadCachedRoutes();

    return () => {
      isMounted = false;
    };
  }, [selectedDayId, tripDays, accommodationsList, transportsList, isLoading]);



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

  function handleAddActivity(dayId: string, activity: Activity) {
    const nextDays = tripDays.map((day) => {
      if (day.id === dayId) {
        const nextActs = [...day.activities, activity];
        nextActs.sort((a, b) => a.time.localeCompare(b.time));
        return { ...day, activities: nextActs };
      }
      return day;
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
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

  const processedActivities = dedupeDayActivities(today?.activities || [], today?.date, accommodationsList);

  const totalDriveMinutes = today ? processedActivities.reduce((sum, act, idx) => {
    const nextAct = processedActivities[idx + 1];
    if (!nextAct || !isDrivingTransit(act, nextAct, transportsList, today.date)) return sum;
    const timeStr = getReliableTransitTime(act, nextAct, today.date, transportsList);
    return sum + parseTransitTimeToMinutes(timeStr);
  }, 0) : 0;

  const totalDriveTimeStr = formatMinutesToHoursAndMinutes(totalDriveMinutes);

  const visibleActivities = expanded ? processedActivities : processedActivities.slice(0, VISIBLE_COUNT);
  const hasMore = processedActivities.length > VISIBLE_COUNT;
  const tomorrowActivities = tomorrow?.activities ?? [];

  const imminentTransport = (() => {
    if (!today?.date) return null;
    return (transportsList || []).find((t) => t.date === today.date);
  })();

  const prevDay = currentIdx > 0 ? tripDays[currentIdx - 1] : null;
  const prevDayAcc = prevDay ? getTodayAccommodation(prevDay.date, accommodationsList, prevDay.activities) : null;

  const candidateSegments = today ? getDrivingCandidateSegments(today, prevDayAcc, accommodationsList, transportsList) : [];
  const hasCandidateSegments = candidateSegments.length > 0;
  const calculatedCount = candidateSegments.filter(
    (seg) => !!drivingRoutesMap[buildSegmentCacheKey(seg.originUrl, seg.originFallback, seg.destUrl, seg.destFallback)]
  ).length;
  const unverifiedCount = candidateSegments.length - calculatedCount;

  const calcSummaryPill = (() => {
    if (isCalculatingDriving) return null;
    if (calculatedCount > 0) {
      if (unverifiedCount === 0) {
        return (
          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-lg border border-emerald-200 shrink-0">
            ✓ {calculatedCount} tratte calcolate
          </span>
        );
      }
      return (
        <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 shrink-0">
          {calculatedCount} calcolate &middot; {unverifiedCount} da verificare
        </span>
      );
    }
    if (hasRunCalculation && candidateSegments.length > 0) {
      return (
        <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 shrink-0">
          {candidateSegments.length} da verificare
        </span>
      );
    }
    return null;
  })();

  async function handleCalculateDriving() {
    if (!today || isCalculatingDriving || candidateSegments.length === 0) return;

    setIsCalculatingDriving(true);
    setHasRunCalculation(true);
    setCalcProgress({ current: 0, total: candidateSegments.length });

    for (let i = 0; i < candidateSegments.length; i++) {
      const seg = candidateSegments[i];
      setCalcProgress({ current: i + 1, total: candidateSegments.length });
      const cacheKey = buildSegmentCacheKey(seg.originUrl, seg.originFallback, seg.destUrl, seg.destFallback);

      if (import.meta.env.DEV) {
        const originAct = (today.activities || []).find((a) => a.id === seg.fromId);
        const destAct = (today.activities || []).find((a) => a.id === seg.toId);
        const nodeSource = seg.fromId === "prev_acc"
          ? "previous_accommodation"
          : seg.fromId === "today_acc"
          ? "current_accommodation"
          : originAct?.type === "transport"
          ? "transport"
          : "activity";

        console.debug("[ROUTING INPUT]", {
          dayId: today.id,
          originId: seg.fromId,
          destinationId: seg.toId,
          originTitle: originAct?.title || prevDayAcc?.name || seg.fromId,
          destinationTitle: destAct?.title || acco?.name || seg.toId,
          originNode: originAct || prevDayAcc,
          destinationNode: destAct || acco,
          originUrl: seg.originUrl,
          originFallback: seg.originFallback,
          destinationUrl: seg.destUrl,
          destinationFallback: seg.destFallback,
          cacheKey,
          hasUsableOrigin: Boolean(seg.originUrl || seg.originFallback),
          hasUsableDestination: Boolean(seg.destUrl || seg.destFallback),
          nodeSource,
          relatedAccommodationId: seg.fromId === "prev_acc" ? prevDayAcc?.id : seg.toId === "today_acc" ? acco?.id : undefined,
          relatedTransportId: originAct?.type === "transport" ? originAct.id : destAct?.type === "transport" ? destAct.id : undefined,
        });

        console.debug("[ROUTING DEBUG] candidate", {
          dayId: today.id,
          originId: seg.fromId,
          destinationId: seg.toId,
          cacheKey,
          originUrl: seg.originUrl,
          destinationUrl: seg.destUrl,
          originFallback: seg.originFallback,
          destinationFallback: seg.destFallback,
        });
      }

      try {
        const res = await calculateDrivingRoute(
          seg.originUrl,
          seg.destUrl,
          seg.originFallback,
          seg.destFallback
        );
        if (res.ok) {
          if (import.meta.env.DEV) {
            console.debug("[ROUTING DEBUG] route-result", {
              cacheKey,
              status: "success",
              distanceKm: res.route.distanceKm,
              durationMin: res.route.durationMin,
            });
            console.debug("[ROUTING DEBUG] state-write", {
              cacheKey,
              routeValue: res.route,
            });
          }
          setDrivingRoutesMap((prev) => ({
            ...prev,
            [cacheKey]: res.route,
          }));
          setDrivingRouteErrorsMap((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
        } else {
          if (import.meta.env.DEV) {
            console.debug("[ROUTING DEBUG] route-error", {
              cacheKey,
              reason: res.reason,
              originLabel: res.originLabel,
              destinationLabel: res.destinationLabel,
              queriesTried: res.queriesTried,
            });
          }
          setDrivingRouteErrorsMap((prev) => ({
            ...prev,
            [cacheKey]: res,
          }));
        }
      } catch (e) {
        console.error("Errore calcolo guida:", e);
      }

      if (i < candidateSegments.length - 1) {
        await delayMs(1000);
      }
    }

    setIsCalculatingDriving(false);
  }

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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 pr-1">
              <h1 className="text-[20px] font-bold text-gray-900 leading-tight truncate">
                Oggi &middot; {todayLabel}
              </h1>
              <div className="mt-1 flex items-start gap-1">
                <IcMapPin size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span className="text-[12.5px] text-emerald-800 font-bold leading-snug line-clamp-2 [overflow-wrap:anywhere]">
                  {today?.location || "In viaggio"}
                </span>
              </div>
            </div>
            {/* Navigazione giorno e Calendario */}
            <div className="flex items-center gap-1 flex-shrink-0 self-start pt-0.5">
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

        {/* 2. TIMELINE DELLA GIORNATA (Primo contenuto principale) */}
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-extrabold text-gray-900">Programma di Oggi</h2>
                {calcSummaryPill}
              </div>
              <p className="text-[11.5px] text-gray-400 font-medium mt-0.5">
                {today?.dateShort} &middot; {processedActivities.length} attività &middot; {totalDriveTimeStr ? `🚗 ${totalDriveTimeStr} guida` : "Nessun tragitto auto"}
              </p>
            </div>

            {hasCandidateSegments && (
              <button
                onClick={handleCalculateDriving}
                disabled={isCalculatingDriving}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-[11.5px] transition-all flex items-center gap-1.5 shadow-xs ${
                  isCalculatingDriving
                    ? "bg-blue-100 text-blue-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
                }`}
              >
                {isCalculatingDriving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Calcolo ({calcProgress.current}/{calcProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <span>🚗 Calcola guida</span>
                  </>
                )}
              </button>
            )}
          </div>

          {processedActivities.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-[13px]">
              Nessuna attività in programma per questo giorno.
            </div>
          ) : (
            <>
              <div className="space-y-0">
                {visibleActivities.map((act, idx) => {
                  const nextAct = processedActivities[idx + 1];
                  const transitTime = idx === 0 && prevDayAcc
                    ? (act.transitTime ? formatTransitTime(act.transitTime) : undefined)
                    : getReliableTransitTime(act, nextAct, today.date, transportsList);
                  const isActive = idx === 0 && selectedDayId === TODAY_DAY_ID;
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
                      onEdit={(focusMapsUrl) => setEditingActivity({ dayId: today.id, activity: act, dayLabel: today.dateLabel, focusMapsUrl })}
                      completed={completedActs.includes(act.id)}
                      onToggle={() => toggleActivity(act.id)}
                      dayLocation={today.location}
                      dayDate={today.date}
                      transportsList={transportsList}
                      accommodationsList={accommodationsList}
                      drivingRoutesMap={drivingRoutesMap}
                      drivingRouteErrorsMap={drivingRouteErrorsMap}
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
            </>
          )}
        </section>

        {/* 3. TRASPORTO (Subito sotto la timeline, solo se associato a oggi) */}
        {imminentTransport && (
          <section
            onClick={() => navigate("/trasporti")}
            className="card p-3.5 border border-purple-100 bg-purple-50/30 hover:bg-purple-50 transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-black text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md">
                ✈️ TRASPORTO OGGI
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

        {/* 4. DOVE DORMIAMO STANOTTE (Dopo il trasporto) */}
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
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 font-bold text-[10.5px] flex items-center gap-1 active:scale-95 transition-all shrink-0 border border-slate-200/70"
                  title="Aggiungi link Google Maps alloggio"
                >
                  <IcMapPin size={11} className="text-slate-500" />
                  <span>+ Aggiungi mappa</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* Strip Scorciatoie Rapide (Spese, Checklist, Emergenze) */}
        <section className="grid grid-cols-3 gap-2 pt-1 pb-1">
          <button
            onClick={() => navigate("/budgeter")}
            className="h-10 px-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 font-extrabold text-[11.5px] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 whitespace-nowrap overflow-hidden"
          >
            <span className="text-[13px] text-purple-600 font-black">€</span>
            <span>Spese</span>
          </button>

          <button
            onClick={() => navigate("/altro?open=checklist")}
            className="h-10 px-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 font-extrabold text-[11.5px] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 whitespace-nowrap overflow-hidden"
          >
            <span className="text-[13px] text-blue-600 font-black">✓</span>
            <span>Checklist</span>
          </button>

          <button
            onClick={() => navigate("/altro?open=emergencies")}
            className="h-10 px-2 rounded-xl bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/80 text-amber-900 font-extrabold text-[11.5px] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 whitespace-nowrap overflow-hidden"
          >
            <span className="text-[12px]">🚨</span>
            <span>Emergenze</span>
          </button>
        </section>

        {/* 5. ANTEPRIMA DI DOMANI (In fondo) */}
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
          focusMapsUrl={editingActivity.focusMapsUrl}
        />
      )}
      {addingToDay && (
        <AddActivitySheet
          dayId={addingToDay.id}
          dayLabel={addingToDay.label}
          onSave={(dayId, act) => {
            handleAddActivity(dayId, act);
            setAddingToDay(null);
          }}
          onClose={() => setAddingToDay(null)}
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
