import type { Giorno, Attivita, Tappa, Alloggio, Trasporto, Coordinate } from '../types';
import { lookupKnownCoordinate } from '../services/routingService';

export interface PlannedLocationInfo {
  title: string;
  city?: string;
  locationName: string;
  coords?: Coordinate;
  confidence: 'high' | 'approximate' | 'low' | 'none';
  explanation: string;
}

export interface InProgressTransportInfo {
  type: string;
  carrier?: string;
  code?: string;
  departureLocation: string;
  arrivalLocation: string;
  departureTime?: string;
  arrivalTime?: string;
  message: string;
}

export interface LiveTimelineEvent {
  type: 'activity' | 'transport' | 'tappa' | 'accommodation' | 'none';
  title: string;
  subtitle?: string;
  timeRange?: string;
  locationName: string;
  coords?: Coordinate;
  isTransportInProgress?: boolean;
  transportDetails?: InProgressTransportInfo;
  confidence: 'high' | 'approximate' | 'low' | 'none';
  reasoning: string;
}

export interface NextTimelineEvent {
  title: string;
  time: string;
  date?: string;
  locationName: string;
  coords?: Coordinate;
}

export interface LocationComparison {
  distanceKm: number;
  label: string;
  status: 'coincident' | 'nearby' | 'different';
}

export interface LiveIntelligenceState {
  tripStatus: 'pre_trip' | 'in_trip' | 'post_trip';
  currentEvent: LiveTimelineEvent | null;
  nextEvent: NextTimelineEvent | null;
  plannedLocation: PlannedLocationInfo | null;
  comparison: LocationComparison | null;
  activeDateStr: string;
}

export interface DeriveIntelligenceParams {
  giorni: Giorno[];
  attivita: Attivita[];
  tappe: Tappa[];
  alloggi: Alloggio[];
  trasporti: Trasporto[];
  currentDateTime: Date;
  tripStartDate?: string; // YYYY-MM-DD
  tripEndDate?: string;   // YYYY-MM-DD
  realGpsCoords?: Coordinate | null;
  gpsAccuracyMeters?: number;
  isExternalGuest?: boolean;
}

/**
 * Calcola la distanza in linea d'aria tra due coordinate usando la formula di Haversine (km).
 */
