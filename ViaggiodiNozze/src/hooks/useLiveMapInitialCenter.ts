import { useCallback, useEffect, useRef, useState } from 'react';

type Point = { lat: number; lng: number };
type Mode = 'both' | 'real' | 'planned';
const valid = (point: Point | null): point is Point => Boolean(point
  && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
  && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180);

function centerFor(mode: Mode, real: Point | null, planned: Point | null): Point | null {
  if (mode === 'real') return real;
  if (mode === 'planned') return planned || real;
  return real && planned
    ? { lat: (real.lat + planned.lat) / 2, lng: (real.lng + planned.lng) / 2 }
    : real || planned;
}

/** Viewport only: one initial GPS center per mount; later moves require an explicit control. */
export function useLiveMapInitialCenter(real: Point | null, planned: Point | null) {
  const [mode, setMode] = useState<Mode>('both');
  const [fixedCenter, setFixedCenter] = useState<Point | null>(null);
  const handled = useRef(false);
  const realLat = real?.lat;
  const realLng = real?.lng;

  useEffect(() => {
    const point = realLat === undefined || realLng === undefined ? null : { lat: realLat, lng: realLng };
    if (handled.current || !valid(point)) return;
    handled.current = true;
    setFixedCenter(point);
    setMode('real');
  }, [realLat, realLng]);

  const selectMode = useCallback((next: Mode) => {
    // A manual choice made before the first fix also takes precedence over auto-centering.
    handled.current = true;
    setMode(next);
    const point = centerFor(next, valid(real) ? real : null, valid(planned) ? planned : null);
    setFixedCenter(point ? { ...point } : null);
  }, [real, planned]);

  return {
    mapCenterMode: mode,
    setMapCenterMode: selectMode,
    // A withdrawn/unavailable GPS must retain the existing privacy/no-position fallback.
    effectiveMapCenter: valid(real)
      ? fixedCenter || centerFor(mode, real, valid(planned) ? planned : null)
      : centerFor(mode, null, valid(planned) ? planned : null),
  };
}
