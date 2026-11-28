import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Coordinate } from '../types';
import type { PlannedLocationInfo } from '../utils/liveIntelligenceHelper';

const MAX_AGE_MS = 30 * 60_000;
type PublicPoint = { lat: number; lng: number; updatedAt: number };
const valid = (p: any): p is PublicPoint => Boolean(p && typeof p.lat === 'number'
  && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && typeof p.updatedAt === 'number');

export function useLivePublicPlannedLocation(tripId: string | null, isExternal: boolean,
  mayPublish: boolean, coords: Coordinate | undefined, nowMs: number): PlannedLocationInfo | null {
  const [remote, setRemote] = useState<{ tripId: string; point: PublicPoint } | null>(null);
  const lastSent = useRef('');
  const lat = coords && Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90 ? Math.round(coords.lat * 100) / 100 : null;
  const lng = coords && Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180 ? Math.round(coords.lng * 100) / 100 : null;
  const bucket = Math.floor(nowMs / 600_000);

  useEffect(() => {
    setRemote(null);
    if (!isExternal || !tripId || !db) return;
    return onSnapshot(doc(db, 'live_feeds', tripId, 'planned_location', 'current'), snap => {
      const value = snap.data();
      setRemote(valid(value) ? { tripId, point: value } : null);
    }, () => setRemote(null));
  }, [tripId, isExternal]);

  useEffect(() => {
    if (isExternal || !mayPublish || !tripId || !db || !auth.currentUser || !navigator.onLine) return;
    const uid = auth.currentUser.uid;
    const signature = [tripId, uid, lat, lng, bucket].join(':');
    if (lastSent.current === signature) return;
    lastSent.current = signature;
    // Coordinates only, rounded to roughly 1 km. No title, notes, bookings or private documents.
    const payload = lat === null || lng === null ? { updatedAt: Date.now() } : { lat, lng, updatedAt: Date.now() };
    void setDoc(doc(db, 'live_feeds', tripId, 'planned_location', 'current'), payload)
      .catch(() => { if (lastSent.current === signature) lastSent.current = ''; });
  }, [tripId, isExternal, mayPublish, lat, lng, bucket]);

  if (!isExternal || !remote || remote.tripId !== tripId || nowMs - remote.point.updatedAt > MAX_AGE_MS
    || remote.point.updatedAt > nowMs + 120_000) return null;
  return {
    title: 'Posizione prevista (approssimativa)', locationName: 'Posizione prevista',
    coords: { lat: remote.point.lat, lng: remote.point.lng }, confidence: 'approximate',
    explanation: 'Posizione indicativa pubblicata dagli organizzatori dal programma, non dal GPS.'
  };
}
