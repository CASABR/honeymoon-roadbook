import { storageService } from '../storage/storageService';
import type { RouteInfo, RouteProfile, Coordinate } from '../types';

const API_KEY = import.meta.env.VITE_ORS_API_KEY || '';

// Endpoint ufficiali HeiGIT / Openrouteservice
const HEIGIT_GEOCODE_URL = 'https://api.heigit.org/geocode/search';
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';

const ENDPOINTS: Record<RouteProfile, { primary: string; fallback: string }> = {
  'driving-car': {
    primary: 'https://api.heigit.org/v2/directions/driving-car',
    fallback: 'https://api.openrouteservice.org/v2/directions/driving-car'
  },
  'foot-walking': {
    primary: 'https://api.heigit.org/v2/directions/foot-walking',
    fallback: 'https://api.openrouteservice.org/v2/directions/foot-walking'
  }
};

/**
 * Formatta i secondi di durata in stringa leggibile:
 * - per auto: "1h 15m", "45m"
 * - a piedi: "35 min", "1h 10m"
 */
function formatDuration(seconds: number, profile: RouteProfile = 'driving-car'): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (profile === 'foot-walking') {
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  }

  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

/**
 * Calcolo distanza in linea d'aria con formula di Haversine (km)
 */
function calculateHaversineDistance(c1: Coordinate, c2: Coordinate): number {
  const R = 6371; // Raggio terrestre in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Fallback offline / stimato quando l'API non è disponibile o la quota è esaurita
 */
function calculateFallbackRoute(
  _from: string,
  _to: string,
  profile: RouteProfile,
  fromCoord?: Coordinate,
  toCoord?: Coordinate
): RouteInfo {
  // Se abbiamo le coordinate, calcoliamo con fattore di tortuosità stradale (1.3 per auto, 1.2 a piedi)
  if (fromCoord && toCoord) {
    const directKm = calculateHaversineDistance(fromCoord, toCoord);
    const windingFactor = profile === 'driving-car' ? 1.3 : 1.2;
    const distanceKm = Math.round(directKm * windingFactor * 10) / 10;
    
    // Velocità media stimata: auto 70 km/h, a piedi 4.5 km/h
    const avgSpeed = profile === 'driving-car' ? 70 : 4.5;
    const durationSeconds = Math.round((distanceKm / avgSpeed) * 3600);

    return {
      distanceKm,
      formattedDistance: `~${distanceKm} km`,
      durationSeconds,
      formattedDuration: `~${formatDuration(durationSeconds, profile)}`,
      profile,
      manualOverride: false
    };
  }

  // Se mancano coordinate e non c'è rete: stima minima di sicurezza
  return {
    distanceKm: 0,
    formattedDistance: 'Distanza n/d',
    durationSeconds: 0,
    formattedDuration: 'Tempo n/d',
    profile,
    manualOverride: false
  };
}

/**
 * Geocodifica un indirizzo o toponimo in coordinate { lat, lng }
 */
export async function geocode(address: string): Promise<Coordinate | null> {
  if (!API_KEY) return null;

  try {
    let response = await fetch(`${HEIGIT_GEOCODE_URL}?text=${encodeURIComponent(address)}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      // Fallback geocode
      response = await fetch(`${ORS_GEOCODE_URL}?text=${encodeURIComponent(address)}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`
        }
      });
      if (!response.ok) return null;
    }

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return { lat, lng };
    }
  } catch (err) {
    console.warn('[RoutingService] Errore geocoding:', err);
  }

  return null;
}

/**
 * Calcola la distanza e il tempo di percorrenza tra due località con cache persistente (IndexedDB).
 * Supporta 'driving-car' e 'foot-walking'.
 */
export async function getRoute(
  from: string,
  to: string,
  profile: RouteProfile = 'driving-car',
  fromCoord?: Coordinate,
  toCoord?: Coordinate
): Promise<RouteInfo | null> {
  if (!from || !to) return null;
  if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
    return {
      distanceKm: 0,
      formattedDistance: '0 km',
      durationSeconds: 0,
      formattedDuration: '0m',
      profile,
      manualOverride: false
    };
  }

  // 1. Verifica cache persistente IndexedDB: route_[profile]_[from]_[to]
  const cleanFrom = from.trim().toLowerCase().replace(/\s+/g, '_');
  const cleanTo = to.trim().toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `route_${profile}_${cleanFrom}_${cleanTo}`;

  try {
    const cached = await storageService.getRouteCache(cacheKey);
    if (cached && cached.route) {
      return cached.route;
    }
  } catch (e) {
    console.warn('[RoutingService] Cache read error:', e);
  }

  // 2. Se non c'è API key, usa il fallback stimato
  if (!API_KEY) {
    const fallback = calculateFallbackRoute(from, to, profile, fromCoord, toCoord);
    return fallback;
  }

  // 3. Risolvi coordinate se necessario
  try {
    let start = fromCoord;
    let end = toCoord;

    if (!start) start = (await geocode(from)) || undefined;
    if (!end) end = (await geocode(to)) || undefined;

    if (!start || !end) {
      return calculateFallbackRoute(from, to, profile, start, end);
    }

    const payload = {
      coordinates: [
        [start.lng, start.lat],
        [end.lng, end.lat]
      ]
    };

    const endpointConfig = ENDPOINTS[profile];
    let response = await fetch(endpointConfig.primary, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback secondario ORS
      response = await fetch(endpointConfig.fallback, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        return calculateFallbackRoute(from, to, profile, start, end);
      }
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const summary = data.features[0].properties.summary;
      const distanceKm = Math.round((summary.distance / 1000) * 10) / 10;

      const routeInfo: RouteInfo = {
        distanceKm,
        formattedDistance: `${distanceKm} km`,
        durationSeconds: summary.duration,
        formattedDuration: formatDuration(summary.duration, profile),
        profile,
        manualOverride: false
      };

      // Salva in cache IndexedDB
      await storageService.saveRouteCache({
        id: cacheKey,
        from,
        to,
        profile,
        route: routeInfo,
        updatedAt: Date.now()
      });

      return routeInfo;
    }
  } catch (err) {
    console.warn('[RoutingService] Routing API fetch failed, using fallback:', err);
  }

  return calculateFallbackRoute(from, to, profile, fromCoord, toCoord);
}

/**
 * Salva una modifica manuale di distanza e tempo per una tratta
 */
export async function saveManualRoute(
  from: string,
  to: string,
  profile: RouteProfile,
  distanceKm: number,
  formattedDuration: string
): Promise<RouteInfo> {
  const cleanFrom = from.trim().toLowerCase().replace(/\s+/g, '_');
  const cleanTo = to.trim().toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `route_${profile}_${cleanFrom}_${cleanTo}`;

  const routeInfo: RouteInfo = {
    distanceKm,
    formattedDistance: `${distanceKm} km`,
    durationSeconds: 0,
    formattedDuration,
    profile,
    manualOverride: true
  };

  await storageService.saveRouteCache({
    id: cacheKey,
    from,
    to,
    profile,
    route: routeInfo,
    updatedAt: Date.now()
  });

  return routeInfo;
}
