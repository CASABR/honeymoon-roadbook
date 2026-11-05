import type { Attivita, FasciaLuceFotografica, TipologiaPercorsoTrekking } from '../types';

export const TREKKING_ROUTE_LABELS: Record<TipologiaPercorsoTrekking, string> = {
  anello: 'Ad anello',
  andata_ritorno: 'Andata e ritorno',
  lineare: 'Lineare'
};

export const PHOTO_LIGHT_LABELS: Record<FasciaLuceFotografica, string> = {
  alba: 'Alba',
  golden_hour: 'Golden hour',
  tramonto: 'Tramonto',
  notte: 'Notte',
  qualsiasi: 'Qualsiasi luce'
};

export function isTrekkingActivity(activity: Pick<Attivita, 'title' | 'sottocategoria'>): boolean {
  return activity.sottocategoria === 'Trekking' || activity.sottocategoria === 'Escursione' || /\btrekking\b/i.test(activity.title || '');
}

export function isPhotoSpotActivity(activity: Pick<Attivita, 'sottocategoria'>): boolean {
  return (activity.sottocategoria as string) === 'Spot fotografico' || (activity.sottocategoria as string) === 'Sosta fotografica';
}

export function isPhotoSpotTappa(tappa: { sottocategoria?: string }): boolean {
  return tappa.sottocategoria === 'Spot fotografico' || tappa.sottocategoria === 'Sosta fotografica';
}

export function isPasseggiataActivity(activity: Pick<Attivita, 'title' | 'sottocategoria'>): boolean {
  return activity.sottocategoria === 'Passeggiata' || /\bpasseggiat[ae]\b/i.test(activity.title || '');
}

/**
 * Mappa la visualizzazione retrocompatibile: 'Escursione' viene mostrata come 'Trekking',
 * 'Sosta fotografica' unificata in 'Spot fotografico'.
 */
export function getDisplaySubcategory(sottocategoria?: string): string {
  if (!sottocategoria) return '';
  if (sottocategoria === 'Escursione') return 'Trekking';
  if (sottocategoria === 'Sosta fotografica') return 'Spot fotografico';
  if (sottocategoria === 'Sosta' || sottocategoria === 'Sosta generica') return 'Sosta tecnica';
  return sottocategoria;
}

export function formatHikingDuration(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}
