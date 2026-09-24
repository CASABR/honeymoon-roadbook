import type { Trasporto, Coordinate } from '../types';

/**
 * Risolve un input (che può essere un URL Maps diretto o un indirizzo/testo) nel corretto URL Google Maps.
 * - Se è già un link web (http:// o https://, es. https://maps.app.goo.gl/... o https://www.google.com/maps/...), lo preserva intatto.
 * - Se è una stringa/indirizzo testuale, costruisce la search query corretta per Google Maps.
 */
export function resolveMapUrl(input?: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();

  // Se è già un URL completo (es. maps.app.goo.gl o google.com/maps o http/https)
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Altrimenti genera la query di ricerca codificata
  const cleanQuery = trimmed.replace(/\s+/g, ' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
}

/**
 * Alias retrocompatibile per resolveMapUrl
 */
export function getGoogleMapsUrl(query: string): string {
  return resolveMapUrl(query);
}

/**
 * Apre in sicurezza un link a Google Maps in una nuova scheda.
 */
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
      if (departureLocation.toLowerCase().includes('the strand') || departureLocation.toLowerCase().includes('parnell')) {
        pickupQuery = 'Snap Rentals Auckland Downtown, 60-64 The Strand, Parnell, Auckland';
      } else if (departureLocation.toLowerCase().includes('assembly drive') || departureLocation.toLowerCase().includes('tullamarine')) {
        pickupQuery = 'Travellers Autobarn Campervan Hire Melbourne, 5 Assembly Dr, Tullamarine VIC';
      } else if (departureLocation.toLowerCase().includes('adelaide airport')) {
        pickupQuery = 'Bargain Car Rentals Adelaide Airport, South Australia';
      }
    }

    if (!/^https?:\/\//i.test(dropoffQuery)) {
      if (dropoffQuery.toLowerCase().includes('orchard road') || dropoffQuery.toLowerCase().includes('harewood')) {
        dropoffQuery = 'Snap Rentals Christchurch Airport, 170 Orchard Road, Harewood, Christchurch';
      } else if (dropoffQuery.toLowerCase().includes('mcpherson') || dropoffQuery.toLowerCase().includes('banksmeadow')) {
        dropoffQuery = 'Travellers Autobarn Campervan Hire Sydney, 1C McPherson St, Banksmeadow NSW';
      } else if (dropoffQuery.toLowerCase().includes('adelaide airport')) {
        dropoffQuery = 'Bargain Car Rentals Adelaide Airport, South Australia';
      }
    }

    const pickupUrl = resolveMapUrl(pickupQuery);
    const dropoffUrl = resolveMapUrl(dropoffQuery);

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
    const depUrl = resolveMapUrl(cleanDep);
    const arrUrl = resolveMapUrl(cleanArr);

    let layoverUrl: string | undefined;
    let layoverLabel: string | undefined;

    if (layover?.airport) {
      const cleanLay = mapAirportTerminal(layover.airport);
      layoverUrl = resolveMapUrl(cleanLay);
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
      if (depQuery.toLowerCase().includes('wellington')) {
        depQuery = 'Bluebridge Wellington Ferry Terminal, 50 Waterloo Quay, Pipitea, Wellington';
      } else if (depQuery.toLowerCase().includes('cape jervis')) {
        depQuery = 'SeaLink Kangaroo Island Ferry Terminal, Cape Jervis SA';
      } else if (depQuery.toLowerCase().includes('penneshaw')) {
        depQuery = 'SeaLink Kangaroo Island Ferry Terminal, Penneshaw SA';
      } else if (depQuery.toLowerCase().includes('el nido')) {
        depQuery = 'El Nido Port Terminal, Palawan, Philippines';
      }
    }

    if (!/^https?:\/\//i.test(arrQuery)) {
      if (arrQuery.toLowerCase().includes('picton')) {
        arrQuery = 'Bluebridge Picton Ferry Terminal, 1 Lagoon Road, Picton';
      } else if (arrQuery.toLowerCase().includes('penneshaw')) {
        arrQuery = 'SeaLink Kangaroo Island Ferry Terminal, Penneshaw SA';
      } else if (arrQuery.toLowerCase().includes('cape jervis')) {
        arrQuery = 'SeaLink Kangaroo Island Ferry Terminal, Cape Jervis SA';
      } else if (arrQuery.toLowerCase().includes('coron')) {
        arrQuery = 'Coron Port Terminal, Busuanga, Palawan, Philippines';
      }
    }

    const depUrl = resolveMapUrl(depQuery);
    const arrUrl = resolveMapUrl(arrQuery);

    return {
      primaryUrl: depUrl,
      primaryLabel: 'Molo Imbarco',
      departureUrl: depUrl,
      departureLabel: 'Imbarco',
      arrivalUrl: arrUrl,
      arrivalLabel: 'Sbarco'
    };
  }

  // 4. TRANSFER / TAXI
  let transferQuery = arrivalLocation;
  if (!/^https?:\/\//i.test(transferQuery)) {
    if (arrivalLocation.toLowerCase().includes('hotel noa') || arrivalLocation.toLowerCase().includes('queen st')) {
      transferQuery = 'Noa Hotel Auckland, Queen Street, Auckland CBD, New Zealand';
    } else if (arrivalLocation.toLowerCase().includes('auckland apt') || arrivalLocation.toLowerCase().includes('akl')) {
      transferQuery = 'Auckland Airport International Terminal';
    }
  }

  const primaryUrl = resolveMapUrl(transferQuery);
  return {
    primaryUrl,
    primaryLabel: 'Destinazione',
    departureUrl: resolveMapUrl(departureLocation),
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

  const l = raw.toLowerCase();
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
export async function getCoordinatesFromAddress(_address: string): Promise<Coordinate | null> {
  // Predisposizione per implementazione futura
  return null;
}
