import { computePasseggiataSequences } from '../utils/passeggiataHelper';
import PushOnboardingBanner from '../components/common/PushOnboardingBanner';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPinPlus } from 'lucide-react';
import { Handshake, ArrowRight } from 'lucide-react';
// GoogleMapsIcon non è nel Focus: Maps e Dettagli rimangono sulla card originale
import type { SectionTab, CategoriaTab, Alloggio, Giorno, TimelineItem, Attivita, Trasporto, Tappa, Ristorante, Shopping, Scadenza } from '../types';
import { storageService } from '../storage/storageService';
import TimelineItemDetailModal from '../components/modals/TimelineItemDetailModal';
import { prepareDuplicateItem } from '../utils/cardDuplication';
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
import { compareTimelineItems, isPhysicalTimelineItem, timelineMinutes } from '../utils/timelineOrdering';
import { computeDayFocalEvent } from '../utils/dayFocusPriority';
import { getEffectiveDeadlineStatus, isDeadlineReminderActive } from '../utils/deadlines';
import TimePickerInput from '../components/common/TimePickerInput';
import { lookupKnownCoordinate } from '../utils/geoCoordinatesHelper';


interface OggiViewProps {
  onNavigateTab?: (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => void;
}

type InsertCategory = 'tappa' | 'attivita' | 'ristorante' | 'alloggio' | 'trasporto' | 'shopping';

const INSERT_CATEGORIES: { type: InsertCategory; label: string; icon: string }[] = [
  { type: 'tappa', label: 'Tappa', icon: '📍' },
  { type: 'attivita', label: 'Attività', icon: '🥾' },
  { type: 'ristorante', label: 'Ristorante', icon: '🍽️' },
  { type: 'alloggio', label: 'Alloggio', icon: '🛏️' },
  { type: 'trasporto', label: 'Trasporto', icon: '✈️' },
  { type: 'shopping', label: 'Shopping', icon: '🛍️' }
];

function suggestTimeBetween(
  previous: { time: string; timeIsDefault?: boolean },
  next: { time: string; timeIsDefault?: boolean }
): string {
  if (previous.timeIsDefault || next.timeIsDefault) return '';
  const parseMinutes = (value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = parseMinutes(previous.time);
  const end = parseMinutes(next.time);
  if (start === null || end === null || end - start < 2) return '';
  const midpoint = Math.floor((start + end) / 2);
  return `${String(Math.floor(midpoint / 60)).padStart(2, '0')}:${String(midpoint % 60).padStart(2, '0')}`;
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
  const [deadlines, setDeadlines] = useState<Scadenza[]>([]);
  const [daysData, setDaysData] = useState<Giorno[]>([]);
  const [, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
    useEffect(() => {
    const loadDeadlines = async () => setDeadlines(await storageService.getScadenze());
    loadDeadlines();
    const handleMutation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.entityType || detail.entityType === 'note') loadDeadlines();
    };
    window.addEventListener('roadbook_data_mutated', handleMutation);
    return () => window.removeEventListener('roadbook_data_mutated', handleMutation);
  }, [tripId]);
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
  const heroModalRef = useRef<HTMLDivElement>(null);
  const copilotModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHeroEditOpen && !copilotPopoverActivity) return;
    const dialog = isHeroEditOpen ? heroModalRef.current : copilotModalRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      if (dialog && !dialog.contains(document.activeElement)) {
        dialog.focus();
      }
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isHeroEditOpen) setIsHeroEditOpen(false);
        else setCopilotPopoverActivity(null);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [copilotPopoverActivity, isHeroEditOpen]);

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
  const insertMenuInputRef = useRef<HTMLInputElement>(null);
  const timelineItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Evidenziazione e scorrimento automatico diretto alla card originale nella timeline
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToTimelineCard = useCallback((itemId: string) => {
    if (!itemId) return;
    const targetEl = timelineItemRefs.current[itemId] ||
                     timelineItemRefs.current[`lodging_${itemId}`] ||
                     document.getElementById(`timeline-card-${itemId}`) ||
                     document.getElementById(`timeline-card-lodging_${itemId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCardId(itemId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedCardId(null);
      }, 2200);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Modali Dettaglio e Modifica
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null);
  const [editingActivityItem, setEditingActivityItem] = useState<Attivita | null>(null);
  const [editingTransportItem, setEditingTransportItem] = useState<Trasporto | null>(null);
  const [editingTappaItem, setEditingTappaItem] = useState<Tappa | null>(null);
  const [editingAlloggioItem, setEditingAlloggioItem] = useState<Alloggio | null>(null);
  const [editingRistoranteItem, setEditingRistoranteItem] = useState<Ristorante | null>(null);
  const [editingShoppingItem, setEditingShoppingItem] = useState<Shopping | null>(null);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState<InsertCategory | null>(null);
  const [insertMenuAfterId, setInsertMenuAfterId] = useState<string | null>(null);
  const [insertDraftTime, setInsertDraftTime] = useState('');
  const [insertMenuPosition, setInsertMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    openAbove: boolean;
  } | null>(null);
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const showFeedbackBanner = useCallback((msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => {
      setFeedbackBanner(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const closeCreateForm = () => {
    setCreatingCategory(null);
    setInsertDraftTime('');
  };

  const closeInsertMenu = useCallback(() => {
    setInsertMenuAfterId(null);
    setInsertMenuPosition(null);
  }, []);

  useEffect(() => {
    const handleOpenEditTappa = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.tappa) {
        setEditingTappaItem(custom.detail.tappa);
      }
    };
    window.addEventListener('open_edit_tappa_modal', handleOpenEditTappa);
    return () => window.removeEventListener('open_edit_tappa_modal', handleOpenEditTappa);
  }, []);

  useEffect(() => {
    if (!insertMenuAfterId) return;
    insertMenuInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeInsertMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeInsertMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeInsertMenu);
    };
  }, [closeInsertMenu, insertMenuAfterId]);

  const scrollToCurrentEvent = useCallback(() => {
    if (!timeline || timeline.length === 0) return;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    let closestId = timeline[0]?.id;
    let minDiff = Infinity;

    timeline.forEach(item => {
      const itemMin = timelineMinutes(item.time);
      if (itemMin !== null) {
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

    // SOLA LETTURA: aprire o aggiornare la schermata non deve MAI cancellare record.
    // (Rimosse le vecchie cancellazioni hardcoded sul roadbook originale: i record legacy
    // sono già stati riconciliati con tombstone dal manifest 0000.)
    const filteredItems = items;

    setTimeline(filteredItems);

    // Rilevamento collisioni orarie (2 o più eventi allo stesso orario non fittizio)
    try {
      const byTime: { [time: string]: TimelineItem[] } = {};
      filteredItems.forEach(item => {
        if (!item.time) return;
        // Orari predefiniti/indicativi e promemoria alloggio non sono dati certi: mai collisioni
        if (item.timeIsDefault || item.type === 'alloggio') return;
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
      setTomorrowTimeline(tItems);
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
      if (selectedDayBtnRef.current) {
        selectedDayBtnRef.current.scrollIntoView({
          inline: 'center',
          block: 'nearest',
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

  const handleDuplicateItem = (item: TimelineItem) => {
    setDetailItem(null);
    try {
      const prepared = prepareDuplicateItem(item);
      if (prepared.type === 'tappa') {
        setEditingTappaItem(prepared.data as Tappa);
      } else if (prepared.type === 'attivita') {
        setEditingActivityItem(prepared.data as Attivita);
      } else if (prepared.type === 'alloggio') {
        setEditingAlloggioItem(prepared.data as Alloggio);
      } else if (prepared.type === 'trasporto') {
        setEditingTransportItem(prepared.data as Trasporto);
      } else if (prepared.type === 'ristorante') {
        setEditingRistoranteItem(prepared.data as Ristorante);
      } else if (prepared.type === 'shopping') {
        setEditingShoppingItem(prepared.data as Shopping);
      }
    } catch (e) {
      console.error('Errore duplicazione item:', e);
    }
  };

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
    setCreatingCategory(null);
    setInsertDraftTime('');

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
    setCreatingCategory(null);
    setInsertDraftTime('');
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
    setCreatingCategory(null);
    setInsertDraftTime('');

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
    setCreatingCategory(null);
    setInsertDraftTime('');
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
    setCreatingCategory(null);
    setInsertDraftTime('');
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
    setCreatingCategory(null);
    setInsertDraftTime('');
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

  // ─── LIVELLO 1: Calcolo deterministico evento focale della giornata (FASE 1) ───
  const focalResult = useMemo(() => {
    return computeDayFocalEvent(timeline, selectedDate, new Date());
  }, [timeline, selectedDate]);

  const nextEventItem = focalResult.focalItem;

  
  
  const deadlineSummary = useMemo(() => {
    const active = deadlines.filter(item => getEffectiveDeadlineStatus(item) !== 'completata');
    const reminders = active.filter(item => isDeadlineReminderActive(item));
    return { active: active.length, reminders: reminders.length, next: active[0] || null };
  }, [deadlines]);

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-6 sm:pb-8">
      {/* Banner di Onboarding Notifiche al primo accesso */}
      <PushOnboardingBanner />

      {/* Avviso Persistente Scadenze Urgenti In-App: attivo solo in caso di promemoria attivo per non appesantire l'altezza su mobile */}
      {deadlineSummary.reminders > 0 && deadlineSummary.next && (
        <div className="mx-auto max-w-full rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50/95 dark:bg-amber-950/40 px-3 py-2 text-slate-900 dark:text-slate-100 animate-fade-in flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0" aria-hidden="true">⏰</span>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              <span className="font-extrabold uppercase text-[10px] tracking-wider text-amber-800 dark:text-amber-300 mr-1.5">
                Promemoria
              </span>
              {deadlineSummary.next.title}
              {deadlineSummary.next.dueDate ? ` · Entro ${deadlineSummary.next.dueTime ? `${deadlineSummary.next.dueTime} del ` : ''}${deadlineSummary.next.dueDate}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('altro', undefined, 'scadenze')}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] shadow-2xs transition-colors cursor-pointer"
          >
            Gestisci ➔
          </button>
        </div>
      )}
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
      <div className="hidden lg:flex sticky top-0 z-40 items-center justify-between gap-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-[#172033]/95 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[#FF6B5F]">
            <span>{currentDayMeta?.dayNum ? `Giorno ${currentDayMeta.dayNum}` : 'Pre-viaggio'}</span>
            <span aria-hidden="true">•</span>
            <span>{formatDateHuman(selectedDate)}</span>
          </div>
          {currentDayData?.location && (
            <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {currentDayData.location}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2" aria-label="Cambia giorno">
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => currentIndex > 0 && setSelectedDate(tripDays[currentIndex - 1].dateStr)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:border-[#FF6B5F] hover:text-[#FF6B5F] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Giorno precedente"
          >
            ← Prima
          </button>
          <button
            type="button"
            disabled={currentIndex < 0 || currentIndex >= tripDays.length - 1}
            onClick={() => currentIndex >= 0 && currentIndex < tripDays.length - 1 && setSelectedDate(tripDays[currentIndex + 1].dateStr)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:border-[#FF6B5F] hover:text-[#FF6B5F] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Giorno successivo"
          >
            Dopo →
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Masthead Editoriale / Taccuino di Bordo Compatto */}
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

          <div className="relative z-10 px-3.5 py-2.5 sm:px-5 sm:py-3 space-y-1.5">
            {/* Riga 1: Kicker Giorno/Data e Countdown/Stato */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-[10px] font-black uppercase tracking-wider truncate ${heroBgImage ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}>
                  {currentDayMeta && currentDayMeta.dayNum > 0
                    ? `GIORNO ${currentDayMeta.dayNum} DI ${tripDays.length} • ${formatDateHuman(selectedDate).toUpperCase()}`
                    : `PRE-VIAGGIO • ${formatDateHuman(selectedDate).toUpperCase()}`}
                </span>

                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    OFFLINE
                  </span>
                )}
              </div>

              {/* Indicatore Stato o Countdown */}
              <div className="shrink-0">
                {(() => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const startDateStr = tripConfig?.startDate || tripDays[0]?.dateStr || '2026-11-28';
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
              </div>
            </div>

            {/* Riga 2: Scadenze e Modifica affiancati per compattare l'altezza */}
            {(deadlineSummary.active > 0 || canEdit) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {deadlineSummary.active > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab?.('altro', undefined, 'scadenze')}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition-all cursor-pointer ${
                      deadlineSummary.reminders > 0
                        ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 animate-pulse shadow-xs'
                        : heroBgImage
                        ? 'bg-amber-400/25 text-amber-200 border border-amber-400/40'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30'
                    }`}
                    title="Visualizza scadenze e promemoria"
                  >
                    <span>🔔</span>
                    <span>{deadlineSummary.reminders > 0 ? `${deadlineSummary.reminders} da fare` : `${deadlineSummary.active} scadenze`}</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={handleOpenHeroEdit}
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                      heroBgImage
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                    }`}
                    title="Personalizza copertina o titolo"
                  >
                    <span>✏️</span>
                    <span>Modifica</span>
                  </button>
                )}
              </div>
            )}

            {/* Riga 2: Titolo Taccuino & Posizione Chiave */}
            <div className="flex items-baseline justify-between gap-3 pt-0.5">
              <div className="min-w-0 flex-1">
                <h1 className={`text-lg sm:text-xl font-black font-brand-title tracking-tight leading-tight truncate ${
                  heroBgImage ? 'text-white' : 'text-[#172033] dark:text-white'
                }`}>
                  {currentDayData?.title || dynamicCountries || 'Diario di Bordo'}
                </h1>
                
                {currentDayData?.location && (
                  <p className={`text-xs font-semibold flex items-center gap-1 mt-0.5 truncate ${
                    heroBgImage ? 'text-rose-200' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    <span className="text-rose-500 shrink-0">📍</span>
                    <span className="truncate">{currentDayData.location}</span>
                  </p>
                )}
              </div>

              {/* Scorciatoia "Torna a Oggi" se l'utente sta consultando un'altra data */}
              {selectedDate !== new Date().toISOString().split('T')[0] && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#FFF0ED] text-[#FF6B5F] dark:bg-rose-950/40 dark:text-rose-300 border border-[#FF6B5F]/30 hover:bg-[#FFE2DE] transition-colors cursor-pointer"
                >
                  Torna a Oggi ➔
                </button>
              )}
            </div>
          </div>
        </div>



        {/* ─── LIVELLO 1: HERO PROSSIMA ATTIVITÀ / FOCUS TEMPORALE REALE ─── */}
        {(() => {
          const todayStr = new Date().toISOString().split('T')[0];
          const startDateStr = tripConfig?.startDate || tripDays[0]?.dateStr || (isMasterTrip ? '2026-11-28' : todayStr);
          const endDateStr = tripConfig?.endDate || (isMasterTrip ? '2027-01-10' : startDateStr);
          const isViewingOtherDate = selectedDate !== todayStr;
          const isPreTrip = !isViewingOtherDate && todayStr < startDateStr && !nextEventItem;
          const isPostTrip = !isViewingOtherDate && todayStr > endDateStr;

          if (isViewingOtherDate) {
            if (!nextEventItem) return null;

            return (
              <div
                onClick={() => scrollToTimelineCard(nextEventItem.id)}
                className="bg-white dark:bg-[#172033] text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs space-y-1.5 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    scrollToTimelineCard(nextEventItem.id);
                  }
                }}
                title="Tocca per andare alla card nella timeline"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] dark:text-[#ff9a90] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F]" />
                    Focus della giornata · {formatDateHuman(selectedDate)}
                  </span>
                  {nextEventItem.time ? (
                    <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-white bg-slate-100 dark:bg-white/12 px-2 py-0.5 rounded border border-slate-200/80 dark:border-white/15 shrink-0 tabular-nums">
                      ORE {nextEventItem.time}{nextEventItem.timeStatus === 'indicativo' ? ' · IND.' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded shrink-0">
                      Orario libero
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                      {nextEventItem.title}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5 truncate">
                      {(() => {
                        if (nextEventItem.type === 'trasporto' && nextEventItem.originalData) {
                          const tr = nextEventItem.originalData as Trasporto;
                          const dep = tr.departureLocation || nextEventItem.location;
                          const arr = tr.dropoffLocation || tr.arrivalLocation;
                          if (dep && arr && dep !== arr) return `${dep} → ${arr}`;
                        }
                        return nextEventItem.location || 'Posizione programmata';
                      })()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToTimelineCard(nextEventItem.id);
                    }}
                    className="p-1 rounded-md text-slate-400 group-hover:text-[#FF6B5F] dark:text-slate-400 dark:group-hover:text-[#ff9a90] group-hover:translate-x-0.5 transition-all shrink-0 cursor-pointer"
                    aria-label="Raggiungi card nella timeline"
                    title="Raggiungi card nella timeline"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          }

          if (isPreTrip) {
            return (
              <div className="bg-white dark:bg-[#172033] rounded-2xl border border-slate-200/90 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] p-3.5 sm:p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B5F] animate-pulse" />
                    In attesa della partenza
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(startDateStr)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#FF6B5F] bg-[#FFF0ED] dark:bg-rose-950/40 hover:bg-[#FFE2DE] border border-[#FF6B5F]/30 transition-colors cursor-pointer"
                  >
                    Giorno 1 ({formatDateHuman(startDateStr)}) ➔
                  </button>
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold font-brand-title text-[#172033] dark:text-white">
                    Partenza: {formatDateHuman(startDateStr)}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {calculateCountdown()} • Consulta le tappe nel calendario sottostante per preparare i dettagli.
                  </p>
                </div>
              </div>
            );
          }

          if (isPostTrip) {
            return (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-emerald-950/40 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 border-l-4 border-l-emerald-500 p-3.5 sm:p-4 shadow-xs space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Viaggio completato
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#172033] dark:text-white">
                    💍 Viaggio concluso il {formatDateHuman(endDateStr)}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Tutte le tappe del diario sono state completate. Puoi ripercorrere l'itinerario e i ricordi nelle sezioni dell'app.
                  </p>
                </div>
              </div>
            );
          }

          // Se tutte le attività programmate di oggi sono concluse
          if (focalResult.allCompleted) {
            return (
              <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/90 dark:border-slate-800 border-l-4 border-l-emerald-500 p-3.5 sm:p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Attività di oggi completate
                  </span>
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#172033] dark:text-white">
                    Tutti gli impegni di oggi sono stati conclusi
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tonightsAccommodation ? `Pernottamento serale: ${tonightsAccommodation.name}. Riposa o goditi la serata.` : 'Tempo libero e relax serale.'}
                  </p>
                </div>
              </div>
            );
          }

          // Durante il viaggio nella data odierna: prossimo passo attivo
          return (
            <div
              onClick={() => nextEventItem && scrollToTimelineCard(nextEventItem.id)}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs space-y-1.5 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && nextEventItem) {
                  e.preventDefault();
                  scrollToTimelineCard(nextEventItem.id);
                }
              }}
              title="Tocca per andare alla card nella timeline"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF6B5F] animate-pulse" />
                  In questo momento • Prossimo passo
                </span>

                {nextEventItem?.time ? (
                  <span className="font-mono text-xs font-black text-[#172033] dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700">
                    ORE {nextEventItem.time}{nextEventItem.timeStatus === 'indicativo' ? ' · IND.' : ''}
                  </span>
                ) : nextEventItem ? (
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Orario libero
                  </span>
                ) : null}
              </div>

              {nextEventItem ? (
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight truncate">
                      {nextEventItem.title}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
                      {(() => {
                        if (nextEventItem.type === 'trasporto' && nextEventItem.originalData) {
                          const tr = nextEventItem.originalData as Trasporto;
                          const dep = tr.departureLocation || nextEventItem.location;
                          const arr = tr.dropoffLocation || tr.arrivalLocation;
                          if (dep && arr && dep !== arr) return `${dep} → ${arr}`;
                        }
                        return nextEventItem.location || 'Posizione da itinerario';
                      })()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToTimelineCard(nextEventItem.id);
                    }}
                    className="p-1 rounded-md text-slate-400 group-hover:text-[#FF6B5F] dark:text-slate-400 dark:group-hover:text-[#ff9a90] group-hover:translate-x-0.5 transition-all shrink-0 cursor-pointer"
                    aria-label="Raggiungi card nella timeline"
                    title="Raggiungi card nella timeline"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="py-1">
                  <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    Giornata libera senza trasferimenti programmati
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tonightsAccommodation
                      ? `Pernottamento presso ${tonightsAccommodation.name}. Tempo a disposizione per visite ed esplorazioni.`
                      : 'Nessun impegno a orario fisso registrato nel roadbook per questo orario.'}
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Suggerimento Foto Pre-partenza (discreto, accessibile ma subordinato all'evento prioritario) */}
        <PreDeparturePhotoCard
          tripId={tripId}
          startDate={tripConfig?.startDate || tripDays[0]?.dateStr || (isMasterTrip ? TRIP_START_DATE : '')}
          canEdit={canEdit}
          onOpenLive={() => onNavigateTab?.('altro', undefined, 'live')}
        />
      </div>

      {/* HERO EDIT MODAL */}
      {isHeroEditOpen && createPortal(
        <div
          className="modal-backdrop-layer"
          onClick={() => setIsHeroEditOpen(false)}
        >
          <div
            ref={heroModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Personalizza header"
            tabIndex={-1}
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
          const todayStr = new Date().toISOString().split('T')[0];
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
            timeIsDefault?: boolean;
            timeStatus?: import('../types').TimeStatus;
            effectiveDate?: string;
            physicalLocation?: boolean;
            informational?: boolean;
          }[] = [];

          const sortedTimeline = [...timeline].sort(compareTimelineItems);

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
              const isDropoffEvent = item.id.endsWith('_dropoff') || (tr && (tr.type === 'auto' || tr.type === 'camper') && tr.dropoffDate === selectedDate && tr.dropoffDate !== tr.date);
              const isPickupEvent = item.id.endsWith('_pickup') || (tr && (tr.type === 'auto' || tr.type === 'camper') && tr.date === selectedDate);

              if (item.segmentContext === 'arrival') {
                departurePoint = tr.arrivalLocation || item.location;
                arrivalPoint = tr.arrivalLocation || item.location;
              } else if (isDropoffEvent) {
                // Per un evento di riconsegna noleggio, il punto geografico è il deposito di riconsegna
                departurePoint = tr.dropoffLocation || tr.arrivalLocation || item.location;
                arrivalPoint = tr.dropoffLocation || tr.arrivalLocation || item.location;
              } else if (isPickupEvent) {
                // Per il ritiro noleggio, il punto geografico è il deposito di ritiro
                departurePoint = tr.departureLocation || item.location;
                arrivalPoint = tr.departureLocation || item.location;
              } else {
                departurePoint = tr.departureLocation || item.location;
                arrivalPoint = tr.dropoffLocation || tr.arrivalLocation || item.location;
              }
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
                originalData: tonightsAccommodation,
                timeIsDefault: false,
                informational: true,
                physicalLocation: false
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
              coordinate: item.coordinate || (departurePoint ? lookupKnownCoordinate(departurePoint) || undefined : undefined),
              originalData: item.originalData,
              copilota: item.copilota,
              noteCopilota: item.noteCopilota || (item.originalData as any)?.noteCopilota,
              displayMode: (item as any).displayMode,
              stateLabel: (item as any).stateLabel,
              segmentContext: (item as any).segmentContext,
              timeIsDefault: item.timeIsDefault,
              timeStatus: item.timeStatus,
              effectiveDate: item.effectiveDate,
              informational: item.informational,
              physicalLocation: item.physicalLocation
            });
          });

          if (tonightsAccommodation && checkInTime && !addedCheckinCallout) {
            const accLoc = tonightsAccommodation.address || tonightsAccommodation.location || tonightsAccommodation.name;
            dayItems.push({
              id: `checkin_callout_${tonightsAccommodation.id}`,
              type: 'checkin_callout',
              time: checkInTime,
              title: `Check-in disponibile: ${tonightsAccommodation.name}`,
              location: accLoc,
              coordinate: tonightsAccommodation.coordinate,
              originalData: tonightsAccommodation,
              timeIsDefault: false,
              informational: true,
              physicalLocation: false
            });
          }

          const activeRentalItems = dayItems.filter(item => item.id.endsWith('_state') || (item as any).displayMode === 'state');
          const visibleCards = dayItems.filter(item => !item.id.endsWith('_state') && (item as any).displayMode !== 'state');
          const passeggiataSequences = computePasseggiataSequences(visibleCards);

          if (visibleCards.length === 0 && !tonightsAccommodation && activeRentalItems.length === 0) {
            return (
              <div className="bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-200/80 dark:border-slate-800 border-dashed p-6 text-center space-y-3">
                {canEdit ? (
                  <div className="py-2 flex flex-col items-center justify-center space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Nessuna attività programmata per {selectedDate === todayStr ? 'oggi' : 'questa giornata'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCategoryPickerOpen(true)}
                      className="hounigo-button-primary inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black active:scale-95 shadow-md shadow-[#FF6B5F]/20 cursor-pointer"
                    >
                      <MapPinPlus className="w-5 h-5 shrink-0" />
                      <span>+ Aggiungi al viaggio</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-2">
                    <span className="text-2xl mb-1 block">🧭</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Nessuna attività programmata per {selectedDate === todayStr ? 'oggi' : 'questa giornata'}
                    </p>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-3">
              {/* ─── LIVELLO C: INFORMAZIONI DI CONTESTO (Noleggi attivi senza spezzare la timeline) ─── */}
              {activeRentalItems.length > 0 && (
                <div className="space-y-2">
                  {activeRentalItems.map(item => {
                    const tr = item.originalData as Trasporto;
                    const isCar = tr?.type === 'auto';
                    const tomorrowDateStr = getTomorrowDateStr(selectedDate);
                    const isTomorrowDropoff = tr?.dropoffDate === tomorrowDateStr;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setDetailItem(item as any as TimelineItem)}
                        className={`rounded-2xl border p-3 flex items-center justify-between gap-3 transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
                          isTomorrowDropoff
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                            : 'bg-white dark:bg-[#172033] border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm shrink-0">
                            {isCar ? '🚗' : '🚐'}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {isCar ? 'Auto a noleggio attiva' : 'Campervan attivo'}
                                {tr?.carrier ? ` • ${tr.carrier.split('(')[0].trim()}` : ''}
                              </span>
                              {isTomorrowDropoff && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200 uppercase">
                                  Riconsegna domani
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              Riconsegna il {tr?.dropoffDate ? formatDateIT(tr.dropoffDate) : '...'} {tr?.dropoffTime ? `alle ${tr.dropoffTime}` : ''} a {tr?.dropoffLocation?.split('(')[0]?.trim() || tr?.arrivalLocation || 'destinazione'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
                          Dettagli ➔
                        </span>
                      </div>
                    );
                  })}
</div>
              )}

              {/* TIMELINE CRONOLOGICA DEGLI EVENTI DI GIORNATA */}
              {visibleCards.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 px-1 pt-1 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#FF6B5F]" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                        {selectedDate === todayStr ? 'Itinerario & Tappe di Giornata' : 'Itinerario del Giorno'}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setIsCategoryPickerOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] dark:text-[#ff9a90] text-xs font-bold hover:bg-[#ffe2dc] active:scale-95 transition-all shadow-2xs border border-[#FF6B5F]/30 cursor-pointer"
                        title="Aggiungi una tappa, attività, alloggio o trasporto a questa giornata"
                      >
                        <span className="text-sm font-extrabold leading-none">+</span>
                        <span>Aggiungi</span>
                      </button>
                    )}
                  </div>

                  {visibleCards.map((item, idx) => {
                    const nextItem = isPhysicalTimelineItem(item as TimelineItem)
                      ? visibleCards.slice(idx + 1).find(candidate => isPhysicalTimelineItem(candidate as TimelineItem))
                      : undefined;
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
                        id={`timeline-card-${item.id}`}
                        ref={(el) => { timelineItemRefs.current[item.id] = el; }}
                        className={`hounigo-timeline-item transition-all duration-300 ${highlightedCardId === item.id ? 'hounigo-card-highlighted' : ''}`}
                        style={{ animationDelay: `${Math.min(idx * 28, 168)}ms` }}
                      >
                        {isCheckinCallout ? (
                          /* Tappa informativa rapida per check-in */
                          <div
                            onClick={() => {
                              const targetEl = timelineItemRefs.current[`lodging_${tonightsAccommodation?.id}`];
                              if (targetEl) {
                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className="bg-[#F4F1FE] dark:bg-purple-950/35 border border-[#DFD6FC] dark:border-purple-800/60 border-l-4 border-l-[#6842EF] rounded-lg px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#EBE5FD] transition-all cursor-pointer"
                          >
                            <div className="min-w-0">
                              <span className="block text-[11px] font-extrabold uppercase tracking-wide text-[#321B75] dark:text-purple-200 truncate">
                                {item.title}
                              </span>
                              <span className="block font-mono text-[10px] font-bold text-[#53389E] dark:text-purple-300 truncate">
                                Check-in attivo dalle ore {item.time} · Vai alla scheda alloggio
                              </span>
                            </div>
                            <span className="text-xs font-extrabold text-[#321B75] dark:text-purple-300 shrink-0">
                              Alloggio ↓
                            </span>
                          </div>
                        ) : isTransport ? (
                          item.id.endsWith('_arrival') ? (
                            <InTransitBanner transport={item.originalData as Trasporto} dateStr={selectedDate} segmentContext={item.segmentContext} />
                          ) : (
                            <TrasportoCard
                              transport={item.originalData as Trasporto}
                              variant="compact"
                              contextDate={selectedDate}
                              segmentContext={item.segmentContext}
                              onDetail={() => {
                                const found = timeline.find(t => t.id === item.id);
                                if (found) setDetailItem(found);
                                else setEditingTransportItem(item.originalData as Trasporto);
                              }}
                              onEdit={() => setEditingTransportItem(item.originalData as Trasporto)}
                              onDelete={async () => {
                                await storageService.deleteTransport(item.originalData?.id || '');
                                await fetchTimeline();
                              }}
                              onUpdate={() => fetchTimeline()}
                              onDuplicate={() => handleDuplicateItem(item as TimelineItem)}
                            />
                          )
                        ) : isAttivita ? (
                          <AttivitaCard
                            activity={item.originalData as Attivita}
                            variant="compact"
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteActivity(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                            onUpdate={() => fetchTimeline()}
                            onDuplicate={() => handleDuplicateItem(item as TimelineItem)}
                          />
                        ) : isRistorante ? (
                          <RistoranteCard
                            ristorante={item.originalData}
                            variant="compact"
                            onEdit={() => {
                              const found = timeline.find(t => t.id === item.id);
                              if (found) setDetailItem(found);
                            }}
                            onDelete={async () => {
                              await storageService.deleteRistorante(item.originalData?.id || '');
                              await fetchTimeline();
                            }}
                            onUpdate={() => fetchTimeline()}
                            onDuplicate={() => handleDuplicateItem(item as TimelineItem)}
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
                            onUpdate={() => fetchTimeline()}
                            onDuplicate={() => handleDuplicateItem(item as TimelineItem)}
                          />
                        ) : isTappa ? (
                          <>
                            <TappaCard
                              tappa={item.originalData}
                              variant="compact"
                              onEdit={() => {
                                const found = timeline.find(t => t.id === item.id);
                                if (found) setDetailItem(found);
                              }}
                              onDelete={async () => {
                                await storageService.deleteTappa(item.originalData?.id || '');
                                await fetchTimeline();
                              }}
                              onUpdate={() => fetchTimeline()}
                              onDuplicate={() => handleDuplicateItem(item as TimelineItem)}
                            />
                            {(() => {
                              const seq = passeggiataSequences.get(item.id);
                              return seq?.inSequence && !seq.isLast ? (
                                <div className="flex items-center gap-2 pl-6 py-1 -my-1 text-xs">
                                  <div className="w-0.5 h-3 bg-emerald-400 dark:bg-emerald-500 border-l border-dashed ml-3" />
                                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                                    <span>🚶</span> Percorso a tappe collegato ➔
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </>
                        ) : (
                          <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm text-center text-slate-500 text-sm">
                            {item.title}
                          </div>
                        )}

                        {canEdit && nextItem && (
                          <div className="group relative hidden min-h-7 items-center justify-center lg:flex">
                            <div className="absolute inset-x-8 top-1/2 border-t border-dashed border-slate-200 dark:border-slate-800" />
                            <button
                              type="button"
                              onClick={(event) => {
                                if (insertMenuAfterId === item.id) {
                                  closeInsertMenu();
                                  return;
                                }
                                const rect = event.currentTarget.getBoundingClientRect();
                                const width = Math.min(544, window.innerWidth - 24);
                                const openAbove = window.innerHeight - rect.bottom < 260 && rect.top > 260;
                                const left = Math.min(
                                  Math.max(12, rect.left + (rect.width / 2) - (width / 2)),
                                  window.innerWidth - width - 12
                                );
                                setInsertDraftTime(suggestTimeBetween(item, nextItem));
                                setInsertMenuPosition({
                                  left,
                                  top: openAbove ? rect.top - 8 : rect.bottom + 8,
                                  width,
                                  openAbove
                                });
                                setInsertMenuAfterId(item.id);
                              }}
                              className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-bold text-slate-500 shadow-sm transition hover:border-[#FF6B5F] hover:text-[#FF6B5F] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]/35 dark:border-slate-700 dark:bg-slate-900 ${insertMenuAfterId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                              aria-label={`Inserisci una card dopo ${item.title}`}
                              aria-expanded={insertMenuAfterId === item.id}
                            >
                              +
                            </button>
                            {insertMenuAfterId === item.id && insertMenuPosition && createPortal(
                              <div
                                className="fixed inset-0 z-[100000]"
                                onMouseDown={closeInsertMenu}
                                role="presentation"
                              >
                              <div
                                className="fixed max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-[#172033]"
                                style={{
                                  left: insertMenuPosition.left,
                                  top: insertMenuPosition.top,
                                  width: insertMenuPosition.width,
                                  transform: insertMenuPosition.openAbove ? 'translateY(-100%)' : undefined
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                                role="dialog"
                                aria-label="Inserisci una nuova card"
                              >
                                <div className="mb-3 flex items-end gap-3">
                                  <label className="min-w-0 flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                    Orario della nuova card
                                    <span className="mt-1 block"><TimePickerInput inputRef={insertMenuInputRef} value={insertDraftTime} onChange={setInsertDraftTime} ariaLabel="Orario della nuova card" /></span>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={closeInsertMenu}
                                    className="rounded-lg px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    Chiudi
                                  </button>
                                </div>
                                {!insertDraftTime && (
                                  <p className="mb-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                    Gli orari vicini non consentono una deduzione sicura: scegli l'orario.
                                  </p>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                  {INSERT_CATEGORIES.map((category) => (
                                    <button
                                      key={category.type}
                                      type="button"
                                      disabled={!insertDraftTime}
                                      onClick={() => {
                                        setCreatingCategory(category.type);
                                        closeInsertMenu();
                                      }}
                                      className="rounded-xl border border-slate-200 px-2 py-2 text-left text-[11px] font-bold text-slate-700 transition hover:border-[#FF6B5F] hover:text-[#FF6B5F] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                    >
                                      <span className="mr-1 inline-flex items-center align-middle" aria-hidden="true">
                                        {category.type === 'tappa' ? <MapPinPlus className="w-3.5 h-3.5 text-[#FF6B5F] inline" /> : category.icon}
                                      </span>
                                      {category.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              </div>,
                              document.body
                            )}
                          </div>
                        )}

                        {/* ROUTEBADGE SEQUENZIALE CON SFONDO/PERCORSO TRATTEGGIATO */}
                        {isPhysicalTimelineItem(item as TimelineItem) && nextItem && fromLoc && toLoc && fromLoc.trim().toLowerCase() !== toLoc.trim().toLowerCase() && (
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
                                isFlight={(item.type === 'trasporto' && (item.originalData as Trasporto)?.type === 'volo') || (nextItem.type === 'trasporto' && (nextItem.originalData as Trasporto)?.type === 'volo')}
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
                    id={`timeline-card-lodging_${tonightsAccommodation.id}`}
                    ref={(el) => {
                      timelineItemRefs.current[`lodging_${tonightsAccommodation.id}`] = el;
                      timelineItemRefs.current[tonightsAccommodation.id] = el;
                    }}
                    className={`transition-all duration-300 ${(highlightedCardId === tonightsAccommodation.id || highlightedCardId === `lodging_${tonightsAccommodation.id}`) ? 'hounigo-card-highlighted' : ''}`}
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
                      onUpdate={() => {
                        fetchTimeline();
                        loadData(false);
                      }}
                      onDuplicate={() => {
                        const acc = tonightsAccommodation;
                        handleDuplicateItem({
                          id: acc.id,
                          type: 'alloggio',
                          time: acc.checkIn || '15:00',
                          title: acc.name,
                          location: acc.address || '',
                          categoryOrType: 'alloggio',
                          originalData: acc
                        });
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
          <div className="flex gap-3 overflow-x-auto snap-x no-scrollbar px-1 pb-2 pt-1 -mx-1">
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

      {/* Modale Dettaglio Timeline */}
      <TimelineItemDetailModal
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        onEdit={handleOpenEditFromDetail}
        onDuplicate={handleDuplicateItem}
      />

      {/* Modale Form Attività */}
      <Modal
        isOpen={Boolean(editingActivityItem) || creatingCategory === 'attivita'}
        onClose={() => { setEditingActivityItem(null); closeCreateForm(); }}
        title={editingActivityItem ? 'Modifica Attività' : 'Nuova Attività'}
        accentVariant="amber"
      >
        <AttivitaForm
          days={daysData}
          selectedDayId={editingActivityItem?.dayId || `day_${selectedDate}`}
          defaultTime={creatingCategory === 'attivita' ? insertDraftTime : undefined}
          initialData={editingActivityItem}
          onSave={handleSaveActivity}
          onCancel={() => { setEditingActivityItem(null); closeCreateForm(); }}
          onDelete={handleDeleteActivityFromForm}
        />
      </Modal>

      {/* Modale Form Trasporto */}
      <Modal
        isOpen={Boolean(editingTransportItem) || creatingCategory === 'trasporto'}
        onClose={() => { setEditingTransportItem(null); closeCreateForm(); }}
        title={editingTransportItem ? 'Modifica Trasporto' : 'Nuovo Trasporto'}
        accentVariant="sky"
      >
        <TrasportoForm
          initialData={editingTransportItem}
          defaultDate={creatingCategory === 'trasporto' ? selectedDate : undefined}
          defaultTime={creatingCategory === 'trasporto' ? insertDraftTime : undefined}
          onSave={handleSaveTransport}
          onCancel={() => { setEditingTransportItem(null); closeCreateForm(); }}
          onDelete={handleDeleteTransportFromForm}
        />
      </Modal>

      {/* Modale Form Tappa */}
      <Modal
        isOpen={Boolean(editingTappaItem) || creatingCategory === 'tappa'}
        onClose={() => { setEditingTappaItem(null); closeCreateForm(); }}
        title={editingTappaItem ? 'Modifica Tappa' : 'Nuova Tappa'}
        accentVariant="rose"
      >
        <TappaForm
          initialData={editingTappaItem}
          defaultDate={selectedDate}
          defaultTime={creatingCategory === 'tappa' ? insertDraftTime : undefined}
          onSave={handleSaveTappa}
          onCancel={() => { setEditingTappaItem(null); closeCreateForm(); }}
          onDelete={handleDeleteTappaFromForm}
        />
      </Modal>

      {/* Modale Form Alloggio */}
      <Modal
        isOpen={Boolean(editingAlloggioItem) || creatingCategory === 'alloggio'}
        onClose={() => { setEditingAlloggioItem(null); closeCreateForm(); }}
        title={editingAlloggioItem ? 'Modifica Alloggio' : 'Nuovo Alloggio'}
        accentVariant="purple"
      >
        <AlloggioForm
          initialData={editingAlloggioItem}
          defaultDate={creatingCategory === 'alloggio' ? selectedDate : undefined}
          defaultTime={creatingCategory === 'alloggio' ? insertDraftTime : undefined}
          onSave={handleSaveAlloggio}
          onCancel={() => { setEditingAlloggioItem(null); closeCreateForm(); }}
          onDelete={handleDeleteAlloggioFromForm}
        />
      </Modal>

      {/* Modale Form Ristorante */}
      <Modal
        isOpen={Boolean(editingRistoranteItem) || creatingCategory === 'ristorante'}
        onClose={() => { setEditingRistoranteItem(null); closeCreateForm(); }}
        title={editingRistoranteItem ? 'Modifica Ristorante' : 'Nuovo Ristorante'}
        accentVariant="emerald"
      >
        <RistoranteForm
          initialData={editingRistoranteItem}
          defaultDate={creatingCategory === 'ristorante' ? selectedDate : undefined}
          defaultTime={creatingCategory === 'ristorante' ? insertDraftTime : undefined}
          onSave={handleSaveRistorante}
          onCancel={() => { setEditingRistoranteItem(null); closeCreateForm(); }}
        />
      </Modal>

      {/* Modale Form Shopping */}
      <Modal
        isOpen={Boolean(editingShoppingItem) || creatingCategory === 'shopping'}
        onClose={() => { setEditingShoppingItem(null); closeCreateForm(); }}
        title={editingShoppingItem ? 'Modifica Shopping' : 'Nuovo Shopping'}
        accentVariant="rose"
      >
        <ShoppingForm
          initialData={editingShoppingItem}
          defaultDate={creatingCategory === 'shopping' ? selectedDate : undefined}
          defaultTime={creatingCategory === 'shopping' ? insertDraftTime : undefined}
          onSave={handleSaveShopping}
          onCancel={() => { setEditingShoppingItem(null); closeCreateForm(); }}
        />
      </Modal>

      {/* Modale Selezione Categoria per Aggiunta Card */}
      <Modal
        isOpen={isCategoryPickerOpen}
        onClose={() => setIsCategoryPickerOpen(false)}
        title={`Aggiungi al giorno ${formatDateIT(selectedDate)}`}
        accentVariant="rose"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scegli cosa desideri inserire nel programma di questa giornata:
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {INSERT_CATEGORIES.map(category => (
              <button
                key={category.type}
                type="button"
                onClick={() => {
                  setIsCategoryPickerOpen(false);
                  setInsertDraftTime('');
                  setCreatingCategory(category.type);
                }}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:bg-[#FFF0ED] hover:border-[#FF6B5F]/40 dark:hover:bg-[#FF6B5F]/10 text-left transition-all active:scale-95 group cursor-pointer"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform flex items-center justify-center">
                  {category.type === 'tappa' ? (
                    <MapPinPlus className="w-7 h-7 text-[#FF6B5F]" />
                  ) : (
                    category.icon
                  )}
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#FF6B5F] dark:group-hover:text-[#ff9a90]">
                    {category.label}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1">
                    {category.type === 'tappa' ? 'Aggiungi un luogo o una sosta al percorso'
                      : category.type === 'attivita' ? 'Esperienza, tour o attività organizzata'
                      : category.type === 'alloggio' ? 'Hotel & check-in'
                      : category.type === 'trasporto' ? 'Voli, treni & auto'
                      : category.type === 'ristorante' ? 'Pranzi & cene'
                      : 'Negozi & acquisti'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
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
      {copilotPopoverActivity && createPortal(
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setCopilotPopoverActivity(null);
          }}
        >
          <div 
            ref={copilotModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Note Copilota"
            tabIndex={-1}
            className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200/80 dark:border-slate-800 animate-scale-up space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#FFF0ED] dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FFF0ED] dark:bg-rose-950/40 text-[#172033] dark:text-rose-300 flex items-center justify-center text-sm font-bold">
                  <Handshake className="w-4 h-4 text-[#FF6B5F]" />
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
        </div>,
        document.body
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
