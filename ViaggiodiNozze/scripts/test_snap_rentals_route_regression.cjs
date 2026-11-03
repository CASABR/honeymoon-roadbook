const assert = require('assert');

// Mock coordinates and calculations
const KNOWN_COORDINATES = {
  auckland: { lat: -36.8485, lng: 174.7633 },
  christchurch: { lat: -43.5321, lng: 172.6362 },
  chc: { lat: -43.4894, lng: 172.5322 },
  orchard: { lat: -43.4894, lng: 172.5322 },
  adelaide: { lat: -34.9285, lng: 138.6007 },
  wellington: { lat: -41.2865, lng: 174.7762 },
};

function lookupKnownCoordinate(text) {
  if (!text) return null;
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (KNOWN_COORDINATES[w]) return KNOWN_COORDINATES[w];
  }
  for (const [k, v] of Object.entries(KNOWN_COORDINATES)) {
    if (clean.includes(k.replace(/_/g, ' '))) return v;
  }
  return null;
}

function calculateHaversineDistance(c1, c2) {
  const R = 6371;
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

function calculateFallbackRoute(from, to, profile, fromCoord, toCoord) {
  let start = fromCoord || lookupKnownCoordinate(from);
  let end = toCoord || lookupKnownCoordinate(to);

  if (start && end) {
    const directKm = calculateHaversineDistance(start, end);

    if (directKm < 0.1) {
      return {
        distanceKm: directKm,
        formattedDistance: '< 100 m',
        durationSeconds: 60,
        formattedDuration: '1 min',
        profile,
        manualOverride: false
      };
    }

    const combined = `${from} ${to}`.toLowerCase();
    const hasFlightEvidence = (
      combined.includes('volo') ||
      combined.includes('flight') ||
      combined.includes('aeroporto') ||
      combined.includes('airport') ||
      combined.includes('terminal internazionale') ||
      combined.includes('iata')
    );

    if (hasFlightEvidence && directKm > 250) {
      return {
        distanceKm: directKm,
        formattedDistance: 'Tratta aerea',
        durationSeconds: Math.round((directKm / 800) * 3600),
        formattedDuration: 'Volo',
        profile,
        manualOverride: false
      };
    }

    if (directKm > 1500 && !hasFlightEvidence) {
      return {
        distanceKm: directKm,
        formattedDistance: 'Tratta da verificare',
        durationSeconds: 0,
        formattedDuration: 'Verifica collegamento',
        profile,
        manualOverride: false
      };
    }

    const isUrban = directKm < 15;
    const windingFactor = profile === 'driving-car' ? (isUrban ? 1.45 : 1.35) : (isUrban ? 1.3 : 1.2);
    const distanceKm = Math.max(0.3, Math.round(directKm * windingFactor * 10) / 10);
    const avgSpeed = profile === 'driving-car' ? (isUrban ? 25 : 70) : 4.5;
    const durationSeconds = Math.round((distanceKm / avgSpeed) * 3600);

    return {
      distanceKm,
      formattedDistance: `${distanceKm} km`,
      durationSeconds,
      formattedDuration: `~${Math.round(durationSeconds / 60)}m`,
      profile,
      manualOverride: false
    };
  }

  return {
    distanceKm: 18.5,
    formattedDistance: '~18.5 km',
    durationSeconds: 900,
    formattedDuration: '~15m',
    profile,
    manualOverride: false
  };
}

function classifyRouteBadge(route, isFlight) {
  const isExplicitFlight = isFlight || (route?.formattedDistance || '').toLowerCase().includes('aereo') || (route?.formattedDistance || '').toLowerCase().includes('transoceanic') || (route?.formattedDuration || '').toLowerCase().includes('volo');
  const isTransoceanic = route && isExplicitFlight && route.distanceKm > 250;
  const isUnverified = route && (route.formattedDistance === 'Tratta da verificare' || (!isExplicitFlight && route.distanceKm > 1500));

  if (isUnverified) return 'unverified';
  if (isTransoceanic) return 'transoceanic';
  return 'standard';
}

console.log('--- TEST REGRESSIONE 1: SNAP RENTALS 15 DICEMBRE ---');
const tappa15Dec = {
  id: 'tappa_40',
  title: 'Riconsegna Auto Christchurch',
  time: '11:30',
  location: 'Snap Rentals CHC Airport',
  coordinate: KNOWN_COORDINATES.chc
};

const dropoff15Dec = {
  id: 'trn_05_snap_rentals_dropoff',
  title: 'Riconsegna auto (Snap Rentals)',
  time: '12:00',
  location: 'Christchurch Airport Snap Rentals Depot (170 Orchard Road)',
  departurePoint: 'Christchurch Airport Snap Rentals Depot (170 Orchard Road)',
  arrivalPoint: 'Christchurch Airport Snap Rentals Depot (170 Orchard Road)',
  coordinate: KNOWN_COORDINATES.orchard
};

// Test route calculation between 11:30 Tappa and 12:00 Dropoff
const snapRoute = calculateFallbackRoute(
  tappa15Dec.location,
  dropoff15Dec.departurePoint,
  'driving-car',
  tappa15Dec.coordinate,
  dropoff15Dec.coordinate
);

console.log('Snap Rentals route:', snapRoute);
assert(snapRoute.distanceKm < 15, `Distanza deve essere locale, trovata ${snapRoute.distanceKm} km`);
assert.notStrictEqual(snapRoute.formattedDistance, 'Tratta aerea', 'Non deve essere Tratta aerea');

const badgeType = classifyRouteBadge(snapRoute, false);
console.log('Badge classificazione:', badgeType);
assert.strictEqual(badgeType, 'standard', 'Deve essere visualizzato badge standard di guida/piedi, NON transoceanico');

console.log('--- TEST REGRESSIONE 2: TRATTA OVERLAND > 500KM (AUCKLAND -> WELLINGTON) ---');
const overlandRoute = calculateFallbackRoute(
  'Auckland City Center',
  'Wellington City Center',
  'driving-car',
  KNOWN_COORDINATES.auckland,
  KNOWN_COORDINATES.wellington
);
console.log('Overland route distance:', overlandRoute.distanceKm, 'formatted:', overlandRoute.formattedDistance);
const overlandBadge = classifyRouteBadge(overlandRoute, false);
assert(overlandRoute.distanceKm > 500, 'Distanza reale supera 500 km');
assert.strictEqual(overlandBadge, 'standard', 'Tratta stradale lunga non deve essere marchiata transoceanica senza aereo');

console.log('--- TEST REGRESSIONE 3: VOLO REALE TRANSOCEANICO (CHC -> ADL) ---');
const flightRoute = calculateFallbackRoute(
  'Christchurch International Airport',
  'Adelaide International Airport',
  'driving-car',
  KNOWN_COORDINATES.chc,
  KNOWN_COORDINATES.adelaide
);
console.log('Flight route:', flightRoute);
const flightBadge = classifyRouteBadge(flightRoute, true);
assert.strictEqual(flightBadge, 'transoceanic', 'Volo reale transoceanico deve essere marchiato transoceanic');

console.log('--- TEST REGRESSIONE 4: SALTO SENZA EVIDENZE > 1500KM ---');
const unknownJumpRoute = calculateFallbackRoute(
  'Unconnected Location A',
  'Unconnected Location B',
  'driving-car',
  KNOWN_COORDINATES.auckland,
  KNOWN_COORDINATES.adelaide
);
const unknownJumpBadge = classifyRouteBadge(unknownJumpRoute, false);
console.log('Unknown jump badge:', unknownJumpBadge);
assert.strictEqual(unknownJumpBadge, 'unverified', 'Salto senza evidenze deve essere Tratta da verificare');

console.log('TUTTI I TEST REGRESSIONE TRATTE SUPERATI CON SUCCESSO!');
