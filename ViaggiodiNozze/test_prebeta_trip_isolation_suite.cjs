const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const indexedDb = read('src/storage/indexedDB.ts');
const onboarding = read('src/views/OnboardingView.tsx');
const storage = read('src/storage/storageService.ts');
const documents = read('src/views/altro/DocumentiView.tsx');
const app = read('src/App.tsx');

assert(indexedDb.includes('${DB_NAME}_${encodeURIComponent(tripId)}'), 'I viaggi nuovi devono avere un database IndexedDB dedicato.');
assert(indexedDb.includes("tripId === MASTER_TRIP_ID"), 'Il database storico 0000 deve rimanere invariato.');
assert(!onboarding.includes('idbClearAll'), 'Cambiare o creare un viaggio non deve cancellare lo storage del viaggio corrente.');
assert(storage.includes('ensureGenericDocumentTemplates'), 'I documenti dei viaggi nuovi devono usare template generici.');
assert(documents.includes('ensureGenericDocumentTemplates'), 'La schermata Documenti deve inizializzare solo template generici.');
assert(onboarding.includes('min={startDate || undefined}'), 'La data di ritorno non deve precedere la partenza.');
assert(onboarding.includes("onboarding-end-date')?.focus()"), 'La selezione della partenza deve spostare il focus al ritorno.');
assert(indexedDb.includes('idbGetForTrip'), 'Il backup deve essere recuperabile dal database del viaggio corretto.');
assert(app.includes("idbGetForTrip<any>(session.tripId || '0000'"), 'Il ripristino deve usare il tripId della sessione e non il database attivo casuale.');

console.log('Pre-beta trip isolation checks: 9/9 passed.');
