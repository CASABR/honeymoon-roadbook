import React, { useState, useEffect, useCallback } from 'react';
import type { SectionTab, CategoriaTab, Alloggio, Giorno, TimelineItem, Attivita, Trasporto, Tappa, Ristorante } from '../types';
import { storageService } from '../storage/storageService';
import { resolveMapUrl } from '../utils/mapsHelper';
import TimelineItemDetailModal from '../components/modals/TimelineItemDetailModal';
import Modal from '../components/common/Modal';
import AttivitaForm from '../components/forms/AttivitaForm';
import TrasportoForm from '../components/forms/TrasportoForm';
import TappaForm from '../components/forms/TappaForm';
import AlloggioForm from '../components/forms/AlloggioForm';
import RistoranteForm from '../components/forms/RistoranteForm';
import RouteBadge from '../components/common/RouteBadge';

interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab, categoria?: CategoriaTab) => void;
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

  // Modali Dettaglio e Modifica
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null);
  const [editingActivityItem, setEditingActivityItem] = useState<Attivita | null>(null);
  const [editingTransportItem, setEditingTransportItem] = useState<Trasporto | null>(null);
  const [editingTappaItem, setEditingTappaItem] = useState<Tappa | null>(null);
  const [editingAlloggioItem, setEditingAlloggioItem] = useState<Alloggio | null>(null);
  const [editingRistoranteItem, setEditingRistoranteItem] = useState<Ristorante | null>(null);

  const fetchTimeline = useCallback(async () => {
    const items = await storageService.getTimelineForDate(selectedDate);
    setTimeline(items);
  }, [selectedDate]);

  const loadData = useCallback(async () => {
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
  }, [selectedDate, tripDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const handleOpenEditFromDetail = (item: TimelineItem) => {
    setDetailItem(null);
    if (item.type === 'attivita') {
      setEditingActivityItem(item.originalData as Attivita);
    } else if (item.type === 'trasporto') {
      setEditingTransportItem(item.originalData as Trasporto);
    } else if (item.type === 'tappa') {
      setEditingTappaItem(item.originalData as Tappa);
    } else if (item.type === 'alloggio') {
      setEditingAlloggioItem(item.originalData as Alloggio);
    } else if (item.type === 'ristorante') {
      setEditingRistoranteItem(item.originalData as Ristorante);
    }
  };

  const handleSaveActivity = async (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const activityToSave: Attivita = {
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now()),
      dayId: data.dayId,
      title: data.title,
      time: data.time,
      location: data.location,
      category: data.category,
      status: data.status,
      duration: data.duration,
      notes: data.notes,
      link: data.link,
      copilota: data.copilota,
      createdAt: editingActivityItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveActivity(activityToSave);
    setEditingActivityItem(null);
    await fetchTimeline();
  };

  const handleSaveTransport = async (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const transportToSave: Trasporto = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'trans_' + Date.now()),
      createdAt: editingTransportItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTransport(transportToSave);
    setEditingTransportItem(null);
    await fetchTimeline();
  };

  const handleSaveTappa = async (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const tappaToSave: Tappa = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tappa_' + Date.now()),
      createdAt: editingTappaItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTappa(tappaToSave);
    setEditingTappaItem(null);
    await fetchTimeline();
  };

  const handleSaveAlloggio = async (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const alloggioToSave: Alloggio = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now()),
      createdAt: editingAlloggioItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveAccommodation(alloggioToSave);
    setEditingAlloggioItem(null);
    await loadData();
    await fetchTimeline();
  };

  const handleSaveRistorante = async (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const ristoranteToSave: Ristorante = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rist_' + Date.now()),
      createdAt: editingRistoranteItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveRistorante(ristoranteToSave);
    setEditingRistoranteItem(null);
    await fetchTimeline();
  };

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
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 transition-colors">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="sr-only"
              />
              <span>📅 Data Libera</span>
            </label>
            <span className="text-xs text-slate-400 font-medium">
              Giorno {currentDayMeta?.dayNum || '–'}
            </span>
          </div>
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

      {/* 2.5 SEQUENZA DELLA GIORNATA E TAPPA FINALE NOTTURNA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Itinerario del Giorno
            </span>
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {formatDateHuman(selectedDate)}
            </span>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('categorie', 'tappe')}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors cursor-pointer"
            >
              Tappe ➔
            </button>
          )}
        </div>

        {/* Sequenza Unificata: timeline + eventuale alloggio notturno */}
        {(() => {
          // Prepara gli elementi di percorso sequenziali
          const dayItems: {
            id: string;
            type: 'trasporto' | 'tappa' | 'attivita' | 'ristorante' | 'alloggio';
            time: string;
            title: string;
            location: string;
            departurePoint?: string;
            arrivalPoint?: string;
            coordinate?: import('../types').Coordinate;
            originalData?: any;
            copilota?: boolean;
          }[] = [];

          timeline.forEach(item => {
            let departurePoint = item.location;
            let arrivalPoint = item.location;

            if (item.type === 'trasporto') {
              const tr = item.originalData as Trasporto;
              departurePoint = tr.departureLocation || item.location;
              arrivalPoint = tr.arrivalLocation || item.location;
            }

            dayItems.push({
              id: item.id,
              type: item.type,
              time: item.time,
              title: item.title,
              location: item.location,
              departurePoint,
              arrivalPoint,
              coordinate: item.coordinate,
              originalData: item.originalData,
              copilota: item.copilota
            });
          });

          // Aggiungi alloggio notturno come ultima tappa fissa della sequenza se presente
          if (tonightsAccommodation) {
            const accLoc = tonightsAccommodation.address || tonightsAccommodation.location || tonightsAccommodation.name;
            dayItems.push({
              id: `lodging_${tonightsAccommodation.id}`,
              type: 'alloggio',
              time: tonightsAccommodation.checkInTime || '20:00',
              title: tonightsAccommodation.name,
              location: accLoc,
              departurePoint: accLoc,
              arrivalPoint: accLoc,
              coordinate: tonightsAccommodation.coordinate,
              originalData: tonightsAccommodation,
              copilota: tonightsAccommodation.copilota
            });
          }

          if (dayItems.length === 0) {
            return (
              <div className="bg-slate-100/60 rounded-3xl border border-slate-200 border-dashed p-6 text-center">
                <span className="text-2xl mb-1 block">🏖️</span>
                <p className="text-xs font-bold text-slate-700">Nessuna attività programmata per oggi</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Giornata libera per relax, esplorazione spontanea o spostamento.</p>
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {dayItems.map((item, idx) => {
                const nextItem = dayItems[idx + 1];

                // Punti di routing punto-a-punto verso il prossimo elemento
                const fromLoc = item.arrivalPoint || item.location;
                const toLoc = nextItem ? (nextItem.departurePoint || nextItem.location) : '';
                const fromCoord = item.coordinate;
                const toCoord = nextItem ? nextItem.coordinate : undefined;

                const isLodging = item.type === 'alloggio';
                const isTransport = item.type === 'trasporto';
                const isTappa = item.type === 'tappa';
                const isRistorante = item.type === 'ristorante';

                return (
                  <React.Fragment key={`${item.id}-${idx}`}>
                    {/* CARD DELL'ELEMENTO NELLA SEQUENZA */}
                    {isLodging ? (
                      /* Card Tappa Finale: Alloggio Notturno */
                      <div className="bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/50 rounded-3xl border border-purple-200/90 p-4 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-purple-100">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-xs">
                              🛏️
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h2 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                                  Dove dormirai stanotte
                                </h2>
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100/80 px-1.5 py-0.5 rounded-full">
                                  Tappa Finale
                                </span>
                              </div>
                              <p className="text-[11px] text-purple-700 font-medium">
                                Check-in dalle {tonightsAccommodation?.checkInTime || '14:00'} • Notte del {formatDateHuman(selectedDate)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tonightsAccommodation && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAlloggioItem(tonightsAccommodation);
                                }}
                                className="w-6 h-6 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                title="Modifica alloggio"
                              >
                                ✏️
                              </button>
                            )}
                            {onNavigateTab && (
                              <button
                                type="button"
                                onClick={() => onNavigateTab('categorie', 'alloggi')}
                                className="text-xs font-semibold text-purple-700 hover:text-purple-800 transition-colors cursor-pointer"
                              >
                                Alloggi ➔
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900 leading-snug">
                                {tonightsAccommodation?.name}
                              </h3>
                              <p className="text-xs text-slate-600 mt-0.5 font-medium flex items-center gap-1">
                                <span>📍</span>
                                <span>{tonightsAccommodation?.location}</span>
                              </p>
                            </div>
                            {tonightsAccommodation?.copilota && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                                🧭 Co-pilota
                              </span>
                            )}
                          </div>

                          {tonightsAccommodation?.address && (
                            <p className="text-xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-purple-100">
                              {tonightsAccommodation.address}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-1 text-xs">
                            {tonightsAccommodation?.bookingCode ? (
                              <span className="font-mono text-[11px] font-semibold bg-purple-100/70 px-2 py-1 rounded-lg text-purple-900">
                                Cod: {tonightsAccommodation.bookingCode}
                              </span>
                            ) : (
                              <span />
                            )}

                            {(tonightsAccommodation?.address || tonightsAccommodation?.location) && (
                              <a
                                href={resolveMapUrl(tonightsAccommodation.address || tonightsAccommodation.location)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Mappa Alloggio</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Card Normale di Itinerario: Trasporto, Tappa, Attività, Ristorante */
                      <div
                        onClick={() => {
                          const found = timeline.find(t => t.id === item.id);
                          if (found) setDetailItem(found);
                        }}
                        className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all flex flex-col gap-2 cursor-pointer"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              isTransport ? 'bg-sky-50 text-sky-700' :
                              isTappa ? 'bg-rose-50 text-rose-700' :
                              isRistorante ? 'bg-emerald-50 text-emerald-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {isTransport ? '✈️' : isTappa ? '📍' : isRistorante ? '🍽️' : '🌿'}
                            </span>
                            <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg shrink-0">
                              {item.time}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {isTransport ? 'Spostamento' : isTappa ? 'Tappa' : isRistorante ? 'Ristorante' : 'Attività'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.copilota && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                🧭 Co-pilota
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const found = timeline.find(t => t.id === item.id);
                                if (found) setDetailItem(found);
                              }}
                              className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                              title="Dettagli e Modifica"
                            >
                              ℹ️
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-[11px] text-slate-500 font-medium truncate">
                              📍 {item.location}
                            </p>
                            {item.location && (
                              <a
                                href={resolveMapUrl(item.location)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded-lg transition-colors shrink-0"
                              >
                                Maps ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ROUTEBADGE SEQUENZIALE TRA QUESTO ELEMENTO E IL SUCCESSIVO */}
                    {nextItem && fromLoc && toLoc && fromLoc.trim().toLowerCase() !== toLoc.trim().toLowerCase() && (
                      <div className="flex items-center justify-center py-1">
                        <RouteBadge
                          from={fromLoc}
                          to={toLoc}
                          fromCoord={fromCoord}
                          toCoord={toCoord}
                          className="scale-95 shadow-xs"
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Se non c'era alloggio per stanotte ma vogliamo comunicarlo chiaramente all'utente */}
      {!tonightsAccommodation && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-3.5 text-center text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Nessun alloggio fissato per stanotte</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Pernottamento libero, camping van o tratta in volo notturno.</p>
        </div>
      )}

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

      {/* Modale Dettaglio Timeline */}
      <TimelineItemDetailModal
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        onEdit={handleOpenEditFromDetail}
      />

      {/* Modale Form Attività */}
      <Modal
        isOpen={Boolean(editingActivityItem)}
        onClose={() => setEditingActivityItem(null)}
        title="Modifica Attività"
        accentVariant="amber"
      >
        <AttivitaForm
          days={daysData}
          selectedDayId={editingActivityItem?.dayId}
          initialData={editingActivityItem}
          onSave={handleSaveActivity}
          onCancel={() => setEditingActivityItem(null)}
        />
      </Modal>

      {/* Modale Form Trasporto */}
      <Modal
        isOpen={Boolean(editingTransportItem)}
        onClose={() => setEditingTransportItem(null)}
        title="Modifica Trasporto"
        accentVariant="sky"
      >
        <TrasportoForm
          initialData={editingTransportItem}
          onSave={handleSaveTransport}
          onCancel={() => setEditingTransportItem(null)}
        />
      </Modal>

      {/* Modale Form Tappa */}
      <Modal
        isOpen={Boolean(editingTappaItem)}
        onClose={() => setEditingTappaItem(null)}
        title="Modifica Tappa"
        accentVariant="rose"
      >
        <TappaForm
          initialData={editingTappaItem}
          onSave={handleSaveTappa}
          onCancel={() => setEditingTappaItem(null)}
        />
      </Modal>

      {/* Modale Form Alloggio */}
      <Modal
        isOpen={Boolean(editingAlloggioItem)}
        onClose={() => setEditingAlloggioItem(null)}
        title="Modifica Alloggio"
        accentVariant="purple"
      >
        <AlloggioForm
          initialData={editingAlloggioItem}
          onSave={handleSaveAlloggio}
          onCancel={() => setEditingAlloggioItem(null)}
        />
      </Modal>

      {/* Modale Form Ristorante */}
      <Modal
        isOpen={Boolean(editingRistoranteItem)}
        onClose={() => setEditingRistoranteItem(null)}
        title="Modifica Ristorante"
        accentVariant="emerald"
      >
        <RistoranteForm
          initialData={editingRistoranteItem}
          onSave={handleSaveRistorante}
          onCancel={() => setEditingRistoranteItem(null)}
        />
      </Modal>
    </div>
  );
}
