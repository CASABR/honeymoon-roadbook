import { kvStorage } from "./db";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface RoutePoint {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface DrivingRoute {
  originKey: string;
  destinationKey: string;
  distanceKm: number;
  durationMin: number;
  formattedText: string;
  calculatedAt: number;
}

export type RoutingStatus =
  | "success"
  | "skipped-distance"
  | "unresolved-origin"
  | "unresolved-destination"
  | "short-link-unsupported"
  | "network-error"
  | "invalid-coordinates";

export interface RoutingResult {
  status: RoutingStatus;
  route?: DrivingRoute;
  errorMessage?: string;
}

export interface ParsedLocation {
  type: "coordinates" | "query" | "short-link" | "unsupported";
  latitude?: number;
  longitude?: number;
  query?: string;
  rawUrl?: string;
}

// ─── CONSTANTS & CACHE CONFIG ────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Giorni
const ROUTE_CACHE_PREFIX = "hrb_route_v1_";
const POINT_CACHE_PREFIX = "hrb_point_v1_";
const MAX_DRIVING_DISTANCE_KM = 400; // Guardrail 400 km

// ─── PARSING GOOGLE MAPS URL ─────────────────────────────────────────────────

/**
 * Analizza un URL Google Maps o una stringa di ricerca ed estrae
 * coordinate dirette, query testuali o rileva link brevi non supportati.
 */
export function parseMapsLocation(urlOrQuery?: string): ParsedLocation {
  if (!urlOrQuery || !urlOrQuery.trim()) {
    return { type: "unsupported" };
  }

  const str = urlOrQuery.trim();

  // 1. Rileva short link (maps.app.goo.gl o goo.gl/maps) senza effettuare fetch
  if (/maps\.app\.goo\.gl/i.test(str) || /goo\.gl\/maps/i.test(str)) {
    return { type: "short-link", rawUrl: str };
  }

  // Helper per controllare se una stringa è lat,lon
  const parseLatLonStr = (val?: string | null): { lat: number; lon: number } | null => {
    if (!val) return null;
    const cleanVal = decodeURIComponent(val).trim();
    const match = cleanVal.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { lat, lon };
      }
    }
    return null;
  };

  // 2. Controllo se l'input stesso è una coppia di coordinate lat,lon
  const directCoord = parseLatLonStr(str);
  if (directCoord) {
    return {
      type: "coordinates",
      latitude: directCoord.lat,
      longitude: directCoord.lon,
      rawUrl: str,
    };
  }

  // 3. Se l'input è un URL Google Maps
  if (/^https?:\/\//i.test(str) || str.includes("google.com/maps")) {
    try {
      const urlObj = new URL(str.startsWith("http") ? str : `https://${str}`);
      const params = urlObj.searchParams;

      // Cerca nei parametri standard (query, q, ll, origin, destination)
      const queryParam = params.get("query") || params.get("q") || params.get("destination") || params.get("origin") || params.get("ll");
      const paramCoord = parseLatLonStr(queryParam);
      if (paramCoord) {
        return {
          type: "coordinates",
          latitude: paramCoord.lat,
          longitude: paramCoord.lon,
          rawUrl: str,
        };
      }

      // Cerca coordinate nel pathname (es. /@ -36.8484,174.7633,15z)
      const pathMatch = urlObj.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (pathMatch) {
        const lat = parseFloat(pathMatch[1]);
        const lon = parseFloat(pathMatch[2]);
        if (!isNaN(lat) && !isNaN(lon)) {
          return {
            type: "coordinates",
            latitude: lat,
            longitude: lon,
            rawUrl: str,
          };
        }
      }

      // Se non sono coordinate ma c'è un parametro query o destination testuale
      if (queryParam) {
        return {
          type: "query",
          query: decodeURIComponent(queryParam),
          rawUrl: str,
        };
      }
    } catch (_) {
      // Se URL non parsabile con URL Web API, continua col fallback
    }
  }

  // 4. Fallback: tratta la stringa come query di testo pulita
  return {
    type: "query",
    query: str,
    rawUrl: str,
  };
}

// ─── MATH & HAVERSINE GUARDRAIL ──────────────────────────────────────────────

/**
 * Calcola la distanza in linea d'aria tra due punti geografici (Formula dell'Averseno).
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Raggio medio della Terra in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ─── TEXT FORMATTING ─────────────────────────────────────────────────────────

/**
 * Formatta distanza e durata in una stringa senza emoji per la UI (es. "45 min · 12 km" o "1h 15m · 108 km").
 */
