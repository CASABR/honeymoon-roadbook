import type { Coordinate, Trasporto } from '../types';
import { getTimezoneFromCoordinates } from '../services/geolocationService';
import { lookupKnownCoordinate } from './geoCoordinatesHelper';

export type ImportantTransportKind = 'volo' | 'treno' | 'traghetto';

/**
 * Sottoinsieme pubblico rigorosamente sanificato del prossimo spostamento.
 * Non contiene MAI PNR, bookingCode, costi, posti, documenti, indirizzi privati o note interne.
 */
export interface PublicNextTransportInfo {
  id: string;
  type: ImportantTransportKind;
  typeLabel: 'Volo' | 'Treno' | 'Traghetto';
  icon: '✈️' | '🚆' | '⛴️';
  fromLabel: string;
  toLabel: string;
  routeLabel: string;
  date: string;
  dateLabel: string;
  departureTime: string;
  timeZone: string;
  serviceNumber?: string;
  flightradarUrl?: string;
  departureUtcMs: number;
}

/**
 * Payload minimale e rigorosamente sanificato salvato su `/live_feeds/{tripId}.nextTransport`.
 * Non include ID interni, PNR, prenotazioni o URL arbitrari (il link Flightradar24 è derivato lato client).
 */
export interface PublicNextTransportFeedProjection {
  type: ImportantTransportKind;
  fromLabel: string;
  toLabel: string;
  date: string;
  departureTime: string;
  timeZone: string;
  departureUtcMs: number;
  serviceNumber?: string;
}

const INCLUDED_KINDS = new Set<string>(['volo', 'treno', 'traghetto']);

const MINOR_OR_URBAN_PATTERN =
  /\b(mrt|metro|subway|suburban|commuter|urban[oa]|urbano|tram|shuttle|navetta|taxi|uber|grab|triciclo|tricycle|e-?trike|transfer multimodale|water taxi|vaporetto|cityrail|sydney\s*trains?|sydney\s*ferries|manly\s*fast\s*ferry|harbour\s*ferry|airport\s*(?:link|express|mrt)|s-?bahn|rer|tube|overground)\b/i;

const PLACEHOLDER_ROUTE_PATTERN = /^(?:da\s+trovare|tbd|da\s+definire|n\/?d|-+)$/i;

const LONG_DISTANCE_TRAIN_HINT_PATTERN =
  /\b(frecciarossa|frecciargento|frecciabianca|italo|intercity|eurocity|eurostar|railjet|nightjet|tgv|ice|ave|thalys|ouigo|renfe|trenitalia|sncf|obb|sbb|shinkansen|kiwirail|tranzalpine|northern\s*explorer|coastal\s*pacific|indian\s*pacific|the\s*ghan|overlander)\b/i;

const TRAIN_NUMBER_PATTERN =
  /\b(?:(?:Frecciarossa|Frecciargento|Frecciabianca|Italo|Intercity|Eurocity|Eurostar|Railjet|Nightjet|Shinkansen)\s+(?:n[°.]?\s*)?(\d{2,5})|(FR|FA|FB|ICN?|EC|EN|NJ|RJ|ES|TGV|ICE|AVE)\s*[-]?\s*(\d{2,5}))\b/i;

