import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SectionTab, CategoriaTab, Alloggio, Giorno, TimelineItem, Attivita, Trasporto, Tappa, Ristorante, Shopping } from '../types';
import { storageService } from '../storage/storageService';
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
import AttivitaCard from '../components/cards/AttivitaCard';
import AlloggioCard from '../components/cards/AlloggioCard';
import RistoranteCard from '../components/cards/RistoranteCard';
import TappaCard from '../components/cards/TappaCard';
import ShoppingCard from '../components/cards/ShoppingCard';
import DayMapsCard from '../components/cards/DayMapsCard';
import PreDeparturePhotoCard from '../components/cards/PreDeparturePhotoCard';
import type { DayMapsRoutes } from '../types';
import InTransitBanner from '../components/common/InTransitBanner';
import UniversalCopilotaModal from '../components/modals/UniversalCopilotaModal';
import TimeCollisionModal, { type TimeCollision } from '../components/modals/TimeCollisionModal';
import { useDeviceRole } from '../utils/useDeviceRole';
import { formatDateIT } from '../utils/tripDates';


interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => void;
}

import { generateTripDays, getTripDateRange, type TripDayItem } from '../utils/tripDates';
import { getTripConfig } from '../utils/tripConfig';

const TRIP_START_DATE = '2026-11-28';
const TRIP_END_DATE = '2027-01-10';

function getDefaultSelectedDate(startDate?: string, endDate?: string, tripId?: string): string {
  const isMasterTrip = !tripId || tripId === '0000';
  const todayStr = new Date().toISOString().split('T')[0];
  const start = startDate || (isMasterTrip ? TRIP_START_DATE : todayStr);
  const end = endDate || (isMasterTrip ? TRIP_END_DATE : start);
  if (todayStr >= start && todayStr <= end) return todayStr;
  return start;
}

