import { useState, useEffect, useMemo, useCallback } from 'react';
import { storageService } from '../../storage/storageService';
import type { TimelineItem, Alloggio, Giorno, Trasporto, Tappa } from '../../types';
import { resolveMapUrl, openMapLink } from '../../utils/mapsHelper';
import { generateTripDays } from '../../utils/tripDates';
import {
  updateRealLocation,
  getSavedLiveLocation,
  getCountryFlag,
  getTimezoneFromCoordinates,
  type GeolocationState
} from '../../services/geolocationService';

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

  // Posizione GPS Reale rilevata da dispositivo (persistita in localStorage)
  const [liveGpsState, setLiveGpsState] = useState<GeolocationState | null>(() => getSavedLiveLocation());
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [tileLoadFailed, setTileLoadFailed] = useState(false);

  // Rileva posizione GPS reale su richiesta o automaticamente all'apertura
  const handleDetectGps = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsDetectingGps(true);
      setGpsError(null);
      const res = await updateRealLocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });
      setLiveGpsState(res);
    } catch (err: unknown) {
      console.warn('[LiveView] Errore acquisizione GPS:', err);
      if (!isSilent) {
        const errMsg = (err as Error)?.message || 'Impossibile acquisire la posizione GPS';
        setGpsError(errMsg);
        setTimeout(() => setGpsError(null), 4000);
      }
    } finally {
      if (!isSilent) setIsDetectingGps(false);
    }
  }, []);

  // Richiesta automatica della geolocalizzazione all'accesso della pagina
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      // Esegui la richiesta automatica in modalità non invasiva per scatenare il popup nativo dei permessi
      handleDetectGps(true);
    }
  }, [handleDetectGps]);

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

  // Verifica se il viaggio è già iniziato rispetto a oggi
  const tripCountdown = useMemo(() => {
    const tripDaysList = generateTripDays();
    const firstDateStr = days[0]?.date || tripDaysList[0]?.dateStr || '2026-11-29';
    const startDate = new Date(`${firstDateStr}T00:00:00`);
    const today = new Date(`${todayStr}T00:00:00`);
    const diffMs = startDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isPreTrip = diffDays > 0;
    const isInTrip = tripDaysList.some(item => item.dateStr === todayStr);

    return {
      isPreTrip,
      isInTrip,
      diffDays,
      firstDateStr
    };
  }, [todayStr, days]);

  // Data attiva del viaggio
  const activeDate = useMemo(() => {
    return tripCountdown.isInTrip ? todayStr : tripCountdown.firstDateStr;
  }, [tripCountdown, todayStr]);

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

  // Località corrente: priorità a GPS reale salvato, poi alloggio/tappa/itinerario programmato come fallback
  const currentLocation = useMemo(() => {
    // 1. Se è disponibile la posizione GPS reale acquisita dal dispositivo
    if (liveGpsState && liveGpsState.isLiveGps && liveGpsState.coords) {
      const timeAgo = (() => {
        try {
          const diffMs = Date.now() - new Date(liveGpsState.updatedAt).getTime();
          const diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 1) return 'Pochi istanti fa (GPS)';
          if (diffMin < 60) return `${diffMin} min fa (GPS)`;
          const diffHours = Math.floor(diffMin / 60);
          return `${diffHours} ore fa (GPS)`;
        } catch {
          return 'Posizione GPS';
        }
      })();

      return {
        title: liveGpsState.displayName || `${liveGpsState.city || ''}, ${liveGpsState.country || ''}`.trim() || 'Posizione Reale',
        city: liveGpsState.city || 'Posizione Corrente',
        country: liveGpsState.country || 'Reale',
        countryCode: liveGpsState.countryCode || '',
        flag: getCountryFlag(liveGpsState.countryCode),
        coords: liveGpsState.coords,
        isRealGps: true,
        updateNotice: `Rilevamento GPS • ${timeAgo}`
      };
    }

    // 2. Fallback su Alloggio programmato
    if (currentAccommodation) {
      return {
        title: currentAccommodation.location || currentAccommodation.name,
        city: currentAccommodation.location || currentAccommodation.name,
        country: 'Nuova Zelanda',
        countryCode: 'nz',
        flag: '🇳🇿',
        coords: currentAccommodation.coordinate,
        isRealGps: false,
        updateNotice: 'Tappa alloggio del giorno (programmato)'
      };
    }

    // 3. Fallback su Tappa programmata
    if (currentTappa) {
      return {
        title: currentTappa.titolo,
        city: currentTappa.titolo,
        country: 'Nuova Zelanda',
        countryCode: 'nz',
        flag: '🇳🇿',
        coords: currentTappa.coordinate,
        isRealGps: false,
        updateNotice: 'Tappa programmata per oggi'
      };
    }

    // 4. Fallback su Giornata
    if (currentDay) {
      return {
        title: currentDay.location || currentDay.title,
        city: currentDay.location || currentDay.title,
        country: 'Nuova Zelanda',
        countryCode: 'nz',
        flag: '🇳🇿',
        coords: undefined,
        isRealGps: false,
        updateNotice: 'Itinerario programmato per oggi'
      };
    }

    // 5. Fallback su Trasporto
    if (currentTransport) {
      return {
        title: currentTransport.arrivalLocation,
        city: currentTransport.arrivalLocation,
        country: 'In Viaggio',
        countryCode: '',
        flag: '✈️',
        coords: currentTransport.coordinate,
        isRealGps: false,
        updateNotice: 'Trasferimento programmato'
      };
    }

    return {
      title: 'Auckland, Nuova Zelanda',
      city: 'Auckland',
      country: 'Nuova Zelanda',
      countryCode: 'nz',
      flag: '🇳🇿',
      coords: { lat: -36.8485, lng: 174.7633 },
      isRealGps: false,
      updateNotice: 'Posizione stimata (programmato)'
    };
  }, [liveGpsState, currentAccommodation, currentTappa, currentDay, currentTransport]);

  // Risoluzione scientifica del fuso orario di destinazione (Zero Improvvisazione)
  const activeTimezone = useMemo<DestinationTimezone>(() => {
    // 1. Se il GPS è attivo e ha determinato una timezone IANA
    if (liveGpsState?.timeZone) {
      return {
        name: liveGpsState.city || liveGpsState.country || 'Posizione GPS',
        country: liveGpsState.country || '',
        flag: getCountryFlag(liveGpsState.countryCode),
        timeZone: liveGpsState.timeZone
      };
    }

    // 2. Se abbiamo coordinate GPS, ricava timezone scientificamente
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      const tz = getTimezoneFromCoordinates(currentLocation.coords.lat, currentLocation.coords.lng, currentLocation.countryCode);
      return {
        name: currentLocation.city || currentLocation.title,
        country: currentLocation.country,
        flag: currentLocation.flag,
        timeZone: tz
      };
    }

    // 3. Fallback contestuale in base alla località del viaggio
    const locLower = `${currentLocation.title} ${currentLocation.city}`.toLowerCase();
    
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
  }, [liveGpsState, currentLocation]);

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

  // Calcolo matematico preciso del dislivello orario
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
      const signStr = diffHours > 0 ? `+${diffHours}` : `${diffHours}`;
      return `${signStr} ore di differenza rispetto all'Italia`;
    } catch {
      return '+11 ore di differenza rispetto all\'Italia';
    }
  }, [activeTimezone, now]);

  // Coordinate Geografiche Formattate (es. 36°51'S • 174°46'E)
  const formattedCoords = useMemo(() => {
    if (!currentLocation.coords || !currentLocation.coords.lat || !currentLocation.coords.lng) {
      return '36°51\'S • 174°46\'E';
    }
    const { lat, lng } = currentLocation.coords;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latAbs = Math.abs(lat);
    const lngAbs = Math.abs(lng);
    const latDeg = Math.floor(latAbs);
    const latMin = Math.round((latAbs - latDeg) * 60);
    const lngDeg = Math.floor(lngAbs);
    const lngMin = Math.round((lngAbs - lngDeg) * 60);
    return `${latDeg}°${latMin.toString().padStart(2, '0')}'${latDir} • ${lngDeg}°${lngMin.toString().padStart(2, '0')}'${lngDir}`;
  }, [currentLocation.coords]);

  // Calcolo della distanza geodesica dall'Italia (Roma: 41.9028, 12.4964)
  const distanceFromItalyLabel = useMemo(() => {
    if (!currentLocation.coords || !currentLocation.coords.lat || !currentLocation.coords.lng) {
      return '~18.400 km da casa';
    }
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const lat1 = toRad(41.9028); // Roma
    const lon1 = toRad(12.4964);
    const lat2 = toRad(currentLocation.coords.lat);
    const lon2 = toRad(currentLocation.coords.lng);
    const R = 6371; // raggio Terra in km
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = Math.round(R * c);
    return `~${dist.toLocaleString('it-IT')} km da casa`;
  }, [currentLocation.coords]);

  // Tile statico per mini-mappa (Esri ArcGIS World Street Map: libero, affidabile, 0 blocchi di policy, 0 watermark)
  const mapTileUrl = useMemo(() => {
    if (!currentLocation.coords || !currentLocation.coords.lat || !currentLocation.coords.lng) {
      return null;
    }
    const { lat, lng } = currentLocation.coords;
    const zoom = 12;
    // Conversione coordinate WGS84 -> coordinate slippy tile (x, y)
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    
    // Server Esri ArcGIS World Street Map: ordine parametri ${zoom}/${y}/${x}
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${y}/${x}`;
  }, [currentLocation.coords]);

  // Link a Google Maps
  const mapSearchUrl = useMemo(() => {
    if (currentLocation.coords && currentLocation.coords.lat && currentLocation.coords.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${currentLocation.coords.lat},${currentLocation.coords.lng}`;
    }
    return resolveMapUrl(currentLocation.title || currentLocation.city);
  }, [currentLocation]);

  // Foto d'ispirazione / copertina per la sezione foto
  const photoUpdateData = useMemo(() => {
    const locLower = `${currentLocation.title} ${currentLocation.city}`.toLowerCase();
    
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

    // Se il viaggio non è ancora iniziato (oggi < data inizio) o stiamo visualizzando un giorno futuro:
    // NESSUN evento deve avere lo stato "ORA" o "Fatto". Tutti gli eventi devono essere "upcoming" (Previsto).
    if (tripCountdown.isPreTrip || activeDate !== todayStr) {
      return parsed.map(p => ({
        ...p.item,
        status: 'upcoming' as const
      }));
    }

    // Altrimenti (viaggio in corso e data di oggi): calcola evento corrente
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
  }, [timelineItems, currentAccommodation, now, activeTimezone, tripCountdown.isPreTrip, activeDate, todayStr]);

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

      {/* 3. CARD GRAFICA CARTOGRAFICA "📍 SIAMO QUI" (Mini-Mappa + Dati di Navigazione) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5 overflow-hidden">
        {/* Intestazione Sezione */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>📍</span>
            <span>SIAMO QUI</span>
            {currentLocation.isRealGps ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                GPS Satellitare
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">
                Itinerario
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400 font-medium">
            {currentLocation.updateNotice}
          </span>
        </div>

        {/* Mini-Mappa Cartografica con Tile Chiari e Radar Pulse Pin */}
        <div className="relative h-44 sm:h-48 w-full rounded-2xl overflow-hidden shadow-inner border border-slate-200/80 bg-slate-100 group select-none">
          {/* Tile Cartografici Esri ArcGIS World Street Map (Senza blocco di policy né watermark) */}
          {mapTileUrl && !tileLoadFailed ? (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={mapTileUrl}
                alt={`Mappa di ${currentLocation.city}`}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="w-full h-full object-cover scale-105 transition-transform duration-700 group-hover:scale-110 filter contrast-[1.02] brightness-[0.99]"
                onError={() => {
                  setTileLoadFailed(true);
                }}
              />
              {/* Effetto vignettatura leggera per dare profondità */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 via-transparent to-slate-900/10 pointer-events-none" />
              {/* Micro attribution discreta Esri */}
              <div className="absolute bottom-1 left-2 pointer-events-none text-[8px] text-slate-500/80 font-sans drop-shadow-2xs">
                © Esri ArcGIS
              </div>
            </div>
          ) : (
            /* Fallback Cartografico Vettoriale Stile Apple Maps (Zero Rete / Offline) */
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-sky-50/40 to-indigo-50/50 flex items-center justify-center overflow-hidden">
              {/* Curve di livello topografiche tenui e reticolo cartografico */}
              <svg className="absolute inset-0 w-full h-full text-slate-200/70" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                {/* Curve topografiche stilizzate */}
                <path d="M-20 80 Q 80 40 180 90 T 380 60 T 580 120" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
                <path d="M-20 120 Q 90 80 200 130 T 400 90 T 600 150" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                <path d="M-20 160 Q 110 130 220 170 T 420 140 T 620 190" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
              </svg>

              {/* Bussola e Coordinate WGS84 sottili in filigrana */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                <div className="w-28 h-28 rounded-full border border-dashed border-indigo-300 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-indigo-200" />
                </div>
              </div>

              {/* Etichetta di geolocalizzazione WGS84 in filigrana */}
              <div className="absolute bottom-2 left-2 text-[9px] font-mono text-slate-400 pointer-events-none">
                {formattedCoords}
              </div>
            </div>
          )}

          {/* Pin Radar Pulsante Centrale */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative flex items-center justify-center">
              {/* Onde concentriche animate */}
              <span className="absolute w-12 h-12 rounded-full bg-indigo-500/25 animate-ping opacity-75 duration-1000" />
              <span className="absolute w-7 h-7 rounded-full bg-indigo-500/35 animate-pulse" />
              {/* Punto radar centrale */}
              <span className="relative w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            </div>
          </div>

          {/* Badge Top/Floating: Località e Bandiera */}
          <div className="absolute top-2.5 left-2.5 max-w-[70%]">
            <div className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm border border-white/60 truncate">
              <span>{currentLocation.flag}</span>
              <span className="truncate">{currentLocation.city}, {currentLocation.country}</span>
            </div>
          </div>

          {/* Micro-tasto Floating in basso a destra "Apri su Maps ↗" */}
          <div className="absolute bottom-2.5 right-2.5">
            <button
              type="button"
              onClick={() => openMapLink(mapSearchUrl)}
              className="inline-flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 text-white backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95 border border-white/20"
              title="Apri le coordinate su Google Maps"
            >
              <span>Apri su Maps</span>
              <span className="text-[10px]">↗</span>
            </button>
          </div>
        </div>

        {/* Dati di Navigazione & Contesto Emozionale */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Coordinate Geografiche */}
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-sm">🧭</span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                Coordinate GPS
              </div>
              <div className="text-[11px] font-bold text-slate-800 font-mono truncate">
                {formattedCoords}
              </div>
            </div>
          </div>

          {/* Distanza da Casa / Italia */}
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-sm">🌍</span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                Distanza dall'Italia
              </div>
              <div className="text-[11px] font-bold text-indigo-700 truncate">
                {distanceFromItalyLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Pulsante di acquisizione GPS reale riservato agli sposi */}
        {!isStandaloneExternal && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleDetectGps(false)}
              disabled={isDetectingGps}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <span>{isDetectingGps ? '🛰️' : '📡'}</span>
              <span>
                {isDetectingGps ? 'Rilevamento satellitare in corso...' : 'Aggiorna posizione adesso'}
              </span>
            </button>

            {gpsError ? (
              <span className="text-[10px] text-rose-500 font-medium">
                {gpsError}
              </span>
            ) : liveGpsState?.accuracy ? (
              <span className="text-[10px] text-slate-400 font-mono">
                Precisione: ±{Math.round(liveGpsState.accuracy)}m
              </span>
            ) : null}
          </div>
        )}
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

      {/* 6. TIMELINE PROGRAMMA DEL GIORNO (Oggi durante il viaggio, Countdown prima della partenza) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{tripCountdown.isPreTrip ? '⏳' : '📅'}</span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {tripCountdown.isPreTrip ? `Mancano ${tripCountdown.diffDays} giorni alla partenza` : 'Oggi'}
              </h3>
              {tripCountdown.isPreTrip && (
                <p className="text-[10px] text-slate-500 font-medium">
                  Partenza prevista: {tripCountdown.firstDateStr}
                </p>
              )}
            </div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
            {tripCountdown.isPreTrip ? 'Prima Tappa' : activeDate}
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
