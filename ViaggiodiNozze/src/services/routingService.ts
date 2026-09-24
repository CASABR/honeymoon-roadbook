import { storageService } from '../storage/storageService';
import type { RouteInfo, Coordinate } from '../types';

const API_KEY = import.meta.env.VITE_ORS_API_KEY || '';

const HEIGIT_GEOCODE_URL = 'https://api.heigit.org/geocode/search';
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';

const HEIGIT_DIRECTIONS_URL = 'https://api.heigit.org/v2/directions/driving-car';
const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export async function geocode(address: string): Promise<Coordinate | null> {
  if (!API_KEY) return null;
  
  try {
    const response = await fetch(`${HEIGIT_GEOCODE_URL}?text=${encodeURIComponent(address)}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      // Fallback
      const fbResponse = await fetch(`${ORS_GEOCODE_URL}?text=${encodeURIComponent(address)}`, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });
      if (!fbResponse.ok) return null;
      const data = await fbResponse.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return { lat, lng };
      }
      return null;
    }

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return { lat, lng };
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  
  return null;
}

export async function getRoute(from: string, to: string, fromCoord?: Coordinate, toCoord?: Coordinate): Promise<RouteInfo | null> {
  if (!from || !to) return null;

  const cacheKey = `route_${from.toLowerCase()}_${to.toLowerCase()}`;
  const cached = await storageService.getRouteCache(cacheKey);
  
  if (cached) {
    return cached.route;
  }

  if (!API_KEY) return null;

  try {
    let start = fromCoord;
    let end = toCoord;

    if (!start) start = await geocode(from) || undefined;
    if (!end) end = await geocode(to) || undefined;

    if (!start || !end) return null;

    const payload = {
      coordinates: [[start.lng, start.lat], [end.lng, end.lat]]
    };

    let response = await fetch(HEIGIT_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback
      response = await fetch(ORS_DIRECTIONS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) return null;
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const summary = data.features[0].properties.summary;
      const distanceKm = Math.round((summary.distance / 1000) * 10) / 10;
      
      const routeInfo: RouteInfo = {
        distanceKm,
        formattedDistance: `${distanceKm} km`,
        durationSeconds: summary.duration,
        formattedDuration: formatDuration(summary.duration)
      };

      await storageService.saveRouteCache({
        id: cacheKey,
        from,
        to,
        route: routeInfo,
        updatedAt: Date.now()
      });

      return routeInfo;
    }
  } catch (err) {
    console.error('Routing error:', err);
  }

  return null;
}
