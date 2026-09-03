import { useState, useEffect, useRef } from "react";
import {
  DAYS,
  TRIP_NAME,
  TRIP_DURATION,
  TODAY_DAY_ID,
  TRANSPORTS,
  ACCOMMODATIONS,
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
import { parseTransitTimeToMinutes, formatMinutesToHoursAndMinutes, getReliableTransitTime, cleanSubtitle, isDrivingTransit, DayMapsButton } from "./TodayView";

// ── Sheet per modificare un'attività esistente ────────────────────────────────
export function EditActivitySheet({
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
  const [isBooked, setIsBooked] = useState(!!activity.isBooked);
  const [howToGetThere, setHowToGetThere] = useState(activity.howToGetThere || "");
  const [timeBeforehand, setTimeBeforehand] = useState(activity.timeBeforehand || "");
  const [duration, setDuration] = useState(activity.duration || "");
  const [bookingRef, setBookingRef] = useState(activity.bookingRef || "");
  const [ticketUrl, setTicketUrl] = useState(activity.ticketUrl || "");
  const [note, setNote] = useState(activity.note || "");
  const [mapsUrl, setMapsUrl] = useState(activity.mapsUrl || "");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<any>(null);

  const activeDetailsCount = [
    price,
    isPaid,
    isBooked,
    bookingRef,
    timeBeforehand,
    duration,
    ticketUrl,
    note,
    howToGetThere,
    transitTime,
    mapsUrl,
    type === "other" ? subtitle : undefined,
  ].filter((val) => (typeof val === "boolean" ? val : !!(val && String(val).trim()))).length;

  const [showOptionalDetails, setShowOptionalDetails] = useState(activeDetailsCount > 0);

  const [transportsList, setTransportsList] = useState<any[]>([]);
  const [accommodationsList, setAccommodationsList] = useState<any[]>([]);

  useEffect(() => {
    async function loadDetails() {
      try {
        const trs = await repository.getTransports(TRANSPORTS);
        const accs = await repository.getAccommodations(ACCOMMODATIONS);
        setTransportsList(trs);
        setAccommodationsList(accs);
      } catch (e) {
        console.error("Errore durante il caricamento dati nel foglio dettaglio:", e);
      }
    }
    loadDetails();
  }, []);

  const matchedDay = DAYS.find(day => day.activities.some(a => a.id === activity.id));
  const dayDate = matchedDay?.date;

  const matchedTr = transportsList && dayDate && type === "transport"
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

  const matchedAcc = accommodationsList && dayDate && type === "hotel"
    ? accommodationsList.find(acc => {
        const dateMatch = acc.startDate === dayDate || acc.endDate === dayDate;
        if (!dateMatch) return false;
        const actTitleLower = activity.title.toLowerCase();
        const accNameLower = acc.name.toLowerCase();
        return actTitleLower.includes(accNameLower) || accNameLower.includes(actTitleLower) || actTitleLower.includes("hotel") || actTitleLower.includes("alloggio");
      })
    : undefined;

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

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
      isPaid,
      isBooked,
      howToGetThere: howToGetThere.trim() || undefined,
      timeBeforehand: timeBeforehand.trim() || undefined,
      duration: duration.trim() || undefined,
      bookingRef: bookingRef.trim() || undefined,
      ticketUrl: ticketUrl.trim() || undefined,
      note: note.trim() || undefined,
      mapsUrl: mapsUrl.trim() || undefined,
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
            <h2 className="text-[17px] font-extrabold text-gray-900">Dettaglio attività</h2>
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

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
           {/* Dati di secondo livello copilota (Trasporti/Alloggi correlati) */}
          {(matchedTr || matchedAcc) && (
            <div className="space-y-2.5 mb-3 text-left">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11.5px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                  {matchedTr ? "✈️ Logistica Trasporto" : "🏨 Dettagli Alloggio"}
                </span>
                <span className="text-[9px] font-black text-blue-600 bg-blue-50/80 px-1.5 py-0.5 rounded border border-blue-100/50 uppercase tracking-wider">
                  Sincronizzato
                </span>
              </div>

              <div className="bg-white border border-slate-150 rounded-xl p-3 space-y-2.5 shadow-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                  {matchedTr?.carrierCode && (
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Volo / Tratta</span>
                      <span className="font-extrabold text-blue-600 bg-blue-50/50 px-1.5 py-0.2 rounded border border-blue-100/50 inline-block text-[11px] mt-0.5">
                        ✈️ {matchedTr.carrierCode}
                      </span>
                    </div>
                  )}

                  {matchedTr?.seat && (
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Posti Assegnati</span>
                      <span className="font-extrabold text-slate-700 bg-slate-100/80 px-1.5 py-0.2 rounded border border-slate-200/50 inline-block text-[11px] mt-0.5">
                        💺 {matchedTr.seat}
                      </span>
                    </div>
                  )}

                  {matchedTr?.gate && (
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Gate / Terminal</span>
                      <span className="font-bold text-amber-800 bg-amber-50/50 px-1.5 py-0.2 rounded border border-amber-100/50 inline-block text-[11px] mt-0.5">
                        🚪 {matchedTr.gate} {matchedTr.terminal ? `(T${matchedTr.terminal})` : ""}
                      </span>
                    </div>
                  )}

                  {matchedAcc?.phone && (
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Telefono</span>
                      <a href={`tel:${matchedAcc.phone}`} className="font-bold text-blue-600 hover:underline inline-block mt-0.5 text-[11.5px]">
                        📞 {matchedAcc.phone}
                      </a>
                    </div>
                  )}

                  {matchedAcc?.startDate && (
                    <div className="col-span-2">
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Periodo Soggiorno</span>
                      <span className="font-semibold text-gray-700 text-[11.5px] mt-0.5 block">
                        📅 Dal {matchedAcc.startDate} al {matchedAcc.endDate}
                      </span>
                    </div>
                  )}
                </div>

                {/* Codice Prenotazione PNR integrato in riga compatta */}
                {(matchedTr?.bookingRef || matchedTr?.confirmationCode || matchedAcc?.bookingRef || matchedAcc?.confirmationCode) && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2 mt-1">
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">Codice Prenotazione (PNR)</span>
                      <span className="font-mono font-black text-gray-800 text-[12px] truncate block mt-0.5">
                        {matchedTr?.bookingRef || matchedTr?.confirmationCode || matchedAcc?.bookingRef || matchedAcc?.confirmationCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const refVal = matchedTr?.bookingRef || matchedTr?.confirmationCode || matchedAcc?.bookingRef || matchedAcc?.confirmationCode;
                        if (refVal) {
                          navigator.clipboard.writeText(refVal);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[10.5px] font-black transition-all active:scale-95 flex items-center gap-1 shrink-0 ${
                        copied
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-white text-gray-500 border-slate-200 hover:bg-slate-55"
                      }`}
                    >
                      {copied ? (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copiato</span>
                        </>
                      ) : (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copia PNR</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Note e Avvisi Operativi in box ad hoc soft amber */}
              {(matchedTr?.baggageNote || matchedTr?.importantNote || matchedAcc?.checkinNote || matchedAcc?.notes) && (
                <div className="bg-amber-50/50 border border-amber-100/50 rounded-xl p-3 text-[11px] space-y-2 text-slate-700 leading-relaxed shadow-sm">
                  {matchedTr?.baggageNote && (
                    <div>
                      <span className="text-[8.5px] font-black text-amber-800 block uppercase tracking-wider">Regole Bagagli</span>
                      <p className="font-semibold text-slate-600 mt-0.5">🧳 {matchedTr.baggageNote}</p>
                    </div>
                  )}
                  {(matchedTr?.importantNote || matchedAcc?.checkinNote || matchedAcc?.notes) && (
                    <div>
                      <span className="text-[8.5px] font-black text-amber-850 block uppercase tracking-wider">Note Operative importanti</span>
                      <p className="font-bold text-amber-900 mt-0.5">
                        ⚠️ {matchedTr?.importantNote || matchedAcc?.checkinNote || matchedAcc?.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 1. SEZIONE ESSENZIALE (Sempre Visibile) */}
          <div className="bg-blue-50/40 border border-blue-100 p-3.5 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Dati essenziali</p>

            {/* Tipo attività */}
            <div>
              <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Tipo attività</label>
              <div className="flex gap-1.5 flex-wrap">
                {TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setType(t.type)}
                    className={`px-2.5 py-1.5 rounded-xl text-[12px] font-semibold transition-colors flex items-center gap-1 ${
                      type === t.type
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-1/3">
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Orario *</label>
                <input
                  type="text"
                  value={time}
                  placeholder="es. 10:30"
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
              <div className="w-full sm:w-2/3">
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                  {type === "transport" ? "Titolo / Tratta *" : "Titolo *"}
                </label>
                <input
                  type="text"
                  value={title}
                  placeholder={type === "transport" ? "es. Volo Milano → Tokyo" : "es. Visita al tempio"}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {type !== "other" && (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Luogo</label>
                <input
                  type="text"
                  value={subtitle}
                  placeholder={type === "transport" ? "es. Aeroporto / Compagnia" : "es. Quartiere o città"}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
            )}
          </div>

          {/* 2. ACCORDION DETTAGLI CONDIZIONALI */}
          <button
            type="button"
            onClick={() => setShowOptionalDetails((prev) => !prev)}
            className="w-full py-2.5 px-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-2xl text-[12px] font-bold text-gray-800 flex items-center justify-between transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span>Altri dettagli</span>
              {activeDetailsCount > 0 && (
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                  {activeDetailsCount} {activeDetailsCount === 1 ? "inserito" : "inseriti"}
                </span>
              )}
            </div>
            <IcChevronDown
              size={16}
              className={`transition-transform duration-200 ${
                showOptionalDetails ? "rotate-180 text-blue-600" : "text-gray-400"
              }`}
            />
          </button>

          {showOptionalDetails && (
            <div className="space-y-3 p-3.5 bg-gray-50/70 border border-gray-200/60 rounded-2xl">
              {type === "other" && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Luogo</label>
                  <input
                    type="text"
                    value={subtitle}
                    placeholder="es. Indirizzo o punto d'incontro"
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {/* Prezzo & Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Prezzo (€)</label>
                  <input
                    type="text"
                    value={price}
                    placeholder="es. 45"
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>

                {type !== "shopping" && (
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200">
                    <span className="text-[11px] font-bold text-gray-700">Prenotazione</span>
                    <button
                      type="button"
                      onClick={() => setIsBooked(!isBooked)}
                      className={`px-2 py-1 rounded text-[10px] font-extrabold uppercase transition-colors ${
                        isBooked
                          ? "bg-blue-50 text-blue-600 border border-blue-200"
                          : "bg-gray-100 text-gray-400 border border-gray-200"
                      }`}
                    >
                      {isBooked ? "✅ Sì" : "❌ No"}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-700">Pagato</span>
                  <button
                    type="button"
                    onClick={() => setIsPaid(!isPaid)}
                    className={`px-2 py-1 rounded text-[10px] font-extrabold uppercase transition-colors ${
                      isPaid
                        ? "bg-green-50 text-green-600 border border-green-200"
                        : "bg-red-50 text-red-500 border border-red-100"
                    }`}
                  >
                    {isPaid ? "✅ Sì" : "⏳ No"}
                  </button>
                </div>
              </div>

              {/* Durata & Presentarsi prima */}
              {(type === "sightseeing" || type === "transport" || type === "food" || type === "other") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">Durata</label>
                    <input
                      type="text"
                      value={duration}
                      placeholder="es. 2 ore"
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                    />
                  </div>

                  {(type === "sightseeing" || type === "transport") && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1">Presentarsi prima</label>
                      <input
                        type="text"
                        value={timeBeforehand}
                        placeholder="es. 30m prima"
                        onChange={(e) => setTimeBeforehand(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tempo di trasferimento */}
              {(type === "sightseeing" || type === "transport") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Tempo di trasferimento</label>
                  <input
                    type="text"
                    value={transitTime}
                    placeholder="es. 45m dal luogo precedente"
                    onChange={(e) => setTransitTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {/* Link Google Maps */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link Google Maps</label>
                <input
                  type="text"
                  value={mapsUrl}
                  placeholder="Incolla il link Google Maps del luogo"
                  onChange={(e) => setMapsUrl(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>

              {/* Codice Prenotazione & Link */}
              {(type === "sightseeing" || type === "hotel" || type === "transport") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                      {type === "transport" ? "PNR / Codice Prenotazione" : "Codice Prenotazione"}
                    </label>
                    <input
                      type="text"
                      value={bookingRef}
                      placeholder="es. BK-987"
                      onChange={(e) => setBookingRef(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 font-mono font-bold outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link Biglietto / Sito</label>
                    <input
                      type="text"
                      value={ticketUrl}
                      placeholder="https://..."
                      onChange={(e) => setTicketUrl(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              )}

              {(type === "food" || type === "shopping" || type === "other") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link / Sito web</label>
                  <input
                    type="text"
                    value={ticketUrl}
                    placeholder="https://..."
                    onChange={(e) => setTicketUrl(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {(type === "sightseeing" || type === "transport") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Come arrivare / Note percorso</label>
                  <textarea
                    value={howToGetThere}
                    placeholder="Parcheggio, fermata bus, indicazioni..."
                    onChange={(e) => setHowToGetThere(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-[12.5px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none min-h-[60px]"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Note</label>
                <textarea
                  value={note}
                  placeholder="Note o dettagli utili per questa attività..."
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-[12.5px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none min-h-[60px]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!title.trim() || !time.trim()}
            style={{ opacity: !title.trim() || !time.trim() ? 0.5 : 1 }}
          >
            Salva modifiche
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper: Google Maps navigation URL for a single place ────────────────────
function buildSingleMapsUrl(activity: Activity, dayLocation?: string): string {
  // Use the activity's explicit mapsUrl if defined (e.g., taxi directions)
  if (activity.mapsUrl) return activity.mapsUrl;
  const query = activity.subtitle && activity.subtitle !== "Attività del giorno"
    ? `${activity.title}, ${activity.subtitle}`
    : (dayLocation ? `${activity.title}, ${dayLocation}` : activity.title);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

// ── Helper: Google Maps itinerary URL (filter: 'all'|'morning'|'afternoon') ───
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
    a.subtitle && a.subtitle !== "Attività del giorno" && !a.subtitle.includes("Dettagli") && !a.subtitle.includes("noleggio")
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



// ── Timeline row con controlli modifica/elimina/riordino ──────────────────────
function TripTimelineRow({
  activity,
  isFirst,
  isLast,
  completed,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  editMode,
  transitTimeFromPrev,
  dayLocation,
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
  transitTimeFromPrev?: string;
  dayLocation?: string;
}) {
  const isTransport = activity.type === "transport";
  const mapsUrl = buildSingleMapsUrl(activity, dayLocation);

  return (
    <div className={`flex gap-2.5 items-stretch select-none transition-opacity ${completed ? "opacity-60" : ""}`}>
      {/* Colonna Timeline Sinistra (Orario sopra il pallino) */}
      <div className="flex flex-col items-center flex-shrink-0 w-11 pt-0.5">
        <span className={`text-[11px] leading-none font-extrabold tracking-tight text-center ${
          isFirst ? "text-blue-700 font-black" : "text-gray-500"
        } ${completed ? "line-through text-gray-300" : ""}`}>
          {activity.time}
        </span>
        <div className="my-1.5 flex items-center justify-center min-h-[20px]">
          <div
            className="rounded-full flex-shrink-0 w-3.5 h-3.5 border-2"
            style={{
              borderColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#6366f1" : "#d1d5db",
              backgroundColor: completed ? "#10b981" : isFirst ? "#2563eb" : isTransport ? "#6366f1" : "#ffffff",
            }}
          />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1"
            style={{ backgroundColor: completed ? "#10b981" : "#e5e7eb" }}
          />
        )}
      </div>

      {/* Card + connector strip */}
      <div className="flex-1 min-w-0 pb-1">

        {/* ── Connector strip: transit from previous stop ───────────────────
             Always shown above the card (except first stop).
             Shows mode emoji + time, or N/D fallback. */}
        {!isFirst && !editMode && (() => {
          // We infer from the transitTimeFromPrev and activity data
          const time = transitTimeFromPrev || "N/D";
          const hasTime = !!transitTimeFromPrev;
          // Determine mode from activity type hints
          const text = `${activity.title} ${activity.subtitle || ""}`.toLowerCase();
          let modeEmoji = "🚗";
          let modeLabel = "Guida";
          let modeColor = "text-blue-500";
          let modeBg = "bg-blue-50 border-blue-100";
          if (text.includes("volo") || text.includes("flight") || text.includes("air") || text.includes("cebu") || text.includes("virgin")) {
            modeEmoji = "✈️"; modeLabel = "Volo"; modeColor = "text-indigo-500"; modeBg = "bg-indigo-50 border-indigo-100";
          } else if (text.includes("treno") || text.includes("frecciarossa") || text.includes("train")) {
            modeEmoji = "🚆"; modeLabel = "Treno"; modeColor = "text-orange-500"; modeBg = "bg-orange-50 border-orange-100";
          } else if (text.includes("traghetto") || text.includes("ferry") || text.includes("nave")) {
            modeEmoji = "🚢"; modeLabel = "Traghetto"; modeColor = "text-cyan-500"; modeBg = "bg-cyan-50 border-cyan-100";
          } else if (text.includes("scalo") || text.includes("transito") || text.includes("layover")) {
            modeEmoji = "⏳"; modeLabel = "Scalo"; modeColor = "text-amber-500"; modeBg = "bg-amber-50 border-amber-100";
          } else if (isTransport) {
            modeEmoji = "🚌"; modeLabel = "Transfer"; modeColor = "text-violet-500"; modeBg = "bg-violet-50 border-violet-100";
          }
          return (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="flex-1 h-px bg-gray-200" />
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] font-bold ${modeBg} ${modeColor}`}>
                <span>{modeEmoji}</span>
                <span className={hasTime ? modeColor : "text-gray-400"}>{time}</span>
                <span className="text-gray-400 font-normal normal-case">({modeLabel})</span>
              </div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          );
        })()}

        <div
          className={`min-w-0 app-card rounded-xl p-3 ${editMode ? "" : "cursor-pointer"} ${isFirst ? "border-blue-200 bg-blue-50/20" : "bg-white"}`}
          onClick={editMode ? undefined : onEdit}
        >
          {isTransport ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9.5px] font-black tracking-widest text-indigo-500 uppercase mb-0.5 leading-none">
                  Trasporto
                </p>
                <p className={`font-bold text-[13.5px] text-gray-900 leading-snug [overflow-wrap:anywhere] ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                {cleanSubtitle(activity.subtitle) && (
                  <p className={`text-[11px] text-gray-500 mt-0.5 leading-snug [overflow-wrap:anywhere] ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
                )}
              </div>
              {/* Right controls: Maps icon + toggle stacked */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                {!editMode && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Apri in Google Maps"
                    className="w-6 h-6 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center hover:bg-blue-100 active:scale-95 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </a>
                )}
                {editMode ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button onClick={onEdit} className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-lg">✏️</button>
                      <button onClick={onDelete} className="text-[10px] bg-red-50 text-red-500 font-bold px-1.5 py-0.5 rounded-lg">🗑️</button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={onMoveUp} disabled={isFirst} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isFirst ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}>↑</button>
                      <button onClick={onMoveDown} disabled={isLast} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isLast ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}>↓</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
                    style={{ borderColor: completed ? "#10b981" : "#d1d5db", backgroundColor: completed ? "#10b981" : "transparent" }}
                  >
                    {completed && <span className="text-white text-[10px] font-black">✓</span>}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <div className="shrink-0 mt-0.5">
                  <ActivityIcon type={activity.type} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0 border ${
                      activity.type === "sightseeing" ? "bg-blue-50 text-blue-700 border-blue-100" :
                      activity.type === "transport" ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                      activity.type === "food" ? "bg-orange-50 text-orange-700 border-orange-100" :
                      activity.type === "hotel" ? "bg-purple-50 text-purple-700 border-purple-100" :
                      activity.type === "shopping" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      "bg-gray-100 text-gray-600 border-gray-200"
                    }`}>
                      {activity.type === "sightseeing" ? "Visita" :
                       activity.type === "transport" ? "Trasferimento" :
                       activity.type === "food" ? "Pasto" :
                       activity.type === "hotel" ? "Alloggio" :
                       activity.type === "shopping" ? "Shopping" : "Altro"}
                    </span>
                    <p className={`font-bold text-[13.5px] text-gray-900 leading-snug [overflow-wrap:anywhere] ${completed ? "line-through text-gray-400" : ""}`}>{activity.title}</p>
                    {activity.price !== undefined && (
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase shrink-0 leading-none mt-0.5 ${
                        activity.isPaid
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-red-50 text-red-500 border border-red-100"
                      }`}>
                        €{activity.price} {activity.isPaid ? "✓" : "–"}
                      </span>
                    )}
                  </div>
                  {cleanSubtitle(activity.subtitle) && (
                    <div className="flex items-start gap-0.5 mt-0.5">
                      <IcMapPin size={9} className="text-gray-400 mt-0.5 shrink-0" />
                      <p className={`text-[11px] text-gray-500 leading-snug [overflow-wrap:anywhere] ${completed ? "line-through text-gray-300" : ""}`}>{cleanSubtitle(activity.subtitle)}</p>
                    </div>
                  )}
                </div>
              </div>
              {/* Right controls */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                {activity.imageUrl && !editMode && (
                  <img src={activity.imageUrl} alt={activity.title} className="w-8 h-8 rounded-lg object-cover" />
                )}
                {!editMode && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Apri in Google Maps"
                    className="w-6 h-6 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center hover:bg-blue-100 active:scale-95 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </a>
                )}
                {editMode ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button onClick={onEdit} className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-lg">✏️</button>
                      <button onClick={onDelete} className="text-[10px] bg-red-50 text-red-500 font-bold px-1.5 py-0.5 rounded-lg">🗑️</button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={onMoveUp} disabled={isFirst} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isFirst ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}>↑</button>
                      <button onClick={onMoveDown} disabled={isLast} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isLast ? "bg-gray-50 text-gray-300" : "bg-gray-100 text-gray-600"}`}>↓</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
                    style={{ borderColor: completed ? "#10b981" : "#d1d5db", backgroundColor: completed ? "#10b981" : "transparent" }}
                  >
                    {completed && <span className="text-white text-[10px] font-black">✓</span>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form per aggiungere attività ad un giorno ─────────────────────────────────
export function AddActivitySheet({
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
  const [transitTime, setTransitTime] = useState("");
  const [price, setPrice] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [isBooked, setIsBooked] = useState(false);
  const [howToGetThere, setHowToGetThere] = useState("");
  const [timeBeforehand, setTimeBeforehand] = useState("");
  const [duration, setDuration] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [note, setNote] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");

  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  function handleSubmit() {
    if (!title.trim() || !time.trim()) return;
    const parsedPrice = parseFloat(price.replace(",", "."));
    const newAct: Activity = {
      id: `act-${Date.now()}`,
      time: time.trim(),
      type,
      title: title.trim(),
      subtitle: subtitle.trim() || (type === "other" ? "" : "Attività del giorno"),
      transitTime: transitTime.trim() || undefined,
      price: isNaN(parsedPrice) ? undefined : parsedPrice,
      isPaid,
      isBooked,
      howToGetThere: howToGetThere.trim() || undefined,
      timeBeforehand: timeBeforehand.trim() || undefined,
      duration: duration.trim() || undefined,
      bookingRef: bookingRef.trim() || undefined,
      ticketUrl: ticketUrl.trim() || undefined,
      note: note.trim() || undefined,
      mapsUrl: mapsUrl.trim() || undefined,
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
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container flex flex-col max-h-[88dvh]" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h2 className="text-[17px] font-extrabold text-gray-900">Nuova attività</h2>
            <p className="text-[12px] font-semibold text-blue-600">{dayLabel}</p>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
          {/* 1. SEZIONE ESSENZIALE (Sempre Visibile) */}
          <div className="bg-blue-50/40 border border-blue-100 p-3.5 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Dati essenziali</p>

            {/* Tipo attività */}
            <div>
              <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Tipo attività</label>
              <div className="flex gap-1.5 flex-wrap">
                {TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setType(t.type)}
                    className={`px-2.5 py-1.5 rounded-xl text-[12px] font-semibold transition-colors flex items-center gap-1 ${
                      type === t.type
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-1/3">
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Orario *</label>
                <input
                  type="text"
                  value={time}
                  placeholder="es. 10:30"
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
              <div className="w-full sm:w-2/3">
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                  {type === "transport" ? "Titolo / Tratta *" : "Titolo *"}
                </label>
                <input
                  type="text"
                  value={title}
                  placeholder={type === "transport" ? "es. Volo Milano → Tokyo" : "es. Visita al tempio"}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {type !== "other" && (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Luogo</label>
                <input
                  type="text"
                  value={subtitle}
                  placeholder={type === "transport" ? "es. Aeroporto / Compagnia" : "es. Quartiere o città"}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>
            )}
          </div>

          {/* 2. ACCORDION DETTAGLI CONDIZIONALI */}
          <button
            type="button"
            onClick={() => setShowOptionalDetails((prev) => !prev)}
            className="w-full py-2.5 px-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-2xl text-[12px] font-bold text-gray-800 flex items-center justify-between transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span>Altri dettagli</span>
            </div>
            <IcChevronDown
              size={16}
              className={`transition-transform duration-200 ${
                showOptionalDetails ? "rotate-180 text-blue-600" : "text-gray-400"
              }`}
            />
          </button>

          {showOptionalDetails && (
            <div className="space-y-3 p-3.5 bg-gray-50/70 border border-gray-200/60 rounded-2xl">
              {type === "other" && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Località / Luogo</label>
                  <input
                    type="text"
                    value={subtitle}
                    placeholder="es. Indirizzo o punto d'incontro"
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {/* Prezzo & Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Prezzo (€)</label>
                  <input
                    type="text"
                    value={price}
                    placeholder="es. 45"
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>

                {type !== "shopping" && (
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200">
                    <span className="text-[11px] font-bold text-gray-700">Prenotazione</span>
                    <button
                      type="button"
                      onClick={() => setIsBooked(!isBooked)}
                      className={`px-2 py-1 rounded text-[10px] font-extrabold uppercase transition-colors ${
                        isBooked
                          ? "bg-blue-50 text-blue-600 border border-blue-200"
                          : "bg-gray-100 text-gray-400 border border-gray-200"
                      }`}
                    >
                      {isBooked ? "✅ Sì" : "❌ No"}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-700">Pagato</span>
                  <button
                    type="button"
                    onClick={() => setIsPaid(!isPaid)}
                    className={`px-2 py-1 rounded text-[10px] font-extrabold uppercase transition-colors ${
                      isPaid
                        ? "bg-green-50 text-green-600 border border-green-200"
                        : "bg-red-50 text-red-500 border border-red-100"
                    }`}
                  >
                    {isPaid ? "✅ Sì" : "⏳ No"}
                  </button>
                </div>
              </div>

              {/* Durata & Presentarsi prima */}
              {(type === "sightseeing" || type === "transport" || type === "food" || type === "other") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">Durata</label>
                    <input
                      type="text"
                      value={duration}
                      placeholder="es. 2 ore"
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                    />
                  </div>

                  {(type === "sightseeing" || type === "transport") && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1">Presentarsi prima</label>
                      <input
                        type="text"
                        value={timeBeforehand}
                        placeholder="es. 30m prima"
                        onChange={(e) => setTimeBeforehand(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tempo di trasferimento */}
              {(type === "sightseeing" || type === "transport") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Tempo di trasferimento</label>
                  <input
                    type="text"
                    value={transitTime}
                    placeholder="es. 45m dal luogo precedente"
                    onChange={(e) => setTransitTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {/* Link Google Maps */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link Google Maps</label>
                <input
                  type="text"
                  value={mapsUrl}
                  placeholder="Incolla il link Google Maps del luogo"
                  onChange={(e) => setMapsUrl(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                />
              </div>

              {/* Codice Prenotazione & Link */}
              {(type === "sightseeing" || type === "hotel" || type === "transport") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">
                      {type === "transport" ? "PNR / Codice Prenotazione" : "Codice Prenotazione"}
                    </label>
                    <input
                      type="text"
                      value={bookingRef}
                      placeholder="es. BK-987"
                      onChange={(e) => setBookingRef(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 font-mono font-bold outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link Biglietto / Sito</label>
                    <input
                      type="text"
                      value={ticketUrl}
                      placeholder="https://..."
                      onChange={(e) => setTicketUrl(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              )}

              {(type === "food" || type === "shopping" || type === "other") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Link / Sito web</label>
                  <input
                    type="text"
                    value={ticketUrl}
                    placeholder="https://..."
                    onChange={(e) => setTicketUrl(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-blue-400"
                  />
                </div>
              )}

              {(type === "sightseeing" || type === "transport") && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Come arrivare / Note percorso</label>
                  <textarea
                    value={howToGetThere}
                    placeholder="Parcheggio, fermata bus, indicazioni..."
                    onChange={(e) => setHowToGetThere(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-[12.5px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none min-h-[60px]"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">Note</label>
                <textarea
                  value={note}
                  placeholder="Note o dettagli utili per questa attività..."
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-[12.5px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none min-h-[60px]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons (Sempre Visibili in Basso) */}
        <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100 shrink-0">
          <button
            type="button"
            className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            type="button"
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!title.trim() || !time.trim()}
            style={{ opacity: !title.trim() || !time.trim() ? 0.5 : 1 }}
          >
            Salva attività
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
  const [transportsList, setTransportsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);

  const [expandedDayId, setExpandedDayId] = useState<string | null>(TODAY_DAY_ID);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);
  const [addingToDay, setAddingToDay] = useState<{ id: string; label: string } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Traccia quale giorno ha la modalità modifica attivata
  const [editModeDayId, setEditModeDayId] = useState<string | null>(null);

  const [completedActs, setCompletedActs] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  // Per ogni giorno espanso: filtro itinerario ("all" | "morning" | "afternoon")
  const [itineraryFilter] = useState<Record<string, "all" | "morning" | "afternoon">>({});

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function initData() {
      try {
        const days = await repository.getTripDays(DAYS);
        const completed = await repository.getCompletedActivities();
        const trs = await repository.getTransports(TRANSPORTS);
        setTripDays(days);
        setCompletedActs(completed);
        setTransportsList(trs);
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
    if (!window.confirm("Eliminare questa attività?")) return;
    const nextDays = tripDays.map((day) => {
      if (day.id === dayId) {
        return { ...day, activities: day.activities.filter((a) => a.id !== actId) };
      }
      return day;
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
  }

  function handleMoveActivity(dayId: string, actIdx: number, direction: "up" | "down") {
    const nextDays = tripDays.map((day) => {
      if (day.id !== dayId) return day;
      const acts = [...day.activities];
      const targetIdx = direction === "up" ? actIdx - 1 : actIdx + 1;
      if (targetIdx < 0 || targetIdx >= acts.length) return day;
      [acts[actIdx], acts[targetIdx]] = [acts[targetIdx], acts[actIdx]];
      return { ...day, activities: acts };
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
  }

  const getRealTodayDayId = (): string | null => {
    if (tripDays.length === 0) return null;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const date = String(now.getDate()).padStart(2, "0");
    const localTodayStr = `${year}-${month}-${date}`;
    
    const found = tripDays.find((d) => d.date === localTodayStr);
    return found ? found.id : null;
  };

  const realTodayId = getRealTodayDayId();

  const handleJumpToToday = () => {
    if (tripDays.length === 0) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const date = String(now.getDate()).padStart(2, "0");
    const localTodayStr = `${year}-${month}-${date}`;
    
    const found = tripDays.find((d) => d.date === localTodayStr);
    
    let targetDayId = "";
    let isOutOfRange = false;
    let message = "";

    if (found) {
      targetDayId = found.id;
      if (expandedDayId === found.id) {
        // Se siamo già sul giorno corrente ed è già espanso, effettua solo lo scorrimento
        const el = document.getElementById(`trip-day-${found.id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
    } else {
      isOutOfRange = true;
      const firstDayDate = new Date(tripDays[0].date);
      if (now < firstDayDate) {
        message = `Il viaggio non è ancora iniziato (Inizio: ${tripDays[0].dateLabel.toLowerCase()})`;
        targetDayId = tripDays[0].id;
      } else {
        message = `Il viaggio è terminato (Termine: ${tripDays[tripDays.length - 1].dateLabel.toLowerCase()})`;
        targetDayId = tripDays[tripDays.length - 1].id;
      }
    }
    
    if (targetDayId) {
      if (isOutOfRange) {
        showToast(message);
      }
      handleSelectDay(targetDayId);
    }
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">Itinerario</h1>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <span className="text-[13px] text-gray-500 font-medium truncate">{TRIP_NAME}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                {TRIP_DURATION}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="px-3.5 h-10 rounded-xl bg-white border border-gray-100 shadow-sm text-[12px] font-extrabold text-gray-600 hover:text-blue-650 active:scale-95 active:bg-gray-50 transition-all shrink-0"
              onClick={handleJumpToToday}
            >
              Oggi
            </button>
            <button
              className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center border border-gray-100 active:scale-95 active:bg-gray-50 transition-all shrink-0"
              onClick={() => setShowDatePicker(true)}
            >
              <IcCalendar size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista dei giorni cronologica */}
      <div className="px-4 space-y-3">
        {(() => {
          const totalActivities = tripDays.reduce((sum, d) => sum + (d.activities ? d.activities.length : 0), 0);
          if (tripDays.length === 0) {
            return (
              <div className="py-10 px-4 text-center bg-gray-50/60 border border-dashed border-gray-200 rounded-2xl space-y-1.5">
                <p className="text-[14px] font-bold text-gray-800">Non hai ancora creato il tuo viaggio.</p>
                <p className="text-[12px] text-gray-500 font-medium leading-relaxed">
                  La creazione di un viaggio da zero sarà disponibile con il futuro modulo di Onboarding / Nuovo Viaggio.
                </p>
              </div>
            );
          }
          if (totalActivities === 0) {
            return (
              <div className="py-10 px-4 text-center bg-gray-50/60 border border-dashed border-gray-200 rounded-2xl space-y-3">
                <p className="text-[14px] font-bold text-gray-800">Il tuo itinerario è vuoto. Inizia aggiungendo la prima tappa.</p>
                <button
                  onClick={() => setAddingToDay({ id: tripDays[0].id, label: tripDays[0].dateLabel })}
                  className="px-4 py-2 bg-blue-600 text-white font-extrabold text-[12px] rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                >
                  + Aggiungi prima tappa
                </button>
              </div>
            );
          }
          return tripDays.map((day, idx) => {
          const isExpanded = expandedDayId === day.id;
          const isToday = day.id === realTodayId || (realTodayId === null && day.id === TODAY_DAY_ID);
          const isEditMode = editModeDayId === day.id;
          const dayFilter = itineraryFilter[day.id] || "all";

          const transportCount = day.activities.filter((a) => a.type === "transport").length;
          const activityCount = day.activities.length - transportCount;

          // Totale guida (solo auto/car)
          const totalDriveMin = day.activities.reduce((sum, act, actIdx) => {
            const nextAct = day.activities[actIdx + 1];
            if (!nextAct || !isDrivingTransit(act, nextAct, transportsList, day.date)) return sum;
            const timeStr = getReliableTransitTime(act, nextAct, day.date, transportsList);
            return sum + parseTransitTimeToMinutes(timeStr);
          }, 0);
          const totalDriveStr = formatMinutesToHoursAndMinutes(totalDriveMin);

          // Totale non-guida (voli, traghetti, treni)
          const totalNonDriveMin = day.activities.reduce((sum, act, actIdx) => {
            const nextAct = day.activities[actIdx + 1];
            if (!nextAct || isDrivingTransit(act, nextAct, transportsList, day.date)) return sum;
            const timeStr = getReliableTransitTime(act, nextAct, day.date, transportsList);
            const mins = parseTransitTimeToMinutes(timeStr);
            return sum + mins;
          }, 0);
          const totalNonDriveStr = formatMinutesToHoursAndMinutes(totalNonDriveMin);

          return (
            <div
              key={day.id}
              id={`trip-day-${day.id}`}
              className={`card transition-all duration-200 border ${
                isToday ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-100"
              }`}
            >
              {/* Riepilogo giorno compatto — struttura: [button flex-1] [link-maps] */}
              <div className="flex items-stretch">
                <button
                  className="flex-1 min-w-0 flex items-center justify-between p-4 text-left focus:outline-none gap-2"
                  onClick={() => toggleDay(day.id)}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
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
                          <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-extrabold text-[9.5px]">
                            🚗 {totalDriveStr}
                          </span>
                        )}
                        {totalNonDriveStr && (
                          <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-extrabold text-[9.5px]">
                            ✈️ {totalNonDriveStr}
                          </span>
                        )}
                        {day.activities.length === 0 && <span>Riposo / Libero</span>}
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

                {/* Icona Maps — fuori dal button per essere un link valido e cliccabile */}
                {day.activities.length > 0 && (
                  <a
                    href={buildDayItineraryUrl(day.activities, dayFilter)}
                    target="_blank"
                    rel="noreferrer"
                    title="Apri itinerario completo in Google Maps"
                    className="flex flex-col items-center justify-center px-3.5 border-l border-gray-100 hover:bg-blue-55 active:bg-blue-100 transition-colors shrink-0 rounded-r-2xl"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="text-[8.5px] font-black text-blue-600 mt-0.5">Maps</span>
                  </a>
                )}
              </div>

              {/* Dettaglio della giornata espanso */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-3 pt-3 pb-3 bg-gray-50/40 rounded-b-2xl">

                  {/* ── Barra superiore: totali guida + Maps itinerario + Modifica ── */}
                  <div className="mb-3 space-y-2">
                    {/* Riga 1: stats + Maps + Modifica */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Totale guida auto */}
                      {totalDriveStr ? (
                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                          <span className="text-[10px] font-black text-blue-700">🚗 {totalDriveStr}</span>
                          <span className="text-[9px] text-blue-400 font-medium">guida</span>
                        </div>
                      ) : null}
                      {/* Totale non-guida (voli/traghetti/altro) */}
                      {totalNonDriveStr ? (
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
                          <span className="text-[10px] font-black text-slate-600">✈️ {totalNonDriveStr}</span>
                          <span className="text-[9px] text-slate-400 font-medium">transfer</span>
                        </div>
                      ) : null}
                      {/* Se nessun totale disponibile */}
                      {!totalDriveStr && !totalNonDriveStr && day.activities.length > 0 && (
                        <span className="text-[10px] text-gray-400 font-medium">{day.activities.length} tappe</span>
                      )}
                      <div className="flex-1" />
                      {/* Pulsante Apri mappa unificato */}
                      <DayMapsButton activities={day.activities} />
                      {/* Pulsante modifica */}
                      <button
                        onClick={() => setEditModeDayId(isEditMode ? null : day.id)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                          isEditMode ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {isEditMode ? "✓ Fine" : "✏️"}
                      </button>
                    </div>
                  </div>

                  {day.activities.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic text-center py-2">
                      Nessuna attività programmata per questo giorno.
                    </p>
                  ) : (
                    <div className="space-y-0">
                      {day.activities.map((act, actIdx) => {
                        const prevAct = actIdx > 0 ? day.activities[actIdx - 1] : undefined;
                        // Transit time from the previous activity to this one
                        const transitFromPrev = prevAct ? getReliableTransitTime(prevAct, act, day.date, transportsList) : undefined;
                        return (
                          <TripTimelineRow
                            key={act.id}
                            activity={act}
                            isFirst={actIdx === 0}
                            isLast={actIdx === day.activities.length - 1}
                            completed={completedActs.includes(act.id)}
                            onToggle={() => toggleActivity(act.id)}
                            onEdit={() => setEditingActivity({ dayId: day.id, activity: act, dayLabel: day.dateLabel })}
                            onDelete={() => handleDeleteActivity(day.id, act.id)}
                            onMoveUp={() => handleMoveActivity(day.id, actIdx, "up")}
                            onMoveDown={() => handleMoveActivity(day.id, actIdx, "down")}
                            editMode={isEditMode}
                            transitTimeFromPrev={transitFromPrev}
                            dayLocation={day.location}
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
        });
      })()}
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

      {showDatePicker && (
        <TripDatePickerSheet
          selectedDayId={expandedDayId}
          onSelect={handleSelectDay}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-[12px] font-bold px-4 py-2.5 rounded-full shadow-lg backdrop-blur-md transition-all duration-300 text-center whitespace-nowrap border border-white/10 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
