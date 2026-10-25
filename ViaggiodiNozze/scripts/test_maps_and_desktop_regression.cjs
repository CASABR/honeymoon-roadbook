const assert = require('assert');

// 1. Test euristica stima tappe Google Maps
function estimateGoogleMapsStops(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const clean = url.trim();
    if (clean.includes('/maps/dir/')) {
      const parts = clean.split('/maps/dir/')[1]?.split('/');
      if (parts) {
        const stops = parts.filter(p => p && !p.startsWith('@') && !p.startsWith('data=') && !p.includes('?'));
        if (stops.length > 0) return stops.length;
      }
    }
    if (clean.includes('origin=') && clean.includes('destination=')) {
      let count = 2;
      const waypointsMatch = clean.match(/waypoints=([^&]+)/);
      if (waypointsMatch && waypointsMatch[1]) {
        const waypoints = decodeURIComponent(waypointsMatch[1]).split('|');
        count += waypoints.length;
      }
      return count;
    }
  } catch {}
  return null;
}

console.log('--- TEST ESTIMATE GOOGLE MAPS STOPS & LIMIT (10 STOPS) ---');

// Test URL con 10 o più tappe
const tenStopUrl = 'https://www.google.com/maps/dir/Sydney+Airport/Circular+Quay/The+Rocks/Barangaroo/Darling+Harbour/Chinatown/Surry+Hills/Bondi+Beach/Manly+Wharf/Taronga+Zoo';
const estimated10 = estimateGoogleMapsStops(tenStopUrl);
assert.strictEqual(estimated10, 10, 'Dovrebbe rilevare esattamente 10 punti');
assert.ok(estimated10 >= 10, 'Dovrebbe rilevare che il limite tecnico di 10 tappe Maps è raggiunto');
console.log('✓ URL con 10 tappe rilevato correttamente come limite raggiunto (10/10)');

// Test URL con 3 tappe
const threeStopUrl = 'https://www.google.com/maps/dir/Sydney/Bondi/Coogee';
const estimated3 = estimateGoogleMapsStops(threeStopUrl);
assert.strictEqual(estimated3, 3, 'Dovrebbe rilevare 3 punti');
console.log('✓ URL con 3 tappe rilevato correttamente (3/10)');

// Test retrocompatibilità migrazione
console.log('\n--- TEST RETROCOMPATIBILITÀ LINK PREESISTENTI ---');
function simulateMigration(legacyLink) {
  let routes = {};
  if (!routes.driving && !routes.walking && legacyLink) {
    const isWalking = legacyLink.toLowerCase().includes('travelmode=walking') || legacyLink.toLowerCase().includes('dirflg=w');
    const mode = isWalking ? 'walking' : 'driving';
    routes[mode] = {
      url: legacyLink,
      mode,
      isComplete: false,
      updatedAt: 1730000000
    };
  }
  return routes;
}

const legacyDriving = 'https://maps.app.goo.gl/existingAuto123';
const migratedDriving = simulateMigration(legacyDriving);
assert.ok(migratedDriving.driving, 'Il link precedente deve essere migrato in driving senza perdita dati');
assert.strictEqual(migratedDriving.driving.url, legacyDriving);
assert.strictEqual(migratedDriving.walking, undefined);
console.log('✓ Link legacy generico migrato automaticamente a percorso auto (driving) preservando il link esistente');

const legacyWalking = 'https://www.google.com/maps/dir/?api=1&origin=Hotel&destination=Opera&travelmode=walking';
const migratedWalking = simulateMigration(legacyWalking);
assert.ok(migratedWalking.walking, 'Il link precedente pedonale deve essere migrato in walking');
assert.strictEqual(migratedWalking.walking.url, legacyWalking);
console.log('✓ Link legacy pedonale migrato automaticamente a percorso a piedi (walking)');

// Test formattazione sicura date Firestore
console.log('\n--- TEST PARSING SICURO TIMESTAMP FIRESTORE ---');
function parseSafeDate(date) {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  if (typeof date === 'number') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof date === 'object' && typeof date.toDate === 'function') {
    try {
      const d = date.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof date === 'object' && 'seconds' in date && typeof date.seconds === 'number') {
    const d = new Date(date.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  try {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// 1. POJO Firestore Timestamp
const firestoreTimestampPojo = { seconds: 1730000000, nanoseconds: 0 };
const dateFromPojo = parseSafeDate(firestoreTimestampPojo);
assert.ok(dateFromPojo instanceof Date);
assert.strictEqual(dateFromPojo.getTime(), 1730000000000);
console.log('✓ Timestamp POJO Firestore { seconds } convertito in Date valida');

// 2. Timestamp con metodo toDate()
const firestoreTimestampObj = { toDate: () => new Date(1730000000000) };
const dateFromObj = parseSafeDate(firestoreTimestampObj);
assert.ok(dateFromObj instanceof Date);
assert.strictEqual(dateFromObj.getTime(), 1730000000000);
console.log('✓ Timestamp con toDate() convertito in Date valida');

// 3. Stringa ISO o millisecondi
const dateFromMillis = parseSafeDate(1730000000000);
assert.strictEqual(dateFromMillis.getTime(), 1730000000000);
console.log('✓ Millisecondi numerici convertiti in Date valida');

// 4. Undefined / Null
assert.strictEqual(parseSafeDate(null), null);
assert.strictEqual(parseSafeDate(undefined), null);
console.log('✓ Valori null/undefined gestiti in sicurezza senza eccezioni');

console.log('\n======================================================');
console.log('  TUTTI I TEST MAPS E REGRESSIONE SUPERATI CON SUCCESSO!');
console.log('======================================================');
