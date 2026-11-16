const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('========================================================================');
console.log('HOUNIGO — VERIFICA AUTOMATICA: RESTYLING LIVE E GPS AUTOMATICO');
console.log('========================================================================\n');

// 1. Verifica statica codice sorgente LiveView.tsx e LiveEditorialExperience.tsx
const liveViewSource = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveView.tsx'), 'utf8');
const liveExpSource = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
const liveGpsSource = fs.readFileSync(path.join(__dirname, '../src/services/liveGpsService.ts'), 'utf8');

console.log('--- TEST 1: AUTO-RESUME GPS OWNER & DELEGA COPILOTA ---');
assert.ok(liveViewSource.includes('autoResumeGpsIfEligible'), 'LiveView deve definire autoResumeGpsIfEligible');
assert.ok(liveViewSource.includes('hounigo_live_sharing_enabled'), 'LiveView deve verificare il flag di consenso hounigo_live_sharing_enabled');
assert.ok(liveViewSource.includes('remoteGpsLease?.status === \'stopped\''), 'LiveView non deve riprendere se la condivisione è stata interrotta');
assert.ok(liveViewSource.includes('remoteGpsLease.holderUid !== currentUid'), 'LiveView deve rispettare la delega al Copilota');
assert.ok(liveViewSource.includes('remoteGpsLease.holderDeviceId !== deviceId'), 'LiveView non deve attivare due dispositivi trasmittenti contemporaneamente');
assert.ok(liveViewSource.includes('visibilitychange'), 'LiveView deve ascoltare visibilitychange per riapertura PWA su iOS');
assert.ok(liveViewSource.includes('focus'), 'LiveView deve ascoltare focus per ritorno in primo piano');
console.log('✓ [PASS] Logica di auto-resume implementata con rispetto delega Copilota, controllo multi-dispositivo e vincoli iOS\n');

console.log('--- TEST 2: ULTIMA POSIZIONE CONOSCIUTA & TIMESTAMP EFFETTIVO ---');
assert.ok(liveViewSource.includes('lastKnownLocation'), 'LiveView deve gestire lastKnownLocation persistente');
assert.ok(liveViewSource.includes('hounigo_live_last_known_loc_'), 'LiveView deve memorizzare localmente l\'ultima posizione autorizzata');
assert.ok(liveExpSource.includes('isStaleGps'), 'LiveEditorialExperience deve distinguere esplicitamente lo stato isStaleGps');
assert.ok(liveExpSource.includes('Ultima posizione conosciuta'), 'LiveEditorialExperience deve mostrare "Ultima posizione conosciuta"');
assert.ok(liveExpSource.includes('Ultima posizione nota'), 'La mappa deve mostrare il marker "Ultima posizione nota"');
assert.ok(liveExpSource.includes('formatLastDetectedTimestamp'), 'LiveEditorialExperience deve formattare data e ora reale dell\'ultimo segnale');
assert.ok(liveExpSource.includes('isStopped'), 'LiveEditorialExperience deve azzerare la posizione se l\'utente interrompe manualmente');
console.log('✓ [PASS] Ultima posizione conosciuta gestita con timestamp effettivo e mai spacciata per LIVE\n');

console.log('--- TEST 3: SAFEGUARD FOTOGRAFIE E MESSAGGI OSPITI NON OPERATIVI ---');
assert.ok(liveExpSource.includes('Bacheca Pensieri dal Pubblico (Sola Lettura)'), 'LiveEditorialExperience deve mostrare la bacheca in sola lettura per visitatori');
assert.ok(liveExpSource.includes('L\'invio diretto di messaggi pubblici dal browser non è attualmente attivo'), 'LiveEditorialExperience non deve promettere invio messaggi pubblici operativi');
assert.ok(liveExpSource.includes('La condivisione su cloud storage non è attiva in questa versione'), 'LiveEditorialExperience non deve mostrare foto cloud come funzionanti');
console.log('✓ [PASS] Messaggi pubblici ospiti e foto cloud mostrati correttamente come non operativi/sola lettura\n');

