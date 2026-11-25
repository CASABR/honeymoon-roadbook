import {
  getStrictTimeZoneFromCoordinates,
  getZonedWallClockParts,
  isValidIanaTimeZone,
  resolveUnambiguousPlaceTimeZone,
} from './reliableTimeZone';

export type LiveTravelTimeZoneSource = 'gps' | 'header' | 'planned' | 'pre_trip' | 'unavailable';

export interface LiveTravelTimeZoneResolution {
  timeZone: string | null;
  label: string;
  source: LiveTravelTimeZoneSource;
}

export interface LiveClockSnapshot {
  timeZone: string;
  timeStr: string;
  dateStr: string;
  isoDate: string;
  hour: number;
  minute: number;
  isDay: boolean;
  dayNightIcon: '☀️' | '🌙';
  dayNightLabel: 'Giorno' | 'Notte';
}

export interface LiveDualClockViewModel {
  italy: LiveClockSnapshot;
  travel: LiveClockSnapshot | null;
  travelLabel: string;
  travelSource: LiveTravelTimeZoneSource;
  offsetLabel: string | null;
  dayDiff: number;
  isDifferentDate: boolean;
}

export interface ResolveLiveTravelTimeZoneParams {
  isExternal: boolean;
  realLocation?: {
    lat?: number;
    lng?: number;
    city?: string;
    country?: string;
    timeZone?: string;
  } | null;
  publicCurrentCity?: string | null;
  plannedLocation?: {
    title?: string;
    city?: string;
    coords?: { lat: number; lng: number };
  } | null;
  fallbackLocationTexts?: Array<string | null | undefined>;
  tripStatus?: 'pre_trip' | 'in_trip' | 'post_trip' | 'unknown';
}

const MIN_VALID_EPOCH_MS = Date.UTC(2000, 0, 1);

function resolveLiveCoordinateTimeZone(lat: number, lng: number): string | null {
  const strict = getStrictTimeZoneFromCoordinates(lat, lng);
  if (strict) return strict;
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat > -48 && lat < -33 && lng >= 179.5 && lng <= 180) {
    return 'Pacific/Auckland';
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 30 && lat <= 46 && lng > 135.1 && lng <= 146) {
    return 'Asia/Tokyo';
  }
  return null;
}

function resolveLivePlaceTimeZone(text: unknown): string | null {
  const resolved = resolveUnambiguousPlaceTimeZone(text);
  if (resolved) return resolved;
  if (typeof text === 'string' && /\b(tokyo|kyoto|osaka|giappone|japan)\b/i.test(text)) {
    return 'Asia/Tokyo';
  }
  return null;
}

/**
 * Converte in Date valido solo timestamp reali (>= 2000-01-01).
 * Restituisce `null` se mancante, invalido o sentinel epoch 0.
 */
