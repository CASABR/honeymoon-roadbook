import type { Trasporto, Coordinate } from '../types';
import { lookupKnownCoordinate } from './geoCoordinatesHelper';

/**
 * Controlla se la stringa fornita corrisponde a un URL Google Maps
 */
export function isGoogleMapsUrl(input?: string): boolean {
  if (!input || !input.trim()) return false;
  return /https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input.trim());
}

/**
 * Riconosce se un URL Google Maps è un percorso/itinerario con indicazioni (Directions)
 */
export function isGoogleMapsDirectionsUrl(input?: string): boolean {
  if (!input || !input.trim()) return false;
  const str = input.trim();
  return isGoogleMapsUrl(str) && (
    /\/dir\//i.test(str) ||
    /[?&]api=1&origin=/i.test(str) ||
    /[?&]destination=/i.test(str)
  );
}

/**
 * Separa un URL Google Maps dal testo/indirizzo leggibile ed estrae eventuali origine e destinazione da percorsi Directions
 */
export function extractMapsUrlFromText(rawText?: string): {
  cleanText: string;
  mapsUrl?: string;
  isRoute: boolean;
  origin?: string;
  destination?: string;
} {
  if (!rawText || !rawText.trim()) {
    return { cleanText: '', isRoute: false };
  }

  const urlMatch = rawText.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) {
    return { cleanText: rawText.trim(), isRoute: false };
  }

  const matchedUrl = urlMatch[0];
  const remaining = rawText.replace(matchedUrl, '').replace(/\s+/g, ' ').trim();
  const isRoute = isGoogleMapsDirectionsUrl(matchedUrl);

  let origin: string | undefined;
  let destination: string | undefined;

  if (isRoute) {
    // Esempio: /dir/Bridge+of+Remembrance/New+Regent+Street
    const dirMatch = matchedUrl.match(/\/dir\/([^/]+)\/([^/?#]+)/i);
    if (dirMatch) {
      try {
        origin = decodeURIComponent(dirMatch[1].replace(/\+/g, ' '));
        destination = decodeURIComponent(dirMatch[2].replace(/\+/g, ' '));
      } catch {}
    } else {
      try {
        const urlObj = new URL(matchedUrl);
        const origParam = urlObj.searchParams.get('origin');
        const destParam = urlObj.searchParams.get('destination');
        if (origParam) origin = origParam;
        if (destParam) destination = destParam;
      } catch {}
    }
  }

  const cleanText = remaining || (isRoute ? 'Percorso a piedi' : '');

  return {
    cleanText,
    mapsUrl: matchedUrl,
    isRoute,
    origin,
    destination
  };
}

/**
 * Risolve un input (che può essere un URL Maps diretto o un indirizzo/testo) nel corretto URL Google Maps.
 * - Se è già un link web (http:// o https://, es. https://maps.app.goo.gl/... o https://www.google.com/maps/...), lo preserva intatto.
 * - Se è una stringa/indirizzo testuale, costruisce la search query corretta per Google Maps.
 */
export function resolveMapUrl(input?: string, travelmode?: 'driving' | 'walking' | 'bicycling' | 'transit'): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();

  // Se è già un URL completo (es. maps.app.goo.gl o google.com/maps o http/https)
  if (/^https?:\/\//i.test(trimmed)) {
    if (travelmode && !trimmed.includes('travelmode=')) {
      const sep = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${sep}travelmode=${travelmode}`;
    }
    return trimmed;
  }

  // Altrimenti genera la query di ricerca codificata
  const cleanQuery = trimmed.replace(/\s+/g, ' ');
  const modeParam = travelmode ? `&travelmode=${travelmode}` : '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}${modeParam}`;
}

/**
 * Alias retrocompatibile per resolveMapUrl
 */
export function getGoogleMapsUrl(query: string): string {
  return resolveMapUrl(query);
}

export function isValidCoordinate(coord?: Coordinate | null): coord is Coordinate {
  return Boolean(
    coord &&
    typeof coord.lat === 'number' &&
    typeof coord.lng === 'number' &&
    Number.isFinite(coord.lat) &&
    Number.isFinite(coord.lng) &&
    (coord.lat !== 0 || coord.lng !== 0)
  );
}

export interface EntityMapTargetInput {
  coordinate?: Coordinate | null;
  mapsUrl?: string;
  googleMapsUrl?: string;
  link?: string;
  address?: string;
  indirizzo?: string;
  location?: string;
  name?: string;
  title?: string;
  titolo?: string;
  nome?: string;
  travelmode?: 'driving' | 'walking' | 'bicycling' | 'transit';
}

/**
 * Resolver geografico condiviso per tutte le categorie (fronte card e modale dettaglio).
 * Priorità:
 * 1) Link Google Maps esplicito (preserva percorsi /dir/ e query manuali)
 * 2) Coordinate verificate (lat,lng)
 * 3) Indirizzo testuale / località
 * 4) Nome / titolo
 */
export function resolveEntityMapUrl(input?: EntityMapTargetInput | null): string {
  if (!input) return '';
  const explicitUrl = [input.mapsUrl, input.googleMapsUrl, input.link].find((u) => isGoogleMapsUrl(u));
  if (explicitUrl) {
    return resolveMapUrl(explicitUrl, input.travelmode);
  }
  if (isValidCoordinate(input.coordinate)) {
    const modeParam = input.travelmode ? `&travelmode=${input.travelmode}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${input.coordinate.lat},${input.coordinate.lng}${modeParam}`;
  }
  const textTarget =
    input.address?.trim() ||
    input.indirizzo?.trim() ||
    input.location?.trim() ||
    input.name?.trim() ||
    input.title?.trim() ||
    input.titolo?.trim() ||
    input.nome?.trim() ||
    '';
  return textTarget ? resolveMapUrl(textTarget, input.travelmode) : '';
}

/**
 * Apre in sicurezza un link a Google Maps in una nuova scheda.
 */

/**
 * Determina se un elemento dispone di una destinazione geografica affidabile
 * (coordinate, URL Maps dedicato, o indirizzo fisico esplicito)
 * rispetto a una semplice ricerca testuale per nome.
 */
export function hasReliableGeoDestination(item?: {
  coordinate?: { lat?: number; lng?: number };
  mapsUrl?: string;
  indirizzo?: string;
  address?: string;
  googleMapsUrl?: string;
}): boolean {
  if (!item) return false;
  if (item.coordinate && typeof item.coordinate.lat === 'number' && typeof item.coordinate.lng === 'number' && (item.coordinate.lat !== 0 || item.coordinate.lng !== 0)) {
    return true;
  }
  if (item.mapsUrl && item.mapsUrl.trim().length > 0) return true;
  if (item.googleMapsUrl && item.googleMapsUrl.trim().length > 0) return true;
  if (item.indirizzo && item.indirizzo.trim().length > 0) return true;
  if (item.address && item.address.trim().length > 0) return true;
  return false;
}

export function getMapsActionLabel(hasGeo: boolean): string {
  return hasGeo ? 'Indicazioni' : 'Cerca su Maps';
}

export function openMapLink(url?: string): void {
  if (!url) return;
  const resolved = resolveMapUrl(url);
  if (resolved && typeof window !== 'undefined') {
    window.open(resolved, '_blank', 'noopener,noreferrer');
  }
}

export interface TransportMapTargets {
  primaryUrl: string;
  primaryLabel: string;
  pickupUrl?: string;
  pickupLabel?: string;
  dropoffUrl?: string;
  dropoffLabel?: string;
  departureUrl?: string;
  departureLabel?: string;
  layoverUrl?: string;
  layoverLabel?: string;
  arrivalUrl?: string;
  arrivalLabel?: string;
}

/**
 * Mappatura intelligente dei punti di precisione per Google Maps
 */
export function getTransportMapTargets(transport: Trasporto): TransportMapTargets {
  const { type, departureLocation, arrivalLocation, dropoffLocation, layover } = transport;

  // 1. NOLEGGI (Auto e Campervan)
  if (type === 'auto' || type === 'camper') {
    let pickupQuery = departureLocation;
    let dropoffQuery = dropoffLocation || arrivalLocation;

    if (!/^https?:\/\//i.test(pickupQuery)) {
      if ((departureLocation || '').toLowerCase().includes('the strand') || (departureLocation || '').toLowerCase().includes('parnell')) {
        pickupQuery = 'Snap Rentals Auckland Downtown, 60-64 The Strand, Parnell, Auckland';
      } else if ((departureLocation || '').toLowerCase().includes('assembly drive') || (departureLocation || '').toLowerCase().includes('tullamarine')) {
        pickupQuery = 'Travellers Autobarn Campervan Hire Melbourne, 5 Assembly Dr, Tullamarine VIC';
      } else if ((departureLocation || '').toLowerCase().includes('adelaide airport')) {
        pickupQuery = 'Bargain Car Rentals Adelaide Airport, South Australia';
      }
    }

    if (!/^https?:\/\//i.test(dropoffQuery)) {
      if ((dropoffQuery || '').toLowerCase().includes('orchard road') || (dropoffQuery || '').toLowerCase().includes('harewood')) {
        dropoffQuery = 'Snap Rentals Christchurch Airport, 170 Orchard Road, Harewood, Christchurch';
      } else if ((dropoffQuery || '').toLowerCase().includes('mcpherson') || (dropoffQuery || '').toLowerCase().includes('banksmeadow')) {
        dropoffQuery = 'Travellers Autobarn Campervan Hire Sydney, 1C McPherson St, Banksmeadow NSW';
      } else if ((dropoffQuery || '').toLowerCase().includes('adelaide airport')) {
        dropoffQuery = 'Bargain Car Rentals Adelaide Airport, South Australia';
      }
    }

    const pickupUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(pickupQuery) ? undefined : transport.coordinate,
      mapsUrl: isGoogleMapsUrl(pickupQuery) ? pickupQuery : undefined,
      address: pickupQuery,
    });
    const dropoffUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(dropoffQuery) ? undefined : transport.dropoffCoordinate,
      mapsUrl: isGoogleMapsUrl(dropoffQuery) ? dropoffQuery : undefined,
      address: dropoffQuery,
    });

    return {
      primaryUrl: pickupUrl,
      primaryLabel: 'Ritiro Sede',
      pickupUrl,
      pickupLabel: 'Sede Ritiro',
      dropoffUrl,
      dropoffLabel: 'Sede Riconsegna'
    };
  }

  // 2. VOLI (Terminal esatti e aeroporti)
  if (type === 'volo') {
    const cleanDep = mapAirportTerminal(departureLocation);
    const cleanArr = mapAirportTerminal(arrivalLocation);
    const depUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(departureLocation) ? undefined : transport.coordinate,
      mapsUrl: isGoogleMapsUrl(departureLocation) ? departureLocation : undefined,
      address: cleanDep,
    });
    const arrUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(arrivalLocation) ? undefined : transport.dropoffCoordinate,
      mapsUrl: isGoogleMapsUrl(arrivalLocation) ? arrivalLocation : undefined,
      address: cleanArr,
    });

    let layoverUrl: string | undefined;
    let layoverLabel: string | undefined;

    if (layover?.airport) {
      const cleanLay = mapAirportTerminal(layover.airport);
      layoverUrl = resolveEntityMapUrl({
        coordinate: isGoogleMapsUrl(layover.airport) ? undefined : (layover as { coordinate?: Coordinate }).coordinate,
        mapsUrl: isGoogleMapsUrl(layover.airport) ? layover.airport : undefined,
        address: cleanLay,
      });
      layoverLabel = `Scalo ${layover.airport}`;
    }

    return {
      primaryUrl: depUrl,
      primaryLabel: 'Terminal Partenza',
      departureUrl: depUrl,
      departureLabel: cleanDep,
      layoverUrl,
      layoverLabel,
      arrivalUrl: arrUrl,
      arrivalLabel: cleanArr
    };
  }

  // 3. TRAGHETTI (Moli e terminal esatti)
  if (type === 'traghetto') {
    let depQuery = departureLocation;
    let arrQuery = arrivalLocation;

    if (!/^https?:\/\//i.test(depQuery)) {
      if ((depQuery || '').toLowerCase().includes('wellington')) {
        depQuery = 'Bluebridge Wellington Ferry Terminal, 50 Waterloo Quay, Pipitea, Wellington';
      } else if ((depQuery || '').toLowerCase().includes('cape jervis')) {
        depQuery = 'SeaLink Kangaroo Island Ferry Terminal, Cape Jervis SA';
      } else if ((depQuery || '').toLowerCase().includes('penneshaw')) {
        depQuery = 'SeaLink Kangaroo Island Ferry Terminal, Penneshaw SA';
      } else if ((depQuery || '').toLowerCase().includes('el nido')) {
        depQuery = 'El Nido Port Terminal, Palawan, Philippines';
      }
    }

    if (!/^https?:\/\//i.test(arrQuery)) {
      if ((arrQuery || '').toLowerCase().includes('picton')) {
        arrQuery = 'Bluebridge Picton Ferry Terminal, 1 Lagoon Road, Picton';
      } else if ((arrQuery || '').toLowerCase().includes('penneshaw')) {
        arrQuery = 'SeaLink Kangaroo Island Ferry Terminal, Penneshaw SA';
      } else if ((arrQuery || '').toLowerCase().includes('cape jervis')) {
        arrQuery = 'SeaLink Kangaroo Island Ferry Terminal, Cape Jervis SA';
      } else if ((arrQuery || '').toLowerCase().includes('coron')) {
        arrQuery = 'Coron Port Terminal, Busuanga, Palawan, Philippines';
      }
    }

    const depUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(depQuery) ? undefined : transport.coordinate,
      mapsUrl: isGoogleMapsUrl(depQuery) ? depQuery : undefined,
      address: depQuery,
    });
    const arrUrl = resolveEntityMapUrl({
      coordinate: isGoogleMapsUrl(arrQuery) ? undefined : transport.dropoffCoordinate,
      mapsUrl: isGoogleMapsUrl(arrQuery) ? arrQuery : undefined,
      address: arrQuery,
    });

    return {
      primaryUrl: depUrl,
      primaryLabel: 'Molo Imbarco',
      departureUrl: depUrl,
      departureLabel: 'Imbarco',
      arrivalUrl: arrUrl,
      arrivalLabel: 'Sbarco'
    };
  }

  // 4. TRANSFER / TAXI / TRENO / METRO
  let transferQuery = arrivalLocation;
  if (!/^https?:\/\//i.test(transferQuery)) {
    if ((arrivalLocation || '').toLowerCase().includes('auckland apt') || (arrivalLocation || '').toLowerCase().includes('akl')) {
      transferQuery = 'Auckland Airport International Terminal';
    }
  }

  const primaryUrl = resolveEntityMapUrl({
    coordinate: isGoogleMapsUrl(transferQuery) ? undefined : transport.dropoffCoordinate,
    mapsUrl: isGoogleMapsUrl(transferQuery) ? transferQuery : undefined,
    address: transferQuery,
  });
  const depUrl = resolveEntityMapUrl({
    coordinate: isGoogleMapsUrl(departureLocation) ? undefined : transport.coordinate,
    mapsUrl: isGoogleMapsUrl(departureLocation) ? departureLocation : undefined,
    address: departureLocation,
  });
  return {
    primaryUrl,
    primaryLabel: 'Destinazione',
    departureUrl: depUrl,
    departureLabel: 'Pick-up',
    arrivalUrl: primaryUrl,
    arrivalLabel: 'Arrivo'
  };
}