const PNR_CONTEXT_BEFORE_PATTERN =
  /(?:pnr|codice|prenotazione|booking|rif\.?|riferimento|ticket|e-?ticket|conferma)\s*[:#-]?\s*$/i;

const AIRCRAFT_CODE_PATTERN = /^(?:A220|A3\d\d|B7\d\d|E1\d\d|CR\d{2,3})$/i;

const IATA_TIMEZONE_HINTS: Record<string, string> = {
  MXP: 'Europe/Rome',
  FCO: 'Europe/Rome',
  LIN: 'Europe/Rome',
  BGY: 'Europe/Rome',
  PEK: 'Asia/Shanghai',
  PKX: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai',
  SHA: 'Asia/Shanghai',
  AKL: 'Pacific/Auckland',
  WLG: 'Pacific/Auckland',
  CHC: 'Pacific/Auckland',
  ZQN: 'Pacific/Auckland',
  ADL: 'Australia/Adelaide',
  MEL: 'Australia/Melbourne',
  SYD: 'Australia/Sydney',
  BNE: 'Australia/Brisbane',
  PER: 'Australia/Perth',
  MNL: 'Asia/Manila',
  MPH: 'Asia/Manila',
  ENI: 'Asia/Manila',
  USU: 'Asia/Manila',
  CEB: 'Asia/Manila',
  TAG: 'Asia/Manila',
  IAO: 'Asia/Manila',
  TPE: 'Asia/Taipei',
  TSA: 'Asia/Taipei',
};

const CITY_TIMEZONE_HINTS: Array<[RegExp, string]> = [
  [/\b(roma|milano|torino|firenze|venezia|bologna|napoli|malpensa|fiumicino)\b/i, 'Europe/Rome'],
  [/\b(pechino|beijing|shanghai)\b/i, 'Asia/Shanghai'],
  [/\b(auckland|wellington|picton|christchurch|queenstown|rotorua)\b/i, 'Pacific/Auckland'],
  [/\b(adelaide|cape\s*jervis|penneshaw|kangaroo\s*island)\b/i, 'Australia/Adelaide'],
  [/\b(melbourne|tullamarine|st\s*kilda|avalon)\b/i, 'Australia/Melbourne'],
  [/\b(sydney|kingsford\s*smith|circular\s*quay|manly)\b/i, 'Australia/Sydney'],
  [/\b(manila|ninoy\s*aquino|caticlan|boracay|el\s*nido|coron|busuanga|cebu|mactan)\b/i, 'Asia/Manila'],
  [/\b(taipei|taoyuan)\b/i, 'Asia/Taipei'],
];

function isValidTimeZone(tz?: string): tz is string {
  if (!tz || typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

function parseIsoDate(dateStr?: string): [number, number, number] | null {
  if (typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseHourMinute(timeStr?: string): [number, number] | null {
  if (typeof timeStr !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return [hour, minute];
}

function durationMinutesBetween(tr: Trasporto): number | null {
  const startHm = parseHourMinute(tr.departureTime);
  const endHm = parseHourMinute(tr.arrivalTime);
  const startYmd = parseIsoDate(tr.date || tr.data);
  if (!startHm || !endHm || !startYmd) return null;
  const endYmd = parseIsoDate(tr.arrivalDate) || startYmd;
  const startUtc = Date.UTC(startYmd[0], startYmd[1] - 1, startYmd[2], startHm[0], startHm[1]);
  const endUtc = Date.UTC(endYmd[0], endYmd[1] - 1, endYmd[2], endHm[0], endHm[1]);
  return Math.round((endUtc - startUtc) / 60_000);
}

/**
 * Risolve il fuso IANA di partenza dello spostamento rispettando il campo salvato
 * e ricadendo in ordine deterministico su IATA, toponimo o coordinate note.
 */
export function resolveTransportDepartureTimeZone(tr: Trasporto): string {
  if (isValidTimeZone(tr.departureTimeZone)) {
    return tr.departureTimeZone.trim();
  }

  const depIata = (tr.departureIata || '').trim().toUpperCase();
  if (depIata && IATA_TIMEZONE_HINTS[depIata]) {
    return IATA_TIMEZONE_HINTS[depIata];
  }

  const depLoc = `${tr.departureLocation || ''} ${tr.arrivalLocation || ''}`;
  const iataInLoc = /\b([A-Z]{3})\b/.exec(tr.departureLocation || '');
  if (iataInLoc && IATA_TIMEZONE_HINTS[iataInLoc[1]]) {
    return IATA_TIMEZONE_HINTS[iataInLoc[1]];
  }

  for (const [pattern, tz] of CITY_TIMEZONE_HINTS) {
    if (pattern.test(tr.departureLocation || '')) return tz;
  }
  for (const [pattern, tz] of CITY_TIMEZONE_HINTS) {
    if (pattern.test(depLoc)) return tz;
  }

  const coords: Coordinate | null =
    tr.coordinate || lookupKnownCoordinate(tr.departureLocation || '') || lookupKnownCoordinate(depIata);
  if (coords) {
    return getTimezoneFromCoordinates(coords.lat, coords.lng);
  }

  try {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(localTz)) return localTz;
  } catch {
    // fallback sicuro
  }
  return 'UTC';
}

/**
 * Converte data YYYY-MM-DD e ora HH:mm in epoch UTC rispetto al fuso IANA indicato.
 */
export function zonedDateTimeToEpochMs(dateStr: string, timeStr: string, timeZone: string): number | null {
  const ymd = parseIsoDate(dateStr);
  const hm = parseHourMinute(timeStr);
  if (!ymd || !hm) return null;

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const desiredAsUtc = Date.UTC(ymd[0], ymd[1] - 1, ymd[2], hm[0], hm[1]);
    let candidate = desiredAsUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = formatter.formatToParts(new Date(candidate));
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value || 0);
      const actualAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'));
      const delta = desiredAsUtc - actualAsUtc;
      candidate += delta;
      if (delta === 0) break;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Determina se uno spostamento è importante (voli, treni a lunga percorrenza, traghetti principali),
 * escludendo taxi, metro, bus urbani, transfer minori, placeholder e corse annullate.
 */
export function isImportantTransport(tr: Trasporto): boolean {
  if (!tr || !INCLUDED_KINDS.has(tr.type)) return false;
  if (tr.status === 'annullato') return false;

  const dateStr = (tr.date || tr.data || '').trim();
  if (!parseIsoDate(dateStr) || !parseHourMinute(tr.departureTime)) return false;

  const dep = (tr.departureLocation || '').trim();
  const arr = (tr.arrivalLocation || '').trim();
  if (!dep || !arr || PLACEHOLDER_ROUTE_PATTERN.test(dep) || PLACEHOLDER_ROUTE_PATTERN.test(arr)) {
    return false;
  }

  const carrierText = `${tr.carrier || ''} ${(tr as unknown as { title?: string }).title || ''}`.trim();

  if (tr.type === 'volo') {
    return true;
  }

  if (MINOR_OR_URBAN_PATTERN.test(carrierText) || MINOR_OR_URBAN_PATTERN.test(`${dep} ${arr}`)) {
    return false;
  }

  if (tr.type === 'treno') {
    if (LONG_DISTANCE_TRAIN_HINT_PATTERN.test(carrierText) || TRAIN_NUMBER_PATTERN.test(carrierText)) {
      return true;
    }
    const mins = durationMinutesBetween(tr);
    return mins !== null && mins >= 60;
  }

  // Traghetto: esclude già tramite MINOR_OR_URBAN_PATTERN traghetti urbani e transfer multimodali
  return true;
}

/**
 * Estrae esclusivamente un codice volo reale o un numero treno pubblico dal nome vettore/servizio.
 * Ignora qualsiasi riferimento privato (PNR, bookingCode) e sigle aeromobile (A330, A350, B787).
 */
export function extractPublicServiceNumber(type: ImportantTransportKind, carrier?: string): string | undefined {
  if (!carrier || typeof carrier !== 'string') return undefined;

  if (type === 'volo') {
    // Valuta prima la porzione fuori dalle parentesi per evitare aeromobili (Airbus A330-900) o prosecuzioni (Prosecuzione CA950)
    const outsideParens = carrier.replace(/\([^)]*\)/g, ' ');
    for (const source of [outsideParens, carrier]) {
      const regex = /\b([A-Z]{2}|\d[A-Z]|[A-Z]\d)\s*[-]?\s*(\d{1,4})\b/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        const prefixBefore = source.slice(Math.max(0, match.index - 28), match.index);
        if (PNR_CONTEXT_BEFORE_PATTERN.test(prefixBefore)) continue;
        const airline = match[1].toUpperCase();
        const num = match[2];
        const compact = `${airline}${num}`;
        if (AIRCRAFT_CODE_PATTERN.test(compact)) continue;
        return compact;
      }
    }
    return undefined;
  }

  if (type === 'treno') {
    const clean = carrier.replace(/\([^)]*\)/g, ' ');
    const match = TRAIN_NUMBER_PATTERN.exec(clean);
    if (!match) return undefined;
    const prefixBefore = clean.slice(0, match.index);
    if (PNR_CONTEXT_BEFORE_PATTERN.test(prefixBefore)) return undefined;
    if (match[1]) return match[0].replace(/\s+n[°.]?\s*/i, ' ').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (match[2] && match[3]) return `${match[2].toUpperCase()} ${match[3]}`.slice(0, 32);
  }

  return undefined;
}

/**
 * Costruisce l'URL Flightradar24 esclusivamente per un numero di volo reale.
 */
export function buildFlightradarUrl(flightNumber?: string): string | undefined {
  if (!flightNumber) return undefined;
  const match = /^([A-Z0-9]{2})(\d{1,4})$/i.exec(flightNumber.trim());
  if (!match) return undefined;
  const normalizedDigits = String(Number(match[2]));
  return `https://www.flightradar24.com/data/flights/${match[1].toLowerCase()}${normalizedDigits}`;
}

function sanitizePlaceLabel(rawLocation?: string, iata?: string): string {
  let clean = String(rawLocation || '')
    .replace(/\b(?:pnr|codice|booking|ticket|eticket|rif\.?|riferimento)\s*[:#-]?\s*[a-z0-9-]+/gi, '')
    .replace(/\(\s*(?:da confermare|verificare|indicativo)[^)]*\)/gi, '')
    .replace(/[([][^)\]]*\b(?:pnr|codice|booking|ticket|rif\.?|riferimento)\b[^)\]]*[)\]]/gi, '')
    .replace(/\(\s*[-:,.;]*\s*\)|\[\s*[-:,.;]*\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s-]+|[,\s-]+$/g, '')
    .trim();

  if (!clean && iata) return iata.trim().toUpperCase().slice(0, 100);
  if (iata) {
    const upperIata = iata.trim().toUpperCase();
    if (upperIata && !clean.toUpperCase().includes(upperIata)) {
      const suffix = ` (${upperIata})`;
      clean = `${clean.slice(0, Math.max(0, 100 - suffix.length)).trim()}${suffix}`;
    }
  }
  return clean.slice(0, 100).trim();
}

