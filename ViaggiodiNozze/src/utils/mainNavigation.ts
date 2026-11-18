import type { SectionTab } from '../types';

export const MAIN_SECTION_ORDER: readonly SectionTab[] = ['oggi', 'categorie', 'mappa', 'altro'];

const SWIPE_BLOCKING_SELECTOR = [
  'input',
  'textarea',
  'select',
  'a',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[role="slider"]',
  '[data-swipe-navigation="ignore"]',
  '[data-carousel]',
  '.leaflet-container',
  '[class*="overflow-x-auto"]',
  '[class*="overflow-x-scroll"]',
  '[class*="snap-x"]'
].join(',');

const DAY_SWIPE_BLOCKING_SELECTOR = `${SWIPE_BLOCKING_SELECTOR},button,[role="button"],label`;
const HORIZONTAL_SWIPE_MIN_DISTANCE_PX = 56;
const HORIZONTAL_SWIPE_RATIO = 1.35;
const IOS_EDGE_SWIPE_GUARD_PX = 24;

export function getAdjacentMainSection(
  activeSection: SectionTab,
  direction: 'previous' | 'next'
): SectionTab | null {
  const currentIndex = MAIN_SECTION_ORDER.indexOf(activeSection);
  const targetIndex = currentIndex + (direction === 'next' ? 1 : -1);
  return MAIN_SECTION_ORDER[targetIndex] || null;
}

export function blocksMainNavigationSwipe(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(SWIPE_BLOCKING_SELECTOR));
}

export function blocksDayNavigationSwipe(target: EventTarget | null, clientX?: number, viewportWidth?: number): boolean {
  if (target instanceof Element && target.closest(DAY_SWIPE_BLOCKING_SELECTOR)) {
    return true;
  }
  if (
    typeof clientX === 'number' &&
    typeof viewportWidth === 'number' &&
    viewportWidth > IOS_EDGE_SWIPE_GUARD_PX * 2 &&
    (clientX <= IOS_EDGE_SWIPE_GUARD_PX || clientX >= viewportWidth - IOS_EDGE_SWIPE_GUARD_PX)
  ) {
    return true;
  }
  return false;
}

export function resolveHorizontalSwipeDirection(
  start: { x: number; y: number } | null,
  endX: number,
  endY: number
): 'left' | 'right' | null {
  if (!start) return null;
  const deltaX = endX - start.x;
  const deltaY = endY - start.y;
  if (Math.abs(deltaX) < HORIZONTAL_SWIPE_MIN_DISTANCE_PX || Math.abs(deltaX) <= Math.abs(deltaY) * HORIZONTAL_SWIPE_RATIO) {
    return null;
  }
  return deltaX > 0 ? 'right' : 'left';
}
