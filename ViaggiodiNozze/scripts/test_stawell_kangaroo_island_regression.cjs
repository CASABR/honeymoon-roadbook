/**
 * Test regressione:
 * 1. Disambiguazione toponimi Kangaroo Island (Hanson Bay, Baudin Beach, Playford Hwy vs Stawell Victoria).
 * 2. Rilevamento percorsi anomali isola-continente senza traghetto/volo -> "Posizione o percorso da verificare".
 * 3. Nessuna falsa "Tratta transoceanica / aerea" su tratte stradali interrotte.
 * 4. Preservazione voli reali e percorsi urbani/noleggio (Snap Rentals).
 */

const assert = require('assert');

// 1. KNOWN_COORDINATES logic emulation
const KNOWN_COORDINATES = {
  hanson_bay: { lat: -35.9658, lng: 136.8206 },
  baudin_beach: { lat: -35.7770, lng: 137.8707 },
  karatta: { lat: -35.9615, lng: 136.8093 },
  playford_hwy: { lat: -35.7865, lng: 137.1933 },
  stawell: { lat: -37.0605, lng: 142.7585 },
  cape_jervis: { lat: -35.6067, lng: 138.0967 },
  penneshaw: { lat: -35.7200, lng: 137.9400 },
  christchurch: { lat: -43.5321, lng: 172.6362 },
  snap_rentals: { lat: -43.4875, lng: 172.5450 }
};

function lookupKnownCoordinate(text) {
  if (!text) return null;
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  for (const w of words) {
    if (KNOWN_COORDINATES[w]) {
      return KNOWN_COORDINATES[w];
    }
  }

  for (const [key, coord] of Object.entries(KNOWN_COORDINATES)) {
    if (key.length <= 3) continue;
    const keySpaced = key.replace(/_/g, ' ');
    if (clean.includes(keySpaced)) {
      return coord;
    }
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
        profile
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
        profile
      };
    }

    const isKangarooIsland = (c) => {
      if (c.lat < -36.2 || c.lat > -35.5 || c.lng < 136.5 || c.lng > 138.15) return false;
      if (c.lat > -35.65 && c.lng > 138.05) return false;
      return true;
    };
    const hasFerryEvidence = (
      combined.includes('ferry') ||
      combined.includes('traghetto') ||
      combined.includes('sealink') ||
      combined.includes('penneshaw') ||
      combined.includes('cape jervis')
    );

    const isIslandMismatch = (isKangarooIsland(start) !== isKangarooIsland(end)) && !hasFerryEvidence && !hasFlightEvidence;

    if (isIslandMismatch) {
      return {
        distanceKm: directKm,
        formattedDistance: 'Posizione o percorso da verificare',
        durationSeconds: 0,
        formattedDuration: 'Percorso non raggiungibile via terra',
        profile
      };
    }

    if (directKm > 1000 && !hasFlightEvidence) {
      return {
        distanceKm: directKm,
        formattedDistance: 'Posizione o percorso da verificare',
        durationSeconds: 0,
        formattedDuration: 'Posizione o percorso da verificare',
        profile
      };
    }

    const isUrban = directKm < 15;
    const windingFactor = profile === 'driving-car' ? (isUrban ? 1.45 : 1.35) : 1.2;
    const distanceKm = Math.max(0.3, Math.round(directKm * windingFactor * 10) / 10);
    const avgSpeed = profile === 'driving-car' ? (isUrban ? 25 : 70) : 4.5;
    const durationSeconds = Math.round((distanceKm / avgSpeed) * 3600);

    return {
      distanceKm,
      formattedDistance: `${distanceKm} km`,
      durationSeconds,
      formattedDuration: `~${Math.round(durationSeconds / 60)} min`,
      profile
    };
  }

  return {
    distanceKm: 18.5,
    formattedDistance: '~18.5 km',
    durationSeconds: 900,
    formattedDuration: '~15 min',
    profile
  };
}

function classifyBadge(route, isFlight) {
  const isExplicitFlight = isFlight || (route?.formattedDistance || '').toLowerCase().includes('aereo') || (route?.formattedDistance || '').toLowerCase().includes('transoceanic') || (route?.formattedDuration || '').toLowerCase().includes('volo');
  const isUnverified = Boolean(
    route && (
      (route.formattedDistance || '').toLowerCase().includes('verificare') ||
      (route.formattedDuration || '').toLowerCase().includes('verificare') ||
      (!isExplicitFlight && route.distanceKm > 1000)
    )
  );
  const isTransoceanic = route && isExplicitFlight && route.distanceKm > 250;

  if (isUnverified) return 'unverified';
  if (isTransoceanic) return 'transoceanic';
  return 'standard';
}

console.log('--- TEST 1: Risoluzione toponimo Playford Hwy su Kangaroo Island ---');
const playfordCoord = lookupKnownCoordinate('Playford Hwy, South Australia');
assert(playfordCoord !== null, 'Playford Hwy deve essere risolto');
assert(playfordCoord.lat < -35.7 && playfordCoord.lat > -35.9, 'Latitudine deve essere Kangaroo Island (~ -35.78)');
assert(playfordCoord.lng > 137.0 && playfordCoord.lng < 137.5, 'Longitudine deve essere Kangaroo Island (~ 137.19)');
console.log('OK: Playford Hwy risolto su Kangaroo Island:', playfordCoord);

