import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DAYS, TRANSPORTS } from "../data/mockData";
import type { DayData, Transport } from "../data/mockData";
import { repository } from "../services/repository";

const SNAPSHOT_KEY = "hrb_live_family_snapshot";

interface FlightInfo {
  id: string;
  date: string;
  dateLabel: string;
  from: string;
  to: string;
  airline?: string;
  flightNumber?: string;
  depTime?: string;
  arrTime?: string;
  pnr?: string;
  seats?: string;
  terminalDep?: string;
  detail?: string;
}

export interface LiveSnapshot {
  updatedAt: string;
  currentDateIso: string;
  location: string;
  dayNumber?: number;
  dateLabel?: string;
  timezone?: string;
  localTimeStr?: string;
  italyTimeStr?: string;
  timeDiffStr?: string;
  timezoneMissingNote?: string;
  nextTransport?: {
    date: string;
    dateLabel: string;
    from: string;
    to: string;
    type: string;
    detail?: string;
    duration?: string;
    time?: string;
    arrivalTime?: string;
    seat?: string;
  } | null;
  activeFlight?: FlightInfo | null;
}

// Calcola offset orario IANA in ore rispetto a UTC
function getTimezoneOffsetHours(timeZone: string, date: Date = new Date()): number {
  try {
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = format.formatToParts(date);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);

    const year = getPart("year");
    const month = getPart("month") - 1;
    const day = getPart("day");
    let hour = getPart("hour");
    if (hour === 24) hour = 0;
    const minute = getPart("minute");
    const second = getPart("second");

    const targetDateAsUtc = Date.UTC(year, month, day, hour, minute, second);
    return Math.round((targetDateAsUtc - date.getTime()) / (1000 * 60 * 60));
  } catch {
    return 0;
  }
}

// Estrae il codice/numero del volo dal dettaglio o note
function extractFlightCode(text: string): string | null {
  const match = text.match(/\b([A-Z0-9]{2,3}\s?\d{2,4})\b/i);
  return match ? match[1].replace(/\s+/g, "").toUpperCase() : null;
}

