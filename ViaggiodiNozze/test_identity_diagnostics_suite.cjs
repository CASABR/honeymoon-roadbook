const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const diagnostics = read('src/components/dev/LocalIdentityDiagnostics.tsx');
const main = read('src/main.tsx');

assert(diagnostics.includes('onAuthStateChanged'), 'La diagnostica deve limitarsi a osservare l Auth locale.');
assert(diagnostics.includes("idbGetForTrip"), 'La diagnostica deve poter leggere il backup locale del viaggio.');
assert(diagnostics.includes("'trip_config_backup'"), 'La diagnostica deve leggere solo il backup configurazione previsto.');
assert(diagnostics.includes('ownerUid'), 'La diagnostica deve mostrare esclusivamente ownerUid locale, se disponibile.');
assert(!diagnostics.includes("from 'firebase/firestore'"), 'La diagnostica non deve importare Firestore.');
assert(!/\b(getDoc|setDoc|updateDoc|deleteDoc|getDocs|collection|writeBatch)\b/.test(diagnostics), 'La diagnostica non deve eseguire operazioni Firestore.');
assert(main.includes("get('identityDiagnostics') === '1'"), 'La diagnostica deve essere esplicitamente opt-in.');
assert(main.includes("!localDiagnostics"), 'La sync normale deve restare esclusa dalla diagnostica.');

console.log('Identity diagnostics safety checks: 8/8 passed.');
