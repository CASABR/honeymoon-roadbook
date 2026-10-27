const assert = require('assert');
const fs = require('fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const account = read('src/services/accountService.ts');
const selector = read('src/components/modals/TripSelectorModal.tsx');
const onboarding = read('src/views/OnboardingView.tsx');
const live = read('src/views/altro/LiveView.tsx');
const liveService = read('src/services/liveGpsService.ts');
const editorial = read('src/views/altro/LiveEditorialExperience.tsx');
const card = read('src/components/cards/AttivitaCard.tsx');
const form = read('src/components/forms/AttivitaForm.tsx');
const altro = read('src/views/AltroView.tsx');
const navigation = read('src/utils/mainNavigation.ts');

assert(account.includes("cloudIndexStatus: 'loaded' | 'missing'"));
assert(account.includes('indexedTripIds'));
assert(account.includes('localCandidateIds'));
assert(account.includes('failedIndexedTripIds'));
assert(account.includes('unverifiedLocalTripIds'));
assert(account.includes("source: indexedSet.has(tripId) ? 'cloud-index' : 'local-verified'"));
assert(account.includes('resolveVerifiedTripRole'));
assert(!account.includes('const prevAnonUid'));
assert(account.includes('currentUser.isAnonymous'));
assert(selector.includes('Elenco non disponibile'));
assert(selector.includes('Locale verificato'));
assert(onboarding.includes('Nessun viaggio è stato dichiarato assente'));

const detectIndex = live.indexOf('await updateRealLocation');
const leaseIndex = live.indexOf('await liveGpsService.assignGuide', detectIndex);
assert(detectIndex > -1 && leaseIndex > detectIndex);
assert(live.includes('{ force: true }'));
assert(liveService.includes('Attiva la posizione nelle impostazioni'));
assert(liveService.includes('GPS non disponibile'));
assert(liveService.includes('Connessione assente'));
assert(liveService.includes('Un altro dispositivo sta condividendo'));
assert(editorial.includes('Lease scaduto'));
assert(editorial.includes('Riattiva posizione'));

assert(card.includes('data-trekking-route-preview'));
assert(card.includes('Traccia GPS verificata'));
assert(card.includes('getTrekkingDistanceKm'));
assert(card.includes("['Distanza'"));
assert(card.includes("['Dislivello'"));
assert(card.includes("['Durata'"));
assert(!card.includes("['Distanza', activity.distanceKm != null && activity.distanceKm > 0 ? `${activity.distanceKm.toLocaleString('it-IT')} km` : '—']"));
assert(form.includes("renderPhotoField('Foto facoltativa'"));
assert(form.includes('non sostituisce una traccia GPS'));

assert.strictEqual((altro.match(/>I tuoi viaggi</g) || []).length, 1);
assert(!altro.includes('Cambia viaggio o consulta gli accessi'));
assert(navigation.includes("['oggi', 'categorie', 'mappa', 'altro']"));
assert(navigation.includes('blocksMainNavigationSwipe'));

console.log('PASS: stabilizzazione multi-viaggio, LIVE GPS, Trekking e Altro');
