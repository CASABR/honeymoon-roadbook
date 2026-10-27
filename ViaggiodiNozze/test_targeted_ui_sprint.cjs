const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
const types = read('src/types/index.ts');
const form = read('src/components/forms/AttivitaForm.tsx');
const card = read('src/components/cards/AttivitaCard.tsx');
const activityType = read('src/utils/activityType.ts');
const onboarding = read('src/views/OnboardingView.tsx');
const altro = read('src/views/AltroView.tsx');
const adminAccess = read('src/hooks/useGlobalAdminAccess.ts');
const sync = read('src/storage/syncService.ts');

assert.ok(types.includes("'Spot fotografico'"));
assert.ok(types.includes('lightWindow?: FasciaLuceFotografica'));
assert.ok(types.includes('photoSubject?: string'));
assert.ok(types.includes("purpose?: 'photo' | 'document'"));
assert.ok(form.includes("accept=\"image/*\""));
assert.ok(form.includes('lightWindow: photoSpot ? lightWindow'));
assert.ok(form.includes('photoSubject: photoSpot'));
assert.ok(form.includes('coordinate: finalCoordToSave'));
assert.ok(card.includes("['Distanza'"));
assert.ok(card.includes("['Dislivello'"));
assert.ok(card.includes("['Durata'"));
assert.ok(card.includes("['Percorso'"));
assert.ok(card.includes('PHOTO_LIGHT_LABELS'));
assert.ok(activityType.includes("golden_hour: 'Golden hour'"));
assert.strictEqual((onboarding.match(/Con lo stesso account puoi creare e ritrovare più viaggi\./g) || []).length, 1);
assert.ok(altro.includes("currentTripConfig?.id === '0000' && globalAdminAccess === 'authorized'"));
assert.ok(adminAccess.includes("collection(db, 'trips')"));
assert.ok(adminAccess.includes('limit(1)'));
assert.ok(!adminAccess.includes('@'));
assert.ok(sync.includes("case 'attivita': return 'attivita'"));

console.log('PASS: 20 controlli UI mirati superati');