function formatLocalDepartureDate(dateStr: string, timeZone: string): string {
  const epoch = zonedDateTimeToEpochMs(dateStr, '12:00', timeZone);
  if (epoch === null) return dateStr;
  try {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone,
      day: 'numeric',
      month: 'short',
    }).format(new Date(epoch));
  } catch {
    return dateStr;
  }
}

const KIND_PRIORITY: Record<ImportantTransportKind, number> = {
  volo: 0,
  traghetto: 1,
  treno: 2,
};

const KIND_META: Record<ImportantTransportKind, { label: 'Volo' | 'Treno' | 'Traghetto'; icon: '✈️' | '🚆' | '⛴️' }> = {
  volo: { label: 'Volo', icon: '✈️' },
  traghetto: { label: 'Traghetto', icon: '⛴️' },
  treno: { label: 'Treno', icon: '🚆' },
};

export const MAX_PUBLIC_UPCOMING_TRANSPORTS = 12;

/**
 * Restituisce tutti gli spostamenti importanti futuri ordinati cronologicamente (sanificati, fino a `maxItems`).
 */
export function deriveUpcomingImportantTransports(
  trasporti: Trasporto[] | null | undefined,
  now: Date = new Date(),
  maxItems: number = MAX_PUBLIC_UPCOMING_TRANSPORTS
): PublicNextTransportInfo[] {
  if (!Array.isArray(trasporti) || trasporti.length === 0 || maxItems <= 0) return [];

  const nowMs = now.getTime();
  const candidates: PublicNextTransportInfo[] = [];

  for (const tr of trasporti) {
    if (!isImportantTransport(tr)) continue;

    const kind = tr.type as ImportantTransportKind;
    const dateStr = (tr.date || tr.data || '').trim();
    const depTime = (tr.departureTime || '').trim();
    const timeZone = resolveTransportDepartureTimeZone(tr);
    const departureUtcMs = zonedDateTimeToEpochMs(dateStr, depTime, timeZone);

    if (departureUtcMs === null || departureUtcMs <= nowMs) continue;

    const from = sanitizePlaceLabel(tr.departureLocation, tr.departureIata);
    const to = sanitizePlaceLabel(tr.arrivalLocation, tr.arrivalIata);
    if (!from || !to) continue;

    const meta = KIND_META[kind];
    const serviceNumber = extractPublicServiceNumber(kind, tr.carrier);
    const flightradarUrl = kind === 'volo' ? buildFlightradarUrl(serviceNumber) : undefined;

    candidates.push({
      id: tr.id,
      type: kind,
      typeLabel: meta.label,
      icon: meta.icon,
      fromLabel: from,
      toLabel: to,
      routeLabel: `${from} → ${to}`,
      date: dateStr,
      dateLabel: formatLocalDepartureDate(dateStr, timeZone),
      departureTime: depTime,
      timeZone,
      ...(serviceNumber ? { serviceNumber } : {}),
      ...(flightradarUrl ? { flightradarUrl } : {}),
      departureUtcMs,
    });
  }

  candidates.sort((a, b) => {
    if (a.departureUtcMs !== b.departureUtcMs) return a.departureUtcMs - b.departureUtcMs;
    const prioDiff = KIND_PRIORITY[a.type] - KIND_PRIORITY[b.type];
    if (prioDiff !== 0) return prioDiff;
    return a.id.localeCompare(b.id);
  });

  return candidates.slice(0, maxItems);
}

