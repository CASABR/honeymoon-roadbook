import { useState, useEffect } from "react";
import {
  DAYS,
  TRIP_NAME,
  TRIP_DURATION,
  TODAY_DAY_ID,
  loadCompletedActivities,
  saveCompletedActivities,
} from "../data/mockData";
import type { Activity, DayData } from "../data/mockData";
import {
  IcMapPin,
  IcCalendar,
  IcChevronDown,
  IcPlus,
  ActivityIcon,
} from "../components/Icons";

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_KEY = "hrb_trip_days_v2";

function loadTripDays(): DayData[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
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
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
        return merged;
      }
      return list;
    }
  } catch { /* ignore */ }
  return DAYS;
}

function saveTripDays(list: DayData[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

// ── Timeline row inside expanded day ─────────────────────────────────────────
function TripTimelineRow({
  activity,
  isFirst,
  isLast,
  completed,
  onToggle,
}: {
  activity: Activity;
  isFirst: boolean;
  isLast: boolean;
  completed: boolean;
  onToggle: () => void;
}) {
  const isTransport = activity.type === "transport";

  return (
    <div className={`flex gap-3 items-start select-none transition-opacity ${completed ? "opacity-60" : ""}`}>
      {/* Time */}
      <div className="w-12 pt-1 flex-shrink-0 text-right">
        <span className={`font-semibold ${isFirst ? "text-blue-700 text-[14px]" : "text-gray-400 text-[12px]"} ${completed ? "line-through text-gray-300" : ""}`}>
          {activity.time}
        </span>
      </div>

      {/* Dot + line */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 24, marginTop: 4 }}>
        <div
          className="rounded-full flex-shrink-0 bg-white border-2 border-gray-300 w-4 h-4"
          style={{
            borderColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#2563eb" : "#d1d5db",
            backgroundColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#2563eb" : "#ffffff",
          }}
        />
        {!isLast && (
          <div className="flex-1 w-0.5 bg-gray-200 mt-1" style={{ minHeight: 36 }} />
        )}
      </div>

      {/* Card */}
      <div className={`flex-1 mb-2 rounded-xl overflow-hidden ${
        isFirst ? "bg-white shadow-sm border border-blue-100" : "bg-white/60 shadow-sm"
      }`}>
        {isTransport ? (
          <div className="p-3 pr-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-blue-500 uppercase mb-0.5">
                  Trasporto
                </p>
                <p className={`font-bold text-[14px] text-gray-900 leading-snug truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                <p className={`text-[11px] text-gray-400 truncate mt-0.5 ${completed ? "line-through text-gray-300" : ""}`}>{activity.subtitle}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <ActivityIcon type={activity.type} size={15} />
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-[13px] text-gray-800 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <IcMapPin size={10} className="text-gray-400" />
                  <p className={`text-[11px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{activity.subtitle}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activity.imageUrl && (
                <img
                  src={activity.imageUrl}
                  alt={activity.title}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
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
    </div>
  );
}

// ── Form per aggiungere attività ad un giorno ─────────────────────────────────
function AddActivitySheet({
  dayId,
  dayLabel,
  onSave,
  onClose,
}: {
  dayId: string;
  dayLabel: string;
  onSave: (dayId: string, act: Activity) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState("");
  const [type, setType] = useState<Activity["type"]>("sightseeing");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  function handleSubmit() {
    if (!title.trim() || !time.trim()) return;
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      time: time.trim(),
      type,
      title: title.trim(),
      subtitle: subtitle.trim() || "Attività del giorno",
      imageUrl: imageUrl.trim() || undefined,
    };
    onSave(dayId, newAct);
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
        className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900">Nuova attività</h2>
        <p className="text-[12px] text-gray-400 mb-4">{dayLabel}</p>

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
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-2/3">
              <label className="text-[11px] font-semibold text-gray-500 block mb-1">Titolo attività *</label>
              <input
                type="text"
                value={title}
                placeholder="es. Visita al vulcano"
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Sottotitolo</label>
            <input
              type="text"
              value={subtitle}
              placeholder="es. Rotorua Geothermal Park"
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Immagine URL (opzionale)</label>
            <input
              type="text"
              value={imageUrl}
              placeholder="https://images.unsplash.com/..."
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
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

// ── Selettore Giorno (Calendario Bottom Sheet) per Itinerario ───────────────────
function TripDatePickerSheet({
  selectedDayId,
  onSelect,
  onClose,
}: {
  selectedDayId: string | null;
  onSelect: (dayId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900 mb-1">Seleziona giorno</h2>
        <p className="text-[12px] text-gray-400 mb-5">
          Vai direttamente al giorno dell'itinerario ed espandilo
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

// ── Main TripView ─────────────────────────────────────────────────────────────
export default function TripView() {
  const [tripDays, setTripDays] = useState<DayData[]>(loadTripDays);

  // Traccia quale singolo giorno è espanso (Default: il giorno "Oggi")
  const [expandedDayId, setExpandedDayId] = useState<string | null>(TODAY_DAY_ID);
  const [addingToDay, setAddingToDay] = useState<{ id: string; label: string } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  useEffect(() => {
    saveTripDays(tripDays);
  }, [tripDays]);

  function toggleDay(dayId: string) {
    // Un solo giorno aperto alla volta: se è già aperto lo chiudiamo, altrimenti lo apriamo chiudendo il precedente
    setExpandedDayId((prev) => (prev === dayId ? null : dayId));
  }

  function handleSelectDay(dayId: string) {
    setExpandedDayId(dayId);
    // Scrolla in vista il giorno selezionato dopo che React ha renderizzato lo stato espanso
    setTimeout(() => {
      const el = document.getElementById(`trip-day-${dayId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }

  function handleAddActivity(dayId: string, activity: Activity) {
    setTripDays((prevDays) => {
      return prevDays.map((day) => {
        if (day.id === dayId) {
          const nextActs = [...day.activities, activity];
          // Ordinamento cronologico semplice delle attività dello stesso giorno
          nextActs.sort((a, b) => a.time.localeCompare(b.time));
          return { ...day, activities: nextActs };
        }
        return day;
      });
    });
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">Itinerario</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] text-gray-500 font-medium">{TRIP_NAME}</span>
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {TRIP_DURATION}
              </span>
            </div>
          </div>
          <button
            className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center border border-gray-100"
            onClick={() => setShowDatePicker(true)}
          >
            <IcCalendar size={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Lista dei giorni cronologica */}
      <div className="px-4 space-y-3">
        {tripDays.map((day, idx) => {
          const isExpanded = expandedDayId === day.id;
          const isToday = day.id === TODAY_DAY_ID;

          const transportCount = day.activities.filter((a) => a.type === "transport").length;
          const activityCount = day.activities.length - transportCount;

          // Calcola highlight del giorno (es. prima attività o in volo)
          let highlight = "Nessuna attività pianificata";
          if (day.activities.length > 0) {
            highlight = day.activities[0].title;
          }

          return (
            <div
              key={day.id}
              id={`trip-day-${day.id}`}
              className={`card transition-all duration-200 border ${
                isToday ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-100"
              }`}
            >
              {/* Riepilogo giorno compatto */}
              <button
                className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
                onClick={() => toggleDay(day.id)}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                    isToday ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                    <span className="text-[9px] uppercase font-bold tracking-tight opacity-80 leading-none">
                      G{idx + 1}
                    </span>
                    <span className="text-[16px] font-bold mt-0.5 leading-none">
                      {day.dateShort}
                    </span>
                    <span className="text-[8px] uppercase tracking-tight opacity-80 leading-none">
                      {day.monthShort}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[14px] font-bold text-gray-900">{day.dateLabel}</p>
                      {isToday && (
                        <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                          Oggi
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-gray-400">
                      <IcMapPin size={11} className="text-gray-400 shrink-0" />
                      <p className="text-[12px] truncate font-medium">{day.location}</p>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 font-semibold">
                      {activityCount > 0 && `${activityCount} att.`}
                      {activityCount > 0 && transportCount > 0 && " · "}
                      {transportCount > 0 && `${transportCount} trasp.`}
                      {day.activities.length === 0 && "Riposo / Libero"}
                      {day.activities.length > 0 && (
                        <span className="text-gray-500 font-normal italic">
                          {" — "}Highlight: {highlight}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <IcChevronDown
                  size={18}
                  className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dettaglio della giornata espanso */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pt-4 pb-3 bg-gray-50/50 rounded-b-2xl">
                  {day.activities.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic text-center py-2">
                      Nessuna attività programmata per questo giorno.
                    </p>
                  ) : (
                    <div className="space-y-0">
                      {day.activities.map((act, actIdx) => (
                        <TripTimelineRow
                          key={act.id}
                          activity={act}
                          isFirst={actIdx === 0}
                          isLast={actIdx === day.activities.length - 1}
                          completed={completedActs.includes(act.id)}
                          onToggle={() => toggleActivity(act.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pulsante aggiungi attività */}
                  <div className="flex justify-center mt-3 pt-2 border-t border-gray-100/60">
                    <button
                      onClick={() => setAddingToDay({ id: day.id, label: day.dateLabel })}
                      className="flex items-center gap-1.5 text-blue-600 text-[12px] font-bold hover:opacity-80 py-1.5 px-3 bg-blue-50 rounded-xl"
                    >
                      <IcPlus size={13} />
                      Aggiungi attività
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {addingToDay && (
        <AddActivitySheet
          dayId={addingToDay.id}
          dayLabel={addingToDay.label}
          onSave={handleAddActivity}
          onClose={() => setAddingToDay(null)}
        />
      )}

      {showDatePicker && (
        <TripDatePickerSheet
          selectedDayId={expandedDayId}
          onSelect={handleSelectDay}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </div>
  );
}
