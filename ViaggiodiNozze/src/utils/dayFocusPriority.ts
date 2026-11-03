import type { TimelineItem } from '../types';
import { timelineMinutes } from './timelineOrdering';

export type FocusPriorityTier = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Criterio deterministico di priorità per il focus della giornata (FASE 1):
 * 1. Trasporti con partenza vincolante (voli, treni, traghetti, transfer contrattuali) e appuntamenti imperdibili.
 * 2. Scadenze imminenti realmente critiche.
 * 3. Prenotazioni confermate con orario da rispettare.
 * 4. Attività programmate.
 * 5. Tappe flessibili.
 * 6. Suggerimenti, fotografie e contenuti facoltativi.
 */
export function getEventPriorityTier(item: TimelineItem): FocusPriorityTier {
  // Tier 1: Trasporti con partenza vincolante e appuntamenti imperdibili
  if (item.type === 'trasporto') {
    const tr = item.originalData as any;
    const cat = item.categoryOrType || tr?.type;
    const isBindingTransport = ['volo', 'treno', 'traghetto', 'transfer'].includes(cat);
    const hasFixedTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');

    if (isBindingTransport && hasFixedTime) {
      return 1;
    }
    // Ritiro o riconsegna con orario contrattuale
    if ((item.id.endsWith('_pickup') || item.id.endsWith('_dropoff')) && hasFixedTime) {
      return 1;
    }
  }

  // Tier 2: Scadenze imminenti critiche
  if ((item as any).type === 'scadenza' || (item.originalData as any)?.isCriticalDeadline) {
    return 2;
  }

  // Tier 3: Prenotazioni confermate con orario da rispettare
  const isBooked = (item as any).status === 'prenotato' || (item.originalData as any)?.status === 'prenotato';
  const hasStrictTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');
  if (isBooked && hasStrictTime) {
    return 3;
  }

  // Tier 4: Attività programmate (anche con orario indicativo o da definire)
  if (item.type === 'attivita' || item.type === 'ristorante') {
    return 4;
  }

  // Tier 5: Tappe flessibili
  if (item.type === 'tappa') {
    return 5;
  }

  // Tier 6: Suggerimenti, shopping, fotografie e contenuti facoltativi
  return 6;
}

export interface DayFocalResult {
  focalItem: TimelineItem | null;
  tier: FocusPriorityTier | null;
  isConcluded: boolean;
  allCompleted: boolean;
}

/**
 * Calcola determiniscamente l'evento focale del giorno.
 * Se è il giorno effettivo: considera l'orario corrente ed esclude gli eventi già conclusi.
 * Se è un giorno futuro: evidenzia l'evento più importante (Tier 1 > 2 > 3 > 4 > 5 > 6).
 */
export function computeDayFocalEvent(
  timeline: TimelineItem[],
  selectedDate: string,
  now: Date = new Date()
): DayFocalResult {
  if (!timeline || timeline.length === 0) {
    return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
  }

  // Escludi record meramente informativi di stato intermedio o alloggi (che hanno la sezione dedicata)
  const candidateItems = timeline.filter(item =>
    item.displayMode !== 'state' &&
    !item.informational &&
    item.type !== 'alloggio' &&
    !item.id.endsWith('_state')
  );

  if (candidateItems.length === 0) {
    return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isCurrentDay = selectedDate === todayStr;

  if (isCurrentDay) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Filtra eventi non ancora conclusi (con margine di 15m dopo la partenza)
    const activeCandidates = candidateItems.filter(item => {
      if (item.completed) return false;
      const tMin = timelineMinutes(item.time);
      if (tMin === null) return true;
      return tMin >= currentMinutes - 15;
    });

    if (activeCandidates.length === 0) {
      return { focalItem: null, tier: null, isConcluded: true, allCompleted: true };
    }

    // Ordina: prima per Tier di priorità, poi per orario più vicino
    const sorted = [...activeCandidates].sort((a, b) => {
      const tierA = getEventPriorityTier(a);
      const tierB = getEventPriorityTier(b);
      if (tierA !== tierB) return tierA - tierB;
      const minA = timelineMinutes(a.time) ?? 9999;
      const minB = timelineMinutes(b.time) ?? 9999;
      return minA - minB;
    });

    const chosen = sorted[0];
    return {
      focalItem: chosen,
      tier: chosen ? getEventPriorityTier(chosen) : null,
      isConcluded: false,
      allCompleted: false
    };
  } else {
    // Giorno futuro: evidenzia l'evento a massima priorità della giornata
    const sorted = [...candidateItems].sort((a, b) => {
      const tierA = getEventPriorityTier(a);
      const tierB = getEventPriorityTier(b);
      if (tierA !== tierB) return tierA - tierB;
      const minA = timelineMinutes(a.time) ?? 9999;
      const minB = timelineMinutes(b.time) ?? 9999;
      return minA - minB;
    });

    const chosen = sorted[0];
    return {
      focalItem: chosen,
      tier: chosen ? getEventPriorityTier(chosen) : null,
      isConcluded: false,
      allCompleted: false
    };
  }
}