/**
 * Seleziona automaticamente il prossimo spostamento importante futuro rispetto all'istante corrente.
 * Restituisce `null` se non esistono spostamenti importanti futuri o se `trasporti` è vuoto.
 */
export function deriveNextImportantTransport(
  trasporti: Trasporto[] | null | undefined,
  now: Date = new Date()
): PublicNextTransportInfo | null {
  return deriveUpcomingImportantTransports(trasporti, now, 1)[0] ?? null;
}

function sanitizePublicFeedServiceNumber(type: ImportantTransportKind, rawNumber?: unknown): string | undefined {
  if (typeof rawNumber !== 'string') return undefined;
  const trimmed = rawNumber.trim().slice(0, 32);
  if (!trimmed) return undefined;
  return extractPublicServiceNumber(type, trimmed);
}

/**
 * Converte lo stato locale in un payload minimo pubblico idoneo a `/live_feeds/{tripId}.nextTransport`.
 */
export function toPublicNextTransportFeedProjection(
  info: PublicNextTransportInfo | null | undefined
): PublicNextTransportFeedProjection | null {
  if (!info || !INCLUDED_KINDS.has(info.type)) return null;
  if (!parseIsoDate(info.date) || !parseHourMinute(info.departureTime)) return null;
  if (typeof info.departureUtcMs !== 'number' || !Number.isFinite(info.departureUtcMs) || info.departureUtcMs <= 0) {
    return null;
  }

  const fromLabel = sanitizePlaceLabel(info.fromLabel).slice(0, 100);
  const toLabel = sanitizePlaceLabel(info.toLabel).slice(0, 100);
  const timeZone = isValidTimeZone(info.timeZone) ? info.timeZone.trim().slice(0, 64) : 'UTC';
  if (!fromLabel || !toLabel) return null;

  const serviceNumber = sanitizePublicFeedServiceNumber(info.type, info.serviceNumber);
  return {
    type: info.type,
    fromLabel,
    toLabel,
    date: info.date.trim(),
    departureTime: info.departureTime.trim(),
    timeZone,
    departureUtcMs: Math.round(info.departureUtcMs),
    ...(serviceNumber ? { serviceNumber } : {}),
  };
}