export function calculateCrowFliesDistanceKm(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371; // Raggio medio terrestre in km
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const dLatRad = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLngRad = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLngRad / 2) * Math.sin(dLngRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Converte data e orario (HH:mm) in un oggetto Date normalizzato.
 */
function parseDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  const time = timeStr && /^\d{1,2}:\d{2}$/.test(timeStr.trim()) ? timeStr.trim() : '00:00';
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Helper per formattare una data ISO 'YYYY-MM-DD' partendo da un oggetto Date locale.
 */
function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Funzione pura per ricavare lo stato d'intelligenza operativa del LIVE:
 * - Attività o trasporto in corso
 * - Prossima tappa / attività
 * - Posizione geografica programmata
 * - Confronto neutro con la posizione GPS reale
 */
export function deriveLiveIntelligence(params: DeriveIntelligenceParams): LiveIntelligenceState {
  const {
    giorni,
    attivita,
    tappe,
    alloggi,
    trasporti,
    currentDateTime,
    tripStartDate,
    tripEndDate,
    realGpsCoords,
    gpsAccuracyMeters,
    isExternalGuest = false
  } = params;

  const todayStr = toDateStr(currentDateTime);

  // PRIVACY OSPITI: se la richiesta proviene da un ospite esterno,
  // l'itinerario privato (alloggi, orari, tappe future) non deve essere divulgato.
  if (isExternalGuest) {
    return {
      tripStatus: 'in_trip',
      currentEvent: null,
      nextEvent: null,
      plannedLocation: null,
      comparison: null,
      activeDateStr: todayStr
    };
  }

  // 1. Determina lo stato del viaggio (pre_trip / in_trip / post_trip)
  let tripStatus: 'pre_trip' | 'in_trip' | 'post_trip' = 'in_trip';
  if (tripStartDate && todayStr < tripStartDate) {
    tripStatus = 'pre_trip';
  } else if (tripEndDate && todayStr > tripEndDate) {
    tripStatus = 'post_trip';
  }

  // Se il viaggio non è ancora iniziato o è terminato, non inventiamo una posizione prevista attuale
  if (tripStatus === 'pre_trip') {
    const firstTransport = [...trasporti].sort((a, b) => a.date.localeCompare(b.date))[0];
    const firstDay = [...giorni].sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];

    const nextEvent: NextTimelineEvent | null = firstTransport
      ? {
          title: `Partenza: ${firstTransport.carrier || firstTransport.type}`,
          time: firstTransport.departureTime || 'In giornata',
          date: firstTransport.date,
          locationName: firstTransport.departureLocation,
          coords: firstTransport.coordinate || lookupKnownCoordinate(firstTransport.departureLocation) || undefined
        }
      : firstDay
        ? {
            title: firstDay.title || 'Inizio viaggio',
            time: 'Giorno 1',
            date: firstDay.date,
            locationName: firstDay.location || 'Destinazione',
            coords: lookupKnownCoordinate(firstDay.location || '') || undefined
          }
        : null;

    return {
      tripStatus: 'pre_trip',
      currentEvent: null,
      nextEvent,
      plannedLocation: {
        title: 'In attesa della partenza',
        locationName: 'Viaggio programmato non ancora iniziato',
        confidence: 'none',
        explanation: 'Il viaggio non è ancora iniziato. La posizione prevista sarà attiva a partire dalla data di partenza.'
      },
      comparison: null,
      activeDateStr: todayStr
    };
  }

  if (tripStatus === 'post_trip') {
    return {
      tripStatus: 'post_trip',
      currentEvent: null,
      nextEvent: null,
      plannedLocation: {
        title: 'Viaggio concluso',
        locationName: 'Itinerario completato',
        confidence: 'none',
        explanation: 'Il viaggio si è concluso. Nessuna posizione prevista attiva.'
      },
      comparison: null,
      activeDateStr: todayStr
    };
  }

  // 2. Viaggio in corso: analizza gli eventi temporali per la data odierna e contigue
  const nowMs = currentDateTime.getTime();

  // 2.A Controllo Trasporti in corso (Voli, Treni, Traghetti, Transfer)
  // Per i trasporti in corso: NON considerare l'arrivo come posizione in cui dovremmo già essere!
  let currentTransportEvent: LiveTimelineEvent | null = null;
  for (const tr of trasporti) {
    const depDate = parseDateTime(tr.date, tr.departureTime);
    if (!depDate) continue;

    const arrDateStr = tr.arrivalDate || tr.dropoffDate || tr.date;
    const arrDate = parseDateTime(arrDateStr, tr.arrivalTime || tr.dropoffTime || tr.departureTime);

    if (depDate && arrDate) {
      const depMs = depDate.getTime();
      const arrMs = arrDate.getTime();

      if (nowMs >= depMs && nowMs <= arrMs) {
        const typeLabel = tr.type === 'volo' ? 'Volo' : tr.type === 'treno' ? 'Treno' : tr.type === 'traghetto' ? 'Traghetto' : tr.type === 'auto' || tr.type === 'camper' ? 'Trasferimento' : 'Spostamento';
        currentTransportEvent = {
          type: 'transport',
          title: `${typeLabel} in corso: ${tr.carrier || tr.type}`,
          subtitle: `${tr.departureLocation} → ${tr.arrivalLocation || tr.dropoffLocation}`,
          timeRange: `${tr.departureTime || ''} – ${tr.arrivalTime || tr.dropoffTime || ''}`,
          locationName: `In transito da ${tr.departureLocation} a ${tr.arrivalLocation || tr.dropoffLocation}`,
          coords: undefined, // NON inventare coordinate in volo o in mare
          isTransportInProgress: true,
          transportDetails: {
            type: tr.type,
            carrier: tr.carrier,
            code: tr.bookingCode,
            departureLocation: tr.departureLocation,
            arrivalLocation: tr.arrivalLocation || tr.dropoffLocation || '',
            departureTime: tr.departureTime,
            arrivalTime: tr.arrivalTime || tr.dropoffTime,
            message: `${typeLabel} in corso da ${tr.departureLocation} verso ${tr.arrivalLocation || tr.dropoffLocation}`
          },
          confidence: 'high',
          reasoning: `Orario attuale compreso tra la partenza (${tr.departureTime || 'N/D'}) e l'arrivo previsto (${tr.arrivalTime || tr.dropoffTime || 'N/D'}).`
        };
        break;
      }
    }
  }

  // 2.B Se non c'è un trasporto in corso, cerca tra le Attività programmate
  let currentActivityEvent: LiveTimelineEvent | null = null;
  const todayActivities = attivita.filter(a => a.date === todayStr);

  for (const act of todayActivities) {
    const actTime = act.time || act.orarioInizio;
    if (!actTime) continue;
    const start = parseDateTime(todayStr, actTime);
    if (!start) continue;

    // Stima durata attività (default 90 min)
    let durationMin = 90;
    if (act.duration) {
      const match = act.duration.match(/(\d+)/);
      if (match) durationMin = parseInt(match[1], 10);
      if (act.duration.includes('h') || act.duration.includes('ora') || act.duration.includes('ore')) {
        durationMin = durationMin * 60;
      }
    } else if (act.hikingDurationMinutes) {
      durationMin = act.hikingDurationMinutes;
    }

    const end = new Date(start.getTime() + durationMin * 60_000);

    if (nowMs >= start.getTime() && nowMs <= end.getTime()) {
      const coords = act.coordinate || (act.location ? lookupKnownCoordinate(act.location) : undefined);
      currentActivityEvent = {
        type: 'activity',
        title: act.title,
        subtitle: act.location || undefined,
        timeRange: `${actTime} (${durationMin}m)`,
        locationName: act.location || act.title,
        coords: coords || undefined,
        confidence: coords ? 'high' : 'approximate',
        reasoning: `Attività programmata in corso (${actTime}).`
      };
      break;
    }
  }

  // 2.C Se nessuna attività specifica in questo orario, controlla alloggio della notte
  let currentAccommodationEvent: LiveTimelineEvent | null = null;
  const currentHotel = alloggi.find(all => {
    return all.checkIn <= todayStr && all.checkOut >= todayStr;
  });

  if (currentHotel && !currentTransportEvent && !currentActivityEvent) {
    const coords = currentHotel.coordinate || lookupKnownCoordinate(currentHotel.location || currentHotel.name);
    currentAccommodationEvent = {
      type: 'accommodation',
      title: `Alloggio: ${currentHotel.name}`,
      subtitle: currentHotel.location,
      timeRange: `Check-in ${currentHotel.checkIn} · Check-out ${currentHotel.checkOut}`,
      locationName: currentHotel.location || currentHotel.name,
      coords: coords || undefined,
      confidence: coords ? 'approximate' : 'low',
      reasoning: 'Nessuna attività o trasporto programmato in questo momento. Alloggio di riferimento per la data odierna.'
    };
  }

  // 2.D Controllo Tappa del giorno come fallback di contesto
  const currentDayTappa = tappe.find(t => (t.data || t.date) === todayStr);

  // Sceglie l'evento corrente con priorità: Trasporto in corso > Attività in corso > Alloggio > Tappa
  const currentEvent: LiveTimelineEvent | null =
    currentTransportEvent ||
    currentActivityEvent ||
    currentAccommodationEvent ||
    (currentDayTappa
      ? {
          type: 'tappa',
          title: currentDayTappa.titolo,
          subtitle: currentDayTappa.nota || undefined,
          locationName: currentDayTappa.titolo,
          coords: currentDayTappa.coordinate || lookupKnownCoordinate(currentDayTappa.titolo) || undefined,
          confidence: 'approximate',
          reasoning: 'Tappa programmata per la giornata odierna.'
        }
      : null);

  // 3. Calcolo Posizione Programmata (Planned Location)
  let plannedLocation: PlannedLocationInfo | null = null;
  if (currentEvent) {
    if (currentEvent.isTransportInProgress) {
      plannedLocation = {
        title: currentEvent.title,
        locationName: currentEvent.locationName,
        coords: undefined, // Non proiettiamo coordinate arbitrarie durante il trasporto
        confidence: 'none',
        explanation: currentEvent.reasoning
      };
    } else if (currentEvent.coords) {
      plannedLocation = {
        title: currentEvent.title,
        city: currentEvent.subtitle,
        locationName: currentEvent.locationName,
        coords: currentEvent.coords,
        confidence: currentEvent.confidence,
        explanation: currentEvent.reasoning
      };
    } else {
      plannedLocation = {
        title: currentEvent.title,
        locationName: currentEvent.locationName,
        coords: undefined,
        confidence: 'approximate',
        explanation: `${currentEvent.reasoning} Coordinate non disponibili per ${currentEvent.locationName}.`
      };
    }
  }

  // 4. Calcolo Prossima Attività / Tappa (Next Event)
  let nextEvent: NextTimelineEvent | null = null;

  // Raccoglie tutti gli eventi futuri
  const futureCandidates: { date: string; time: string; title: string; location: string; coords?: Coordinate; ms: number }[] = [];

  // Attività future
  for (const act of attivita) {
    const actDate = act.date;
    const actTime = act.time || act.orarioInizio;
    if (!actTime || !actDate) continue;
    const dt = parseDateTime(actDate, actTime);
    if (dt && dt.getTime() > nowMs) {
      futureCandidates.push({
        date: actDate,
        time: actTime,
        title: act.title,
        location: act.location || act.title,
        coords: act.coordinate || (act.location ? lookupKnownCoordinate(act.location) : undefined) || undefined,
        ms: dt.getTime()
      });
    }
  }

  // Trasporti futuri
  for (const tr of trasporti) {
    if (!tr.date) continue;
    const dt = parseDateTime(tr.date, tr.departureTime);
    if (dt && dt.getTime() > nowMs) {
      futureCandidates.push({
        date: tr.date,
        time: tr.departureTime || 'Orario da def.',
        title: `${tr.type === 'volo' ? 'Volo' : tr.type === 'treno' ? 'Treno' : 'Trasporto'}: ${tr.carrier || tr.departureLocation}`,
        location: tr.departureLocation,
        coords: tr.coordinate || lookupKnownCoordinate(tr.departureLocation) || undefined,
        ms: dt.getTime()
      });
    }
  }

  // Tappe future se non ci sono attività future
  if (futureCandidates.length === 0) {
    for (const tp of tappe) {
      const tpDate = tp.data || tp.date;
      if (tpDate && tpDate > todayStr) {
        futureCandidates.push({
          date: tpDate,
          time: tp.orario || tp.time || 'Tappa prevista',
          title: tp.titolo,
          location: tp.titolo,
          coords: tp.coordinate || lookupKnownCoordinate(tp.titolo) || undefined,
          ms: new Date(tpDate + 'T09:00:00').getTime()
        });
      }
    }
  }

  futureCandidates.sort((a, b) => a.ms - b.ms);
  if (futureCandidates.length > 0) {
    const firstFuture = futureCandidates[0];
    nextEvent = {
      title: firstFuture.title,
      time: firstFuture.time,
      date: firstFuture.date,
      locationName: firstFuture.location,
      coords: firstFuture.coords
    };
  }

  // 5. Confronto Geografico tra Posizione GPS Reale e Posizione Programmata
  let comparison: LocationComparison | null = null;
  if (realGpsCoords && plannedLocation?.coords) {
    const dist = calculateCrowFliesDistanceKm(realGpsCoords, plannedLocation.coords);
    const thresholdCoincidentKm = Math.max(0.5, ((gpsAccuracyMeters || 50) * 2) / 1000);

    if (dist <= thresholdCoincidentKm) {
      comparison = {
        distanceKm: dist,
        label: 'Posizione in linea con il programma',
        status: 'coincident'
      };
    } else if (dist <= 5) {
      comparison = {
        distanceKm: dist,
        label: `Nelle vicinanze del luogo previsto (~${dist} km)`,
        status: 'nearby'
      };
    } else {
      comparison = {
        distanceKm: dist,
        label: `Posizione prevista a circa ${Math.round(dist)} km in linea d'aria`,
        status: 'different'
      };
    }
  }

  return {
    tripStatus,
    currentEvent,
    nextEvent,
    plannedLocation,
    comparison,
    activeDateStr: todayStr
  };
}