export function parseSafeGpsDate(date: unknown): Date | null {
  if (!date) return null;
  let parsed: Date | null = null;
  if (date instanceof Date) {
    parsed = date;
  } else if (typeof date === 'number') {
    parsed = new Date(date);
  } else if (typeof date === 'object' && date !== null && typeof (date as { toDate?: unknown }).toDate === 'function') {
    try {
      parsed = (date as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  } else if (typeof date === 'string') {
    parsed = new Date(date);
  }
  if (!parsed) return null;
  const ms = parsed.getTime();
  if (!Number.isFinite(ms) || ms < MIN_VALID_EPOCH_MS) return null;
  return parsed;
}

/**
 * Formatta il tempo trascorso dall'ultima posizione GPS effettivamente ricevuta.
 * Non inventa alcun valore se il timestamp reale manca o non è valido.
 */
export function formatGpsPositionAge(date: unknown, nowMs: number = Date.now()): string | null {
  const parsed = parseSafeGpsDate(date);
  if (!parsed || !Number.isFinite(nowMs)) return null;
  const diffMs = Math.max(0, nowMs - parsed.getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) {
    return `Posizione aggiornata ${totalMinutes} min fa`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remMinutes > 0
      ? `Posizione aggiornata ${totalHours} h ${remMinutes} min fa`
      : `Posizione aggiornata ${totalHours} h fa`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0
    ? `Posizione aggiornata ${days} g ${remHours} h fa`
    : `Posizione aggiornata ${days} g fa`;
}

/**
 * Determina giorno (06:00–19:59) o notte (20:00–05:59) in base all'ora locale del fuso.
 */
export function isLocalDaytimeHour(hour: number): boolean {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  return normalized >= 6 && normalized < 20;
}

/**
 * Risolve il fuso IANA della posizione/tappa del viaggio senza nuove API e senza aprire dati privati agli ospiti.
 */
export function resolveLiveTravelTimeZone(params: ResolveLiveTravelTimeZoneParams): LiveTravelTimeZoneResolution {
  const { isExternal, realLocation, publicCurrentCity, plannedLocation, fallbackLocationTexts = [], tripStatus } = params;

  // 1. Posizione GPS reale attiva/conosciuta (valida per tutti i ruoli se già condivisa)
  if (realLocation) {
    const label = String(realLocation.city || realLocation.country || 'Posizione GPS').trim() || 'Posizione GPS';
    if (isValidIanaTimeZone(realLocation.timeZone)) {
      return { timeZone: realLocation.timeZone.trim(), label, source: 'gps' };
    }
    if (typeof realLocation.lat === 'number' && typeof realLocation.lng === 'number') {
      const strictTz = resolveLiveCoordinateTimeZone(realLocation.lat, realLocation.lng);
      if (strictTz) {
        return { timeZone: strictTz, label, source: 'gps' };
      }
    }
    const gpsPlaceTz = resolveLivePlaceTimeZone(`${realLocation.city || ''} ${realLocation.country || ''}`);
    if (gpsPlaceTz) {
      return { timeZone: gpsPlaceTz, label, source: 'gps' };
    }
  }

  // 2. Città pubblica dichiarata nella testata /live_feeds/{tripId} (senza letture private)
  if (typeof publicCurrentCity === 'string' && publicCurrentCity.trim()) {
    const cleanCity = publicCurrentCity.trim();
    const headerTz = resolveLivePlaceTimeZone(cleanCity);
    if (headerTz) {
      return { timeZone: headerTz, label: cleanCity, source: 'header' };
    }
  }

  // Gli ospiti esterni non leggono itinerario o collezioni private: fallback discreto
  if (isExternal) {
    return {
      timeZone: null,
      label: 'Ora locale del viaggio',
      source: 'unavailable',
    };
  }

  // 3. Vista interna autorizzata: usa coordinate/toponimo dell'itinerario programmato
  if (plannedLocation?.coords) {
    const plannedTz = resolveLiveCoordinateTimeZone(plannedLocation.coords.lat, plannedLocation.coords.lng);
    if (plannedTz) {
      const label = String(plannedLocation.city || plannedLocation.title || 'Itinerario').trim() || 'Itinerario';
      return { timeZone: plannedTz, label, source: 'planned' };
    }
  }

  const textCandidates = [plannedLocation?.city, plannedLocation?.title, ...fallbackLocationTexts];
  for (const candidate of textCandidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const tz = resolveLivePlaceTimeZone(candidate);
    if (tz) {
      return { timeZone: tz, label: candidate.trim(), source: 'planned' };
    }
  }

  if (tripStatus === 'pre_trip') {
    return {
      timeZone: 'Europe/Rome',
      label: 'Italia (pre-partenza)',
      source: 'pre_trip',
    };
  }

  return {
    timeZone: null,
    label: 'Ora locale del viaggio',
    source: 'unavailable',
  };
}

/**
 * Calcola lo snapshot orario (HH:mm, data locale, sole/luna) per un fuso IANA valido.
 */
export function buildClockSnapshot(nowMs: number, timeZone: string): LiveClockSnapshot | null {
  if (!Number.isFinite(nowMs) || !isValidIanaTimeZone(timeZone)) return null;
  const cleanTz = timeZone.trim();
  const parts = getZonedWallClockParts(nowMs, cleanTz);
  if (!parts) return null;

  const isDay = isLocalDaytimeHour(parts.hour);
  const timeStr = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  let dateStr = parts.dateStr;
  try {
    dateStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: cleanTz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(nowMs));
  } catch {
    // Fallback ISO già impostato
  }

  return {
    timeZone: cleanTz,
    timeStr,
    dateStr,
    isoDate: parts.dateStr,
    hour: parts.hour,
    minute: parts.minute,
    isDay,
    dayNightIcon: isDay ? '☀️' : '🌙',
    dayNightLabel: isDay ? 'Giorno' : 'Notte',
  };
}

/**
 * Calcola differenza oraria e cambio data tra fuso locale del viaggio ed Europe/Rome.
 */
export function formatOffsetDiffMinutes(diffMinutes: number): string {
  const rounded = Math.round(diffMinutes);
  if (rounded === 0) return '0h';
  const sign = rounded > 0 ? '+' : '−';
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins > 0 ? `${sign}${hours}h ${mins}m` : `${sign}${hours}h`;
}

export function buildLiveDualClockViewModel(
  nowMs: number,
  resolution: LiveTravelTimeZoneResolution
): LiveDualClockViewModel {
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const italy = buildClockSnapshot(safeNowMs, 'Europe/Rome')!;
  const travel = resolution.timeZone ? buildClockSnapshot(safeNowMs, resolution.timeZone) : null;

  if (!travel) {
    return {
      italy,
      travel: null,
      travelLabel: resolution.label || 'Ora locale del viaggio',
      travelSource: resolution.source,
      offsetLabel: null,
      dayDiff: 0,
      isDifferentDate: false,
    };
  }

  const italyParts = getZonedWallClockParts(safeNowMs, 'Europe/Rome')!;
  const travelParts = getZonedWallClockParts(safeNowMs, travel.timeZone)!;

  const italyWallMs = Date.UTC(italyParts.year, italyParts.month - 1, italyParts.day, italyParts.hour, italyParts.minute);
  const travelWallMs = Date.UTC(travelParts.year, travelParts.month - 1, travelParts.day, travelParts.hour, travelParts.minute);
  const offsetDiffMinutes = Math.round((travelWallMs - italyWallMs) / 60_000);

  const italyDayMs = Date.UTC(italyParts.year, italyParts.month - 1, italyParts.day);
  const travelDayMs = Date.UTC(travelParts.year, travelParts.month - 1, travelParts.day);
  const dayDiff = Math.round((travelDayMs - italyDayMs) / 86_400_000);

  return {
    italy,
    travel,
    travelLabel: resolution.label,
    travelSource: resolution.source,
    offsetLabel: formatOffsetDiffMinutes(offsetDiffMinutes),
    dayDiff,
    isDifferentDate: italy.isoDate !== travel.isoDate,
  };
}
