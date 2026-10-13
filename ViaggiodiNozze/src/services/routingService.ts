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
 * Tabella statica coordinate note per tappe e città del viaggio (Nuova Zelanda, Australia, Filippine, Italia).
 * Garantisce il calcolo anche se offline, senza API key o con quota esaurita.
 */
export const KNOWN_COORDINATES: Record<string, Coordinate> = {
  // Aeroporti e Città Nuova Zelanda
  auckland: { lat: -36.8485, lng: 174.7633 },
  akl: { lat: -37.0082, lng: 174.7850 }, // Aeroporto di Auckland
  rotorua: { lat: -38.1368, lng: 176.2497 },
  taupo: { lat: -38.6857, lng: 176.0702 },
  tongariro: { lat: -39.2906, lng: 175.5626 },
  wellington: { lat: -41.2865, lng: 174.7762 },
  wlg: { lat: -41.3276, lng: 174.8076 }, // Aeroporto di Wellington
  picton: { lat: -41.2931, lng: 174.0041 },
  abel_tasman: { lat: -40.9419, lng: 173.0189 },
  kaiteriteri: { lat: -41.0378, lng: 173.0177 },
  punakaiki: { lat: -42.1158, lng: 171.3325 },
  franz_josef: { lat: -43.3887, lng: 170.1834 },
  fox_glacier: { lat: -43.4646, lng: 170.0182 },
  wanaka: { lat: -44.7032, lng: 169.1321 },
  queenstown: { lat: -45.0312, lng: 168.6626 },
  zqn: { lat: -45.0216, lng: 168.7392 }, // Aeroporto Queenstown
  milford_sound: { lat: -44.6718, lng: 167.9256 },
  te_anau: { lat: -45.4145, lng: 167.7176 },
  lake_tekapo: { lat: -44.0047, lng: 170.4771 },
  mount_cook: { lat: -43.7342, lng: 170.0963 },
  christchurch: { lat: -43.5321, lng: 172.6362 },
  chc: { lat: -43.4894, lng: 172.5322 }, // Aeroporto Christchurch
  kaikoura: { lat: -42.4008, lng: 173.6814 },

  // Aeroporti e Città Australia
  adelaide: { lat: -34.9285, lng: 138.6007 },
  adl: { lat: -34.9450, lng: 138.5306 }, // Aeroporto Adelaide
  kangaroo_island: { lat: -35.7752, lng: 137.2142 },
  penneshaw: { lat: -35.7197, lng: 137.9406 },
  kingscote: { lat: -35.6558, lng: 137.6402 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
  mel: { lat: -37.6690, lng: 144.8410 }, // Aeroporto Melbourne
  sydney: { lat: -33.8688, lng: 151.2093 },
  syd: { lat: -33.9399, lng: 151.1753 }, // Aeroporto Sydney

  // Filippine
  manila: { lat: 14.5995, lng: 120.9842 },
  mnl: { lat: 14.5086, lng: 121.0194 }, // Ninoy Aquino International Airport
  boracay: { lat: 11.9674, lng: 121.9248 },
  caticlan: { lat: 11.9298, lng: 121.9532 },
  mph: { lat: 11.9298, lng: 121.9532 }, // Godofredo P. Ramos Airport Caticlan
  el_nido: { lat: 11.1804, lng: 119.3879 },
  eni: { lat: 11.2008, lng: 119.4167 }, // El Nido Airport (Lio)
  coron: { lat: 12.0006, lng: 120.2057 },
  busuanga: { lat: 12.1214, lng: 120.1003 },
  usu: { lat: 12.1214, lng: 120.1003 }, // Busuanga Airport
  cebu: { lat: 10.3157, lng: 123.8854 },
  ceb: { lat: 10.3075, lng: 123.9794 }, // Mactan-Cebu International Airport
  bohol: { lat: 9.8500, lng: 124.1435 },
  panglao: { lat: 9.5786, lng: 123.7744 },
  tag: { lat: 9.5786, lng: 123.7744 }, // Bohol-Panglao Airport
  siargao: { lat: 9.8576, lng: 126.0469 },
  iaq: { lat: 9.8589, lng: 126.0133 }, // Sayak Airport Siargao

  // Hub e Italia / Milano specifico
  pechino: { lat: 40.0799, lng: 116.6031 },
  pek: { lat: 40.0799, lng: 116.6031 }, // Aeroporto Pechino Capitale
  mutianyu: { lat: 40.4319, lng: 116.5704 },
  tiananmen: { lat: 39.9055, lng: 116.3976 },
  milano: { lat: 45.4642, lng: 9.1900 },
  duomo: { lat: 45.4641, lng: 9.1896 }, // Piazza del Duomo, Milano
  novecento: { lat: 45.4637, lng: 9.1905 }, // Museo del Novecento, Piazza del Duomo 8
  navigli: { lat: 45.4514, lng: 9.1725 },
  gherardini: { lat: 45.4765, lng: 9.1685 }, // Via Gherardini 1, Milano (Arco della Pace / Sempione)
  starita: { lat: 45.4765, lng: 9.1685 }, // Starita Milano, Via Gherardini 1
  arco_della_pace: { lat: 45.4758, lng: 9.1718 },
  sempione: { lat: 45.4758, lng: 9.1718 },
  suzzani: { lat: 45.5085, lng: 9.2045 }, // Viale Suzzani 13/15, Bicocca, Milano (a&o Hostel)
  bicocca: { lat: 45.5085, lng: 9.2045 },
  ao_hostel: { lat: 45.5085, lng: 9.2045 }, // a&o Hostel Milano Ca' Granda
  malpensa: { lat: 45.6301, lng: 8.7255 }, // Aeroporto Malpensa
  mxp: { lat: 45.6301, lng: 8.7255 }, // Milano Malpensa
  roma: { lat: 41.9028, lng: 12.4964 },
  fco: { lat: 41.8003, lng: 12.2389 }, // Roma Fiumicino

  // Nuova Zelanda POI aggiuntivi
  waitomo: { lat: -38.2612, lng: 175.1186 },
  hobbiton: { lat: -37.8721, lng: 175.6829 },
  matamata: { lat: -37.8093, lng: 175.7725 },
  waiotapu: { lat: -38.3582, lng: 176.3683 },
  whakarewarewa: { lat: -38.1636, lng: 176.2575 },
  te_puia: { lat: -38.1604, lng: 176.2527 },
  te_pa_tu: { lat: -38.1368, lng: 176.2497 },
  hokitika: { lat: -42.7167, lng: 170.9667 },
  haast: { lat: -43.8810, lng: 169.0422 },
  arrowtown: { lat: -44.9426, lng: 168.8285 },
  glenorchy: { lat: -44.8507, lng: 168.3887 },
  moeraki: { lat: -45.3614, lng: 170.8497 },
  dunedin: { lat: -45.8788, lng: 170.5028 },
  akaroa: { lat: -43.8037, lng: 172.9683 },
  hanmer_springs: { lat: -42.5230, lng: 172.8277 },
  tirau: { lat: -37.9792, lng: 175.7601 },
  putaruru: { lat: -38.0531, lng: 175.7797 },
  blue_spring: { lat: -38.0531, lng: 175.7797 },
  national_park: { lat: -39.1764, lng: 175.3989 },
  mount_victoria: { lat: -41.2965, lng: 174.7944 },
  arthurs_pass: { lat: -42.9414, lng: 171.5628 },
  castle_hill: { lat: -43.2289, lng: 171.7169 },
  otira: { lat: -42.8333, lng: 171.5500 },
  crown_range: { lat: -44.9833, lng: 168.9333 },
  mirror_lakes: { lat: -44.9758, lng: 168.0125 },
  the_chasm: { lat: -44.7194, lng: 167.9542 },
  pops_view: { lat: -44.8361, lng: 168.1139 },
  kawarau: { lat: -45.0069, lng: 168.9000 },
  gibbston: { lat: -45.0167, lng: 168.9500 },
  lindis_pass: { lat: -44.5917, lng: 169.6417 },
  rakaia: { lat: -43.7500, lng: 172.0167 },
  te_anga: { lat: -38.2500, lng: 174.9667 },
  marokopa: { lat: -38.3000, lng: 174.8500 },

  // Australia POI aggiuntivi
  barossa: { lat: -34.5333, lng: 138.9500 },
  yarra: { lat: -37.7500, lng: 145.4167 },
  blue_mountains: { lat: -33.7150, lng: 150.3120 },
  katoomba: { lat: -33.7126, lng: 150.3119 },
  wirrina_cove: { lat: -35.5000, lng: 138.2500 },
  cape_jervis: { lat: -35.6067, lng: 138.0967 },
  vivonne_bay: { lat: -35.9833, lng: 137.1833 },
  flinders_chase: { lat: -35.9500, lng: 136.7167 },
  remarkable_rocks: { lat: -36.0500, lng: 136.7547 },
  admirals_arch: { lat: -36.0667, lng: 136.7028 },
  marleston: { lat: -34.9450, lng: 138.5600 },
  tullamarine: { lat: -37.7000, lng: 144.8833 },
  torquay: { lat: -38.3333, lng: 144.3167 },
  bells_beach: { lat: -38.3694, lng: 144.2819 },
  anglesea: { lat: -38.4167, lng: 144.1833 },
  split_point: { lat: -38.4681, lng: 144.1022 },
  teddys_lookout: { lat: -38.5417, lng: 143.9750 },
  lorne: { lat: -38.5417, lng: 143.9750 },
  kennett_river: { lat: -38.6667, lng: 143.8667 },
  apollo_bay: { lat: -38.7586, lng: 143.6694 },
  cape_otway: { lat: -38.8583, lng: 143.5139 },
  princetown: { lat: -38.6944, lng: 143.1556 },
  gibson_steps: { lat: -38.6694, lng: 143.1111 },
  twelve_apostles: { lat: -38.6644, lng: 143.1044 },
  apostoli: { lat: -38.6644, lng: 143.1044 },
  port_campbell: { lat: -38.6167, lng: 142.9833 },
  loch_ard: { lat: -38.6472, lng: 143.0694 },
  st_kilda: { lat: -37.8681, lng: 144.9750 },
  wilsons_promontory: { lat: -39.0292, lng: 146.3278 },
  squeaky_beach: { lat: -39.0167, lng: 146.3000 },
  tidal_river: { lat: -39.0306, lng: 146.3236 },
  lakes_entrance: { lat: -37.8767, lng: 147.9817 },
  orbost: { lat: -37.7000, lng: 148.4500 },
  eden: { lat: -37.0667, lng: 149.9000 },
  narooma: { lat: -36.2167, lng: 150.1333 },
  central_tilba: { lat: -36.2972, lng: 150.0764 },
  pebbly_beach: { lat: -35.6083, lng: 150.3278 },
  murramarang: { lat: -35.6083, lng: 150.3278 },
  jervis_bay: { lat: -35.0500, lng: 150.7000 },
  hyams_beach: { lat: -35.1000, lng: 150.6833 },
  chinamans_beach: { lat: -35.1167, lng: 150.6833 },
  harbour_bridge: { lat: -33.8522, lng: 151.2106 },
  the_rocks: { lat: -33.8594, lng: 151.2092 },
  macquaries_chair: { lat: -33.8597, lng: 151.2222 },
  manly: { lat: -33.7997, lng: 151.2844 },
  shelly_beach: { lat: -33.8039, lng: 151.2942 },
  banksmeadow: { lat: -33.9500, lng: 151.2167 }
};

/**
 * Cerca una coordinata statica partendo da un testo / nome tappa
 */
export function lookupKnownCoordinate(text: string): Coordinate | null {
  if (!text) return null;
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  // 1. Priorità assoluta: specifici toponimi/vie/piazze prima dei nomi generici di città (es. 'suzzani', 'starita', 'duomo' prima di 'milano')
  const specificMilanoKeys = ['suzzani', 'bicocca', 'ao_hostel', 'gherardini', 'starita', 'novecento', 'duomo', 'arco_della_pace', 'sempione', 'malpensa', 'mxp'];
  for (const key of specificMilanoKeys) {
    if (clean.includes(key.replace(/_/g, ' ')) || words.includes(key)) {
      return KNOWN_COORDINATES[key];
    }
  }

  // 2. Match esatto con una delle parole
  for (const w of words) {
    if (KNOWN_COORDINATES[w]) {
      return KNOWN_COORDINATES[w];
    }
  }

  // 3. Match parziale o sottostringa per nomi composti (es. 'queenstown', 'milford sound', 'lake tekapo')
  for (const [key, coord] of Object.entries(KNOWN_COORDINATES)) {
    if (key.length <= 3) continue; // evita falsi positivi con codici IATA corti in substring
    const keySpaced = key.replace(/_/g, ' ');
    if (clean.includes(keySpaced)) {
      return coord;
    }
  }
  return null;
}

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