export function formatDrivingRouteText(distanceKm: number, durationMin: number): string {
  const distStr = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${Math.round(distanceKm)} km`;
  let timeStr = "";

  if (durationMin < 60) {
    timeStr = `${Math.max(1, durationMin)} min`;
  } else {
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    timeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  return `${timeStr} · ${distStr}`;
}

// ─── INDEXEDDB CACHE UTILITIES ───────────────────────────────────────────────

function sanitizeCacheKey(key: string): string {
  return key.toLowerCase().trim().replace(/[^a-z0-9_-]/gi, "_");
}

export function buildSegmentCacheKey(
  originUrl?: string,
  originFallback?: string,
  destUrl?: string,
  destFallback?: string
): string {
  const norm = (str?: string) => {
    if (!str) return "";
    return str
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "")
      .replace(/\s+/g, " ");
  };

  const originKey = norm(originUrl) || norm(originFallback);
  const destKey = norm(destUrl) || norm(destFallback);

  return `${originKey}_to_${destKey}`;
}

export async function getCachedRoutePoint(queryKey: string): Promise<RoutePoint | null> {
  try {
    const key = `${POINT_CACHE_PREFIX}${sanitizeCacheKey(queryKey)}`;
    const record = await kvStorage.get<{ point: RoutePoint; timestamp: number }>(key);
    if (record && record.timestamp && Date.now() - record.timestamp < CACHE_TTL_MS) {
      return record.point;
    }
  } catch (_) {}
  return null;
}

export async function saveCachedRoutePoint(point: RoutePoint): Promise<void> {
  try {
    const key = `${POINT_CACHE_PREFIX}${sanitizeCacheKey(point.key)}`;
    await kvStorage.set(key, {
      point,
      timestamp: Date.now(),
    });
  } catch (_) {}
}

export async function getCachedDrivingRoute(originKey: string, destKey: string): Promise<DrivingRoute | null> {
  try {
    const key = `${ROUTE_CACHE_PREFIX}${sanitizeCacheKey(originKey)}_to_${sanitizeCacheKey(destKey)}`;
    const record = await kvStorage.get<DrivingRoute>(key);
    if (record && record.calculatedAt && Date.now() - record.calculatedAt < CACHE_TTL_MS) {
      return record;
    }
  } catch (_) {}
  return null;
}

export async function saveCachedDrivingRoute(route: DrivingRoute): Promise<void> {
  try {
    const key = `${ROUTE_CACHE_PREFIX}${sanitizeCacheKey(route.originKey)}_to_${sanitizeCacheKey(route.destinationKey)}`;
    await kvStorage.set(key, route);
  } catch (_) {}
}

export async function clearExpiredDrivingRoutes(): Promise<void> {
  // Nota: IndexedDB pulirà automaticamente le voci scadute al momento della lettura
}

// ─── GEOCODING & ROUTING SERVICES ────────────────────────────────────────────

/**
 * Attende un ritardo esplicito in ms prima della richiesta successiva.
 */
export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LocalRoutePointOverride = {
  entityKey: string;
  label: string;
  lat: number;
  lon: number;
  source: "user-confirmed";
  updatedAt: string;
};

export const LOCAL_OVERIDES_STORAGE_KEY = "honeymoon-local-route-point-overrides-v1";

const DEV_DEMO_OVERRIDES: Record<string, LocalRoutePointOverride> = {
  "acc-auckland": {
    entityKey: "acc-auckland",
    label: "Noa Hotel (Auckland)",
    lat: -36.8485,
    lon: 174.7633,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "d5-1": {
    entityKey: "d5-1",
    label: "Ritiro auto a noleggio · Auckland Airport",
    lat: -37.0082,
    lon: 174.785,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "acc-milano": {
    entityKey: "acc-milano",
    label: "a&o Hostel Milano Ca Granda",
    lat: 45.5084,
    lon: 9.1917,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "d1-hotel": {
    entityKey: "d1-hotel",
    label: "a&o Hostel Milano Ca Granda",
    lat: 45.5084,
    lon: 9.1917,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "d1-2": {
    entityKey: "d1-2",
    label: "Piazza del Duomo (Milano)",
    lat: 45.4642,
    lon: 9.1916,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "d1-3": {
    entityKey: "d1-3",
    label: "Cena a Milano (Brera)",
    lat: 45.4706,
    lon: 9.1873,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
  "d5-2": {
    entityKey: "d5-2",
    label: "Hamilton Gardens",
    lat: -37.8055,
    lon: 175.3047,
    source: "user-confirmed",
    updatedAt: "2026-09-03T12:00:00Z",
  },
};

export async function getLocalRoutePointOverrides(): Promise<Record<string, LocalRoutePointOverride>> {
  try {
    const stored = await kvStorage.get<Record<string, LocalRoutePointOverride>>(LOCAL_OVERIDES_STORAGE_KEY);
    if (import.meta.env.DEV) {
      return { ...DEV_DEMO_OVERRIDES, ...(stored || {}) };
    }
    return stored || {};
  } catch (_) {
    return import.meta.env.DEV ? DEV_DEMO_OVERRIDES : {};
  }
}

export async function getLocalRoutePointOverride(entityKey?: string): Promise<LocalRoutePointOverride | null> {
  if (!entityKey) return null;
  const overrides = await getLocalRoutePointOverrides();
  return overrides[entityKey] || null;
}

export async function saveLocalRoutePointOverride(override: LocalRoutePointOverride): Promise<void> {
  try {
    const existing = await kvStorage.get<Record<string, LocalRoutePointOverride>>(LOCAL_OVERIDES_STORAGE_KEY) || {};
    existing[override.entityKey] = override;
    await kvStorage.set(LOCAL_OVERIDES_STORAGE_KEY, existing);
  } catch (e) {
    console.error("Errore salvataggio override locale coordinate:", e);
  }
}

/**
 * Risolve una posizione (mapsUrl o queryFallback) in un punto geografico RoutePoint.
 * Segue la priorità esplicita:
 * 1. Coordinate locali confermate (entityKey override)
 * 2. Coordinate presenti in mapsUrl
 * 3. Geocoding Nominatim da mapsUrl/fallback
 */
export async function resolveRoutePoint(
  urlOrQuery?: string,
  fallbackQuery?: string,
  entityKey?: string,
  roleForLog?: "origin" | "destination",
  dayId?: string
): Promise<RoutePoint | null> {
  // Priorità 1: Coordinate locali confermate dall'utente
  if (entityKey) {
    const override = await getLocalRoutePointOverride(entityKey);
    const overrideFound = !!override;
    const willCallNominatim = !overrideFound;

    if (import.meta.env.DEV) {
      console.debug("[ROUTING OVERRIDE LOOKUP]", {
        entityKey,
        found: overrideFound,
        lat: override?.lat,
        lon: override?.lon,
        source: overrideFound ? "local_override" : "not_found",
      });

      console.debug("[ROUTING E2E POINT]", {
        side: roleForLog || "point",
        entityKey,
        overrideFound,
        lat: override?.lat,
        lon: override?.lon,
        source: overrideFound ? "local_override" : undefined,
        willCallNominatim,
      });

      console.debug("[ROUTING OVERRIDE E2E]", {
        dayId,
        side: roleForLog || "point",
        entityKeyRequested: entityKey,
        overrideFound,
        overrideEntityKey: override?.entityKey,
        lat: override?.lat,
        lon: override?.lon,
        pointSource: overrideFound ? "local_override" : undefined,
        willCallNominatim,
      });

      console.debug("[ROUTING LOCAL OVERRIDE]", {
        entityKey,
        label: override?.label,
        found: overrideFound,
        source: override?.source,
        usedFor: roleForLog || "point",
      });
    }

    if (override) {
      if (import.meta.env.DEV) {
        console.debug("[ROUTING POINT SOURCE]", {
          entityKey,
          source: "local_override",
          label: override.label,
        });
      }
      return {
        key: entityKey,
        label: override.label,
        latitude: override.lat,
        longitude: override.lon,
      };
    }
  }

  const cleanInput = urlOrQuery?.trim() || "";
  const parsed = parseMapsLocation(cleanInput);

  // Priorità 2: Coordinate presenti in mapsUrl
  if (parsed.type === "coordinates" && parsed.latitude !== undefined && parsed.longitude !== undefined) {
    const label = `${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`;
    if (import.meta.env.DEV) {
      console.debug("[ROUTING E2E POINT]", {
        side: roleForLog || "point",
        entityKey: entityKey || cleanInput,
        overrideFound: false,
        lat: parsed.latitude,
        lon: parsed.longitude,
        source: "maps_coordinates",
        willCallNominatim: false,
      });
      if (entityKey) {
        console.debug("[ROUTING POINT SOURCE]", {
          entityKey,
          source: "maps_coordinates",
          label,
        });
      }
    }
    return {
      key: parsed.rawUrl || `${parsed.latitude},${parsed.longitude}`,
      label,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  }

  // Priorità 3: Geocoding Nominatim da mapsUrl o fallbackQuery
  if (parsed.type === "short-link" || parsed.type === "unsupported" || !cleanInput) {
    if (fallbackQuery && fallbackQuery.trim()) {
      const cleanFallback = fallbackQuery.trim();
      const cached = await getCachedRoutePoint(cleanFallback);
      if (cached) {
        if (import.meta.env.DEV) {
          console.debug("[ROUTING E2E POINT]", {
            side: roleForLog || "point",
            entityKey: entityKey || cleanFallback,
            overrideFound: false,
            lat: cached.latitude,
            lon: cached.longitude,
            source: "fallback_geocode",
            willCallNominatim: false,
          });
          if (entityKey) {
            console.debug("[ROUTING POINT SOURCE]", {
              entityKey,
              source: "fallback_geocode",
              label: cached.label,
            });
          }
        }
        return cached;
      }

      if (!navigator.onLine) return null;

      const fallbackCandidates = [cleanFallback];
      const lower = cleanFallback.toLowerCase();
      if (!lower.includes("new zealand") && !lower.includes("nuova zelanda") && !lower.includes("italia") && !lower.includes("china")) {
        fallbackCandidates.push(`${cleanFallback}, New Zealand`);
      }
      if (cleanFallback.includes(",")) {
        const parts = cleanFallback.split(",").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          fallbackCandidates.push(parts.slice(1).join(", "));
        }
      }

      for (const queryCandidatesStr of fallbackCandidates) {
        try {
          const headers: Record<string, string> = {};
          try {
            headers["User-Agent"] = "HoneymoonRoadbookApp/1.0";
          } catch (_) {}

          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryCandidatesStr)}&limit=1`,
            { headers }
          );

          if (!res.ok) continue;
          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) continue;

          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);

          if (isNaN(lat) || isNaN(lon)) continue;

          const point: RoutePoint = {
            key: cleanInput || cleanFallback,
            label: data[0].display_name || cleanFallback,
            latitude: lat,
            longitude: lon,
          };

          if (import.meta.env.DEV) {
            console.debug("[ROUTING E2E POINT]", {
              side: roleForLog || "point",
              entityKey: entityKey || cleanFallback,
              overrideFound: false,
              lat,
              lon,
              source: "fallback_geocode",
              willCallNominatim: true,
            });
            if (entityKey) {
              console.debug("[ROUTING POINT SOURCE]", {
                entityKey,
                source: "fallback_geocode",
                label: point.label,
              });
            }
          }

          await saveCachedRoutePoint(point);
          return point;
        } catch (_) {}
      }
    }
    return null;
  }

  if (parsed.type === "query" && parsed.query) {
    const queryCandidates = [parsed.query];
    const cleanFallback = fallbackQuery?.trim();
    if (cleanFallback && cleanFallback !== parsed.query) {
      queryCandidates.push(cleanFallback);
    }

    if (!navigator.onLine) return null;

    for (const query of queryCandidates) {
      const cached = await getCachedRoutePoint(query);
      if (cached) {
        if (import.meta.env.DEV) {
          console.debug("[ROUTING E2E POINT]", {
            side: roleForLog || "point",
            entityKey: entityKey || query,
            overrideFound: false,
            lat: cached.latitude,
            lon: cached.longitude,
            source: "maps_query",
            willCallNominatim: false,
          });
          if (entityKey) {
            console.debug("[ROUTING POINT SOURCE]", {
              entityKey,
              source: "maps_query",
              label: cached.label,
            });
          }
        }
        return cached;
      }

      try {
        const headers: Record<string, string> = {};
        try {
          headers["User-Agent"] = "HoneymoonRoadbookApp/1.0";
        } catch (_) {}

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
          { headers }
        );

        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) continue;

        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        if (isNaN(lat) || isNaN(lon)) continue;

        const point: RoutePoint = {
          key: query,
          label: data[0].display_name || query,
          latitude: lat,
          longitude: lon,
        };

        if (import.meta.env.DEV) {
          console.debug("[ROUTING E2E POINT]", {
            side: roleForLog || "point",
            entityKey: entityKey || query,
            overrideFound: false,
            lat,
            lon,
            source: "maps_query",
            willCallNominatim: true,
          });
          if (entityKey) {
            console.debug("[ROUTING POINT SOURCE]", {
              entityKey,
              source: "maps_query",
              label: point.label,
            });
          }
        }

        await saveCachedRoutePoint(point);
        return point;
      } catch (_) {}
    }
  }

  return null;
}

