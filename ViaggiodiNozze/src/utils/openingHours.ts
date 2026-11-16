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

const PURE_INTERVAL_RE = /^([0-2]\d:[0-5]\d)?\s*[-–]\s*([0-2]\d:[0-5]\d)?$/;

export function getOpeningHoursText(info?: OpeningHoursInfo, date?: string): string {
  if (!info) return '';
  if (date && Object.prototype.hasOwnProperty.call(info.exceptions || {}, date)) {
    return info.exceptions?.[date]?.trim() || '';
  }
  const day = getOpeningHoursDay(date);
  if (day && info.weekly?.[day]?.trim()) return info.weekly[day]!.trim();
  return info.notes && PURE_INTERVAL_RE.test(info.notes.trim()) ? info.notes.trim() : '';
}

export function extractOpeningClosingTimes(info?: OpeningHoursInfo, date?: string): { openTime: string; closeTime: string } {
  if (!info) return { openTime: '', closeTime: '' };
  const raw = (
    getOpeningHoursText(info, date) ||
    info.notes ||
    Object.values(info.exceptions || {}).find((v) => v?.trim()) ||
    Object.values(info.weekly || {}).find((v) => v?.trim()) ||
    ''
  ).trim();
  const full = raw.match(/([0-2]\d:[0-5]\d)\s*[-–]\s*([0-2]\d:[0-5]\d)/);
  if (full) return { openTime: full[1], closeTime: full[2] };
  const openOnly = raw.match(/^([0-2]\d:[0-5]\d)\s*[-–]?$/);
  if (openOnly) return { openTime: openOnly[1], closeTime: '' };
  const closeOnly = raw.match(/^[-–]\s*([0-2]\d:[0-5]\d)$/);
  return closeOnly ? { openTime: '', closeTime: closeOnly[1] } : { openTime: '', closeTime: '' };
}

export function buildOpeningHoursFromTimes(
  openTime: string,
  closeTime: string,
  existing?: OpeningHoursInfo,
  date?: string,
  defaultStatus: OpeningHoursInfo['status'] = 'manual'
): OpeningHoursInfo {
  const open = (openTime || '').trim();
  const close = (closeTime || '').trim();
  const day = getOpeningHoursDay(date);
  const isPureNote = !existing?.notes || PURE_INTERVAL_RE.test(existing.notes.trim());

  if (!open && !close) {
    if (!existing) return { status: 'unverified', accessType: 'unknown' };
    const nextWeekly = { ...(existing.weekly || {}) };
    if (day) delete nextWeekly[day];
    for (const k of DAY_KEYS) if (nextWeekly[k] && PURE_INTERVAL_RE.test(nextWeekly[k]!.trim())) delete nextWeekly[k];
    const nextExceptions = { ...(existing.exceptions || {}) };
    if (date && nextExceptions[date] && PURE_INTERVAL_RE.test(nextExceptions[date].trim())) delete nextExceptions[date];
    const nextNotes = isPureNote ? undefined : existing.notes;
    const hasData = Object.keys(nextWeekly).length > 0 || Object.keys(nextExceptions).length > 0 || Boolean(existing.source?.trim()) || Boolean(nextNotes?.trim());
    const cleaned: OpeningHoursInfo = { status: hasData ? existing.status : 'unverified', accessType: existing.accessType || 'unknown' };
    if (Object.keys(nextWeekly).length > 0) cleaned.weekly = nextWeekly;
    if (Object.keys(nextExceptions).length > 0) cleaned.exceptions = nextExceptions;
    if (existing.source) cleaned.source = existing.source;
    if (hasData && existing.verifiedAt) cleaned.verifiedAt = existing.verifiedAt;
    if (existing.timeZone) cleaned.timeZone = existing.timeZone;
    if (nextNotes) cleaned.notes = nextNotes;
    return cleaned;
  }

  const interval = open && close ? `${open}-${close}` : open ? `${open}-` : `-${close}`;
  const prevInterval = existing && isPureNote && existing.notes ? existing.notes.trim() : '';
  const nextWeekly: Partial<Record<OpeningHoursDay, string>> = { ...(existing?.weekly || {}) };
  if (day) nextWeekly[day] = interval;
  if (Object.keys(nextWeekly).length === 0) {
    for (const k of DAY_KEYS) nextWeekly[k] = interval;
  } else if (prevInterval) {
    for (const k of DAY_KEYS) if (nextWeekly[k] === prevInterval) nextWeekly[k] = interval;
  }
  const nextExceptions = existing?.exceptions ? { ...existing.exceptions } : undefined;
  if (date && nextExceptions && Object.prototype.hasOwnProperty.call(nextExceptions, date)) nextExceptions[date] = interval;

  const result: OpeningHoursInfo = {
    status: existing?.status && existing.status !== 'unverified' ? existing.status : defaultStatus,
    accessType: existing?.accessType && existing.accessType !== 'unknown' ? existing.accessType : 'attraction',
    weekly: nextWeekly,
    verifiedAt: existing?.verifiedAt || (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)),
    notes: isPureNote ? interval : existing?.notes
  };
  if (nextExceptions && Object.keys(nextExceptions).length > 0) result.exceptions = nextExceptions;
  if (existing?.source) result.source = existing.source;
  if (existing?.timeZone) result.timeZone = existing.timeZone;
  return result;
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
  if (intervals.length > 0) {
    const parsedIntervals = intervals
      .map((match) => [toMinutes(match[1]), toMinutes(match[2])] as const)
      .filter((interval): interval is readonly [number, number] => interval[0] != null && interval[1] != null);
    return parsedIntervals.some(([start, end]) => isInsideInterval(target, start, end)) ? 'compatible' : 'closed';
  }
  const openOnly = schedule.trim().match(/^([0-2]\d:[0-5]\d)\s*[-–]$/);
  if (openOnly) {
    const start = toMinutes(openOnly[1]);
    return start != null ? (target >= start ? 'compatible' : 'closed') : 'invalid';
  }
  const closeOnly = schedule.trim().match(/^[-–]\s*([0-2]\d:[0-5]\d)$/);
  if (closeOnly) {
    const end = toMinutes(closeOnly[1]);
    return end != null ? (target < end ? 'compatible' : 'closed') : 'invalid';
  }
  return 'invalid';
}

export function openingHoursMessage(info?: OpeningHoursInfo, date?: string, time?: string): { tone: 'neutral' | 'warning' | 'success'; text: string } {
  const assessment = assessOpeningHours(info, date, time);
  if (assessment === 'closed') return { tone: 'warning', text: 'L’orario programmato potrebbe essere fuori dall’apertura indicata.' };
  if (assessment === 'compatible') return { tone: 'success', text: 'Orario compatibile con gli orari verificati.' };
  if (assessment === 'outdoor') return { tone: 'neutral', text: 'Luogo all’aperto: accessibilità e restrizioni restano da verificare.' };
  if (assessment === 'invalid') return { tone: 'warning', text: 'Formato orari non riconosciuto: verifica manualmente.' };
  return { tone: 'neutral', text: 'Orari non verificati.' };
}
