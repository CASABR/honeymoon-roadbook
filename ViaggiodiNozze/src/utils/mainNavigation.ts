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
