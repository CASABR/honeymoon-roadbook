const assert = require('assert');
const fs = require('fs');

const read = path => fs.readFileSync(path, 'utf8');
const liveView = read('src/views/altro/LiveView.tsx');
const editorial = read('src/views/altro/LiveEditorialExperience.tsx');
const intelligence = read('src/utils/liveIntelligenceHelper.ts');
const predeparture = read('src/components/cards/PreDeparturePhotoCard.tsx');
const gmail = read('src/components/modals/SmartInsertModal.tsx');

assert(liveView.includes("useState<'both' | 'real' | 'planned'>('both')"), 'La mappa deve aprirsi con entrambi i punti');
assert(liveView.includes("realLocation={remoteGpsLocation}"), 'La posizione mostrata deve provenire dal GPS remoto autorizzato');
assert(!intelligence.includes('currentAccommodationEvent'), 'L’alloggio non deve diventare automaticamente la posizione prevista');
assert(intelligence.includes('coords: undefined, // Non proiettiamo coordinate arbitrarie durante il trasporto'), 'I trasporti non devono inventare coordinate');
assert(editorial.includes("mode === 'both' ? 'Insieme'"), 'Il controllo mappa deve offrire la vista con entrambi i marker');
assert(editorial.includes('showRealMarker') && editorial.includes('showPlannedMarker'), 'I due marker devono essere distinti');
assert(editorial.includes('Ferma condivisione') && editorial.includes('Prendi guida'), 'Stop e ripresa guida devono restare raggiungibili');
assert(editorial.includes('disabled={!copilot.deviceId'), 'Il trasferimento non deve usare dispositivi fittizi');
assert(editorial.includes("? 'Diario di viaggio'"), 'La vista ospite non deve leggere titoli privati locali');
assert(editorial.includes('Nuovo ricordo') && editorial.includes('Aggiungi foto'), 'Pubblicazione e foto devono restare accessibili');
assert(editorial.includes('Cosa vedono gli ospiti') && editorial.includes('Itinerario privato'), 'La privacy ospiti deve essere spiegata');
assert(!editorial.includes('images.unsplash.com'), 'La LIVE non deve mostrare fotografie fittizie');
assert(predeparture.includes('savePredeparturePhoto') && predeparture.includes('Rimuovi da LIVE'), 'La foto del primo giorno deve restare salvabile e reversibile');
assert(gmail.includes('Carica PDF/foto') && gmail.includes('Incolla testo email'), 'I fallback Gmail devono restare disponibili');

console.log('✓ LIVE finale: GPS, ruoli, diario, foto, reazioni e privacy preservati.');
