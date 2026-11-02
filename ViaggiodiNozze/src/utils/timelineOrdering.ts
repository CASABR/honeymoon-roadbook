import type { TimelineItem } from '../types';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timelineMinutes(value?: string): number | null {
  if (!value) return null;
  const match = value.match(TIME_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function fallbackOrder(item: TimelineItem): number {
  const explicitOrder = Number(item.sortOrder ?? item.originalData?.order);
  if (Number.isFinite(explicitOrder)) return explicitOrder;
  return Number.MAX_SAFE_INTEGER;
}

export function compareTimelineItems(a: TimelineItem, b: TimelineItem): number {
  const dateA = a.effectiveDate || '';
  const dateB = b.effectiveDate || '';
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const minutesA = timelineMinutes(a.sortTime || a.time);
  const minutesB = timelineMinutes(b.sortTime || b.time);
  if (minutesA !== null && minutesB !== null && minutesA !== minutesB) return minutesA - minutesB;
  if (minutesA !== null) return -1;
  if (minutesB !== null) return 1;

  const orderDelta = fallbackOrder(a) - fallbackOrder(b);
  if (orderDelta !== 0) return orderDelta;
  return a.id.localeCompare(b.id);
}

export function isPhysicalTimelineItem(item: Pick<TimelineItem, 'displayMode' | 'informational' | 'physicalLocation'>): boolean {
  return item.displayMode !== 'state' && !item.informational && item.physicalLocation !== false;
}