function mapAirportTerminal(raw: string): string {
  // Se è già un URL Google Maps, non trasformarlo in testo
  if (/^https?:\/\//i.test(raw.trim())) {
    return raw.trim();
  }

  const l = String(raw || '').toLowerCase();
  if (l.includes('mxp') || l.includes('malpensa')) return 'Milano Malpensa Airport Terminal 1';
  if (l.includes('pek') || l.includes('pechino')) return 'Beijing Capital International Airport Terminal 3';
  if (l.includes('akl') || l.includes('auckland')) return 'Auckland Airport International Terminal, Ray Emery Drive';
  if (l.includes('chc') || l.includes('christchurch')) return 'Christchurch International Airport';
  if (l.includes('adl') || l.includes('adelaide')) return 'Adelaide Airport Terminal 1';
  if (l.includes('mel') || l.includes('melbourne')) return 'Melbourne Airport Tullamarine';
  if (l.includes('syd') || l.includes('sydney')) return 'Sydney Airport International Terminal 1, Mascot NSW';
  if (l.includes('mnl') || l.includes('manila')) return 'Ninoy Aquino International Airport Terminal 3, Pasay, Metro Manila';
  if (l.includes('mph') || l.includes('caticlan') || l.includes('boracay')) return 'Godofredo P. Ramos Airport (Caticlan Airport), Malay, Aklan';
  if (l.includes('eni') || l.includes('el nido') || l.includes('lio')) return 'El Nido Airport (Lio Airport), Palawan';
  if (l.includes('usu') || l.includes('busuanga') || l.includes('coron')) return 'Francisco B. Reyes Airport (Coron Airport), Busuanga, Palawan';
  if (l.includes('ceb') || l.includes('cebu')) return 'Mactan-Cebu International Airport Terminal 1, Lapu-Lapu City';
  if (l.includes('tpe') || l.includes('taipei')) return 'Taiwan Taoyuan International Airport';
  if (l.includes('fco') || l.includes('fiumicino') || l.includes('roma')) return 'Aeroporto Leonardo da Vinci Fiumicino Roma Terminal 3';
  return raw;
}

