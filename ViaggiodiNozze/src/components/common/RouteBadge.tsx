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
  const isTransoceanic = route && (route.distanceKm > 500 || route.formattedDistance.toLowerCase().includes('aereo') || route.formattedDistance.toLowerCase().includes('transoceanic'));

  if (isTransoceanic) {
    return (
      <div
        className={`flex items-center justify-between flex-nowrap gap-2 py-1.5 px-3 rounded-2xl bg-sky-50/80 border border-sky-200/80 text-xs shadow-2xs ${className}`}
      >
        <div className="flex items-center gap-1.5 text-sky-900 font-bold text-[11px] truncate">
          <span>✈️</span>
          <span>Tratta transoceanica / aerea</span>
        </div>
        <button
          type="button"
          onClick={handleOpenMaps}
          title="Apri indicazioni Google Maps"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-semibold transition-all cursor-pointer active:scale-95"
        >
          <span>Apri Maps ↗</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between flex-nowrap gap-2 py-1.5 px-3 rounded-2xl bg-white/95 border border-slate-200/90 shadow-2xs text-xs overflow-x-auto no-scrollbar ${className}`}
    >
      {/* Due pulsanti pillola [🚗 Auto] [🚶 Piedi] */}
      <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (profile !== 'driving-car') setProfile('driving-car');
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
            isCar
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Calcola percorso in auto"
        >
          <span>🚗</span>
          <span>Auto</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (profile !== 'foot-walking') setProfile('foot-walking');
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
            !isCar
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Calcola percorso a piedi"
        >
          <span>🚶</span>
          <span>Piedi</span>
        </button>
      </div>

      {/* Valore distanza e durata calcolati */}
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-700 font-medium shrink-0">
        {loading ? (
          <span className="text-slate-400 animate-pulse">Calcolo...</span>
        ) : (
          <>
            <span className="font-bold text-slate-900">
              {route?.formattedDistance || '— km'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-amber-700 font-semibold">
              {route?.formattedDuration || '—'}
            </span>
          </>
        )}
      </div>

      {/* Sezione destra: Pulsante rotta + modifica */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <button
          type="button"
          onClick={handleOpenMaps}
          title="Apri percorso esatto in Google Maps"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-semibold transition-all cursor-pointer active:scale-95"
        >
          <svg className="w-2.5 h-2.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </div>
  );
}
