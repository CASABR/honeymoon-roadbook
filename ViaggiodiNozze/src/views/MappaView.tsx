import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { storageService } from '../storage/storageService';
import type { Coordinate } from '../types';

// Fix default icons if we ever fallback
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper per creare icone HTML personalizzate
const createCustomIcon = (emoji: string, bgColor: string, textColor: string, borderColor: string) => {
  return L.divIcon({
    html: `
      <div class="w-8 h-8 rounded-full shadow-md flex items-center justify-center text-sm border-2 ${bgColor} ${textColor} ${borderColor} transform transition-transform hover:scale-110">
        ${emoji}
      </div>
    `,
    className: 'bg-transparent border-none', // Override Leaflet defaults
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const ICONS = {
  tappa: createCustomIcon('📍', 'bg-rose-50', 'text-rose-600', 'border-rose-400'),
  alloggio: createCustomIcon('🏨', 'bg-indigo-50', 'text-indigo-600', 'border-indigo-400'),
  ristorante: createCustomIcon('🍽️', 'bg-amber-50', 'text-amber-600', 'border-amber-400'),
  attivita: createCustomIcon('🎟️', 'bg-emerald-50', 'text-emerald-600', 'border-emerald-400'),
};

interface MapMarkerData {
  id: string;
  title: string;
  type: 'tappa' | 'alloggio' | 'ristorante' | 'attivita';
  coord: Coordinate;
  date?: string;
  details?: string;
}

export default function MappaView() {
  const [markers, setMarkers] = useState<MapMarkerData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [tappe, alloggi, ristoranti, attivita] = await Promise.all([
          storageService.getTappe(),
          storageService.getAccommodations(),
          storageService.getRistoranti(),
          storageService.getActivities()
        ]);

        const newMarkers: MapMarkerData[] = [];

        tappe.forEach((t) => {
          if (t.coordinate) {
            newMarkers.push({
              id: t.id,
              title: t.titolo,
              type: 'tappa',
              coord: t.coordinate,
              date: t.data || t.date,
              details: t.nota
            });
          }
        });

        alloggi.forEach((a) => {
          if (a.coordinate) {
            newMarkers.push({
              id: a.id,
              title: a.name,
              type: 'alloggio',
              coord: a.coordinate,
              date: a.checkIn,
              details: a.address
            });
          }
        });

        ristoranti.forEach((r) => {
          if (r.coordinate) {
            newMarkers.push({
              id: r.id,
              title: r.nome,
              type: 'ristorante',
              coord: r.coordinate,
              date: r.data || r.date,
              details: r.indirizzo
            });
          }
        });

        attivita.forEach((a) => {
          if (a.coordinate) {
            newMarkers.push({
              id: a.id,
              title: a.title,
              type: 'attivita',
              coord: a.coordinate,
              date: a.date,
              details: a.location
            });
          }
        });

        setMarkers(newMarkers);
      } catch (err) {
        console.error('Errore caricamento mappa:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const center: [number, number] = useMemo(() => {
    if (markers.length === 0) return [41.9028, 12.4964]; // Roma default
    // Media delle coordinate
    const sumLat = markers.reduce((sum, m) => sum + m.coord.lat, 0);
    const sumLng = markers.reduce((sum, m) => sum + m.coord.lng, 0);
    return [sumLat / markers.length, sumLng / markers.length];
  }, [markers]);

  return (
    <div className="flex flex-col h-full animate-fade-in pb-4 space-y-4">
      <header className="px-1 mb-2">
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>🗺️</span>
          <span>Mappa Interattiva</span>
        </h1>
        <p className="text-[11px] text-slate-500 font-medium">
          Esplora le tappe, gli alloggi e le attività del tuo itinerario
        </p>
      </header>

      {/* Container della mappa */}
      <div className="flex-1 w-full rounded-3xl overflow-hidden shadow-sm border border-slate-200 relative min-h-[400px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
            <span className="text-xs font-bold text-slate-400">Caricamento mappa...</span>
          </div>
        ) : (
          <MapContainer 
            center={center} 
            zoom={markers.length > 0 ? 6 : 2} 
            style={{ height: '100%', width: '100%', zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((m) => (
              <Marker 
                key={m.id} 
                position={[m.coord.lat, m.coord.lng]}
                icon={ICONS[m.type]}
              >
                <Popup className="rounded-2xl">
                  <div className="p-1">
                    <h3 className="text-xs font-bold text-slate-900 capitalize mb-1">
                      {m.title}
                    </h3>
                    {m.date && (
                      <p className="text-[10px] text-slate-500 mb-1">📅 {m.date}</p>
                    )}
                    {m.details && (
                      <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                        {m.details}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Legenda rapida */}
      <div className="flex items-center justify-center gap-4 flex-wrap px-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
          <span className="w-4 h-4 rounded-full bg-rose-50 text-rose-600 border border-rose-400 flex items-center justify-center">📍</span>
          Tappe
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
          <span className="w-4 h-4 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-400 flex items-center justify-center">🏨</span>
          Alloggi
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
          <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-400 flex items-center justify-center">🎟️</span>
          Attività
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
          <span className="w-4 h-4 rounded-full bg-amber-50 text-amber-600 border border-amber-400 flex items-center justify-center">🍽️</span>
          Rist.
        </div>
      </div>
    </div>
  );
}
