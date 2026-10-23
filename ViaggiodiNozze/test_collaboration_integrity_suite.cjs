const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const rules = read('firestore.rules');
const functionsSource = read('functions/src/index.ts');
const managementView = read('src/views/altro/GestioneViaggioView.tsx');
const onboardingView = read('src/views/OnboardingView.tsx');
const firebaseConfig = read('firebase.json');
const settingsMenu = read('src/components/common/SettingsMenu.tsx');
const pushScript = read('scripts/send-update-notification.cjs');

assert(!rules.includes("request.auth.token.get('email', '')"), 'Le regole non devono concedere privilegi admin per email fissa.');
assert(rules.includes("request.resource.data.get('role', '') in ['owner', 'copilota']"), 'Le regole devono limitare i ruoli membro validi.');
assert(rules.includes('request.resource.data.tripId == resource.data.tripId'), 'Un subscriber push non deve poter cambiare viaggio.');
assert(functionsSource.includes('return db.runTransaction(async transaction =>'), 'joinTrip deve consumare il token in una transaction.');
assert(functionsSource.includes('const currentMemberSnap = await transaction.get(memberRef);'), 'joinTrip deve controllare il membro nella transaction.');
assert(managementView.includes('const batch = writeBatch(db);'), 'L\'autorizzazione membro dalla gestione viaggio deve essere atomica.');
assert(settingsMenu.includes('const batch = writeBatch(db);'), 'L\'autorizzazione membro dalle impostazioni deve essere atomica.');
assert(!onboardingView.includes('httpsCallable'), 'Il percorso onboarding Spark non deve invocare callable Cloud Functions.');
assert(!managementView.includes('httpsCallable'), 'Il link UID + ID viaggio non deve generare token tramite Cloud Functions.');
assert(!firebaseConfig.includes('"functions"'), 'La configurazione di rilascio non deve richiedere Cloud Functions.');
assert(!firebaseConfig.includes('"hosting"'), 'La configurazione Firebase non deve introdurre Firebase Hosting.');
assert(!pushScript.includes("|| '3VZbx9xCCPy5XGA5Pq99Ldqm9H5oQ36uagTar7C3dWU'"), 'La chiave privata VAPID non deve avere fallback hard-coded.');

console.log('Collaboration integrity checks: 12/12 passed.');