export default function LiveFamigliaView() {
  const navigate = useNavigate();
  const [tripDays, setTripDays] = useState<DayData[]>(DAYS);
  const [transports, setTransports] = useState<Transport[]>(TRANSPORTS);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeModalFlight, setActiveModalFlight] = useState<FlightInfo | null>(null);

  // Data selezionata (con auto-allineamento a oggi se compresa nel viaggio)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const exists = DAYS.some((d) => d.date === today);
    return exists ? today : "2026-11-28";
  });

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Clock live ogni secondo
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Monitora online/offline
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Carica i dati reali dal repository o dal fallback
  useEffect(() => {
    async function loadData() {
      try {
        const [d, t] = await Promise.all([
          repository.getTripDays(DAYS),
          repository.getTransports(TRANSPORTS),
        ]);
        if (d && d.length > 0) setTripDays(d);
        if (t && t.length > 0) setTransports(t);
      } catch {
        /* fallback su mock */
      }
    }
    loadData();
  }, []);

  // Deriva lo stato corrente e aggiorna lo snapshot in localStorage
  useEffect(() => {
    const currentDay = tripDays.find((d) => d.date === selectedDate) || tripDays[0];
    const location = currentDay ? currentDay.location : "In Viaggio";

    // Orario Italiano (Europe/Rome)
    const italyFormat = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const italyTimeStr = italyFormat.format(currentTime);

    let localTimeStr: string | undefined;
    let timeDiffStr: string | undefined;
    let timezoneMissingNote: string | undefined;

    // Gestione Fuso Orario IANA
    const tzToUse = currentDay?.timezone || "Europe/Rome";
    try {
      const localFormat = new Intl.DateTimeFormat("it-IT", {
        timeZone: tzToUse,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      localTimeStr = localFormat.format(currentTime);

      const italyOffset = getTimezoneOffsetHours("Europe/Rome", currentTime);
      const localOffset = getTimezoneOffsetHours(tzToUse, currentTime);
      const diffHours = localOffset - italyOffset;

      if (diffHours === 0) {
        timeDiffStr = "Stesso orario dell'Italia";
      } else if (diffHours > 0) {
        timeDiffStr = `+${diffHours} ${diffHours === 1 ? "ora" : "ore"} avanti rispetto all'Italia`;
      } else {
        timeDiffStr = `${diffHours} ${diffHours === -1 ? "ora" : "ore"} indietro rispetto all'Italia`;
      }
    } catch {
      timezoneMissingNote = `Identificativo timezone "${tzToUse}" non valido per la tappa`;
    }

    if (!currentDay?.timezone) {
      timezoneMissingNote = "Fuso orario IANA da aggiungere per questa tappa (campo timezone assente su day record)";
    }

    // Prossimo Spostamento coerente dai trasporti ufficiali
    const nextTr = transports
      .filter((t) => t.date >= selectedDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];

    const nextTransportData = nextTr
      ? {
          date: nextTr.date,
          dateLabel: nextTr.dateLabel || nextTr.date,
          from: nextTr.from,
          to: nextTr.to,
          type: nextTr.type,
          detail: nextTr.detail,
          duration: nextTr.duration,
          time: nextTr.time,
          arrivalTime: nextTr.arrivalTime,
          seat: nextTr.seat,
        }
      : null;

    // Cerca Volo Attivo/Imminente
    let activeFlightData: FlightInfo | null = null;
    const flightTransport = transports
      .filter(
        (t) =>
          (t.type === "plane" ||
            t.detail?.toLowerCase().includes("volo") ||
            t.detail?.toLowerCase().includes("ca") ||
            t.detail?.toLowerCase().includes("nz") ||
            t.detail?.toLowerCase().includes("qf") ||
            t.detail?.toLowerCase().includes("pr") ||
            t.detail?.toLowerCase().includes("5j")) &&
          t.date >= selectedDate
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (flightTransport) {
      const flightCode =
        flightTransport.carrierCode ||
        extractFlightCode(flightTransport.detail || "") ||
        extractFlightCode(flightTransport.from + " " + flightTransport.to) ||
        undefined;
      activeFlightData = {
        id: flightTransport.id,
        date: flightTransport.date,
        dateLabel: flightTransport.dateLabel || flightTransport.date,
        from: flightTransport.from,
        to: flightTransport.to,
        flightNumber: flightCode,
        depTime: flightTransport.time,
        arrTime: flightTransport.arrivalTime,
        pnr: flightTransport.bookingRef || flightTransport.confirmationCode,
        seats: flightTransport.seat,
        terminalDep: flightTransport.terminal,
        detail: flightTransport.detail,
      };
    }

    const newSnapshot: LiveSnapshot = {
      updatedAt: new Date().toISOString(),
      currentDateIso: selectedDate,
      location,
      dayNumber: currentDay?.dayNumber,
      dateLabel: currentDay?.dateLabel,
      timezone: currentDay?.timezone,
      localTimeStr,
      italyTimeStr,
      timeDiffStr,
      timezoneMissingNote,
      nextTransport: nextTransportData,
      activeFlight: activeFlightData,
    };

    setSnapshot(newSnapshot);

    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(newSnapshot));
    } catch {
      /* ignore */
    }
  }, [selectedDate, tripDays, transports, currentTime]);

  // Fallback da localStorage in modalità offline
  useEffect(() => {
    if (!snapshot) {
      try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (raw) {
          setSnapshot(JSON.parse(raw));
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const currentDayData = tripDays.find((d) => d.date === selectedDate) || tripDays[0];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-start p-3 sm:p-5 pb-16 font-sans">
      <div className="w-full max-w-md space-y-4">
        {/* Top Header Navigation matching main app light style */}
        <div className="flex items-center justify-between pt-1 pb-2">
          <button
            onClick={() => navigate("/altro")}
            className="text-[12px] font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 transition-colors bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-sm"
          >
            ← Roadbook
          </button>
          <span className="text-[10.5px] font-extrabold tracking-widest uppercase bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full shadow-sm">
            LIVE FAMIGLIA 👨‍👩‍👧‍👦
          </span>
        </div>

        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] font-bold px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-sm">
            <span className="flex items-center gap-2">⚡ Consultazione Offline (Snapshot in memoria)</span>
          </div>
        )}

        {/* Main Card Header - Standard App Card Style */}
        <div className="app-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-extrabold uppercase tracking-widest text-blue-600">
              Nunzio &amp; Giusy Honeymoon 💍
            </p>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              Giorno {snapshot?.dayNumber || 1} / 44
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              📍 {snapshot?.location || "In Viaggio"}
            </h1>
            <p className="text-[12.5px] text-slate-500 font-medium mt-0.5">
              {snapshot?.dateLabel || "Itinerario Ufficiale"}
            </p>
          </div>

          {/* Selettore Tappa Elegante */}
          <div className="pt-1">
            <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Seleziona tappa per simulare la posizione:
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-[12.5px] font-bold rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-600 shadow-sm"
            >
              {tripDays.map((d) => (
                <option key={d.id} value={d.date}>
                  Giorno {d.dayNumber} · {d.dateLabel} ({d.location})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* OROLOGIO E FUSO ORARIO */}
        <div className="app-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Orologio e Fusi Orari
            </span>
            {snapshot?.timezone && (
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                {snapshot.timezone}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Italia */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                🇮🇹 In Italia
              </span>
              <span className="text-xl font-black text-slate-900 font-mono tracking-wider">
                {snapshot?.italyTimeStr || "--:--:--"}
              </span>
              <span className="text-[9.5px] text-slate-500 block mt-1 font-medium">Europe/Rome</span>
            </div>

            {/* Ora Locale Tappa */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                📍 Ora Locale Tappa
              </span>
              <span className="text-xl font-black text-blue-700 font-mono tracking-wider">
                {snapshot?.localTimeStr || snapshot?.italyTimeStr || "--:--:--"}
              </span>
              <span className="text-[10px] font-bold text-emerald-700 block mt-1">
                {snapshot?.timeDiffStr || "Stesso orario dell'Italia"}
              </span>
            </div>
          </div>
        </div>

        {/* PROSSIMO SPOSTAMENTO */}
        <div className="app-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-700 flex items-center gap-1.5">
              🚘 Prossimo Spostamento
            </span>
            {snapshot?.nextTransport?.dateLabel && (
              <span className="text-[10.5px] font-bold text-slate-500">
                {snapshot.nextTransport.dateLabel}
              </span>
            )}
          </div>

          {snapshot?.nextTransport ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-black text-slate-900">
                  {snapshot.nextTransport.from} &rarr; {snapshot.nextTransport.to}
                </span>
                <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                  {snapshot.nextTransport.type}
                </span>
              </div>

              {/* Dettaglio Orario e Durata Treno / Mezzo */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11.5px] font-medium text-slate-700">
                {snapshot.nextTransport.time && (
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Orario Partenza</span>
                    <span className="text-slate-900 font-bold">{snapshot.nextTransport.time}</span>
                    {snapshot.nextTransport.arrivalTime && (
                      <span className="text-slate-500 text-[10.5px]"> → Arrivo {snapshot.nextTransport.arrivalTime}</span>
                    )}
                  </div>
                )}
                {snapshot.nextTransport.duration && (
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Durata Viaggio</span>
                    <span className="text-blue-700 font-bold">{snapshot.nextTransport.duration}</span>
                  </div>
                )}
              </div>

              {snapshot.nextTransport.detail && (
                <p className="text-[12px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                  {snapshot.nextTransport.detail}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-slate-500 italic text-center py-2">
              Nessun ulteriore spostamento in programma.
            </p>
          )}
        </div>

        {/* SCHEDA VOLO LIVE SE PRESENTE */}
        {snapshot?.activeFlight && (
          <div className="app-card space-y-3.5 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-700 flex items-center gap-1.5">
                ✈️ Dettagli Volo &amp; Tracciamento
              </span>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full">
                {snapshot.activeFlight.dateLabel}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">
                  {snapshot.activeFlight.from} &rarr; {snapshot.activeFlight.to}
                </h3>
                {snapshot.activeFlight.flightNumber && (
                  <button
                    onClick={() => copyToClipboard(snapshot.activeFlight!.flightNumber!)}
                    className="text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shadow-sm active:scale-95"
                  >
                    📋 {snapshot.activeFlight.flightNumber}
                    {copiedCode === snapshot.activeFlight.flightNumber ? " (Copiato!)" : ""}
                  </button>
                )}
              </div>
              {snapshot.activeFlight.detail && (
                <p className="text-[12px] text-slate-600 font-medium">
                  {snapshot.activeFlight.detail}
                </p>
              )}
            </div>

            {/* Griglia PNR e Posti */}
            <div className="grid grid-cols-2 gap-2 text-[11.5px] bg-white border border-slate-200 p-3 rounded-2xl">
              {snapshot.activeFlight.depTime && (
                <div>
                  <span className="text-slate-500 block text-[9.5px] font-bold uppercase">Partenza</span>
                  <span className="text-slate-900 font-bold">{snapshot.activeFlight.depTime}</span>
                </div>
              )}
              {snapshot.activeFlight.arrTime && (
                <div>
                  <span className="text-slate-500 block text-[9.5px] font-bold uppercase">Arrivo</span>
                  <span className="text-slate-900 font-bold">{snapshot.activeFlight.arrTime}</span>
                </div>
              )}
              {snapshot.activeFlight.pnr && (
                <div>
                  <span className="text-slate-500 block text-[9.5px] font-bold uppercase">Codice PNR</span>
                  <span className="text-amber-700 font-mono font-bold">{snapshot.activeFlight.pnr}</span>
                </div>
              )}
              {snapshot.activeFlight.seats && (
                <div>
                  <span className="text-slate-500 block text-[9.5px] font-bold uppercase">Posti</span>
                  <span className="text-emerald-700 font-bold">{snapshot.activeFlight.seats}</span>
                </div>
              )}
            </div>

            {/* Pulsanti Tracciamento */}
            {snapshot.activeFlight.flightNumber && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  🔍 Segui questo volo in diretta online:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`https://www.flightradar24.com/data/flights/${snapshot.activeFlight.flightNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-slate-50 text-amber-800 border border-amber-300 text-[11px] font-bold py-2 rounded-xl text-center transition-colors flex flex-col items-center justify-center shadow-sm"
                  >
                    <span>✈️ Radar24</span>
                    <span className="text-[8.5px] text-slate-500">Mappa Live</span>
                  </a>
                  <a
                    href={`https://flightaware.com/live/flight/${snapshot.activeFlight.flightNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-slate-50 text-blue-700 border border-blue-300 text-[11px] font-bold py-2 rounded-xl text-center transition-colors flex flex-col items-center justify-center shadow-sm"
                  >
                    <span>📡 FlightAware</span>
                    <span className="text-[8.5px] text-slate-500">Stato Volo</span>
                  </a>
                  <a
                    href={`https://www.google.com/search?q=stato+volo+${snapshot.activeFlight.flightNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold py-2 rounded-xl text-center transition-colors flex flex-col items-center justify-center shadow-sm"
                  >
                    <span>🌐 Google</span>
                    <span className="text-[8.5px] text-slate-500">Cerca Orari</span>
                  </a>
                </div>

                <button
                  onClick={() => setActiveModalFlight(snapshot.activeFlight!)}
                  className="w-full mt-1 btn-primary font-bold text-[12px] rounded-xl shadow-sm flex items-center justify-center gap-1.5"
                >
                  📱 Scheda Volo Integrata
                </button>
              </div>
            )}
          </div>
        )}

        {/* PROGRAMMA DELLA TAPPA SELEZIONATA */}
        {currentDayData && currentDayData.activities && currentDayData.activities.length > 0 && (
          <div className="app-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5">
                📅 Programma della Tappa
              </span>
              <span className="text-[10.5px] font-bold text-slate-500">
                {currentDayData.activities.length} tappe / eventi
              </span>
            </div>

            <div className="space-y-2.5">
              {currentDayData.activities.map((act) => {
                const isLayover =
                  /scalo|layover|transit|terminal/i.test(act.title + " " + (act.subtitle || "") + " " + (act.note || "")) ||
                  act.title.toLowerCase().includes("arrivo a pechino");

                if (isLayover) {
                  return (
                    <div
                      key={act.id}
                      className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/80 p-3.5 rounded-2xl space-y-1.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-amber-800 font-mono bg-white px-2 py-0.5 rounded-md border border-amber-200">
                            {act.time}
                          </span>
                          <h4 className="text-[14px] font-black text-amber-950 leading-tight flex items-center gap-1.5">
                            ✈️ {act.title}
                          </h4>
                        </div>
                        <span className="text-[9.5px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                           Scalo Aeroportuale
                        </span>
                      </div>

                      {act.subtitle && (
                        <p className="text-[12px] text-amber-900 font-bold bg-white/70 p-2 rounded-xl border border-amber-200/60">
                          ⏳ {act.subtitle}
                        </p>
                      )}

                      {act.note && (
                        <p className="text-[11.5px] text-amber-800 italic leading-relaxed pt-0.5">
                          ℹ️ {act.note}
                        </p>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={act.id}
                    className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-blue-700 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {act.time}
                        </span>
                        <h4 className="text-[13.5px] font-bold text-slate-900 leading-tight">
                          {act.title}
                        </h4>
                      </div>
                      {act.subtitle && (
                        <p className="text-[11.5px] text-slate-600">{act.subtitle}</p>
                      )}
                      {act.note && (
                        <p className="text-[11px] text-slate-500 italic pt-0.5">{act.note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-400 pt-2 space-y-1">
          <p>Honeymoon Roadbook · Sola lettura Famiglia</p>
        </div>
      </div>

      {/* Modal Monitor Volo Integrato */}
      {activeModalFlight && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveModalFlight(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg"
            >
              ✕
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-700">
                Monitor Volo Integrato
              </span>
              <h3 className="text-xl font-black text-slate-900">
                Volo {activeModalFlight.flightNumber || "In Programma"}
              </h3>
              <p className="text-[12px] text-slate-600">
                {activeModalFlight.from} &rarr; {activeModalFlight.to} ({activeModalFlight.dateLabel})
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2 text-[12px]">
              <p className="text-slate-700 leading-relaxed">
                Aggiornamenti in tempo reale su radar, gate e ritardi per questo volo.
              </p>
              {activeModalFlight.pnr && (
                <div className="bg-white p-2.5 rounded-xl font-mono text-[11px] text-emerald-800 border border-slate-200 space-y-1">
                  <div>PNR: {activeModalFlight.pnr}</div>
                  {activeModalFlight.seats && <div>Posti: {activeModalFlight.seats}</div>}
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <a
                href={`https://www.flightradar24.com/data/flights/${activeModalFlight.flightNumber}`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[12.5px] py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                📡 Apri Flightradar24
              </a>
              <a
                href={`https://www.google.com/search?q=stato+volo+${activeModalFlight.flightNumber}`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[12px] py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                🌐 Verifica su Google
              </a>
            </div>

            <button
              onClick={() => setActiveModalFlight(null)}
              className="w-full text-slate-500 hover:text-slate-700 text-[12px] font-bold pt-1"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