/**
 * Serializza in modo deterministico la proiezione pubblica per evitare scritture Firestore ridondanti.
 */
export function serializePublicNextTransportProjection(
  proj: PublicNextTransportFeedProjection | string | null | undefined
): string {
  const normalized = proj ? hydrateFeedProjectionRaw(proj) : null;
  if (!normalized) return 'null';
  return JSON.stringify([
    normalized.type,
    normalized.fromLabel,
    normalized.toLabel,
    normalized.date,
    normalized.departureTime,
    normalized.timeZone,
    normalized.departureUtcMs,
    normalized.serviceNumber || '',
  ]);
}

function parseTokenProjectionRaw(raw: string): PublicNextTransportFeedProjection | null {
  const parts = raw.split('|');
  if (parts.length !== 8) return null;
  const [type, fromLabel, toLabel, date, departureTime, timeZone, utcStr, serviceNumber] = parts;
  if (!/^\d{10,15}$/.test(utcStr)) return null;
  return hydrateFeedProjectionRaw({
    type,
    fromLabel,
    toLabel,
    date,
    departureTime,
    timeZone,
    departureUtcMs: Number(utcStr),
    ...(serviceNumber ? { serviceNumber } : {}),
  });
}

function hydrateFeedProjectionRaw(raw: unknown): PublicNextTransportFeedProjection | null {
  if (typeof raw === 'string') return parseTokenProjectionRaw(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== 'string' || !INCLUDED_KINDS.has(r.type)) return null;
  const type = r.type as ImportantTransportKind;

  const date = typeof r.date === 'string' ? r.date.trim() : '';
  const departureTime = typeof r.departureTime === 'string' ? r.departureTime.trim() : '';
  if (!parseIsoDate(date) || !parseHourMinute(departureTime)) return null;

  if (typeof r.departureUtcMs !== 'number' || !Number.isFinite(r.departureUtcMs) || r.departureUtcMs <= 0) {
    return null;
  }

  const fromLabel = typeof r.fromLabel === 'string' ? sanitizePlaceLabel(r.fromLabel).slice(0, 100) : '';
  const toLabel = typeof r.toLabel === 'string' ? sanitizePlaceLabel(r.toLabel).slice(0, 100) : '';
  const timeZone = typeof r.timeZone === 'string' && isValidTimeZone(r.timeZone) ? r.timeZone.trim().slice(0, 64) : 'UTC';

  if (!fromLabel || !toLabel) return null;

  const serviceNumber = sanitizePublicFeedServiceNumber(type, r.serviceNumber);
  return {
    type,
    fromLabel,
    toLabel,
    date,
    departureTime,
    timeZone,
    departureUtcMs: Math.round(r.departureUtcMs),
    ...(serviceNumber ? { serviceNumber } : {}),
  };
}

