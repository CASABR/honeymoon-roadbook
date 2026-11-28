import { useEffect, useRef, useState } from 'react';
import { auth } from '../firebase';
import type { Coordinate } from '../types';
import type { PlannedLocationInfo } from '../utils/liveIntelligenceHelper';
import { LIVE_PHOTO_ORIGIN } from '../services/liveStorageService';

const MAX_AGE_MS = 30 * 60_000;
type Point = Coordinate & { updatedAt: number };
function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const p = value as Point;
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180
    && Number.isFinite(p.updatedAt);
}

export function useLivePublicPlannedLocation(tripId: string | null, external: boolean,
  mayPublish: boolean, coords: Coordinate | undefined, nowMs: number, online: boolean, currentUid: string | null): PlannedLocationInfo | null {
  const [remote, setRemote] = useState<{ tripId: string; point: Point } | null>(null);
  const lastSent = useRef('');
  const lat = coords && Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90 ? Math.round(coords.lat * 100) / 100 : null;
  const lng = coords && Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180 ? Math.round(coords.lng * 100) / 100 : null;
  const bucket = Math.floor(nowMs / 600_000);
  const endpoint = tripId && LIVE_PHOTO_ORIGIN ? `${LIVE_PHOTO_ORIGIN}/v1/live-photos/${encodeURIComponent(tripId)}/planned-location` : '';

  useEffect(() => {
    setRemote(null);
    if (!external || !tripId || !endpoint || !online) return;
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const result = response.ok ? await response.json() : null;
        if (!disposed) setRemote(result?.available === true && isPoint(result.location) ? { tripId, point: result.location } : null);
      } catch {
        if (!disposed) setRemote(null);
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 120_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [tripId, endpoint, external, online]);

  useEffect(() => {
    if (external || !mayPublish || !tripId || !endpoint || !online || !currentUid) return;
    const user = auth.currentUser;
    if (!user || user.isAnonymous || user.uid !== currentUid) return;
    const signature = [tripId, currentUid, lat, lng, bucket].join(':');
    if (lastSent.current === signature) return;
    let cancelled = false;
    const controller = new AbortController();
    const publish = async () => {
      try {
        const token = await user.getIdToken();
        if (cancelled || auth.currentUser?.uid !== currentUid) return;
        const body = lat === null || lng === null ? { clear: true } : { lat, lng };
        const response = await fetch(endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: controller.signal
        });
        if (response.ok && !cancelled) lastSent.current = signature;
      } catch { /* No private-data fallback; retry at the next scheduled refresh. */ }
    };
    void publish();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [external, mayPublish, tripId, endpoint, online, currentUid, lat, lng, bucket]);

  if (!external || !online || !remote || remote.tripId !== tripId
    || nowMs - remote.point.updatedAt >= MAX_AGE_MS || remote.point.updatedAt > nowMs + 120_000) return null;
  return {
    title: 'Posizione prevista (approssimativa)', locationName: 'Posizione prevista',
    coords: { lat: remote.point.lat, lng: remote.point.lng }, confidence: 'approximate',
    explanation: 'Posizione indicativa del programma, distinta dal GPS.'
  };
}
