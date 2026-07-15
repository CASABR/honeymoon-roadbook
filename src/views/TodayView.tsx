import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  DAYS,
  TODAY_DAY_ID,
  ACCOMMODATIONS,
  getDaysToDeparture,
  getTodayLabel,
} from "../data/mockData";
import type { Activity, DayData } from "../data/mockData";
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

// ── helpers ───────────────────────────────────────────────────────────────────
function getToday(days: DayData[], dayId: string) {
  return days.find((d) => d.id === dayId) ?? days[0];
}

function getTomorrow(days: DayData[], dayId: string) {
  const idx = days.findIndex((d) => d.id === dayId);
  return idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
}

function getTodayAccommodation() {
  // In futuro: filtrare ACCOMMODATIONS per data corrente
  return ACCOMMODATIONS[0]; // primo alloggio del viaggio
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
  if (act.transitTime) return act.transitTime;
  
  // Estrae il tempo dal sottotitolo o dal titolo dell'attività corrente
  const extractedFromCurrent = extractDurationFromText(act.subtitle) || extractDurationFromText(act.title);
  if (extractedFromCurrent) return extractedFromCurrent;
  
  if (!nextAct) return undefined;
  
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
          {DAYS.map((d, idx) => (
            <button
              key={d.id}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                d.id === selectedDayId ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
              }`}
              onClick={() => {
                onSelect(d.id);
                onClose();
              }}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                <span className="text-[12px] font-bold text-gray-700">{idx + 1}</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">{d.dateLabel}</p>
                <p className="text-[11px] text-gray-400">{d.location}</p>
              </div>
              {d.id === TODAY_DAY_ID && (
                <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  OGGI
                </span>
              )}
            </button>
          ))}
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

// Helper function to check if an activity has a real address or POI
function hasAddress(activity: Activity) {
  const title = activity.title ? activity.title.toLowerCase() : "";
  const subtitle = activity.subtitle ? activity.subtitle.toLowerCase() : "";
  
  const genericTitles = ["relax", "tempo libero", "riposo", "colazione", "notte", "dormire", "volo", "scalo", "in viaggio", "noleggio auto", "noleggio"];
  if (genericTitles.some(g => title.includes(g))) return false;
  
  const genericSubtitles = ["attività del giorno", "scalo lungo", "volo", "volo di notte", "dogana e ritiro", "noleggio", "ritiro auto"];
  if (genericSubtitles.some(g => subtitle.includes(g))) return false;

  const hasNumbers = /\d+/.test(subtitle);
  const streetIndicators = ["road", "street", "drive", "avenue", "way", "highway", "gardens", "park", "village", "caves", "nz", "filippine", "australia", "italia", "airport", "via", "piazza", "viale", "corso"];
  const hasStreetIndicator = streetIndicators.some(indicator => subtitle.includes(indicator));
  const hasComma = subtitle.includes(",");
  
  return hasNumbers || hasStreetIndicator || hasComma || activity.type === "hotel" || activity.type === "sightseeing";
}

export function shouldCalculateDriving(act: Activity, nextAct: Activity): boolean {
  if (!hasAddress(act) || !hasAddress(nextAct)) return false;
  
  const combined = `${act.title} ${act.subtitle} ${nextAct.title} ${nextAct.subtitle}`.toLowerCase();
  
  // Escludi voli, aerei, traghetti ed aeroporti (non ha senso calcolare routing stradale)
  const excludeWords = [
    "volo", "flight", "scalo", "air china", "cebu pacific", "virgin", "philippine", 
    "traghetto", "ferry", "bluebridge", "airport", "aeroporto", "transit", "layover",
    "chc →", "adl →", "mel →", "syd →", "mnl →", "mph →", "eni →", "usu →", "ceb →", "fco",
    "china airlines", "air new zealand"
  ];
  if (excludeWords.some(w => combined.includes(w))) return false;
  
  // Escludi passaggi tra nazioni o isole non collegate via terra
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

// ── Timeline row ──────────────────────────────────────────────────────────────
const VISIBLE_COUNT = 4;

function TimelineRow({
  activity,
  nextActivity,
  transitTime,
  isFirst,
  isLast,
  onQRTap,
  onEdit,
  completed,
  onToggle,
  dayLocation,
}: {
  activity: Activity;
  nextActivity?: Activity;
  transitTime?: string;
  isFirst: boolean;
  isLast: boolean;
  onQRTap: (act: Activity) => void;
  onEdit: () => void;
  completed: boolean;
  onToggle: () => void;
  dayLocation?: string;
}) {
  const isTransport = activity.type === "transport";
  const showMaps = hasAddress(activity);
  const mapsUrl = buildMapsUrl(activity, dayLocation);

  return (
    <div className={`flex gap-3 items-start transition-opacity ${completed ? "opacity-60" : ""}`}>
      <div className="w-12 pt-1 flex-shrink-0 text-right">
        <span className={`font-semibold ${isFirst ? "text-blue-700 text-[15px]" : "text-gray-400 text-[13px]"} ${completed ? "line-through text-gray-300" : ""}`}>
          {activity.time}
        </span>
      </div>
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 24, marginTop: 4 }}>
        <div className={`rounded-full flex-shrink-0 ${
          isFirst ? "bg-blue-600 w-5 h-5 shadow-md"
            : isTransport ? "bg-blue-600 w-4 h-4"
            : "bg-white border-2 border-gray-300 w-4 h-4"
        } ${completed ? "!border-emerald-500 !bg-emerald-500" : ""}`} />
        {!isLast && <div className="flex-1 w-0.5 bg-gray-200 mt-1" style={{ minHeight: 32 }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`min-w-0 mb-2 app-card p-3 cursor-pointer ${isFirst ? "border-blue-200" : "bg-white/80"}`}
          onClick={onEdit}
        >
          {isFirst && isTransport ? (
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
                    className="bg-gray-100 hover:bg-gray-200 rounded-xl p-2 active:scale-90 transition-transform"
                    title="Visualizza Biglietti"
                  >
                    <IcQR size={26} className="text-gray-700" />
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
                    className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-90 transition-transform flex items-center justify-center shrink-0"
                    title="Visualizza Biglietti"
                  >
                    <IcQR size={18} className="text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ActivityIcon type={activity.type} size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
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
        </div>

        {/* Transition to next activity */}
        {nextActivity && transitTime && (
          <div className="my-1.5 ml-4 text-[11px] font-bold text-blue-600/95 flex items-center gap-1">
            <span>🚗 {transitTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

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
function AccoBanner({ acc }: { acc: ReturnType<typeof getTodayAccommodation> }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex">
        {acc.imageUrl && (
          <img src={acc.imageUrl} alt={acc.name} className="w-[90px] h-[90px] object-cover flex-shrink-0" />
        )}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <p className="font-bold text-[14px] text-gray-900 leading-snug">{acc.name}</p>
            <p className="text-[12px] text-gray-400">{acc.area ? `${acc.area}, ${acc.city}` : acc.city}</p>
          </div>
          {acc.note && (
            <span className="mt-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full self-start">
              {acc.checkIn}
            </span>
          )}
        </div>
        <div className="flex items-center pr-3">
          <IcChevronRight size={16} className="text-gray-300" />
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 py-2.5 flex items-center justify-center gap-1.5">
        <IcMapPin size={14} className="text-blue-600" />
        {acc.mapsUrl ? (
          <a href={acc.mapsUrl} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-blue-600">
            Apri su Maps
          </a>
        ) : (
          <span className="text-[12px] font-semibold text-blue-600">Apri su Maps</span>
        )}
      </div>
    </div>
  );
}

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
    });
    const fromData = await fromRes.json();
    if (!fromData || fromData.length === 0) return null;
    const fromLon = fromData[0].lon;
    const fromLat = fromData[0].lat;

    const toRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanTo)}&limit=1`, {
      headers: { "User-Agent": "HoneymoonRoadbookApp/1.0" }
    });
    const toData = await toRes.json();
    if (!toData || toData.length === 0) return null;
    const toLon = toData[0].lon;
    const toLat = toData[0].lat;

    const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`);
    const routeData = await routeRes.json();
    if (routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
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
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);
  const [calculatedTransits, setCalculatedTransits] = useState<Record<string, string>>({});

  useEffect(() => {
    async function initData() {
      try {
        const days = await repository.getTripDays(DAYS);
        const completed = await repository.getCompletedActivities();
        setTripDays(days);
        setCompletedActs(completed);
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
      for (const day of tripDays) {
        if (!day.activities || day.activities.length < 2) continue;

        for (let i = 0; i < day.activities.length - 1; i++) {
          if (isCancelled) return;

          const act = day.activities[i];
          const nextAct = day.activities[i + 1];

          // Se ha già un transitTime manuale o estratto dal testo, non c'è bisogno di calcolarlo
          if (act.transitTime || extractDurationFromText(act.subtitle) || extractDurationFromText(act.title)) {
            continue;
          }

          if (!shouldCalculateDriving(act, nextAct)) continue;

          const fromQuery = `${act.title}, ${act.subtitle || ""}`;
          const toQuery = `${nextAct.title}, ${nextAct.subtitle || ""}`;
          const routeKey = `${act.id}_to_${nextAct.id}`;

          // Controlliamo se è già calcolato nello stato locale o presente in cache localStorage
          const cleanFrom = cleanQueryForGeocoding(fromQuery);
          const cleanTo = cleanQueryForGeocoding(toQuery);
          const cacheKey = `hrb_route_${encodeURIComponent(cleanFrom)}_${encodeURIComponent(cleanTo)}`;
          
          if (calculatedTransits[routeKey] || localStorage.getItem(cacheKey)) {
            // Se è già in cache, lo carichiamo nello stato locale se non c'è
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

          // Attendi 1.2 secondi per non sovraccaricare Nominatim ed evitare il rate limit
          await new Promise((resolve) => setTimeout(resolve, 1200));
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
            console.error("Errore durante il recupero del percorso in background:", err);
          }
        }
      }
    };

    calculateAllTransits();

    return () => {
      isCancelled = true;
    };
  }, [tripDays]);

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveTripDays(tripDays);
    }
  }, [tripDays]);

  const [expanded, setExpanded] = useState(false);
  const [qrActivity, setQrActivity] = useState<Activity | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTomorrowFull, setShowTomorrowFull] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setCompletedActs(detail);
    };
    window.addEventListener("hrb_completed_activities_change", handler as EventListener);
    return () => window.removeEventListener("hrb_completed_activities_change", handler as EventListener);
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
  const acco = getTodayAccommodation();

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
    setTripDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id === dayId) {
          const oldAct = day.activities.find((a) => a.id === updated.id);
          const nextActs = day.activities.map((a) => (a.id === updated.id ? updated : a));
          if (oldAct && oldAct.time !== updated.time) {
            nextActs.sort((a, b) => a.time.localeCompare(b.time));
          }
          return { ...day, activities: nextActs };
        }
        return day;
      })
    );
  }

  function handleDeleteActivity(dayId: string, actId: string) {
    setTripDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id === dayId) {
          return { ...day, activities: day.activities.filter((a) => a.id !== actId) };
        }
        return day;
      })
    );
  }

  const daysLeft = getDaysToDeparture();
  const todayLabel = getTodayLabel();

  const totalDriveMinutes = today ? today.activities.reduce((sum, act, idx) => {
    const nextAct = today.activities[idx + 1];
    const timeStr = getCachedTransitTime(act, nextAct);
    return sum + parseTransitTimeToMinutes(timeStr);
  }, 0) : 0;

  const totalDriveTimeStr = formatMinutesToHoursAndMinutes(totalDriveMinutes);

  const visibleActivities = expanded ? today.activities : today.activities.slice(0, VISIBLE_COUNT);
  const hasMore = today.activities.length > VISIBLE_COUNT;
  const tomorrowActivities = tomorrow?.activities ?? [];

  return (
    <>
      <div className="px-4 pt-5 pb-4 space-y-5">
        {/* Header */}
        <div>
          {daysLeft > 0 && (
            <div className="mb-3">
              <span
                className="text-[12px] font-bold px-3 py-1 rounded-full border"
                style={{ color: "#e07b55", borderColor: "#f4c2a4", background: "#fff5f0" }}
              >
                {daysLeft} giorni alla partenza
              </span>
            </div>
          )}
          {daysLeft === 0 && (
            <div className="mb-3">
              <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-blue-600 text-white">
                🎉 Oggi si parte!
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <h1 className="text-[21px] font-bold text-gray-900 leading-tight truncate">
                Oggi &middot; {todayLabel}
              </h1>
              <div className="flex items-center gap-1 mt-1">
                <IcMapPin size={13} className="text-green-500" />
                <span className="text-[13px] text-green-600 font-medium truncate">{today.location}</span>
              </div>
            </div>
            {/* Navigazione giorno e Calendario */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className={`w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center transition-opacity ${
                  currentIdx <= 0 ? "opacity-35 cursor-not-allowed" : "hover:bg-gray-50 active:scale-95"
                }`}
                onClick={handlePrevDay}
                disabled={currentIdx <= 0}
                aria-label="Giorno precedente"
              >
                <IcChevronLeft size={16} className="text-gray-600" />
              </button>

              <button
                className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 active:scale-95"
                onClick={() => setShowDatePicker(true)}
                aria-label="Seleziona giorno"
              >
                <IcCalendar size={18} className="text-gray-600" />
              </button>

              <button
                className={`w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center transition-opacity ${
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

        {/* La tua giornata */}
        <section className="card p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <div>
              <span className="section-label">La tua giornata</span>
              <p className="text-[11px] text-gray-400 mt-0.5">{today.dateLabel}</p>
            </div>
            {totalDriveTimeStr && (
              <span className="text-[11px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/50 flex items-center gap-1 shrink-0">
                🚗 Guida: {totalDriveTimeStr}
              </span>
            )}
          </div>
          <div className="space-y-0">
            {visibleActivities.map((act, idx) => {
              const nextAct = today.activities[idx + 1];
              const transitTime = getCachedTransitTime(act, nextAct);
              return (
                <TimelineRow
                  key={act.id}
                  activity={act}
                  nextActivity={nextAct}
                  transitTime={transitTime}
                  isFirst={idx === 0}
                  isLast={idx === visibleActivities.length - 1}
                  onQRTap={setQrActivity}
                  onEdit={() => setEditingActivity({ dayId: today.id, activity: act, dayLabel: today.dateLabel })}
                  completed={completedActs.includes(act.id)}
                  onToggle={() => toggleActivity(act.id)}
                  dayLocation={today.location}
                />
              );
            })}
          </div>
          {hasMore && (
            <button
              className="w-full mt-3 flex items-center justify-center gap-1 text-[13px] font-semibold text-blue-600 py-2"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostra meno" : "Vedi tutta la giornata"}
              <IcChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </section>

        {/* In evidenza — solo card utili, senza ridondanze */}
        <section>
          <span className="section-label block mb-3">In evidenza</span>
          <div className="grid grid-cols-3 gap-2">
            <QuickCard
              icon="€"
              bgColor="#fffbeb"
              label="Budgeter"
              desc="Controlla spese"
              onClick={() => navigate("/budgeter")}
            />
            <QuickCard
              icon="📋"
              bgColor="#f3e8ff"
              label="Checklist"
              desc="Cose da fare"
              onClick={() => navigate("/altro?open=checklist")}
            />
            <QuickCard
              icon="🚨"
              bgColor="#fff0f0"
              label="Emergenze"
              desc="Numeri utili"
              onClick={() => navigate("/altro?open=emergencies")}
            />
          </div>
        </section>

        {/* Dove dormi stasera */}
        <section>
          <span className="section-label block mb-3">Dove dormi stasera</span>
          <AccoBanner acc={acco} />
        </section>

        {/* Anteprima di domani — scorrevole orizzontale */}
        {tomorrow && tomorrowActivities.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">Anteprima di domani</span>
              <button
                className="text-[12px] font-semibold text-blue-600"
                onClick={() => setShowTomorrowFull(true)}
              >
                Vedi tutto
              </button>
            </div>
            {/* Scroll orizzontale con tutte le attività */}
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {tomorrowActivities.map((act) => (
                <div
                  key={act.id}
                  className="flex-shrink-0 bg-white rounded-xl shadow-sm p-3 w-[140px]"
                >
                  <div className="mb-1.5">
                    <ActivityIcon type={act.type} size={13} />
                  </div>
                  <p className="text-[11px] font-bold text-gray-500 mb-0.5">{act.time}</p>
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight line-clamp-2">
                    {act.title}
                  </p>
                  <p className="text-[10.5px] text-gray-400 mt-0.5 truncate">{cleanSubtitle(act.subtitle)}</p>
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
    </>
  );
}

// ── Sheet per modificare un'attività esistente ────────────────────────────────
function EditActivitySheet({
  activity,
  dayLabel,
  onSave,
  onDelete,
  onClose,
}: {
  activity: Activity;
  dayLabel: string;
  onSave: (updated: Activity) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState(activity.time);
  const [type, setType] = useState<Activity["type"]>(activity.type);
  const [title, setTitle] = useState(activity.title);
  const [subtitle, setSubtitle] = useState(activity.subtitle);
  const [price, setPrice] = useState(activity.price ? String(activity.price) : "");
  const [isPaid, setIsPaid] = useState(!!activity.isPaid);

  function handleSubmit() {
    if (!title.trim() || !time.trim()) return;
    const parsedPrice = parseFloat(price.replace(",", "."));
    onSave({ 
      ...activity, 
      time: time.trim(), 
      type, 
      title: title.trim(), 
      subtitle: subtitle.trim(),
      price: isNaN(parsedPrice) ? undefined : parsedPrice,
      isPaid
    });
    onClose();
  }

  const TYPES: { type: Activity["type"]; label: string; icon: string }[] = [
    { type: "sightseeing", label: "Visita", icon: "📸" },
    { type: "transport", label: "Trasporto", icon: "✈️" },
    { type: "food", label: "Cibo", icon: "🍽️" },
    { type: "shopping", label: "Shopping", icon: "🛍️" },
    { type: "hotel", label: "Hotel", icon: "🏨" },
    { type: "other", label: "Altro", icon: "📍" },
  ];

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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-gray-900">Modifica attività</h2>
            <p className="text-[12px] text-gray-400">{dayLabel}</p>
          </div>
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm("Eliminare questa attività?")) {
                  onDelete();
                  onClose();
                }
              }}
              className="text-[12px] text-red-500 font-extrabold px-3 py-1.5 bg-red-50 rounded-xl hover:bg-red-100 transition-colors active:scale-95"
            >
              🗑️ Elimina
            </button>
          )}
        </div>

        {/* Tipo */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Tipo attività</label>
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors flex items-center gap-1 ${
                  type === t.type ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-1/3">
              <label className="text-[11px] font-semibold text-gray-500 block mb-1">Orario *</label>
              <input
                type="text"
                value={time}
                placeholder="es. 10:30"
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-2/3">
              <label className="text-[11px] font-semibold text-gray-500 block mb-1">Titolo *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Sottotitolo</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-1/3">
              <label className="text-[11px] font-semibold text-gray-500 block mb-1">Prezzo (€)</label>
              <input
                type="text"
                value={price}
                placeholder="es. 40"
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Toggle Pagato */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 mt-2">
            <div>
              <p className="text-[12.5px] font-bold text-gray-800">Stato pagamento</p>
              <p className="text-[10px] text-gray-400 font-medium">Questa attività è già stata bloccata/pagata?</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPaid(!isPaid)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase transition-colors ${
                isPaid
                  ? "bg-green-150 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-500 border border-red-100"
              }`}
            >
              {isPaid ? "✅ Pagato" : "⏳ Da pagare"}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!title.trim() || !time.trim()}
            style={{ opacity: !title.trim() || !time.trim() ? 0.5 : 1 }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
