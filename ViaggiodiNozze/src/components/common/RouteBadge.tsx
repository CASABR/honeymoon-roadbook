import { useState, useEffect } from 'react';
import type { RouteInfo } from '../../types';
import { getRoute } from '../../services/routingService';

interface RouteBadgeProps {
  from: string;
  to: string;
  className?: string;
}

export default function RouteBadge({ from, to, className = '' }: RouteBadgeProps) {
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
        const info = await getRoute(from, to);
        if (mounted && info) {
          setRoute(info);
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
    
    return () => { mounted = false; };
  }, [from, to]);

  const handleSaveManual = () => {
    const newRoute: RouteInfo = {
      distanceKm: parseFloat(manualDistance) || 0,
      formattedDistance: manualDistance || '0 km',
      durationSeconds: 0,
      formattedDuration: manualDuration || '0m',
      manualOverride: true
    };
    setRoute(newRoute);
    setIsEditing(false);
    // Ideally save to storageService too
  };

  if (!from || !to || from.toLowerCase() === to.toLowerCase()) {
    return null;
  }

  if (isEditing) {
    return (
      <div className={`flex flex-col gap-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs ${className}`}>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="es. 220 km"
            value={manualDistance}
            onChange={e => setManualDistance(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-slate-300"
          />
          <input
            type="text"
            placeholder="es. 2h 45m"
            value={manualDuration}
            onChange={e => setManualDuration(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-slate-300"
          />
          <button 
            onClick={handleSaveManual}
            className="px-2 py-1 bg-sky-600 text-white font-bold rounded"
          >
            Salva
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 text-slate-500 border border-slate-200 text-[10px] ${className}`}>
        <span className="animate-pulse">🚗 Calcolo percorso...</span>
      </div>
    );
  }

  if (!route) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 text-slate-500 border border-slate-200 text-[10px] ${className}`}>
        <span>🚗 Percorso non calcolabile</span>
        <button onClick={() => setIsEditing(true)} className="ml-1 underline text-sky-600">Modifica</button>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-[10px] sm:text-xs font-semibold shadow-2xs group ${className}`}>
      <span>🚗</span>
      <span>{route.formattedDistance}</span>
      <span className="text-sky-300">•</span>
      <span>~{route.formattedDuration}</span>
      <button 
        onClick={() => {
          setManualDistance(route.formattedDistance);
          setManualDuration(route.formattedDuration);
          setIsEditing(true);
        }} 
        className="opacity-0 group-hover:opacity-100 ml-1 text-sky-600 hover:text-sky-800 transition-opacity"
        title="Modifica manualmente"
      >
        ✏️
      </button>
    </div>
  );
}
