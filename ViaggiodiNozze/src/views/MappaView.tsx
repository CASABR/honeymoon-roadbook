import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { storageService } from '../storage/storageService';
import { lookupKnownCoordinate } from '../services/routingService';
import type { Coordinate } from '../types';

export type POICategory = 'tappa' | 'alloggio' | 'attivita' | 'ristorante';

export interface MapMarkerData {
  id: string;
  title: string;
  type: POICategory;
  coord: Coordinate;
  date?: string;
  time?: string;
  details?: string;
  originalItem?: any;
}

// Configurazione grafica e icone SVG inline per categoria
const CATEGORY_META: Record<POICategory, {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  markerBg: string;
  markerBorder: string;
  markerShadow: string;
  iconSvg: string;
}> = {
  tappa: {
    label: 'Tappa',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40',
    badgeText: 'text-rose-700 dark:text-rose-300',
    badgeBorder: 'border-rose-200 dark:border-rose-800/40',
    markerBg: '#F43F5E', // Rose 500
    markerBorder: '#BE123C', // Rose 700
    markerShadow: 'rgba(244, 63, 94, 0.45)',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`
  },
  alloggio: {
    label: 'Alloggio',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800/40',
    markerBg: '#6366F1', // Indigo 500
    markerBorder: '#4338CA', // Indigo 700
    markerShadow: 'rgba(99, 102, 241, 0.45)',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z"/></svg>`
  },
  attivita: {
    label: 'Attività',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800/40',
    markerBg: '#F59E0B', // Amber 500
    markerBorder: '#B45309', // Amber 700
    markerShadow: 'rgba(245, 158, 11, 0.45)',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/><circle cx="12" cy="15" r="1.5"/></svg>`
  },
  ristorante: {
    label: 'Ristorante',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800/40',
    markerBg: '#10B981', // Emerald 500
    markerBorder: '#047857', // Emerald 700
    markerShadow: 'rgba(16, 185, 129, 0.45)',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M6 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M9 12v10"/></svg>`
  }
};

// Generatore icone Leaflet basate su L.divIcon per non dipendere da percorsi statici/PNG
function createPinIcon(type: POICategory, isSelected: boolean = false) {
  const meta = CATEGORY_META[type];
  const size = isSelected ? 42 : 36;
  const scale = isSelected ? 1.15 : 1;

  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${meta.markerBg};
      border: ${isSelected ? '3px solid #FFFFFF' : `2.5px solid ${meta.markerBorder}`};
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg) scale(${scale});
      box-shadow: 0 4px 12px ${meta.markerShadow}, 0 2px 4px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    ">
      <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
        ${meta.iconSvg}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'leaflet-custom-poi-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4]
  });
}

