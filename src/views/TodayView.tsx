import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DAYS,
  TODAY_DAY_ID,
  ACCOMMODATIONS,
  getDaysToDeparture,
  getTodayLabel,
  loadCompletedActivities,
  saveCompletedActivities,
  loadTripDays,
  saveTripDays,
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

// ── QR image localStorage helpers ───────────────────────────────────────────
const LS_QR_KEY = "hrb_qr_images_v1";

function loadQRImages(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(LS_QR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, any>;
      const converted: Record<string, string[]> = {};
      for (const k in parsed) {
        if (typeof parsed[k] === "string") {
          converted[k] = [parsed[k]];
        } else if (Array.isArray(parsed[k])) {
          converted[k] = parsed[k];
        } else {
          converted[k] = [];
        }
      }
      return converted;
    }
  } catch { /* ignore */ }
  return {};
}

function saveQRImages(map: Record<string, string[]>) {
  try { localStorage.setItem(LS_QR_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

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

// ── QR / Dettaglio trasporto Modal ────────────────────────────────────────────
function QRModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const [qrImages, setQrImages] = useState<Record<string, string[]>>(loadQRImages);
  const images = qrImages[activity.id] ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File troppo grande (max 10 MB). Le immagini sono salvate solo nel browser locale.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const updatedList = [...images, dataUrl];
      const updated = { ...qrImages, [activity.id]: updatedList };
      setQrImages(updated);
      saveQRImages(updated);
      setCurrentIndex(updatedList.length - 1);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRemove() {
    if (images.length === 0) return;
    const updatedList = images.filter((_, idx) => idx !== currentIndex);
    const updated = { ...qrImages };
    if (updatedList.length === 0) {
      delete updated[activity.id];
    } else {
      updated[activity.id] = updatedList;
    }
    setQrImages(updated);
    saveQRImages(updated);
    setCurrentIndex(Math.max(0, currentIndex - 1));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
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
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
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
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
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

// ── Timeline row ──────────────────────────────────────────────────────────────
const VISIBLE_COUNT = 4;

function TimelineRow({
  activity,
  isFirst,
  isLast,
  onQRTap,
  onEdit,
  completed,
  onToggle,
}: {
  activity: Activity;
  isFirst: boolean;
  isLast: boolean;
  onQRTap: (act: Activity) => void;
  onEdit: () => void;
  completed: boolean;
  onToggle: () => void;
}) {
  const isTransport = activity.type === "transport";

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
      <div
        className={`flex-1 mb-2 rounded-2xl overflow-hidden cursor-pointer ${isFirst ? "bg-white shadow-sm border border-blue-100" : "bg-white shadow-sm"}`}
        onClick={onEdit}
      >
        {isFirst && isTransport ? (
          <div className="p-3 pr-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">Trasporto</p>
                <p className={`font-bold text-[15px] text-gray-900 leading-snug ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                {activity.status === "in_corso" && <span className="badge-in-corso mt-1">In corso</span>}
              </div>
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
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
          </div>
        ) : isTransport ? (
          <div className="px-3 py-2.5 flex items-center gap-2.5">
            <ActivityIcon type={activity.type} size={16} />
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold text-gray-700 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
              <p className={`text-[12px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{activity.subtitle}</p>
            </div>
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
        ) : (
          <div className="px-3 py-2.5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ActivityIcon type={activity.type} size={16} />
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold text-gray-700 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                <p className={`text-[12px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{activity.subtitle}</p>
              </div>
            </div>
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

// ── Main TodayView ────────────────────────────────────────────────────────────
export default function TodayView() {
  const navigate = useNavigate();
  const [selectedDayId, setSelectedDayId] = useState(TODAY_DAY_ID);
  const [tripDays, setTripDays] = useState<DayData[]>(loadTripDays);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);

  useEffect(() => {
    saveTripDays(tripDays);
  }, [tripDays]);

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

  const [expanded, setExpanded] = useState(false);
  const [qrActivity, setQrActivity] = useState<Activity | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTomorrowFull, setShowTomorrowFull] = useState(false);

  // Stato per spunta attività
  const [completedActs, setCompletedActs] = useState<string[]>(loadCompletedActivities());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setCompletedActs(detail);
    };
    window.addEventListener("hrb_completed_activities_change", handler as EventListener);
    return () => window.removeEventListener("hrb_completed_activities_change", handler as EventListener);
  }, []);

  function toggleActivity(id: string) {
    const next = completedActs.includes(id)
      ? completedActs.filter((item) => item !== id)
      : [...completedActs, id];
    setCompletedActs(next);
    saveCompletedActivities(next);
  }

  const daysLeft = getDaysToDeparture();
  const todayLabel = getTodayLabel();

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
          <div className="flex items-center justify-between mb-4">
            <span className="section-label">La tua giornata</span>
            <span className="text-[11px] text-gray-400">{today.dateLabel}</span>
          </div>
          <div className="space-y-0">
            {visibleActivities.map((act, idx) => (
              <TimelineRow
                key={act.id}
                activity={act}
                isFirst={idx === 0}
                isLast={idx === visibleActivities.length - 1}
                onQRTap={setQrActivity}
                onEdit={() => setEditingActivity({ dayId: today.id, activity: act, dayLabel: today.dateLabel })}
                completed={completedActs.includes(act.id)}
                onToggle={() => toggleActivity(act.id)}
              />
            ))}
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
                  <p className="text-[10.5px] text-gray-400 mt-0.5 truncate">{act.subtitle}</p>
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

  function handleSubmit() {
    if (!title.trim() || !time.trim()) return;
    onSave({ ...activity, time: time.trim(), type, title: title.trim(), subtitle: subtitle.trim() });
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
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
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
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Sottotitolo</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
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
