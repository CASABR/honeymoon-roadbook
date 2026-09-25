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

  const handleToggleProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProfile(prev => (prev === 'driving-car' ? 'foot-walking' : 'driving-car'));
  };

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
  const icon = isCar ? '🚗' : '🚶';

  return (
    <div
      onClick={handleOpenMaps}
      title="Clicca per aprire la rotta esatta in Google Maps"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 hover:bg-sky-100/80 text-sky-900 border border-sky-200/70 text-[11px] font-semibold transition-all cursor-pointer shadow-2xs group active:scale-95 ${className}`}
    >
      {/* Toggle auto / piedi */}
      <button
        type="button"
        onClick={handleToggleProfile}
        title={isCar ? 'Passa a piedi 🚶' : 'Passa in auto 🚗'}
        className="w-5 h-5 -ml-1 rounded-full bg-white hover:bg-sky-200 flex items-center justify-center text-xs transition-colors shadow-2xs cursor-pointer"
      >
        {icon}
      </button>

      <span>{route?.formattedDistance || 'Distanza n/d'}</span>
      <span className="text-sky-300">•</span>
      <span className="text-sky-700">~{route?.formattedDuration || 'Tempo n/d'}</span>

      {/* Icona esterna Maps */}
      <svg className="w-3 h-3 text-sky-500 group-hover:text-sky-700 transition-colors ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>

      {/* Tasto modifica manuale su hover */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setManualDistance(route?.formattedDistance || '');
          setManualDuration(route?.formattedDuration || '');
          setIsEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-400 hover:text-sky-800 transition-opacity cursor-pointer text-xs"
        title="Modifica km e tempo manualmente"
      >
        ✏️
      </button>
    </div>
  );
}