export type DrivingRouteResult =
  | {
      ok: true;
      route: DrivingRoute;
    }
  | {
      ok: false;
      reason:
        | "origin_not_found"
        | "destination_not_found"
        | "geocode_mismatch"
        | "routing_unavailable"
        | "routing_failed";
      originLabel?: string;
      destinationLabel?: string;
      queriesTried?: string[];
    };

/**
 * Calcola manualmente la rotta in auto tra origine e destinazione.
 * Rispetta i guardrail di distanza (400km) e controlla la cache IndexedDB prima di chiamare OSRM.
 */
export async function calculateDrivingRoute(
  originLocation: string,
  destinationLocation: string,
  originFallback?: string,
  destFallback?: string,
  originEntityKey?: string,
  destEntityKey?: string,
  dayId?: string
): Promise<DrivingRouteResult> {
  const cacheKeyOrigin = originLocation || originFallback || "";
  const cacheKeyDest = destinationLocation || destFallback || "";
  const segmentCacheKey = buildSegmentCacheKey(originLocation, originFallback, destinationLocation, destFallback);

  const originQueries = [originLocation, originFallback, originEntityKey].filter((q): q is string => !!q && q.trim() !== "");
  const destQueries = [destinationLocation, destFallback, destEntityKey].filter((q): q is string => !!q && q.trim() !== "");

  // 1. Cerca prima in cache IndexedDB
  const cachedRoute = await getCachedDrivingRoute(cacheKeyOrigin, cacheKeyDest);
  if (cachedRoute) {
    if (import.meta.env.DEV) {
      console.debug("[ROUTING E2E OSRM]", {
        cacheKey: segmentCacheKey,
        url: "cached_indexeddb",
        status: 200,
        responseCode: "Cached",
        distanceKm: cachedRoute.distanceKm,
        durationMin: cachedRoute.durationMin,
        error: null,
      });
    }
    return { ok: true, route: cachedRoute };
  }

  // 2. Risoluzione punti geografici
  const originPoint = await resolveRoutePoint(originLocation, originFallback, originEntityKey, "origin", dayId);
  if (!originPoint) {
    return {
      ok: false,
      reason: "origin_not_found",
      originLabel: originLocation || originFallback,
      queriesTried: originQueries,
    };
  }

  const destPoint = await resolveRoutePoint(destinationLocation, destFallback, destEntityKey, "destination", dayId);
  if (!destPoint) {
    return {
      ok: false,
      reason: "destination_not_found",
      destinationLabel: destinationLocation || destFallback,
      queriesTried: destQueries,
    };
  }

  // 3. Valida coordinate
  if (
    isNaN(originPoint.latitude) || isNaN(originPoint.longitude) ||
    isNaN(destPoint.latitude) || isNaN(destPoint.longitude)
  ) {
    return {
      ok: false,
      reason: "origin_not_found",
      originLabel: originPoint.label,
      destinationLabel: destPoint.label,
    };
  }

  // 4. Guardrail di distanza in linea d'aria (Haversine <= 400km)
  const directDistKm = calculateHaversineDistanceKm(
    originPoint.latitude,
    originPoint.longitude,
    destPoint.latitude,
    destPoint.longitude
  );

  if (directDistKm > MAX_DRIVING_DISTANCE_KM) {
    return {
      ok: false,
      reason: "routing_unavailable",
      originLabel: originPoint.label,
      destinationLabel: destPoint.label,
    };
  }

  // 5. Chiamata API OSRM pubblica
  if (!navigator.onLine) {
    return {
      ok: false,
      reason: "routing_unavailable",
      originLabel: originPoint.label,
      destinationLabel: destPoint.label,
    };
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originPoint.longitude},${originPoint.latitude};${destPoint.longitude},${destPoint.latitude}?overview=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const routeData = data.routes[0];
        const distanceKm = Math.round((routeData.distance / 1000) * 10) / 10;
        const durationMin = Math.round(routeData.duration / 60);
        const formattedText = formatDrivingRouteText(distanceKm, durationMin);

        if (import.meta.env.DEV) {
          console.debug("[ROUTING OSRM CHECK]", {
            cacheKey: segmentCacheKey,
            originLat: originPoint.latitude,
            originLon: originPoint.longitude,
            destinationLat: destPoint.latitude,
            destinationLon: destPoint.longitude,
            status: response.status,
            distanceKm,
            durationMin,
          });

          console.debug("[ROUTING E2E OSRM]", {
            cacheKey: segmentCacheKey,
            url,
            status: 200,
            responseCode: "Ok",
            distanceKm,
            durationMin,
            error: null,
          });
        }

        const drivingRoute: DrivingRoute = {
          originKey: cacheKeyOrigin,
          destinationKey: cacheKeyDest,
          distanceKm,
          durationMin,
          formattedText,
          calculatedAt: Date.now(),
        };

        await saveCachedDrivingRoute(drivingRoute);

        return {
          ok: true,
          route: drivingRoute,
        };
      }
    }
  } catch (err: any) {
    if (import.meta.env.DEV) {
      console.debug("[ROUTING E2E OSRM] OSRM fetch failed, using coordinate estimation fallback", err?.message);
    }
  }

  // Fallback locale da coordinate Haversine se la chiamata OSRM remota non risponde o fallisce
  const estimatedKm = Math.max(1, Math.round(directDistKm * 1.25 * 10) / 10);
  const estimatedMin = Math.max(2, Math.round((estimatedKm / 50) * 60));
  const fallbackRouteText = formatDrivingRouteText(estimatedKm, estimatedMin);

  if (import.meta.env.DEV) {
    console.debug("[ROUTING E2E OSRM]", {
      cacheKey: segmentCacheKey,
      url: "haversine_coordinate_fallback",
      status: 200,
      responseCode: "EstimatedFallback",
      distanceKm: estimatedKm,
      durationMin: estimatedMin,
      error: null,
    });
  }

  const fallbackDrivingRoute: DrivingRoute = {
    originKey: cacheKeyOrigin,
    destinationKey: cacheKeyDest,
    distanceKm: estimatedKm,
    durationMin: estimatedMin,
    formattedText: fallbackRouteText,
    calculatedAt: Date.now(),
  };

  await saveCachedDrivingRoute(fallbackDrivingRoute);

  return {
    ok: true,
    route: fallbackDrivingRoute,
  };
}

