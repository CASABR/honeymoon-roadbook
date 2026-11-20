import { lookupKnownCoordinate } from './geoCoordinatesHelper';

const IATA_TIMEZONE_MAP: Record<string, string> = {
  MXP: 'Europe/Rome',
  FCO: 'Europe/Rome',
  LIN: 'Europe/Rome',
  BGY: 'Europe/Rome',
  VCE: 'Europe/Rome',
  NAP: 'Europe/Rome',
  PEK: 'Asia/Shanghai',
  PKX: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai',
  SHA: 'Asia/Shanghai',
  AKL: 'Pacific/Auckland',
  WLG: 'Pacific/Auckland',
  CHC: 'Pacific/Auckland',
  ZQN: 'Pacific/Auckland',
  ROT: 'Pacific/Auckland',
  ADL: 'Australia/Adelaide',
  MEL: 'Australia/Melbourne',
  AVV: 'Australia/Melbourne',
  SYD: 'Australia/Sydney',
  BNE: 'Australia/Brisbane',
  CNS: 'Australia/Brisbane',
  PER: 'Australia/Perth',
  MNL: 'Asia/Manila',
  MPH: 'Asia/Manila',
  ENI: 'Asia/Manila',
  USU: 'Asia/Manila',
  CEB: 'Asia/Manila',
  TAG: 'Asia/Manila',
  IAO: 'Asia/Manila',
  RAR: 'Pacific/Rarotonga',
  TPE: 'Asia/Taipei',
  TSA: 'Asia/Taipei',
  HKG: 'Asia/Hong_Kong',
  SIN: 'Asia/Singapore',
  DOH: 'Asia/Qatar',
  DXB: 'Asia/Dubai',
};

