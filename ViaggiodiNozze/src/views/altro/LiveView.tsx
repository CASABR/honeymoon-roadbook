import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../../storage/storageService';
import type { TimelineItem, Alloggio, Giorno, Trasporto, Tappa } from '../../types';
import { resolveMapUrl, openMapLink } from '../../utils/mapsHelper';
import { generateTripDays } from '../../utils/tripDates';

interface LiveViewProps {
  onBack?: () => void;
  isStandaloneExternal?: boolean;
}

interface DestinationTimezone {
  name: string;
  country: string;
  flag: string;
  timeZone: string;
}

const DESTINATION_ZONES: DestinationTimezone[] = [
  { name: 'Auckland', country: 'Nuova Zelanda', flag: '🇳🇿', timeZone: 'Pacific/Auckland' },
  { name: 'Sydney', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Sydney' },
  { name: 'Adelaide', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Adelaide' },
  { name: 'Melbourne', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Melbourne' },
  { name: 'Manila', country: 'Filippine', flag: '🇵🇭', timeZone: 'Asia/Manila' },
  { name: 'Pechino', country: 'Cina (Scalo)', flag: '🇨🇳', timeZone: 'Asia/Shanghai' },
];

const DEFAULT_STATUS_MESSAGE = "Siamo arrivati! Tutto bene ❤️ Ci stiamo godendo ogni momento di questa avventura incredibile!";
const STATUS_MESSAGE_KEY = "live_travel_status_message";
const STATUS_DATE_KEY = "live_travel_status_updated_at";

export default function LiveView({ onBack, isStandaloneExternal = false }: LiveViewProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [days, setDays] = useState<Giorno[]>([]);
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [tappe, setTappe] = useState<Tappa[]>([]);
  const [loading, setLoading] = useState(true);

  // Messaggio di stato dagli sposi
  const [statusMessage, setStatusMessage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_MESSAGE_KEY) || DEFAULT_STATUS_MESSAGE;
    }
    return DEFAULT_STATUS_MESSAGE;
  });
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_DATE_KEY) || 'Pochi minuti fa';
    }
    return 'Pochi minuti fa';
  });

  // Modalità modifica messaggio (riservata e discreta per gli sposi)
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [tempStatus, setTempStatus] = useState(statusMessage);

  // Stato feedback copia/condivisione link
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShareLiveLink = async () => {
    if (typeof window === 'undefined') return;

    // Genera l'URL diretto con il parametro live=1 e hash #live
    const url = new URL(window.location.href);
    url.searchParams.set('live', '1');
    url.hash = 'live';
    const liveShareUrl = url.toString();

    const shareData = {
      title: 'Viaggio di Nozze • Live',
      text: 'Segui il nostro viaggio di nozze in tempo reale! 🌍💍',
      url: liveShareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // Se l'utente annulla la condivisione, non fare nulla
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Fallback: Copia link negli appunti
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // In caso di problemi di permessi clipboard
      const input = document.createElement('input');
      input.value = liveShareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Orologio sincronizzato al secondo
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calcola data odierna YYYY-MM-DD
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  // Caricamento dati da IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [dList, accList, trList, tpList] = await Promise.all([
          storageService.getDays(),
          storageService.getAccommodations(),
          storageService.getTransports(),
          storageService.getTappe(),
        ]);

        if (!isMounted) return;
        setDays(dList);
        setAccommodations(accList);
        setTransports(trList);
        setTappe(tpList);

        // Se la data odierna rientra nel viaggio usa todayStr, altrimenti usa la prima data programmata
        const tripDaysList = generateTripDays();
        const isInTrip = tripDaysList.some(item => item.dateStr === todayStr);
        const targetDate = isInTrip ? todayStr : (dList[0]?.date || '2026-11-29');

        const items = await storageService.getTimelineForDate(targetDate);
        if (isMounted) {
          setTimelineItems(items);
        }
      } catch (err) {
        console.error('Errore nel caricamento dei dati Live:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [todayStr]);

  // Data attiva del viaggio
  const activeDate = useMemo(() => {
    const tripDaysList = generateTripDays();
    const isInTrip = tripDaysList.some(item => item.dateStr === todayStr);
    return isInTrip ? todayStr : (days[0]?.date || '2026-11-29');
  }, [todayStr, days]);

  // Alloggio, tappa e trasporto del giorno corrente
  const currentAccommodation = useMemo(() => {
    return accommodations.find((acc) => {
      if (acc.checkIn <= activeDate && acc.checkOut > activeDate) return true;
      if (acc.checkIn === activeDate) return true;
      return false;
    });
  }, [accommodations, activeDate]);

  const currentDay = useMemo(() => {
    return days.find(d => d.date === activeDate);
  }, [days, activeDate]);

  const currentTransport = useMemo(() => {
    return transports.find(t => t.date === activeDate);
  }, [transports, activeDate]);

  const currentTappa = useMemo(() => {
    return tappe.find(tp => tp.data === activeDate);
  }, [tappe, activeDate]);

  // Località corrente elegante e pulita
  const currentLocation = useMemo(() => {
    if (currentAccommodation) {
      return {
        title: currentAccommodation.location || currentAccommodation.name,
        address: currentAccommodation.address || currentAccommodation.location,
        name: currentAccommodation.name,
        country: 'Nuova Zelanda',
        coords: currentAccommodation.coordinate
      };
    }
    if (currentTappa) {
      return {
        title: currentTappa.titolo,
        address: currentTappa.titolo,
        name: currentTappa.titolo,
        country: 'Nuova Zelanda',
        coords: currentTappa.coordinate
      };
    }
    if (currentDay) {
      return {
        title: currentDay.location || currentDay.title,
        address: currentDay.location,
        name: currentDay.title,
        country: 'Nuova Zelanda',
        coords: undefined
      };
    }
    if (currentTransport) {
      return {
        title: currentTransport.arrivalLocation,
        address: currentTransport.arrivalLocation,
        name: `${currentTransport.carrier || currentTransport.type} verso ${currentTransport.arrivalLocation}`,
        country: 'In Viaggio',
        coords: currentTransport.coordinate
      };
    }
    return {
      title: 'Auckland, Nuova Zelanda',
      address: 'Auckland, New Zealand',
      name: 'Auckland City',
      country: 'Nuova Zelanda',
      coords: { lat: -36.8485, lng: 174.7633 }
    };
  }, [currentAccommodation, currentTappa, currentDay, currentTransport]);

  // Fuso orario della destinazione corrente
  const activeTimezone = useMemo<DestinationTimezone>(() => {
    const locLower = `${currentLocation.title} ${currentLocation.address} ${currentLocation.name}`.toLowerCase();
    
    if (locLower.includes('filippine') || locLower.includes('manila') || locLower.includes('palawan') || locLower.includes('coron') || locLower.includes('el nido') || locLower.includes('boracay') || locLower.includes('cebu')) {
      return DESTINATION_ZONES[4]; // Manila
    }
    if (locLower.includes('sydney') || locLower.includes('nsw') || locLower.includes('new south wales') || locLower.includes('blue mountains')) {
      return DESTINATION_ZONES[1]; // Sydney
    }
    if (locLower.includes('adelaide') || locLower.includes('kangaroo island') || locLower.includes('barossa') || locLower.includes('south australia') || locLower.includes(' sa')) {
      return DESTINATION_ZONES[2]; // Adelaide
    }
    if (locLower.includes('melbourne') || locLower.includes('victoria') || locLower.includes('great ocean road') || locLower.includes('vic')) {
      return DESTINATION_ZONES[3]; // Melbourne
    }
    if (locLower.includes('pechino') || locLower.includes('beijing') || locLower.includes('china')) {
      return DESTINATION_ZONES[5]; // Pechino
    }
    // Default Nuova Zelanda (Auckland)
    return DESTINATION_ZONES[0];
  }, [currentLocation]);

  // Formattatori orari
  const formatTimeInZone = (date: Date, timeZone: string) => {
    try {
      return new Intl.DateTimeFormat('it-IT', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch {
      return date.toLocaleTimeString('it-IT');
    }
  };

  const formatDateInZone = (date: Date, timeZone: string) => {
    try {
      return new Intl.DateTimeFormat('it-IT', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      }).format(date);
    } catch {
      return date.toLocaleDateString('it-IT');
    }
  };

  const localTimeStr = useMemo(() => formatTimeInZone(now, activeTimezone.timeZone), [now, activeTimezone]);
  const localDateStr = useMemo(() => formatDateInZone(now, activeTimezone.timeZone), [now, activeTimezone]);
  const italyTimeStr = useMemo(() => formatTimeInZone(now, 'Europe/Rome'), [now]);
  const italyDateStr = useMemo(() => formatDateInZone(now, 'Europe/Rome'), [now]);

  // Calcolo differenza fuso orario precisa
  const offsetDiffLabel = useMemo(() => {
    try {
      const getOffsetMinutes = (tz: string, d: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset'
        }).formatToParts(d);
        const tzPart = parts.find(p => p.type === 'timeZoneName')?.value;
        if (!tzPart || tzPart === 'GMT') return 0;
        const match = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
        if (!match) return 0;
        const sign = match[1] === '+' ? 1 : -1;
        const h = parseInt(match[2], 10);
        const m = match[3] ? parseInt(match[3], 10) : 0;
        return sign * (h * 60 + m);
      };

      const destMin = getOffsetMinutes(activeTimezone.timeZone, now);
      const italyMin = getOffsetMinutes('Europe/Rome', now);
      const diffMin = destMin - italyMin;
      const diffHours = Math.round(diffMin / 60);
      const absDiff = Math.abs(diffHours);
      return `${absDiff} ore di differenza (${diffHours >= 0 ? `+${absDiff}h` : `-${absDiff}h`})`;
    } catch {
      return '11 ore di differenza (+11h)';
    }
  }, [activeTimezone, now]);

  // Link a Google Maps
  const mapSearchUrl = useMemo(() => {
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${currentLocation.coords.lat},${currentLocation.coords.lng}`;
    }
    return resolveMapUrl(currentLocation.address || currentLocation.title);
  }, [currentLocation]);

  // Foto d'ispirazione / copertina per la sezione foto
  const photoUpdateData = useMemo(() => {
    const locLower = `${currentLocation.title} ${currentLocation.address}`.toLowerCase();
    
    if (locLower.includes('filippine') || locLower.includes('coron') || locLower.includes('el nido') || locLower.includes('palawan')) {
      return {
        url: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=80',
        caption: 'Laguna di El Nido • Acque cristalline a Palawan',
        tag: '🇵🇭 Filippine'
      };
    }
    if (locLower.includes('sydney')) {
      return {
        url: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80',
        caption: 'Sydney Harbour & Opera House al tramonto',
        tag: '🇦🇺 Australia'
      };
    }
    if (locLower.includes('kangaroo island') || locLower.includes('adelaide')) {
      return {
        url: 'https://images.unsplash.com/photo-1548263594-a71ea65a8598?auto=format&fit=crop&w=1200&q=80',
        caption: 'Remarkable Rocks & Costa selvaggia • Kangaroo Island',
        tag: '🇦🇺 Australia'
      };
    }
    if (locLower.includes('queenstown') || locLower.includes('milford') || locLower.includes('te anau')) {
      return {
        url: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?auto=format&fit=crop&w=1200&q=80',
        caption: 'Fiordi & Montagne a picco sui laghi • Queenstown',
        tag: '🇳🇿 Nuova Zelanda'
      };
    }
    // Default Auckland & Nuova Zelanda
    return {
      url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
      caption: 'Inizio del viaggio on the road • Verso la baia di Auckland',
      tag: '🇳🇿 Nuova Zelanda'
    };
  }, [currentLocation]);

  // Calcolo stato temporale per la timeline (Completato, ORA, Previsto)
  const evaluatedTimeline = useMemo(() => {
    // Ora corrente locale in minuti dal mattino per comparazione
    let currentLocalMinutes = 12 * 60; // fallback mezzogiorno
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: activeTimezone.timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      currentLocalMinutes = h * 60 + m;
    } catch {
      currentLocalMinutes = now.getHours() * 60 + now.getMinutes();
    }

    // Prepara max 4 elementi chiave per la vista sintetica
    const items = [...timelineItems].slice(0, 4);

    // Se non ci sono attività, o ne abbiamo meno di 4 e c'è l'alloggio notturno, aggiungilo come sosta serale
    if (currentAccommodation && items.length < 4 && !items.some(i => i.type === 'alloggio')) {
      items.push({
        id: `lodging_${currentAccommodation.id}`,
        type: 'alloggio',
        time: currentAccommodation.checkInTime || '20:00',
        title: currentAccommodation.name,
        location: currentAccommodation.location || currentAccommodation.address,
        categoryOrType: 'alloggio',
        originalData: currentAccommodation
      });
    }

    // Converti l'orario di ogni evento in minuti
    const parsed = items.map(item => {
      const timeMatch = (item.time || '12:00').match(/^(\d{1,2}):(\d{2})/);
      const minutes = timeMatch ? parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10) : 12 * 60;
      return { item, minutes };
    });

    // Trova l'indice dell'evento "ORA"
    // L'evento corrente è l'ultimo evento iniziato la cui ora è <= currentLocalMinutes,
    // oppure il primo evento futuro se tutti sono nel futuro.
    let activeIdx = -1;
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].minutes <= currentLocalMinutes) {
        activeIdx = i;
      } else {
        break;
      }
    }
    if (activeIdx === -1 && parsed.length > 0) {
      activeIdx = 0; // se la giornata è appena iniziata, il primo è attivo/imminente
    }

    return parsed.map((p, idx) => {
      let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
      if (idx < activeIdx) {
        status = 'completed';
      } else if (idx === activeIdx) {
        status = 'current';
      } else {
        status = 'upcoming';
      }
      return {
        ...p.item,
        status
      };
    });
  }, [timelineItems, currentAccommodation, now, activeTimezone]);

  // Salva stato personalizzato
  const handleSaveStatus = () => {
    const trimmed = tempStatus.trim() || DEFAULT_STATUS_MESSAGE;
    const nowTimeStr = new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    }).format(new Date());

    setStatusMessage(trimmed);
    setStatusUpdatedAt(`Aggiornato alle ${nowTimeStr}`);
    setIsEditingStatus(false);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STATUS_MESSAGE_KEY, trimmed);
      localStorage.setItem(STATUS_DATE_KEY, `Aggiornato alle ${nowTimeStr}`);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-12 space-y-4">
      {/* 1. HEADER MINIMALE E PULITO */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          {!isStandaloneExternal && onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Torna ad Altro"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {isStandaloneExternal && (
            <div className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 border border-rose-200/60 text-base">
              💍
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>Live</span>
              {isStandaloneExternal && (
                <span className="text-xs font-semibold text-rose-500">• Viaggio di Nozze</span>
              )}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Segui il nostro viaggio in tempo reale
            </p>
          </div>
        </div>

        {/* Badge e pulsante condividi */}
        <div className="flex items-center gap-2">
          {!isStandaloneExternal && (
            <button
              type="button"
              onClick={handleShareLiveLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200/70 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Condividi link Live con amici e parenti"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{copiedLink ? '✓ Link Copiato!' : 'Condividi Live'}</span>
            </button>
          )}

          {/* Badge discreto con puntino verde pulsante */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-[10px] font-bold tracking-wider shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>● LIVE</span>
          </div>
        </div>
      </header>

      {/* 2. PRIMO ELEMENTO FORTE: OROLOGIO DOPPIO FUSO (Voi siete qui / Noi siamo qui) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col items-center">
        <div className="grid grid-cols-2 gap-4 divide-x divide-slate-100 w-full mb-3.5">
          {/* Colonna Sinistra (Destinazione / Noi siamo qui) */}
          <div className="flex flex-col pr-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-0.5">
              <span className="text-base">{activeTimezone.flag}</span>
              <span className="truncate">{activeTimezone.name}</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mt-1">
              {localTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-1.5">
              {localDateStr}
            </div>
          </div>

          {/* Colonna Destra (Italia / Voi siete qui) */}
          <div className="flex flex-col pl-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-0.5">
              <span className="text-base">🇮🇹</span>
              <span>Roma</span>
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mt-1">
              {italyTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-1.5">
              {italyDateStr}
            </div>
          </div>
        </div>

        {/* Badge centrale inferiore: dislivello esatto */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 text-[11px] font-semibold border border-slate-200/60">
          <span>🕒</span>
          <span>{offsetDiffLabel}</span>
        </div>
      </div>

      {/* 3. CARD EMOZIONALE "📍 SIAMO QUI" (Nessun Riquadro Mappa Grigio) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <span>📍</span>
            <span>SIAMO QUI</span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 truncate">
            {currentLocation.title}
          </h2>
          <p className="text-[11px] text-slate-500">
            Posizione aggiornata pochi minuti fa
          </p>
        </div>

        {/* Link sottile ed elegante 'Vedi sulla mappa →' */}
        <button
          type="button"
          onClick={() => openMapLink(mapSearchUrl)}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-2xl border border-indigo-100 transition-colors cursor-pointer"
        >
          <span>Vedi sulla mappa</span>
          <span>→</span>
        </button>
      </div>

      {/* 4. CARD "📸 Ultimo Aggiornamento" (La foto del momento) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <span>📸</span>
            <span>Ultimo Aggiornamento</span>
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {photoUpdateData.tag}
          </span>
        </div>

        {/* Riquadro fotografico immersivo */}
        <div className="relative rounded-2xl overflow-hidden aspect-video shadow-xs border border-slate-200/70 group">
          <img
            src={photoUpdateData.url}
            alt={photoUpdateData.caption}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          {/* Gradiente scuro sul fondo per leggibilità micro-didascalia */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 pt-6">
            <p className="text-white text-xs font-semibold drop-shadow-xs line-clamp-1">
              📷 {photoUpdateData.caption}
            </p>
          </div>
        </div>
      </div>

      {/* 5. CARD "💬 Messaggio da noi" (Protagonista e Naturale) */}
      <div className="bg-rose-50/70 rounded-3xl p-4 border border-rose-200/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="font-bold text-rose-950 text-sm">Messaggio da noi</h3>
          </div>
          {/* Tocco discreto e minimale per gli sposi per modificare il testo (nascosto se esterno) */}
          {!isStandaloneExternal && (
            <button
              type="button"
              onClick={() => {
                setTempStatus(statusMessage);
                setIsEditingStatus(prev => !prev);
              }}
              className="text-[10px] font-semibold text-rose-700/60 hover:text-rose-800 transition-colors cursor-pointer px-1 py-0.5 rounded"
              title="Modifica stato"
            >
              {isEditingStatus ? 'Annulla' : '•••'}
            </button>
          )}
        </div>

        {isEditingStatus ? (
          <div className="space-y-2 pt-1">
            <textarea
              rows={2}
              value={tempStatus}
              onChange={(e) => setTempStatus(e.target.value)}
              placeholder="Scrivi un breve messaggio per chi vi segue da casa..."
              className="w-full p-2.5 bg-white border border-rose-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none shadow-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveStatus}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Salva
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-800 font-medium italic bg-white/80 p-3 rounded-2xl border border-rose-100/90 leading-relaxed shadow-2xs">
              “{statusMessage}”
            </p>
            <span className="text-[10px] text-rose-600/80 font-medium block mt-1.5 text-right">
              {statusUpdatedAt}
            </span>
          </div>
        )}
      </div>

      {/* 6. TIMELINE "📅 OGGI" (Sintetica, Chiara e con Evento Attivo Automatico) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <h3 className="font-bold text-slate-900 text-sm">Oggi</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {activeDate}
          </span>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : evaluatedTimeline.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <span>🏖️</span> Giornata di esplorazione libera o relax
          </div>
        ) : (
          <div className="space-y-2.5">
            {evaluatedTimeline.map((item) => {
              const isCurrent = item.status === 'current';
              const isCompleted = item.status === 'completed';

              const icon = item.type === 'trasporto' ? '✈️' :
                           item.type === 'tappa' ? '📍' :
                           item.type === 'ristorante' ? '🍽️' :
                           item.type === 'shopping' ? '🛍️' :
                           item.type === 'alloggio' ? '🛏️' : '🌿';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-200'
                      : isCompleted
                      ? 'bg-slate-50/60 border-slate-200/60 opacity-80'
                      : 'bg-white border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-emerald-950 font-extrabold' : 'text-slate-900'}`}>
                          {item.title}
                        </h4>
                      </div>
                      {item.location && item.location !== item.title && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          📍 {item.location}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md border border-slate-200/50">
                      {item.time}
                    </span>

                    {/* Stato dell'evento */}
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        ORA
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1">
                        <span>✓</span>
                        <span>Fatto</span>
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-400">
                        Previsto
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