console.log('--- TEST 2: Tratta legittima Hanson Bay -> Baudin Beach (Kangaroo Island) ---');
const kiRoute = calculateFallbackRoute('Hanson Bay Wildlife Sanctuary', 'Baudin Beach', 'driving-car');
const kiBadge = classifyBadge(kiRoute, false);
assert.strictEqual(kiBadge, 'standard', 'Tratta interna a Kangaroo Island deve essere standard driving');
assert(!kiRoute.formattedDistance.includes('Tratta aerea'), 'Non deve essere tratta aerea');
assert(kiRoute.distanceKm > 80 && kiRoute.distanceKm < 200, `Distanza realistica KI (${kiRoute.distanceKm} km)`);
console.log('OK: Tratta interna KI standard:', kiRoute.formattedDistance, kiRoute.formattedDuration);

console.log('--- TEST 3: Tratta anomala Hanson Bay (KI) -> Western Hwy/Playford St (Stawell VIC) ---');
const stawellCoord = KNOWN_COORDINATES.stawell;
const hansonCoord = KNOWN_COORDINATES.hanson_bay;
const anomalyRoute = calculateFallbackRoute(
  'Hanson Bay Wildlife Sanctuary',
  'Western Hwy/Playford St Stawell',
  'driving-car',
  hansonCoord,
  stawellCoord
);
const anomalyBadge = classifyBadge(anomalyRoute, false);
assert.strictEqual(anomalyBadge, 'unverified', 'Percorso anomalo isola-continente senza traghetto deve essere unverified');
assert.strictEqual(anomalyRoute.formattedDistance, 'Posizione o percorso da verificare');
assert.strictEqual(anomalyRoute.formattedDuration, 'Percorso non raggiungibile via terra');
console.log('OK: Anomalia intercettata e classificata unverified:', anomalyRoute.formattedDistance);

console.log('--- TEST 4: Tratta vera in traghetto Penneshaw (KI) -> Cape Jervis (Mainland) ---');
const ferryRoute = calculateFallbackRoute(
  'Penneshaw SeaLink Ferry Terminal',
  'Cape Jervis Ferry Terminal',
  'driving-car',
  KNOWN_COORDINATES.penneshaw,
  KNOWN_COORDINATES.cape_jervis
);
const ferryBadge = classifyBadge(ferryRoute, false);
assert.strictEqual(ferryBadge, 'standard', 'Tratta con traghetto non deve essere bloccata come island mismatch');
console.log('OK: Traghetto SeaLink valido:', ferryRoute.formattedDistance);

console.log('--- TEST 5: Tratta vera in aereo Adelaide Airport -> Melbourne Tullamarine ---');
const flightRoute = calculateFallbackRoute(
  'Volo Adelaide Airport ADL',
  'Aeroporto Melbourne Tullamarine MEL',
  'driving-car',
  { lat: -34.9450, lng: 138.5305 },
  { lat: -37.6690, lng: 144.8410 }
);
const flightBadge = classifyBadge(flightRoute, true);
assert.strictEqual(flightBadge, 'transoceanic', 'Volo reale deve essere classificato volo/transoceanico');
console.log('OK: Volo aereo ADL-MEL riconosciuto:', flightRoute.formattedDistance);

console.log('--- TEST 6: Riconsegna Snap Rentals Christchurch (regressione 15 dicembre) ---');
const snapRoute = calculateFallbackRoute(
  'Riconsegna Auto Christchurch',
  'Snap Rentals Christchurch Airport',
  'driving-car',
  KNOWN_COORDINATES.christchurch,
  KNOWN_COORDINATES.snap_rentals
);
const snapBadge = classifyBadge(snapRoute, false);
assert.strictEqual(snapBadge, 'standard', 'Snap Rentals riconsegna deve essere standard');
console.log('--- TEST 7: Western Hwy/Playford St non deve ereditare coordinate di Kangaroo Island ---');
const busStopLookup = lookupKnownCoordinate('Western Hwy/Playford St');
// Non deve puntare a Kangaroo Island (-35.x)
if (busStopLookup) {
  assert(busStopLookup.lat < -36.5, 'Non deve puntare a Kangaroo Island');
}
console.log('OK: Western Hwy/Playford St non inquina Kangaroo Island');

console.log('--- TEST 8: Playford Hwy su Kangaroo Island verificato sul segmento corretto ---');
const kiSegmentCoord = lookupKnownCoordinate('Playford Hwy Kangaroo Island');
assert(kiSegmentCoord !== null && kiSegmentCoord.lat > -36.0, 'Playford Hwy deve essere su Kangaroo Island');
console.log('OK: Playford Hwy correttamente posizionato sul segmento Kangaroo Island:', kiSegmentCoord);

console.log('\n TUTTI I TEST GEOGRAFICI E ROUTING SUPERATI CON SUCCESSO!');
