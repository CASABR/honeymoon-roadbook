import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../../storage/storageService';
import type { TimelineItem, Alloggio, Giorno, Trasporto, Tappa } from '../../types';
import { resolveMapUrl, openMapLink } from '../../utils/mapsHelper';
import { generateTripDays } from '../../utils/tripDates';

interface LiveViewProps {
  onBack: () => void;
}

interface DestinationTimezone {
  name: string;
  country: string;
  flag: string;
  timeZone: string;
  lat: number;
  lng: number;
}

const DESTINATION_ZONES: DestinationTimezone[] = [
  { name: 'Auckland & NZ', country: 'Nuova Zelanda', flag: '🇳🇿', timeZone: 'Pacific/Auckland', lat: -36.8485, lng: 174.7633 },
  { name: 'Sydney & NSW', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Adelaide & SA', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Adelaide', lat: -34.9285, lng: 138.6007 },
  { name: 'Melbourne & VIC', country: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Melbourne', lat: -37.8136, lng: 144.9631 },
  { name: 'Manila & Palawan', country: 'Filippine', flag: '🇵🇭', timeZone: 'Asia/Manila', lat: 14.5995, lng: 120.9842 },
  { name: 'Pechino', country: 'Cina (Scalo)', flag: '🇨🇳', timeZone: 'Asia/Shanghai', lat: 39.9042, lng: 116.4074 },
];

const DEFAULT_STATUS_MESSAGE = "Siamo bene e ci stiamo godendo ogni momento! 🌴💍";
const STATUS_MESSAGE_KEY = "live_travel_status_message";
const STATUS_DATE_KEY = "live_travel_status_updated_at";

export default function LiveView({ onBack }: LiveViewProps) {
  const [now, setNow] = useState<Date>(new Date());
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [days, setDays] = useState<Giorno[]>([]);
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [tappe, setTappe] = useState<Tappa[]>([]);
  const [loading, setLoading] = useState(true);

  // Messaggio di stato
  const [statusMessage, setStatusMessage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_MESSAGE_KEY) || DEFAULT_STATUS_MESSAGE;
    }
    return DEFAULT_STATUS_MESSAGE;
  });
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STATUS_DATE_KEY) || '';
    }
    return '';
  });
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [tempStatus, setTempStatus] = useState(statusMessage);

  // Copia negli appunti feedback
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Orologio sincronizzato al secondo
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calcola data odierna YYYY-MM-DD o data di riferimento del viaggio
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  // Caricamento dati
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

        // Se la data odierna rientra nel viaggio usa todayStr, altrimenti usa la prima data con dati
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

  // Determina la data effettiva visualizzata nella live
  const activeDate = useMemo(() => {
    const tripDaysList = generateTripDays();
    const isInTrip = tripDaysList.some(item => item.dateStr === todayStr);
    return isInTrip ? todayStr : (days[0]?.date || '2026-11-29');
  }, [todayStr, days]);

  // Tappa / Alloggio per determinare la località attuale e il fuso orario
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

  // Calcola località corrente
  const currentLocation = useMemo(() => {
    if (currentAccommodation) {
      return {
        title: currentAccommodation.location || currentAccommodation.name,
        address: currentAccommodation.address || currentAccommodation.location,
        name: currentAccommodation.name,
        coords: currentAccommodation.coordinate
      };
    }
    if (currentTappa) {
      return {
        title: currentTappa.titolo,
        address: currentTappa.titolo,
        name: currentTappa.titolo,
        coords: currentTappa.coordinate
      };
    }
    if (currentDay) {
      return {
        title: currentDay.location || currentDay.title,
        address: currentDay.location,
        name: currentDay.title,
        coords: undefined
      };
    }
    if (currentTransport) {
      return {
        title: currentTransport.arrivalLocation,
        address: currentTransport.arrivalLocation,
        name: `${currentTransport.carrier || currentTransport.type} verso ${currentTransport.arrivalLocation}`,
        coords: currentTransport.coordinate
      };
    }
    return {
      title: 'Nuova Zelanda',
      address: 'Auckland, New Zealand',
      name: 'Auckland City',
      coords: { lat: -36.8485, lng: 174.7633 }
    };
  }, [currentAccommodation, currentTappa, currentDay, currentTransport]);

  // Trova il fuso orario di destinazione corretto in base alla località corrente
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
    // Default Nuova Zelanda
    return DESTINATION_ZONES[0];
  }, [currentLocation]);

  // Formattatori orario
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

  // Calcolo differenza fuso orario tra destinazione e Italia
  const offsetDiffHours = useMemo(() => {
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
      const diffHours = diffMin / 60;
      const formattedDiff = diffHours >= 0 ? `+${diffHours}h` : `${diffHours}h`;
      return formattedDiff;
    } catch {
      return '+12h';
    }
  }, [activeTimezone, now]);

  // URL per Google Maps
  const mapSearchUrl = useMemo(() => {
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${currentLocation.coords.lat},${currentLocation.coords.lng}`;
    }
    return resolveMapUrl(currentLocation.address || currentLocation.title);
  }, [currentLocation]);

  // Funzione Condivisione nativa Web Share API con fallback
  const handleSharePosition = async () => {
    const shareText = `🌍 Siamo a ${currentLocation.title}!\nSegui la nostra posizione live del viaggio di nozze: ${mapSearchUrl}`;
    
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Viaggio di Nozze - Posizione a ${currentLocation.title}`,
          text: shareText,
          url: mapSearchUrl
        });
        return;
      } catch {
        // Fallback su copia appunti
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2500);
      } catch (err) {
        console.error('Impossibile copiare negli appunti:', err);
      }
    }
  };

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
    setStatusUpdatedAt(nowTimeStr);
    setIsEditingStatus(false);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STATUS_MESSAGE_KEY, trimmed);
      localStorage.setItem(STATUS_DATE_KEY, nowTimeStr);
    }
  };

  // Immagine/sfondo dinamico per la card in base alla nazione/località
  const heroImageBg = useMemo(() => {
    const locLower = `${currentLocation.title} ${currentLocation.address}`.toLowerCase();
    if (locLower.includes('filippine') || locLower.includes('manila') || locLower.includes('coron') || locLower.includes('el nido')) {
      return 'from-emerald-700 via-teal-800 to-cyan-950';
    }
    if (locLower.includes('sydney') || locLower.includes('australia') || locLower.includes('adelaide') || locLower.includes('melbourne')) {
      return 'from-amber-600 via-orange-700 to-slate-900';
    }
    // Nuova Zelanda
    return 'from-indigo-700 via-blue-800 to-slate-950';
  }, [currentLocation]);

  return (
    <div className="flex flex-col h-full animate-fade-in pb-12 space-y-4">
      {/* 1. Header con pulsante Indietro */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Torna ad Altro"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Live Viaggio
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Seguite il nostro viaggio in tempo reale
            </p>
          </div>
        </div>

        {/* Badge Live Attivo */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold uppercase tracking-wider shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          <span>ON AIR</span>
        </div>
      </header>

      {/* 2. DOPPIO FUSO ORARIO (Card a 2 Colonne con aggiornamento live) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
          <span>Orologio Sincronizzato</span>
          <span className="text-indigo-600 font-semibold">Differenza: {offsetDiffHours}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 divide-x divide-slate-100">
          {/* Fuso Locale (Destinazione) */}
          <div className="flex flex-col pr-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>{activeTimezone.flag}</span>
              <span className="truncate">{activeTimezone.name}</span>
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-900 tracking-tight">
              {localTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-0.5">
              {localDateStr}
            </div>
            <span className="inline-flex items-center text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md mt-1.5 w-fit">
              Ora Locale
            </span>
          </div>

          {/* Fuso Italia */}
          <div className="flex flex-col pl-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>🇮🇹</span>
              <span>Italia (Roma)</span>
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-slate-900 tracking-tight">
              {italyTimeStr}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize mt-0.5">
              {italyDateStr}
            </div>
            <span className="inline-flex items-center text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md mt-1.5 w-fit">
              Ora di Casa
            </span>
          </div>
        </div>
      </div>

      {/* 3. CARD "DOVE SIAMO ADESSO" (Hero Stato Attuale con Condivisione) */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${heroImageBg} text-white p-5 shadow-md border border-white/10`}>
        {/* Glow circolare decorativo */}
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-3">
          {/* Badge verde pulsante */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 backdrop-blur-md border border-white/15 text-xs font-semibold text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span>Siamo qui adesso</span>
            <span className="text-white/50 text-[10px]">•</span>
            <span className="text-white/80 text-[10px]">Live</span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white leading-tight">
              {currentLocation.title}
            </h2>
            <p className="text-xs text-white/80 font-medium mt-1 flex items-center gap-1.5">
              <span>📍</span>
              <span className="line-clamp-1">{currentLocation.address}</span>
            </p>
          </div>

          {currentAccommodation && (
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-2.5 border border-white/20 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 block">
                Alloggio & Base notturna
              </span>
              <p className="font-bold text-white text-sm mt-0.5">{currentAccommodation.name}</p>
              {currentAccommodation.address && (
                <p className="text-[11px] text-white/80 mt-0.5 line-clamp-1">{currentAccommodation.address}</p>
              )}
            </div>
          )}

          {/* Tasto Azione Condividi Posizione */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSharePosition}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{copyFeedback ? '✓ Link Copiato!' : 'Condividi la nostra posizione'}</span>
            </button>

            <button
              type="button"
              onClick={() => openMapLink(mapSearchUrl)}
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-colors cursor-pointer shrink-0"
              title="Apri su Google Maps"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAPPA RAPIDA DI POSIZIONE (Anteprima integrata compatta) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🗺️</span>
            <h3 className="font-bold text-slate-900 text-sm">Mappa Posizione Live</h3>
          </div>
          <button
            type="button"
            onClick={() => openMapLink(mapSearchUrl)}
            className="text-[11px] font-bold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>Apri Google Maps</span>
            <span>↗</span>
          </button>
        </div>

        {/* Box Grafico Mappa Interattiva / Embed Responsive */}
        <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
          <iframe
            title="Mappa Live Posizione"
            width="100%"
            height="100%"
            loading="lazy"
            style={{ border: 0 }}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(
              currentLocation.coords
                ? `${currentLocation.coords.lat},${currentLocation.coords.lng}`
                : currentLocation.address || currentLocation.title
            )}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
          />

          {/* Overlay trasparente in basso con le coordinate / indirizzo */}
          <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-md p-2 rounded-xl border border-white/60 shadow-xs flex items-center justify-between text-xs pointer-events-none">
            <span className="font-bold text-slate-800 truncate mr-2">
              📍 {currentLocation.title}
            </span>
            <span className="text-[10px] text-slate-500 shrink-0 font-mono">
              {currentLocation.coords ? `${currentLocation.coords.lat.toFixed(2)}, ${currentLocation.coords.lng.toFixed(2)}` : 'GPS'}
            </span>
          </div>
        </div>
      </div>

      {/* 5. MESSAGGIO DI STATO DAL VIAGGIO (Box per chi segue da casa) */}
      <div className="bg-gradient-to-br from-rose-50/70 via-pink-50/40 to-amber-50/50 rounded-3xl p-4 border border-rose-200/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <h3 className="font-bold text-rose-950 text-sm">Messaggio dagli Sposi</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setTempStatus(statusMessage);
              setIsEditingStatus(prev => !prev);
            }}
            className="text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-white/80 hover:bg-white px-2 py-0.5 rounded-lg border border-rose-200/60 transition-colors cursor-pointer"
          >
            {isEditingStatus ? 'Annulla' : '✏️ Modifica'}
          </button>
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
                Salva Messaggio
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-700 font-medium italic bg-white/70 p-3 rounded-2xl border border-rose-100/80 leading-relaxed">
              "{statusMessage}"
            </p>
            {statusUpdatedAt && (
              <span className="text-[10px] text-rose-600/80 font-medium block mt-1 text-right">
                Ultimo aggiornamento: {statusUpdatedAt}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 6. TIMELINE SINTETICA DI OGGI (Passo dopo Passo) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Programma di Oggi</h3>
              <p className="text-[10px] text-slate-400">Data: {activeDate}</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            {timelineItems.length} tappe
          </span>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <span>🏖️</span> Giornata di esplorazione libera o relax
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {timelineItems.map((item, idx) => {
              const isTransport = item.type === 'trasporto';
              const isTappa = item.type === 'tappa';
              const isRistorante = item.type === 'ristorante';
              const isShopping = item.type === 'shopping';

              const icon = isTransport ? '✈️' : isTappa ? '📍' : isRistorante ? '🍽️' : isShopping ? '🛍️' : '🌿';
              const isNext = idx === 0;

              return (
                <div key={item.id} className="relative group">
                  {/* Punto sulla linea */}
                  <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                    isNext ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'
                  }`} />

                  <div className={`p-2.5 rounded-2xl border transition-all ${
                    isNext
                      ? 'bg-emerald-50/50 border-emerald-200 shadow-xs'
                      : 'bg-slate-50 border-slate-200/70'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm shrink-0">{icon}</span>
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          {item.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-white px-1.5 py-0.5 rounded-md text-slate-700 shrink-0 border border-slate-200/60">
                        {item.time}
                      </span>
                    </div>

                    {item.location && item.location !== item.title && (
                      <p className="text-[11px] text-slate-500 mt-1 truncate pl-5">
                        📍 {item.location}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Tappa notturna conclusiva */}
            {currentAccommodation && (
              <div className="relative">
                <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-purple-600 shadow-xs" />
                <div className="p-2.5 rounded-2xl border bg-purple-50/60 border-purple-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">🛏️</span>
                      <h4 className="font-bold text-purple-950 text-xs truncate">
                        Notte: {currentAccommodation.name}
                      </h4>
                    </div>
                    <span className="text-[9px] font-bold uppercase text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-md shrink-0">
                      Riposo
                    </span>
                  </div>
                  {currentAccommodation.address && (
                    <p className="text-[11px] text-purple-800/80 mt-1 truncate pl-5">
                      📍 {currentAccommodation.address}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