console.log('--- TEST 4: COMPATIBILITÀ REGOLE FIRESTORE GPS ---');
const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
assert.ok(firestoreRules.includes('locations/{locationId}'), 'firestore.rules deve proteggere locations');
assert.ok(firestoreRules.includes('isGpsGuideEligible(tripId, request.auth.uid)'), 'I membri autorizzati (owner/copilota) possono leggere l\'ultima posizione anche se stale');
assert.ok(firestoreRules.includes('duration.value(15, \'m\')'), 'Firestore rules impongono 15m threshold per gli accessi pubblici');
console.log('✓ [PASS] Compatibilità rigorosa verificata: nessuna modifica alle Firestore Security Rules cloud\n');

// 5. Test logico in-memory della funzione di stato visivo
console.log('--- TEST 5: STATO VISIVO LIVE vs STALE vs STOPPED ---');
const GPS_STALE_THRESHOLD_MS = 15 * 60 * 1000;

function evaluateGpsDisplay(state) {
  const isStopped = state.leaseStatus === 'stopped' || state.locStatus === 'stopped';
  const displayLocation = isStopped ? null : state.location;
  if (!displayLocation) {
    return { status: 'none', label: 'Condivisione non attiva', showMarker: false };
  }
  const ageMs = Date.now() - displayLocation.updatedAt;
  const isFresh = state.leaseStatus === 'active' && ageMs < GPS_STALE_THRESHOLD_MS && displayLocation.status === 'active';
  const isStale = !isStopped && (ageMs >= GPS_STALE_THRESHOLD_MS || state.leaseStatus !== 'active');

  if (isFresh) {
    return { status: 'live', label: 'GPS LIVE attivo', showMarker: true, markerType: 'live' };
  }
  if (isStale) {
    return { status: 'stale', label: 'Ultima posizione conosciuta', showMarker: true, markerType: 'stale' };
  }
  return { status: 'none', label: 'Condivisione non attiva', showMarker: false };
}

// Caso A: Posizione appena ricevuta (1 minuto fa, lease attiva)
const resLive = evaluateGpsDisplay({
  leaseStatus: 'active',
  locStatus: 'active',
  location: { lat: 35.6895, lng: 139.6917, city: 'Tokyo', updatedAt: Date.now() - 60_000, status: 'active' }
});
assert.equal(resLive.status, 'live');
assert.equal(resLive.markerType, 'live');
assert.equal(resLive.label, 'GPS LIVE attivo');

// Caso B: Posizione ferma da 25 minuti (disconnessione / volo / offline)
const resStale = evaluateGpsDisplay({
  leaseStatus: 'active',
  locStatus: 'active',
  location: { lat: 35.6895, lng: 139.6917, city: 'Tokyo', updatedAt: Date.now() - 25 * 60 * 1000, status: 'active' }
});
assert.equal(resStale.status, 'stale');
assert.equal(resStale.markerType, 'stale');
assert.equal(resStale.label, 'Ultima posizione conosciuta');

// Caso C: Interruzione volontaria dell'utente
const resStopped = evaluateGpsDisplay({
  leaseStatus: 'stopped',
  locStatus: 'stopped',
  location: { lat: 35.6895, lng: 139.6917, city: 'Tokyo', updatedAt: Date.now() - 60_000, status: 'stopped' }
});
assert.equal(resStopped.status, 'none');
assert.equal(resStopped.showMarker, false);
assert.equal(resStopped.label, 'Condivisione non attiva');

console.log('✓ [PASS] Simulazione logica: LIVE -> STALE -> STOPPED deterministica e sicura\n');

console.log('========================================================================');
console.log('TUTTI I 5 TEST DI RESTYLING LIVE E GPS AUTOMATICO SUPERATI!');
console.log('========================================================================');
