import type { Tappa } from '../types';

export interface DayPlanRow { time: string; title: string; notes?: string }
export interface DayPlan { date: string; rows: DayPlanRow[] }
export const DAY_PLAN_PREFIX = 'HOUNIGO-DAY/1';
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function parseDayPlan(raw: string): DayPlan {
  if (raw.length > 16000) throw new Error('Proposta troppo lunga.');
  const lines = raw.trim().split(/\r?\n/).filter(line => line.trim());
  const header = lines.shift()?.match(/^HOUNIGO-DAY\/1\s+(\d{4}-\d{2}-\d{2})$/);
  if (!header) throw new Error('Formato richiesto: HOUNIGO-DAY/1 AAAA-MM-GG, poi orario | titolo | nota.');
  const date = header[1];
  const parsed = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Data non valida.');
  if (!lines.length || lines.length > 30) throw new Error('Inserisci da 1 a 30 tappe.');
  const seen = new Set<string>();
  const rows = lines.map(line => {
    const parts = line.split('|').map(v => v.trim());
    const [time, title, notes] = parts;
    if (parts.length < 2 || parts.length > 3 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !title || title.length > 120 || !norm(title) || (notes?.length || 0) > 500) throw new Error('Riga non valida: ' + line.slice(0,70));
    const key = norm(title);
    if (seen.has(key)) throw new Error('Titolo duplicato: ' + title);
    seen.add(key);
    return { time, title, ...(notes ? {notes} : {}) };
  });
  return { date, rows: rows.sort((a,b) => a.time.localeCompare(b.time)) };
}
export function isProtectedStop(t: Tappa): boolean {
  return Boolean(t.completed || t.bookingCode || t.qrCode || t.ticketUrl || t.linkedBookingId || t.linkedDocumentId || t.linkedDocumentIds?.length || t.publicDocumentIds?.length || t.attachments?.length || t.passeggiataId);
}
export function matchingStops(row: DayPlanRow, existing: Tappa[]): Tappa[] {
  return existing.filter(t => norm(t.titolo) === norm(row.title));
}
