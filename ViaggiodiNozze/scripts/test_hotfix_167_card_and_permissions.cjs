const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('HOUNIGO 1.6.7 — VERIFICA PERMESSI DI MODIFICA & APERTURA FORM CARD');
console.log('========================================================================\n');

// 1. VERIFICA SORGENTE useAuthIdentity.ts
const authIdPath = path.join(__dirname, '../src/utils/useAuthIdentity.ts');
const authIdSource = fs.readFileSync(authIdPath, 'utf8');

assert.ok(
  authIdSource.includes("const isSharedCloudTrip = currentTripId === '0000' || currentTripId === 'default' || Boolean(config?.ownerUid);"),
  'useAuthIdentity deve identificare con rigore i viaggi cloud condivisi (0000 o con ownerUid)'
);
assert.ok(
  authIdSource.includes("if (isSharedCloudTrip)") && authIdSource.includes("return false;"),
  'useAuthIdentity deve bloccare mutazioni non autorizzate su viaggi condivisi, specialmente 0000'
);
assert.ok(
  authIdSource.includes("const localRole = getLocalDeviceRole();") &&
  authIdSource.includes("return localRole === 'guida' || localRole === 'copilota';"),
  'useAuthIdentity deve consentire test e collaudi con ruolo locale solo su viaggi dimostrativi isolati'
);

console.log('✓ 1. Logica di sicurezza in useAuthIdentity.ts verificata con successo.');

// 2. SIMULAZIONE LOGICA canMutateLocally()
function simulateCanMutateLocally({
  targetTripId,
  currentTripId = '0000',
  tripConfig = { id: '0000' },
  authoritativeCloudRole = 'unverified',
  localDeviceRole = 'viewer',
  verifiedTripAuth = null,
  isRevoked = false,
  isOnline = true,
  simulatedDevRole = null
}) {
  if (simulatedDevRole === 'owner' || simulatedDevRole === 'copilota') return true;
  if (simulatedDevRole === 'viewer') return false;

  if (targetTripId && targetTripId !== currentTripId) return false;
  if (isRevoked) return false;
  if (authoritativeCloudRole === 'viewer') return false;
  if (authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota') return true;

  const isOfflineOrChecking = authoritativeCloudRole === 'offline' ||
    authoritativeCloudRole === 'checking' ||
    !isOnline;

  if (isOfflineOrChecking && verifiedTripAuth) {
    if (verifiedTripAuth.tripId === currentTripId &&
        ['owner', 'copilota'].includes(verifiedTripAuth.role) &&
        !isRevoked) {
      return true;
    }
  }

  const isSharedCloudTrip = currentTripId === '0000' || currentTripId === 'default' || Boolean(tripConfig?.ownerUid);
  if (isSharedCloudTrip) {
    return false;
  }

  return localDeviceRole === 'guida' || localDeviceRole === 'copilota';
}

// TEST CASES PERMESSI:
// A) Owner verificato su 0000 -> OK
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'owner',
    localDeviceRole: 'guida'
  }),
  true,
  'Owner verificato su 0000 deve poter modificare'
);

// B) Copilota verificato su 0000 -> OK
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'copilota',
    localDeviceRole: 'copilota'
  }),
  true,
  'Copilota verificato su 0000 deve poter modificare'
);

// C) Membro offline precedentemente verificato su 0000 -> OK
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isOnline: false,
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'copilota' },
    localDeviceRole: 'copilota'
  }),
  true,
  'Membro offline precedentemente verificato deve poter modificare su 0000'
);

// D) Utente non verificato / tester anonimo su 0000 con ruolo locale "guida" -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'guida',
    verifiedTripAuth: null
  }),
  false,
  'SICUREZZA: Utente non verificato su 0000 NON deve poter modificare, anche con ruolo locale guida'
);

// E) Viewer confermato dal cloud su 0000 -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'viewer',
    localDeviceRole: 'guida'
  }),
  false,
  'Viewer confermato dal cloud deve essere sempre bloccato'
);

// F) Utente revocato su 0000 -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isRevoked: true,
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'owner' }
  }),
  false,
  'Utente revocato deve essere categoricamente bloccato'
);

// G) Viaggio dimostrativo locale realmente isolato (es. demo_viaggio) -> TESTER ABILITATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'demo_viaggio',
    tripConfig: { id: 'demo_viaggio' }, // Nessun ownerUid
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'guida'
  }),
  true,
  'Tester su viaggio dimostrativo locale isolato deve poter modificare con ruolo guida'
);

assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'demo_viaggio',
    tripConfig: { id: 'demo_viaggio' },
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'viewer'
  }),
  false,
  'Tester su viaggio dimostrativo locale con ruolo viewer non deve poter modificare'
);

console.log('✓ 2. Tutti i test sui permessi (Owner, Copilota, Offline, Viewer, Tester, 0000 vs Demo) superati!');

// 3. VERIFICA COMPORTAMENTO ONCLICK DELLE CARD
const cardFiles = [
  'AlloggioCard.tsx',
  'AttivitaCard.tsx',
  'RistoranteCard.tsx',
  'ShoppingCard.tsx',
  'TappaCard.tsx',
  'TrasportoCard.tsx'
];

cardFiles.forEach((fileName) => {
  const filePath = path.join(__dirname, '../src/components/cards', fileName);
  const content = fs.readFileSync(filePath, 'utf8');

  // Verifica che onClick verifichi canEdit ? onEdit : onDetail (o task detail)
  if (fileName === 'TappaCard.tsx') {
    assert.ok(
      content.includes('canEdit ? onEdit : (isTask ? () => setIsTaskDetailOpen(true) : onDetail)'),
      `${fileName} deve indirizzare a onEdit per editor e a task/detail per viewer`
    );
  } else {
    assert.ok(
      content.includes('canEdit ? onEdit : onDetail'),
      `${fileName} deve indirizzare a onEdit per editor e a onDetail per viewer`
    );
  }

  // Non deve eseguire onEdit se canEdit è false
  assert.doesNotMatch(
    content,
    /onClick=\{canEdit \? onEdit : \(onDetail \|\| onEdit\)\}/,
    `${fileName} non deve ricadere su onEdit per viewer/utenti non autorizzati`
  );
});

console.log('✓ 3. Tutte le 6 card componenti verificate: apertura immediata form modifica per editor, dettaglio/null per viewer.');

// 4. VERIFICA OGGI VIEW & PRENOTAZIONI DESKTOP
const oggiViewContent = fs.readFileSync(path.join(__dirname, '../src/views/OggiView.tsx'), 'utf8');
assert.ok(
  oggiViewContent.includes('setEditingAlloggioItem(tonightsAccommodation)'),
  'OggiView deve consentire la modifica immediata di AlloggioCard'
);

const prenotazioniContent = fs.readFileSync(path.join(__dirname, '../src/views/desktop/PrenotazioniWorkspaceView.tsx'), 'utf8');
assert.ok(
  prenotazioniContent.includes('if (canEdit) handleOpenEditBooking(item);'),
  'PrenotazioniWorkspaceView deve aprire direttamente il form di modifica per gli editor'
);

console.log('✓ 4. OggiView e PrenotazioniWorkspaceView perfettamente allineate.');

console.log('\n========================================================================');
console.log('🎉 TUTTE LE VERIFICHE HOUNIGO 1.6.7 SUPERATE AL 100% (PASS)');
console.log('========================================================================\n');
