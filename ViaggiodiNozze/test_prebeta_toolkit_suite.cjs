const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const toolkit = read('src/views/altro/EmergenzeToolkitView.tsx');
const altro = read('src/views/AltroView.tsx');
const insurance = read('src/views/altro/AssicurazioneView.tsx');
const documentModal = read('src/components/modals/DocumentValidityModal.tsx');
const documents = read('src/views/altro/DocumentiView.tsx');
const storage = read('src/storage/storageService.ts');

assert(toolkit.includes("'emergency_directory_v1'"), 'Le emergenze devono avere una chiave settings dedicata.');
assert(toolkit.includes("'travel_toolkit_v1'"), 'Il toolkit deve avere una chiave settings dedicata.');
assert(toolkit.includes('storageService.saveSetting'), 'Emergenze e checklist devono persistere tramite storageService.');
assert(toolkit.includes('entries.filter'), 'Le emergenze devono supportare eliminazione.');
assert(toolkit.includes('setEditing(entry)'), 'Le emergenze devono supportare modifica.');
assert(toolkit.includes('DEFAULT_CHECKLIST'), 'Il toolkit deve proporre una checklist generica.');
assert(altro.includes('<EmergenzeView onBack={handleBack} />'), 'La sezione Emergenze non deve più essere un placeholder.');
assert(altro.includes('<TravelToolkitView onBack={handleBack} />'), 'Il Travel Toolkit non deve più essere un placeholder.');
assert(documentModal.includes('assistancePhones') && documentModal.includes('usefulContacts') && documentModal.includes('coverage'), 'La polizza deve gestire contatti e coperture.');
assert(insurance.includes('isLegacyTrip'), 'I valori storici devono rimanere isolati dal viaggio nuovo.');
assert(documents.includes('min-w-0 max-w-full overflow-hidden') && documents.includes('break-words'), 'Le card documenti devono prevenire overflow orizzontale.');
assert(storage.includes("assertCanMutate('settings')"), 'Le nuove impostazioni devono rispettare i permessi di modifica.');

console.log('Pre-beta insurance, emergencies and toolkit checks: 12/12 passed.');