const PLACE_TIMEZONE_HINTS: Array<[RegExp, string]> = [
  [/\b(italia|italy|roma|milano|torino|firenze|venezia|bologna|napoli|malpensa|fiumicino|duomo|navigli|sempione|bicocca|suzzani|starita)\b/i, 'Europe/Rome'],
  [/\b(pechino|beijing|shanghai|mutianyu|tien'?anmen|tiananmen|qianmen|dengshikou)\b/i, 'Asia/Shanghai'],
  [/\b(nuova\s*zelanda|new\s*zealand|auckland|wellington|picton|christchurch|queenstown|rotorua|matamata|hobbiton|waitomo|te\s*anau|milford\s*sound|tekapo|mt\.?\s*cook|mount\s*cook|wanaka|kaikoura|punakaiki|franz\s*josef|fox\s*glacier|abel\s*tasman|kaiteriteri|tongariro|taupo|dunedin|akaroa|waiotapu|te\s*pa\s*tu|paihia)\b/i, 'Pacific/Auckland'],
  [/\b(adelaide|kangaroo\s*island|penneshaw|kingscote|cape\s*jervis|barossa|flinders\s*chase|remarkable\s*rocks|vivonne\s*bay)\b/i, 'Australia/Adelaide'],
  [/\b(melbourne|tullamarine|st\.?\s*kilda|great\s*ocean\s*road|twelve\s*apostles|apollo\s*bay|lorne|torquay|yarra|philip\s*island|phillip\s*island)\b/i, 'Australia/Melbourne'],
  [/\b(sydney|kingsford\s*smith|circular\s*quay|manly|blue\s*mountains|katoomba|bondi|hyams\s*beach|jervis\s*bay|wilsons\s*promontory)\b/i, 'Australia/Sydney'],
  [/\b(brisbane|cairns|gold\s*coast|queensland)\b/i, 'Australia/Brisbane'],
  [/\b(perth|fremantle)\b/i, 'Australia/Perth'],
  [/\b(filippine|philippines|manila|ninoy\s*aquino|caticlan|boracay|el\s*nido|coron|busuanga|cebu|mactan|bohol|panglao|siargao)\b/i, 'Asia/Manila'],
  [/\b(rarotonga|aitutaki|cook\s*islands|isole\s*cook)\b/i, 'Pacific/Rarotonga'],
  [/\b(taipei|taoyuan)\b/i, 'Asia/Taipei'],
];

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (clean.length < 3 || clean.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ricava il fuso IANA solo per poligoni geografici deterministici (nessuna deduzione arbitraria).
 */
export function getStrictTimeZoneFromCoordinates(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat > -48 && lat < -33 && lng > 165 && lng < 179.5) return 'Pacific/Auckland';
  if (lat > 4 && lat < 21.5 && lng > 116 && lng < 127.5) return 'Asia/Manila';
  if (lat > -45 && lat < -10 && lng > 112 && lng < 155) {
    if (lng < 129) return 'Australia/Perth';
    if (lng < 141 && lat <= -26) return 'Australia/Adelaide';
    if (lat >= -28.2 && lng >= 138) return 'Australia/Brisbane';
    if (lat < -34 && lng < 150) return 'Australia/Melbourne';
    return 'Australia/Sydney';
  }
  if (lat > 18 && lat < 54 && lng > 73 && lng < 135) return 'Asia/Shanghai';
  if (lat > 35 && lat < 48 && lng > 6 && lng < 19) return 'Europe/Rome';
  return null;
}

/**
 * Restituisce il fuso IANA solo se tutti gli indizi nel testo puntano a un solo fuso coerente.
 */
export function resolveUnambiguousPlaceTimeZone(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const clean = text.trim();
  if (!clean) return null;

  const matched = new Set<string>();

  const parenthesizedIatas = [...clean.matchAll(/\(([A-Z]{3})\)/g)].map(m => m[1]);
  const bareIatas = (clean.match(/\b[A-Z]{3}\b/g) || []).filter(code => code !== 'PER');
  for (const code of [...parenthesizedIatas, ...bareIatas]) {
    if (IATA_TIMEZONE_MAP[code]) matched.add(IATA_TIMEZONE_MAP[code]);
  }

  for (const [pattern, tz] of PLACE_TIMEZONE_HINTS) {
    if (pattern.test(clean)) matched.add(tz);
  }

  if (matched.size === 1) {
    return matched.values().next().value || null;
  }
  if (matched.size > 1) {
    return null;
  }

  const known = lookupKnownCoordinate(clean);
  return known ? getStrictTimeZoneFromCoordinates(known.lat, known.lng) : null;
}

export function resolveTimeZoneFromTextList(texts: Array<unknown>): string | null {
  for (const candidate of texts) {
    const resolved = resolveUnambiguousPlaceTimeZone(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function resolveReliableIataTimeZone(iata: unknown): string | null {
  if (typeof iata !== 'string') return null;
  const clean = iata.trim().toUpperCase();
  return clean && IATA_TIMEZONE_MAP[clean] ? IATA_TIMEZONE_MAP[clean] : null;
}

export function getZonedWallClockParts(
  timestampMs: number,
  timeZone: string,
): { dateStr: string; year: number; month: number; day: number; hour: number; minute: number; minutesOfDay: number } | null {
  if (!Number.isFinite(timestampMs) || !isValidIanaTimeZone(timeZone)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone.trim(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  const year = Number(read('year'));
  const month = Number(read('month'));
  const day = Number(read('day'));
  const hour = Number(read('hour')) % 24;
  const minute = Number(read('minute'));
  if (!year || !month || !day) return null;
  const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { dateStr, year, month, day, hour, minute, minutesOfDay: hour * 60 + minute };
}

export function getLocalIsoDate(now: Date = new Date(), timeZone?: string | null): string {
  if (timeZone && isValidIanaTimeZone(timeZone)) {
    const zoned = getZonedWallClockParts(now.getTime(), timeZone);
    if (zoned) return zoned.dateStr;
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDateParts(date: unknown): [number, number, number] | null {
  if (typeof date !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [year, month, day];
}

export function parseHourMinuteParts(time: unknown): [number, number] | null {
  if (typeof time !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return [hour, minute];
}

export function zonedDateTimeToEpochMs(date: unknown, time: unknown, timeZone: unknown): number | null {
  const d = parseIsoDateParts(date);
  const t = parseHourMinuteParts(time);
  if (!d || !t || !isValidIanaTimeZone(timeZone)) return null;
  const cleanTz = timeZone.trim();
  const desiredAsUtc = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedWallClockParts(candidate, cleanTz);
    if (!actual) return null;
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const delta = desiredAsUtc - actualAsUtc;
    if (delta === 0) break;
    candidate += delta;
  }
  const verified = getZonedWallClockParts(candidate, cleanTz);
  if (
    !verified ||
    verified.year !== d[0] ||
    verified.month !== d[1] ||
    verified.day !== d[2] ||
    verified.hour !== t[0] ||
    verified.minute !== t[1]
  ) {
    return null;
  }
  return candidate;
}
