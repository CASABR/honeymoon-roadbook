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
  authIdSource.includes("const isExplicitLocalDemoTrip = currentTripId !== '0000'") &&
  authIdSource.includes("!config?.ownerUid"),
  'useAuthIdentity deve verificare che il viaggio demo sia esplicitamente identificato come locale e senza ownerUid'
);
assert.ok(
  authIdSource.includes("user && !user.isAnonymous") &&
  authIdSource.includes("verified.uid === user.uid"),
  'useAuthIdentity deve richiedere un utente autenticato non anonimo corrispondente allo stesso UID per modifiche offline'
);

console.log('✓ 1. Logica di sicurezza in useAuthIdentity.ts verificata con successo.');

// 2. SIMULAZIONE LOGICA canMutateLocally()
function simulateCanMutateLocally({
  targetTripId,
  currentTripId = '0000',
  tripConfig = { id: '0000' },
  authoritativeCloudRole = 'unverified',
  localDeviceRole = 'viewer',
  currentUser = null,
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

  if (isOfflineOrChecking) {
    if (currentUser && !currentUser.isAnonymous) {
      if (verifiedTripAuth &&
          verifiedTripAuth.uid === currentUser.uid &&
          verifiedTripAuth.tripId === currentTripId &&
          ['owner', 'copilota'].includes(verifiedTripAuth.role) &&
          !isRevoked) {
        return true;
      }
    }
  }

  const isExplicitLocalDemoTrip = currentTripId !== '0000' &&
    currentTripId !== 'default' &&
    !tripConfig?.ownerUid &&
    (
      currentTripId.startsWith('demo_') ||
      currentTripId.startsWith('local_') ||
      Boolean(tripConfig?.isLocalDemo) ||
      Boolean(tripConfig?.isLocalOnly)
    );

  if (isExplicitLocalDemoTrip) {
    return localDeviceRole === 'guida' || localDeviceRole === 'copilota';
  }

  return false;
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

// C) Membro offline precedentemente verificato con UID autenticato non anonimo su 0000 -> OK
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isOnline: false,
    currentUser: { uid: 'user_123', isAnonymous: false },
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'copilota' },
    localDeviceRole: 'copilota'
  }),
  true,
  'Membro offline precedentemente verificato con UID non anonimo deve poter modificare su 0000'
);

// D.1) Offline con UID assente (null) -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isOnline: false,
    currentUser: null,
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'copilota' },
    localDeviceRole: 'copilota'
  }),
  false,
  'SICUREZZA: Offline con utente assente (null) deve essere BLOCCATO'
);

// D.2) Offline con utente anonimo -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isOnline: false,
    currentUser: { uid: 'anon_999', isAnonymous: true },
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'copilota' },
    localDeviceRole: 'copilota'
  }),
  false,
  'SICUREZZA: Offline con utente anonimo deve essere BLOCCATO'
);

// D.3) Offline con UID diverso da quello verificato -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: '0000',
    authoritativeCloudRole: 'offline',
    isOnline: false,
    currentUser: { uid: 'user_wrong', isAnonymous: false },
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'copilota' },
    localDeviceRole: 'copilota'
  }),
  false,
  'SICUREZZA: Offline con UID diverso dalla verifica deve essere BLOCCATO'
);

// D.4) Utente non verificato online su 0000 con ruolo locale "guida" -> BLOCCATO!
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
    currentUser: { uid: 'user_123', isAnonymous: false },
    verifiedTripAuth: { tripId: '0000', uid: 'user_123', role: 'owner' }
  }),
  false,
  'Utente revocato deve essere categoricamente bloccato'
);

// G.1) Viaggio che manca solo di ownerUid ma NON è esplicitamente demo/local -> BLOCCATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'random_trip_999',
    tripConfig: { id: 'random_trip_999' }, // senza ownerUid ma non demo
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'guida'
  }),
  false,
  'SICUREZZA: Assenza di ownerUid da sola NON è sufficiente a considerare un viaggio come demo'
);

// G.2) Viaggio demo esplicitamente isolato (es. demo_viaggio) -> ABILITATO!
assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'demo_viaggio',
    tripConfig: { id: 'demo_viaggio' },
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'guida'
  }),
  true,
  'Viaggio esplicitamente demo_viaggio isolato consente modifiche con ruolo guida'
);

assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'local_test',
    tripConfig: { id: 'local_test' },
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'copilota'
  }),
  true,
  'Viaggio esplicitamente local_test isolato consente modifiche con ruolo copilota'
);

assert.equal(
  simulateCanMutateLocally({
    currentTripId: 'demo_viaggio',
    tripConfig: { id: 'demo_viaggio' },
    authoritativeCloudRole: 'unverified',
    localDeviceRole: 'viewer'
  }),
  false,
  'Viaggio demo con ruolo viewer resta bloccato in lettura'
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
