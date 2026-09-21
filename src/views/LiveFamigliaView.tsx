import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DAYS, TRANSPORTS } from "../data/mockData";
import type { DayData, Transport } from "../data/mockData";
import { repository } from "../services/repository";

const SNAPSHOT_KEY = "hrb_live_family_snapshot";

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
  } | null;
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

export default function LiveFamigliaView() {
  const navigate = useNavigate();
  const [tripDays, setTripDays] = useState<DayData[]>(DAYS);
  const [transports, setTransports] = useState<Transport[]>(TRANSPORTS);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);

  // Data selezionata o corrente (fallback a oggi o prima tappa)
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
        setTripDays(d || DAYS);
        setTransports(t || TRANSPORTS);
      } catch {
        // Se va in errore usa fallback
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

    // Gestione Fuso Orario IANA (Requirement 4)
    if (currentDay && currentDay.timezone) {
      try {
        const localFormat = new Intl.DateTimeFormat("it-IT", {
          timeZone: currentDay.timezone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        localTimeStr = localFormat.format(currentTime);

        const italyOffset = getTimezoneOffsetHours("Europe/Rome", currentTime);
        const localOffset = getTimezoneOffsetHours(currentDay.timezone, currentTime);
        const diffHours = localOffset - italyOffset;

        if (diffHours === 0) {
          timeDiffStr = "Stesso orario dell'Italia";
        } else if (diffHours > 0) {
          timeDiffStr = `+${diffHours} ${diffHours === 1 ? "ora" : "ore"} rispetto all'Italia`;
        } else {
          timeDiffStr = `${diffHours} ${diffHours === -1 ? "ora" : "ore"} rispetto all'Italia`;
        }
      } catch {
        timezoneMissingNote = `Identificativo timezone "${currentDay.timezone}" non valido per la tappa`;
      }
    } else {
      // Se il campo timezone non esiste su una tappa, segnalarlo come da aggiungere
      timezoneMissingNote = "Fuso orario IANA da aggiungere per questa tappa (campo timezone assente su day record)";
    }

    // Calcolo Prossimo Spostamento
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
        }
      : null;

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
    };

    setSnapshot(newSnapshot);

    // Salva ultimo snapshot per consultazione offline (Requirement 5)
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(newSnapshot));
    } catch {
      /* ignore */
    }
  }, [selectedDate, tripDays, transports, currentTime]);

  // Se siamo offline e non c'è uno snapshot calcolato, recupera da localStorage
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-start p-4 pb-12 font-sans">
      <div className="w-full max-w-md space-y-4">
        {/* Top bar / Navigation */}
        <div className="flex items-center justify-between pt-2 pb-1 border-b border-slate-800">
          <button
            onClick={() => navigate("/altro")}
            className="text-[12px] font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            ← Torna al Roadbook
          </button>
          <span className="text-[10px] font-bold tracking-widest uppercase bg-blue-900/60 text-blue-300 px-2.5 py-1 rounded-full border border-blue-700/50">
            Vista Famiglia Live
          </span>
        </div>

        {/* Banner Offline */}
        {isOffline && (
          <div className="bg-amber-950/80 border border-amber-700/60 text-amber-200 text-[12px] px-3.5 py-2 rounded-xl flex items-center justify-between">
            <span>⚡ Modalità Offline (Ultimo snapshot salvato)</span>
          </div>
        )}

        {/* Header principale */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-850 border border-slate-700/70 rounded-3xl p-5 shadow-xl space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">
            Honeymoon Roadbook &middot; Nunzio & Giusy
          </p>
          <h1 className="text-2xl font-black text-white leading-tight">
            Live per la Famiglia 👨‍👩‍👧‍👦
          </h1>
          <p className="text-[12.5px] text-slate-400 leading-relaxed">
            Stato in sola lettura derivato direttamente dall'itinerario ufficiale del viaggio.
          </p>

          {/* Selettore tappa / data */}
          <div className="pt-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Seleziona Tappa / Data Itinerario:
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white text-[12.5px] rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-500"
            >
              {tripDays.map((d) => (
                <option key={d.id} value={d.date}>
                  Giorno {d.dayNumber} &middot; {d.dateLabel} ({d.location})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 1. DOVE SIAMO ORA */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 space-y-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              Dove siamo ora
            </span>
            {snapshot?.dayNumber && (
              <span className="text-[11px] font-bold text-slate-400">
                Giorno {snapshot.dayNumber}
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-white leading-snug">
            📍 {snapshot?.location || "In Viaggio"}
          </h2>
          {snapshot?.dateLabel && (
            <p className="text-[12px] text-slate-400 font-medium">
              Data tappa: {snapshot.dateLabel}
            </p>
          )}
        </div>

        {/* 2. PROSSIMO SPOSTAMENTO */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 space-y-3 shadow-md">
          <span className="text-[11px] font-black uppercase tracking-widest text-indigo-400">
            🚘 Prossimo Spostamento
          </span>
          {snapshot?.nextTransport ? (
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[11.5px] font-bold text-slate-400">
                <span>{snapshot.nextTransport.dateLabel}</span>
                <span className="uppercase text-blue-400 font-black">{snapshot.nextTransport.type}</span>
              </div>
              <p className="text-[15px] font-black text-white leading-snug">
                {snapshot.nextTransport.from} &rarr; {snapshot.nextTransport.to}
              </p>
              {snapshot.nextTransport.detail && (
                <p className="text-[12px] text-slate-400 font-medium">
                  {snapshot.nextTransport.detail}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-slate-400 italic">
              Nessun prossimo spostamento programmato in archivio.
            </p>
          )}
        </div>

        {/* 3. ORARIO LOCALE VS ITALIANO */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 space-y-3 shadow-md">
          <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
            🕒 Fuso Orario e Ora Locale
          </span>

          <div className="grid grid-cols-2 gap-3 text-center">
            {/* Ora Italia */}
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                🇮🇹 Ora in Italia
              </span>
              <span className="text-lg font-black text-white font-mono">
                {snapshot?.italyTimeStr || "--:--:--"}
              </span>
              <span className="text-[10px] text-slate-400 block mt-1">Europe/Rome</span>
            </div>

            {/* Ora Locale Tappa */}
            <div className="bg-slate-900/80 border border-blue-900/50 rounded-xl p-3">
              <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block mb-1">
                📍 Ora Locale Tappa
              </span>
              {snapshot?.localTimeStr ? (
                <>
                  <span className="text-lg font-black text-blue-300 font-mono">
                    {snapshot.localTimeStr}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold block mt-1">
                    {snapshot.timeDiffStr}
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-amber-400 font-bold block mt-2">
                  Non disponibile
                </span>
              )}
            </div>
          </div>

          {/* Segnalazione campo timezone mancante (Requirement 4) */}
          {snapshot?.timezoneMissingNote && (
            <div className="bg-amber-950/70 border border-amber-600/60 text-amber-200 text-[12px] p-3 rounded-xl leading-relaxed">
              <span className="font-bold block mb-0.5">⚠️ Segnalazione Fuso Orario:</span>
              {snapshot.timezoneMissingNote}
            </div>
          )}

          {snapshot?.timezone && (
            <div className="text-[11px] text-slate-400 text-center font-mono">
              Identificativo IANA: <strong className="text-slate-200">{snapshot.timezone}</strong>
            </div>
          )}
        </div>

        {/* Footer info snapshot */}
        <div className="text-center text-[10.5px] text-slate-500 pt-2 space-y-1">
          <p>Dati derivati direttamente dal Roadbook senza duplicazioni.</p>
          {snapshot?.updatedAt && (
            <p>Ultimo aggiornamento snapshot: {new Date(snapshot.updatedAt).toLocaleTimeString("it-IT")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
