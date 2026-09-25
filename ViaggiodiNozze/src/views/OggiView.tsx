import { useState, useEffect } from 'react';
import type { SectionTab, Alloggio, Giorno } from '../types';
import { storageService } from '../storage/storageService';
import { resolveMapUrl } from '../utils/mapsHelper';

interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab) => void;
}

// Generatore di giorni per il viaggio (29 Nov 2026 - 10 Gen 2027)
interface TripDayItem {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  dayOfMonth: string;
  monthShort: string;
  dayNameShort: string;
}

function generateTripDays(): TripDayItem[] {
  const days: TripDayItem[] = [];
  const start = new Date(2026, 10, 29); // Mese 10 = Novembre
  const end = new Date(2027, 0, 10); // Mese 0 = Gennaio

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const monthNames = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  let current = new Date(start);
  let count = 1;

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    days.push({
      dateStr,
      dayNum: count,
      dayOfMonth: d,
      monthShort: monthNames[current.getMonth()],
      dayNameShort: dayNames[current.getDay()]
    });

    current.setDate(current.getDate() + 1);
    count++;
  }

  return days;
}

const TRIP_DAYS = generateTripDays();

export default function OggiView({ onNavigateTab }: OggiViewProps) {
  const tripDays = TRIP_DAYS;
  const [selectedDate, setSelectedDate] = useState<string>(tripDays[0]?.dateStr || '2026-11-29');
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [daysData, setDaysData] = useState<Giorno[]>([]);
  const [, setLoading] = useState(true);

  // Calcolo dinamico Countdown rispetto alla partenza (29 Novembre 2026)
  const calculateCountdown = () => {
    const target = new Date('2026-11-29T00:00:00');
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      return `⏳ ${diffDays} giorni alla partenza`;
    } else if (diffDays === 1) {
      return '⏳ Domani si parte!';
    } else if (diffDays === 0) {
      return '🎉 Oggi si parte!';
    } else {
      const end = new Date('2027-01-10T23:59:59');
      if (now <= end) {
        return '✨ Viaggio in corso!';
      }
      return '💍 Viaggio indimenticabile';
    }
  };

  const [timeline, setTimeline] = useState<import('../types').TimelineItem[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [accs, days] = await Promise.all([
          storageService.getAccommodations(),
          storageService.getDays()
        ]);
        setAccommodations(accs);
        setDaysData(days);

        // Se oggi ricade all'interno del viaggio, seleziona la data odierna al primissimo mount
        const todayStr = new Date().toISOString().split('T')[0];
        const isInTrip = TRIP_DAYS.some((d) => d.dateStr === todayStr);
        if (isInTrip && selectedDate === tripDays[0]?.dateStr) {
          setSelectedDate(todayStr);
        }
      } catch (err) {
        console.error('Errore caricamento dati OggiView:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchTimeline() {
      const items = await storageService.getTimelineForDate(selectedDate);
      setTimeline(items);
    }
    fetchTimeline();
  }, [selectedDate]);

  // Informazioni del giorno selezionato
  const currentDayMeta = tripDays.find((d) => d.dateStr === selectedDate);
  const currentDayData = daysData.find((d) => d.date === selectedDate);

  // Alloggio per la data selezionata (dove dormirai stasera)
  const tonightsAccommodation = accommodations.find((acc) => {
    if (acc.checkIn <= selectedDate && acc.checkOut > selectedDate) return true;
    if (acc.checkIn === selectedDate) return true;
    return false;
  });

  // Giorno successivo (Cosa farai domani)
  const currentIndex = tripDays.findIndex((d) => d.dateStr === selectedDate);
  const nextDayMeta = currentIndex >= 0 && currentIndex < tripDays.length - 1 ? tripDays[currentIndex + 1] : null;
  const nextDayData = nextDayMeta ? daysData.find((d) => d.date === nextDayMeta.dateStr) : null;
  const nextDayAccommodation = nextDayMeta
    ? accommodations.find((acc) => acc.checkIn <= nextDayMeta.dateStr && acc.checkOut > nextDayMeta.dateStr)
    : null;

  const formatDateHuman = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
      return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 pt-1 animate-fade-in">
      {/* 1. HEADER HERO / COPERTINA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-5 shadow-sm border border-slate-800">
        <div className="relative z-10 space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-rose-300">
            <span>{calculateCountdown()}</span>
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight">
              Nuova Zelanda & Australia
            </h1>
            <p className="text-xs text-slate-300 font-medium mt-1">
              29 nov 2026 – 10 gen 2027 • 42 giorni di avventura
            </p>
          </div>

          {currentDayMeta && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold text-white">
                  Tappa {currentDayMeta.dayNum} di 43
                </span>
                <span>{formatDateHuman(selectedDate)}</span>
              </div>
              {currentDayData?.title && (
                <p className="text-xs text-rose-200 font-medium truncate">
                  📍 {currentDayData.title}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Decorazione di sfondo elegante */}
        <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-gradient-to-tr from-rose-500/20 to-indigo-500/20 blur-2xl pointer-events-none" />
      </div>

      {/* 2. SELETTORE ORIZZONTALE DEI GIORNI (CALENDAR STRIP) */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Calendario Tappe
          </span>
          <span className="text-xs text-slate-400 font-medium">
            Giorno {currentDayMeta?.dayNum || 1}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-0.5 -mx-1 snap-x">
          {tripDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;
            return (
              <button
                key={item.dateStr}
                type="button"
                onClick={() => setSelectedDate(item.dateStr)}
                className={`snap-start shrink-0 flex flex-col items-center justify-center w-14 py-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white font-bold shadow-md shadow-slate-900/20 scale-[1.03]'
                    : 'bg-white text-slate-700 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <span className={`text-[10px] uppercase tracking-tight ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                  {item.dayNameShort}
                </span>
                <span className="text-base font-extrabold my-0.5 leading-none">
                  {item.dayOfMonth}
                </span>
                <span className={`text-[10px] font-medium ${isSelected ? 'text-rose-300' : 'text-slate-500'}`}>
                  {item.monthShort}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2.5 TIMELINE (ATTIVITÀ E TRASPORTI) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Timeline {formatDateHuman(selectedDate)}
          </span>
        </div>

        {timeline.length > 0 ? (
          <div className="relative pl-3 space-y-4 before:absolute before:inset-y-0 before:left-3.5 before:w-px before:bg-slate-200">
            {timeline.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="relative pl-5">
                <span className={`absolute left-[-5px] top-1 w-3 h-3 rounded-full border-2 border-white ${item.type === 'attivita' ? 'bg-amber-400' : 'bg-sky-400'} z-10 shadow-sm`} />
                
                <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm flex flex-col gap-1.5">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                      {item.time}
                    </span>
                    {item.copilota && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full ml-2 shrink-0">
                        🧭 Co-pilota
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                      {item.type === 'attivita' ? '📍' : '✈️'} {item.location}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-100/50 rounded-2xl border border-slate-200 border-dashed p-4 text-center">
            <p className="text-xs font-medium text-slate-500">Nessuna attività o trasporto per questa giornata.</p>
          </div>
        )}
      </div>

      {/* 3. RIQUADRO "DOVE DORMIRAI STASERA" */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-sm font-bold">
              🛏️
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Dove dormirai stasera
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Notte del {formatDateHuman(selectedDate)}
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('alloggi')}
              className="text-xs font-semibold text-purple-600 hover:text-purple-700 transition-colors cursor-pointer"
            >
              Tutti ➔
            </button>
          )}
        </div>

        {tonightsAccommodation ? (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {tonightsAccommodation.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  📍 {tonightsAccommodation.location}
                </p>
              </div>
              {tonightsAccommodation.copilota && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  🧭 Co-pilota
                </span>
              )}
            </div>

            {tonightsAccommodation.address && (
              <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                {tonightsAccommodation.address}
              </p>
            )}

            <div className="flex items-center justify-between pt-1 text-xs">
              {tonightsAccommodation.bookingCode ? (
                <span className="font-mono text-[11px] font-semibold bg-slate-100 px-2 py-1 rounded-lg text-slate-700">
                  Cod: {tonightsAccommodation.bookingCode}
                </span>
              ) : (
                <span />
              )}

              {/* Azione Maps solo se presente indirizzo fisico o località */}
              {(tonightsAccommodation.address || tonightsAccommodation.location) && (
                <a
                  href={resolveMapUrl(tonightsAccommodation.address || tonightsAccommodation.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Mappa</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs font-semibold text-slate-600">
              Nessun alloggio fissato per stanotte
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
              Potresti essere in volo o pernottare in campervan libero lungo la tratta.
            </p>
          </div>
        )}
      </div>

      {/* 4. RIQUADRO RAPIDO "EMERGENZE" */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold shrink-0">
            ⚠️
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 leading-tight">
              Numeri di Emergenza
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              NZ 111 • AU 000 • Polizza Sanitaria H24
            </p>
          </div>
        </div>
        {onNavigateTab ? (
          <button
            type="button"
            onClick={() => onNavigateTab('altro')}
            className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all shrink-0 cursor-pointer active:scale-95"
          >
            Apri ➔
          </button>
        ) : (
          <a
            href="tel:111"
            className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all shrink-0"
          >
            Chiama 111
          </a>
        )}
      </div>

      {/* 5. SEZIONE "COSA FARAI DOMANI" (GIORNO SUCCESSIVO) */}
      {nextDayMeta && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
              🌅
            </span>
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cosa farai domani
            </span>
          </div>

          <div className="space-y-1 pl-1">
            <div className="text-sm font-bold text-slate-800">
              {formatDateHuman(nextDayMeta.dateStr)} (Tappa {nextDayMeta.dayNum})
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {nextDayData?.title
                ? nextDayData.title
                : nextDayAccommodation
                ? `Proseguimento itinerario e pernottamento a ${nextDayAccommodation.name} (${nextDayAccommodation.location}).`
                : 'Tappa di viaggio e spostamento programmato.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
