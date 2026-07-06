import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DAYS,
  TODAY_DAY_ID,
  ACCOMMODATIONS,
  getDaysToDeparture,
  getTodayLabel,
  loadCompletedActivities,
  saveCompletedActivities,
} from "../data/mockData";
import type { Activity } from "../data/mockData";
import {
  IcMapPin,
  IcCalendar,
  IcChevronRight,
  IcChevronLeft,
  IcChevronDown,
  IcQR,
  ActivityIcon,
} from "../components/Icons";

// ── helpers ───────────────────────────────────────────────────────────────────
function getToday(dayId: string) {
  return DAYS.find((d) => d.id === dayId) ?? DAYS[0];
}

function getTomorrow(dayId: string) {
  const idx = DAYS.findIndex((d) => d.id === dayId);
  return idx >= 0 && idx < DAYS.length - 1 ? DAYS[idx + 1] : null;
}

function getTodayAccommodation() {
  // In futuro: filtrare ACCOMMODATIONS per data corrente
  return ACCOMMODATIONS[0]; // primo alloggio del viaggio
}

// ── QR / Dettaglio trasporto Modal ────────────────────────────────────────────
function QRModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
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
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Trasporto</p>
        <h2 className="text-[18px] font-extrabold text-gray-900 mb-1">{activity.title}</h2>
        <p className="text-[13px] text-gray-500 mb-5">{activity.subtitle}</p>
        <div className="bg-gray-50 rounded-2xl p-6 flex flex-col items-center gap-3 mb-5">
          <div className="w-36 h-36 bg-gray-200 rounded-xl flex items-center justify-center">
            <IcQR size={72} className="text-gray-500" />
          </div>
          <p className="text-[12px] text-gray-400">QR biglietto — da aggiungere</p>
        </div>
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
        className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8"
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
        className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8 max-h-[85dvh] overflow-y-auto"
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
  completed,
  onToggle,
}: {
  activity: Activity;
  isFirst: boolean;
  isLast: boolean;
  onQRTap: (act: Activity) => void;
  completed: boolean;
  onToggle: () => void;
}) {
  const isTransport = activity.type === "transport";
  const tappable = isTransport && activity.hasQR;

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
        className={`flex-1 mb-2 rounded-2xl overflow-hidden ${isFirst ? "bg-white shadow-sm border border-blue-100" : "bg-white shadow-sm"}`}
        onClick={() => tappable && onQRTap(activity)}
        style={{ cursor: tappable ? "pointer" : "default" }}
      >
        {isFirst && isTransport ? (
          <div className="p-3 pr-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">Trasporto</p>
                <p className={`font-bold text-[15px] text-gray-900 leading-snug ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                {activity.status === "in_corso" && <span className="badge-in-corso mt-1">In corso</span>}
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {activity.hasQR && <div className="bg-gray-50 rounded-xl p-2"><IcQR size={26} className="text-gray-700" /></div>}
                <IcChevronRight size={16} className="text-gray-400" />
              </div>
            </div>
          </div>
        ) : tappable ? (
          <div className="px-3 py-2.5 flex items-center gap-2.5">
            <ActivityIcon type={activity.type} size={16} />
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold text-gray-700 truncate ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
              <p className={`text-[12px] text-gray-400 truncate ${completed ? "line-through text-gray-300" : ""}`}>{activity.subtitle}</p>
            </div>
            <IcQR size={18} className="text-gray-400 flex-shrink-0" />
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

  const today = getToday(selectedDayId);
  const tomorrow = getTomorrow(selectedDayId);
  const acco = getTodayAccommodation();

  const currentIdx = DAYS.findIndex((d) => d.id === selectedDayId);

  function handlePrevDay() {
    if (currentIdx > 0) {
      setSelectedDayId(DAYS[currentIdx - 1].id);
    }
  }

  function handleNextDay() {
    if (currentIdx < DAYS.length - 1) {
      setSelectedDayId(DAYS[currentIdx + 1].id);
    }
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
                  currentIdx >= DAYS.length - 1 ? "opacity-35 cursor-not-allowed" : "hover:bg-gray-50 active:scale-95"
                }`}
                onClick={handleNextDay}
                disabled={currentIdx >= DAYS.length - 1}
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
          <div className="grid grid-cols-4 gap-2">
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
              icon="🛡️"
              bgColor="#f0f9ff"
              label="Assicurazione"
              desc="Heymondo 24h"
              onClick={() => navigate("/altro?open=insurance")}
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
    </>
  );
}
