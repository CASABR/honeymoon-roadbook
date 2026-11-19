import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface HorizontalScrollCueState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollByDirection: (direction: 'left' | 'right', minStepPx?: number) => void;
}

/**
 * Tracks horizontal overflow and scroll edges for scrollable strip containers
 * so navigation arrows and fade cues only appear when content actually overflows.
 */
export function useHorizontalScrollCue(
  containerRef: RefObject<HTMLElement | null>,
  depsKey?: string | number
): HorizontalScrollCueState {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollCue = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Small pixel tolerance avoids phantom cues from subpixel rounding.
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const nextLeft = el.scrollLeft > 4;
    const nextRight = maxScroll > 6 && el.scrollLeft < maxScroll - 4;
    setCanScrollLeft(prev => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight(prev => (prev === nextRight ? prev : nextRight));
  }, [containerRef]);

  useEffect(() => {
    updateScrollCue();
    const rafId = window.requestAnimationFrame(updateScrollCue);
    const el = containerRef.current;
    let ro: ResizeObserver | null = null;
    if (el) {
      el.addEventListener('scroll', updateScrollCue, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(updateScrollCue);
        ro.observe(el);
      }
    }
    window.addEventListener('resize', updateScrollCue);
    return () => {
      window.cancelAnimationFrame(rafId);
      el?.removeEventListener('scroll', updateScrollCue);
      ro?.disconnect();
      window.removeEventListener('resize', updateScrollCue);
    };
  }, [containerRef, updateScrollCue, depsKey]);

  const scrollByDirection = useCallback(
    (direction: 'left' | 'right', minStepPx = 180) => {
      const el = containerRef.current;
      if (!el) return;
      const step = Math.max(minStepPx, Math.round(el.clientWidth * 0.55));
      el.scrollBy({
        left: direction === 'left' ? -step : step,
        behavior: 'smooth',
      });
    },
    [containerRef]
  );

  return { canScrollLeft, canScrollRight, scrollByDirection };
}
