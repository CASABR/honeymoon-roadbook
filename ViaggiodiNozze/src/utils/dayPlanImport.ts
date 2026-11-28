import type { Tappa } from '../types';

export type DayPlanCategory = 'tappa' | 'ristorante' | 'metro';
export interface DayPlanRow { time: string; title: string; notes?: string; category?: DayPlanCategory; from?: string; to?: string; endTime?: string; meal?: 'Colazione' | 'Pranzo' | 'Cena' | 'Aperitivo' | 'Altro' }
export interface DayPlan { date: string; rows: DayPlanRow[] }
export const DAY_PLAN_PREFIX = 'HOUNIGO-DAY/1';
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function parseDayPlan(raw: string): DayPlan {
  if (raw.length > 16000) throw new Error('Proposta troppo lunga.');
  const lines = raw.trim().split(/\r?\n/).filter(line => line.trim());
  const header = lines.shift()?.match(/^HOUNIGO-DAY\/(1|2)\s+(\d{4}-\d{2}-\d{2})$/);
  if (!header) throw new Error('Formato richiesto: HOUNIGO-DAY/1 oppure /2, seguito dalla data.');
  const version = header[1];
  const date = header[2];
  const parsed = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Data non valida.');
  if (!lines.length || lines.length > 30) throw new Error('Inserisci da 1 a 30 tappe.');
  const seen = new Set<string>();
  const rows = lines.map(line => {
    const parts = line.split('|').map(v => v.trim());
    const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const time = parts[0];
    let row: DayPlanRow;
    if (version === '1') {
      const [, title, notes] = parts;
      if (parts.length < 2 || parts.length > 3) throw new Error('Riga non valida: ' + line.slice(0,70));
      const meal = /^(cena|pranzo|colazione|aperitivo)\s+/i.exec(title)?.[1];
      row = { time, title, ...(notes ? {notes} : {}), ...(meal ? {category:'ristorante' as const, meal: (meal[0].toUpperCase()+meal.slice(1).toLowerCase()) as DayPlanRow['meal']} : {}) };
    } else {
      const [, category, title, value, endOrNote, notes] = parts;
      if (category === 'tappa' && parts.length >= 3 && parts.length <= 4) {
        row = { time, title, category, ...(value ? {notes:value} : {}) };
      } else if (category === 'ristorante' && parts.length >= 4 && parts.length <= 5 && ['Colazione','Pranzo','Cena','Aperitivo','Altro'].includes(value)) {
        row = { time, title, category, meal:value as DayPlanRow['meal'], ...(endOrNote ? {notes:endOrNote} : {}) };
      } else if (category === 'metro' && parts.length >= 5 && parts.length <= 6) {
        const [from,to,...rest] = title.split(' → ').map(v => v.trim());
        if (!from || !to || rest.length || !validTime(value) || value < time || (endOrNote && endOrNote.length > 500) || notes) throw new Error('Metro: specifica partenza → arrivo e orario di arrivo.');
        row = { time, title, category, from, to, endTime:value, ...(endOrNote ? {notes:endOrNote} : {}) };
      } else throw new Error('Categoria o formato non valido: ' + line.slice(0,70));
    }
    if (!validTime(row.time) || !row.title || row.title.length > 120 || !norm(row.title) || (row.notes?.length || 0) > 500) throw new Error('Riga non valida: ' + line.slice(0,70));
    const key = norm(row.title);
    if (seen.has(key)) throw new Error('Titolo duplicato: ' + row.title);
    seen.add(key);
    return row;
  });
  return { date, rows: rows.sort((a,b) => a.time.localeCompare(b.time)) };
}
export function isProtectedStop(t: Tappa): boolean {
  return Boolean(t.completed || t.bookingCode || t.qrCode || t.ticketUrl || t.linkedBookingId || t.linkedDocumentId || t.linkedDocumentIds?.length || t.publicDocumentIds?.length || t.attachments?.length || t.passeggiataId);
}
export function matchingStops(row: DayPlanRow, existing: Tappa[]): Tappa[] {
  return existing.filter(t => norm(t.titolo) === norm(row.title));
}

export function dayPlanCategory(row: DayPlanRow): DayPlanCategory { return row.category || 'tappa'; }
export function dayPlanRestaurantName(row: DayPlanRow): string { return row.title.replace(/^(cena|pranzo|colazione|aperitivo)\s+/i,'').trim(); }
export function dayPlanTitleMatches(a: string, b: string): boolean {
  return norm(a.replace(/^(cena|pranzo|colazione|aperitivo)\s+/i,'')) === norm(b.replace(/^(cena|pranzo|colazione|aperitivo)\s+/i,''));
}
