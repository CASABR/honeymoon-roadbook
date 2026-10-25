import type { Coordinate } from '../types';

export interface GeolocationState {
  coords: Coordinate;
  accuracy: number;
  city: string;
  country: string;
  countryCode: string;
  displayName: string;
  timeZone?: string;
  updatedAt: string; // ISO string o timestamp
  isLiveGps: boolean;
}

const STORAGE_KEY = 'live_current_location';

/**
 * Mappatura ISO country code (alpha-2) in bandiera emoji
 */
export function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return '📍';
  const code = countryCode.toUpperCase();
  const codePoints = [...code].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Mappatura IANA timezone approssimata da coordinate/paese come fallback se Intl non è disponibile
 */
export function getTimezoneFromCoordinates(lat: number, lng: number, countryCode?: string): string {
  const code = countryCode?.toLowerCase();

  // Nuova Zelanda
  if (code === 'nz' || (lat < -33 && lat > -48 && lng > 165 && lng < 180)) {
    return 'Pacific/Auckland';
  }

  // Filippine
  if (code === 'ph' || (lat > 4 && lat < 21 && lng > 116 && lng < 127)) {
    return 'Asia/Manila';
  }

  // Australia
  if (code === 'au' || (lat < -10 && lat > -45 && lng > 112 && lng < 155)) {
    if (lng > 146) return 'Australia/Sydney'; // NSW, VIC, QLD
    if (lng > 136 && lng <= 146) return 'Australia/Melbourne';
    if (lng > 129 && lng <= 136) return 'Australia/Adelaide'; // SA
    return 'Australia/Perth';
  }

  // Cina
  if (code === 'cn' || (lat > 18 && lat < 54 && lng > 73 && lng < 135)) {
    return 'Asia/Shanghai';
  }

  // Italia
  if (code === 'it' || (lat > 35 && lat < 48 && lng > 6 && lng < 19)) {
    return 'Europe/Rome';
  }

  // Se l'utente è fisicamente sul posto, usa la timezone IANA del browser
  try {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localTz) return localTz;
  } catch {
    // fallback
  }

  return 'Pacific/Auckland';
}

/**
 * Reverse Geocoding via Nominatim OpenStreetMap (con Accept-Language it)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string;
  country: string;
  countryCode: string;
  displayName: string;
}> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'it',
        'User-Agent': 'HoneymoonRoadbook/1.0'
      }
    });

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.county ||
      '';

    const country = addr.country || '';
    const countryCode = (addr.country_code || '').toLowerCase();
    
    // Costruisce un nome elegante e leggibile
    let displayName = '';
    if (city && country) {
      displayName = `${city}, ${country}`;
    } else if (data.display_name) {
      // Estrai le prime 2 componenti
      const parts = data.display_name.split(',').map((s: string) => s.trim());
      displayName = parts.slice(0, 2).join(', ');
    } else {
      displayName = country || 'Posizione rilevata';
    }

    return {
      city,
      country,
      countryCode,
      displayName
    };
  } catch (err) {
    console.warn('[geolocationService] Errore reverse geocoding OSM, fallback:', err);
    return {
      city: '',
      country: '',
      countryCode: '',
      displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    };
  }
}

/**
 * Acquisisce la posizione GPS reale dal dispositivo del browser
 */
export function getCurrentDevicePosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocalizzazione non supportata dal browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      options || {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
}

let inMemoryLiveLocation: GeolocationState | null = null;

/**
 * Legge l'ultima posizione GPS reale salvata (controlla localStorage, poi sessionStorage, poi memoria)
 */
export function getSavedLiveLocation(): GeolocationState | null {
  if (typeof window === 'undefined') return inMemoryLiveLocation;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return inMemoryLiveLocation;
    return JSON.parse(raw) as GeolocationState;
  } catch {
    return inMemoryLiveLocation;
  }
}

/**
 * Salva in modo sicuro le coordinate GPS gestendo QuotaExceededError:
 * - NON tocca MAI fotografie ('hounigo_live_gallery'), note utente, documenti o credenziali.
 * - Distingue cache temporanee rigenerabili da contenuti non recuperabili.
 * - In caso di quota satura, effettua fallback su sessionStorage e cache in-memory
 *   senza bloccare il GPS e senza alcuna perdita silenziosa di dati utente.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === 'undefined') {
    if (key === STORAGE_KEY) {
      try { inMemoryLiveLocation = JSON.parse(value); } catch {}
    }
    return true;
  }

  // Memorizza sempre anche in memoria come fallback immediato
  if (key === STORAGE_KEY) {
    try { inMemoryLiveLocation = JSON.parse(value); } catch {}
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    const isQuota = err?.name === 'QuotaExceededError' ||
                    err?.code === 22 ||
                    err?.number === -2147024882 ||
                    String(err?.message || '').toLowerCase().includes('quota');

    if (isQuota) {
      console.warn(`[geolocationService] Quota storage superata per "${key}". Attivazione fallback sicuro senza cancellazione dati utente.`);

      // Pulizia selettiva SOLO di cache temporanee puramente rigenerabili.
      // Dati utente IRREVERSIBILI (hounigo_live_gallery, documenti, note, config) sono RIGOROSAMENTE ESCLUSI.
      const purelyRegenerableCaches = ['osm_reverse_geocode_cache', 'temp_weather_cache', 'temp_route_cache'];
      for (const cacheKey of purelyRegenerableCaches) {
        try {
          localStorage.removeItem(cacheKey);
        } catch {}
      }

      // Ritenta salvataggio in localStorage
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        // Fallback su sessionStorage per non perdere lo stato durante la sessione corrente
        try {
          sessionStorage.setItem(key, value);
        } catch {}

        // Notifica non bloccante via CustomEvent per la UI
        try {
          window.dispatchEvent(new CustomEvent('hounigo:storage-quota-warning', {
            detail: {
              key,
              message: 'Spazio storage locale esaurito. Le coordinate GPS sono mantenute in sessione senza perdita di dati.'
            }
          }));
        } catch {}

        // Il salvataggio in sessione/memoria è avvenuto: non blocchiamo il GPS
        return true;
      }
    }
    return false;
  }
}

/**
 * Rileva la posizione GPS reale, esegue reverse geocoding e salva su localStorage
 */
export async function updateRealLocation(options?: PositionOptions): Promise<GeolocationState> {
  const pos = await getCurrentDevicePosition(options);
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const accuracy = pos.coords.accuracy;

  const geo = await reverseGeocode(lat, lng);
  const timeZone = getTimezoneFromCoordinates(lat, lng, geo.countryCode);

  const state: GeolocationState = {
    coords: { lat, lng },
    accuracy,
    city: geo.city,
    country: geo.country,
    countryCode: geo.countryCode,
    displayName: geo.displayName,
    timeZone,
    updatedAt: new Date().toISOString(),
    isLiveGps: true
  };

  if (typeof window !== 'undefined') {
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(state));
  }

  return state;
}

