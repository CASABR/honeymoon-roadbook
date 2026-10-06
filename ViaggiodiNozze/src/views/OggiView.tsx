import React, { useState, useEffect, useCallback } from 'react';
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
import InTransitBanner from '../components/common/InTransitBanner';
import { useDeviceRole } from '../utils/useDeviceRole';

interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => void;
}

import { generateTripDays, getTripDateRange, type TripDayItem } from '../utils/tripDates';
import { getTripConfig } from '../utils/tripConfig';

const TRIP_START_DATE = '2026-11-28';
const TRIP_END_DATE = '2027-01-10';

function getDefaultSelectedDate(startDate = TRIP_START_DATE, endDate = TRIP_END_DATE): string {
  const todayStr = new Date().toISOString().split('T')[0];
  if (todayStr < startDate) return startDate;
  if (todayStr > endDate) return startDate;
  return todayStr;
}

export default function OggiView({ onNavigateTab }: OggiViewProps) {
  const { canEdit } = useDeviceRole();
  const tripConfig = getTripConfig();
  const [copilotPopoverActivity, setCopilotPopoverActivity] = useState<Attivita | null>(null);
  const [copilotPopoverText, setCopilotPopoverText] = useState('');
  const [isSavingCopilotNote, setIsSavingCopilotNote] = useState(false);

  const [tripDays, setTripDays] = useState<TripDayItem[]>(() => generateTripDays());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getDefaultSelectedDate(tripConfig?.startDate, tripConfig?.endDate);
  });
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [daysData, setDaysData] = useState<Giorno[]>([]);
  const [, setLoading] = useState(true);

  // Calcolo dinamico Countdown rispetto alla partenza reale
  const calculateCountdown = () => {
    const startDate = tripConfig?.startDate || tripDays[0]?.dateStr || '2026-11-28';
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
      const endDateStr = tripConfig?.endDate || '2027-01-10';
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
  const [heroBgImage, setHeroBgImage] = useState<string | null>(null);
  const [isHeroEditOpen, setIsHeroEditOpen] = useState(false);
  const [heroEditTitle, setHeroEditTitle] = useState('');
  const [heroTitleMode, setHeroTitleMode] = useState<'custom' | 'auto'>('custom');
  const heroBgInputRef = React.useRef<HTMLInputElement>(null);

  const [dayMapLink, setDayMapLink] = useState<string | null>(null);
  const [isMapLinkModalOpen, setIsMapLinkModalOpen] = useState(false);
  const [editMapLinkUrl, setEditMapLinkUrl] = useState('');

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
    
    // Day map link
    const link = await storageService.getDayMapLink(target);
    setDayMapLink(link);

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
        storageService.getSetting('hero_bg_image'),
        storageService.getSetting('hero_title_mode')
      ]);

      const [accs, days, range, transports, tappe, heroTitle, heroBg, heroMode] = await Promise.race([dataPromise, timeoutPromise]) as [Alloggio[], Giorno[], any, Trasporto[], Tappa[], string | null, string | null, string | null];

      if (heroTitle) setDynamicCountries(heroTitle);
      if (heroBg) setHeroBgImage(heroBg);
      if (heroMode) setHeroTitleMode(heroMode as 'custom' | 'auto');

      setAccommodations(accs || []);
      setDaysData(days || []);

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
        setDynamicCountries(tripConfig?.title || 'Il mio Viaggio');
      }

      const dynamicDays = range?.tripDays || [];
      setTripDays(dynamicDays);

      // Implementazione deterministica fissa richiesta dall'utente
      const todayStr = new Date().toISOString().split('T')[0];
      const configStartDate = tripConfig?.startDate || '2026-11-28';
      const configEndDate = tripConfig?.endDate || '2027-01-10';
      
      const forcedDate = getDefaultSelectedDate(configStartDate, configEndDate);
      
      setSelectedDate(forcedDate);
      console.log("Data iniziale calcolata:", forcedDate, "Start date:", configStartDate, "Today:", todayStr);
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
      const customEvt = e as CustomEvent<{ entityType?: string; action?: string; data?: any; source?: string }>;
      const targetDate = customEvt.detail?.data?.date || customEvt.detail?.data?.data;
      const isCloud = customEvt.detail?.source === 'cloud';
      
      if (targetDate && !isCloud) {
        setSelectedDate(targetDate);
        fetchTimeline(targetDate);
      } else if (targetDate && isCloud) {
        // Se l'evento arriva dal cloud, non spostiamo la schermata dell'utente, ricarichiamo solo i dati in background
        fetchTimeline();
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

  const handleDeleteAlloggioFromForm = async () => {
    if (!editingAlloggioItem) return;
    await storageService.deleteAccommodation(editingAlloggioItem.id);
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

  const handleSaveDayMapLink = () => {
    storageService.saveDayMapLink(selectedDate, editMapLinkUrl);
    setDayMapLink(editMapLinkUrl || null);
    setIsMapLinkModalOpen(false);
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
          storageService.saveSetting('hero_bg_image', dataUrl);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveHeroBg = () => {
    setHeroBgImage(null);
    storageService.saveSetting('hero_bg_image', null);
  };

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-20 sm:pb-24">
      {/* 1. HEADER HERO / COPERTINA COMPATTA */}
      <div
        className="relative overflow-hidden rounded-2xl text-white shadow-lg border border-white/5"
        style={heroBgImage
          ? { backgroundImage: `url(${heroBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : {}}
      >
        {/* Default gradient (hidden when image set) */}
        {!heroBgImage && (
          <div className="absolute inset-0 bg-slate-900" />
        )}
        {/* Dark overlay when image */}
        {heroBgImage && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
        )}

        {/* Accent stripe top */}
        <div className="relative h-[2px] w-full bg-slate-200 dark:bg-slate-700" />

        <div className="relative z-10 px-4 py-3 space-y-2.5">
          {/* Row 1: Badge countdown + data + edit button */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold text-rose-300 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>{calculateCountdown()}</span>
            </div>
            <div className="flex items-center gap-2">
              {currentDayMeta && (
                <span className="text-[10px] font-semibold text-slate-400">
                  {formatDateHuman(selectedDate)}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleOpenHeroEdit}
                  className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all cursor-pointer"
                  title="Personalizza header"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2 2 0 012.828 2.828L11.828 13.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Title */}
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">
              {dynamicCountries}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
              {tripConfig ? `${formatDateHuman(tripConfig.startDate)} – ${formatDateHuman(tripConfig.endDate)} • ${tripDays.length} giorni` : `${tripDays.length} giorni di viaggio`}
            </p>
          </div>

        {/* Row 3: Tappa + location */}
        {currentDayMeta && (
          <div className="flex items-center justify-between pt-1 border-t border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                Giorno {currentDayMeta.dayNum}/{tripDays.length}
              </span>
                {currentDayData?.title && (
                  <span className="text-[10px] font-semibold text-rose-300 truncate max-w-[140px]">
                    📍 {currentDayData.title}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Background glow (only without image) */}
        {!heroBgImage && (
          <>
            <div className="absolute -right-6 -bottom-8 w-36 h-36 rounded-full bg-transparent blur-2xl pointer-events-none" />
            <div className="absolute -left-4 top-0 w-24 h-24 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
          </>
        )}
      </div>

      {/* HERO EDIT MODAL */}
      {isHeroEditOpen && createPortal(
        <div
          className="modal-backdrop-layer"
          onClick={() => setIsHeroEditOpen(false)}
        >
          <div
            className="modal-sheet-container rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-white/95 sticky top-0 z-20 shrink-0">
              <h2 className="text-lg font-bold text-slate-900">✏️ Personalizza Header</h2>
              <button type="button" onClick={() => setIsHeroEditOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Body */}
            <div className="modal-sheet-body space-y-5">
              {/* Titolo Destinazioni */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Destinazioni / Titolo</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setHeroTitleMode('custom')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      heroTitleMode === 'custom'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >✍️ Manuale</button>
                  <button
                    type="button"
                    onClick={() => setHeroTitleMode('auto')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      heroTitleMode === 'auto'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >🔄 Da Tappe</button>
                </div>
                {heroTitleMode === 'custom' && (
                  <input
                    type="text"
                    value={heroEditTitle}
                    onChange={e => setHeroEditTitle(e.target.value)}
                    placeholder="es. New Zealand, Australia & Philippines"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                )}
                {heroTitleMode === 'auto' && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-200">
                    Il titolo verrà generato automaticamente raccogliendo le <strong>location</strong> di tutte le Tappe del viaggio (senza duplicati).
                  </p>
                )}
              </div>

              {/* Sfondo */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Immagine di Sfondo</label>
                {heroBgImage ? (
                  <div className="space-y-2">
                    <div className="w-full h-24 rounded-xl overflow-hidden border border-slate-200 relative">
                      <img src={heroBgImage} alt="Sfondo" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded-full">Immagine attiva</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => heroBgInputRef.current?.click()}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition cursor-pointer"
                      >🖼️ Cambia</button>
                      <button
                        type="button"
                        onClick={handleRemoveHeroBg}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                      >🗑️ Rimuovi</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => heroBgInputRef.current?.click()}
                    className="w-full py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-xs font-semibold hover:border-indigo-400 hover:text-indigo-600 transition cursor-pointer"
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
                className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition active:scale-95 cursor-pointer"
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

        {/* Card Link Google Maps Giornata - Stile Essenziale */}
        <div 
          className={`mx-1 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow transition-shadow ${!dayMapLink ? 'cursor-pointer active:bg-slate-50' : ''}`}
          onClick={() => {
            if (!dayMapLink) {
              setEditMapLinkUrl(''); 
              setIsMapLinkModalOpen(true);
            }
          }}
        >
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📍</span>
              <div>
                <span className="block text-[13px] font-bold text-slate-800 leading-tight">Itinerario su Maps</span>
                <span className="block text-[10px] text-slate-500 font-medium">
                  {!dayMapLink ? 'Clicca per aggiungere il link' : 'Visualizza percorso completo'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              {!dayMapLink ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] font-bold text-sky-600 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition-colors pointer-events-none"
                >
                  + Inserisci
                </button>
              ) : (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => window.open(dayMapLink, '_blank')}
                    className="text-[11px] font-bold text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100 hover:bg-sky-100 hover:border-sky-200 cursor-pointer flex items-center gap-1 transition-all"
                  >
                    Apri ↗
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { setEditMapLinkUrl(dayMapLink); setIsMapLinkModalOpen(true); }}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Modifica link"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              )}
            </div>
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
            noteCopilota?: string;
            displayMode?: import('../types').TransportDisplayMode;
            stateLabel?: string;
            segmentContext?: import('../types').TransportSegmentContext;
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
              noteCopilota: item.noteCopilota || (item.originalData as any)?.noteCopilota,
              displayMode: (item as any).displayMode,
              stateLabel: (item as any).stateLabel,
              segmentContext: (item as any).segmentContext
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

          const activeStates = dayItems.filter(i => i.displayMode === 'state');
          const visibleCards = dayItems.filter(i => i.displayMode !== 'state');

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
              {activeStates.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {activeStates.map((stateItem, idx) => (
                    <div key={`state-${idx}`} className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3 shadow-xs flex items-center justify-center text-center">
                       <span className="text-[11px] font-bold text-amber-800 tracking-tight">{stateItem.stateLabel}</span>
                    </div>
                  ))}
                </div>
              )}
              {visibleCards.map((item, idx) => {
                const nextItem = visibleCards[idx + 1];

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
                const isAttivita = item.type === 'attivita';

                return (
                  <div key={`${item.id}-${idx}`} ref={(el) => { timelineItemRefs.current[item.id] = el; }}>
                    {/* CARD DELL'ELEMENTO NELLA SEQUENZA */}
                    {isTransport ? (
                      item.id.endsWith('_arrival') || item.id.endsWith('_state') ? (
                        <InTransitBanner transport={item.originalData as Trasporto} dateStr={selectedDate} />
                      ) : (
                        /* Card Biglietto di Viaggio / Boarding Pass per i Trasporti */
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
                    ) : isLodging ? (
                      <AlloggioCard
                        accommodation={item.originalData}
                        onEdit={() => {
                          const found = timeline.find(t => t.id === item.id);
                          if (found) setDetailItem(found);
                        }}
                        onDelete={async () => {
                          await storageService.deleteAccommodation(item.originalData?.id || '');
                          await fetchTimeline();
                        }}
                      />
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
                      /* Fallback generico per altri tipi se esistono */
                      <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm text-center text-slate-500 text-sm">
                        {item.title} (Supporto non completo)
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

      {/* QUICK ACTIONS 2-COLONNE: Emergenze & SOS + Registra Spesa */}
      <div className="grid grid-cols-2 gap-3 mt-1 mb-4">
        {/* Pulsante 1: Emergenze & SOS */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('altro', undefined, 'assicurazione')}
          className="bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] border border-rose-500/30 rounded-2xl p-3 flex items-center gap-2.5 transition-all cursor-pointer text-left w-full"
        >
          <span className="w-8 h-8 rounded-xl bg-rose-500/15 flex items-center justify-center text-base shrink-0 shadow-2xs">
            🚨
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 leading-tight">Emergenze</p>
            <p className="text-[11px] text-rose-600/70 dark:text-rose-400/70 leading-tight mt-0.5">SOS, Polizia, H24</p>
          </div>
        </button>

        {/* Pulsante 2: Registra Spesa */}
        <button
          type="button"
          onClick={() => setIsQuickExpenseOpen(true)}
          className="bg-[#FF6B5F]/10 hover:bg-[#FF6B5F]/20 active:scale-[0.98] border border-[#FF6B5F]/30 rounded-2xl p-3 flex items-center gap-2.5 transition-all cursor-pointer text-left w-full"
        >
          <span className="w-8 h-8 rounded-xl bg-[#FF6B5F]/15 flex items-center justify-center text-base shrink-0 shadow-2xs">
            💳
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#172033] dark:text-slate-400 leading-tight">Nuova Spesa</p>
            <p className="text-[11px] text-[#64748B] dark:text-[#FF9A76]/70 leading-tight mt-0.5">Registra o converti</p>
          </div>
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
                              isRistorante ? 'bg-[#FFF0ED] text-[#172033] border-[#FFF0ED]' :
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
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200/80 animate-scale-up space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#FFF0ED]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FFF0ED] text-[#172033] flex items-center justify-center text-sm font-bold">
                  🧭
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    Note Co-pilota • {copilotPopoverActivity.title}
                  </h3>
                  <p className="text-[10px] text-[#172033] font-semibold truncate max-w-[190px]">
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
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/20 p-3 text-xs text-slate-800 leading-relaxed outline-none transition-all resize-none"
                />
              ) : (
                <div className="bg-[#FFF0ED]/60 p-3.5 rounded-2xl border border-[#FFF0ED] text-xs text-slate-700 leading-relaxed font-medium min-h-[80px]">
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

      {/* Modal Inserimento Link Maps Giornata */}
      <Modal
        isOpen={isMapLinkModalOpen}
        onClose={() => setIsMapLinkModalOpen(false)}
        title="Link Google Maps della Giornata"
        accentVariant="sky"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Incolla qui il link dell'itinerario Google Maps creato per questa giornata. Sarà accessibile rapidamente dalla timeline.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">URL Google Maps</label>
            <input
              type="url"
              placeholder="https://maps.app.goo.gl/..."
              value={editMapLinkUrl}
              onChange={(e) => setEditMapLinkUrl(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => setIsMapLinkModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleSaveDayMapLink}
              className="px-6 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-500 shadow-md transition-colors"
            >
              Salva Link
            </button>
          </div>
        </div>
      </Modal>

      {/* MODALE SPESA RAPIDA */}
      <Modal
        isOpen={isQuickExpenseOpen}
        onClose={() => setIsQuickExpenseOpen(false)}
        title="💳 Nuova Spesa Rapida"
        accentVariant="emerald"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Descrizione *</label>
            <input
              type="text"
              autoFocus
              value={quickExpenseTitle}
              onChange={e => setQuickExpenseTitle(e.target.value)}
              placeholder="es. Cena al porto, Souvenir, Transfer..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Importo *</label>
            <div className="flex gap-2">
              <select
                value={quickExpenseCurrency}
                onChange={e => setQuickExpenseCurrency(e.target.value as 'EUR'|'NZD'|'AUD'|'PHP')}
                className="px-2 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] shrink-0"
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
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-white"
              />
            </div>
            {quickExpenseCurrency !== 'EUR' && quickAmountNum > 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5 px-1 font-medium">
                ≈ <span className="font-bold text-[#FF6B5F]">{quickEur.toFixed(2)} €</span>
                <span className="opacity-70"> (tasso approx. 1€ = {QUICK_RATES[quickExpenseCurrency]} {quickExpenseCurrency})</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsQuickExpenseOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
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
