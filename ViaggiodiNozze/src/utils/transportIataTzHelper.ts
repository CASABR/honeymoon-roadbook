export interface AirportResolution {
  iata?: string;
  timeZone?: string;
}

interface AirportEntry {
  iata: string;
  timeZone: string;
  patterns: string[];
}

const UNAMBIGUOUS_AIRPORTS: AirportEntry[] = [
  { iata: 'FCO', timeZone: 'Europe/Rome', patterns: ['fiumicino', 'leonardo da vinci'] },
  { iata: 'CIA', timeZone: 'Europe/Rome', patterns: ['ciampino'] },
  { iata: 'MXP', timeZone: 'Europe/Rome', patterns: ['malpensa'] },
  { iata: 'LIN', timeZone: 'Europe/Rome', patterns: ['linate'] },
  { iata: 'BGY', timeZone: 'Europe/Rome', patterns: ['orio al serio', 'bergamo'] },
  { iata: 'VCE', timeZone: 'Europe/Rome', patterns: ['marco polo', 'venezia'] },
  { iata: 'BLQ', timeZone: 'Europe/Rome', patterns: ['guglielmo marconi', 'bologna'] },
  { iata: 'NAP', timeZone: 'Europe/Rome', patterns: ['capodichino', 'napoli'] },
  { iata: 'FLR', timeZone: 'Europe/Rome', patterns: ['peretola', 'firenze'] },
  { iata: 'PSA', timeZone: 'Europe/Rome', patterns: ['galileo galilei', 'pisa'] },
  { iata: 'PEK', timeZone: 'Asia/Shanghai', patterns: ['beijing capital', 'pechino capital', 'pechino'] },
  { iata: 'PKX', timeZone: 'Asia/Shanghai', patterns: ['daxing'] },
  { iata: 'PVG', timeZone: 'Asia/Shanghai', patterns: ['pudong'] },
  { iata: 'SHA', timeZone: 'Asia/Shanghai', patterns: ['hongqiao'] },
  { iata: 'CAN', timeZone: 'Asia/Shanghai', patterns: ['baiyun', 'guangzhou'] },
  { iata: 'HKG', timeZone: 'Asia/Hong_Kong', patterns: ['hong kong', 'chek lap kok'] },
  { iata: 'TPE', timeZone: 'Asia/Taipei', patterns: ['taoyuan', 'taipei'] },
  { iata: 'AKL', timeZone: 'Pacific/Auckland', patterns: ['auckland'] },
  { iata: 'WLG', timeZone: 'Pacific/Auckland', patterns: ['wellington'] },
  { iata: 'CHC', timeZone: 'Pacific/Auckland', patterns: ['christchurch'] },
  { iata: 'ZQN', timeZone: 'Pacific/Auckland', patterns: ['queenstown'] },
  { iata: 'SYD', timeZone: 'Australia/Sydney', patterns: ['sydney', 'kingsford smith'] },
  { iata: 'MEL', timeZone: 'Australia/Melbourne', patterns: ['tullamarine', 'melbourne'] },
  { iata: 'BNE', timeZone: 'Australia/Brisbane', patterns: ['brisbane'] },
  { iata: 'ADL', timeZone: 'Australia/Adelaide', patterns: ['adelaide'] },
  { iata: 'PER', timeZone: 'Australia/Perth', patterns: ['perth'] },
  { iata: 'CNS', timeZone: 'Australia/Brisbane', patterns: ['cairns'] },
  { iata: 'MNL', timeZone: 'Asia/Manila', patterns: ['ninoy aquino', 'manila'] },
  { iata: 'MPH', timeZone: 'Asia/Manila', patterns: ['caticlan', 'boracay', 'godofredo'] },
  { iata: 'CEB', timeZone: 'Asia/Manila', patterns: ['mactan', 'cebu'] },
  { iata: 'SIN', timeZone: 'Asia/Singapore', patterns: ['changi', 'singapore', 'singapore'] },
  { iata: 'DXB', timeZone: 'Asia/Dubai', patterns: ['dubai'] },
  { iata: 'DOH', timeZone: 'Asia/Qatar', patterns: ['hamad', 'doha'] },
  { iata: 'IST', timeZone: 'Europe/Istanbul', patterns: ['istanbul airport'] },
  { iata: 'LHR', timeZone: 'Europe/London', patterns: ['heathrow'] },
  { iata: 'LGW', timeZone: 'Europe/London', patterns: ['gatwick'] },
  { iata: 'CDG', timeZone: 'Europe/Paris', patterns: ['charles de gaulle', 'roissy'] },
  { iata: 'ORY', timeZone: 'Europe/Paris', patterns: ['orly'] },
  { iata: 'FRA', timeZone: 'Europe/Berlin', patterns: ['frankfurt', 'francoforte'] },
  { iata: 'MUC', timeZone: 'Europe/Berlin', patterns: ['munich', 'monaco'] },
  { iata: 'AMS', timeZone: 'Europe/Amsterdam', patterns: ['schiphol', 'amsterdam'] },
  { iata: 'MAD', timeZone: 'Europe/Madrid', patterns: ['barajas', 'madrid'] },
  { iata: 'BCN', timeZone: 'Europe/Madrid', patterns: ['el prat', 'barcellona', 'barcelona'] },
  { iata: 'HND', timeZone: 'Asia/Tokyo', patterns: ['haneda'] },
  { iata: 'NRT', timeZone: 'Asia/Tokyo', patterns: ['narita'] },
  { iata: 'KIX', timeZone: 'Asia/Tokyo', patterns: ['kansai'] },
  { iata: 'ICN', timeZone: 'Asia/Seoul', patterns: ['incheon'] },
  { iata: 'BKK', timeZone: 'Asia/Bangkok', patterns: ['suvarnabhumi', 'bangkok'] },
  { iata: 'DPS', timeZone: 'Asia/Makassar', patterns: ['ngurah rai', 'denpasar', 'bali'] },
  { iata: 'JFK', timeZone: 'America/New_York', patterns: ['kennedy', 'jfk'] },
  { iata: 'LAX', timeZone: 'America/Los_Angeles', patterns: ['los angeles'] },
];