export function toPublicUpcomingTransportsFeedProjection(
  items: PublicNextTransportInfo[] | PublicNextTransportInfo | null | undefined,
  maxItems: number = MAX_PUBLIC_UPCOMING_TRANSPORTS
): PublicNextTransportFeedProjection[] {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const out: PublicNextTransportFeedProjection[] = [];
  for (const item of list) {
    const projected = toPublicNextTransportFeedProjection(item);
    if (projected) out.push(projected);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function serializePublicNextTransportToken(
  proj: PublicNextTransportFeedProjection | null | undefined
): string | null {
  const clean = proj ? hydrateFeedProjectionRaw(proj) : null;
  if (!clean) return null;
  const cleanPart = (val: string) =>
    val
      .replace(/[\r\n|]+/g, ' ')
      .replace(/\b(?:pnr|booking|codice|ticket|eticket|passport|passaporto|secret)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  const fromClean = cleanPart(clean.fromLabel);
  const toClean = cleanPart(clean.toLabel);
  const svcClean = (clean.serviceNumber || '').replace(/[^A-Za-z0-9 .-]/g, '').slice(0, 32);
  if (!fromClean || !toClean) return null;
  return [
    clean.type,
    fromClean,
    toClean,
    clean.date,
    clean.departureTime,
    clean.timeZone,
    String(clean.departureUtcMs),
    svcClean,
  ].join('|');
}

export function toPublicUpcomingTransportTokens(
  items: PublicNextTransportInfo[] | PublicNextTransportInfo | null | undefined,
  maxItems: number = MAX_PUBLIC_UPCOMING_TRANSPORTS
): string[] {
  const projections = toPublicUpcomingTransportsFeedProjection(items, maxItems);
  const out: string[] = [];
  for (const proj of projections) {
    const token = serializePublicNextTransportToken(proj);
    if (token && token.length <= 360) out.push(token);
  }
  return out;
}

export function serializePublicUpcomingTransportsProjection(
  upcoming: Array<PublicNextTransportFeedProjection | string> | null | undefined,
  fallbackSingle?: PublicNextTransportFeedProjection | null | undefined
): string {
  const list = Array.isArray(upcoming)
    ? upcoming.map((x) => serializePublicNextTransportProjection(x))
    : [];
  return `${serializePublicNextTransportProjection(fallbackSingle)}|${JSON.stringify(list)}`;
}

/**
 * Ricostruisce e valida la mini-card pubblica ricevuta dal documento `/live_feeds/{tripId}` per gli ospiti esterni.
 * Nasconde automaticamente lo spostamento una volta superato l'istante di partenza.
 */
export function hydratePublicNextTransportFromFeed(
  raw: unknown,
  now: Date = new Date()
): PublicNextTransportInfo | null {
  const clean = hydrateFeedProjectionRaw(raw);
  if (!clean) return null;
  if (clean.departureUtcMs <= now.getTime()) return null;

  const meta = KIND_META[clean.type];
  const flightradarUrl = clean.type === 'volo' ? buildFlightradarUrl(clean.serviceNumber) : undefined;
  return {
    id: 'live-feed-next-transport',
    type: clean.type,
    typeLabel: meta.label,
    icon: meta.icon,
    fromLabel: clean.fromLabel,
    toLabel: clean.toLabel,
    routeLabel: `${clean.fromLabel} → ${clean.toLabel}`,
    date: clean.date,
    dateLabel: formatLocalDepartureDate(clean.date, clean.timeZone),
    departureTime: clean.departureTime,
    timeZone: clean.timeZone,
    ...(clean.serviceNumber ? { serviceNumber: clean.serviceNumber } : {}),
    ...(flightradarUrl ? { flightradarUrl } : {}),
    departureUtcMs: clean.departureUtcMs,
  };
}

/**
 * Seleziona lato ospite esterno il prossimo spostamento ancora futuro da `upcomingTransports`
 * (o dal fallback `nextTransport`), avanzando automaticamente alle tratte successive anche a PWA Owner chiusa.
 */
export function deriveNextPublicTransportFromFeedHeader(
  upcomingRaw: unknown,
  fallbackSingleRaw?: unknown,
  now: Date = new Date()
): PublicNextTransportInfo | null {
  const candidatesRaw = Array.isArray(upcomingRaw) && upcomingRaw.length > 0
    ? upcomingRaw
    : (fallbackSingleRaw ? [fallbackSingleRaw] : []);

  const hydrated: PublicNextTransportInfo[] = [];
  for (let i = 0; i < candidatesRaw.length; i += 1) {
    const item = hydratePublicNextTransportFromFeed(candidatesRaw[i], now);
    if (item) {
      hydrated.push({ ...item, id: `live-feed-next-${i}` });
    }
  }

  if (hydrated.length === 0) return null;

  hydrated.sort((a, b) => {
    if (a.departureUtcMs !== b.departureUtcMs) return a.departureUtcMs - b.departureUtcMs;
    return KIND_PRIORITY[a.type] - KIND_PRIORITY[b.type];
  });

  return hydrated[0];
}