// Estrazione sicura di coordinate con Number() / parseFloat() rigorosi
function parseValidCoord(c: any): Coordinate | null {
  if (!c) return null;
  const lat = typeof c.lat === 'number' ? c.lat : parseFloat(String(c.lat));
  const lng = typeof c.lng === 'number' ? c.lng : parseFloat(String(c.lng));
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

// Generatore icona "Dove sono io" - Pallino blu pulsante stile Google/Apple Maps
function createUserLocationIcon() {
  const html = `
    <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35); position: relative; z-index: 1;"></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'leaflet-user-location-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14]
  });
}

function MapController({
  markers,
  selectedMarker,
  userLocation,
  shouldFlyToUser
}: {
  markers: MapMarkerData[];
  selectedMarker: MapMarkerData | null;
  userLocation: Coordinate | null;
  shouldFlyToUser: boolean;
}) {
  const map = useMap();
  const hasInitializedRef = useRef(false);
  const userCenteringActiveRef = useRef(false);

  // Se l'utente clicca "Dove sono io", vola e mantieni il focus sulla posizione utente
  useEffect(() => {
    if (shouldFlyToUser && userLocation) {
      userCenteringActiveRef.current = true;
      map.flyTo([userLocation.lat, userLocation.lng], 15, { animate: true, duration: 1.2 });
    }
  }, [shouldFlyToUser, userLocation, map]);

  // Se l'utente seleziona un marker esplicito dalla lista
  useEffect(() => {
    if (selectedMarker) {
      userCenteringActiveRef.current = false;
      map.setView([selectedMarker.coord.lat, selectedMarker.coord.lng], Math.max(map.getZoom(), 13), {
        animate: true
      });
    }
  }, [selectedMarker, map]);

  // Adatta i bordi iniziali una sola volta all'avvio o solo se non siamo centrati sull'utente
  useEffect(() => {
    if (!hasInitializedRef.current && markers.length > 0) {
      hasInitializedRef.current = true;
      const bounds = L.latLngBounds(markers.map((m) => [m.coord.lat, m.coord.lng]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }, [markers, map]);

  return null;
}

export default function MappaView() {
  const [markers, setMarkers] = useState<MapMarkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<POICategory | 'all'>('all');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Stato Geolocalizzazione "Dove sono io"
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [shouldFlyToUser, setShouldFlyToUser] = useState(false);
  const [locationToast, setLocationToast] = useState<string | null>(null);

  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast("Geolocalizzazione non supportata dal tuo browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const newCoord: Coordinate = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(newCoord);
        setShouldFlyToUser(true);
        // Reset flag dopo il volo
        setTimeout(() => setShouldFlyToUser(false), 1500);
      },
      (error) => {
        setIsLocating(false);
        console.warn("Errore geolocalizzazione utente:", error);
        showToast("Impossibile rilevare la posizione attuale");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  };

  const showToast = (msg: string) => {
    setLocationToast(msg);
    setTimeout(() => {
      setLocationToast(null);
    }, 3500);
  };

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

        // 1. Tappe
        tappe.forEach((t) => {
          const directCoord = parseValidCoord(t.coordinate);
          const coord = directCoord || lookupKnownCoordinate(t.indirizzo || t.titolo || '');
          if (coord) {
            newMarkers.push({
              id: `tappa_${t.id}`,
              title: t.titolo,
              type: 'tappa',
              coord,
              date: t.data || t.date,
              time: t.orario || (t as any).time,
              details: t.indirizzo || t.nota,
              originalItem: t
            });
          }
        });

        // 2. Alloggi
        alloggi.forEach((a) => {
          const directCoord = parseValidCoord(a.coordinate);
          const coord = directCoord || lookupKnownCoordinate(a.address || a.location || a.name || '');
          if (coord) {
            newMarkers.push({
              id: `alloggio_${a.id}`,
              title: a.name,
              type: 'alloggio',
              coord,
              date: a.checkIn,
              time: a.checkInTime ? `In: ${a.checkInTime}` : undefined,
              details: a.address || a.location,
              originalItem: a
            });
          }
        });

        // 3. Attività
        attivita.forEach((act) => {
          const directCoord = parseValidCoord(act.coordinate);
          const coord = directCoord || lookupKnownCoordinate(act.address || act.location || act.title || '');
          if (coord) {
            newMarkers.push({
              id: `attivita_${act.id}`,
              title: act.title,
              type: 'attivita',
              coord,
              date: act.date,
              time: act.time || act.orarioInizio,
              details: act.address || act.location,
              originalItem: act
            });
          }
        });

        // 4. Ristoranti
        ristoranti.forEach((r) => {
          const directCoord = parseValidCoord(r.coordinate);
          const coord = directCoord || lookupKnownCoordinate(r.indirizzo || r.nome || '');
          if (coord) {
            newMarkers.push({
              id: `ristorante_${r.id}`,
              title: r.nome,
              type: 'ristorante',
              coord,
              date: r.data || r.date,
              time: r.orario,
              details: r.indirizzo,
              originalItem: r
            });
          }
        });

        setMarkers(newMarkers);
        if (newMarkers.length > 0) {
          setSelectedMarkerId(newMarkers[0].id);
        }
      } catch (err) {
        console.error('Errore caricamento dati per la mappa:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Filtro categoria
  const filteredMarkers = useMemo(() => {
    if (selectedCategory === 'all') return markers;
    return markers.filter((m) => m.type === selectedCategory);
  }, [markers, selectedCategory]);

  // Marker selezionato
  const selectedMarker = useMemo(() => {
    return filteredMarkers.find((m) => m.id === selectedMarkerId) || filteredMarkers[0] || null;
  }, [filteredMarkers, selectedMarkerId]);

  // Centro di default
  const defaultCenter: [number, number] = useMemo(() => {
    if (selectedMarker) return [selectedMarker.coord.lat, selectedMarker.coord.lng];
    if (filteredMarkers.length > 0) {
      const sumLat = filteredMarkers.reduce((s, m) => s + m.coord.lat, 0);
      const sumLng = filteredMarkers.reduce((s, m) => s + m.coord.lng, 0);
      return [sumLat / filteredMarkers.length, sumLng / filteredMarkers.length];
    }
    return [45.4642, 9.1900]; // Milano
  }, [filteredMarkers, selectedMarker]);

  const handleSelectMarker = (marker: MapMarkerData) => {
    setSelectedMarkerId(marker.id);
    const mRef = markerRefs.current[marker.id];
    if (mRef) {
      mRef.openPopup();
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-16 space-y-3">
      {/* HEADER & FILTRI */}
      <header className="px-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>🗺️</span>
              <span>Mappa Interattiva</span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {filteredMarkers.length} punti di interesse localizzati nel percorso
            </p>
          </div>
        </div>

        {/* Categorie filtri pillole */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Tutti ({markers.length})
          </button>
          {(Object.keys(CATEGORY_META) as POICategory[]).map((catKey) => {
            const meta = CATEGORY_META[catKey];
            const count = markers.filter((m) => m.type === catKey).length;
            const isSelected = selectedCategory === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder} shadow-xs font-bold ring-1 ring-current`
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{meta.label}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* CONTAINER MAPPA */}
      <div
        className="w-full rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 relative bg-slate-100 dark:bg-slate-900"
        style={{ height: '52vh', minHeight: '340px' }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 z-10 backdrop-blur-xs">
            <div className="flex flex-col items-center gap-2">
              <div className="w-7 h-7 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento mappa e pin...</span>
            </div>
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={filteredMarkers.length > 0 ? 11 : 4}
            style={{ height: '100%', width: '100%', zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController
              markers={filteredMarkers}
              selectedMarker={selectedMarker}
              userLocation={userLocation}
              shouldFlyToUser={shouldFlyToUser}
            />

            {/* Marker Posizione Attuale Utente (Pallino Blu Pulsante) */}
            {userLocation && (
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={createUserLocationIcon()}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="p-1 text-center min-w-[120px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 inline-block mb-1">
                      📍 Tu sei qui
                    </span>
                    <p className="text-[11px] font-semibold text-slate-800">La tua posizione attuale</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {filteredMarkers.map((m) => {
              const isSelected = selectedMarker?.id === m.id;
              const meta = CATEGORY_META[m.type];
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${m.coord.lat},${m.coord.lng}`;

              return (
                <Marker
                  key={m.id}
                  position={[m.coord.lat, m.coord.lng]}
                  icon={createPinIcon(m.type, isSelected)}
                  ref={(ref) => {
                    markerRefs.current[m.id] = ref;
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelectedMarkerId(m.id);
                    }
                  }}
                >
                  <Popup className="custom-leaflet-popup">
                    <div className="p-1 min-w-[190px] max-w-[240px]">
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText} border ${meta.badgeBorder}`}>
                          {meta.label}
                        </span>
                        {(m.time || m.date) && (
                          <span className="text-[10px] font-medium text-slate-400">
                            {m.time || m.date}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-bold text-slate-900 leading-snug mb-1">
                        {m.title}
                      </h3>
                      {m.details && (
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 mb-2">
                          {m.details}
                        </p>
                      )}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-semibold transition-colors mt-1"
                      >
                        <span>🗺️</span>
                        <span>Apri in Google Maps ↗</span>
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}

        {/* Pulsante Flottante "Dove sono io" */}
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocating}
          title="Dove sono io"
          aria-label="La mia posizione"
          className="absolute bottom-4 right-4 z-[400] w-11 h-11 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-full shadow-lg border border-slate-200/80 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" strokeWidth="2.5" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
          )}
        </button>

        {/* Toast Notifica Posizione Sobrio e non bloccante */}
        {locationToast && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[500] px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-md backdrop-blur-xs flex items-center gap-2 animate-fade-in">
            <span>ℹ️</span>
            <span>{locationToast}</span>
          </div>
        )}
      </div>

      {/* CARD DETTAGLIO ELEMENTO SELEZIONATO */}
      {selectedMarker && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${CATEGORY_META[selectedMarker.type].badgeBg} ${CATEGORY_META[selectedMarker.type].badgeText} ${CATEGORY_META[selectedMarker.type].badgeBorder}`}>
                  {CATEGORY_META[selectedMarker.type].label}
                </span>
                {selectedMarker.date && (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    📅 {selectedMarker.date}
                  </span>
                )}
                {selectedMarker.time && (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    ⏰ {selectedMarker.time}
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug truncate">
                {selectedMarker.title}
              </h3>
              {selectedMarker.details && (
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate mt-1 flex items-center gap-1">
                  <span>📍</span>
                  <span className="truncate">{selectedMarker.details}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectMarker(selectedMarker)}
                title="Centra marker sulla mappa"
                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
              >
                🎯
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selectedMarker.coord.lat},${selectedMarker.coord.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 text-xs font-semibold transition-colors"
              >
                <span>Naviga ↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* LISTA ORIZZONTALE POI COMPATTA */}
      {filteredMarkers.length > 1 && (
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Punti correlati ({filteredMarkers.length})
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {filteredMarkers.map((m) => {
              const isSelected = selectedMarker?.id === m.id;
              const meta = CATEGORY_META[m.type];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMarker(m)}
                  className={`flex-shrink-0 max-w-[210px] text-left p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900' : `${meta.badgeBg} ${meta.badgeText}`}`}>
                      {meta.label}
                    </span>
                    {m.date && (
                      <span className="text-[10px] opacity-75 truncate">
                        {m.date}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold truncate leading-tight">
                    {m.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