const UNAMBIGUOUS_CITY_TIMEZONES: Array<{ patterns: string[]; timeZone: string }> = [
  { patterns: ['roma', 'milano', 'torino', 'firenze', 'napoli', 'bologna', 'venezia', 'italia'], timeZone: 'Europe/Rome' },
  { patterns: ['londra', 'london'], timeZone: 'Europe/London' },
  { patterns: ['parigi', 'paris'], timeZone: 'Europe/Paris' },
  { patterns: ['tokyo'], timeZone: 'Asia/Tokyo' },
  { patterns: ['beijing', 'pechino', 'shanghai'], timeZone: 'Asia/Shanghai' },
  { patterns: ['auckland', 'wellington', 'christchurch', 'queenstown', 'rotorua', 'taupo'], timeZone: 'Pacific/Auckland' },
  { patterns: ['sydney'], timeZone: 'Australia/Sydney' },
  { patterns: ['melbourne'], timeZone: 'Australia/Melbourne' },
  { patterns: ['adelaide'], timeZone: 'Australia/Adelaide' },
  { patterns: ['brisbane', 'cairns'], timeZone: 'Australia/Brisbane' },
  { patterns: ['perth'], timeZone: 'Australia/Perth' },
  { patterns: ['manila', 'boracay', 'cebu', 'el nido'], timeZone: 'Asia/Manila' },
];

export function resolveTimeZoneFromIata(iata?: string): string | undefined {
  const code = (iata || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return undefined;
  return UNAMBIGUOUS_AIRPORTS.find((a) => a.iata === code)?.timeZone;
}

export function resolveAirportIataAndTimeZone(location?: string): AirportResolution {
  const raw = (location || '').trim();
  if (!raw) return {};

  // 1. Esplicito tra parentesi es. "Roma Fiumicino (FCO)" o codice isolato "FCO"
  const parenMatch = raw.match(/\(([A-Z]{3})\)/i);
  if (parenMatch) {
    const iata = parenMatch[1].toUpperCase();
    return { iata, timeZone: resolveTimeZoneFromIata(iata) };
  }
  if (/^[A-Z]{3}$/.test(raw.toUpperCase())) {
    const iata = raw.toUpperCase();
    const tz = resolveTimeZoneFromIata(iata);
    if (tz) return { iata, timeZone: tz };
  }

  // 2. Match su aeroporti univoci
  const lower = raw.toLowerCase();
  const airportMatches = UNAMBIGUOUS_AIRPORTS.filter((entry) =>
    entry.patterns.some((p) => lower.includes(p))
  );
  if (airportMatches.length === 1) {
    return { iata: airportMatches[0].iata, timeZone: airportMatches[0].timeZone };
  }

  // 3. Fallback solo fuso orario per città univoche (senza inventare IATA)
  const tzMatch = UNAMBIGUOUS_CITY_TIMEZONES.find((c) =>
    c.patterns.some((p) => lower.includes(p))
  );
  if (tzMatch) {
    return { timeZone: tzMatch.timeZone };
  }

  return {};
}

export function formatAirportWithIata(location: string, iata?: string): string {
  const cleanLoc = (location || '').trim();
  const code = (iata || '').trim().toUpperCase();
  if (!code) return cleanLoc;
  if (!cleanLoc) return code;
  if (cleanLoc.toUpperCase().includes(code)) return cleanLoc;
  return `${code} · ${cleanLoc}`;
}

function getTzOffsetMs(dateUtcMs: number, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(dateUtcMs));
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const hour = map.hour === '24' ? '00' : map.hour;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(hour),
      Number(map.minute)
    );
    return asUtc - dateUtcMs;
  } catch {
    return 0;
  }
}

function zonedDateTimeToUtcMs(dateStr: string, timeStr: string, timeZone?: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{1,2}:\d{2}$/.test(timeStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  if (!timeZone) return naiveUtc;
  const offset = getTzOffsetMs(naiveUtc, timeZone);
  return naiveUtc - offset;
}

export function computeLayoverDuration(params: {
  arrivalDate?: string;
  arrivalTime?: string;
  departureDate?: string;
  departureTime?: string;
  timeZone?: string;
}): string | undefined {
  const arrDate = (params.arrivalDate || '').trim();
  const arrTime = (params.arrivalTime || '').trim();
  const depTime = (params.departureTime || '').trim();
  const depDate = (params.departureDate || arrDate).trim();
  if (!arrDate || !arrTime || !depTime || !depDate) return undefined;

  const arrMs = zonedDateTimeToUtcMs(arrDate, arrTime, params.timeZone);
  const depMs = zonedDateTimeToUtcMs(depDate, depTime, params.timeZone);
  if (arrMs === null || depMs === null) return undefined;

  let diffMin = Math.round((depMs - arrMs) / 60000);
  if (diffMin < 0 && !params.departureDate) {
    // Passaggio di mezzanotte se non è stata specificata la data di ripartenza
    diffMin += 24 * 60;
  }
  if (diffMin <= 0 || diffMin > 72 * 60) return undefined;

  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
