import { useState, useEffect, useRef } from "react";
import {
  DAYS,
  TRIP_NAME,
  TRIP_DURATION,
  TODAY_DAY_ID,
} from "../data/mockData";
import type { Activity, DayData } from "../data/mockData";
import {
  IcMapPin,
  IcCalendar,
  IcChevronDown,
  IcPlus,
  ActivityIcon,
} from "../components/Icons";
import { repository } from "../services/repository";
import { parseTransitTimeToMinutes, formatMinutesToHoursAndMinutes, getCachedTransitTime, cleanSubtitle } from "./TodayView";

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
  const [transitTime, setTransitTime] = useState(activity.transitTime || "");
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
      transitTime: transitTime.trim() || undefined,
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
                placeholder="es. 50"
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Tempo di trasferimento (es. 1h 30m)</label>
            <input
              type="text"
              value={transitTime}
              placeholder="Tempo di trasferimento dal posto precedente"
              onChange={(e) => setTransitTime(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
            />
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

// ── Timeline row con controlli modifica/elimina/riordino ──────────────────────
function TripTimelineRow({
  activity,
  nextActivity,
  isFirst,
  isLast,
  completed,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  editMode,
}: {
  activity: Activity;
  nextActivity?: Activity;
  isFirst: boolean;
  isLast: boolean;
  completed: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  editMode: boolean;
}) {
  const isTransport = activity.type === "transport";
  const transitTime = getCachedTransitTime(activity, nextActivity);

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
            borderColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#2563eb" : "#ffffff",
            backgroundColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#2563eb" : "#ffffff",
          }}
        />
        {!isLast && (
          <div
            className="w-0.5 bg-gray-200 flex-1 my-1"
            style={{
              backgroundColor: completed ? "#10b981" : "#e5e7eb",
            }}
          />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0">
        <div
          className={`min-w-0 mb-2 app-card p-3 ${editMode ? "" : "cursor-pointer"} ${isFirst ? "border-blue-200" : "bg-white/80"}`}
          onClick={editMode ? undefined : onEdit}
        >
          {isTransport ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-blue-500 uppercase mb-0.5">
                  Trasporto
                </p>
                <p className={`font-bold text-[14px] text-gray-900 leading-snug truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                <p className={`text-[11px] text-gray-400 truncate mt-0.5 ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {editMode ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button onClick={onEdit} className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-lg">✏️</button>
                      <button onClick={onDelete} className="text-[10px] bg-red-50 text-red-500 font-bold px-1.5 py-0.5 rounded-lg">🗑️</button>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={onMoveUp}
                        disabled={isFirst}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isFirst ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                      >↑</button>
                      <button
                        onClick={onMoveDown}
                        disabled={isLast}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isLast ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                      >↓</button>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <ActivityIcon type={activity.type} size={15} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`font-semibold text-[13px] text-gray-850 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                    {activity.price !== undefined && (
                      <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded uppercase shrink-0 ${
                        activity.isPaid
                          ? "bg-green-55 text-green-600 border border-green-100"
                          : "bg-red-50 text-red-500 border border-red-100"
                      }`}>
                        €{activity.price} · {activity.isPaid ? "Pagato" : "Da pagare"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <IcMapPin size={10} className="text-gray-400" />
                    <p className={`text-[11px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {activity.imageUrl && !editMode && (
                  <img
                    src={activity.imageUrl}
                    alt={activity.title}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                {editMode ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button onClick={onEdit} className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-lg">✏️</button>
                      <button onClick={onDelete} className="text-[10px] bg-red-50 text-red-500 font-bold px-1.5 py-0.5 rounded-lg">🗑️</button>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={onMoveUp}
                        disabled={isFirst}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isFirst ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                      >↑</button>
                      <button
                        onClick={onMoveDown}
                        disabled={isLast}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isLast ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                      >↓</button>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          )}
        </div>

        {/* Transition to next activity */}
        {nextActivity && !editMode && transitTime && (
          <div className="my-1.5 ml-4 text-[11px] font-bold text-blue-600/95 flex items-center gap-1">
            <span>🚗 {transitTime}</span>
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
  const [transitTime, setTransitTime] = useState("");

  function handleSubmit() {
    if (!title.trim() || !time.trim()) return;
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      time: time.trim(),
      type,
      title: title.trim(),
      subtitle: subtitle.trim() || "Attività del giorno",
      imageUrl: imageUrl.trim() || undefined,
      transitTime: transitTime.trim() || undefined,
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
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
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

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Tempo di trasferimento dal posto precedente (es. 1h 30m)</label>
            <input
              type="text"
              value={transitTime}
              placeholder="Tempo di trasferimento dal posto precedente"
              onChange={(e) => setTransitTime(e.target.value)}
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
  const [tripDays, setTripDays] = useState<DayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);

  const [expandedDayId, setExpandedDayId] = useState<string | null>(TODAY_DAY_ID);
  const [addingToDay, setAddingToDay] = useState<{ id: string; label: string } | null>(null);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Traccia quale giorno ha la modalità modifica attivata
  const [editModeDayId, setEditModeDayId] = useState<string | null>(null);

  const [completedActs, setCompletedActs] = useState<string[]>([]);

  useEffect(() => {
    async function initData() {
      try {
        const days = await repository.getTripDays(DAYS);
        const completed = await repository.getCompletedActivities();
        setTripDays(days);
        setCompletedActs(completed);
        isLoadedRef.current = true;
      } catch (e) {
        console.error("Errore nel caricamento dei dati in TripView:", e);
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

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

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveTripDays(tripDays);
    }
  }, [tripDays]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60dvh] gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold">Caricamento roadbook...</span>
      </div>
    );
  }

  function toggleDay(dayId: string) {
    setExpandedDayId((prev) => (prev === dayId ? null : dayId));
    // Uscendo da un giorno, disattiva edit mode
    if (editModeDayId === dayId) setEditModeDayId(null);
  }

  function handleSelectDay(dayId: string) {
    setExpandedDayId(dayId);
    setTimeout(() => {
      const el = document.getElementById(`trip-day-${dayId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }

  function handleAddActivity(dayId: string, activity: Activity) {
    setTripDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id === dayId) {
          const nextActs = [...day.activities, activity];
          nextActs.sort((a, b) => a.time.localeCompare(b.time));
          return { ...day, activities: nextActs };
        }
        return day;
      })
    );
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
    if (!window.confirm("Eliminare questa attività?")) return;
    setTripDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id === dayId) {
          return { ...day, activities: day.activities.filter((a) => a.id !== actId) };
        }
        return day;
      })
    );
  }

  function handleMoveActivity(dayId: string, actIdx: number, direction: "up" | "down") {
    setTripDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id !== dayId) return day;
        const acts = [...day.activities];
        const targetIdx = direction === "up" ? actIdx - 1 : actIdx + 1;
        if (targetIdx < 0 || targetIdx >= acts.length) return day;
        // Swap semplice: scambia le posizioni senza toccare gli orari
        [acts[actIdx], acts[targetIdx]] = [acts[targetIdx], acts[actIdx]];
        return { ...day, activities: acts };
      })
    );
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
          const isEditMode = editModeDayId === day.id;

          const transportCount = day.activities.filter((a) => a.type === "transport").length;
          const activityCount = day.activities.length - transportCount;

          const totalDriveMin = day.activities.reduce((sum, act, actIdx) => {
            const nextAct = day.activities[actIdx + 1];
            const timeStr = getCachedTransitTime(act, nextAct);
            return sum + parseTransitTimeToMinutes(timeStr);
          }, 0);
          const totalDriveStr = formatMinutesToHoursAndMinutes(totalDriveMin);

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

                  <div className="min-w-0 flex-1">
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
                    <div className="text-[11px] text-gray-400 mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
                      {activityCount > 0 && <span>{activityCount} att.</span>}
                      {activityCount > 0 && transportCount > 0 && <span className="opacity-40">·</span>}
                      {transportCount > 0 && <span>{transportCount} trasp.</span>}
                      {totalDriveStr && (
                        <span className="text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-extrabold text-[9.5px]">
                          🚗 Guida: {totalDriveStr}
                        </span>
                      )}
                      {day.activities.length === 0 && <span>Riposo / Libero</span>}
                      {day.activities.length > 0 && (
                        <span className="text-gray-400 font-normal italic truncate max-w-[150px] md:max-w-xs ml-1">
                          (H: {highlight})
                        </span>
                      )}
                    </div>
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
                  {/* Barra controlli: modalità modifica */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-gray-400 font-semibold">
                      {day.activities.length} {day.activities.length === 1 ? "attività" : "attività"}
                    </span>
                    <button
                      onClick={() => setEditModeDayId(isEditMode ? null : day.id)}
                      className={`text-[11px] font-bold px-3 py-1 rounded-lg transition-colors ${
                        isEditMode
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isEditMode ? "✓ Fine modifica" : "✏️ Modifica"}
                    </button>
                  </div>

                  {day.activities.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic text-center py-2">
                      Nessuna attività programmata per questo giorno.
                    </p>
                  ) : (
                    <div className="space-y-0">
                      {day.activities.map((act, actIdx) => {
                        const nextAct = day.activities[actIdx + 1];
                        return (
                          <TripTimelineRow
                            key={act.id}
                            activity={act}
                            nextActivity={nextAct}
                            isFirst={actIdx === 0}
                            isLast={actIdx === day.activities.length - 1}
                            completed={completedActs.includes(act.id)}
                            onToggle={() => toggleActivity(act.id)}
                            onEdit={() => setEditingActivity({ dayId: day.id, activity: act, dayLabel: day.dateLabel })}
                            onDelete={() => handleDeleteActivity(day.id, act.id)}
                            onMoveUp={() => handleMoveActivity(day.id, actIdx, "up")}
                            onMoveDown={() => handleMoveActivity(day.id, actIdx, "down")}
                            editMode={isEditMode}
                          />
                        );
                      })}
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

      {editingActivity && (
        <EditActivitySheet
          activity={editingActivity.activity}
          dayLabel={editingActivity.dayLabel}
          onSave={(updated) => handleEditActivity(editingActivity.dayId, updated)}
          onDelete={() => handleDeleteActivity(editingActivity.dayId, editingActivity.activity.id)}
          onClose={() => setEditingActivity(null)}
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
