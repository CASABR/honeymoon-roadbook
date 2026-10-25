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

import { KNOWN_COORDINATES, lookupKnownCoordinate } from '../utils/geoCoordinatesHelper';
export { KNOWN_COORDINATES, lookupKnownCoordinate };

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
  from: string,
  to: string,
  profile: RouteProfile,
  fromCoord?: Coordinate,
  toCoord?: Coordinate
): RouteInfo {
  let start = fromCoord || lookupKnownCoordinate(from);
  let end = toCoord || lookupKnownCoordinate(to);

  // Se abbiamo le coordinate (reali o dalla tabella statica), calcoliamo con fattore di tortuosità stradale (1.35 per auto, 1.2 a piedi)
  if (start && end) {
    const directKm = calculateHaversineDistance(start, end);

    // Se la distanza in linea d'aria supera i 500 km, si tratta di un volo transoceanico/aereo
    if (directKm > 500) {
      return {
        distanceKm: directKm,
        formattedDistance: 'Tratta aerea',
        durationSeconds: Math.round((directKm / 800) * 3600), // ~800 km/h volo
        formattedDuration: 'Volo',
        profile,
        manualOverride: false
      };
    }

    const isUrban = directKm < 15;
    const windingFactor = profile === 'driving-car' ? (isUrban ? 1.45 : 1.35) : (isUrban ? 1.3 : 1.2);
    const distanceKm = Math.max(0.3, Math.round(directKm * windingFactor * 10) / 10);
    
    // Velocità media stimata:
    // a piedi: 4.5 km/h (~13.3 min/km)
    // auto urbana: 25 km/h se < 15 km, altrimenti 70 km/h
    const avgSpeed = profile === 'driving-car' ? (isUrban ? 25 : 70) : 4.5;
    const durationSeconds = Math.round((distanceKm / avgSpeed) * 3600);

    return {
      distanceKm,
      formattedDistance: `${distanceKm} km`,
      durationSeconds,
      formattedDuration: `~${formatDuration(durationSeconds, profile)}`,
      profile,
      manualOverride: false
    };
  }

  // Se i nomi sono definiti ma mancano coordinate esatte, calcoliamo una stima simbolica realistica locale
  const distanceKm = profile === 'driving-car' ? 18.5 : 2.4;
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
  if (String(from || '').trim().toLowerCase() === String(to || '').trim().toLowerCase()) {
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
  const cleanFrom = String(from || '').trim().toLowerCase().replace(/\s+/g, '_');
  const cleanTo = String(to || '').trim().toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `route_${profile}_${cleanFrom}_${cleanTo}`;

  try {
    const cached = await storageService.getRouteCache(cacheKey);
    // Se la cache ha una distanza 0 o un vecchio calcolo errato tra punti urbani distinti (es. Duomo e Starita), scartala e ricalcola
    const isMilanRoute = (cleanFrom.includes('duomo') || cleanFrom.includes('novecento')) && (cleanTo.includes('gherardini') || cleanTo.includes('starita'));
    const isReverseMilanRoute = (cleanTo.includes('duomo') || cleanTo.includes('novecento')) && (cleanFrom.includes('gherardini') || cleanFrom.includes('starita'));
    const isSuzzaniRoute = (cleanFrom.includes('gherardini') || cleanFrom.includes('starita')) && (cleanTo.includes('suzzani') || cleanTo.includes('a&o') || cleanTo.includes('hostel'));
    const isReverseSuzzaniRoute = (cleanTo.includes('gherardini') || cleanTo.includes('starita')) && (cleanFrom.includes('suzzani') || cleanFrom.includes('a&o') || cleanFrom.includes('hostel'));
    if (cached && cached.route) {
      if ((isMilanRoute || isReverseMilanRoute) && (cached.route.distanceKm < 1 || cached.route.distanceKm > 10)) {
        // Forza ricalcolo con coordinate reali
      } else if ((isSuzzaniRoute || isReverseSuzzaniRoute) && (cached.route.distanceKm < 4 || cached.route.distanceKm > 12)) {
        // Scarta cache errata (< 4km non è realistica per Suzzani da Arco della Pace)
      } else if (cached.route.distanceKm === 0 && cleanFrom !== cleanTo) {
        // Cache non valida
      } else {
        return cached.route;
      }
    }
  } catch (e) {
    console.warn('[RoutingService] Cache read error:', e);
  }

  // 2. Se non c'è API key, usa il fallback stimato e salvalo in cache
  if (!API_KEY) {
    const fallback = calculateFallbackRoute(from, to, profile, fromCoord, toCoord);
    try {
      await storageService.saveRouteCache({
        id: cacheKey,
        from,
        to,
        profile,
        route: fallback,
        updatedAt: Date.now()
      });
    } catch {}
    return fallback;
  }

  // 3. Risolvi coordinate se necessario
  try {
    let start = fromCoord;
    let end = toCoord;

    if (!start) start = (await geocode(from)) || lookupKnownCoordinate(from) || undefined;
    if (!end) end = (await geocode(to)) || lookupKnownCoordinate(to) || undefined;

    if (!start || !end) {
      const fallback = calculateFallbackRoute(from, to, profile, start, end);
      try {
        await storageService.saveRouteCache({
          id: cacheKey,
          from,
          to,
          profile,
          route: fallback,
          updatedAt: Date.now()
        });
      } catch {}
      return fallback;
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
        const fallback = calculateFallbackRoute(from, to, profile, start, end);
        try {
          await storageService.saveRouteCache({
            id: cacheKey,
            from,
            to,
            profile,
            route: fallback,
            updatedAt: Date.now()
          });
        } catch {}
        return fallback;
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

  const finalFallback = calculateFallbackRoute(from, to, profile, fromCoord, toCoord);
  try {
    await storageService.saveRouteCache({
      id: cacheKey,
      from,
      to,
      profile,
      route: finalFallback,
      updatedAt: Date.now()
    });
  } catch {}
  return finalFallback;
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
  const cleanFrom = String(from || '').trim().toLowerCase().replace(/\s+/g, '_');
  const cleanTo = String(to || '').trim().toLowerCase().replace(/\s+/g, '_');
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
