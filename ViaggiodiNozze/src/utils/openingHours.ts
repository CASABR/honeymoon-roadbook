import type { OpeningHoursDay, OpeningHoursInfo } from '../types';

const DAY_KEYS: OpeningHoursDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const OPENING_HOURS_DAY_LABELS: Record<OpeningHoursDay, string> = {
  sun: 'Domenica',
  mon: 'Lunedì',
  tue: 'Martedì',
  wed: 'Mercoledì',
  thu: 'Giovedì',
  fri: 'Venerdì',
  sat: 'Sabato'
};

export type OpeningHoursAssessment = 'unverified' | 'outdoor' | 'unknown' | 'compatible' | 'closed' | 'invalid';

export function getOpeningHoursDay(date?: string): OpeningHoursDay | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : DAY_KEYS[parsed.getUTCDay()];
}

export function getOpeningHoursText(info?: OpeningHoursInfo, date?: string): string {
  if (!info || !date) return '';
  if (Object.prototype.hasOwnProperty.call(info.exceptions || {}, date)) {
    return info.exceptions?.[date]?.trim() || '';
  }
  const day = getOpeningHoursDay(date);
  return day ? info.weekly?.[day]?.trim() || '' : '';
}

function toMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isInsideInterval(value: number, start: number, end: number): boolean {
  if (start === end) return true;
  return end > start ? value >= start && value < end : value >= start || value < end;
}

export function assessOpeningHours(info?: OpeningHoursInfo, date?: string, time?: string): OpeningHoursAssessment {
  if (!info || info.status === 'unverified' || !info.verifiedAt) return 'unverified';
  if (info.accessType === 'outdoor') return 'outdoor';
  const schedule = getOpeningHoursText(info, date);
  if (!schedule || !time) return 'unknown';
  if (/^(chiuso|closed)$/i.test(schedule.trim())) return 'closed';
  const target = toMinutes(time);
  if (target == null) return 'invalid';
  const intervals = Array.from(schedule.matchAll(/([0-2]\d:[0-5]\d)\s*[-–]\s*([0-2]\d:[0-5]\d)/g));
  if (intervals.length === 0) return 'invalid';
  const parsedIntervals = intervals
    .map((match) => [toMinutes(match[1]), toMinutes(match[2])] as const)
    .filter((interval): interval is readonly [number, number] => interval[0] != null && interval[1] != null);
  return parsedIntervals.some(([start, end]) => isInsideInterval(target, start, end)) ? 'compatible' : 'closed';
}

export function openingHoursMessage(info?: OpeningHoursInfo, date?: string, time?: string): { tone: 'neutral' | 'warning' | 'success'; text: string } {
  const assessment = assessOpeningHours(info, date, time);
  if (assessment === 'closed') return { tone: 'warning', text: 'L’orario programmato potrebbe essere fuori dall’apertura indicata.' };
  if (assessment === 'compatible') return { tone: 'success', text: 'Orario compatibile con gli orari verificati.' };
  if (assessment === 'outdoor') return { tone: 'neutral', text: 'Luogo all’aperto: accessibilità e restrizioni restano da verificare.' };
  if (assessment === 'invalid') return { tone: 'warning', text: 'Formato orari non riconosciuto: verifica manualmente.' };
  return { tone: 'neutral', text: 'Orari non verificati.' };
}
