import type { Attivita, TipologiaPercorsoTrekking } from '../types';

export const TREKKING_ROUTE_LABELS: Record<TipologiaPercorsoTrekking, string> = {
  anello: 'Ad anello',
  andata_ritorno: 'Andata e ritorno',
  lineare: 'Lineare'
};

export function isTrekkingActivity(activity: Pick<Attivita, 'title' | 'sottocategoria'>): boolean {
  return activity.sottocategoria === 'Trekking' || /\btrekking\b/i.test(activity.title || '');
}

export function formatHikingDuration(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}