export default function OggiView({ onNavigateTab }: OggiViewProps) {
  const { canEdit } = useDeviceRole();
  const tripConfig = getTripConfig();
  const isMasterTrip = !tripConfig || tripConfig.id === '0000';
  const tripId = tripConfig?.id || '0000';

  const [copilotPopoverActivity, setCopilotPopoverActivity] = useState<Attivita | null>(null);
  const [copilotPopoverText, setCopilotPopoverText] = useState('');
  const [isSavingCopilotNote, setIsSavingCopilotNote] = useState(false);
  const [isGlobalCopilotOpen, setIsGlobalCopilotOpen] = useState(false);
  const [globalCopilotNoteStr, setGlobalCopilotNoteStr] = useState('');
  const [globalCopilotNoteId, setGlobalCopilotNoteId] = useState<string | null>(null);

  const [tripDays, setTripDays] = useState<TripDayItem[]>(() => generateTripDays());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getDefaultSelectedDate(tripConfig?.startDate, tripConfig?.endDate, tripConfig?.id);
  });
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [daysData, setDaysData] = useState<Giorno[]>([]);
  const [, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [bookingCodeCopied, setBookingCodeCopied] = useState(false);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Calcolo dinamico Countdown rispetto alla partenza reale
  const calculateCountdown = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = tripConfig?.startDate || tripDays[0]?.dateStr || (isMasterTrip ? '2026-11-28' : todayStr);
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
      const endDateStr = tripConfig?.endDate || (isMasterTrip ? '2027-01-10' : startDate);
      const end = new Date(`${endDateStr}T23:59:59`);
      if (now <= end) {
        return '✨ Viaggio in corso!';
      }
      return '💍 Viaggio indimenticabile';
    }
  };

  const [timeline, setTimeline] = useState<import('../types').TimelineItem[]>([]);
  const [tomorrowTimeline, setTomorrowTimeline] = useState<import('../types').TimelineItem[]>([]);
  const [dynamicCountries, setDynamicCountries] = useState<string>(tripConfig?.title || 'Il mio Viaggio');
  const [heroBgImage, setHeroBgImage] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      if (tripConfig?.headerImageUrl) return tripConfig.headerImageUrl;
      if (isMasterTrip) {
        return localStorage.getItem('trip_header_image') || localStorage.getItem('hero_bg_image') || null;
      }
      return localStorage.getItem(`hero_bg_image_${tripId}`) || null;
    }
    return null;
  });
  const [isHeroEditOpen, setIsHeroEditOpen] = useState(false);
  const [heroEditTitle, setHeroEditTitle] = useState('');
  const [heroTitleMode, setHeroTitleMode] = useState<'custom' | 'auto'>('custom');
  const heroBgInputRef = useRef<HTMLInputElement>(null);

  const [dayMapsRoutes, setDayMapsRoutes] = useState<DayMapsRoutes>({});

  // Quick-expense modal (rapido da OggiView)
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  const [quickExpenseTitle, setQuickExpenseTitle] = useState('');
  const [quickExpenseAmount, setQuickExpenseAmount] = useState('');
  const [quickExpenseCurrency, setQuickExpenseCurrency] = useState<'EUR'|'NZD'|'AUD'|'PHP'>('EUR');
  const [quickExpenseSaving, setQuickExpenseSaving] = useState(false);

  // Tasso di cambio approssimativo per preview live (NZD base aggiornato)
  const QUICK_RATES: Record<string, number> = { EUR: 1, NZD: 1.74, AUD: 1.62, PHP: 61.5 };
  const quickAmountNum = parseFloat(quickExpenseAmount) || 0;
  const quickEur = quickExpenseCurrency === 'EUR' ? quickAmountNum : quickAmountNum / QUICK_RATES[quickExpenseCurrency];

  const handleSaveQuickExpense = async () => {
    if (!quickExpenseTitle.trim() || !quickExpenseAmount) return;
    setQuickExpenseSaving(true);
    try {
      const now = new Date();
      const id = `spesa_quick_${now.getTime()}`;
      await storageService.saveSpesa({
        id,
        title: quickExpenseTitle.trim(),
        amount: parseFloat(quickEur.toFixed(2)),
        category: 'altro',
        status: 'saldato',
        date: now.toISOString().split('T')[0],
        notes: quickExpenseCurrency !== 'EUR' ? `${quickAmountNum} ${quickExpenseCurrency}` : undefined
      });
      setQuickExpenseTitle('');
      setQuickExpenseAmount('');
      setQuickExpenseCurrency('EUR');
      setIsQuickExpenseOpen(false);
    } finally {
      setQuickExpenseSaving(false);
    }
  };

  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const selectedDayBtnRef = useRef<HTMLButtonElement>(null);
  const timelineItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Modali Dettaglio e Modifica
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null);
  const [editingActivityItem, setEditingActivityItem] = useState<Attivita | null>(null);
  const [editingTransportItem, setEditingTransportItem] = useState<Trasporto | null>(null);
  const [editingTappaItem, setEditingTappaItem] = useState<Tappa | null>(null);
  const [editingAlloggioItem, setEditingAlloggioItem] = useState<Alloggio | null>(null);
  const [editingRistoranteItem, setEditingRistoranteItem] = useState<Ristorante | null>(null);
  const [editingShoppingItem, setEditingShoppingItem] = useState<Shopping | null>(null);
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const showFeedbackBanner = useCallback((msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => {
      setFeedbackBanner(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

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
    
    // --- FILTRO RIGIDO DEDUPLICAZIONE ---
    const filteredItems = [];
    for (const item of items) {
      if (item.type === 'trasporto' && item.originalData) {
        const t = item.originalData as import('../types').Trasporto;
        
        // CANCELLAZIONE ***REMOVED*** E SCARTO TRENO 28/11
        if (t.date === '2026-11-28' && t.type === 'treno') {
          if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || t.departureTime === '00:00') {
             await storageService.deleteTransport(t.id);
             continue; // SCARTA
          }
        }
        
        // CANCELLAZIONE ***REMOVED*** E SCARTO VOLO CUMULATIVO 29/11 - 01/12
        if (t.type === 'volo' && (t.date === '2026-11-29' || t.date === '2026-12-01')) {
          if (t.carrier && (t.carrier.includes('(CA950 + CA783)') || t.carrier.includes('CA950 + CA783'))) {
             await storageService.deleteTransport(t.id);
             continue; // SCARTA
          }
        }
      }
      filteredItems.push(item);
    }
    
    setTimeline(filteredItems);

    // Rilevamento collisioni orarie (2 o più eventi allo stesso orario non fittizio)
    try {
      const byTime: { [time: string]: TimelineItem[] } = {};
      filteredItems.forEach(item => {
        if (!item.time || item.time === '00:00' || item.time === '12:00' && item.type === 'tappa') return;
        // Non considerare segmenti di transito o arrivo collegati dello stesso volo
        if (item.id.endsWith('_arrival') || item.id.endsWith('_state')) return;
        if (!byTime[item.time]) byTime[item.time] = [];
        byTime[item.time].push(item);
      });

      let foundCollision: TimeCollision | null = null;
      for (const [tStr, tList] of Object.entries(byTime)) {
        if (tList.length > 1) {
          // Filtra coppie note: stesso id base, alloggio su più giorni, o segmenti dello stesso volo
          const first = tList[0];
          const second = tList[1];
          if (first.id === second.id) continue;
          if (first.originalData?.id && first.originalData.id === second.originalData?.id) continue;
          
          // Se entrambi sono segmenti dello stesso itinerario di volo (es. CA950 e CA783)
          if (first.type === 'trasporto' && second.type === 'trasporto') {
            const tr1 = first.originalData as Trasporto;
            const tr2 = second.originalData as Trasporto;
            if (tr1.bookingCode && tr2.bookingCode && tr1.bookingCode === tr2.bookingCode) {
              continue; // stesso PNR / codice prenotazione legittima
            }
          }

          const collisionKey = `collision_dismissed_${first.id}_${second.id}`;
          const isDismissed = (typeof localStorage !== 'undefined' && localStorage.getItem(collisionKey)) ||
                              (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey));
          if (!isDismissed) {
            foundCollision = {
              id: collisionKey,
              time: tStr,
              itemA: first,
              itemB: second
            };
            break;
          }
        }
      }
      setActiveCollision(foundCollision);
    } catch (collErr) {
      console.warn('[OggiView] Collision check error:', collErr);
    }
    
    // Day maps routes (Auto & Piedi con retrocompatibilità)
    const routes = await storageService.getDayMapsRoutes(target);
    setDayMapsRoutes(routes);

    // Carica anche la timeline di domani
    const tomorrowStr = getTomorrowDateStr(target);
    if (tomorrowStr) {
      const tItems = await storageService.getTimelineForDate(tomorrowStr);
      // Filtriamo voli/trasporti che arrivano a mezzanotte esatta (00:00) dal giorno precedente
      const filteredTItems = tItems.filter(item => !(item.type === 'trasporto' && item.time === '00:00'));
      setTomorrowTimeline(filteredTItems);
    } else {
      setTomorrowTimeline([]);
    }
  }, [selectedDate]);

  const hasInitialScrolledRef = useRef<string | null>(null);

  // Auto-scroll cronologico alla tappa/evento più vicino all'orario attuale solo al cambio data iniziale
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (selectedDate === todayStr || selectedDate === (tripDays[0]?.dateStr || '2026-11-29')) {
      if (hasInitialScrolledRef.current !== selectedDate && timeline.length > 0) {
        hasInitialScrolledRef.current = selectedDate;
        const timer = setTimeout(() => {
          scrollToCurrentEvent();
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedDate, timeline.length, scrollToCurrentEvent, tripDays]);

  const fetchGlobalCopilotNote = useCallback(async () => {
    try {
      const allNotes = await storageService.getNote();
      const dailyNote = allNotes.find(n => n.id === 'copilota_' + selectedDate && n.title === 'Note Copilota di Giornata');
      if (dailyNote) {
        setGlobalCopilotNoteId(dailyNote.id);
        setGlobalCopilotNoteStr(dailyNote.content || '');
      } else {
        setGlobalCopilotNoteId(null);
        setGlobalCopilotNoteStr('');
      }
    } catch (err) {}
  }, [selectedDate]);

  const loadData = useCallback(async (isInitial = false) => {
    fetchGlobalCopilotNote();
    try {
      if (isInitial && daysData.length === 0) {
        setLoading(true);
      }
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getAccommodations(),
        storageService.getDays(),
        getTripDateRange(),
        storageService.getTransports(),
        storageService.getTappe(),
        storageService.getSetting('hero_custom_title'),
        storageService.getSetting('trip_header_image').then(v => v || storageService.getSetting('hero_bg_image')),
        storageService.getSetting('hero_title_mode')
      ]);

      const [accs, days, range, transports, tappe, heroTitle, heroBg, heroMode] = await Promise.race([dataPromise, timeoutPromise]) as [Alloggio[], Giorno[], any, Trasporto[], Tappa[], string | null, string | null, string | null];

      if (heroTitle) setDynamicCountries(heroTitle);
      if (heroBg) {
        setHeroBgImage(heroBg);
        if (typeof localStorage !== 'undefined') {
          if (isMasterTrip) {
            localStorage.setItem('trip_header_image', heroBg);
            localStorage.setItem('hero_bg_image', heroBg);
          } else {
            localStorage.setItem(`hero_bg_image_${tripId}`, heroBg);
          }
        }
      }
      if (heroMode) setHeroTitleMode(heroMode as 'custom' | 'auto');

      setAccommodations(accs || []);
      setDaysData(days || []);

      // Calcolo dinamico paesi visitati: eseguito ESCLUSIVAMENTE per il viaggio storico Nuova Zelanda (0000)
      if (isMasterTrip) {
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
          setDynamicCountries(tripConfig?.title || 'Viaggio Originale');
        }
      } else {
        // Qualunque nuovo viaggio mostra ESCLUSIVAMENTE il proprio titolo configurato
        setDynamicCountries(tripConfig?.title || 'Il mio Viaggio');
      }

      const dynamicDays = range?.tripDays || [];
      setTripDays(dynamicDays);

      // Data selezionata: per 0000 usa periodo storico, per altri viaggi usa le date del viaggio o oggi
      const todayStr = new Date().toISOString().split('T')[0];
      const configStartDate = tripConfig?.startDate || (isMasterTrip ? '2026-11-28' : todayStr);
      const configEndDate = tripConfig?.endDate || (isMasterTrip ? '2027-01-10' : configStartDate);
      
      const forcedDate = getDefaultSelectedDate(configStartDate, configEndDate, tripConfig?.id);
      
      setSelectedDate(prev => {
        if (prev && dynamicDays.some((d: { dateStr: string }) => d.dateStr === prev)) {
          return prev;
        }
        return forcedDate;
      });
      console.log("Data selezionata:", selectedDate || forcedDate, "Start date:", configStartDate, "Today:", todayStr);
    } catch (err) {
      console.error('Errore caricamento dati OggiView:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
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
      const customEvt = e as CustomEvent<{ entityType?: string; action?: string; data?: any; source?: string }>;
      const targetDate = customEvt.detail?.data?.date || customEvt.detail?.data?.data;
      const isCloud = customEvt.detail?.source === 'cloud';
      
      // Ricarichiamo la timeline e i dati senza mostrare schermate di caricamento
      if (targetDate && !isCloud) {
        fetchTimeline();
      } else {
        fetchTimeline();
      }
      loadData(false);
    };

    const handleActivityUpdated = () => {
      fetchTimeline();
      loadData(false);
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

  const handleDeleteActivityFromForm = async () => {
    if (!editingActivityItem) return;
    await storageService.deleteActivity(editingActivityItem.id);
    setEditingActivityItem(null);
    await loadData();
    await fetchTimeline(selectedDate);
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
      id: data.id || editingTransportItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'trans_' + Date.now()),
      createdAt: editingTransportItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTransport(transportToSave);
    setEditingTransportItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'save_transport', item: transportToSave }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Trasporto aggiornato con successo ✓');
  };

  const handleDeleteTransportFromForm = async () => {
    if (!editingTransportItem) return;
    await storageService.deleteTransport(editingTransportItem.id);
    setEditingTransportItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'delete_transport' }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Trasporto eliminato ✓');
  };

  const handleDeleteTappaFromForm = async () => {
    if (!editingTappaItem) return;
    await storageService.deleteTappa(editingTappaItem.id);
    setEditingTappaItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'delete_tappa' }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Tappa eliminata ✓');
  };

  const handleSaveTappa = async (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const cleanDate = data.data ? data.data.trim().split('T')[0] : '';
    const tappaId = data.id || editingTappaItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tappa_' + Date.now());
    const tappaToSave: Tappa = {
      ...data,
      data: cleanDate || data.data,
      id: tappaId,
      createdAt: editingTappaItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTappa(tappaToSave);
    setEditingTappaItem(null);

    // Se la tappa è stata spostata su un'altra data, allinea la vista
    if (cleanDate && cleanDate !== selectedDate) {
      setSelectedDate(cleanDate);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'save_tappa', item: tappaToSave }
      }));
      window.dispatchEvent(new CustomEvent('tappa_updated', {
        detail: { tappa: tappaToSave, date: cleanDate }
      }));
    }

    await loadData(false);
    await fetchTimeline(cleanDate || selectedDate);
    showFeedbackBanner('Tappa aggiornata con successo ✓');
  };

  const handleSaveAlloggio = async (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const alloggioToSave: Alloggio = {
      ...data,
      id: data.id || editingAlloggioItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now()),
      createdAt: editingAlloggioItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveAccommodation(alloggioToSave);
    setEditingAlloggioItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'save_alloggio', item: alloggioToSave }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Alloggio aggiornato con successo ✓');
  };

  const handleDeleteAlloggioFromForm = async () => {
    if (!editingAlloggioItem) return;
    await storageService.deleteAccommodation(editingAlloggioItem.id);
    setEditingAlloggioItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'delete_alloggio' }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Alloggio eliminato ✓');
  };

  const handleSaveRistorante = async (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const ristoranteToSave: Ristorante = {
      ...data,
      id: data.id || editingRistoranteItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rist_' + Date.now()),
      createdAt: editingRistoranteItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveRistorante(ristoranteToSave);
    setEditingRistoranteItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'save_ristorante', item: ristoranteToSave }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Ristorante aggiornato con successo ✓');
  };

  const handleSaveShopping = async (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const shoppingToSave: Shopping = {
      ...data,
      id: data.id || editingShoppingItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shopping_' + Date.now()),
      createdAt: editingShoppingItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveShopping(shoppingToSave);
    setEditingShoppingItem(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { action: 'save_shopping', item: shoppingToSave }
      }));
    }
    await loadData(false);
    await fetchTimeline(selectedDate);
    showFeedbackBanner('Shopping aggiornato con successo ✓');
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
    return formatDateIT(dateStr);
  };

  // --- Hero customization handlers ---
  const handleOpenHeroEdit = () => {
    setHeroEditTitle(dynamicCountries);
    setIsHeroEditOpen(true);
  };

  const handleSaveHeroTitle = () => {
    const title = heroTitleMode === 'auto'
      ? tripDays.map(d => {
          const dd = daysData.find(x => x.date === d.dateStr);
          return dd?.location || dd?.title || '';
        }).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join(', ')
      : heroEditTitle;
    setDynamicCountries(title || heroEditTitle);
    localStorage.setItem('hero_custom_title', title || heroEditTitle);
    localStorage.setItem('hero_title_mode', heroTitleMode);
    setIsHeroEditOpen(false);
  };

  const handleHeroBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800; // max dimension

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Compress as JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setHeroBgImage(dataUrl);
          if (typeof localStorage !== 'undefined') {
            if (isMasterTrip) {
              localStorage.setItem('trip_header_image', dataUrl);
              localStorage.setItem('hero_bg_image', dataUrl);
            } else {
              localStorage.setItem(`hero_bg_image_${tripId}`, dataUrl);
            }
          }
          storageService.saveSetting('trip_header_image', dataUrl);
          storageService.saveSetting('hero_bg_image', dataUrl);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveHeroBg = () => {
    setHeroBgImage(null);
    if (typeof localStorage !== 'undefined') {
      if (isMasterTrip) {
        localStorage.removeItem('trip_header_image');
        localStorage.removeItem('hero_bg_image');
      } else {
        localStorage.removeItem(`hero_bg_image_${tripId}`);
      }
    }
    storageService.saveSetting('trip_header_image', null);
    storageService.saveSetting('hero_bg_image', null);
  };

  // ─── LIVELLO 1: Calcolo prossimo evento focale / Prossimo Passo ───
  const nextEventItem = useMemo(() => {
    if (!timeline || timeline.length === 0) return null;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isToday = selectedDate === todayStr;

    if (isToday) {
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const upcoming = timeline.find(item => {
        if (!item.time || item.time === '00:00' || (item.time === '12:00' && item.type === 'tappa')) return false;
        const [h, m] = item.time.split(':').map(Number);
        if (isNaN(h)) return false;
        return (h * 60 + (m || 0)) >= currentMin;
      });
      if (upcoming) return upcoming;
    }

    const firstWithTime = timeline.find(item => item.time && item.time !== '00:00' && item.type !== 'tappa');
    return firstWithTime || timeline[0] || null;
  }, [timeline, selectedDate]);

  const nextEventBookingCode = useMemo(() => {
    if (!nextEventItem?.originalData) return null;
    const orig = nextEventItem.originalData as any;
    return orig.bookingCode || orig.codicePrenotazione || orig.pnr || orig.conferma || orig.bookingReference || null;
  }, [nextEventItem]);

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-20 sm:pb-24">
      {/* Toast Feedback Operazioni */}
      {feedbackBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-bounce-subtle pointer-events-none">
          <div className="px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs shadow-xl shadow-emerald-600/30 flex items-center gap-2 border border-emerald-400/40">
            <span>✓</span>
            <span>{feedbackBanner}</span>
          </div>
        </div>
      )}

      {/* ─── LIVELLO 1: MASTHEAD EDITORIALE CARTOGRAFICO & FOCUS IMMEDIATO ─── */}
      <div className="space-y-3">
        {/* Masthead Editoriale / Diario di Bordo */}
        <div
          className={`relative overflow-hidden rounded-2xl border transition-all ${
            heroBgImage
              ? 'text-white border-white/10 shadow-md'
              : 'bg-white dark:bg-[#172033] border-slate-200/90 dark:border-slate-800 text-[#172033] dark:text-white shadow-xs'
          }`}
          style={heroBgImage
            ? { backgroundImage: `url(${heroBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : {}}
        >
          {heroBgImage && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[0.5px]" />
          )}

          <div className="relative z-10 p-4 sm:p-5 space-y-3">
            {/* Riga 1: Kicker Cartografico & Status */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest ${heroBgImage ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                  {currentDayMeta && currentDayMeta.dayNum > 0
                    ? `GIORNO ${currentDayMeta.dayNum} DI ${tripDays.length} • ${formatDateHuman(selectedDate).toUpperCase()}`
                    : `PRE-VIAGGIO • ${formatDateHuman(selectedDate).toUpperCase()}`}
                </span>
                
                {/* Indicatore Stato: Viaggio Futuro vs In Corso vs Offline */}
                {(() => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const startDateStr = tripDays[0]?.dateStr || '2026-11-28';
                  const isFuture = todayStr < startDateStr;
                  const isToday = selectedDate === todayStr;

                  if (isToday) {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        OGGI IN CORSO
                      </span>
                    );
                  }
                  if (isFuture) {
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                        heroBgImage ? 'bg-white/20 text-white' : 'bg-[#FFF0ED] text-[#FF6B5F] dark:bg-rose-950/40 dark:text-rose-300 border border-[#FF6B5F]/20'
                      }`}>
                        {calculateCountdown()}
                      </span>
                    );
                  }
                  return null;
                })()}

                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    OFFLINE • ROADBOOK LOCALE
                  </span>
                )}
              </div>

              {/* Azioni Header: Modifica copertina */}
              {canEdit && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleOpenHeroEdit}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                      heroBgImage
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700'
                    }`}
                    title="Personalizza titolo o sfondo"
                  >
                    <span>✏️</span>
                    <span className="hidden sm:inline">Modifica copertina</span>
                  </button>
                </div>
              )}
            </div>

            {/* Riga 2: Destinazione Principale & Riferimento Cartografico */}
            <div>
              <h1 className={`text-xl sm:text-2xl font-black font-brand-title tracking-tight leading-tight ${
                heroBgImage ? 'text-white' : 'text-[#172033] dark:text-white'
              }`}>
                {currentDayData?.title || dynamicCountries || 'Diario di Viaggio'}
              </h1>
              
              <div className="flex items-center gap-3 mt-1 text-xs">
                {currentDayData?.location && (
                  <span className={`font-semibold flex items-center gap-1 ${
                    heroBgImage ? 'text-rose-200' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    <span>📍</span>
                    <span>{currentDayData.location}</span>
                  </span>
                )}
                {tripConfig && (
                  <span className={`text-[11px] font-medium ${
                    heroBgImage ? 'text-white/70' : 'text-slate-400'
                  }`}>
                    {tripConfig.startDate} → {tripConfig.endDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <PreDeparturePhotoCard
          tripId={tripId}
          startDate={tripConfig?.startDate || tripDays[0]?.dateStr || (isMasterTrip ? TRIP_START_DATE : '')}
          canEdit={canEdit}
          onOpenLive={() => onNavigateTab?.('altro', undefined, 'live')}
        />

        {/* ─── LIVELLO 1: CARD PROSSIMO PASSO / FOCUS TEMPORALE REALE ─── */}
        {(() => {
          const todayStr = new Date().toISOString().split('T')[0];
          const startDateStr = tripConfig?.startDate || tripDays[0]?.dateStr || (isMasterTrip ? '2026-11-28' : todayStr);
          const endDateStr = tripConfig?.endDate || (isMasterTrip ? '2027-01-10' : startDateStr);
          const isViewingOtherDate = selectedDate !== todayStr;
          const isPreTrip = !isViewingOtherDate && todayStr < startDateStr;
          const isPostTrip = !isViewingOtherDate && todayStr > endDateStr;

          if (isViewingOtherDate) {
            return (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                    Programma del {formatDateHuman(selectedDate)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#FF6B5F] bg-[#FFF0ED] dark:bg-rose-950/40 hover:bg-[#FFE2DE] dark:hover:bg-rose-900/60 border border-[#FF6B5F]/30 transition-colors cursor-pointer"
                  >
                    Torna a Oggi ➔
                  </button>
                </div>

                {nextEventItem ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-extrabold text-[#172033] dark:text-white leading-snug">
                            {nextEventItem.title}
                          </h2>
                          {nextEventItem.time && (
                            <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                              ⏰ {nextEventItem.time}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1 truncate">
                          <span>📍</span>
                          <span>{nextEventItem.location || 'Posizione programmata'}</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDetailItem(nextEventItem)}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#172033] hover:text-white dark:hover:bg-white dark:hover:text-[#172033] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                      >
                        Dettagli ➔
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nessun impegno a orario fisso in questa giornata.
                    </p>
                  </div>
                )}
              </div>
            );
          }

          if (isPreTrip) {
            return (
              <div className="bg-white dark:bg-[#172033] rounded-2xl border border-slate-200/80 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                    In attesa della partenza
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(startDateStr)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#FF6B5F] bg-[#FFF0ED] dark:bg-rose-950/40 hover:bg-[#FFE2DE] dark:hover:bg-rose-900/60 border border-[#FF6B5F]/30 transition-colors cursor-pointer"
                  >
                    Giorno 1 ({formatDateHuman(startDateStr)}) ➔
                  </button>
                </div>
                <div>
                  <h2 className="text-base font-extrabold font-brand-title text-[#172033] dark:text-white">
                    Partenza programmata: {formatDateHuman(startDateStr)}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {calculateCountdown()} • Nessun impegno o trasferimento in corso nella data odierna.
                  </p>
                </div>
              </div>
            );
          }

          if (isPostTrip) {
            return (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-emerald-950/40 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 border-l-4 border-l-emerald-500 p-4 shadow-xs space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Viaggio completato
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-[#172033] dark:text-white">
                    💍 Viaggio concluso il {formatDateHuman(endDateStr)}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Tutte le tappe del diario sono state completate con successo. Puoi consultare l&apos;itinerario completo nelle sezioni dell&apos;app.
                  </p>
                </div>
              </div>
            );
          }

          // Durante il viaggio nella data odierna
          return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                  In questo momento • Prossimo passo
                </span>

                {nextEventItem?.time && (
                  <span className="font-mono text-xs font-black text-[#172033] dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700">
                    ⏰ {nextEventItem.time}
                  </span>
                )}
              </div>

              {nextEventItem ? (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-extrabold text-[#172033] dark:text-white leading-snug">
                        {nextEventItem.title}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1 truncate">
                        <span>📍</span>
                        <span>
                          {(() => {
                            if (nextEventItem.type === 'trasporto' && nextEventItem.originalData) {
                              const tr = nextEventItem.originalData as Trasporto;
                              const dep = tr.departureLocation || nextEventItem.location;
                              const arr = tr.dropoffLocation || tr.arrivalLocation;
                              if (dep && arr && dep !== arr) return `${dep} ➔ ${arr}`;
                            }
                            return nextEventItem.location || 'Posizione da itinerario';
                          })()}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDetailItem(nextEventItem)}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#172033] hover:text-white dark:hover:bg-white dark:hover:text-[#172033] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                    >
                      Dettagli ➔
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px]">
                    {nextEventBookingCode && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(nextEventBookingCode);
                            setBookingCodeCopied(true);
                            setTimeout(() => setBookingCodeCopied(false), 2000);
                          } catch {}
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200/60 dark:border-indigo-800/60 transition-colors cursor-pointer text-[11px]"
                        title="Clicca per copiare il codice di prenotazione / PNR"
                      >
                        <span>🎫</span>
                        <span className="font-mono">Prenotazione: {nextEventBookingCode}</span>
                        <span className="text-[9px] opacity-70 ml-0.5 font-sans">{bookingCodeCopied ? '✓ Copiato' : 'Copia'}</span>
                      </button>
                    )}
                    {nextEventItem.coordinate && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = `https://www.google.com/maps/search/?api=1&query=${nextEventItem.coordinate?.lat},${nextEventItem.coordinate?.lng}`;
                          window.open(url, '_blank');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold border border-sky-200/60 dark:border-sky-800/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors cursor-pointer"
                      >
                        <span>🧭</span>
                        <span>Naviga su Mappa ↗</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Giornata libera senza trasferimenti programmati
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tonightsAccommodation
                      ? `Pernottamento previsto presso ${tonightsAccommodation.name}. Tempo a disposizione per visite ed esplorazioni.`
                      : 'Nessun impegno a orario fisso registrato nel roadbook per questo orario.'}
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* HERO EDIT MODAL */}
      {isHeroEditOpen && createPortal(
        <div
          className="modal-backdrop-layer"
          onClick={() => setIsHeroEditOpen(false)}
        >
          <div
            className="modal-sheet-container rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 sticky top-0 z-20 shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">✏️ Personalizza Header</h2>
              <button type="button" onClick={() => setIsHeroEditOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Body */}
            <div className="modal-sheet-body space-y-5">
              {/* Titolo Destinazioni */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">Destinazioni / Titolo</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setHeroTitleMode('custom')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      heroTitleMode === 'custom'
                        ? 'bg-[#172033] text-white border-[#172033]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >✍️ Manuale</button>
                  <button
                    type="button"
                    onClick={() => setHeroTitleMode('auto')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      heroTitleMode === 'auto'
                        ? 'bg-[#172033] text-white border-[#172033]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >🔄 Da Tappe</button>
                </div>
                {heroTitleMode === 'custom' && (
                  <input
                    type="text"
                    value={heroEditTitle}
                    onChange={e => setHeroEditTitle(e.target.value)}
                    placeholder="es. New Zealand, Australia & Philippines"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
                  />
                )}
                {heroTitleMode === 'auto' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                    Il titolo verrà generato automaticamente raccogliendo le <strong>location</strong> di tutte le Tappe del viaggio (senza duplicati).
                  </p>
                )}
              </div>

              {/* Sfondo */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">Immagine di Sfondo</label>
                {heroBgImage ? (
                  <div className="space-y-2">
                    <div className="w-full h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative">
                      <img src={heroBgImage} alt="Sfondo" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded-full">Immagine attiva</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => heroBgInputRef.current?.click()}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                      >🖼️ Cambia</button>
                      <button
                        type="button"
                        onClick={handleRemoveHeroBg}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition cursor-pointer"
                      >🗑️ Rimuovi</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => heroBgInputRef.current?.click()}
                    className="w-full py-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold hover:border-[#FF6B5F] hover:text-[#FF6B5F] transition cursor-pointer"
                  >
                    ➕ Carica un'immagine
                  </button>
                )}
                <input
                  ref={heroBgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroBgUpload}
                />
              </div>

              <button
                type="button"
                onClick={handleSaveHeroTitle}
                className="w-full py-3 rounded-2xl bg-[#FF6B5F] hover:bg-[#e05b50] text-white font-bold text-sm transition active:scale-95 cursor-pointer shadow-md shadow-[#FF6B5F]/20"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 2. SELETTORE ORIZZONTALE DEI GIORNI (CALENDAR STRIP) */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-brand-title">
            Calendario Tappe
          </span>
          <div className="flex items-center gap-2">
            <div
              title="Scegli data dal calendario"
              onClick={(e) => {
                const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                if (input && typeof input.showPicker === 'function') {
                  try {
                    input.showPicker();
                  } catch {}
                }
              }}
              className="relative w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer overflow-hidden active:scale-95 shadow-xs"
            >
              <input
                type="date"
                value={selectedDate}
                min={tripDays.length > 0 ? tripDays[0]?.dateStr : undefined}
                max={tripDays.length > 0 ? tripDays[tripDays.length - 1]?.dateStr : undefined}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="Scegli data dal calendario"
              />
              <span className="text-sm select-none pointer-events-none">📅</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {currentDayMeta && currentDayMeta.dayNum > 0
                ? `Giorno ${currentDayMeta.dayNum}`
                : currentDayMeta
                ? `Pre-viaggio (${currentDayMeta.labelFormatted})`
                : '–'}
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
                    ? 'bg-[#172033] text-white dark:bg-white dark:text-[#172033] font-bold shadow-xs scale-[1.03]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/80'
                }`}
              >
                <span className={`text-[10px] uppercase tracking-tight ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
                  {item.dayNameShort}
                </span>
                <span className="text-base font-extrabold my-0.5 leading-none">
                  {item.dayOfMonth}
                </span>
                <span className={`text-[10px] font-medium ${isSelected ? 'text-[#FF6B5F]' : 'text-slate-500 dark:text-slate-400'}`}>
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
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
              {formatDateHuman(selectedDate)}
            </span>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Card Link Google Maps Giornata - Travel Editorial (Auto & Piedi con Gestione Limite 10 Tappe) */}
        <DayMapsCard
          date={selectedDate}
          routes={dayMapsRoutes}
          canEdit={canEdit}
          onSaveRoutes={async (newRoutes) => {
            await storageService.saveDayMapsRoutes(selectedDate, newRoutes);
            setDayMapsRoutes(newRoutes);
          }}
        />



        {/* Sequenza Unificata: timeline con sezioni chiare + alloggio fisso in fondo */}
        {(() => {
          // Prepara gli elementi di percorso sequenziali
          const dayItems: {
            id: string;
            type: 'trasporto' | 'tappa' | 'attivita' | 'ristorante' | 'alloggio' | 'shopping' | 'checkin_callout';
            time: string;
            title: string;
            location: string;
            departurePoint?: string;
            arrivalPoint?: string;
            coordinate?: import('../types').Coordinate;
            originalData?: any;
            copilota?: boolean;
            noteCopilota?: string;
            displayMode?: import('../types').TransportDisplayMode;
            stateLabel?: string;
            segmentContext?: import('../types').TransportSegmentContext;
          }[] = [];

          // Ordina rigorosamente per orario (HH:mm)
          const sortedTimeline = [...timeline].sort((a, b) => {
            const dateA = a.originalData?.date || a.originalData?.data || a.originalData?.checkIn || '2026-11-28';
            const dateB = b.originalData?.date || b.originalData?.data || b.originalData?.checkIn || '2026-11-28';
            const isoA = ((dateA || '').split('-').length === 3 && (dateA || '').split('-')[0].length === 2 ? (dateA || '').split('-').reverse().join('-') : (dateA || ''));
            const isoB = ((dateB || '').split('-').length === 3 && (dateB || '').split('-')[0].length === 2 ? (dateB || '').split('-').reverse().join('-') : (dateB || ''));
            if (isoA !== isoB) return isoA.localeCompare(isoB);
            const timeA = a.time || '12:00';
            const timeB = b.time || '12:00';
            return timeA.localeCompare(timeB);
          });

          // Se l'alloggio notturno ha un check-in orario che cade durante il giorno prima dell'ultimo evento,
          // generiamo un piccolo richiamo informativo cronologico 'checkin_callout'
          const checkInTime = tonightsAccommodation?.checkInTime;
          let addedCheckinCallout = false;

          sortedTimeline.forEach(item => {
            // Evitiamo che la card alloggio completa compaia nel mezzo della giornata
            if (item.type === 'alloggio') return;

            let departurePoint = item.location;
            let arrivalPoint = item.location;

            if (item.type === 'trasporto') {
              const tr = item.originalData as Trasporto;
              departurePoint = tr.departureLocation || item.location;
              arrivalPoint = tr.dropoffLocation || tr.arrivalLocation || item.location;
            }

            // Inserisci richiamo informativo se l'orario di check-in è precedente all'item corrente
            if (
              tonightsAccommodation &&
              checkInTime &&
              !addedCheckinCallout &&
              item.time &&
              item.time >= checkInTime
            ) {
              const accLoc = tonightsAccommodation.address || tonightsAccommodation.location || tonightsAccommodation.name;
              dayItems.push({
                id: `checkin_callout_${tonightsAccommodation.id}`,
                type: 'checkin_callout',
                time: checkInTime,
                title: `Check-in disponibile: ${tonightsAccommodation.name}`,
                location: accLoc,
                coordinate: tonightsAccommodation.coordinate,
                originalData: tonightsAccommodation
              });
              addedCheckinCallout = true;
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
              noteCopilota: item.noteCopilota || (item.originalData as any)?.noteCopilota,
              displayMode: (item as any).displayMode,
              stateLabel: (item as any).stateLabel,
              segmentContext: (item as any).segmentContext
            });
          });

          const activeStates = dayItems.filter(i => i.displayMode === 'state');
          const visibleCards = dayItems.filter(i => i.displayMode !== 'state');

          if (dayItems.length === 0 && !tonightsAccommodation) {
            return (
              <div className="bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-200/80 dark:border-slate-800 border-dashed p-6 text-center">
                <span className="text-2xl mb-1 block">🧭</span>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Nessuna attività programmata per oggi</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Giornata libera per relax, esplorazione spontanea o spostamento.</p>
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {activeStates.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {activeStates.map((stateItem, idx) => (
                    <div key={`state-${stateItem.id || idx}`} className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/60 rounded-2xl p-3 shadow-xs flex items-center justify-center text-center">
                       <span className="text-[11px] font-bold text-amber-800 dark:text-amber-200 tracking-tight">{stateItem.stateLabel}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* TIMELINE CRONOLOGICA DEGLI EVENTI DI GIORNATA */}
              {visibleCards.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      Itinerario &amp; Tappe di Giornata
                    </span>
                  </div>

                  {visibleCards.map((item, idx) => {
                    const nextItem = visibleCards[idx + 1];

                    const fromLoc = item.arrivalPoint || item.location;
                    const toLoc = nextItem ? (nextItem.departurePoint || nextItem.location) : '';
                    const fromCoord = item.coordinate;
                    const toCoord = nextItem ? nextItem.coordinate : undefined;

                    const isCheckinCallout = item.type === 'checkin_callout';
                    const isTransport = item.type === 'trasporto';
                    const isTappa = item.type === 'tappa';
                    const isRistorante = item.type === 'ristorante';
                    const isShopping = item.type === 'shopping';
                    const isAttivita = item.type === 'attivita';

                    return (
                      <div
                        key={item.id}
                        ref={(el) => { timelineItemRefs.current[item.id] = el; }}
                        className="hounigo-timeline-item"
                        style={{ animationDelay: `${Math.min(idx * 28, 168)}ms` }}
                      >
                        {isCheckinCallout ? (
                          /* Tappa informativa rapida per check-in senza duplicazioni economiche */
                          <div
                            onClick={() => {
                              const targetEl = timelineItemRefs.current[`lodging_${tonightsAccommodation?.id}`];
                              if (targetEl) {
                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className="bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/60 rounded-2xl p-3 flex items-center justify-between gap-3 hover:bg-purple-100/60 transition-all cursor-pointer shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center text-sm shrink-0">
                                🏨
                              </span>
                              <div className="min-w-0">
                                <span className="block text-[11px] font-extrabold text-purple-900 dark:text-purple-200 truncate">
                                  {item.title}
                                </span>
                                <span className="block text-[10px] text-purple-600 dark:text-purple-400 truncate">
                                  Dalle ore {item.time} • Clicca per vedere la scheda in basso
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0">
                              Vedi alloggio ↓
                            </span>
                          </div>
                        ) : isTransport ? (
                          item.id.endsWith('_arrival') || item.id.endsWith('_state') ? (
                            <InTransitBanner transport={item.originalData as Trasporto} dateStr={selectedDate} />
                          ) : (
                            <TrasportoCard
                              transport={item.originalData as Trasporto}
                              variant={item.displayMode === 'compact' ? 'compact' : 'full'}
                              onEdit={() => setEditingTransportItem(item.originalData as Trasporto)}
                              onDelete={async () => {
                                await storageService.deleteTransport(item.originalData?.id || '');
                                await fetchTimeline();
                              }}
                              onUpdate={() => fetchTimeline()}
                            />
                          )
                        ) : isAttivita ? (
                          <AttivitaCard
                            activity={item.originalData as Attivita}
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteActivity(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                            onUpdate={() => fetchTimeline()}
                          />
                        ) : isRistorante ? (
                          <RistoranteCard
                            ristorante={item.originalData}
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteRistorante(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                          />
                        ) : isShopping ? (
                          <ShoppingCard
                            shopping={item.originalData}
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteShopping(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                          />
                        ) : isTappa ? (
                          <TappaCard
                            tappa={item.originalData}
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteTappa(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                          />
                        ) : (
                          <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm text-center text-slate-500 text-sm">
                            {item.title}
                          </div>
                        )}

                        {/* ROUTEBADGE SEQUENZIALE CON SFONDO/PERCORSO TRATTEGGIATO */}
                        {nextItem && fromLoc && toLoc && fromLoc.trim().toLowerCase() !== toLoc.trim().toLowerCase() && (
                          <div className="flex flex-col items-center justify-center my-0.5 relative">
                            {/* Tratto tratteggiato superiore */}
                            <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                            <div className="flex items-center justify-center w-full px-4">
                              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                              <RouteBadge
                                routeId={`seq_${item.id}_${nextItem.id}`}
                                from={fromLoc}
                                to={toLoc}
                                fromCoord={fromCoord}
                                toCoord={toCoord}
                                className="scale-95 shadow-xs mx-2"
                              />
                              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                            </div>
                            {/* Tratto tratteggiato inferiore */}
                            <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SEZIONE SPECIALE: ALLOGGIO PER STANOTTE (Sempre fissa a fine giornata) */}
              <div className="pt-2">
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                    Alloggio per Stanotte
                  </span>
                </div>

                {tonightsAccommodation ? (
                  <div
                    ref={(el) => {
                      timelineItemRefs.current[`lodging_${tonightsAccommodation.id}`] = el;
                    }}
                  >
                    <AlloggioCard
                      accommodation={tonightsAccommodation}
                      onEdit={() => {
                        const found = timeline.find(t => t.id === `lodging_${tonightsAccommodation.id}` || t.id === tonightsAccommodation.id);
                        if (found) setDetailItem(found);
                        else setEditingAlloggioItem(tonightsAccommodation);
                      }}
                      onDelete={async () => {
                        await storageService.deleteAccommodation(tonightsAccommodation.id);
                        await fetchTimeline();
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 text-center text-xs text-slate-500">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Nessun alloggio fissato per stanotte</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Pernottamento libero, camping van o tratta in volo notturno.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* QUICK ACTIONS 2-COLONNE: Nuova Spesa ed Emergenze */}
      <div className="grid grid-cols-2 gap-3 mt-1 mb-4">
        {/* Pulsante 1: Nuova Spesa (verde tenue coerente con token semantici) */}
        <button
          type="button"
          onClick={() => setIsQuickExpenseOpen(true)}
          className="bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60 shadow-sm active:scale-[0.98] rounded-xl py-3 px-3.5 flex items-center gap-2.5 transition-all cursor-pointer text-left w-full text-emerald-950 dark:text-emerald-100"
        >
          <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-base shrink-0">
            💳
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-emerald-800 dark:text-emerald-200 leading-tight">Nuova Spesa</p>
            <p className="text-[12px] text-emerald-700/80 dark:text-emerald-300/80 leading-tight mt-0.5 truncate">Registra o converti</p>
          </div>
        </button>

        {/* Pulsante 2: Emergenze & SOS */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('altro', undefined, 'assicurazione')}
          className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 hover:bg-rose-100/60 dark:hover:bg-rose-950/50 active:scale-[0.98] rounded-xl py-3 px-3.5 flex items-center gap-2.5 transition-all cursor-pointer text-left w-full text-rose-900 dark:text-rose-200"
        >
          <span className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center text-base shrink-0">
            🚨
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-rose-700 dark:text-rose-300 leading-tight">Emergenze</p>
            <p className="text-[12px] text-rose-500/90 dark:text-rose-400 leading-tight mt-0.5 truncate">SOS, Polizia, H24</p>
          </div>
        </button>
      </div>

      {/* 5. SEZIONE "COSA FARAI DOMANI" (GIORNO SUCCESSIVO) CON CAROSELLO A SCORRIMENTO ORIZZONTALE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold shadow-2xs border border-blue-100 dark:border-blue-900/50">
              🌅
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Cosa farai domani
              </h2>
              {nextDayMeta && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {formatDateHuman(nextDayMeta.dateStr)} • Tappa {nextDayMeta.dayNum}
                </p>
              )}
            </div>
          </div>
          {nextDayMeta && (
            <button
              type="button"
              onClick={() => setSelectedDate(nextDayMeta.dateStr)}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50"
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
              const badgeBg = isLodging ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800' :
                              isTransport ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-100 dark:border-sky-800' :
                              isTappa ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-800' :
                              isRistorante ? 'bg-[#FFF0ED] dark:bg-rose-950/30 text-[#172033] dark:text-rose-200 border-[#FFF0ED] dark:border-rose-900/40' :
                              isShopping ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-100 dark:border-pink-800' :
                              'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800';

              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => {
                    if (nextDayMeta) setSelectedDate(nextDayMeta.dateStr);
                  }}
                  className="min-w-[200px] max-w-[240px] bg-white dark:bg-slate-800/90 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700 shadow-xs shrink-0 snap-start flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold border ${badgeBg}`}>
                        {icon}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/80 px-2 py-0.5 rounded-md">
                        {item.time || '12:00'}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                      {item.title}
                    </h4>
                  </div>
                  {item.location && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-2">
                      📍 {item.location}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Nessuna attività programmata per domani
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
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
          onDelete={handleDeleteActivityFromForm}
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
          onDelete={handleDeleteTransportFromForm}
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
          defaultDate={selectedDate}
          onSave={handleSaveTappa}
          onCancel={() => setEditingTappaItem(null)}
          onDelete={handleDeleteTappaFromForm}
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
          onDelete={handleDeleteAlloggioFromForm}
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

      {/* Modale Rilevamento Sovrapposizione Oraria */}
      <TimeCollisionModal
        collision={activeCollision}
        onKeepBoth={() => {
          if (activeCollision) {
            if (typeof localStorage !== 'undefined') {
              try { localStorage.setItem(activeCollision.id, 'keep'); } catch {}
            }
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'keep');
            }
          }
          setActiveCollision(null);
        }}
        onDeleteItem={async (itemId, itemType) => {
          try {
            if (itemType === 'trasporto') await storageService.deleteTransport(itemId);
            else if (itemType === 'attivita') await storageService.deleteActivity(itemId);
            else if (itemType === 'ristorante') await storageService.deleteRistorante(itemId);
            else if (itemType === 'shopping') await storageService.deleteShopping(itemId);
            else if (itemType === 'tappa') await storageService.deleteTappa(itemId);
            else if (itemType === 'alloggio') await storageService.deleteAccommodation(itemId);
            
            if (activeCollision) {
              if (typeof localStorage !== 'undefined') {
                try { localStorage.setItem(activeCollision.id, 'resolved'); } catch {}
              }
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(activeCollision.id, 'resolved');
              }
            }
            setActiveCollision(null);
            await fetchTimeline();
          } catch (err) {
            console.error('Errore eliminazione collisione:', err);
          }
        }}
        onUpdateTime={async (itemId, itemType, newTime, dateDeltaDays) => {
          try {
            const shiftDateStr = (dateStr?: string, delta?: number) => {
              if (!dateStr || !delta) return dateStr;
              const d = new Date(dateStr + 'T12:00:00Z');
              if (isNaN(d.getTime())) return dateStr;
              d.setUTCDate(d.getUTCDate() + delta);
              return d.toISOString().split('T')[0];
            };

            if (itemType === 'attivita') {
              const activities = await storageService.getActivities();
              const found = activities.find(a => a.id === itemId);
              if (found) {
                const effectiveOldDate = found.date || (found.dayId?.startsWith('day_') ? found.dayId.replace('day_', '') : selectedDate);
                const newDate = shiftDateStr(effectiveOldDate, dateDeltaDays);
                const updated = {
                  ...found,
                  time: newTime,
                  orarioInizio: newTime,
                  orarioRitrovo: newTime,
                  ...(newDate ? { date: newDate, dayId: `day_${newDate}` } : {}),
                  updatedAt: Date.now()
                };
                await storageService.saveActivity(updated);
              }
            } else if (itemType === 'trasporto') {
              const transports = await storageService.getTransports();
              const found = transports.find(t => t.id === itemId);
              if (found) {
                let newArrivalTime = found.arrivalTime;
                if (found.departureTime && found.arrivalTime) {
                  const [oldDH, oldDM] = found.departureTime.split(':').map(Number);
                  const [oldAH, oldAM] = found.arrivalTime.split(':').map(Number);
                  if (!isNaN(oldDH) && !isNaN(oldDM) && !isNaN(oldAH) && !isNaN(oldAM)) {
                    let durationMin = (oldAH * 60 + oldAM) - (oldDH * 60 + oldDM);
                    if (durationMin < 0) durationMin += 24 * 60;
                    const [newDH, newDM] = newTime.split(':').map(Number);
                    if (!isNaN(newDH) && !isNaN(newDM)) {
                      const totalArrivalMin = (newDH * 60 + newDM + durationMin) % (24 * 60);
                      const arrH = String(Math.floor(totalArrivalMin / 60)).padStart(2, '0');
                      const arrM = String(totalArrivalMin % 60).padStart(2, '0');
                      newArrivalTime = `${arrH}:${arrM}`;
                    }
                  }
                }
                const newDate = shiftDateStr(found.date, dateDeltaDays);
                const newArrivalDate = shiftDateStr(found.arrivalDate, dateDeltaDays);
                const updated = {
                  ...found,
                  departureTime: newTime,
                  arrivalTime: newArrivalTime,
                  ...(newDate ? { date: newDate } : {}),
                  ...(newArrivalDate ? { arrivalDate: newArrivalDate } : {}),
                  updatedAt: Date.now()
                };
                await storageService.saveTransport(updated);
              }
            } else if (itemType === 'ristorante') {
              const items = await storageService.getRistoranti();
              const found = items.find(r => r.id === itemId);
              if (found) {
                const newDate = shiftDateStr(found.date || found.data, dateDeltaDays);
                const updated = {
                  ...found,
                  time: newTime,
                  orario: newTime,
                  ...(newDate ? { date: newDate, data: newDate } : {}),
                  updatedAt: Date.now()
                };
                await storageService.saveRistorante(updated);
              }
            } else if (itemType === 'alloggio') {
              const items = await storageService.getAccommodations();
              const found = items.find(a => a.id === itemId);
              if (found) {
                const newCheckIn = shiftDateStr(found.checkIn, dateDeltaDays);
                const updated = {
                  ...found,
                  checkInTime: newTime,
                  ...(newCheckIn ? { checkIn: newCheckIn } : {}),
                  updatedAt: Date.now()
                };
                await storageService.saveAccommodation(updated);
              }
            } else if (itemType === 'shopping') {
              await storageService.updateShopping(itemId, { orario: newTime });
            } else if (itemType === 'tappa') {
              const items = await storageService.getTappe();
              const found = items.find(t => t.id === itemId);
              if (found) {
                const newDate = shiftDateStr(found.date || found.data, dateDeltaDays);
                const updated = {
                  ...found,
                  orario: newTime,
                  time: newTime,
                  orarioVisita: newTime,
                  ...(newDate ? { date: newDate, data: newDate } : {}),
                  updatedAt: Date.now()
                };
                await storageService.saveTappa(updated);
              }
            }

            if (activeCollision) {
              if (typeof localStorage !== 'undefined') {
                try { localStorage.setItem(activeCollision.id, 'resolved'); } catch {}
              }
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(activeCollision.id, 'resolved');
              }
            }
            setActiveCollision(null);
            await fetchTimeline();
          } catch (err) {
            console.error('Errore modifica orario collisione:', err);
          }
        }}
        onOpenEditForm={(item) => {
          if (item.type === 'trasporto' && item.originalData) {
            setEditingTransportItem(item.originalData as Trasporto);
          } else if (item.type === 'attivita' && item.originalData) {
            setEditingActivityItem(item.originalData as Attivita);
          } else if (item.type === 'ristorante' && item.originalData) {
            setEditingRistoranteItem(item.originalData);
          } else if (item.type === 'alloggio' && item.originalData) {
            setEditingAlloggioItem(item.originalData);
          } else if (item.type === 'tappa' && item.originalData) {
            setEditingTappaItem(item.originalData);
          } else if (item.type === 'shopping' && item.originalData) {
            setEditingShoppingItem(item.originalData);
          }
          setActiveCollision(null);
        }}
        onDismiss={() => {
          if (activeCollision) {
            if (typeof localStorage !== 'undefined') {
              try { localStorage.setItem(activeCollision.id, 'dismissed'); } catch {}
            }
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'dismissed');
            }
          }
          setActiveCollision(null);
        }}
      />

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
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200/80 dark:border-slate-800 animate-scale-up space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#FFF0ED] dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FFF0ED] dark:bg-rose-950/40 text-[#172033] dark:text-rose-300 flex items-center justify-center text-sm font-bold">
                  🧭
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Note Co-pilota • {copilotPopoverActivity.title}
                  </h3>
                  <p className="text-[10px] text-[#172033] dark:text-rose-300 font-semibold truncate max-w-[190px]">
                    Promemoria e raccomandazioni
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopilotPopoverActivity(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Area di testo per lettura / modifica immediata */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {canEdit ? 'Note & Suggerimenti di viaggio:' : 'Note consultabili:'}
              </label>
              {canEdit ? (
                <textarea
                  rows={4}
                  value={copilotPopoverText}
                  onChange={(e) => setCopilotPopoverText(e.target.value)}
                  placeholder="Inserisci note, consigli parcheggio, orari migliori, promemoria per la guida..."
                  className="w-full rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/20 p-3 text-xs text-slate-800 dark:text-white leading-relaxed outline-none transition-all resize-none"
                />
              ) : (
                <div className="bg-[#FFF0ED]/60 dark:bg-rose-950/30 p-3.5 rounded-2xl border border-[#FFF0ED] dark:border-rose-900/40 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium min-h-[80px]">
                  {copilotPopoverActivity.noteCopilota?.trim() ? (
                    copilotPopoverActivity.noteCopilota
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
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
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
                        noteCopilota: copilotPopoverText.trim(),
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
                  className="px-4 py-1.5 rounded-xl bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingCopilotNote ? 'Salvataggio...' : 'Salva Nota'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Copilota Globale della giornata */}
      <UniversalCopilotaModal
        isOpen={isGlobalCopilotOpen}
        onClose={() => setIsGlobalCopilotOpen(false)}
        title={`Giornata del ${selectedDate}`}
        noteCopilota={globalCopilotNoteStr}
        canEdit={canEdit}
        onSave={async (notes) => {
          try {
            if (globalCopilotNoteId) {
              const allNotes = await storageService.getNote();
              const existing = allNotes.find(n => n.id === globalCopilotNoteId);
              if (existing) {
                await storageService.saveNota({ ...existing, content: notes.trim(), updatedAt: Date.now() });
              }
            } else {
              await storageService.saveNota({
                id: 'note_' + Date.now(),
                title: 'Note Copilota di Giornata',
                content: notes.trim(),
                date: selectedDate,
                type: 'info',
                createdAt: Date.now(),
                updatedAt: Date.now()
              } as any);
            }
            await fetchGlobalCopilotNote();
            setIsGlobalCopilotOpen(false);
          } catch (err) {
            console.error('Errore salvataggio nota copilota globale', err);
          }
        }}
      />



      {/* MODALE SPESA RAPIDA */}
      <Modal
        isOpen={isQuickExpenseOpen}
        onClose={() => setIsQuickExpenseOpen(false)}
        title="💳 Nuova Spesa Rapida"
        accentVariant="emerald"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Descrizione *</label>
            <input
              type="text"
              autoFocus
              value={quickExpenseTitle}
              onChange={e => setQuickExpenseTitle(e.target.value)}
              placeholder="es. Cena al porto, Souvenir, Transfer..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Importo *</label>
            <div className="flex gap-2">
              <select
                value={quickExpenseCurrency}
                onChange={e => setQuickExpenseCurrency(e.target.value as 'EUR'|'NZD'|'AUD'|'PHP')}
                className="px-2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] shrink-0"
              >
                <option value="EUR">🇪🇺 EUR</option>
                <option value="NZD">🇳🇿 NZD</option>
                <option value="AUD">🇦🇺 AUD</option>
                <option value="PHP">🇵🇭 PHP</option>
              </select>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={quickExpenseAmount}
                onChange={e => setQuickExpenseAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-white dark:bg-slate-800"
              />
            </div>
            {quickExpenseCurrency !== 'EUR' && quickAmountNum > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 px-1 font-medium">
                ≈ <span className="font-bold text-[#FF6B5F]">{quickEur.toFixed(2)} €</span>
                <span className="opacity-70"> (tasso approx. 1€ = {QUICK_RATES[quickExpenseCurrency]} {quickExpenseCurrency})</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsQuickExpenseOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSaveQuickExpense}
              disabled={quickExpenseSaving || !quickExpenseTitle.trim() || !quickExpenseAmount}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {quickExpenseSaving ? 'Salvo...' : 'Aggiungi Spesa'}
            </button>
          </div>
        </div>
      </Modal>


    </div>
  );
}
