import { useState, useEffect } from 'react';
import type { RouteInfo, RouteProfile, Coordinate } from '../../types';
import { getRoute, saveManualRoute } from '../../services/routingService';
import { openMapLink } from '../../utils/mapsHelper';

interface RouteBadgeProps {
  from: string;
  to: string;
  fromCoord?: Coordinate;
  toCoord?: Coordinate;
  defaultProfile?: RouteProfile;
  className?: string;
  onDistanceCalculated?: (distanceKm: number) => void;
}

export default function RouteBadge({
  from,
  to,
  fromCoord,
  toCoord,
  defaultProfile = 'driving-car',
  className = '',
  onDistanceCalculated
}: RouteBadgeProps) {
  const [profile, setProfile] = useState<RouteProfile>(defaultProfile);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [manualDistance, setManualDistance] = useState('');
  const [manualDuration, setManualDuration] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadRoute() {
      if (!from || !to) return;
      setLoading(true);
      try {
        const info = await getRoute(from, to, profile, fromCoord, toCoord);
        if (mounted && info) {
          setRoute(info);
          if (info.distanceKm > 0 && onDistanceCalculated) {
            onDistanceCalculated(info.distanceKm);
          }
          if (info.manualOverride) {
            setManualDistance(info.formattedDistance);
            setManualDuration(info.formattedDuration);
          }
        }
      } catch (err) {
        console.error('Error loading route:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadRoute();

    return () => {
      mounted = false;
    };
  }, [from, to, profile, fromCoord, toCoord, onDistanceCalculated]);


  const handleOpenMaps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const queryOrigin = fromCoord ? `${fromCoord.lat},${fromCoord.lng}` : encodeURIComponent(from);
    const queryDest = toCoord ? `${toCoord.lat},${toCoord.lng}` : encodeURIComponent(to);
    const travelMode = profile === 'driving-car' ? 'driving' : 'walking';
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${queryOrigin}&destination=${queryDest}&travelmode=${travelMode}`;
    openMapLink(mapsUrl);
  };

  const handleSaveManual = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const km = parseFloat(manualDistance.replace(/[^\d.]/g, '')) || 0;
    const duration = manualDuration.trim() || '0m';

    const saved = await saveManualRoute(from, to, profile, km, duration);
    setRoute(saved);
    if (km > 0 && onDistanceCalculated) {
      onDistanceCalculated(km);
    }
    setIsEditing(false);
  };

  if (!from || !to || from.trim().toLowerCase() === to.trim().toLowerCase()) {
    return null;
  }

  if (isEditing) {
    return (
      <div
        onClick={e => e.stopPropagation()}
        className={`flex flex-wrap items-center gap-1.5 p-2 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-700 text-xs ${className}`}
      >
        <span className="text-[10px] text-slate-300 font-medium">Modifica manuale:</span>
        <input
          type="text"
          placeholder="es. 120 km"
          value={manualDistance}
          onChange={e => setManualDistance(e.target.value)}
          className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
        />
        <input
          type="text"
          placeholder="es. 1h 40m"
          value={manualDuration}
          onChange={e => setManualDuration(e.target.value)}
          className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={handleSaveManual}
          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded-lg text-xs cursor-pointer transition-all"
        >
          Salva
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="px-2 py-1 text-slate-400 hover:text-white text-xs cursor-pointer"
        >
          Annulla
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 text-slate-500 border border-slate-200/80 text-[11px] font-medium animate-pulse ${className}`}>
        <span>{profile === 'driving-car' ? '🚗' : '🚶'}</span>
        <span>Calcolo percorso...</span>
      </div>
    );
  }

  const isCar = profile === 'driving-car';

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 p-1 px-2 rounded-2xl bg-white/95 border border-slate-200 shadow-sm text-xs ${className}`}
    >
      {/* Due pulsanti pillola ben visibili [🚗 In Auto] [🚶 A Piedi] */}
      <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (profile !== 'driving-car') setProfile('driving-car');
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
            isCar
              ? 'bg-slate-900 text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Calcola percorso in auto"
        >
          <span>🚗</span>
          <span>In Auto</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (profile !== 'foot-walking') setProfile('foot-walking');
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
            !isCar
              ? 'bg-slate-900 text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Calcola percorso a piedi"
        >
          <span>🚶</span>
          <span>A Piedi</span>
        </button>
      </div>

      {/* Valore distanza e durata calcolati */}
      <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] text-slate-700 font-medium">
        {loading ? (
          <span className="text-slate-400 animate-pulse">Calcolo...</span>
        ) : (
          <>
            <span className="font-bold text-slate-900">
              {route?.formattedDistance || '— km'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-amber-700 font-medium">
              ~{route?.formattedDuration || '—'}
            </span>
          </>
        )}
      </div>

      {/* Pulsante rotta ufficiale Google Maps */}
      <button
        type="button"
        onClick={handleOpenMaps}
        title="Apri percorso esatto in Google Maps"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/70 text-[10px] font-semibold transition-all cursor-pointer active:scale-95"
      >
        <svg className="w-3 h-3 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>Apri rotta</span>
      </button>

      {/* Tasto modifica manuale */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setManualDistance(route?.formattedDistance || '');
          setManualDuration(route?.formattedDuration || '');
          setIsEditing(true);
        }}
        className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer text-xs"
        title="Modifica km o tempo manualmente"
      >
        ✏️
      </button>
    </div>
  );
}
