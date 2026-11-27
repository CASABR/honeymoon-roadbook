import type { TimelineItem } from '../types';
import { resolveReliableEntityTimeZone } from './pushReminders';
import {
  getLocalIsoDate,
  isValidIanaTimeZone,
  resolveUnambiguousPlaceTimeZone,
  zonedDateTimeToEpochMs,
} from './reliableTimeZone';
import { timelineMinutes } from './timelineOrdering';

export type FocusPriorityTier = 1 | 2 | 3 | 4 | 5 | 6;

export function getEventPriorityTier(item: TimelineItem): FocusPriorityTier {
  if (item.type === 'trasporto') {
    const tr = item.originalData as any;
    const cat = item.categoryOrType || tr?.type;
    const isBindingTransport = ['volo', 'treno', 'traghetto', 'transfer'].includes(cat);
    const hasFixedTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');

    if (isBindingTransport && hasFixedTime) {
      return 1;
    }
    if ((item.id.endsWith('_pickup') || item.id.endsWith('_dropoff')) && hasFixedTime) {
      return 1;
    }
  }

  if ((item as any).type === 'scadenza' || (item.originalData as any)?.isCriticalDeadline) {
    return 2;
  }

  const isBooked = (item as any).status === 'prenotato' || (item.originalData as any)?.status === 'prenotato';
  const hasStrictTime = Boolean(item.time && item.time !== '00:00' && item.timeStatus !== 'indicativo');
  if (isBooked && hasStrictTime) {
    return 3;
  }

  if (item.type === 'attivita' || item.type === 'ristorante') {
    return 4;
  }

  if (item.type === 'tappa') {
    return 5;
  }

  return 6;
}

export interface DayFocalResult {
  focalItem: TimelineItem | null;
  tier: FocusPriorityTier | null;
  isConcluded: boolean;
  allCompleted: boolean;
}

export function computeDayFocalEvent(
  timeline: TimelineItem[],
  selectedDate: string,
  now: Date = new Date()
): DayFocalResult {
  if (!timeline || timeline.length === 0) {
    return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
  }

  const candidateItems = timeline.filter(item =>
    item.displayMode !== 'state' &&
    !item.informational &&
    item.type !== 'alloggio' &&
    !item.id.endsWith('_state')
  );

  if (candidateItems.length === 0) {
    return { focalItem: null, tier: null, isConcluded: false, allCompleted: false };
  }

  const todayStr = getLocalIsoDate(now);
  const isCurrentDay = selectedDate === todayStr;

  if (isCurrentDay) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const activeCandidates = candidateItems.filter(item => {
      if (item.completed) return false;
      const tMin = timelineMinutes(item.time);
      if (tMin === null) return true;
      return tMin >= currentMinutes - 15;
    });

    if (activeCandidates.length === 0) {
      return { focalItem: null, tier: null, isConcluded: true, allCompleted: true };
    }

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
  }

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

/** Follow the local calendar only when the user was already viewing today. */
export function resolveFollowingTimelineDate(
  selectedDate: string,
  previousLocalDate: string,
  currentLocalDate: string,
  tripStartDate: string,
  tripEndDate: string,
  manuallySelected: boolean,
): string | null {
  if (manuallySelected || currentLocalDate === previousLocalDate) return null;
  if (currentLocalDate < tripStartDate || currentLocalDate > tripEndDate) return null;
  if (selectedDate === currentLocalDate) return null;
  if (selectedDate === previousLocalDate ||
      (previousLocalDate < tripStartDate && selectedDate === tripStartDate)) {
    return currentLocalDate;
  }
  return null;
}

export interface ActiveTimelineFocusOptions {
  now?: Date;
  tripStartDate: string;
  tripEndDate: string;
  dayLocation?: string;
  dayLocationsByDate?: Record<string, string>;
  activeTimeZone?: string | null;
}

