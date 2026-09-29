import React, { useState, useEffect, useCallback } from 'react';
import type { SectionTab, CategoriaTab, Alloggio, Giorno, TimelineItem, Attivita, Trasporto, Tappa, Ristorante, Shopping } from '../types';
import { storageService } from '../storage/storageService';
import { resolveMapUrl } from '../utils/mapsHelper';
import TimelineItemDetailModal from '../components/modals/TimelineItemDetailModal';
import Modal from '../components/common/Modal';
import AttivitaForm from '../components/forms/AttivitaForm';
import TrasportoForm from '../components/forms/TrasportoForm';
import TappaForm from '../components/forms/TappaForm';
import AlloggioForm from '../components/forms/AlloggioForm';
import RistoranteForm from '../components/forms/RistoranteForm';
import ShoppingForm from '../components/forms/ShoppingForm';
import RouteBadge from '../components/common/RouteBadge';
import TrasportoCard from '../components/cards/TrasportoCard';
import { useDeviceRole } from '../utils/useDeviceRole';

interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => void;
}

import { generateTripDays, getTripDateRange, type TripDayItem } from '../utils/tripDates';

export default function OggiView({ onNavigateTab }: OggiViewProps) {
  const { canEdit } = useDeviceRole();
  const [copilotPopoverActivity, setCopilotPopoverActivity] = useState<Attivita | null>(null);
  const [copilotPopoverText, setCopilotPopoverText] = useState('');
  const [isSavingCopilotNote, setIsSavingCopilotNote] = useState(false);

  const [tripDays, setTripDays] = useState<TripDayItem[]>(() => generateTripDays());
  const [selectedDate, setSelectedDate] = useState<string>('2026-11-28');
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [daysData, setDaysData] = useState<Giorno[]>([]);
  const [, setLoading] = useState(true);

  // Calcolo dinamico Countdown rispetto alla partenza reale
  const calculateCountdown = () => {
    const startDate = tripDays[0]?.dateStr || '2026-11-28';
    const target = new Date(`${startDate}T00:00:00`);
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
  const [tomorrowTimeline, setTomorrowTimeline] = useState<import('../types').TimelineItem[]>([]);
  const [dynamicCountries, setDynamicCountries] = useState<string>('Nuova Zelanda, Australia & Filippine');

  const calendarContainerRef = React.useRef<HTMLDivElement>(null);
  const selectedDayBtnRef = React.useRef<HTMLButtonElement>(null);
  const timelineItemRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Modali Dettaglio e Modifica
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null);
  const [editingActivityItem, setEditingActivityItem] = useState<Attivita | null>(null);
  const [editingTransportItem, setEditingTransportItem] = useState<Trasporto | null>(null);
  const [editingTappaItem, setEditingTappaItem] = useState<Tappa | null>(null);
  const [editingAlloggioItem, setEditingAlloggioItem] = useState<Alloggio | null>(null);
  const [editingRistoranteItem, setEditingRistoranteItem] = useState<Ristorante | null>(null);
  const [editingShoppingItem, setEditingShoppingItem] = useState<Shopping | null>(null);

  const scrollToCurrentEvent = useCallback(() => {
    if (!timeline || timeline.length === 0) return;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    let closestId = timeline[0]?.id;
    let minDiff = Infinity;

    timeline.forEach(item => {
      const timeStr = item.time || '12:00';
      const [h, m] = timeStr.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const itemMin = h * 60 + m;
        const diff = Math.abs(itemMin - currentMin);
        if (diff < minDiff) {
          minDiff = diff;
          closestId = item.id;
        }
      }
    });

    if (closestId && timelineItemRefs.current[closestId]) {
      timelineItemRefs.current[closestId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [timeline]);

  const getTomorrowDateStr = (dateStr: string): string => {
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const fetchTimeline = useCallback(async (dateToFetch?: string) => {
    const target = dateToFetch || selectedDate;
    const items = await storageService.getTimelineForDate(target);
    setTimeline(items);

    // Carica anche la timeline di domani
    const tomorrowStr = getTomorrowDateStr(target);
    if (tomorrowStr) {
      const tItems = await storageService.getTimelineForDate(tomorrowStr);
      setTomorrowTimeline(tItems);
    } else {
      setTomorrowTimeline([]);
    }
  }, [selectedDate]);

  // Auto-scroll cronologico alla tappa/evento più vicino all'orario attuale
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (selectedDate === todayStr || selectedDate === (tripDays[0]?.dateStr || '2026-11-29')) {
      const timer = setTimeout(() => {
        scrollToCurrentEvent();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, timeline, scrollToCurrentEvent, tripDays]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accs, days, range, transports, tappe] = await Promise.all([
        storageService.getAccommodations(),
        storageService.getDays(),
        getTripDateRange(),
        storageService.getTransports(),
        storageService.getTappe()
      ]);
      setAccommodations(accs);
      setDaysData(days);

      // Calcolo dinamico paesi visitati aggregando dai dati del DB
      const countrySet = new Set<string>();
      const detectCountry = (text?: string) => {
        if (!text) return;
        const lower = text.toLowerCase();
        if (lower.includes('zealand') || lower.includes('zelanda') || lower.includes('auckland') || lower.includes('rotorua') || lower.includes('queenstown') || lower.includes('christchurch') || lower.includes('wellington')) {
          countrySet.add('Nuova Zelanda');
        }
        if (lower.includes('australia') || lower.includes('sydney') || lower.includes('melbourne') || lower.includes('cairns') || lower.includes('brisbane')) {
          countrySet.add('Australia');
        }
        if (lower.includes('filippine') || lower.includes('philippines') || lower.includes('manila') || lower.includes('el nido') || lower.includes('coron') || lower.includes('boracay') || lower.includes('cebu')) {
          countrySet.add('Filippine');
        }
        if (lower.includes('cook') || lower.includes('rarotonga') || lower.includes('aitutaki')) {
          countrySet.add('Isole Cook');
        }
        if (lower.includes('italia') || lower.includes('italy') || lower.includes('milano') || lower.includes('roma')) {
          countrySet.add('Italia');
        }
      };

      transports.forEach(t => {
        detectCountry(t.departureLocation);
        detectCountry(t.arrivalLocation);
      });
      tappe.forEach(tp => {
        detectCountry(tp.titolo);
        detectCountry(tp.nota);
      });
      accs.forEach(a => {
        detectCountry(a.location);
        detectCountry(a.address);
      });
      days.forEach(d => {
        detectCountry(d.location);
        detectCountry(d.title);
      });

      if (countrySet.size > 0) {
        // Ordina mettendo Nuova Zelanda, Australia, Filippine prima se presenti
        const order = ['Nuova Zelanda', 'Australia', 'Filippine', 'Isole Cook', 'Italia'];
        const sorted = Array.from(countrySet).sort((a, b) => {
          const idxA = order.indexOf(a);
          const idxB = order.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
        setDynamicCountries(sorted.join(', '));
      } else {
        setDynamicCountries('Nuova Zelanda, Australia & Filippine');
      }

      const dynamicDays = range.tripDays;
      setTripDays(dynamicDays);

      // Se oggi ricade all'interno del viaggio, seleziona la data odierna al primissimo mount
      const todayStr = new Date().toISOString().split('T')[0];
      const isInTrip = dynamicDays.some((d) => d.dateStr === todayStr);
      setSelectedDate(prev => {
        if (isInTrip && (prev === '2026-11-28' || prev === '2026-11-29' || prev === dynamicDays[0]?.dateStr)) {
          return todayStr;
        }
        // Se la data precedente era il default o non è presente, imposta la prima data reale del viaggio
        if (prev === '2026-11-28' || prev === '2026-11-29' || !dynamicDays.some(d => d.dateStr === prev)) {
          return range.minTripDate;
        }
        return prev;
      });
    } catch (err) {
      console.error('Errore caricamento dati OggiView:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Centratura automatica del selettore orizzontale dei giorni su selectedDate
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedDayBtnRef.current && calendarContainerRef.current) {
        const container = calendarContainerRef.current;
        const btn = selectedDayBtnRef.current;
        const scrollPosition = btn.offsetLeft - (container.offsetWidth / 2) + (btn.offsetWidth / 2);
        container.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth'
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedDate, tripDays]);

  // Ascolta eventi globali di mutazione dati (roadbook_data_mutated) e aggiornamento attività
  useEffect(() => {
    const handleDataMutated = (e: Event) => {
      const customEvt = e as CustomEvent<{ entityType?: string; action?: string; data?: any }>;
      const targetDate = customEvt.detail?.data?.date || customEvt.detail?.data?.data;
      if (targetDate) {
        setSelectedDate(targetDate);
        fetchTimeline(targetDate);
      } else {
        fetchTimeline();
      }
      loadData();
    };

    const handleActivityUpdated = (e: Event) => {
      const customEvt = e as CustomEvent<{ date?: string; dayId?: string }>;
      if (customEvt.detail?.date) {
        setSelectedDate(customEvt.detail.date);
        fetchTimeline(customEvt.detail.date);
      } else {
        fetchTimeline();
      }
      loadData();
    };

    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    window.addEventListener('activity_updated', handleActivityUpdated);
    return () => {
      window.removeEventListener('roadbook_data_mutated', handleDataMutated);
      window.removeEventListener('activity_updated', handleActivityUpdated);
    };
  }, [fetchTimeline, loadData]);

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
    } else if (item.type === 'shopping') {
      setEditingShoppingItem(item.originalData as Shopping);
    }
  };

  const handleSaveActivity = async (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const activityToSave: Attivita = {
      ...data,
      id: data.id || editingActivityItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now()),
      createdAt: editingActivityItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveActivity(activityToSave);
    setEditingActivityItem(null);

    // Se l'attività è stata spostata su un altro giorno (es. dal 29 al 28), imposta automaticamente selectedDate sul nuovo giorno
    const matchedDay = daysData.find(d => d.id === activityToSave.dayId);
    const targetDate = activityToSave.date || matchedDay?.date || (activityToSave.dayId.startsWith('day_') ? activityToSave.dayId.replace('day_', '') : null);

    if (targetDate && targetDate !== selectedDate) {
      setSelectedDate(targetDate);
    }

    // Invia evento custom per notificare il sistema
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('activity_updated', {
        detail: { activity: activityToSave, date: targetDate, dayId: activityToSave.dayId }
      }));
    }

    await loadData();
    await fetchTimeline(targetDate || selectedDate);
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

  const handleSaveShopping = async (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const shoppingToSave: Shopping = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shopping_' + Date.now()),
      createdAt: editingShoppingItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveShopping(shoppingToSave);
    setEditingShoppingItem(null);
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
    <div className="space-y-4 pt-1 animate-fade-in pb-32 sm:pb-36">
      {/* 1. HEADER HERO / COPERTINA COMPATTA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-4 shadow-sm border border-slate-800">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-rose-300">
            <span>{calculateCountdown()}</span>
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
              {dynamicCountries}
            </h1>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              28 nov 2026 – 10 gen 2027 • 44 giorni di avventura
            </p>
          </div>

          {currentDayMeta && (
            <div className="pt-2 border-t border-white/10 space-y-0.5">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-semibold text-white">
                  Tappa {currentDayMeta.dayNum} di 43
                </span>
                <span>{formatDateHuman(selectedDate)}</span>
              </div>
              {currentDayData?.title && (
                <p className="text-[11px] text-rose-200 font-medium truncate">
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
            <label
              title="Scegli data dal calendario"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors border border-slate-200"
            >
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="sr-only"
              />
              <span className="text-sm">📅</span>
            </label>
            <span className="text-xs text-slate-400 font-medium">
              Giorno {currentDayMeta?.dayNum || '–'}
            </span>
          </div>
        </div>

        <div 
          ref={calendarContainerRef}
          className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-0.5 -mx-1 snap-x"
        >
          {tripDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;
            return (
              <button
                key={item.dateStr}
                ref={isSelected ? selectedDayBtnRef : undefined}
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
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const startDateStr = tripDays[0]?.dateStr || '2026-11-29';
                if (todayStr < startDateStr) {
                  return selectedDate === startDateStr ? 'Prima Tappa in Programma' : 'Itinerario Programmato';
                }
                return selectedDate === todayStr ? 'Programma di Oggi' : 'Itinerario del Giorno';
              })()}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {formatDateHuman(selectedDate)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={scrollToCurrentEvent}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full border border-indigo-200/80 transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="Ri-centra la schermata sull'evento più vicino all'orario attuale"
            >
              <span>🕒 Adesso</span>
            </button>
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
        </div>

        {/* Sequenza Unificata: timeline + eventuale alloggio notturno */}
        {(() => {
          // Prepara gli elementi di percorso sequenziali
          const dayItems: {
            id: string;
            type: 'trasporto' | 'tappa' | 'attivita' | 'ristorante' | 'alloggio' | 'shopping';
            time: string;
            title: string;
            location: string;
            departurePoint?: string;
            arrivalPoint?: string;
            coordinate?: import('../types').Coordinate;
            originalData?: any;
            copilota?: boolean;
            copilotNotes?: string;
          }[] = [];

          // Ordina rigorosamente per orario (HH:mm)
          const sortedTimeline = [...timeline].sort((a, b) => {
            const timeA = a.time || '12:00';
            const timeB = b.time || '12:00';
            return timeA.localeCompare(timeB);
          });

          sortedTimeline.forEach(item => {
            let departurePoint = item.location;
            let arrivalPoint = item.location;

            if (item.type === 'trasporto') {
              const tr = item.originalData as Trasporto;
              departurePoint = tr.departureLocation || item.location;
              arrivalPoint = tr.dropoffLocation || tr.arrivalLocation || item.location;
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
              copilota: item.copilota,
              copilotNotes: item.copilotNotes || (item.originalData as any)?.copilotNotes
            });
          });

          // Aggiungi alloggio notturno come ultima tappa fissa della sequenza se presente (evitando duplicazioni se già presente con stesso id)
          if (tonightsAccommodation) {
            const accLoc = tonightsAccommodation.address || tonightsAccommodation.location || tonightsAccommodation.name;
            const alreadyIn = dayItems.some(item => item.id === tonightsAccommodation.id || item.id === `lodging_${tonightsAccommodation.id}` || item.originalData?.id === tonightsAccommodation.id);
            if (!alreadyIn) {
              dayItems.push({
                id: `lodging_${tonightsAccommodation.id}`,
                type: 'alloggio',
                time: tonightsAccommodation.checkInTime || '21:00',
                title: tonightsAccommodation.name,
                location: accLoc,
                departurePoint: accLoc,
                arrivalPoint: accLoc,
                coordinate: tonightsAccommodation.coordinate,
                originalData: tonightsAccommodation,
                copilota: tonightsAccommodation.copilota
              });
            }
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
            <div className="space-y-3">
              {dayItems.map((item, idx) => {
                const nextItem = dayItems[idx + 1];

                // Punti di routing punto-a-punto verso il prossimo elemento
                // DALL'ARRIVO di questo elemento -> ALLA PARTENZA del prossimo
                const fromLoc = item.arrivalPoint || item.location;
                const toLoc = nextItem ? (nextItem.departurePoint || nextItem.location) : '';
                const fromCoord = item.coordinate;
                const toCoord = nextItem ? nextItem.coordinate : undefined;

                const isLodging = item.type === 'alloggio';
                const isTransport = item.type === 'trasporto';
                const isTappa = item.type === 'tappa';
                const isRistorante = item.type === 'ristorante';
                const isShopping = item.type === 'shopping';

                return (
                  <div key={`${item.id}-${idx}`} ref={(el) => { timelineItemRefs.current[item.id] = el; }}>
                    {/* CARD DELL'ELEMENTO NELLA SEQUENZA */}
                    {isTransport ? (
                      /* Card Biglietto di Viaggio / Boarding Pass per i Trasporti */
                      <TrasportoCard
                        transport={item.originalData as Trasporto}
                        onEdit={() => setEditingTransportItem(item.originalData as Trasporto)}
                        onDelete={async () => {
                          await storageService.deleteTransport(item.id);
                          await fetchTimeline();
                        }}
                        onUpdate={() => fetchTimeline()}
                      />
                    ) : isLodging ? (
                      /* Hotel Pass / Voucher Ultra-Compatto */
                      <div className="bg-white rounded-2xl border border-indigo-100 p-3 shadow-xs hover:shadow-sm transition-all">
                        {/* Header a riga singola */}
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-50/80">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center text-xs shrink-0">
                              🛏️
                            </span>
                            <span className="text-xs font-bold text-slate-800 tracking-tight truncate">
                              Pernottamento
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0">
                              • {formatDateHuman(selectedDate)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100/70">
                              Check-in {tonightsAccommodation?.checkInTime || '14:00'}
                            </span>
                            {onNavigateTab && (
                              <button
                                type="button"
                                onClick={() => onNavigateTab('categorie', 'alloggi')}
                                className="text-[11px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer ml-0.5"
                                title="Visualizza tutti gli alloggi"
                              >
                                Alloggi ↗
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Corpo Centrale Compatto: Flex Orizzontale */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-semibold text-slate-800 leading-snug truncate">
                                {tonightsAccommodation?.name}
                              </h3>
                              {tonightsAccommodation?.copilota && (
                                <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200 shrink-0">
                                  🧭 Co-pilota
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5 flex items-center gap-1">
                              <span className="text-slate-400">📍</span>
                              <span className="truncate">
                                {tonightsAccommodation?.address || tonightsAccommodation?.location || 'Indirizzo registrato'}
                              </span>
                            </p>
                          </div>

                          {/* Pulsante pillola compatta Maps sulla stessa riga a destra */}
                          {(tonightsAccommodation?.address || tonightsAccommodation?.location) && (
                            <a
                              href={resolveMapUrl(tonightsAccommodation.address || tonightsAccommodation.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors active:scale-95 border border-indigo-100"
                            >
                              <span>📍 Maps ↗</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Card Normale di Itinerario: Tappa, Attività, Ristorante, Shopping */
                      <div
                        onClick={() => {
                          const found = timeline.find(t => t.id === item.id);
                          if (found) setDetailItem(found);
                        }}
                        className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs ${
                              isTappa ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                              isRistorante ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              isShopping ? 'bg-pink-50 text-pink-700 border border-pink-100' :
                              'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {isTappa ? '📍' : isRistorante ? '🍽️' : isShopping ? '🛍️' : '🌿'}
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg shrink-0">
                              {item.time}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {isTappa ? 'Tappa' : isRistorante ? 'Ristorante' : isShopping ? 'Shopping' : 'Attività'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Icona Co-pilota compatta circolare [ 🧭 ] interattiva */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.type === 'attivita' && item.originalData) {
                                  setCopilotPopoverActivity(item.originalData as Attivita);
                                  setCopilotPopoverText((item.originalData as Attivita).copilotNotes || '');
                                } else {
                                  // Per altri tipi, se ha copilota apri dettaglio
                                  const found = timeline.find(t => t.id === item.id);
                                  if (found) setDetailItem(found);
                                }
                              }}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer shrink-0 active:scale-90 ${
                                Boolean(item.copilotNotes?.trim() || (item.originalData as any)?.copilotNotes?.trim())
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400 shadow-2xs'
                                  : 'bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                              }`}
                              title={Boolean(item.copilotNotes?.trim() || (item.originalData as any)?.copilotNotes?.trim()) ? 'Note Co-pilota presenti' : 'Co-pilota'}
                            >
                              🧭
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const found = timeline.find(t => t.id === item.id);
                                if (found) setDetailItem(found);
                              }}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                              title="Dettagli e Modifica"
                            >
                              ℹ️
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <p className="text-xs text-slate-500 font-medium truncate">
                              📍 {item.location}
                            </p>
                            {item.location && (
                              <a
                                href={resolveMapUrl(item.location)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-xl transition-colors shrink-0 border border-sky-100 shadow-2xs"
                              >
                                <span>Maps</span>
                                <svg className="w-3 h-3 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
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
                  </div>
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

      {/* 4. RIQUADRO RAPIDO "EMERGENZE" -> Naviga direttamente ad AssicurazioneView */}
      <div 
        onClick={() => {
          if (onNavigateTab) {
            onNavigateTab('altro', undefined, 'assicurazione');
          }
          window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'assicurazione' } }));
        }}
        className="bg-white rounded-3xl border border-rose-200/80 p-4 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-rose-300 hover:shadow-md transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-base font-bold shrink-0 shadow-2xs border border-rose-100">
            ⚠️
          </span>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight">
              Numeri di Emergenza
            </h3>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              NZ 111 • AU 000 • PH 911 • Polizza Sanitaria H24
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateTab) {
              onNavigateTab('altro', undefined, 'assicurazione');
            }
            window.dispatchEvent(new CustomEvent('navigate_subview', { detail: { subView: 'assicurazione' } }));
          }}
          className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all shrink-0 cursor-pointer active:scale-95 border border-rose-200/60 shadow-2xs"
        >
          Apri ➔
        </button>
      </div>

      {/* 5. SEZIONE "COSA FARAI DOMANI" (GIORNO SUCCESSIVO) CON CAROSELLO A SCORRIMENTO ORIZZONTALE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold shadow-2xs border border-blue-100">
              🌅
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Cosa farai domani
              </h2>
              {nextDayMeta && (
                <p className="text-[11px] text-slate-500 font-medium">
                  {formatDateHuman(nextDayMeta.dateStr)} • Tappa {nextDayMeta.dayNum}
                </p>
              )}
            </div>
          </div>
          {nextDayMeta && (
            <button
              type="button"
              onClick={() => setSelectedDate(nextDayMeta.dateStr)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100"
            >
              Vedi giornata ➔
            </button>
          )}
        </div>

        {/* Carosello orizzontale eventi di domani */}
        {tomorrowTimeline && tomorrowTimeline.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto snap-x no-scrollbar pb-2 pt-1">
            {tomorrowTimeline.map((item, idx) => {
              const isLodging = item.type === 'alloggio';
              const isTransport = item.type === 'trasporto';
              const isTappa = item.type === 'tappa';
              const isRistorante = item.type === 'ristorante';
              const isShopping = item.type === 'shopping';

              const icon = isLodging ? '🛏️' : isTransport ? '✈️' : isTappa ? '📍' : isRistorante ? '🍽️' : isShopping ? '🛍️' : '🌿';
              const badgeBg = isLodging ? 'bg-purple-50 text-purple-700 border-purple-100' :
                              isTransport ? 'bg-sky-50 text-sky-700 border-sky-100' :
                              isTappa ? 'bg-rose-50 text-rose-700 border-rose-100' :
                              isRistorante ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              isShopping ? 'bg-pink-50 text-pink-700 border-pink-100' :
                              'bg-amber-50 text-amber-700 border-amber-100';

              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => {
                    if (nextDayMeta) setSelectedDate(nextDayMeta.dateStr);
                  }}
                  className="min-w-[200px] max-w-[240px] bg-white rounded-xl p-3 border border-slate-200/80 shadow-sm shrink-0 snap-start flex flex-col justify-between hover:border-slate-300 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold border ${badgeBg}`}>
                        {icon}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                        {item.time || '12:00'}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                      {item.title}
                    </h4>
                  </div>
                  {item.location && (
                    <p className="text-[11px] text-slate-500 font-medium truncate mt-2">
                      📍 {item.location}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-600">
              Nessuna attività programmata per domani
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {nextDayData?.title
                ? nextDayData.title
                : nextDayAccommodation 
                ? `Pernottamento previsto presso ${nextDayAccommodation.name}.` 
                : 'Giornata libera o da pianificare.'}
            </p>
          </div>
        )}
      </div>

      {/* Spacer invisibile a fine pagina per consentire di scrollare l'ultima card interamente sopra la dock */}
      <div className="h-36 w-full shrink-0" aria-hidden="true" />

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

      {/* Modale Form Shopping */}
      <Modal
        isOpen={Boolean(editingShoppingItem)}
        onClose={() => setEditingShoppingItem(null)}
        title="Modifica Shopping"
        accentVariant="rose"
      >
        <ShoppingForm
          initialData={editingShoppingItem}
          onSave={handleSaveShopping}
          onCancel={() => setEditingShoppingItem(null)}
        />
      </Modal>

      {/* Popover / Modale Note del Co-pilota (Stile iOS con modifica diretta) */}
      {copilotPopoverActivity && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setCopilotPopoverActivity(null);
          }}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-emerald-200/80 animate-scale-up space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-bold">
                  🧭
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    Note Co-pilota • {copilotPopoverActivity.title}
                  </h3>
                  <p className="text-[10px] text-emerald-700 font-semibold truncate max-w-[190px]">
                    Promemoria e raccomandazioni
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopilotPopoverActivity(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Area di testo per lettura / modifica immediata */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600">
                {canEdit ? 'Note & Suggerimenti di viaggio:' : 'Note consultabili:'}
              </label>
              {canEdit ? (
                <textarea
                  rows={4}
                  value={copilotPopoverText}
                  onChange={(e) => setCopilotPopoverText(e.target.value)}
                  placeholder="Inserisci note, consigli parcheggio, orari migliori, promemoria per la guida..."
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 p-3 text-xs text-slate-800 leading-relaxed outline-none transition-all resize-none"
                />
              ) : (
                <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-xs text-slate-700 leading-relaxed font-medium min-h-[80px]">
                  {copilotPopoverActivity.copilotNotes?.trim() ? (
                    copilotPopoverActivity.copilotNotes
                  ) : (
                    <p className="text-slate-400 italic">
                      Nessuna raccomandazione inserita.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCopilotPopoverActivity(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Chiudi
              </button>
              {canEdit && (
                <button
                  type="button"
                  disabled={isSavingCopilotNote}
                  onClick={async () => {
                    try {
                      setIsSavingCopilotNote(true);
                      const updated: Attivita = {
                        ...copilotPopoverActivity,
                        copilotNotes: copilotPopoverText.trim(),
                        copilota: Boolean(copilotPopoverText.trim()) || copilotPopoverActivity.copilota,
                        updatedAt: Date.now()
                      };
                      await storageService.saveActivity(updated);
                      await fetchTimeline();
                      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
                        detail: { entityType: 'activity', action: 'update', data: updated }
                      }));
                      setCopilotPopoverActivity(null);
                    } catch (err) {
                      console.error('Errore salvataggio nota copilota:', err);
                    } finally {
                      setIsSavingCopilotNote(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingCopilotNote ? 'Salvataggio...' : 'Salva Nota'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