/* =========================================================================
   PREDISPOSIZIONE PER IL FUTURO CALCOLO AUTOMATICO DELLE DISTANZE TRA TAPPE
   ========================================================================= */

/**
 * Funzione prevista per il calcolo della distanza tra due coordinate geografiche (formula di Haversine).
 * Verrà attivata quando le entità conterranno le coordinate salvate.
 */
export function calculateDistance(coord1?: Coordinate, coord2?: Coordinate): number | null {
  if (!coord1 || !coord2) return null;
  const R = 6371; // Raggio medio della Terra in km
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Ritorna km con una cifra decimale
}

/**
 * Funzione prevista per geocodificare un indirizzo testuale o URL in Coordinate (lat, lng).
 * Da collegare a un provider di geocoding (es. Google Geocoding API o OpenStreetMap Nominatim).
 */
export async function getCoordinatesFromAddress(address: string, contextHint?: string): Promise<Coordinate | null> {
  if (!address || !address.trim()) return null;

  // 1. Priorità lookup interno curato
  const known = lookupKnownCoordinate(address);
  if (known) return known;

  let query = address.trim();
  if (query.startsWith('http')) {
    try {
      const url = new URL(query);
      if (url.searchParams.has('query')) {
        query = url.searchParams.get('query') || query;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  // Se è una strada lunga senza indicazione di contesto specifico, non assegnare coordinate arbitrarie
  const lower = query.toLowerCase();
  const isGenericLongHighway = (lower === 'playford hwy' || lower === 'playford highway') && !lower.includes('kangaroo');
  if (isGenericLongHighway) {
    return null;
  }

  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query), {
      headers: {
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      const first = data[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      const displayName = (first.display_name || '').toLowerCase();

      // Controllo coerenza geografica: rifiuta incongruenze evidenti di stato o isola (es. Kangaroo Island vs Victoria)
      const combined = `${lower} ${contextHint || ''}`.toLowerCase();
      if ((combined.includes('kangaroo island') || combined.includes('karatta') || combined.includes('baudin beach')) && (displayName.includes('victoria') || lat < -36.5 || lng > 140)) {
        console.warn(`[Geocoding] Rifiutata corrispondenza incompatibile: ${first.display_name} per query: ${query}`);
        return null;
      }

      return {
        lat,
        lng
      };
    }
  } catch (err) {
    console.error('Errore geocoding:', err);
  }
  return null;
}