export interface ActiveTimelineFocusResult {
  localTodayStr: string;
  isBeforeTrip: boolean;
  isDuringTrip: boolean;
  isPostTrip: boolean;
  defaultSelectedDate: string;
  isCurrentDay: boolean;
  activeItemId: string | null;
  scrollItemId: string | null;
  reason: 'before_trip' | 'post_trip' | 'other_day' | 'ongoing_or_imminent' | 'upcoming' | 'none';
}

function isConfirmedTimelineTime(item: TimelineItem): boolean {
  if (item.timeIsDefault) return false;
  const rawStatus = String((item.originalData as Record<string, unknown> | undefined)?.timeStatus || item.timeStatus || '');
  if (rawStatus === 'indicativo' || rawStatus === 'non_specificato') return false;
  if (rawStatus === 'confermato') return true;
  if (item.type === 'trasporto') {
    const trStatus = String((item.originalData as Record<string, unknown> | undefined)?.status || '');
    return trStatus !== 'pianificato' && trStatus !== 'da_prenotare' && trStatus !== 'annullato';
  }
  return false;
}

function parseItemDurationMinutes(item: TimelineItem): number {
  const raw = (item.originalData || {}) as Record<string, unknown>;
  const hikingMin = Number(raw.hikingDurationMinutes);
  if (Number.isFinite(hikingMin) && hikingMin >= 15) {
    return Math.min(720, Math.round(hikingMin));
  }
  const durStr = typeof raw.duration === 'string' ? raw.duration.trim().toLowerCase() : '';
  if (durStr) {
    const hoursMatch = /(\d+)\s*h/.exec(durStr);
    const minsMatch = /(\d+)\s*m/.exec(durStr);
    const total = (hoursMatch ? Number(hoursMatch[1]) * 60 : 0) + (minsMatch ? Number(minsMatch[1]) : 0);
    if (total >= 15) return Math.min(720, total);
  }
  return item.type === 'attivita' || item.type === 'ristorante' ? 60 : 45;
}

function itemEventStartMs(
  item: TimelineItem,
  selectedDate: string,
  options: ActiveTimelineFocusOptions,
): number | null {
  if (item.timeIsDefault) return null;
  const minutes = timelineMinutes(item.time);
  if (minutes === null) return null;

  const raw = ((item.originalData && typeof item.originalData === 'object')
    ? item.originalData
    : item) as Record<string, unknown>;
  const dayLocationsByDate = options.dayLocationsByDate || (options.dayLocation ? { [selectedDate]: options.dayLocation } : undefined);

  const itemZone =
    resolveReliableEntityTimeZone(item.type, raw, {
      isDropoff: item.id.endsWith('_dropoff'),
      dateHint: selectedDate,
      context: dayLocationsByDate ? { dayLocationsByDate } : undefined,
    })
    || (options.dayLocation ? resolveUnambiguousPlaceTimeZone(options.dayLocation) : null)
    || (options.activeTimeZone && isValidIanaTimeZone(options.activeTimeZone) ? options.activeTimeZone.trim() : null);

  if (itemZone) {
    const zonedMs = zonedDateTimeToEpochMs(selectedDate, item.time, itemZone);
    if (zonedMs !== null) return zonedMs;
  }

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate);
  if (!parts) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), hour, minute, 0, 0).getTime();
}