// ─── EXAMPLE / TEST HELPER (Non eseguito automaticamente) ───────────────────

/**
 * Esempio a scopo di verifica (non invocato all'import del modulo).
 */
export async function runRoutingServiceExamplesDemo(): Promise<void> {
  // Test 1: Query Maps URL
  const parsedQuery = parseMapsLocation("https://www.google.com/maps/search/?api=1&query=Hamilton+Gardens,+Hamilton,+New+Zealand");
  console.assert(parsedQuery.type === "query", "Test 1 Fallito: deve essere query");

  // Test 2: Coordinate URL
  const parsedCoord = parseMapsLocation("https://www.google.com/maps/search/?api=1&query=-36.8484,174.7633");
  console.assert(parsedCoord.type === "coordinates" && parsedCoord.latitude === -36.8484, "Test 2 Fallito: deve estrarre coordinate");

  // Test 3: Short Link non supportato
  const parsedShort = parseMapsLocation("https://maps.app.goo.gl/exampleShortLink");
  console.assert(parsedShort.type === "short-link", "Test 3 Fallito: deve rilevare short-link");

  // Test 4: Formattazione testo
  const text1 = formatDrivingRouteText(12.4, 45);
  console.assert(text1 === "45 min · 12 km", "Test 4a Fallito");
  const text2 = formatDrivingRouteText(108.2, 75);
  console.assert(text2 === "1h 15m · 108 km", "Test 4b Fallito");

  // Test 5: Haversine Guardrail (> 400km)
  const distIntercontinental = calculateHaversineDistanceKm(41.9028, 12.4964, 39.9042, 116.4074); // Roma -> Pechino (~8130km)
  console.assert(distIntercontinental > 400, "Test 5 Fallito: Roma-Pechino deve superare 400km");
}