export function resolveTripActiveCard(
  timeline: TimelineItem[],
  selectedDate: string,
  options: ActiveTimelineFocusOptions,
): ActiveTimelineFocusResult {
  const now = options.now ?? new Date();
  const resolvedLocalTz = options.activeTimeZone && isValidIanaTimeZone(options.activeTimeZone)
    ? options.activeTimeZone.trim()
    : undefined;
  const localTodayStr = getLocalIsoDate(now, resolvedLocalTz);
  const tripStart = options.tripStartDate || localTodayStr;
  const tripEnd = options.tripEndDate || tripStart;

  const isBeforeTrip = localTodayStr < tripStart;
  const isPostTrip = localTodayStr > tripEnd;
  const isDuringTrip = !isBeforeTrip && !isPostTrip;
  const defaultSelectedDate = isDuringTrip ? localTodayStr : tripStart;

  if (isBeforeTrip) {
    return {
      localTodayStr,
      isBeforeTrip: true,
      isDuringTrip: false,
      isPostTrip: false,
      defaultSelectedDate,
      isCurrentDay: false,
      activeItemId: null,
      scrollItemId: null,
      reason: 'before_trip',
    };
  }

  if (isPostTrip) {
    return {
      localTodayStr,
      isBeforeTrip: false,
      isDuringTrip: false,
      isPostTrip: true,
      defaultSelectedDate,
      isCurrentDay: false,
      activeItemId: null,
      scrollItemId: null,
      reason: 'post_trip',
    };
  }

  if (selectedDate !== localTodayStr) {
    return {
      localTodayStr,
      isBeforeTrip: false,
      isDuringTrip: true,
      isPostTrip: false,
      defaultSelectedDate,
      isCurrentDay: false,
      activeItemId: null,
      scrollItemId: null,
      reason: 'other_day',
    };
  }

  const nowMs = now.getTime();
  const actionable = (timeline || [])
    .filter(item =>
      item.displayMode !== 'state' &&
      !item.informational &&
      item.type !== 'alloggio' &&
      !item.id.endsWith('_state') &&
      !item.id.endsWith('_arrival') &&
      !item.completed
    )
    .map(item => {
      const startMs = itemEventStartMs(item, selectedDate, options);
      if (startMs === null) return null;
      const durationMin = parseItemDurationMinutes(item);
      return {
        item,
        startMs,
        endMs: startMs + durationMin * 60_000,
        confirmed: isConfirmedTimelineTime(item),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (actionable.length === 0) {
    return {
      localTodayStr,
      isBeforeTrip: false,
      isDuringTrip: true,
      isPostTrip: false,
      defaultSelectedDate,
      isCurrentDay: true,
      activeItemId: null,
      scrollItemId: null,
      reason: 'none',
    };
  }

  const activeNow = actionable
    .filter(entry => entry.startMs - 15 * 60_000 <= nowMs && nowMs <= entry.endMs)
    .sort((a, b) => {
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      const aStarted = a.startMs <= nowMs;
      const bStarted = b.startMs <= nowMs;
      if (aStarted !== bStarted) return aStarted ? -1 : 1;
      return Math.abs(nowMs - a.startMs) - Math.abs(nowMs - b.startMs);
    });

  if (activeNow.length > 0) {
    const id = activeNow[0].item.id;
    return {
      localTodayStr,
      isBeforeTrip: false,
      isDuringTrip: true,
      isPostTrip: false,
      defaultSelectedDate,
      isCurrentDay: true,
      activeItemId: id,
      scrollItemId: id,
      reason: 'ongoing_or_imminent',
    };
  }

  const upcoming = actionable
    .filter(entry => nowMs < entry.startMs - 15 * 60_000)
    .sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.confirmed === b.confirmed ? 0 : (a.confirmed ? -1 : 1);
    });

  if (upcoming.length > 0) {
    const earliest = upcoming[0];
    const nearbyConfirmed = !earliest.confirmed
      ? upcoming.find(entry => entry.confirmed && entry.startMs - earliest.startMs <= 25 * 60_000)
      : undefined;
    const chosen = nearbyConfirmed || earliest;
    return {
      localTodayStr,
      isBeforeTrip: false,
      isDuringTrip: true,
      isPostTrip: false,
      defaultSelectedDate,
      isCurrentDay: true,
      activeItemId: chosen.item.id,
      scrollItemId: chosen.item.id,
      reason: 'upcoming',
    };
  }

  return {
    localTodayStr,
    isBeforeTrip: false,
    isDuringTrip: true,
    isPostTrip: false,
    defaultSelectedDate,
    isCurrentDay: true,
    activeItemId: null,
    scrollItemId: null,
    reason: 'none',
  };
}
